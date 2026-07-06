/**
 * P-04 Compliance Matrix — one row per requirement: verdict chip, mapped-
 * service chips (drag a catalog service from the side panel onto a row =
 * manual mapping), evidence side panel, pending verdict proposals to approve.
 * Actions: run classification, run automap.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { ModalityChip } from "../components/Common";
import { ProposalDecisionBar } from "../components/ProposalDecisionBar";
import { ReqLink } from "../nav";
import type { DecideResult, Proposal } from "../types";

const VERDICT_COLOR: Record<string, "success" | "warning" | "error" | "info"> = {
  FULL: "success",
  PARTIAL: "warning",
  NON_COMPLIANT: "error",
  NEEDS_INPUT: "info",
};

interface MatrixRow {
  requirementId: string;
  earsText: string;
  modality: string;
  category: string;
  verdict: any | null;
  pendingVerdictProposal: string | null;
  mappings: any[];
  pendingMappingProposals: string[];
}

export function ComplianceMatrix() {
  const { app, project, refreshSummary, events } = useAppCtx();
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selected, setSelected] = useState<MatrixRow | null>(null);
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(null);
  const [mappingProposals, setMappingProposals] = useState<Proposal[]>([]);
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [matrix, catalog, pendingMappings] = await Promise.all([
        callTool<{ rows: MatrixRow[] }>(app, "rt_get_compliance_matrix", { projectName: project }),
        callTool<{ services: any[] }>(app, "rt_list_services", { projectName: project }),
        callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
          projectName: project,
          kind: "mapping",
          status: "proposed",
        }),
      ]);
      setRows(matrix.rows ?? []);
      setServices(catalog.services ?? []);
      setMappingProposals(pendingMappings.proposals ?? []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  useEffect(() => {
    if (events.some((event) => ["run.finished", "proposal.decided", "mapping.created"].includes(event.type))) {
      void load();
    }
  }, [events, load]);

  // load the pending verdict proposal for the selected row
  useEffect(() => {
    setPendingProposal(null);
    if (!selected?.pendingVerdictProposal || !app) return;
    void (async () => {
      try {
        const result = await callTool<{ proposal: Proposal }>(app, "rt_get_proposal", {
          projectName: project,
          proposalId: selected.pendingVerdictProposal,
        });
        setPendingProposal(result.proposal ?? null);
      } catch {
        setPendingProposal(null);
      }
    })();
  }, [selected?.pendingVerdictProposal, app, project]);

  const runPipeline = useCallback(
    async (tool: string) => {
      try {
        await callTool(app, tool, { projectName: project });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project],
  );

  const decideVerdict = useCallback(
    async (decision: string): Promise<DecideResult> => {
      if (!pendingProposal) return { success: false, error: "No pending verdict" };
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: pendingProposal.id,
        decision,
      });
      await load();
      refreshSummary();
      return result;
    },
    [app, project, pendingProposal, load, refreshSummary],
  );

  const decideMapping = useCallback(
    async (proposal: Proposal, decision: string): Promise<DecideResult> => {
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: proposal.id,
        decision,
      });
      await load();
      return result;
    },
    [app, project, load],
  );

  const dropMapping = useCallback(
    async (row: MatrixRow, serviceVersionId: string) => {
      try {
        await callTool(app, "rt_create_mapping", {
          projectName: project,
          requirementId: row.requirementId,
          serviceVersionId,
          coverage: "related",
        });
        await load();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project, load],
  );

  const assign = useCallback(async () => {
    if (!selected || !assignee) return;
    try {
      await callTool(app, "rt_assign_needs_input", {
        projectName: project,
        requirementId: selected.requirementId,
        assignee,
      });
      setAssignee("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, selected, assignee, load]);

  const columns: GridColDef[] = [
    {
      field: "requirementId",
      headerName: "REQ",
      width: 110,
      renderCell: (params) => <ReqLink reqId={params.value} />,
    },
    { field: "earsText", headerName: "Requirement", flex: 1 },
    {
      field: "modality",
      headerName: "Mod.",
      width: 90,
      renderCell: (params) => <ModalityChip modality={params.value} />,
    },
    {
      field: "verdict",
      headerName: "Verdict",
      width: 150,
      renderCell: (params) =>
        params.value ? (
          <Chip
            label={params.value.verdict}
            size="small"
            color={VERDICT_COLOR[params.value.verdict] ?? "default"}
          />
        ) : params.row.pendingVerdictProposal ? (
          <Chip label="pending" size="small" variant="outlined" />
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      field: "mappings",
      headerName: "Mapped services",
      width: 230,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5} sx={{ overflow: "hidden" }}>
          {(params.value ?? []).map((mapping: any) => (
            <Chip
              key={mapping.id}
              label={`${mapping.serviceVersionId.split("/")[0]} (${mapping.coverage})${mapping.staleSince ? "!" : ""}`}
              size="small"
              color={mapping.staleSince ? "warning" : "default"}
              variant="outlined"
            />
          ))}
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 1.5, overflow: "hidden" }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            Compliance matrix ({rows.length} requirements)
          </Typography>
          <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={() => void runPipeline("rt_run_automap")}>
            Auto-map
          </Button>
          <Button size="small" startIcon={<PlayArrowIcon />} onClick={() => void runPipeline("rt_run_compliance")}>
            Classify
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        <Box
          sx={{ flex: 1, minHeight: 0 }}
          onDragOver={(event) => event.preventDefault()}
        >
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.requirementId}
            density="compact"
            onRowClick={(params) => setSelected(params.row as MatrixRow)}
            slotProps={{
              row: {
                onDragOver: (event: any) => event.preventDefault(),
                onDrop: (event: any) => {
                  const serviceVersionId = event.dataTransfer?.getData("text/tt-service");
                  const reqId = event.currentTarget?.getAttribute("data-id");
                  const row = rows.find((entry) => entry.requirementId === reqId);
                  if (serviceVersionId && row) void dropMapping(row, serviceVersionId);
                },
              } as any,
            }}
          />
        </Box>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Right: evidence / decisions / catalog drag source */}
      <Box sx={{ width: 360, p: 1.5, overflow: "auto" }}>
        {selected ? (
          <>
            <Typography variant="subtitle2">{selected.requirementId}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {selected.earsText}
            </Typography>

            {selected.verdict && (
              <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                <Chip
                  label={selected.verdict.verdict}
                  size="small"
                  color={VERDICT_COLOR[selected.verdict.verdict] ?? "default"}
                  sx={{ mb: 0.5 }}
                />
                <Typography variant="body2">{selected.verdict.justification}</Typography>
                {selected.verdict.deviation && (
                  <Alert severity="warning" sx={{ mt: 0.5 }}>
                    Deviation: {selected.verdict.deviation}
                  </Alert>
                )}
                {selected.verdict.riskNote && (
                  <Typography variant="caption" color="error">
                    Risk: {selected.verdict.riskNote}
                  </Typography>
                )}
                {selected.verdict.verdict === "NEEDS_INPUT" && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Assign to…"
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    />
                    <Button size="small" onClick={() => void assign()}>
                      Assign
                    </Button>
                  </Stack>
                )}
              </Paper>
            )}

            {pendingProposal && (
              <Paper variant="outlined" sx={{ p: 1, mb: 1, borderColor: "info.main" }}>
                <Typography variant="caption">Proposed verdict</Typography>
                <Box>
                  <Chip
                    label={pendingProposal.payload?.verdict}
                    size="small"
                    color={VERDICT_COLOR[pendingProposal.payload?.verdict] ?? "default"}
                  />
                </Box>
                <Typography variant="body2" sx={{ my: 0.5 }}>
                  {pendingProposal.payload?.justification}
                </Typography>
                <ProposalDecisionBar
                  actions={[
                    { decision: "approved", label: "Approve verdict", color: "success" },
                    { decision: "rejected", label: "Reject", color: "error" },
                  ]}
                  onDecide={decideVerdict}
                />
              </Paper>
            )}

            {mappingProposals
              .filter((proposal) => proposal.payload?.requirement_id === selected.requirementId)
              .map((proposal) => (
                <Paper key={proposal.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
                  <Typography variant="caption">Proposed mapping</Typography>
                  <Typography variant="body2">
                    {proposal.payload?.service_id} v{proposal.payload?.service_version_no} —{" "}
                    {proposal.payload?.coverage}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    {proposal.payload?.rationale}
                  </Typography>
                  {proposal.payload?.gap_or_exclusion && (
                    <Alert severity="warning" sx={{ mb: 0.5 }}>
                      {proposal.payload.gap_or_exclusion}
                    </Alert>
                  )}
                  <ProposalDecisionBar
                    actions={[
                      { decision: "approved", label: "Approve", color: "success" },
                      { decision: "rejected", label: "Reject", color: "error" },
                    ]}
                    onDecide={(decision) => decideMapping(proposal, decision)}
                  />
                </Paper>
              ))}
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Select a row to see verdict, evidence and pending proposals.
          </Typography>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" gutterBottom>
          Catalog (drag onto a row to map)
        </Typography>
        <Stack spacing={0.5}>
          {services.map((service) => (
            <Chip
              key={service.id}
              label={`${service.id} · ${service.title}`}
              size="small"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  "text/tt-service",
                  service.currentVersion?.id ?? `${service.id}/v/1`,
                )
              }
              sx={{ justifyContent: "flex-start", cursor: "grab" }}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
