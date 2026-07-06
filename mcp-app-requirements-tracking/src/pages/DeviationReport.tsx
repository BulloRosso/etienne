/**
 * P-11 Deviation Report — parameter bar, KPI tiles, editable executive summary,
 * expandable thread list (rows link to P-09), snapshot history, DOCX export
 * opened via the host preview bridge.
 */
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import AssessmentIcon from "@mui/icons-material/Assessment";
import { useCallback, useEffect, useState } from "react";
import { callTool, postHostAction } from "../api";
import { useAppCtx } from "../app-context";
import { KpiTiles, ImplStatusChip } from "../components/Common";
import { EarsDiff } from "../components/EarsDiff";
import { ReqLink } from "../nav";

interface ReportListEntry {
  id: string;
  generatedAt: string;
  generatedBy: string;
  params: any;
  exportPath?: string;
}

export function DeviationReport() {
  const { app, project, tender, refreshSummary } = useAppCtx();
  const [reports, setReports] = useState<ReportListEntry[]>([]);
  const [bundle, setBundle] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<string>("");
  const [editingSummary, setEditingSummary] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const result = await callTool<{ reports: ReportListEntry[] }>(app, "rt_list_reports", {
        projectName: project,
      });
      setReports((result.reports ?? []).slice().reverse());
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void loadList();
  }, [app, project, loadList]);

  const open = useCallback(
    async (reportId: string) => {
      try {
        const result = await callTool<any>(app, "rt_get_report", {
          projectName: project,
          reportId,
        });
        if (result.error) setError(result.error);
        else {
          setBundle(result);
          setSummaryDraft(result.narrative?.executive_summary ?? "");
        }
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project],
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await callTool<{ success: boolean; report: { id: string } }>(
        app,
        "rt_generate_deviation_report",
        { projectName: project, sinceBaseline: tender?.baselineLabel },
      );
      await loadList();
      await open(result.report.id);
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, tender, loadList, open, refreshSummary]);

  const saveSummary = useCallback(async () => {
    if (!bundle) return;
    try {
      const narrative = { ...(bundle.narrative ?? { change_lines: [], attention_items: [] }), executive_summary: summaryDraft };
      await callTool(app, "rt_edit_report_narrative", {
        projectName: project,
        reportId: bundle.report.id,
        narrative,
      });
      setBundle({ ...bundle, narrative });
      setEditingSummary(false);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, bundle, summaryDraft]);

  const exportDocx = useCallback(async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      const result = await callTool<{ success: boolean; path?: string; error?: string }>(
        app,
        "rt_generate_export",
        { projectName: project, kind: "deviation", ref: bundle.report.id },
      );
      if (result.path) {
        postHostAction("open-host-preview", { path: result.path });
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, bundle]);

  const data = bundle?.data;

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: snapshot history + generate */}
      <Paper square elevation={0} sx={{ width: 260, borderRight: 1, borderColor: "divider", p: 1.5, overflow: "auto" }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} /> : <AssessmentIcon />}
          disabled={busy}
          onClick={() => void generate()}
        >
          Generate report
        </Button>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          since baseline {tender?.baselineLabel ?? "—"}
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle2">Snapshots</Typography>
        <List dense>
          {reports.map((entry) => (
            <ListItemButton
              key={entry.id}
              selected={bundle?.report?.id === entry.id}
              onClick={() => void open(entry.id)}
            >
              <ListItemText
                primary={entry.id}
                secondary={`${entry.generatedAt?.slice(0, 16).replace("T", " ")} · ${entry.generatedBy}`}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Right: report */}
      <Box sx={{ flex: 1, p: 2, overflow: "auto" }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {!bundle && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Generate a report or open a snapshot.
          </Typography>
        )}
        {bundle && data && (
          <>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6">
                Deviation since {data.baselineLabel} — as of {data.asOf?.slice(0, 10)}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button size="small" startIcon={<FileDownloadIcon />} onClick={() => void exportDocx()}>
                Export DOCX
              </Button>
            </Stack>

            <KpiTiles
              tiles={[
                { label: "Changed", value: data.kpis.changed },
                { label: "Nachtrag", value: data.kpis.changedChangeOrders, color: "#ed6c02" },
                { label: "New", value: data.kpis.new },
                { label: "Relaxed", value: data.kpis.relaxed },
                { label: "Pending", value: data.kpis.pending },
                { label: "Conflicts", value: data.kpis.conflicts, color: data.kpis.conflicts > 0 ? "#d32f2f" : undefined },
                { label: "Shadow", value: data.kpis.shadow },
                { label: "Coverage gaps", value: data.kpis.coverageGaps },
              ]}
            />

            {/* Executive summary (editable) */}
            <Paper variant="outlined" sx={{ p: 1.5, my: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>
                  Executive summary
                </Typography>
                {editingSummary ? (
                  <>
                    <Button size="small" onClick={() => setEditingSummary(false)}>
                      Cancel
                    </Button>
                    <Button size="small" variant="contained" onClick={() => void saveSummary()}>
                      Save
                    </Button>
                  </>
                ) : (
                  <Button size="small" onClick={() => setEditingSummary(true)}>
                    Edit
                  </Button>
                )}
              </Stack>
              {editingSummary ? (
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  sx={{ mt: 1 }}
                />
              ) : (
                <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>
                  {bundle.narrative?.executive_summary ?? "(no narrative)"}
                </Typography>
              )}
            </Paper>

            {/* Attention items */}
            {(bundle.narrative?.attention_items?.length ?? 0) > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Needs a decision
                </Typography>
                {bundle.narrative.attention_items.map((item: any, index: number) => (
                  <Typography key={index} variant="body2">
                    <Chip label={item.kind} size="small" sx={{ mr: 1 }} /> {item.ref}: {item.line}
                  </Typography>
                ))}
              </Paper>
            )}

            {/* Threads */}
            <Typography variant="subtitle1" sx={{ mt: 1 }}>
              Requirement threads
            </Typography>
            {data.threads.map((thread: any) => (
              <Accordion key={thread.requirementId} disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                    <ReqLink reqId={thread.requirementId} />
                    <Chip
                      label={thread.kind}
                      size="small"
                      color={thread.kind === "changed" ? "warning" : thread.kind === "new" ? "info" : "default"}
                    />
                    <Typography variant="body2" noWrap sx={{ flex: 1, opacity: 0.8 }}>
                      {thread.currentText}
                    </Typography>
                    <ImplStatusChip status={thread.implementationStatus ?? undefined} />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {thread.baselineText && thread.kind === "changed" ? (
                    <EarsDiff before={thread.baselineText} after={thread.currentText} />
                  ) : (
                    <Typography variant="body2">{thread.currentText}</Typography>
                  )}
                  {thread.diffs.map((diff: any) => (
                    <Typography key={diff.versionNo} variant="caption" display="block" sx={{ mt: 0.5 }}>
                      v{diff.versionNo} · {diff.date?.slice(0, 10)} · {diff.decision ?? "—"}
                      {diff.decidedBy ? ` · ${diff.decidedBy}` : ""}
                      {diff.evidenceQuote ? ` · „${diff.evidenceQuote}“` : ""}
                    </Typography>
                  ))}
                </AccordionDetails>
              </Accordion>
            ))}

            {/* Coverage gaps */}
            {data.coverageGaps.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Coverage gaps (MUSS without implementation ticket)
                </Typography>
                {data.coverageGaps.map((gap: any) => (
                  <Stack key={gap.requirementId} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <ReqLink reqId={gap.requirementId} />
                    <Typography variant="body2" noWrap>
                      {gap.text}
                    </Typography>
                  </Stack>
                ))}
              </Paper>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
