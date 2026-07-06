/**
 * P-10 Link Review & shadow scope — proposed requirement↔issue links as cards
 * (issue left, candidate requirement right, confidence bar); shadow-scope cards
 * with the three-way action (link / mark internal / escalate to drift); stale-
 * link notices with the drafted tracker comment and one-click post.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { ConfidenceBar } from "../components/Common";
import { ProposalDecisionBar } from "../components/ProposalDecisionBar";
import { ReqLink } from "../nav";
import type { DecideResult, Proposal } from "../types";

interface StaleNotice {
  id: string;
  requirementId: string;
  issueKeys: string[];
  draftComment: string;
  postedAt?: string;
}

export function LinkReview() {
  const { app, project, refreshSummary, events } = useAppCtx();
  const [tab, setTab] = useState<"links" | "shadow" | "stale">("links");
  const [linkProposals, setLinkProposals] = useState<Proposal[]>([]);
  const [shadowProposals, setShadowProposals] = useState<Proposal[]>([]);
  const [notices, setNotices] = useState<StaleNotice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState("0.9");

  const load = useCallback(async () => {
    try {
      const [links, shadows, staleNotices] = await Promise.all([
        callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
          projectName: project,
          kind: "link",
          status: "proposed",
        }),
        callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
          projectName: project,
          kind: "shadow_scope",
          status: "proposed",
        }),
        callTool<{ notices: StaleNotice[] }>(app, "rt_list_stale_notices", {
          projectName: project,
        }),
      ]);
      setLinkProposals(links.proposals ?? []);
      setShadowProposals(shadows.proposals ?? []);
      setNotices((staleNotices.notices ?? []).filter((notice) => !notice.postedAt));
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  useEffect(() => {
    if (events.some((event) => ["proposal.new", "links.stale", "run.finished"].includes(event.type))) {
      void load();
    }
  }, [events, load]);

  const decide = useCallback(
    async (proposal: Proposal, decision: string): Promise<DecideResult> => {
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: proposal.id,
        decision,
      });
      if (result.success || result.conflict) {
        setLinkProposals((prev) => prev.filter((entry) => entry.id !== proposal.id));
        setShadowProposals((prev) => prev.filter((entry) => entry.id !== proposal.id));
        refreshSummary();
      }
      return result;
    },
    [app, project, refreshSummary],
  );

  const bulkApprove = useCallback(async () => {
    try {
      await callTool(app, "rt_bulk_decide", {
        projectName: project,
        kind: "link",
        decision: "linked",
        minConfidence: parseFloat(minConfidence) || 0.9,
      });
      await load();
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, minConfidence, load, refreshSummary]);

  const runBatch = useCallback(
    async (tool: string) => {
      try {
        await callTool(app, tool, { projectName: project });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project],
  );

  const postNotice = useCallback(
    async (notice: StaleNotice) => {
      try {
        await callTool(app, "rt_post_stale_notice", { projectName: project, noticeId: notice.id });
        setNotices((prev) => prev.filter((entry) => entry.id !== notice.id));
        refreshSummary();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project, refreshSummary],
  );

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} alignItems="center">
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ flex: 1 }}>
          <Tab value="links" label={`Link proposals (${linkProposals.length})`} />
          <Tab value="shadow" label={`Shadow scope (${shadowProposals.length})`} />
          <Tab value="stale" label={`Stale notices (${notices.length})`} />
        </Tabs>
        <Button size="small" startIcon={<PlayArrowIcon />} onClick={() => void runBatch("rt_run_link_batch")}>
          Run linking
        </Button>
        <Button size="small" startIcon={<SyncIcon />} onClick={() => void runBatch("rt_run_shadow_scan")}>
          Shadow scan
        </Button>
      </Stack>

      {tab === "links" && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
            <TextField
              size="small"
              label="Min confidence"
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
              sx={{ width: 130 }}
            />
            <Button size="small" variant="outlined" onClick={() => void bulkApprove()}>
              Bulk approve above threshold
            </Button>
          </Stack>
          <Stack spacing={1.5}>
            {linkProposals.map((proposal) => (
              <Paper key={proposal.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip
                    label={proposal.payload?.issue_key}
                    size="small"
                    sx={{ fontFamily: "monospace" }}
                  />
                  <Typography variant="body2">{proposal.payload?.relationship}</Typography>
                  <ReqLink reqId={proposal.payload?.requirement_id ?? ""} />
                  {proposal.payload?.matches_current === false && (
                    <Chip label="matches OLDER version" size="small" color="warning" />
                  )}
                  <Box sx={{ flex: 1 }} />
                  <ConfidenceBar value={proposal.confidence} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {proposal.payload?.rationale}
                </Typography>
                {proposal.payload?.issue_evidence && (
                  <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                    „{proposal.payload.issue_evidence}“
                  </Typography>
                )}
                <Box sx={{ mt: 1 }}>
                  <ProposalDecisionBar
                    actions={[
                      { decision: "linked", label: "Approve link", color: "success" },
                      { decision: "rejected", label: "Reject", color: "error" },
                    ]}
                    onDecide={(decision) => decide(proposal, decision)}
                  />
                </Box>
              </Paper>
            ))}
            {linkProposals.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No link proposals — run the linking pipeline.
              </Typography>
            )}
          </Stack>
        </>
      )}

      {tab === "shadow" && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {shadowProposals.map((proposal) => (
            <Paper key={proposal.id} variant="outlined" sx={{ p: 1.5, borderColor: "warning.main" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Chip
                  label={proposal.payload?.issue_key}
                  size="small"
                  color="warning"
                  sx={{ fontFamily: "monospace" }}
                />
                <Chip label={proposal.payload?.classification ?? "shadow"} size="small" variant="outlined" />
                <Box sx={{ flex: 1 }} />
                <ConfidenceBar value={proposal.confidence} />
              </Stack>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {proposal.payload?.functionality_summary}
              </Typography>
              {(proposal.payload?.origin_evidence ?? []).map((evidence: any, index: number) => (
                <Typography key={index} variant="caption" display="block" sx={{ fontStyle: "italic" }}>
                  „{evidence.quote}“ — {evidence.location}
                </Typography>
              ))}
              {(proposal.payload?.links?.length ?? 0) > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                  <Typography variant="caption">Candidate:</Typography>
                  {proposal.payload.links.map((link: any) => (
                    <ReqLink key={link.requirement_id} reqId={link.requirement_id} />
                  ))}
                </Stack>
              )}
              <Box sx={{ mt: 1 }}>
                <ProposalDecisionBar
                  actions={[
                    { decision: "linked", label: "Link to requirement", color: "success" },
                    { decision: "internal", label: "Mark internal", color: "primary" },
                    { decision: "escalated_to_drift", label: "Raise as drift", color: "warning" },
                    { decision: "rejected", label: "Dismiss", color: "error" },
                  ]}
                  onDecide={(decision) => decide(proposal, decision)}
                />
              </Box>
            </Paper>
          ))}
          {shadowProposals.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No shadow-scope cards — run the shadow scan over unlinked issues.
            </Typography>
          )}
        </Stack>
      )}

      {tab === "stale" && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {notices.map((notice) => (
            <Paper key={notice.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <ReqLink reqId={notice.requirementId} />
                {notice.issueKeys.map((key) => (
                  <Chip key={key} label={key} size="small" sx={{ fontFamily: "monospace" }} />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {notice.draftComment}
              </Typography>
              <Button size="small" variant="contained" onClick={() => void postNotice(notice)}>
                Post comment to tracker
              </Button>
            </Paper>
          ))}
          {notices.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No pending stale-link notices.
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}
