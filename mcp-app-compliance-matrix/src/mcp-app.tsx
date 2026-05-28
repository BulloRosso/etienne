/**
 * Compliance Matrix — MCP App (React + MUI)
 *
 * Cockpit for a requirements-hv bid. Three-pane layout mirroring the
 * workflows dialog: filters (Status / Review / Owner) on the left,
 * matrix table in the middle, planned-response wiki preview on the
 * right.
 *
 * Wiring:
 *   - Tool `render_compliance_matrix` (compliance-matrix-tools.ts) reads
 *     the coverage dashboard + team wiki page server-side and returns the
 *     enriched payload here.
 *   - Row click → request planned-response page via agentbus (the host
 *     turns the event into a chat-bound message that pulls the wiki page;
 *     when the response arrives, the agent has already populated the
 *     right pane through the citation chips. For an instant render we
 *     also display the slug + a short "loading" state.)
 *   - Filters update local state — fully client-side, no round trips.
 *   - Toolbar buttons:
 *       · "Export"               → agentbus: open-export
 *       · "Create planned response" → agentbus: create-planned-response
 */
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import {
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Article as ArticleIcon,
  AutoAwesome as AutoAwesomeIcon,
  Close as CloseIcon,
  EditNote as EditNoteIcon,
  FileDownload as FileDownloadIcon,
  FilterAltOff as FilterAltOffIcon,
  FolderOpen as FolderOpenIcon,
  MoreVert as MoreVertIcon,
  Psychology as PsychologyIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";

// Image lives in src/ so Vite inlines it into the single-file bundle —
// the MCP App iframe runs in a sandbox proxy and cannot reach the host's
// /public directory.
import featureImageUrl from "./feature-long-term-memory.png";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import React, { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// ─── Types ───────────────────────────────────────────────────────────────────

type CoverageState =
  | "open" | "drafted" | "reviewed" | "committed" | "deviation" | "clarify";
type ReviewStatus = "pending" | "in-review" | "approved" | "rejected";

interface SourceCitation { docPath?: string; locator?: string }

interface MatrixRow {
  requirementId: string;
  ears: string;
  state: CoverageState;
  sourceVolume: string;
  sourceLocation: string;
  responsibleEngineer?: string;
  draftedFrom?: string;
  typeTestEvidence?: string;
  chips: string[];
  notes?: string;
  reviewStatus?: ReviewStatus;
  plannedResponseSlug?: string;
  // Backend-side probe: is wiki/topics/<slug>.md actually on disk? If the
  // row carries a slug but the page was never authored we want to hide it
  // so the user can see which items have a real planned response.
  plannedResponseExists?: boolean;
  sourceCitation?: SourceCitation;
}

interface TeamEntry {
  initials: string;
  // A team row may claim multiple kg engineer-ids — the parser splits
  // on commas / semicolons / whitespace so a real person can own the
  // workload of several fictional engineers in a demo seed.
  engineerIds: string[];
  name: string;
  role: string;
  areas: string;
}

interface SourceItem {
  scope: "documents" | "wiki";
  path: string;
  name: string;
  title?: string;
  sizeBytes: number;
  mtime: string;
  preview: string;
  missionRelevance?: number;
  status?: string;
}

interface MatrixPayload {
  schema?: string;
  // Workspace directory the cockpit reads/writes against. Set by the
  // backend tool from the McpUIPreview-supplied projectName.
  workspaceProject?: string;
  // Echoed back from the render tool — lets the cockpit correlate the
  // active payload with an entry from `list_project_rfps`.
  coverageRef?: string;
  project?: { name?: string; customer?: string; scope?: string };
  gates?: Record<string, any>;
  generatedAt?: string;
  totals?: Record<string, number>;
  stateCounts?: Record<string, number>;
  chipCounts?: Record<string, number>;
  rows: MatrixRow[];
  team: TeamEntry[];
  teamMissing: boolean;
  filters: { statuses: string[]; reviews: string[]; owners: string[] };
}

// RFP registry entry returned by the `list_project_rfps` tool. The picker
// only appears when there are 2+ entries OR when the single entry is not
// `synthesized` (legacy projects with a synthesised "main" RFP keep the
// picker hidden so the cockpit stays one-click).
interface RfpEntry {
  schema: "rfp.v1";
  id: string;
  title: string;
  kind: "docx-bundle" | "xlsx-questionnaire";
  coverageRef: string;
  sentinelRef: string;
  exportTarget: { kind: "docx-fillback" | "xlsx-fill"; templatePath?: string; answerColumnHeader?: string };
  dueDate?: string;
  synthesized?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson<T>(result: CallToolResult): T {
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text in result");
  let parsed = JSON.parse(textContent.text);
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === "text" && parsed[0]?.text) {
    parsed = JSON.parse(parsed[0].text);
  }
  return parsed as T;
}

type Tone = "red" | "amber" | "green" | "blue" | "neutral";

function stateTone(s: CoverageState): Tone {
  switch (s) {
    case "committed": return "green";
    case "deviation": return "blue";
    case "reviewed": return "blue";
    case "drafted": return "amber";
    case "clarify": return "amber";
    case "open": return "red";
    default: return "neutral";
  }
}

function reviewTone(r?: ReviewStatus): Tone {
  switch (r) {
    case "approved": return "green";
    case "in-review": return "amber";
    case "rejected": return "red";
    case "pending":
    default: return "neutral";
  }
}

function buildPalette(isDark: boolean) {
  return {
    red: isDark ? "#ef9a9a" : "#c62828",
    redBg: isDark ? "#311b1b" : "#FFEBEE",
    amber: isDark ? "#ffcc80" : "#ef6c00",
    amberBg: isDark ? "#2a2118" : "#FFF3E0",
    green: isDark ? "#a5d6a7" : "#2e7d32",
    greenBg: isDark ? "#1b2a1b" : "#E8F5E9",
    blue: isDark ? "#90caf9" : "#1565c0",
    blueBg: isDark ? "#152230" : "#E3F2FD",
    neutral: isDark ? "#cfd8dc" : "#546e7a",
    neutralBg: isDark ? "#263238" : "#ECEFF1",
    surfaceBg: isDark ? "#1e1e1e" : "#fafafa",
    headerBg: isDark ? "#263238" : "#ECEFF1",
  };
}
type Palette = ReturnType<typeof buildPalette>;
function toneColors(p: Palette, t: Tone): { fg: string; bg: string } {
  switch (t) {
    case "red":   return { fg: p.red,     bg: p.redBg };
    case "amber": return { fg: p.amber,   bg: p.amberBg };
    case "green": return { fg: p.green,   bg: p.greenBg };
    case "blue":  return { fg: p.blue,    bg: p.blueBg };
    default:      return { fg: p.neutral, bg: p.neutralBg };
  }
}

/**
 * Compact input styling for the cockpit's filter row. MUI's `size="small"`
 * is still too tall; this knocks input height to ~28px, font to 0.75rem,
 * and shrinks the floating label. Shared across the Search TextField and
 * the Status / Review / Owner FilterSelects so they line up vertically.
 */
const compactInputSx = {
  // Outlined input internals — height + padding.
  "& .MuiOutlinedInput-root": { fontSize: "0.75rem" },
  "& .MuiOutlinedInput-input": { py: 0.5, fontSize: "0.75rem" },
  "& .MuiSelect-select": { py: 0.5, fontSize: "0.75rem", minHeight: 0 },
  // Floating label — smaller resting + smaller shrunken size.
  "& .MuiInputLabel-root": { fontSize: "0.75rem", transform: "translate(14px, 6px) scale(1)" },
  "& .MuiInputLabel-shrink": { transform: "translate(14px, -7px) scale(0.75)" },
} as const;

/** Owner cell renderer: resolve engineerId → "A. Vogt" via team page. */
function ownerInitials(engineerId: string | undefined, team: TeamEntry[]): { initials: string; entry?: TeamEntry } {
  if (!engineerId) return { initials: "—" };
  const entry = team.find((e) => e.engineerIds.includes(engineerId));
  if (entry) return { initials: entry.initials, entry };
  // Fallback: derive from id (engineer-anke-vogt → A. Vogt).
  const parts = engineerId.replace(/^engineer-/, "").split("-");
  if (parts.length >= 2) {
    return { initials: `${parts[0][0].toUpperCase()}. ${parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ")}` };
  }
  return { initials: engineerId };
}

/**
 * Direct cockpit action — bypasses the chat agentbus for actions that
 * open a host modal (Export). The host (Filesystem.jsx) listens for
 * `compliance-cockpit-action` postMessages and dispatches the
 * appropriate dialog.
 */
function postCockpitAction(action: string, payload: Record<string, unknown>) {
  try {
    window.parent.postMessage(
      { type: "compliance-cockpit-action", action, payload },
      "*",
    );
  } catch {
    /* ignore */
  }
}

/** Post selection so the chat model sees which row the user is on. */
function postSelectionToHost(selected: MatrixRow | null) {
  try {
    window.parent.postMessage(
      {
        type: "viewer-state-update",
        state: selected
          ? {
              selectedRequirement: selected.requirementId,
              plannedResponseSlug: selected.plannedResponseSlug,
              ears: selected.ears,
            }
          : null,
      },
      "*",
    );
  } catch {
    /* ignore */
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

function ComplianceMatrixApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // RFP registry — populated once the workspace project is known. The
  // picker only renders when there are 2+ entries or the single entry
  // is not synthesized (legacy "main" RFP). `currentRfpId` follows the
  // active matrix payload and is what the export modal scopes against.
  const [rfps, setRfps] = useState<RfpEntry[]>([]);
  const [currentRfpId, setCurrentRfpId] = useState<string | null>(null);
  const [rfpSwitching, setRfpSwitching] = useState(false);

  // Right-pane mode:
  //  - `info`     : render the structured info card for the selected row
  //  - `markdown` : render the markdown of a clicked Source / Planned-response
  //                 file. `mdStack` is a navigation history (top = current);
  //                 clicking a [link](path) inside the markdown pushes onto
  //                 it, the Back button pops.
  const [paneMode, setPaneMode] = useState<"info" | "markdown">("info");
  const [mdStack, setMdStack] = useState<string[]>([]);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const markdownPath = mdStack.length > 0 ? mdStack[mdStack.length - 1] : null;

  // Per-row kebab menu state — keyed by requirementId so only one menu is
  // open at a time. Anchor element is what MUI <Menu> needs.
  const [kebabState, setKebabState] = useState<{
    anchor: HTMLElement | null;
    requirementId: string | null;
  }>({ anchor: null, requirementId: null });

  // Local overrides for state / reviewStatus / notes changes that have
  // already been persisted server-side. The MCP App is rendered from a
  // static payload (we don't re-fetch after each mutation), so we apply
  // the patch in-memory on top of `payload.rows`.
  const [rowOverrides, setRowOverrides] = useState<
    Record<string, { state?: CoverageState; reviewStatus?: ReviewStatus; notes?: string }>
  >({});

  const [updatedStateCounts, setUpdatedStateCounts] = useState<Record<string, number> | null>(null);

  // ── Planned-response creation menu / dialogs ─────────────────────────────
  // The right-pane "create planned response" action opens a split-button
  // menu with three paths: empty stub, pick from existing docs / wiki, or
  // create from knowledge base. Two of the paths open follow-up dialogs.
  const [createMenuAnchor, setCreateMenuAnchor] = useState<{
    anchor: HTMLElement | null;
    row: MatrixRow | null;
  }>({ anchor: null, row: null });
  // Pick-from-existing-docs dialog state.
  const [pickerOpen, setPickerOpen] = useState<{
    row: MatrixRow | null;
  }>({ row: null });
  const [pickerItems, setPickerItems] = useState<SourceItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerFilter, setPickerFilter] = useState("");
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  // Knowledge-base dialog state.
  const [kbOpen, setKbOpen] = useState<{ row: MatrixRow | null }>({ row: null });
  const [kbQuestion, setKbQuestion] = useState("");
  const [kbSubmitting, setKbSubmitting] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  // Right-pane width is draggable. We try to persist via localStorage,
  // but the MCP App runs inside a sandboxed `srcdoc` iframe without
  // `allow-same-origin`, so any localStorage access throws SecurityError.
  // We swallow it and just use the in-memory default — the user's
  // resize survives the session but not a tab reload, which is fine.
  const [rightPaneWidth, setRightPaneWidth] = useState<number>(() => {
    try {
      if (typeof window === "undefined") return 340;
      const stored = window.localStorage.getItem("compliance-matrix.rightPaneWidth");
      const parsed = stored ? Number(stored) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 680;
    } catch {
      return 680;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("compliance-matrix.rightPaneWidth", String(rightPaneWidth));
    } catch {
      /* sandboxed iframe — ignore SecurityError / QuotaExceededError */
    }
  }, [rightPaneWidth]);

  // Drag state for the splitter — refs so we don't trigger re-render on
  // every mousemove tick.
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handleSplitterMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: rightPaneWidth };
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      // Splitter on the LEFT side of the right pane → dragging RIGHT
      // shrinks the right pane; dragging LEFT widens it.
      const delta = e.clientX - state.startX;
      const next = Math.min(1200, Math.max(220, state.startWidth - delta));
      setRightPaneWidth(next);
    };
    const handleMouseUp = () => {
      dragStateRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [rightPaneWidth]);

  // ── App ref so callbacks see the latest connected app instance ─────────
  const appRef = useRef<ReturnType<typeof useApp>["app"] | null>(null);

  // Latest parsed payload — used by callbacks (e.g. markdown link click)
  // that can't take `payload` from the closure without going stale.
  const payloadRef = useRef<MatrixPayload | null>(null);

  // ── Right-pane markdown loader ──────────────────────────────────────────
  // Issues a get_text_file MCP tool call and shows the content in the
  // right pane. `mode === 'push'` (default) appends to the navigation
  // history so the Back button can pop; `'replace'` swaps the top entry
  // (used when the user clicks a Source / Planned-response cell from the
  // matrix — that's a fresh root, not a navigation step).
  const fetchAndShowMarkdown = useCallback(
    async (path: string, projectName: string) => {
      const app = appRef.current;
      if (!app) return;
      setMarkdownLoading(true);
      setMarkdownError(null);
      setMarkdownContent(null);
      try {
        const result = await app.callServerTool({
          name: "get_text_file",
          arguments: { projectName, path },
        });
        const parsed = extractJson<{ found: boolean; content?: string; error?: string }>(
          result as CallToolResult,
        );
        if (!parsed.found) {
          // Distinguish "page doesn't exist" from "I/O error" so the right
          // pane can offer a Create button for the former.
          const isMissing = /ENOENT|no such file/i.test(parsed.error ?? "");
          setMarkdownError(
            isMissing ? `__missing__:${path}` : parsed.error ?? `File not found: ${path}`,
          );
        } else {
          const body = (parsed.content ?? "").replace(/^---[\s\S]*?---\r?\n?/, "");
          setMarkdownContent(body);
        }
      } catch (err: any) {
        setMarkdownError(err?.message ?? String(err));
      } finally {
        setMarkdownLoading(false);
      }
    },
    [],
  );

  const loadMarkdown = useCallback(
    (path: string, projectName: string, mode: "push" | "replace" = "replace") => {
      setPaneMode("markdown");
      setMdStack((prev) => (mode === "replace" ? [path] : [...prev, path]));
      void fetchAndShowMarkdown(path, projectName);
    },
    [fetchAndShowMarkdown],
  );

  const popMarkdown = useCallback(
    (projectName: string) => {
      setMdStack((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.slice(0, -1);
        const top = next[next.length - 1];
        if (top) void fetchAndShowMarkdown(top, projectName);
        return next;
      });
    },
    [fetchAndShowMarkdown],
  );

  const closeMarkdown = useCallback(() => {
    setPaneMode("info");
    setMdStack([]);
    setMarkdownContent(null);
    setMarkdownError(null);
  }, []);

  // Resolve a relative href (as written in markdown, e.g.
  // `../topics/foo.md`) against the currently-loaded file's path. Returns
  // a project-relative path, or null if the input was absolute / external.
  const resolveRelativePath = useCallback(
    (href: string, currentPath: string | null): string | null => {
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // http:, mailto:, data:, etc.
      if (href.startsWith("#")) return null; // in-page anchor
      // Strip query / hash from the href before resolving.
      const hashIdx = href.search(/[?#]/);
      const cleanHref = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      // If already project-relative (no ./ or ../), trust it.
      if (!cleanHref.startsWith(".")) {
        // But still join with the current file's directory if it's a bare
        // filename (no slash) — markdown wiki links sometimes omit the dir.
        if (!cleanHref.includes("/") && currentPath) {
          const dir = currentPath.split("/").slice(0, -1).join("/");
          return dir ? `${dir}/${cleanHref}` : cleanHref;
        }
        return cleanHref;
      }
      // Resolve ./ and ../ against currentPath's directory.
      const baseDir = (currentPath ?? "").split("/").slice(0, -1);
      const parts = cleanHref.split("/");
      const stack = [...baseDir];
      for (const seg of parts) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") stack.pop();
        else stack.push(seg);
      }
      return stack.join("/");
    },
    [],
  );

  // Click handler attached to every <a> rendered by ReactMarkdown. We
  // intercept BEFORE the iframe navigates — the iframe is sandboxed and
  // any default navigation would land on a 404.
  const handleMarkdownLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) => {
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      const project = payloadRef.current?.workspaceProject;
      if (!project) return;
      // External / anchor → open in a new browser tab via host.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) {
        try {
          window.open(href, "_blank", "noopener,noreferrer");
        } catch {
          /* sandbox may block window.open — postMessage host as fallback */
          window.parent.postMessage(
            { type: "compliance-cockpit-action", action: "open-external", payload: { url: href } },
            "*",
          );
        }
        return;
      }
      const resolved = resolveRelativePath(href, markdownPath);
      if (!resolved) return;
      // Markdown → recursive in-pane navigation. Non-markdown (PDF, etc.)
      // → ask the host to open it in its own preview pane (the cockpit's
      // markdown viewer can't render PDFs).
      if (/\.(md|markdown)$/i.test(resolved)) {
        loadMarkdown(resolved, project, "push");
      } else {
        window.parent.postMessage(
          {
            type: "compliance-cockpit-action",
            action: "open-host-preview",
            payload: { path: resolved },
          },
          "*",
        );
      }
    },
    [loadMarkdown, markdownPath, resolveRelativePath],
  );

  // ── Status / Review mutation ───────────────────────────────────────────
  const updateRowState = useCallback(
    async (requirementId: string, state: CoverageState, projectName: string) => {
      const app = appRef.current;
      if (!app) return;
      // Optimistic update — patch immediately, roll back on error.
      setRowOverrides((prev) => ({
        ...prev,
        [requirementId]: { ...prev[requirementId], state },
      }));
      try {
        // Scope the patch to the *currently rendered* coverage file —
        // requirementId is unique per-RFP, not project-wide, so without
        // an explicit coverageRef the backend falls back to the legacy
        // current.coverage.json and would patch the wrong file when the
        // user is viewing a second RFP.
        const coverageRef = payloadRef.current?.coverageRef;
        const result = await app.callServerTool({
          name: "set_row_state",
          arguments: { projectName, requirementId, state, ...(coverageRef ? { coverageRef } : {}) },
        });
        const parsed = extractJson<{ success: boolean; stateCounts?: Record<string, number>; error?: string }>(
          result as CallToolResult,
        );
        if (!parsed.success) throw new Error(parsed.error ?? "set_row_state failed");
        if (parsed.stateCounts) setUpdatedStateCounts(parsed.stateCounts);
      } catch (err: any) {
        // Roll back
        setRowOverrides((prev) => {
          const next = { ...prev };
          if (next[requirementId]) {
            const { state: _state, ...rest } = next[requirementId];
            void _state;
            next[requirementId] = rest;
            if (!next[requirementId].reviewStatus) delete next[requirementId];
          }
          return next;
        });
        console.error("[compliance-matrix] set_row_state failed:", err);
      }
    },
    [],
  );

  const updateRowReview = useCallback(
    async (requirementId: string, reviewStatus: ReviewStatus, projectName: string) => {
      const app = appRef.current;
      if (!app) return;
      setRowOverrides((prev) => ({
        ...prev,
        [requirementId]: { ...prev[requirementId], reviewStatus },
      }));
      try {
        const coverageRef = payloadRef.current?.coverageRef;
        const result = await app.callServerTool({
          name: "set_row_review",
          arguments: { projectName, requirementId, reviewStatus, ...(coverageRef ? { coverageRef } : {}) },
        });
        const parsed = extractJson<{ success: boolean; error?: string }>(result as CallToolResult);
        if (!parsed.success) throw new Error(parsed.error ?? "set_row_review failed");
      } catch (err: any) {
        setRowOverrides((prev) => {
          const next = { ...prev };
          if (next[requirementId]) {
            const { reviewStatus: _rs, ...rest } = next[requirementId];
            void _rs;
            next[requirementId] = rest;
            if (!next[requirementId].state) delete next[requirementId];
          }
          return next;
        });
        console.error("[compliance-matrix] set_row_review failed:", err);
      }
    },
    [],
  );

  // ── Open in wiki editor (host postMessage) ─────────────────────────────
  // The host opens wiki/topics/<slug>.md in its preview pane. We first
  // ping the file via get_text_file: if it's missing (which is true for
  // 142 of the 148 seeded rows), the kebab silently auto-creates the
  // stub via create_planned_response_page so the host has something to
  // open. Without this, clicking the kebab on a row whose stub doesn't
  // exist appears to do nothing — the host's fetchFile gets 404 + gives
  // up after retries.
  const openInWikiEditor = useCallback(
    async (slug: string, row: MatrixRow | null) => {
      const app = appRef.current;
      const project = payloadRef.current?.workspaceProject;
      if (!app || !project) return;
      const wikiPath = `wiki/topics/${slug}.md`;
      try {
        const probe = await app.callServerTool({
          name: "get_text_file",
          arguments: { projectName: project, path: wikiPath },
        });
        const parsed = extractJson<{ found: boolean }>(probe as CallToolResult);
        if (!parsed.found && row) {
          // Auto-create the stub on the user's behalf so the host has
          // something to open. The handler already exists and refreshes
          // the right pane after success.
          await app.callServerTool({
            name: "create_planned_response_page",
            arguments: {
              projectName: project,
              requirementId: row.requirementId,
              ears: row.ears,
              sourceLocation: row.sourceLocation,
            },
          });
        }
      } catch (err) {
        console.error("[compliance-matrix] open-wiki-editor probe failed:", err);
      }
      postCockpitAction("open-wiki-editor", { slug });
    },
    [],
  );

  const { app, error } = useApp({
    appInfo: { name: "Compliance Matrix", version: "1.0.0" },
    capabilities: {},
    autoResize: false,
    onAppCreated: (a) => {
      a.onteardown = async () => ({});
      a.ontoolinput = async () => {};
      a.ontoolresult = async (result) => setToolResult(result);
      a.ontoolcancelled = () => {};
      a.onerror = console.error;
      a.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
    appRef.current = app ?? null;
  }, [app]);

  const themeMode = (hostContext as any)?.theme === "dark" ? "dark" : "light";
  const isDark = themeMode === "dark";
  const muiTheme = useMemo(
    () => createTheme({
      palette: { mode: isDark ? "dark" : "light" },
      typography: {
        // Force Roboto for the cockpit (loaded via @fontsource/roboto in
        // global.css). Fallbacks cover the moment before the webfont has
        // finished loading and the rare case where the loader fails.
        fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
      },
    }),
    [isDark],
  );
  const palette = useMemo(() => buildPalette(isDark), [isDark]);

  const payload: MatrixPayload | null = useMemo(() => {
    if (!toolResult) return null;
    try {
      const parsed = extractJson<MatrixPayload>(toolResult);
      if (!parsed || !Array.isArray(parsed.rows)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [toolResult]);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  // Workspace dir name (project folder under workspace/). The backend
  // tool emits this in the response payload. If it's missing, the
  // backend is running an older build — the cockpit can still render
  // the matrix, but all write actions (status / review / notes / file
  // loads) need the workspace dir.
  const workspaceProject = payload?.workspaceProject;

  // ── RFP registry fetch ────────────────────────────────────────────────
  // Once we know the workspace project, ask the backend which RFPs the
  // project has registered. Matches the active payload's coverageRef
  // back to a registry id so the picker shows the right initial value.
  useEffect(() => {
    const app = appRef.current;
    if (!app || !workspaceProject) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await app.callServerTool({
          name: "list_project_rfps",
          arguments: { projectName: workspaceProject },
        });
        const parsed = extractJson<{ rfps?: RfpEntry[] }>(result as CallToolResult);
        if (cancelled) return;
        const list = Array.isArray(parsed?.rfps) ? parsed.rfps : [];
        setRfps(list);
        // Pick the entry whose coverageRef matches the rendered payload.
        // Fallback to the first entry if no match (e.g. host opened a
        // coverage file that isn't registered yet).
        const activeCoverage = payload?.coverageRef ?? null;
        const match = activeCoverage
          ? list.find((r) => r.coverageRef === activeCoverage)
          : null;
        setCurrentRfpId(match?.id ?? list[0]?.id ?? null);
      } catch (err) {
        console.error("[compliance-matrix] list_project_rfps failed:", err);
        if (!cancelled) setRfps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceProject, payload?.coverageRef]);

  // ── RFP switch ────────────────────────────────────────────────────────
  // Re-fire render_compliance_matrix with the target RFP's sentinel ref.
  // We construct a minimal sentinel-shaped `content` blob carrying the
  // selected RFP's coverageRef; the backend tool reads coverageRef from
  // it and renders the corresponding matrix.
  const handleRfpChange = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === currentRfpId) return;
      const app = appRef.current;
      if (!app || !workspaceProject) return;
      const next = rfps.find((r) => r.id === nextId);
      if (!next) return;
      setRfpSwitching(true);
      try {
        const sentinel = JSON.stringify({
          workspaceProject,
          coverageRef: next.coverageRef,
          teamRef: "wiki/topics/team.md",
        });
        const result = await app.callServerTool({
          name: "render_compliance_matrix",
          arguments: {
            projectName: workspaceProject,
            content: sentinel,
            filename: next.sentinelRef,
          },
        });
        setToolResult(result as CallToolResult);
        setCurrentRfpId(nextId);
        // Reset client-side filters and row overrides; they were scoped
        // to the previous RFP's rows (requirementId is unique per-RFP,
        // not project-wide, so keeping overrides would alias rows).
        setStatusFilter("all");
        setReviewFilter("all");
        setOwnerFilter("all");
        setSearch("");
        setSelectedId(null);
        setRowOverrides({});
      } catch (err) {
        console.error("[compliance-matrix] RFP switch failed:", err);
      } finally {
        setRfpSwitching(false);
      }
    },
    [currentRfpId, rfps, workspaceProject],
  );

  const showRfpPicker = useMemo(() => {
    if (rfps.length >= 2) return true;
    if (rfps.length === 1 && !rfps[0].synthesized) return true;
    return false;
  }, [rfps]);

  // Apply local row overrides (from kebab menu actions) on top of the
  // payload before filtering. The cockpit doesn't refetch after every
  // mutation; instead we merge the persisted patch in-memory.
  const mergedRows = useMemo<MatrixRow[]>(() => {
    if (!payload) return [];
    return payload.rows.map((row) => {
      const ov = rowOverrides[row.requirementId];
      if (!ov) return row;
      return {
        ...row,
        ...(ov.state ? { state: ov.state } : {}),
        ...(ov.reviewStatus ? { reviewStatus: ov.reviewStatus } : {}),
        ...(ov.notes !== undefined ? { notes: ov.notes } : {}),
      };
    });
  }, [payload, rowOverrides]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedRows.filter((r) => {
      if (statusFilter !== "all" && r.state !== statusFilter) return false;
      if (reviewFilter !== "all" && r.reviewStatus !== reviewFilter) return false;
      if (ownerFilter !== "all" && r.responsibleEngineer !== ownerFilter) return false;
      if (q) {
        const hay =
          `${r.requirementId} ${r.ears} ${r.sourceLocation} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedRows, statusFilter, reviewFilter, ownerFilter, search]);

  const selectedRow = useMemo(
    () => mergedRows.find((r) => r.requirementId === selectedId) ?? null,
    [mergedRows, selectedId],
  );

  // State counts shown in the sticky footer. Use the patch-aware value
  // if mutations have run; otherwise fall back to the seeded counts.
  const effectiveStateCounts = useMemo(() => {
    if (updatedStateCounts) return updatedStateCounts;
    if (Object.keys(rowOverrides).length === 0) return payload?.stateCounts ?? null;
    const counts: Record<string, number> = {};
    for (const r of mergedRows) counts[r.state] = (counts[r.state] ?? 0) + 1;
    return counts;
  }, [updatedStateCounts, rowOverrides, mergedRows, payload?.stateCounts]);

  // Push the selection to the host so the chat model can react to it.
  useEffect(() => {
    postSelectionToHost(selectedRow);
  }, [selectedRow]);

  const handleClearFilters = useCallback(() => {
    setStatusFilter("all");
    setReviewFilter("all");
    setOwnerFilter("all");
    setSearch("");
  }, []);

  const handleExport = useCallback(() => {
    // The export modal needs the WORKSPACE project name (e.g.
    // "requirements-hv") to call /api/claude/filesystem etc.
    // `payload.project.name` is the bid display label
    // ("NU-525-Lot-3") and is the wrong value here.
    const workspaceProject = payload?.workspaceProject;
    if (!workspaceProject) return;
    const currentRfp = rfps.find((r) => r.id === currentRfpId) ?? null;
    postCockpitAction("open-export", {
      projectName: workspaceProject,
      bidLabel: payload?.project?.name,
      visibleRowCount: filteredRows.length,
      totalRowCount: payload.rows.length,
      // Active RFP context — when present, the export modal scopes
      // fill-back to this RFP and only offers compatible modes.
      rfp: currentRfp
        ? {
            id: currentRfp.id,
            title: currentRfp.title,
            kind: currentRfp.kind,
            exportTarget: currentRfp.exportTarget,
          }
        : null,
      rfps: rfps.map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        exportTarget: r.exportTarget,
      })),
    });
  }, [payload, filteredRows.length, currentRfpId, rfps]);

  const handleCreatePlannedResponse = useCallback(
    async (row: MatrixRow) => {
      const app = appRef.current;
      const project = payloadRef.current?.workspaceProject;
      if (!app || !project) return;
      try {
        const result = await app.callServerTool({
          name: "create_planned_response_page",
          arguments: {
            projectName: project,
            requirementId: row.requirementId,
            ears: row.ears,
            sourceLocation: row.sourceLocation,
          },
        });
        const parsed = extractJson<{ created: boolean; slug?: string; path?: string }>(
          result as CallToolResult,
        );
        if (parsed.created && parsed.slug) {
          // Reload the stub into the right pane so the user sees what
          // they just created.
          loadMarkdown(`wiki/topics/${parsed.slug}.md`, project, "replace");
        }
      } catch (err) {
        console.error("[compliance-matrix] create_planned_response_page failed:", err);
      }
    },
    [loadMarkdown],
  );

  // ── Pick-from-existing-docs path ─────────────────────────────────────────
  // Opens the source picker dialog and triggers the list_project_sources call.
  // On select the dialog invokes create_planned_response_from_source.
  const openSourcePicker = useCallback(async (row: MatrixRow) => {
    const app = appRef.current;
    const project = payloadRef.current?.workspaceProject;
    if (!app || !project) return;
    setPickerOpen({ row });
    setPickerLoading(true);
    setPickerError(null);
    setPickerItems([]);
    setPickerFilter("");
    try {
      const result = await app.callServerTool({
        name: "list_project_sources",
        arguments: { projectName: project },
      });
      const parsed = extractJson<{ items?: SourceItem[]; error?: string }>(result as CallToolResult);
      if (parsed.error) {
        setPickerError(parsed.error);
        setPickerItems([]);
      } else {
        setPickerItems(Array.isArray(parsed.items) ? parsed.items : []);
      }
    } catch (err) {
      console.error("[compliance-matrix] list_project_sources failed:", err);
      setPickerError(String((err as Error)?.message ?? err));
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const handlePickSource = useCallback(
    async (row: MatrixRow, item: SourceItem) => {
      const app = appRef.current;
      const project = payloadRef.current?.workspaceProject;
      if (!app || !project) return;
      setPickerSubmitting(true);
      try {
        const result = await app.callServerTool({
          name: "create_planned_response_from_source",
          arguments: {
            projectName: project,
            requirementId: row.requirementId,
            ears: row.ears,
            sourceLocation: row.sourceLocation,
            sourceScope: item.scope,
            sourcePath: item.path,
          },
        });
        const parsed = extractJson<{ created: boolean; slug?: string; error?: string }>(
          result as CallToolResult,
        );
        if (parsed.created && parsed.slug) {
          loadMarkdown(`wiki/topics/${parsed.slug}.md`, project, "replace");
          setPickerOpen({ row: null });
        } else {
          setPickerError(parsed.error ?? "Unknown error creating planned response from source");
        }
      } catch (err) {
        console.error("[compliance-matrix] create_planned_response_from_source failed:", err);
        setPickerError(String((err as Error)?.message ?? err));
      } finally {
        setPickerSubmitting(false);
      }
    },
    [loadMarkdown],
  );

  // ── Knowledge-base path ──────────────────────────────────────────────────
  const handleSubmitKnowledgeBase = useCallback(async () => {
    const app = appRef.current;
    const project = payloadRef.current?.workspaceProject;
    const row = kbOpen.row;
    if (!app || !project || !row || !kbQuestion.trim()) return;
    setKbSubmitting(true);
    setKbError(null);
    try {
      const result = await app.callServerTool({
        name: "create_planned_response_from_knowledge_base",
        arguments: {
          projectName: project,
          requirementId: row.requirementId,
          ears: row.ears,
          sourceLocation: row.sourceLocation,
          question: kbQuestion.trim(),
        },
      });
      const parsed = extractJson<{ created: boolean; slug?: string; error?: string }>(
        result as CallToolResult,
      );
      if (parsed.created && parsed.slug) {
        loadMarkdown(`wiki/topics/${parsed.slug}.md`, project, "replace");
        setKbOpen({ row: null });
        setKbQuestion("");
      } else {
        setKbError(parsed.error ?? "Unknown error creating planned response from knowledge base");
      }
    } catch (err) {
      console.error("[compliance-matrix] create_planned_response_from_knowledge_base failed:", err);
      setKbError(String((err as Error)?.message ?? err));
    } finally {
      setKbSubmitting(false);
    }
  }, [kbOpen.row, kbQuestion, loadMarkdown]);

  // Convenience: the create-menu actions close the menu then dispatch.
  const handleCreateMenuPick = useCallback(
    (action: "stub" | "source" | "kb", row: MatrixRow) => {
      setCreateMenuAnchor({ anchor: null, row: null });
      if (action === "stub") {
        handleCreatePlannedResponse(row);
      } else if (action === "source") {
        openSourcePicker(row);
      } else {
        setKbQuestion("");
        setKbError(null);
        setKbOpen({ row });
      }
    },
    [handleCreatePlannedResponse, openSourcePicker],
  );

  // ── render ─────────────────────────────────────────────────────────────

  const content = (() => {
    if (error) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">MCP App error: {error.message || String(error)}</Alert>
        </Box>
      );
    }
    if (!app || !toolResult) {
      return (
        <Box sx={{ p: 4, display: "flex", justifyContent: "center", color: "text.secondary" }}>
          <Typography variant="body2">{!app ? "Connecting…" : "Waiting for matrix data…"}</Typography>
        </Box>
      );
    }
    if (!payload) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">Failed to parse compliance-matrix payload</Alert>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          width: "100%",
          height: "100vh",
          bgcolor: palette.surfaceBg,
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <Paper elevation={0} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Compliance matrix — {payload.project?.name ?? "untitled"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {payload.project?.customer ? `${payload.project.customer} · ` : ""}
                {filteredRows.length} of {payload.rows.length} requirements
              </Typography>
            </Box>
            <Box
              component="img"
              src={featureImageUrl}
              alt=""
              sx={{ height: 80, width: "auto", display: "block", flexShrink: 0 }}
            />
          </Stack>
        </Paper>

        {payload.teamMissing && (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            No <code>wiki/topics/team.md</code> found. Owner cells show initials derived from the
            engineer id; create the team page so the cockpit can resolve names and roles.
          </Alert>
        )}
        {!workspaceProject && (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            The backend response is missing <code>workspaceProject</code>. Status changes,
            notes, and file loads are disabled. Restart the backend (it picks up new MCP
            tool fields on restart), then reload this tab.
          </Alert>
        )}

        {/* Top toolbar: search + filters + state-counts. Sits between the
            header and the body so the matrix gets full width below.
            `compactInputSx` shrinks below MUI's `size="small"` baseline —
            input height ~28px, font 0.75rem, label scaled to match. */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 0.75,
            rowGap: 0.75,
          }}
        >
          {showRfpPicker && (
            <FormControl size="small" sx={{ ...compactInputSx, minWidth: 200 }}>
              <InputLabel id="rfp-picker-label">RFP</InputLabel>
              <Select
                labelId="rfp-picker-label"
                label="RFP"
                value={currentRfpId ?? ""}
                disabled={rfpSwitching}
                onChange={(e) => void handleRfpChange(String(e.target.value))}
              >
                {rfps.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.title}
                    {r.kind === "xlsx-questionnaire" ? " (XLSX)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            size="small"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ ...compactInputSx, minWidth: 180, flexGrow: 1, maxWidth: 360 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: "0.95rem" }} />
                </InputAdornment>
              ),
            }}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            options={payload.filters.statuses}
            onChange={setStatusFilter}
            sx={{ ...compactInputSx, minWidth: 120 }}
          />
          <FilterSelect
            label="Review"
            value={reviewFilter}
            options={payload.filters.reviews}
            onChange={setReviewFilter}
            sx={{ ...compactInputSx, minWidth: 120 }}
          />
          <FilterSelect
            label="Owner"
            value={ownerFilter}
            options={payload.filters.owners}
            renderOption={(opt) => {
              const { initials, entry } = ownerInitials(opt, payload.team);
              return entry ? `${initials} — ${entry.name}` : initials;
            }}
            onChange={setOwnerFilter}
            sx={{ ...compactInputSx, minWidth: 150 }}
          />
          <Button
            variant="text"
            size="small"
            startIcon={<FilterAltOffIcon sx={{ fontSize: "0.95rem" }} />}
            onClick={handleClearFilters}
            disabled={
              statusFilter === "all" &&
              reviewFilter === "all" &&
              ownerFilter === "all" &&
              !search
            }
            sx={{ fontSize: "0.7rem", py: 0.25, minWidth: 0 }}
          >
            Clear
          </Button>
        </Box>

        {/* Body: matrix + right-pane preview */}
        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* Matrix — column widths use `table-layout: fixed`. The table
              has a hard floor of 700px so columns never crush below
              legibility; the outer Box scrolls horizontally when the
              right pane is narrower than that. Cell content wraps via
              `wordBreak: break-word` on all TableCell children. */}
          <Box sx={{ flex: 1, minWidth: 0, overflowX: "auto", overflowY: "auto" }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                tableLayout: "fixed",
                width: "100%",
                minWidth: 700,
                // `break-word` wraps long tokens (locators, slugs) at the
                // cell boundary without breaking *every* word character by
                // character. `wordBreak: normal` keeps prose readable.
                "& td, & th": {
                  wordBreak: "normal",
                  overflowWrap: "break-word",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  {/* Below `lg` the matrix collapses to: ID (with status
                      dot under it) · EARS · Source/Response · Owner/review
                      · kebab. All columns render at every viewport width;
                      horizontal overflow on narrow viewports is handled
                      by the outer scroll container. */}
                  <TableCell sx={{ width: 80 }}>ID</TableCell>
                  <TableCell>Requirement (EARS)</TableCell>
                  <TableCell sx={{ width: 200 }}>Source / Response</TableCell>
                  <TableCell sx={{ width: 110, whiteSpace: "nowrap" }}>
                    Owner / review
                  </TableCell>
                  <TableCell sx={{ width: 36, p: 0 }} aria-label="Row actions" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => {
                  const sTone = toneColors(palette, stateTone(row.state));
                  const rTone = toneColors(palette, reviewTone(row.reviewStatus));
                  const { initials, entry } = ownerInitials(row.responsibleEngineer, payload.team);
                  const isSelected = row.requirementId === selectedId;
                  const sourceDocPath = row.sourceCitation?.docPath;
                  // Treat the slug as "has a planned response" only when
                  // the backend confirmed the wiki page exists on disk.
                  // Coverage data sometimes lists slugs whose pages were
                  // never authored — surfacing those as live links would
                  // mislead the user about preparation progress.
                  const plannedResponseAvailable =
                    Boolean(row.plannedResponseSlug) && row.plannedResponseExists !== false;
                  const plannedResponseFile = plannedResponseAvailable
                    ? `wiki/topics/${row.plannedResponseSlug}.md`
                    : null;
                  return (
                    <TableRow
                      key={row.requirementId}
                      hover
                      selected={isSelected}
                      onClick={() => setSelectedId(row.requirementId)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ fontFamily: "monospace", fontWeight: 600, verticalAlign: "top" }}>
                        {row.requirementId}
                        {/* Status indicator under the ID — replaces the
                            former dedicated Status column. Tooltip carries
                            the state label. */}
                        <Box sx={{ mt: 0.5 }}>
                          <Tooltip title={row.state} placement="right">
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                bgcolor: sTone.fg,
                                border: 2,
                                borderColor: sTone.bg,
                                display: "inline-block",
                                cursor: "help",
                              }}
                            />
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
                        <Typography variant="body2">{row.ears}</Typography>
                        {row.chips.length > 0 && (
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                            {row.chips.map((c) => (
                              <Chip
                                key={c}
                                size="small"
                                label={c}
                                variant="outlined"
                                sx={{ fontSize: "0.65rem", height: 18 }}
                              />
                            ))}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
                        <Stack spacing={0.5}>
                          {/* Source line — click opens the source doc. */}
                          <Box
                            onClick={(e) => {
                              if (!sourceDocPath || !workspaceProject) return;
                              e.stopPropagation();
                              setSelectedId(row.requirementId);
                              loadMarkdown(sourceDocPath, workspaceProject);
                            }}
                            title={sourceDocPath ? `Open ${sourceDocPath} in right pane` : ""}
                            sx={{
                              cursor: sourceDocPath ? "pointer" : "default",
                              borderRadius: 0.5,
                              px: 0.5,
                              mx: -0.5,
                              "&:hover": sourceDocPath ? { bgcolor: "action.hover" } : {},
                            }}
                          >
                            <Stack direction="row" spacing={0.5} alignItems="flex-start">
                              <ArticleIcon
                                sx={{ color: "text.primary", flexShrink: 0, fontSize: "0.95rem", lineHeight: 1 }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="caption" sx={{ fontFamily: "monospace", display: "block", lineHeight: 1 }}>
                                  {row.sourceLocation}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block", mt: 0.25 }}
                                >
                                  {row.sourceVolume.replace(/^source-volume-/, "vol. ")}
                                </Typography>
                              </Box>
                            </Stack>
                          </Box>
                          {/* Planned-response line — click opens the wiki page. */}
                          <Box
                            onClick={(e) => {
                              if (!plannedResponseFile || !workspaceProject) return;
                              e.stopPropagation();
                              setSelectedId(row.requirementId);
                              loadMarkdown(plannedResponseFile, workspaceProject);
                            }}
                            title={
                              plannedResponseFile ? `Open ${plannedResponseFile} in right pane` : ""
                            }
                            sx={{
                              cursor: plannedResponseFile ? "pointer" : "default",
                              borderRadius: 0.5,
                              px: 0.5,
                              mx: -0.5,
                              "&:hover": plannedResponseFile ? { bgcolor: "action.hover" } : {},
                            }}
                          >
                            {plannedResponseAvailable ? (
                              <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                                <ArticleIcon
                                  sx={{ color: palette.blue, flexShrink: 0, fontSize: "0.95rem", lineHeight: 1 }}
                                />
                                {/* Prefix ellipsis: text-overflow only puts
                                    the ellipsis at the *end*, so we flip the
                                    text direction to rtl (truncation now
                                    happens on the left) and override
                                    text-align so the characters still flow
                                    left-to-right. */}
                                <Typography
                                  variant="caption"
                                  title={row.plannedResponseSlug}
                                  sx={{
                                    fontFamily: "monospace",
                                    color: palette.blue,
                                    minWidth: 0,
                                    flex: 1,
                                    overflow: "hidden",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    direction: "rtl",
                                    textAlign: "left",
                                    lineHeight: 1,
                                  }}
                                >
                                  {row.plannedResponseSlug}
                                </Typography>
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                (no planned response)
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
                        <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap">
                          <Tooltip
                            title={entry ? `${entry.name} — ${entry.role}` : "Not in team page"}
                            placement="left"
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, lineHeight: 1.2 }}
                            >
                              {initials}
                            </Typography>
                          </Tooltip>
                          <Chip
                            size="small"
                            label={row.reviewStatus ?? "pending"}
                            sx={{
                              bgcolor: rTone.bg,
                              color: rTone.fg,
                              fontWeight: 500,
                              height: 18,
                              fontSize: "0.65rem",
                            }}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top", p: 0, width: 36 }}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setKebabState({ anchor: e.currentTarget, requirementId: row.requirementId });
                          }}
                          aria-label="Row actions"
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No rows match the current filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          {/* Splitter — same vocabulary as the host's ThreePaneSplit: 6px
              wide, white/2c2c2c base, hover swaps to #efefef/#444, with a
              centered 2px × 30px dotted-border grip. */}
          <Box
            onMouseDown={handleSplitterMouseDown}
            sx={{
              width: "6px",
              height: "100%",
              flexShrink: 0,
              cursor: "col-resize",
              bgcolor: isDark ? "#2c2c2c" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              "&:hover": { bgcolor: isDark ? "#444" : "#efefef" },
              "&:active": { bgcolor: isDark ? "#444" : "#efefef" },
            }}
            aria-label="Resize preview pane"
            role="separator"
          >
            <Box
              sx={{
                width: "2px",
                height: "30px",
                borderLeft: isDark ? "2px dotted #555" : "2px dotted #ccc",
              }}
            />
          </Box>

          {/* Right pane: markdown viewer when a Source / Planned-response
              cell has been clicked, otherwise the structured info card
              for the selected row. No left border — the splitter is the
              visual separator. */}
          <Box
            sx={{
              width: rightPaneWidth,
              overflow: "auto",
              flexShrink: 0,
              bgcolor: "background.paper",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {paneMode === "markdown" && (
              <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <Box
                  sx={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    bgcolor: "background.paper",
                    px: 1.5,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  {mdStack.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (workspaceProject) popMarkdown(workspaceProject);
                      }}
                      aria-label="Back"
                      title="Back"
                    >
                      <ArrowBackIcon fontSize="small" />
                    </IconButton>
                  )}
                  <ArticleIcon fontSize="small" sx={{ color: palette.blue }} />
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", color: palette.blue, wordBreak: "break-all", flex: 1, minWidth: 0 }}
                  >
                    {markdownPath}
                  </Typography>
                  <IconButton size="small" onClick={closeMarkdown} aria-label="Close markdown view">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ p: 1.5, overflow: "auto" }}>
                  {markdownLoading && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={14} />
                      <Typography variant="body2" color="text.secondary">
                        Loading…
                      </Typography>
                    </Stack>
                  )}
                  {markdownError && markdownError.startsWith("__missing__:") && (
                    <Stack spacing={1}>
                      <Alert severity="info">
                        No wiki page yet at{" "}
                        <Box component="span" sx={{ fontFamily: "monospace" }}>
                          {markdownError.replace(/^__missing__:/, "")}
                        </Box>
                        . The compliance matrix references this slug but a stub
                        hasn't been authored.
                      </Alert>
                      {markdownError.includes("/planned-response/") && selectedRow && (
                        <ButtonGroup variant="contained" size="small" sx={{ alignSelf: "flex-start" }}>
                          <Button
                            startIcon={<AddIcon fontSize="small" />}
                            onClick={() => handleCreatePlannedResponse(selectedRow)}
                          >
                            Create planned response stub
                          </Button>
                          <Button
                            size="small"
                            sx={{ minWidth: 32, px: 0.5 }}
                            onClick={(e) =>
                              setCreateMenuAnchor({ anchor: e.currentTarget, row: selectedRow })
                            }
                          >
                            <ArrowDropDownIcon fontSize="small" />
                          </Button>
                        </ButtonGroup>
                      )}
                    </Stack>
                  )}
                  {markdownError && !markdownError.startsWith("__missing__:") && (
                    <Alert severity="error">{markdownError}</Alert>
                  )}
                  {!markdownLoading && !markdownError && markdownContent != null && (
                    <Box
                      sx={{
                        "& h1": { fontSize: "1.15rem", mt: 1, mb: 0.5, fontWeight: 700 },
                        "& h2": { fontSize: "1.0rem", mt: 1, mb: 0.5, fontWeight: 700 },
                        "& h3": { fontSize: "0.92rem", mt: 1, mb: 0.5, fontWeight: 700 },
                        "& p, & li": { fontSize: "0.85rem", lineHeight: 1.5 },
                        "& a": { color: palette.blue, textDecoration: "underline", cursor: "pointer" },
                        "& code": { fontSize: "0.8rem", bgcolor: "action.hover", px: 0.5, borderRadius: 0.5 },
                        "& pre": { bgcolor: "action.hover", p: 1, borderRadius: 1, overflow: "auto" },
                        "& blockquote": { borderLeft: 3, borderColor: "divider", pl: 1, ml: 0, color: "text.secondary" },
                        "& table": { borderCollapse: "collapse", fontSize: "0.8rem" },
                        "& th, & td": { border: 1, borderColor: "divider", px: 0.75, py: 0.5 },
                      }}
                    >
                      <ReactMarkdown
                        components={{
                          // react-markdown passes a `node` prop into the
                          // override that React would warn about; strip
                          // it. Keep onClick *after* the rest spread so a
                          // stray onClick from rest doesn't override ours.
                          a: ({ node: _node, href, children, ...rest }) => {
                            void _node;
                            return (
                              <a
                                {...rest}
                                href={href}
                                onClick={(e) => handleMarkdownLinkClick(e, href)}
                              >
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {markdownContent}
                      </ReactMarkdown>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {paneMode === "info" && (
              <Box sx={{ p: 1.5 }}>
                {!selectedRow && (
                  <Typography variant="body2" color="text.secondary">
                    Select a row to see its planned-response page.
                  </Typography>
                )}
                {selectedRow && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {selectedRow.requirementId}
                    </Typography>
                    <Typography variant="body2">{selectedRow.ears}</Typography>

                    <Divider />

                    {selectedRow.plannedResponseSlug && selectedRow.plannedResponseExists !== false ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                          Planned response
                        </Typography>
                        <Paper
                          variant="outlined"
                          sx={{ p: 1, mt: 0.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                          onClick={() => {
                            if (!workspaceProject) return;
                            loadMarkdown(`wiki/topics/${selectedRow.plannedResponseSlug}.md`, workspaceProject);
                          }}
                        >
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <ArticleIcon fontSize="inherit" sx={{ color: palette.blue }} />
                            <Typography variant="caption" sx={{ fontFamily: "monospace", color: palette.blue, wordBreak: "break-all" }}>
                              wiki/topics/{selectedRow.plannedResponseSlug}.md
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            Click to render here, or use the row kebab → "Open in wiki editor" to edit.
                          </Typography>
                        </Paper>
                      </Box>
                    ) : (
                      <ButtonGroup variant="contained" size="small" sx={{ alignSelf: "flex-start" }}>
                        <Button
                          startIcon={<AddIcon fontSize="small" />}
                          onClick={() => handleCreatePlannedResponse(selectedRow)}
                        >
                          Create planned response
                        </Button>
                        <Button
                          size="small"
                          sx={{ minWidth: 32, px: 0.5 }}
                          onClick={(e) =>
                            setCreateMenuAnchor({ anchor: e.currentTarget, row: selectedRow })
                          }
                          aria-label="More create options"
                        >
                          <ArrowDropDownIcon fontSize="small" />
                        </Button>
                      </ButtonGroup>
                    )}

                    {selectedRow.sourceCitation && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                          Source citation
                        </Typography>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1,
                            mt: 0.5,
                            cursor: selectedRow.sourceCitation.docPath ? "pointer" : "default",
                            "&:hover": selectedRow.sourceCitation.docPath ? { bgcolor: "action.hover" } : {},
                          }}
                          onClick={() => {
                            const p = selectedRow.sourceCitation?.docPath;
                            if (!p || !workspaceProject) return;
                            loadMarkdown(p, workspaceProject);
                          }}
                        >
                          {selectedRow.sourceCitation.docPath && (
                            <Typography variant="caption" sx={{ fontFamily: "monospace", color: palette.blue, wordBreak: "break-all", display: "block" }}>
                              {selectedRow.sourceCitation.docPath}
                            </Typography>
                          )}
                          {selectedRow.sourceCitation.locator && (
                            <Typography variant="caption" color="text.secondary">
                              {selectedRow.sourceCitation.locator}
                            </Typography>
                          )}
                        </Paper>
                      </Box>
                    )}

                    <NotesEditor
                      // re-mount when the row changes so the textarea
                      // resets to the new row's notes instead of carrying
                      // an unsaved edit across selections
                      key={selectedRow.requirementId}
                      requirementId={selectedRow.requirementId}
                      initialNotes={selectedRow.notes ?? ""}
                      project={workspaceProject}
                      coverageRef={payload?.coverageRef}
                      onSaved={(next) => {
                        setRowOverrides((prev) => ({
                          ...prev,
                          [selectedRow.requirementId]: {
                            ...prev[selectedRow.requirementId],
                            notes: next,
                          },
                        }));
                      }}
                      appRef={appRef}
                    />
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Per-row kebab menu (rendered once at root level — anchored by
            the kebabState.anchor element from whichever row was clicked).
            Two submenu sections (Status / Review) plus the Open-in-wiki
            shortcut. */}
        <Menu
          anchorEl={kebabState.anchor}
          open={Boolean(kebabState.anchor)}
          onClose={() => setKebabState({ anchor: null, requirementId: null })}
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          {(() => {
            const reqId = kebabState.requirementId;
            const row = reqId ? mergedRows.find((r) => r.requirementId === reqId) : null;
            const close = () => setKebabState({ anchor: null, requirementId: null });
            const project = workspaceProject;
            const items: React.ReactNode[] = [];

            items.push(
              <ListSubheader key="hdr-status" sx={{ lineHeight: 1.6, fontWeight: 700, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: 0.5 }}>
                Status
              </ListSubheader>,
            );
            const STATES: CoverageState[] = ["open", "drafted", "reviewed", "committed", "deviation", "clarify"];
            for (const s of STATES) {
              const isCurrent = row?.state === s;
              const { fg, bg } = toneColors(palette, stateTone(s));
              items.push(
                <MenuItem
                  key={`state-${s}`}
                  onClick={() => {
                    if (reqId && project && !isCurrent) updateRowState(reqId, s, project);
                    close();
                  }}
                  selected={isCurrent}
                  disabled={!project}
                >
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: fg, border: 1, borderColor: bg }} />
                  </ListItemIcon>
                  <ListItemText primary={s} primaryTypographyProps={{ fontSize: "0.85rem" }} />
                </MenuItem>,
              );
            }

            items.push(<Divider key="div-1" sx={{ my: 0.5 }} />);
            items.push(
              <ListSubheader key="hdr-review" sx={{ lineHeight: 1.6, fontWeight: 700, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: 0.5 }}>
                Review
              </ListSubheader>,
            );
            const REVIEWS: ReviewStatus[] = ["pending", "in-review", "approved", "rejected"];
            for (const r of REVIEWS) {
              const isCurrent = row?.reviewStatus === r;
              const { fg, bg } = toneColors(palette, reviewTone(r));
              items.push(
                <MenuItem
                  key={`review-${r}`}
                  onClick={() => {
                    if (reqId && project && !isCurrent) updateRowReview(reqId, r, project);
                    close();
                  }}
                  selected={isCurrent}
                  disabled={!project}
                >
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: fg, border: 1, borderColor: bg }} />
                  </ListItemIcon>
                  <ListItemText primary={r} primaryTypographyProps={{ fontSize: "0.85rem" }} />
                </MenuItem>,
              );
            }

            if (row?.plannedResponseSlug) {
              items.push(<Divider key="div-2" sx={{ my: 0.5 }} />);
              items.push(
                <MenuItem
                  key="open-wiki"
                  onClick={() => {
                    if (row.plannedResponseSlug) {
                      void openInWikiEditor(row.plannedResponseSlug, row);
                    }
                    close();
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <EditNoteIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Open in wiki editor" primaryTypographyProps={{ fontSize: "0.85rem" }} />
                </MenuItem>,
              );
            }

            return items;
          })()}
        </Menu>

        {/* Create-planned-response menu — the dropdown side of the split-button.
            Same root-level rendering as the kebab Menu so it can be anchored
            from either of the two "Create planned response" sites. */}
        <Menu
          anchorEl={createMenuAnchor.anchor}
          open={Boolean(createMenuAnchor.anchor)}
          onClose={() => setCreateMenuAnchor({ anchor: null, row: null })}
          slotProps={{ paper: { sx: { minWidth: 260 } } }}
        >
          {createMenuAnchor.row && (
            <Box>
              <ListSubheader sx={{ lineHeight: 1.6, fontWeight: 700, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: 0.5 }}>
                Create planned response
              </ListSubheader>
              <MenuItem onClick={() => handleCreateMenuPick("stub", createMenuAnchor.row!)}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <AddIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Empty stub"
                  secondary="Placeholder body. Draft from scratch."
                  primaryTypographyProps={{ fontSize: "0.85rem" }}
                  secondaryTypographyProps={{ fontSize: "0.75rem" }}
                />
              </MenuItem>
              <MenuItem onClick={() => handleCreateMenuPick("source", createMenuAnchor.row!)}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <FolderOpenIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Pick from existing docs"
                  secondary="From documents/ or an existing wiki page."
                  primaryTypographyProps={{ fontSize: "0.85rem" }}
                  secondaryTypographyProps={{ fontSize: "0.75rem" }}
                />
              </MenuItem>
              <MenuItem onClick={() => handleCreateMenuPick("kb", createMenuAnchor.row!)}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <PsychologyIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Create from knowledge base"
                  secondary="Ask the agent a single question (RAG-grounded)."
                  primaryTypographyProps={{ fontSize: "0.85rem" }}
                  secondaryTypographyProps={{ fontSize: "0.75rem" }}
                />
              </MenuItem>
            </Box>
          )}
        </Menu>

        {/* Source-picker dialog — opened by the "Pick from existing docs" menu
            item. Two grouped lists (Documents + Wiki pages), client-side filter,
            click-to-select. */}
        <Dialog
          open={Boolean(pickerOpen.row)}
          onClose={() => (pickerSubmitting ? null : setPickerOpen({ row: null }))}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>
            Pick a source for the planned response
            {pickerOpen.row && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                {pickerOpen.row.requirementId} — {pickerOpen.row.ears.slice(0, 100)}
                {pickerOpen.row.ears.length > 100 ? "…" : ""}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent dividers>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by name, title or preview…"
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 1 }}
            />
            {pickerLoading && (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress size={24} />
              </Stack>
            )}
            {pickerError && !pickerLoading && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {pickerError}
              </Alert>
            )}
            {!pickerLoading && pickerItems.length > 0 && (
              <SourcePickerLists
                items={pickerItems}
                filter={pickerFilter}
                disabled={pickerSubmitting}
                onPick={(item) => pickerOpen.row && handlePickSource(pickerOpen.row, item)}
              />
            )}
            {!pickerLoading && !pickerError && pickerItems.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No sources available in documents/ or wiki/.
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPickerOpen({ row: null })} disabled={pickerSubmitting}>
              Cancel
            </Button>
          </DialogActions>
        </Dialog>

        {/* Knowledge-base dialog — opened by the "Create from knowledge base"
            menu item. Single question textbox + submit. The agent answers
            using RAG context; the answer becomes the new wiki page body. */}
        <Dialog
          open={Boolean(kbOpen.row)}
          onClose={() => (kbSubmitting ? null : setKbOpen({ row: null }))}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>
            Ask the agent
            {kbOpen.row && (
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                {kbOpen.row.requirementId} — {kbOpen.row.ears.slice(0, 100)}
                {kbOpen.row.ears.length > 100 ? "…" : ""}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              The agent will answer your question using the project's documents
              and wiki (RAG-grounded) and write the answer as the new planned
              response. <strong>Review the result</strong> — the row stays in
              <code>drafted</code>; the agent may hallucinate.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={3}
              maxRows={8}
              placeholder="What should the response say?"
              value={kbQuestion}
              onChange={(e) => setKbQuestion(e.target.value)}
              disabled={kbSubmitting}
            />
            {kbError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {kbError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setKbOpen({ row: null })} disabled={kbSubmitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmitKnowledgeBase}
              disabled={kbSubmitting || !kbQuestion.trim()}
              startIcon={kbSubmitting ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
            >
              {kbSubmitting ? "Asking…" : "Ask agent"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Sticky footer — state-count chips (left) + Export button (right).
            Sticks to the bottom of the iframe; the body above scrolls. */}
        <Paper
          elevation={0}
          sx={{
            ml: "40px",
            mb: "10px",
            px: 1.5,
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {effectiveStateCounts && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ alignSelf: "center", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", mr: 0.5 }}
              >
                State
              </Typography>
              {Object.entries(effectiveStateCounts).map(([k, v]) => {
                const t = stateTone(k as CoverageState);
                const { fg, bg } = toneColors(palette, t);
                return (
                  <Chip
                    key={k}
                    size="small"
                    label={`${k} · ${v}`}
                    sx={{ bgcolor: bg, color: fg, fontWeight: 600 }}
                  />
                );
              })}
            </Stack>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<FileDownloadIcon fontSize="small" />}
            onClick={handleExport}
          >
            Export
          </Button>
        </Paper>
      </Box>
    );
  })();

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {content}
    </ThemeProvider>
  );
}

// ─── Notes editor (inline textarea + Save) ───────────────────────────────────

function NotesEditor({
  requirementId,
  initialNotes,
  project,
  coverageRef,
  onSaved,
  appRef,
}: {
  requirementId: string;
  initialNotes: string;
  project: string | undefined;
  coverageRef: string | undefined;
  onSaved: (next: string) => void;
  appRef: React.MutableRefObject<ReturnType<typeof useApp>["app"] | null>;
}) {
  const [draft, setDraft] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft !== initialNotes;
  const canSave = dirty && !saving && Boolean(project);

  const save = useCallback(async () => {
    const app = appRef.current;
    if (!app || !project) return;
    setSaving(true);
    setError(null);
    try {
      const result = await app.callServerTool({
        name: "set_row_notes",
        arguments: {
          projectName: project,
          requirementId,
          notes: draft,
          ...(coverageRef ? { coverageRef } : {}),
        },
      });
      const parsed = extractJson<{ success: boolean; notes?: string; error?: string }>(
        result as CallToolResult,
      );
      if (!parsed.success) throw new Error(parsed.error ?? "set_row_notes failed");
      onSaved(parsed.notes ?? draft);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }, [appRef, draft, project, requirementId, onSaved]);

  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}
      >
        Notes
      </Typography>
      <TextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        multiline
        minRows={3}
        fullWidth
        size="small"
        placeholder="Add notes for this requirement…"
        // Compact: 0.75rem text, slightly tighter padding to match the
        // other small-text affordances in the right pane.
        sx={{
          mt: 0.5,
          "& .MuiOutlinedInput-root": { fontSize: "0.75rem", py: 0.5 },
          "& .MuiOutlinedInput-input": { fontSize: "0.75rem", lineHeight: 1.4 },
        }}
        disabled={saving}
      />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
        <Button size="small" variant="contained" onClick={save} disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && !saving && (
          <Button
            size="small"
            variant="text"
            onClick={() => { setDraft(initialNotes); setError(null); }}
          >
            Revert
          </Button>
        )}
        {!project && (
          <Typography variant="caption" color="text.secondary">
            Reload the cockpit to enable saving.
          </Typography>
        )}
        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

// ─── Filter select ───────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
  renderOption,
  sx,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  renderOption?: (opt: string) => string;
  sx?: React.ComponentProps<typeof FormControl>["sx"];
}) {
  return (
    <FormControl size="small" sx={sx}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <MenuItem value="all">All</MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {renderOption ? renderOption(opt) : opt}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// ─── Source picker lists (Documents + Wiki pages) ────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SourcePickerLists({
  items,
  filter,
  disabled,
  onPick,
}: {
  items: SourceItem[];
  filter: string;
  disabled: boolean;
  onPick: (item: SourceItem) => void;
}) {
  const lowerFilter = filter.trim().toLowerCase();
  const matches = (it: SourceItem) => {
    if (!lowerFilter) return true;
    return (
      it.name.toLowerCase().includes(lowerFilter) ||
      (it.title?.toLowerCase().includes(lowerFilter) ?? false) ||
      it.preview.toLowerCase().includes(lowerFilter)
    );
  };
  const documents = items.filter((it) => it.scope === "documents" && matches(it));
  const wikiPages = items.filter((it) => it.scope === "wiki" && matches(it));

  return (
    <Box>
      {documents.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}
          >
            Documents ({documents.length})
          </Typography>
          <List dense disablePadding sx={{ maxHeight: 240, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, mt: 0.5 }}>
            {documents.map((item) => (
              <ListItem key={`doc-${item.path}`} disablePadding>
                <ListItemButton disabled={disabled} onClick={() => onPick(item)}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <ArticleIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    secondary={`${formatSize(item.sizeBytes)} · ${item.preview}`}
                    primaryTypographyProps={{ fontSize: "0.85rem", fontFamily: "monospace" }}
                    secondaryTypographyProps={{ fontSize: "0.75rem", noWrap: false }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {wikiPages.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}
          >
            Wiki pages ({wikiPages.length})
          </Typography>
          <List dense disablePadding sx={{ maxHeight: 240, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, mt: 0.5 }}>
            {wikiPages.map((item) => (
              <ListItem key={`wiki-${item.path}`} disablePadding>
                <ListItemButton disabled={disabled} onClick={() => onPick(item)}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <EditNoteIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.title ?? item.name}
                    secondary={
                      <Box component="span" sx={{ display: "block" }}>
                        <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.7rem", display: "block" }}>
                          {item.path}
                        </Box>
                        <Box component="span" sx={{ display: "block" }}>{item.preview}</Box>
                      </Box>
                    }
                    primaryTypographyProps={{ fontSize: "0.85rem" }}
                    secondaryTypographyProps={{ fontSize: "0.75rem", component: "span" }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {documents.length === 0 && wikiPages.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
          No matches for "{filter}".
        </Typography>
      )}
    </Box>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComplianceMatrixApp />
  </StrictMode>,
);
