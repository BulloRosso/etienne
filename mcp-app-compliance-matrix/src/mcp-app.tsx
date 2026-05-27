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
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
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
  Article as ArticleIcon,
  Close as CloseIcon,
  EditNote as EditNoteIcon,
  FileDownload as FileDownloadIcon,
  FilterAltOff as FilterAltOffIcon,
  MoreVert as MoreVertIcon,
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

interface MatrixPayload {
  schema?: string;
  // Workspace directory the cockpit reads/writes against. Set by the
  // backend tool from the McpUIPreview-supplied projectName.
  workspaceProject?: string;
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
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 340;
    } catch {
      return 340;
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
      const next = Math.min(800, Math.max(220, state.startWidth - delta));
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
        const result = await app.callServerTool({
          name: "set_row_state",
          arguments: { projectName, requirementId, state },
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
        const result = await app.callServerTool({
          name: "set_row_review",
          arguments: { projectName, requirementId, reviewStatus },
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
    if (!payload?.project?.name) return;
    postCockpitAction("open-export", {
      projectName: payload.project.name,
      visibleRowCount: filteredRows.length,
      totalRowCount: payload.rows.length,
    });
  }, [payload, filteredRows.length]);

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
          {/* Matrix — column widths use `table-layout: fixed` so the cells
              shrink with the pane instead of pushing a horizontal
              scrollbar. Cell content wraps via `wordBreak: break-word`
              applied to all TableCell children below. */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                tableLayout: "fixed",
                width: "100%",
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
                      dot under it) · EARS · Owner/review · kebab.
                      Source, Planned response, and Status appear only at
                      `lg` and up. The hidden info is still reachable via
                      the row's right-pane info card. */}
                  <TableCell sx={{ width: { xs: 60, sm: 70, md: 80 } }}>ID</TableCell>
                  <TableCell>Requirement (EARS)</TableCell>
                  <TableCell sx={{ width: 140, display: { xs: "none", lg: "table-cell" } }}>
                    Source
                  </TableCell>
                  <TableCell sx={{ width: 160, display: { xs: "none", lg: "table-cell" } }}>
                    Planned response
                  </TableCell>
                  <TableCell sx={{ width: 110, display: { xs: "none", lg: "table-cell" } }}>
                    Status
                  </TableCell>
                  <TableCell sx={{ width: { xs: 80, sm: 95, md: 110 } }}>
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
                  const plannedResponseFile = row.plannedResponseSlug
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
                        {/* Compact status indicator — visible only below
                            `lg`, where the dedicated Status column is
                            hidden. Tooltip carries the state label. */}
                        <Box sx={{ mt: 0.5, display: { xs: "block", lg: "none" } }}>
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
                      <TableCell
                        sx={{
                          verticalAlign: "top",
                          display: { xs: "none", lg: "table-cell" },
                          cursor: sourceDocPath ? "pointer" : "default",
                          "&:hover": sourceDocPath ? { bgcolor: "action.hover" } : {},
                        }}
                        onClick={(e) => {
                          if (!sourceDocPath || !workspaceProject) return;
                          e.stopPropagation();
                          setSelectedId(row.requirementId);
                          loadMarkdown(sourceDocPath, workspaceProject);
                        }}
                        title={sourceDocPath ? `Open ${sourceDocPath} in right pane` : ""}
                      >
                        <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                          {row.sourceLocation}
                        </Typography>
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          {row.sourceVolume.replace(/^source-volume-/, "vol. ")}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          verticalAlign: "top",
                          display: { xs: "none", lg: "table-cell" },
                          cursor: plannedResponseFile ? "pointer" : "default",
                          "&:hover": plannedResponseFile ? { bgcolor: "action.hover" } : {},
                        }}
                        onClick={(e) => {
                          if (!plannedResponseFile || !workspaceProject) return;
                          e.stopPropagation();
                          setSelectedId(row.requirementId);
                          loadMarkdown(plannedResponseFile, workspaceProject);
                        }}
                        title={
                          plannedResponseFile ? `Open ${plannedResponseFile} in right pane` : ""
                        }
                      >
                        {row.plannedResponseSlug ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <ArticleIcon fontSize="inherit" sx={{ color: palette.blue }} />
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: "monospace", color: palette.blue }}
                            >
                              {row.plannedResponseSlug}
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            (none)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top", display: { xs: "none", lg: "table-cell" } }}>
                        <Chip
                          size="small"
                          label={row.state}
                          sx={{ bgcolor: sTone.bg, color: sTone.fg, fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
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
                            mt: 0.25,
                            bgcolor: rTone.bg,
                            color: rTone.fg,
                            fontWeight: 500,
                            height: 18,
                            fontSize: "0.65rem",
                          }}
                        />
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
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
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
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon fontSize="small" />}
                          onClick={() => handleCreatePlannedResponse(selectedRow)}
                        >
                          Create planned response stub
                        </Button>
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

                    {selectedRow.plannedResponseSlug ? (
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
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon fontSize="small" />}
                        onClick={() => handleCreatePlannedResponse(selectedRow)}
                      >
                        Create planned response
                      </Button>
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
  onSaved,
  appRef,
}: {
  requirementId: string;
  initialNotes: string;
  project: string | undefined;
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
        arguments: { projectName: project, requirementId, notes: draft },
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

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComplianceMatrixApp />
  </StrictMode>,
);
