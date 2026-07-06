/**
 * P-13 Admin & Audit — agent runs (pipeline, prompt version/hash, model,
 * outcome) and derived usage aggregates per pipeline.
 */
import {
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { KpiTiles } from "../components/Common";

interface AgentRun {
  id: string;
  pipeline: string;
  promptVersion: string;
  promptHash?: string;
  model: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: string;
  proposalIds?: string[];
}

export function AdminAudit() {
  const { app, project } = useAppCtx();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [pipeline, setPipeline] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await callTool<{ runs: AgentRun[] }>(app, "rt_get_agent_runs", {
        projectName: project,
        pipeline: pipeline || undefined,
      });
      setRuns((result.runs ?? []).slice().reverse());
    } catch {
      setRuns([]);
    }
  }, [app, project, pipeline]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  const pipelines = useMemo(() => [...new Set(runs.map((run) => run.pipeline))], [runs]);
  const byOutcome = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const run of runs) counts[run.outcome ?? "running"] = (counts[run.outcome ?? "running"] ?? 0) + 1;
    return counts;
  }, [runs]);

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Agent runs ({runs.length})
        </Typography>
        <TextField
          select
          size="small"
          label="Pipeline"
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">all</MenuItem>
          {pipelines.map((name) => (
            <MenuItem key={name} value={name}>
              {name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <KpiTiles
        tiles={Object.entries(byOutcome).map(([outcome, count]) => ({
          label: outcome,
          value: count,
          color: outcome === "failed" ? "#d32f2f" : undefined,
        }))}
      />

      <Paper variant="outlined" sx={{ mt: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Run</TableCell>
              <TableCell>Pipeline</TableCell>
              <TableCell>Prompt</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Outcome</TableCell>
              <TableCell>Proposals</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id} hover>
                <TableCell sx={{ fontFamily: "monospace" }}>{run.id}</TableCell>
                <TableCell>{run.pipeline}</TableCell>
                <TableCell>
                  {run.promptVersion}
                  {run.promptHash ? ` (${run.promptHash.slice(0, 8)})` : ""}
                </TableCell>
                <TableCell>{run.model}</TableCell>
                <TableCell>{run.startedAt?.replace("T", " ").slice(0, 19)}</TableCell>
                <TableCell>
                  <Chip
                    label={run.outcome ?? "running"}
                    size="small"
                    color={run.outcome === "ok" ? "success" : run.outcome === "failed" ? "error" : "default"}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{run.proposalIds?.length ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
