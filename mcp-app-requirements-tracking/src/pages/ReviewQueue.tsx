/**
 * P-03 Review Queue (extraction) — split view: source section with the
 * originating sentence highlighted (left), proposed requirement card (right).
 * Keyboard-first: A approve, E edit inline, R reject, arrows navigate.
 * Ambiguities tab groups flagged cards; bulk approve covers high-confidence,
 * ambiguity-free cards (server enforces the same rule).
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { ConfidenceBar, ModalityChip } from "../components/Common";
import { EvidenceQuote } from "../components/EvidenceQuote";
import { ProposalDecisionBar } from "../components/ProposalDecisionBar";
import { SectionHighlight } from "../components/SectionHighlight";
import type { DecideResult, DocumentSection, Proposal } from "../types";

export function ReviewQueue() {
  const { app, project, refreshSummary } = useAppCtx();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"all" | "ambiguities">("all");
  const [section, setSection] = useState<DocumentSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
        projectName: project,
        kind: "extraction",
        status: "proposed",
      });
      setProposals(result.proposals ?? []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  const visible = useMemo(
    () =>
      tab === "ambiguities"
        ? proposals.filter((p) => (p.payload?.ambiguities?.length ?? 0) > 0)
        : proposals,
    [proposals, tab],
  );
  const current = visible[Math.min(selected, Math.max(visible.length - 1, 0))] ?? null;

  // load the source section for the provenance highlight
  useEffect(() => {
    setSection(null);
    if (!current || !app) return;
    void (async () => {
      try {
        const result = await callTool<{ proposal: Proposal; section: DocumentSection | null }>(
          app,
          "rt_get_proposal",
          { projectName: project, proposalId: current.id },
        );
        setSection(result.section);
      } catch {
        setSection(null);
      }
    })();
  }, [current?.id, app, project]);

  useEffect(() => {
    setEditing(false);
    setEditedText(current?.payload?.ears_text ?? "");
  }, [current?.id]);

  const decide = useCallback(
    async (decision: string): Promise<DecideResult> => {
      if (!current) return { success: false, error: "No card selected" };
      const edits =
        editing && editedText !== current.payload?.ears_text
          ? { earsText: editedText }
          : undefined;
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: current.id,
        decision,
        edits,
      });
      if (result.success || result.conflict) {
        setProposals((prev) => prev.filter((p) => p.id !== current.id));
        setSelected((prev) => Math.max(0, Math.min(prev, visible.length - 2)));
        refreshSummary();
      }
      return result;
    },
    [app, project, current, editing, editedText, visible.length, refreshSummary],
  );

  const bulkApprove = useCallback(async () => {
    setBulkBusy(true);
    try {
      await callTool(app, "rt_bulk_decide", {
        projectName: project,
        kind: "extraction",
        decision: "approved",
        minConfidence: 0.85,
      });
      await load();
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }, [app, project, load, refreshSummary]);

  // keyboard shortcuts (disabled while a text field has focus)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key === "ArrowDown" || event.key === "j") {
        setSelected((prev) => Math.min(prev + 1, visible.length - 1));
      } else if (event.key === "ArrowUp" || event.key === "k") {
        setSelected((prev) => Math.max(prev - 1, 0));
      } else if (event.key.toLowerCase() === "a") {
        void decide("approved");
      } else if (event.key.toLowerCase() === "r") {
        void decide("rejected");
      } else if (event.key.toLowerCase() === "e") {
        setEditing((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible.length, decide]);

  const ambiguityCount = proposals.filter(
    (p) => (p.payload?.ambiguities?.length ?? 0) > 0,
  ).length;

  return (
    <Box ref={containerRef} sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: source pane */}
      <Box sx={{ flex: 5, borderRight: 1, borderColor: "divider", overflow: "hidden" }}>
        {section ? (
          <SectionHighlight
            text={section.text}
            quote={current?.payload?.source?.quote ?? current?.evidence?.quote}
            headingPath={`${section.documentId} · ${section.headingPath} · p.${section.pageFrom}`}
          />
        ) : (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {current ? "Loading source section…" : "No card selected."}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Right: card stack */}
      <Box sx={{ flex: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ px: 2, pt: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <Tabs value={tab} onChange={(_, value) => { setTab(value); setSelected(0); }} sx={{ flex: 1 }}>
            <Tab value="all" label={`Queue (${proposals.length})`} />
            <Tab value="ambiguities" label={`Ambiguities (${ambiguityCount})`} />
          </Tabs>
          <Tooltip title="Bulk-approve confidence ≥ 0.85 without ambiguities">
            <span>
              <Button
                size="small"
                startIcon={<DoneAllIcon />}
                disabled={bulkBusy || proposals.length === 0}
                onClick={() => void bulkApprove()}
              >
                Bulk approve
              </Button>
            </span>
          </Tooltip>
        </Box>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, my: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {current ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                  {current.id} · {current.payload?.temp_id}
                </Typography>
                <Chip label={current.payload?.ears_pattern} size="small" variant="outlined" />
                <Chip label={current.payload?.category} size="small" variant="outlined" />
                {current.payload?.modality && <ModalityChip modality={current.payload.modality} />}
                <Box sx={{ flex: 1 }} />
                <ConfidenceBar value={current.confidence} />
              </Stack>

              {editing ? (
                <TextField
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  multiline
                  fullWidth
                  size="small"
                  label="EARS text (edited before approval)"
                  sx={{ my: 1 }}
                />
              ) : (
                <Typography variant="body1" sx={{ my: 1 }}>
                  {current.payload?.ears_text}
                </Typography>
              )}

              <EvidenceQuote
                evidence={
                  current.evidence ?? {
                    quote: current.payload?.source?.quote ?? "",
                    location: current.payload?.source?.section,
                  }
                }
              />

              {(current.payload?.quantities?.length ?? 0) > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {current.payload.quantities.map((quantity: any, index: number) => (
                    <Chip
                      key={index}
                      size="small"
                      label={`${quantity.value} ${quantity.unit} (${quantity.kind})`}
                    />
                  ))}
                </Stack>
              )}

              {(current.payload?.ambiguities?.length ?? 0) > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  {current.payload.ambiguities.map((ambiguity: any, index: number) => (
                    <Alert key={index} severity="warning" sx={{ mb: 0.5 }}>
                      <b>{ambiguity.type}</b>: {ambiguity.note}
                      {ambiguity.clarification_question_draft && (
                        <Typography variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>
                          Bieterfrage: {ambiguity.clarification_question_draft}
                        </Typography>
                      )}
                    </Alert>
                  ))}
                </Box>
              )}

              {(current.payload?.merge_candidates?.length ?? 0) > 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Possible duplicate of: {current.payload.merge_candidates.join(", ")}
                </Alert>
              )}

              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                <ProposalDecisionBar
                  actions={[
                    { decision: "approved", label: editing ? "Approve edited (A)" : "Approve (A)", color: "success" },
                    { decision: "rejected", label: "Reject (R)", color: "error" },
                  ]}
                  onDecide={decide}
                />
                <Button size="small" onClick={() => setEditing((prev) => !prev)}>
                  {editing ? "Cancel edit (E)" : "Edit (E)"}
                </Button>
              </Box>
            </Paper>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Queue is empty — run an extraction from the Tender Workspace.
            </Typography>
          )}
        </Box>

        {/* Card navigator */}
        <Divider />
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 0.5, gap: 1 }}>
          <IconButton size="small" onClick={() => setSelected((prev) => Math.max(prev - 1, 0))}>
            <KeyboardArrowUpIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setSelected((prev) => Math.min(prev + 1, visible.length - 1))}
          >
            <KeyboardArrowDownIcon />
          </IconButton>
          <Typography variant="caption" color="text.secondary">
            {visible.length > 0 ? `${Math.min(selected + 1, visible.length)} / ${visible.length}` : "0 / 0"} ·
            keys: ↑↓ navigate · A approve · E edit · R reject
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
