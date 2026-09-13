/**
 * Analyse-Cockpit — the one page of the tender-analysis showcase.
 *
 * Five stages, each with one status and at most one primary action, so a
 * viewer always knows where the process stands, what blocks it, and when the
 * management analysis can be produced with reliable content:
 *   1 Dokumente einlesen · 2 Anforderungen prüfen · 3 Widersprüche klären ·
 *   4 Abgleich mit Leistungskatalog · 5 Management-Analyse
 * The stage model (status, headline, blockers, readiness) is computed
 * server-side by rt_get_analysis_status; the page only renders and acts.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ReplayIcon from "@mui/icons-material/Replay";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import DescriptionIcon from "@mui/icons-material/Description";
import TableViewIcon from "@mui/icons-material/TableView";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useCallback, useEffect, useRef, useState } from "react";
import { callTool, postHostAction } from "../api";
import { useAppCtx } from "../app-context";
import { useNav } from "../nav";
import type { AnalysisAlertRow, AnalysisStage, AnalysisStatusPayload, StageStatus } from "../types";

const STAGE_TITLES: Record<AnalysisStage["id"], string> = {
  ingest: "Dokumente einlesen",
  review: "Anforderungen prüfen",
  contradictions: "Widersprüche klären",
  mapping: "Abgleich mit Leistungskatalog",
  report: "Management-Analyse",
};

const STAGE_STATUS: Record<StageStatus, { label: string; color: "default" | "info" | "warning" | "success" | "error" }> = {
  pending: { label: "offen", color: "default" },
  running: { label: "läuft", color: "info" },
  waiting: { label: "wartet auf Sie", color: "warning" },
  done: { label: "erledigt", color: "success" },
  blocked: { label: "blockiert", color: "default" },
  failed: { label: "fehlgeschlagen", color: "error" },
};

const RESOLUTION_LABEL: Record<string, string> = {
  tender: "Ausschreibungswert übernommen",
  excel: "Excel-Wert übernommen",
  clarify: "beim Kunden zu klären",
};

const UNIT_LABEL: Record<string, string> = {
  EUR: "€",
  m2: "m²",
  percent: "%",
  hour: "Std.",
  day: "Tage",
  month: "Monate",
  year: "Jahre",
  minute: "Min.",
  second: "s",
  count: "",
  unknown: "",
};

function formatValue(value: number, unit: string): string {
  const number = Number.isInteger(value)
    ? value.toLocaleString("de-DE")
    : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const suffix = UNIT_LABEL[unit] ?? unit;
  return suffix ? `${number} ${suffix}` : number;
}

const POLL_MS = 8000;

export function Analysis() {
  const { app, project, tender, events, refreshSummary } = useAppCtx();
  const { navigate } = useNav();
  const [status, setStatus] = useState<AnalysisStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const seenSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!app || !project) return;
    try {
      const result = await callTool<AnalysisStatusPayload>(app, "rt_get_analysis_status", { projectName: project });
      setStatus(result);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    void load();
  }, [load]);

  // live refresh: any analysis.* / proposal.decided event → re-fetch the server model
  useEffect(() => {
    const fresh = events.filter((event) => event.seq > seenSeqRef.current);
    if (fresh.length === 0) return;
    seenSeqRef.current = fresh[fresh.length - 1].seq;
    if (fresh.some((event) => event.type.startsWith("analysis.") || event.type === "proposal.decided" || event.type === "run.failed")) {
      void load();
    }
  }, [events, load]);

  // safety net while a phase runs (progress events can be dropped by the 5 s poll)
  const running = status?.state?.status === "running";
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [running, load]);

  const act = useCallback(
    async (key: string, fn: () => Promise<{ success?: boolean; started?: boolean; error?: string } | void>) => {
      setBusy(key);
      setError(null);
      try {
        const result = await fn();
        if (result && result.error && result.success === false) setError(result.error);
        if (result && result.error && result.started === false) setError(result.error);
        await load();
        refreshSummary();
      } catch (err: any) {
        setError(err.message);
      } finally {
        setBusy(null);
      }
    },
    [load, refreshSummary],
  );

  const startAnalysis = () =>
    act("start", () => callTool(app, "rt_run_tender_analysis", { projectName: project }));
  const continueAnalysis = () =>
    act("continue", () => callTool(app, "rt_continue_tender_analysis", { projectName: project }));
  const regenerate = () =>
    act("regenerate", () => callTool(app, "rt_regenerate_analysis_report", { projectName: project }));
  const resolve = (alert: AnalysisAlertRow, resolution: "tender" | "excel" | "clarify") =>
    act(`${alert.proposalId}:${alert.alertIndex}`, () =>
      callTool(app, "rt_resolve_consistency_alert", {
        projectName: project,
        proposalId: alert.proposalId,
        alertIndex: alert.alertIndex,
        resolution,
      }),
    );

  const state = status?.state ?? null;
  const stages = status?.stages ?? [];
  const readiness = status?.readiness;
  const currentStage = status?.currentStage ?? 1;
  const currentTitle = stages[currentStage - 1] ? STAGE_TITLES[stages[currentStage - 1].id] : STAGE_TITLES.ingest;
  const alerts = [...(status?.alerts ?? [])].sort((a, b) => Number(Boolean(a.resolution)) - Number(Boolean(b.resolution)));

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      <Typography variant="h5">{tender?.title ?? project}</Typography>
      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
        Sie sind in Schritt {currentStage} von 5: <b>{currentTitle}</b>
        {state ? ` · Lauf ${state.runId}` : ""}
      </Typography>

      {state && state.status === "running" && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <LinearProgress variant="determinate" value={state.percent} sx={{ height: 10, borderRadius: 5, mb: 0.5 }} />
          <Typography variant="body2">
            <b>{state.percent} %</b> · {state.stepLabel}
            {state.currentFile ? ` · ${state.currentFile}` : ""}
          </Typography>
          {state.message && (
            <Typography variant="caption" color="text.secondary">
              {state.message}
            </Typography>
          )}
        </Paper>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={1.5}>
        {(stages.length > 0 ? stages : []).map((stage, index) => (
          <StageCard key={stage.id} index={index + 1} stage={stage} active={index + 1 === currentStage}>
            {stage.id === "ingest" && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                  variant={state ? "outlined" : "contained"}
                  size="small"
                  startIcon={state ? <ReplayIcon /> : <PlayArrowIcon />}
                  disabled={busy !== null || running}
                  onClick={() => void startAnalysis()}
                >
                  {state ? "Erneut einlesen" : "Analyse starten"}
                </Button>
                {state && (
                  <Typography variant="caption" color="text.secondary">
                    Unveränderte Dateien werden übersprungen; neue Dateien in tender/ werden ergänzt.
                  </Typography>
                )}
              </Stack>
            )}

            {stage.id === "review" && (
              <Stack direction="row" spacing={1} alignItems="center">
                {readiness && readiness.openReviews > 0 && state && (
                  <LinearProgress
                    variant="determinate"
                    value={state.review.total ? ((state.review.approved + state.review.rejected) / state.review.total) * 100 : 0}
                    sx={{ width: 160, height: 8, borderRadius: 4 }}
                  />
                )}
                <Button
                  size="small"
                  variant={stage.status === "waiting" ? "contained" : "outlined"}
                  startIcon={<FactCheckIcon />}
                  disabled={!readiness?.phaseADone}
                  onClick={() => navigate("review-queue")}
                >
                  Zur Prüfung
                </Button>
              </Stack>
            )}

            {stage.id === "contradictions" && alerts.length > 0 && (
              <Stack spacing={1}>
                {alerts.map((alert) => (
                  <Paper
                    key={`${alert.proposalId}:${alert.alertIndex}`}
                    variant="outlined"
                    sx={{ p: 1.5, borderColor: alert.resolution ? undefined : "warning.main" }}
                  >
                    <Typography variant="subtitle2">
                      {alert.label}{" "}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({alert.proposalId})
                      </Typography>
                    </Typography>
                    <Typography variant="body2">
                      Ausschreibung: <b>{alert.tenderRaw}</b> · Excel: <b>{formatValue(alert.excelValue, alert.excelUnit)}</b> ({alert.sheet}!{alert.cell}) ·
                      Abweichung {alert.deviationPct.toLocaleString("de-DE")} %
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                      {alert.earsText}
                    </Typography>
                    {alert.resolution ? (
                      <Chip size="small" color="success" variant="outlined" label={RESOLUTION_LABEL[alert.resolution]} />
                    ) : (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" disabled={busy !== null} onClick={() => void resolve(alert, "tender")}>
                          Ausschreibungswert übernehmen
                        </Button>
                        <Tooltip title={alert.proposalStatus !== "proposed" ? "Nur möglich, solange die Karte noch nicht freigegeben ist" : ""}>
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={busy !== null || alert.proposalStatus !== "proposed"}
                              onClick={() => void resolve(alert, "excel")}
                            >
                              Excel-Wert übernehmen
                            </Button>
                          </span>
                        </Tooltip>
                        <Button size="small" variant="contained" color="warning" disabled={busy !== null} onClick={() => void resolve(alert, "clarify")}>
                          Beim Kunden klären
                        </Button>
                      </Stack>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}

            {stage.id === "mapping" && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                {state?.compliance ? (
                  <>
                    <Chip size="small" color="success" label={`erfüllt ${state.compliance.verdicts.FULL ?? 0}`} />
                    <Chip size="small" color="warning" label={`teilweise ${state.compliance.verdicts.PARTIAL ?? 0}`} />
                    <Chip size="small" color="error" label={`nicht erfüllt ${state.compliance.verdicts.NON_COMPLIANT ?? 0}`} />
                    <Chip size="small" color="info" label={`intern zu klären ${state.compliance.verdicts.NEEDS_INPUT ?? 0}`} />
                    <Button size="small" variant="outlined" startIcon={<TableViewIcon />} onClick={() => navigate("compliance-matrix")}>
                      Compliance-Matrix öffnen
                    </Button>
                  </>
                ) : (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    disabled={busy !== null || running || !readiness?.phaseB}
                    onClick={() => void continueAnalysis()}
                  >
                    Abgleich starten
                  </Button>
                )}
              </Stack>
            )}

            {stage.id === "report" && (
              <Stack spacing={1}>
                {state?.report && (
                  <Alert severity={readiness?.reliable ? "success" : "warning"} sx={{ py: 0 }}>
                    {readiness?.reliable
                      ? "Analyse belastbar — keine offenen Kundenklärungen und keine internen Rückfragen."
                      : `Analyse mit Vorbehalten: ${readiness?.clarifyForCustomer ?? 0} Kundenklärung(en), ${readiness?.internalQuestions ?? 0} interne Rückfrage(n)${
                          (readiness?.unresolvedAlerts ?? 0) > 0 ? `, ${readiness?.unresolvedAlerts} ungeklärte Widersprüche` : ""
                        }.`}
                  </Alert>
                )}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<DescriptionIcon />}
                    disabled={!state?.report}
                    onClick={() => state?.report && postHostAction("open-host-preview", { path: state.report.markdownPath })}
                  >
                    Bericht öffnen (MD)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DescriptionIcon />}
                    disabled={!state?.report?.docxPath}
                    onClick={() => state?.report?.docxPath && postHostAction("open-host-preview", { path: state.report.docxPath })}
                  >
                    Bericht öffnen (DOCX)
                  </Button>
                  <Button size="small" disabled={!state?.mapping || busy !== null || running} onClick={() => void regenerate()}>
                    Neu erzeugen
                  </Button>
                </Stack>
              </Stack>
            )}
          </StageCard>
        ))}
      </Stack>

      {state && (
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            startIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowDetails((prev) => !prev)}
          >
            Details
          </Button>
          <Collapse in={showDetails}>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Lauf {state.runId} · gestartet {state.startedAt.slice(0, 16).replace("T", " ")} · Status {state.status} · Phase {state.phase} ·
                Glossar {state.glossary.terms} Begriffe · Katalog {state.catalog.serviceIds.length} Services / {state.catalog.capabilities} EARS-Statements
                {state.catalog.reason ? ` (${state.catalog.reason})` : ""}
              </Typography>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Datei</TableCell>
                    <TableCell>Art</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Abschnitte</TableCell>
                    <TableCell align="right">Karten</TableCell>
                    <TableCell align="right">Kennzahlen</TableCell>
                    <TableCell align="right">Widersprüche</TableCell>
                    <TableCell>Hinweis</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {state.files.map((file) => (
                    <TableRow key={file.projectPath}>
                      <TableCell>{file.name}</TableCell>
                      <TableCell>{file.kind}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={file.status}
                          color={file.status === "failed" || file.status === "needs_ocr" ? "error" : file.status === "extracted" || file.status === "parsed" ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">{file.sections ?? ""}</TableCell>
                      <TableCell align="right">{file.proposals ?? ""}</TableCell>
                      <TableCell align="right">{file.figures ?? ""}</TableCell>
                      <TableCell align="right">{file.alerts ?? ""}</TableCell>
                      <TableCell>{file.error ?? file.reason ?? (file.pageSource === "estimated" ? "Seitenzahlen geschätzt" : "")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {state.errors.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {state.errors.map((entry, index) => (
                    <Alert key={index} severity="warning" sx={{ py: 0, mb: 0.5 }}>
                      <b>{entry.step}</b>
                      {entry.file ? ` · ${entry.file}` : ""}: {entry.error}
                    </Alert>
                  ))}
                </Box>
              )}
            </Paper>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}

function StageCard({
  index,
  stage,
  active,
  children,
}: {
  index: number;
  stage: AnalysisStage;
  active: boolean;
  children?: React.ReactNode;
}) {
  const meta = STAGE_STATUS[stage.status];
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        display: "flex",
        gap: 1.5,
        borderColor: active ? "primary.main" : undefined,
        borderWidth: active ? 2 : 1,
        opacity: stage.status === "blocked" ? 0.75 : 1,
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          bgcolor: stage.status === "done" ? "success.main" : active ? "primary.main" : "action.disabledBackground",
          color: stage.status === "done" || active ? "primary.contrastText" : "text.secondary",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontWeight: 600,
        }}
      >
        {index}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {STAGE_TITLES[stage.id]}
          </Typography>
          <Chip size="small" label={meta.label} color={meta.color} variant={stage.status === "done" ? "filled" : "outlined"} />
        </Stack>
        <Typography variant="body1">{stage.headline}</Typography>
        {stage.detail && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: children ? 1 : 0 }}>
            {stage.detail}
          </Typography>
        )}
        {children}
      </Box>
    </Paper>
  );
}
