/**
 * P-08 Drift Inbox — the product's core screen. Cards with before/after EARS
 * diff (word-level highlight), verbatim evidence quote with source and date,
 * scope recommendation badge with rationale, and the three-way decision
 * (in-scope / change order / reject-or-clarify). CONFLICT cards visually block
 * and require a resolution note before approval.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { BeforeAfter } from "../components/EarsDiff";
import { EvidenceQuote } from "../components/EvidenceQuote";
import { ConfidenceBar, ScopeBadge } from "../components/Common";
import { ProposalDecisionBar } from "../components/ProposalDecisionBar";
import { ReqLink } from "../nav";
import type { DecideResult, Proposal } from "../types";

const DRIFT_KINDS = ["drift", "progress_update", "acceptance_signal"];

const CLASSIFICATION_COLORS: Record<string, "default" | "info" | "warning" | "error" | "success"> = {
  MODIFICATION: "warning",
  NEW_REQUIREMENT: "info",
  RELAXATION_OR_REMOVAL: "info",
  CONFLICT: "error",
  CONFIRMATION: "success",
  CLARIFICATION_NEEDED: "default",
  PROGRESS_UPDATE: "info",
  ACCEPTANCE_SIGNAL: "success",
};

export function DriftInbox() {
  const { app, project, refreshSummary, events } = useAppCtx();
  const [cards, setCards] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ proposal: Proposal; decision: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const lists = await Promise.all(
        DRIFT_KINDS.map((kind) =>
          callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
            projectName: project,
            kind,
            status: "proposed",
          }),
        ),
      );
      const merged = lists.flatMap((list) => list.proposals ?? []);
      merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      setCards(merged);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  // new cards appear via the polled event feed
  useEffect(() => {
    if (events.some((event) => event.type === "proposal.new" || event.type === "proposal.evidence-attached")) {
      void load();
    }
  }, [events, load]);

  const decide = useCallback(
    async (proposal: Proposal, decision: string, resolutionNote?: string): Promise<DecideResult> => {
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: proposal.id,
        decision,
        resolutionNote,
      });
      if (result.success || result.conflict) {
        setCards((prev) => prev.filter((card) => card.id !== proposal.id));
        refreshSummary();
      }
      if (result.blocked) {
        // conflict guard: needs a resolution note in the same decision (spec §12.9)
        setNoteFor({ proposal, decision });
      }
      return result;
    },
    [app, project, refreshSummary],
  );

  const decideWithNote = useCallback(async () => {
    if (!noteFor) return;
    const result = await decide(noteFor.proposal, noteFor.decision, note);
    if (result.success) {
      setNoteFor(null);
      setNote("");
    }
  }, [noteFor, note, decide]);

  const actionsFor = (card: Proposal) => {
    if (card.kind === "acceptance_signal") {
      return [
        { decision: "confirmed_acceptance", label: "Confirm Abnahme", color: "success" as const },
        { decision: "rejected", label: "Reject", color: "error" as const },
      ];
    }
    if (card.kind === "progress_update") {
      return [
        { decision: "noted", label: "Note", color: "primary" as const },
        { decision: "rejected", label: "Dismiss", color: "error" as const },
      ];
    }
    if (card.classification === "CONFLICT") {
      return [
        { decision: "approved", label: "Confirm conflict", color: "error" as const },
        { decision: "rejected", label: "No conflict", color: "primary" as const },
      ];
    }
    if (card.classification === "CONFIRMATION") {
      return [
        { decision: "noted", label: "Note confirmation", color: "success" as const },
        { decision: "rejected", label: "Dismiss", color: "error" as const },
      ];
    }
    if (card.classification === "CLARIFICATION_NEEDED") {
      return [
        { decision: "clarify", label: "Needs clarification", color: "warning" as const },
        { decision: "rejected", label: "Dismiss", color: "error" as const },
      ];
    }
    return [
      { decision: "in_scope", label: "Accept in-scope", color: "success" as const },
      { decision: "change_order", label: "Accept as CHANGE ORDER", color: "warning" as const },
      { decision: "clarify", label: "Reject / clarify", color: "error" as const },
    ];
  };

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {cards.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Drift inbox is empty — upload minutes or an email in the Tender Workspace, or paste one
          into Quick Capture.
        </Typography>
      )}
      <Stack spacing={2}>
        {cards.map((card) => {
          const isConflict = card.classification === "CONFLICT";
          const potentials = (card.payload?.conflict_checks ?? []) as any[];
          return (
            <Paper
              key={card.id}
              variant="outlined"
              sx={{
                p: 2,
                borderColor: isConflict ? "error.main" : undefined,
                borderWidth: isConflict ? 2 : 1,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                {isConflict && <ReportProblemIcon color="error" fontSize="small" />}
                <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                  {card.id}
                </Typography>
                <Chip
                  label={card.classification ?? card.kind}
                  size="small"
                  color={CLASSIFICATION_COLORS[card.classification ?? ""] ?? "default"}
                />
                {card.decisionStatus && (
                  <Chip label={card.decisionStatus} size="small" variant="outlined" />
                )}
                {card.affectedRequirementIds.map((reqId) => (
                  <ReqLink key={reqId} reqId={reqId} />
                ))}
                <Box sx={{ flex: 1 }} />
                <ScopeBadge assessment={card.scopeAssessment} />
                <ConfidenceBar value={card.confidence} />
              </Stack>

              {card.payload?.diff && (
                <Box sx={{ mb: 1 }}>
                  <BeforeAfter
                    before={card.payload.diff.before_ears_text}
                    after={card.payload.diff.after_ears_text}
                  />
                </Box>
              )}
              {card.payload?.new_requirement && (
                <Alert severity="info" icon={false} sx={{ mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    New requirement
                  </Typography>
                  <Typography variant="body2">{card.payload.new_requirement.ears_text}</Typography>
                </Alert>
              )}
              {card.payload?.conflict && (
                <Alert severity="error" sx={{ mb: 1 }}>
                  Conflicts with{" "}
                  <ReqLink reqId={card.payload.conflict.conflicting_requirement_id} />:{" "}
                  {card.payload.conflict.nature}
                </Alert>
              )}
              {card.payload?.clarification_question_draft && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  Draft question: {card.payload.clarification_question_draft}
                </Alert>
              )}

              <EvidenceQuote evidence={card.evidence} />

              {card.scopeRationale && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {card.scopeRationale}
                </Typography>
              )}

              {potentials.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Conflict cross-check flagged:{" "}
                  {potentials.map((check: any) => check.requirement_id).join(", ")} — approval
                  requires a resolution note.
                </Alert>
              )}

              <Box sx={{ mt: 1.5 }}>
                <ProposalDecisionBar
                  actions={actionsFor(card)}
                  onDecide={(decision) => decide(card, decision)}
                />
              </Box>
            </Paper>
          );
        })}
      </Stack>

      {/* Resolution-note dialog (conflict guard, spec §12.9) */}
      <Dialog open={noteFor !== null} onClose={() => setNoteFor(null)}>
        <DialogTitle>Resolve flagged conflicts in the same decision</DialogTitle>
        <DialogContent sx={{ pt: "12px !important", minWidth: 460 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The conflict cross-check flagged related requirements. State how the conflict is
            resolved; the note is stored on the decision.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Resolution note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteFor(null)}>Cancel</Button>
          <Button variant="contained" color="warning" disabled={!note} onClick={() => void decideWithNote()}>
            Decide with note
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
