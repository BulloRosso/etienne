/**
 * Fleet Alignment — MCP App (React + MUI)
 *
 * Renders a `.alignment.json` nightly fleet-alignment report (tanker-long-horizon)
 * as an interactive Material-design dashboard. Visual vocabulary mirrors the
 * QuarterlyViewer (Paper / Typography / Chip / Table / LinearProgress) so the
 * two previewers feel like one product.
 *
 * Features:
 *   - Header card with mission / strategy / run date and a status chip.
 *   - Fleet-summary scorecards (vessels, aligned, watch, off-strategy,
 *     weighted alignment) + acceptance-criterion banner + drift flags.
 *   - Vessel rows with name, weighted-alignment progress bar, status chip;
 *     click to expand into per-axis drill-down (rationale + provenance),
 *     assumptions, linked hypotheses, approaching gate, open questions.
 *   - Hard-rule compliance grid + agent-notes footer.
 *   - Vessel "pin" mark posts selection upstream via `viewer-state-update`,
 *     so the chat model can see which vessels the user is focused on.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  CssBaseline,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material";
import {
  CheckCircleOutline as CheckCircleOutlineIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  PushPin as PushPinIcon,
  PushPinOutlined as PushPinOutlinedIcon,
  ReportProblem as ReportProblemIcon,
} from "@mui/icons-material";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

// ─── Types (mirror the .alignment.json schema) ───────────────────────────────

interface ProvenanceEntry {
  source: string;
  claim: string;
  freshness?: string;
}

interface AxisScore {
  score: number;
  rationale: string;
  provenance?: ProvenanceEntry[];
}

interface ScoringAxisDef {
  weight: number;
  description: string;
}

interface AssumptionEntry {
  id: string;
  label: string;
  cohort?: number;
  evidence?: string;
  note?: string;
}

interface LinkedHypothesis {
  id: string;
  statement: string;
  state: string;
  stale?: boolean;
  note?: string;
}

interface ApproachingGate {
  kind: string;
  opensIso: string;
  monthsAway: number;
  deferredItems: string[];
  note?: string;
}

interface Vessel {
  name: string;
  imo: number;
  built: number;
  dwt: number;
  alignment: number;
  status: string;
  trend?: string;
  priorAlignment?: number;
  delta?: number;
  axes: Record<string, AxisScore>;
  assumptions?: { expired?: AssumptionEntry[]; ageing?: AssumptionEntry[]; fresh?: AssumptionEntry[] };
  linkedHypotheses?: LinkedHypothesis[];
  approachingGate?: ApproachingGate;
  openQuestions?: string[];
}

interface HardRule {
  compliant: boolean;
  note?: string;
}

interface FleetSummary {
  totalVessels: number;
  aligned: number;
  watch: number;
  offStrategy: number;
  weightedFleetAlignment: number;
  acceptanceCriterion?: string;
  criterionMet?: boolean;
  driftFlags?: string[];
}

interface AlignmentReport {
  reportId: string;
  runDate: string;
  mission?: string;
  strategy?: string;
  scoringAxes?: Record<string, ScoringAxisDef>;
  fleetSummary: FleetSummary;
  vessels: Vessel[];
  hypothesisRegistry?: LinkedHypothesis[];
  hardRuleCompliance?: Record<string, HardRule>;
  agentNotes?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson<T>(result: CallToolResult): T {
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text in result");
  let parsed = JSON.parse(textContent.text);
  // Unwrap double-wrapped MCP format: [{ type: 'text', text: '...' }]
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === "text" && parsed[0]?.text) {
    parsed = JSON.parse(parsed[0].text);
  }
  return parsed as T;
}

function formatAxisLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

type Tone = "red" | "amber" | "green" | "blue" | "neutral";

function vesselTone(status: string): Tone {
  const v = status.toLowerCase();
  if (v.startsWith("align")) return "green";
  if (v.startsWith("watch")) return "amber";
  if (v.startsWith("off")) return "red";
  return "neutral";
}

function scoreTone(score: number): Tone {
  if (score >= 70) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function hypothesisTone(state: string): Tone {
  const v = state.toLowerCase();
  if (v === "supported") return "green";
  if (v === "refuted") return "red";
  if (v === "under_test") return "blue";
  return "neutral";
}

/** Post selected vessel names to the host so the chat model sees the selection. */
function postSelectionToHost(selectedNames: string[]) {
  try {
    window.parent.postMessage(
      { type: "viewer-state-update", state: { selectedVessels: selectedNames } },
      "*",
    );
  } catch {
    // Ignore postMessage failures
  }
}

