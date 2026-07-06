/**
 * P-09 Requirement Thread — the hub view: one vertical timeline per requirement
 * from tender quote through baseline, every approved diff (with in-scope /
 * Nachtrag badge and evidence), current version, mappings, linked issues with
 * live status, to acceptance. Every REQ id anywhere in the app links here.
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
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import GavelIcon from "@mui/icons-material/Gavel";
import LinkIcon from "@mui/icons-material/Link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { EarsDiff } from "../components/EarsDiff";
import { EvidenceQuote } from "../components/EvidenceQuote";
import { ImplStatusChip, ModalityChip } from "../components/Common";
import { ReqLink, useNav } from "../nav";
import type { Proposal, Requirement, RequirementRelation, RequirementVersion } from "../types";

interface ThreadVersionEntry {
  version: RequirementVersion;
  proposal: Proposal | null;
  inBaseline: string | null;
}

interface Thread {
  requirement: Requirement;
  versions: ThreadVersionEntry[];
  relations: RequirementRelation[];
  mappings: any[];
  links: Array<{ link: any; issue: any }>;
  statusHistory: Array<{ from: string | null; to: string; at: string }>;
}

const DECISION_BADGE: Record<string, { label: string; color: "success" | "warning" | "info" | "default" }> = {
  in_scope: { label: "in scope", color: "success" },
  change_order: { label: "NACHTRAG", color: "warning" },
  approved: { label: "approved", color: "info" },
};

export function RequirementThread() {
  const { app, project, refreshSummary } = useAppCtx();
  const { location } = useNav();
  const reqId = location.params.reqId;
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationKind, setRelationKind] = useState("depends_on");
  const [relationTarget, setRelationTarget] = useState("");
  const [resolveTarget, setResolveTarget] = useState<RequirementRelation | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const load = useCallback(async () => {
    if (!reqId) return;
    try {
      const result = await callTool<Thread | { error: string }>(app, "rt_get_requirement_thread", {
        projectName: project,
        reqId,
      });
      if ("error" in result) setError(result.error);
      else setThread(result);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, reqId]);

  useEffect(() => {
    if (app && project && reqId) void load();
  }, [app, project, reqId, load]);

  const accept = useCallback(async () => {
    try {
      const result = await callTool<{ success: boolean; error?: string }>(
        app,
        "rt_accept_requirement",
        { projectName: project, reqId },
      );
      if (!result.success) setError(result.error ?? "Acceptance failed");
      await load();
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, reqId, load, refreshSummary]);

  const createRelation = useCallback(async () => {
    try {
      await callTool(app, "rt_create_relation", {
        projectName: project,
        kind: relationKind,
        fromRequirementId: reqId,
        toRequirementId: relationTarget,
      });
      setRelationOpen(false);
      setRelationTarget("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, reqId, relationKind, relationTarget, load]);

  const resolveConflict = useCallback(async () => {
    if (!resolveTarget) return;
    try {
      await callTool(app, "rt_resolve_conflict", {
        projectName: project,
        relationId: resolveTarget.id,
        resolutionNote,
      });
      setResolveTarget(null);
      setResolutionNote("");
      await load();
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, resolveTarget, resolutionNote, load, refreshSummary]);

  if (!reqId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">No requirement selected.</Typography>
      </Box>
    );
  }
  if (!thread) {
    return (
      <Box sx={{ p: 3 }}>
        {error ? <Alert severity="error">{error}</Alert> : <Typography>Loading thread…</Typography>}
      </Box>
    );
  }

  const { requirement, versions } = thread;
  const first = versions[0];
  const current = versions[versions.length - 1];

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ fontFamily: "monospace" }}>
          {requirement.id}
        </Typography>
        <Chip label={requirement.status} size="small" color={requirement.status === "retired" ? "default" : "primary"} variant="outlined" />
        <ImplStatusChip status={requirement.implementationStatus} />
        {current?.version.modality && <ModalityChip modality={current.version.modality} />}
        <Box sx={{ flex: 1 }} />
        {requirement.status === "baselined" &&
          requirement.implementationStatus === "implemented" && (
            <Button size="small" variant="contained" color="success" startIcon={<GavelIcon />} onClick={() => void accept()}>
              Accept (Abnahme)
            </Button>
          )}
        <Button size="small" onClick={() => setRelationOpen(true)}>
          Add relation
        </Button>
      </Stack>

      {/* Timeline */}
      <Box sx={{ borderLeft: 2, borderColor: "divider", pl: 2, ml: 1 }}>
        {/* Tender source */}
        {first?.version.sourceRef?.quote && (
          <TimelineEntry title={`Tender clause — ${first.version.sourceRef.document ?? ""} ${first.version.sourceRef.section ?? ""} p.${first.version.sourceRef.page ?? "?"}`}>
            <EvidenceQuote evidence={{ quote: first.version.sourceRef.quote }} />
          </TimelineEntry>
        )}

        {/* Versions */}
        {versions.map((entry, index) => {
          const previous = index > 0 ? versions[index - 1] : null;
          const badge = entry.proposal?.decision ? DECISION_BADGE[entry.proposal.decision] : undefined;
          return (
            <TimelineEntry
              key={entry.version.id}
              title={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2">v{entry.version.versionNo}</Typography>
                  {entry.inBaseline && (
                    <Chip label={`baseline ${entry.inBaseline}`} size="small" color="info" />
                  )}
                  {badge && index > 0 && <Chip label={badge.label} size="small" color={badge.color} />}
                  <Typography variant="caption" color="text.secondary">
                    {entry.version.createdAt?.slice(0, 10)}
                  </Typography>
                </Stack>
              }
            >
              {previous ? (
                <EarsDiff before={previous.version.earsText} after={entry.version.earsText} />
              ) : (
                <Typography variant="body2">{entry.version.earsText}</Typography>
              )}
              {index > 0 && entry.proposal?.evidence && (
                <Box sx={{ mt: 1 }}>
                  <EvidenceQuote evidence={entry.proposal.evidence} />
                </Box>
              )}
              {entry.proposal?.scopeRationale && index > 0 && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {entry.proposal.scopeRationale}
                </Typography>
              )}
            </TimelineEntry>
          );
        })}

        {/* Relations */}
        {thread.relations.length > 0 && (
          <TimelineEntry title="Relations">
            <Stack spacing={0.5}>
              {thread.relations.map((relation) => {
                const other =
                  relation.fromRequirementId === reqId
                    ? relation.toRequirementId
                    : relation.fromRequirementId;
                const isOpenConflict =
                  relation.kind === "conflicts_with" && relation.status !== "resolved";
                return (
                  <Stack key={relation.id} direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={relation.kind.replace(/_/g, " ")}
                      size="small"
                      color={isOpenConflict ? "error" : "default"}
                      variant="outlined"
                    />
                    <ReqLink reqId={other} />
                    {isOpenConflict && (
                      <Button size="small" color="error" onClick={() => setResolveTarget(relation)}>
                        Resolve conflict
                      </Button>
                    )}
                    {relation.resolutionNote && (
                      <Typography variant="caption" color="text.secondary">
                        resolved: {relation.resolutionNote}
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </TimelineEntry>
        )}

        {/* Mappings */}
        {thread.mappings.length > 0 && (
          <TimelineEntry title="Mapped services">
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {thread.mappings.map((mapping) => (
                <Chip
                  key={mapping.id}
                  icon={<LinkIcon />}
                  label={`${mapping.serviceVersionId} (${mapping.coverage})${mapping.staleSince ? " · STALE" : ""}`}
                  size="small"
                  color={mapping.staleSince ? "warning" : "default"}
                  variant="outlined"
                />
              ))}
            </Stack>
          </TimelineEntry>
        )}

        {/* Linked issues */}
        {thread.links.length > 0 && (
          <TimelineEntry title="Linked issues">
            <Stack spacing={0.5}>
              {thread.links.map(({ link, issue }) => (
                <Stack key={link.id} direction="row" spacing={1} alignItems="center">
                  <Chip label={link.issueKey} size="small" sx={{ fontFamily: "monospace" }} />
                  <Typography variant="caption">{link.relationship}</Typography>
                  {issue && (
                    <Chip
                      label={issue.status}
                      size="small"
                      color={
                        issue.statusCategory === "done"
                          ? "success"
                          : issue.statusCategory === "in_progress"
                            ? "warning"
                            : "default"
                      }
                      variant="outlined"
                    />
                  )}
                  {link.staleSince && <Chip label="STALE" size="small" color="warning" />}
                  {issue && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 380 }}>
                      {issue.summary}
                    </Typography>
                  )}
                </Stack>
              ))}
            </Stack>
          </TimelineEntry>
        )}

        {/* Acceptance */}
        {requirement.implementationStatus === "accepted" && (
          <TimelineEntry
            title={
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="subtitle2">Accepted (Abnahme)</Typography>
              </Stack>
            }
          >
            <Typography variant="body2" color="text.secondary">
              {requirement.acceptedBy} · {requirement.acceptedAt?.slice(0, 10)}
            </Typography>
          </TimelineEntry>
        )}
      </Box>

      {/* Add-relation dialog */}
      <Dialog open={relationOpen} onClose={() => setRelationOpen(false)}>
        <DialogTitle>Add relation from {reqId}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px !important", minWidth: 360 }}>
          <TextField select size="small" label="Kind" value={relationKind} onChange={(e) => setRelationKind(e.target.value)}>
            <MenuItem value="depends_on">depends_on</MenuItem>
            <MenuItem value="refines">refines</MenuItem>
            <MenuItem value="derived_from_same_clause">derived_from_same_clause</MenuItem>
            <MenuItem value="conflicts_with">conflicts_with</MenuItem>
            <MenuItem value="merged_into">merged_into</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Target requirement id (e.g. REQ-012)"
            value={relationTarget}
            onChange={(e) => setRelationTarget(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRelationOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!relationTarget} onClick={() => void createRelation()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resolve-conflict dialog */}
      <Dialog open={resolveTarget !== null} onClose={() => setResolveTarget(null)}>
        <DialogTitle>Resolve conflict {resolveTarget?.id}</DialogTitle>
        <DialogContent sx={{ pt: "12px !important", minWidth: 420 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Resolution note (which requirement wins, and why)"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={!resolutionNote} onClick={() => void resolveConflict()}>
            Resolve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TimelineEntry({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, position: "relative" }}>
      <Box
        sx={{
          position: "absolute",
          left: -25,
          top: 18,
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: "primary.main",
        }}
      />
      {typeof title === "string" ? (
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
      ) : (
        <Box sx={{ mb: 0.5 }}>{title}</Box>
      )}
      <Divider sx={{ mb: 1 }} />
      {children}
    </Paper>
  );
}