// ─── Palette (mirrors QuarterlyViewer.palette) ───────────────────────────────

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

function toneColors(palette: Palette, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case "red":   return { fg: palette.red,     bg: palette.redBg };
    case "amber": return { fg: palette.amber,   bg: palette.amberBg };
    case "green": return { fg: palette.green,   bg: palette.greenBg };
    case "blue":  return { fg: palette.blue,    bg: palette.blueBg };
    default:      return { fg: palette.neutral, bg: palette.neutralBg };
  }
}

// ─── Section + Scorecard (mirror QuarterlyViewer) ────────────────────────────

function Section({
  title,
  subtitle,
  headerBg,
  children,
}: {
  title: string;
  subtitle?: string;
  headerBg: string;
  children: React.ReactNode;
}) {
  return (
    <Paper elevation={1} sx={{ mb: 2, overflow: "hidden" }}>
      <Box sx={{ p: 1.5, bgcolor: headerBg, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
      </Box>
      <Box sx={{ p: 1 }}>{children}</Box>
    </Paper>
  );
}

function Scorecard({ label, value, color, bg }: { label: string; value: number | string; color: string; bg: string }) {
  return (
    <Box
      sx={{
        minWidth: 130,
        p: 1.5,
        bgcolor: bg,
        borderRadius: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 1.5,
      }}
    >
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography
          variant="caption"
          sx={{ color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", lineHeight: 1.1 }}
        >
          {label}
        </Typography>
        <Typography variant="h4" sx={{ color, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Axis row ────────────────────────────────────────────────────────────────

function AxisRow({
  axisKey,
  axis,
  weight,
  description,
  palette,
}: {
  axisKey: string;
  axis: AxisScore;
  weight?: number;
  description?: string;
  palette: Palette;
}) {
  const [open, setOpen] = useState(false);
  const tone = scoreTone(axis.score);
  const { fg, bg } = toneColors(palette, tone);

  return (
    <Paper variant="outlined" sx={{ mb: 0.75, overflow: "hidden" }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 1,
          cursor: "pointer",
          "&:hover": { bgcolor: palette.surfaceBg },
        }}
      >
        <IconButton size="small" sx={{ p: 0.25 }} aria-label={open ? "Collapse axis" : "Expand axis"}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
          {formatAxisLabel(axisKey)}
        </Typography>
        <Box sx={{ width: 120 }}>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, axis.score))}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: "action.hover",
              "& .MuiLinearProgress-bar": { bgcolor: fg },
            }}
          />
        </Box>
        <Typography variant="body2" sx={{ minWidth: 32, textAlign: "right", fontWeight: 700, color: fg }}>
          {axis.score}
        </Typography>
        {weight !== undefined && (
          <Chip
            size="small"
            variant="outlined"
            label={`×${weight.toFixed(2)}`}
            sx={{ fontFamily: "monospace", fontSize: "0.7rem", minWidth: 56 }}
          />
        )}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: 1.5, bgcolor: bg }}>
          {description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, fontStyle: "italic" }}>
              {description}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mb: 1.5 }}>{axis.rationale}</Typography>
          {axis.provenance && axis.provenance.length > 0 && (
            <>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Provenance
              </Typography>
              <Stack spacing={0.75}>
                {axis.provenance.map((p, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1 }}>
                    <Typography variant="caption" sx={{ fontFamily: "monospace", color: palette.blue, wordBreak: "break-all", display: "block" }}>
                      {p.source}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.25 }}>{p.claim}</Typography>
                    {p.freshness && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", display: "block", mt: 0.25 }}>
                        {p.freshness}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── Vessel card ─────────────────────────────────────────────────────────────

function VesselCard({
  vessel,
  scoringAxes,
  selected,
  onToggleSelect,
  palette,
}: {
  vessel: Vessel;
  scoringAxes?: Record<string, ScoringAxisDef>;
  selected: boolean;
  onToggleSelect: () => void;
  palette: Palette;
}) {
  const initialOpen = vesselTone(vessel.status) !== "green";
  const [expanded, setExpanded] = useState(initialOpen);

  const tone = vesselTone(vessel.status);
  const scoreT = scoreTone(vessel.alignment);
  const toneFg = toneColors(palette, tone).fg;
  const toneBg = toneColors(palette, tone).bg;
  const scoreFg = toneColors(palette, scoreT).fg;

  const axisKeys = Object.keys(vessel.axes);
  const exp = vessel.assumptions?.expired ?? [];
  const age = vessel.assumptions?.ageing ?? [];
  const fre = vessel.assumptions?.fresh ?? [];
  const hyps = vessel.linkedHypotheses ?? [];
  const oq = vessel.openQuestions ?? [];

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        overflow: "hidden",
        borderColor: selected ? palette.blue : undefined,
        borderWidth: selected ? 2 : 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 1.25,
          cursor: "pointer",
          "&:hover": { bgcolor: palette.surfaceBg },
        }}
      >
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          aria-label={selected ? "Unpin vessel" : "Pin vessel for chat"}
          sx={{ p: 0.5, color: selected ? palette.blue : "text.secondary" }}
        >
          {selected ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
        </IconButton>
        <Box onClick={() => setExpanded((v) => !v)} sx={{ display: "flex", alignItems: "center", flex: 1, gap: 1.5, minWidth: 0 }}>
          <IconButton size="small" sx={{ p: 0.25 }} aria-label={expanded ? "Collapse vessel" : "Expand vessel"}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Box sx={{ width: 140, flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{vessel.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              IMO {vessel.imo}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", flexShrink: 0 }}>
            built {vessel.built} · {vessel.dwt.toLocaleString()} dwt
          </Typography>
          <Box sx={{ flex: 1, minWidth: 60 }}>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, Math.min(100, vessel.alignment))}
              sx={{
                height: 10,
                borderRadius: 5,
                bgcolor: "action.hover",
                "& .MuiLinearProgress-bar": { bgcolor: scoreFg },
              }}
            />
          </Box>
          <Box sx={{ width: 50, textAlign: "right", flexShrink: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: scoreFg }}>{vessel.alignment}%</Typography>
          </Box>
          <Chip
            size="small"
            label={vessel.status}
            sx={{
              bgcolor: toneBg,
              color: toneFg,
              fontWeight: 600,
              minWidth: 110,
              justifyContent: "center",
              flexShrink: 0,
            }}
          />
        </Box>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Divider />
        <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {axisKeys.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Scoring axes
              </Typography>
              {axisKeys.map((key) => (
                <AxisRow
                  key={key}
                  axisKey={key}
                  axis={vessel.axes[key]}
                  weight={scoringAxes?.[key]?.weight}
                  description={scoringAxes?.[key]?.description}
                  palette={palette}
                />
              ))}
            </Box>
          )}

          {(exp.length + age.length + fre.length) > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Assumptions
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {exp.map((a) => (
                  <Chip
                    key={a.id}
                    size="small"
                    label={`expired · ${a.label}`}
                    title={a.evidence || a.note || ""}
                    sx={{ bgcolor: palette.redBg, color: palette.red, fontWeight: 600 }}
                  />
                ))}
                {age.map((a) => (
                  <Chip
                    key={a.id}
                    size="small"
                    label={`ageing · ${a.label}`}
                    title={a.evidence || a.note || ""}
                    sx={{ bgcolor: palette.amberBg, color: palette.amber, fontWeight: 600 }}
                  />
                ))}
                {fre.map((a) => (
                  <Chip
                    key={a.id}
                    size="small"
                    label={`fresh · ${a.label}`}
                    title={a.evidence || a.note || ""}
                    sx={{ bgcolor: palette.greenBg, color: palette.green, fontWeight: 600 }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {hyps.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Linked hypotheses
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {hyps.map((h) => {
                  const t = hypothesisTone(h.state);
                  const { fg, bg } = toneColors(palette, t);
                  return (
                    <Chip
                      key={h.id}
                      size="small"
                      label={
                        <Box component="span">
                          {h.state.replace(/_/g, " ")} · {h.id.replace(/^hypothesis-/, "")}
                          {h.stale && (
                            <Box
                              component="span"
                              sx={{
                                ml: 0.5,
                                px: 0.5,
                                fontSize: "0.6rem",
                                bgcolor: palette.amberBg,
                                color: palette.amber,
                                borderRadius: 0.5,
                              }}
                            >
                              stale
                            </Box>
                          )}
                        </Box>
                      }
                      title={h.statement}
                      sx={{ bgcolor: bg, color: fg, fontWeight: 600 }}
                    />
                  );
                })}
              </Stack>
            </Box>
          )}

          {vessel.approachingGate && (
            <Box>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Approaching gate
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.25, bgcolor: palette.amberBg }}>
                <Typography variant="body2">
                  <strong>{vessel.approachingGate.kind}</strong> — opens {vessel.approachingGate.opensIso}
                  {" · "}
                  <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700, color: palette.amber }}>
                    {vessel.approachingGate.monthsAway} months
                  </Box>
                </Typography>
                {vessel.approachingGate.deferredItems.length > 0 && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                    {vessel.approachingGate.deferredItems.map((item) => (
                      <Chip key={item} size="small" label={item} variant="outlined" />
                    ))}
                  </Stack>
                )}
                {vessel.approachingGate.note && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, fontStyle: "italic" }}>
                    {vessel.approachingGate.note}
                  </Typography>
                )}
              </Paper>
            </Box>
          )}

          {oq.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                color="text.secondary"
              >
                Open questions
              </Typography>
              <Stack spacing={0.75}>
                {oq.map((q, i) => (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{ p: 1, bgcolor: palette.amberBg, borderLeft: 4, borderColor: palette.amber }}
                  >
                    <Typography variant="body2">{q}</Typography>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── Root component ──────────────────────────────────────────────────────────

function AlignmentApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [selectedVessels, setSelectedVessels] = useState<Set<string>>(new Set());

  const { app, error } = useApp({
    appInfo: { name: "Fleet Alignment", version: "1.0.0" },
    capabilities: {},
    // Disable SDK-driven autoResize: it reports both width and height from a
    // ResizeObserver, which causes the host to pin the iframe to a fixed pixel
    // width — the iframe then ignores host pane resizes. We report height only
    // (below), so the iframe keeps its initial width:100% and reflows with the
    // host pane.
    autoResize: false,
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.ontoolinput = async () => {};
      app.ontoolresult = async (result) => {
        setToolResult(result);
      };
      app.ontoolcancelled = () => {};
      app.onerror = console.error;
      app.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  // Size policy: NONE. The host (McpUIPreview) forces the iframe to
  // width:100% / height:100% of the preview pane and re-asserts that on
  // every style mutation. We therefore do not report size — sending pixel
  // dimensions would just trigger style fights with the host during a
  // splitter drag. `autoResize: false` (above) already disabled the
  // SDK's built-in ResizeObserver, so we're silent on this axis.

  const themeMode = (hostContext as any)?.theme === "dark" ? "dark" : "light";
  const isDark = themeMode === "dark";

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: { mode: isDark ? "dark" : "light" },
        typography: {
          // Roboto is loaded via @fontsource/roboto in global.css. We
          // declare it explicitly here so MUI doesn't fall through to
          // the platform default before the webfont is parsed.
          fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
        },
      }),
    [isDark],
  );

  const palette = useMemo(() => buildPalette(isDark), [isDark]);

  const report: AlignmentReport | null = useMemo(() => {
    if (!toolResult) return null;
    try {
      const parsed = extractJson<AlignmentReport>(toolResult);
      if (!parsed?.fleetSummary || !Array.isArray(parsed?.vessels)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [toolResult]);

  const handleToggleSelect = useCallback((name: string) => {
    setSelectedVessels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      postSelectionToHost([...next]);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedVessels(new Set());
    postSelectionToHost([]);
  }, []);

  const content = (() => {
    if (error) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">MCP App error: {error.message || String(error)}</Alert>
        </Box>
      );
    }
    if (!app) {
      return (
        <Box sx={{ p: 4, display: "flex", justifyContent: "center", color: "text.secondary" }}>
          <Typography variant="body2">Connecting…</Typography>
        </Box>
      );
    }
    if (!toolResult) {
      return (
        <Box sx={{ p: 4, display: "flex", justifyContent: "center", color: "text.secondary" }}>
          <Typography variant="body2">Waiting for alignment data…</Typography>
        </Box>
      );
    }
    if (!report) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">Failed to parse alignment report</Alert>
        </Box>
      );
    }

    const summary = report.fleetSummary;
    const selectedCount = selectedVessels.size;
    const weightedTone = scoreTone(summary.weightedFleetAlignment);
    const weightedFg = toneColors(palette, weightedTone).fg;

    return (
      <Box sx={{ width: "100%", minHeight: "100vh", bgcolor: palette.surfaceBg, p: 2, boxSizing: "border-box" }}>
        {/* Header card */}
        <Paper elevation={2} sx={{ p: 2.5, mb: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "flex-start" }}
            spacing={1}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Fleet alignment — {report.reportId}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontFamily: "monospace" }}>
                Run: {fmtDateTime(report.runDate)}
              </Typography>
              {report.mission && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Mission:</strong> {report.mission}
                </Typography>
              )}
              {report.strategy && (
                <Typography variant="body2" color="text.secondary">
                  <strong>Strategy:</strong> {report.strategy}
                </Typography>
              )}
            </Box>
            <Stack alignItems={{ md: "flex-end" }} spacing={1}>
              <Chip
                icon={
                  summary.criterionMet ? (
                    <CheckCircleOutlineIcon fontSize="small" />
                  ) : (
                    <ReportProblemIcon fontSize="small" />
                  )
                }
                label={summary.criterionMet ? "Acceptance met" : "Acceptance failed"}
                sx={{
                  bgcolor: summary.criterionMet ? palette.greenBg : palette.redBg,
                  color: summary.criterionMet ? palette.green : palette.red,
                  fontWeight: 600,
                }}
              />
              {summary.acceptanceCriterion && (
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                  {summary.acceptanceCriterion}
                </Typography>
              )}
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Scorecard label="Vessels"       value={summary.totalVessels}                 color={palette.neutral} bg={palette.neutralBg} />
            <Scorecard label="Aligned"       value={summary.aligned}                      color={palette.green}   bg={palette.greenBg} />
            <Scorecard label="Watch"         value={summary.watch}                        color={palette.amber}   bg={palette.amberBg} />
            <Scorecard label="Off-strategy"  value={summary.offStrategy}                  color={palette.red}     bg={palette.redBg} />
            <Scorecard label="Weighted alignment" value={`${summary.weightedFleetAlignment}%`} color={weightedFg}   bg={toneColors(palette, weightedTone).bg} />
          </Stack>

          {summary.driftFlags && summary.driftFlags.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Stack spacing={0.5}>
                {summary.driftFlags.map((flag, i) => (
                  <Typography
                    key={i}
                    variant="body2"
                    color="text.secondary"
                    sx={{ pl: 2, position: "relative", "&::before": { content: '"▸"', position: "absolute", left: 0, color: palette.amber } }}
                  >
                    {flag}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </Paper>

        {selectedCount > 0 && (
          <Alert
            severity="info"
            sx={{ mb: 2, alignItems: "center" }}
            action={
              <Button color="inherit" size="small" onClick={handleClearSelection}>
                Clear
              </Button>
            }
          >
            {selectedCount} vessel{selectedCount > 1 ? "s" : ""} pinned — visible to chat
          </Alert>
        )}

        {/* Vessels */}
        <Section title="Vessels" subtitle={`${report.vessels.length} scored`} headerBg={palette.headerBg}>
          <Stack spacing={0}>
            {report.vessels.map((v) => (
              <VesselCard
                key={v.imo}
                vessel={v}
                scoringAxes={report.scoringAxes}
                selected={selectedVessels.has(v.name)}
                onToggleSelect={() => handleToggleSelect(v.name)}
                palette={palette}
              />
            ))}
          </Stack>
        </Section>

        {/* Hard-rule compliance */}
        {report.hardRuleCompliance && Object.keys(report.hardRuleCompliance).length > 0 && (
          <Section
            title="Hard-rule compliance"
            subtitle="The four no-silent-default guarantees"
            headerBg={palette.headerBg}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={32}></TableCell>
                  <TableCell width={260}>Rule</TableCell>
                  <TableCell>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(report.hardRuleCompliance).map(([key, rule]) => (
                  <TableRow key={key} sx={{ "&:nth-of-type(odd)": { bgcolor: palette.surfaceBg } }}>
                    <TableCell>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          color: rule.compliant ? palette.green : palette.red,
                          textAlign: "center",
                        }}
                      >
                        {rule.compliant ? "✓" : "✗"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>{key}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{rule.note || ""}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        )}

        {/* Agent notes */}
        {report.agentNotes && report.agentNotes.length > 0 && (
          <Section title="Agent notes" subtitle="What the agent surfaces; the human decides." headerBg={palette.headerBg}>
            <Stack spacing={1}>
              {report.agentNotes.map((n, i) => (
                <Paper
                  key={i}
                  variant="outlined"
                  sx={{ p: 1.25, borderLeft: 3, borderLeftColor: palette.neutral, bgcolor: "background.paper" }}
                >
                  <Typography variant="body2" color="text.secondary">{n}</Typography>
                </Paper>
              ))}
            </Stack>
          </Section>
        )}
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

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AlignmentApp />
  </StrictMode>,
);
