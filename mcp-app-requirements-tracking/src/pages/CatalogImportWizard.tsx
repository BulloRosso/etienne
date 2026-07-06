/**
 * P-07 Catalog Import Wizard — three steps: point at an uploaded DOCX →
 * review proposed entries (converted preview left, segmentation cards right
 * with scope extraction and merge suggestions) → publish. Unassigned sections
 * are shown, not silently dropped.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { ProposalDecisionBar } from "../components/ProposalDecisionBar";
import type { DecideResult, Proposal } from "../types";

export function CatalogImportWizard() {
  const { app, project, refreshSummary } = useAppCtx();
  const [path, setPath] = useState("");
  const [importId, setImportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [unassigned, setUnassigned] = useState<Array<{ heading: string; note: string }>>([]);

  const loadImport = useCallback(
    async (id: string) => {
      try {
        const result = await callTool<any>(app, "rt_get_import", {
          projectName: project,
          importId: id,
        });
        setConverted(result.convertedMarkdown ?? "");
        setProposals((result.proposals ?? []).filter((p: Proposal) => p.status === "proposed"));
        setUnassigned(result.unassigned ?? []);
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project],
  );

  // resume the latest open import session on mount
  useEffect(() => {
    if (!app || !project) return;
    void (async () => {
      try {
        const result = await callTool<{ proposals: Proposal[] }>(app, "rt_list_proposals", {
          projectName: project,
          kind: "catalog_import",
          status: "proposed",
        });
        const latest = result.proposals?.[result.proposals.length - 1];
        if (latest?.payload?.importId) {
          setImportId(latest.payload.importId);
          await loadImport(latest.payload.importId);
        }
      } catch {
        // no open import
      }
    })();
  }, [app, project, loadImport]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await callTool<any>(app, "rt_start_catalog_import", {
        projectName: project,
        path,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setImportId(result.importId);
        await loadImport(result.importId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, path, loadImport]);

  const decide = useCallback(
    async (proposal: Proposal, decision: string): Promise<DecideResult> => {
      const result = await callTool<DecideResult>(app, "rt_decide_proposal", {
        projectName: project,
        proposalId: proposal.id,
        decision,
      });
      if (result.success || result.conflict) {
        setProposals((prev) => prev.filter((entry) => entry.id !== proposal.id));
        refreshSummary();
      }
      return result;
    },
    [app, project, refreshSummary],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Box sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            fullWidth
            label="Project-relative DOCX path (e.g. documents/leistungsbeschreibung-kundenportal.docx)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <Button
            variant="contained"
            disabled={busy || !path}
            startIcon={busy ? <CircularProgress size={14} /> : undefined}
            onClick={() => void start()}
          >
            Convert & segment
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Box>
      <Divider />

      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: converted preview */}
        <Box sx={{ flex: 1, p: 2, overflow: "auto", borderRight: 1, borderColor: "divider" }}>
          <Typography variant="overline" color="text.secondary">
            Converted document {importId ? `(${importId})` : ""}
          </Typography>
          {converted ? (
            <ReactMarkdown>{converted}</ReactMarkdown>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No conversion yet.
            </Typography>
          )}
        </Box>

        {/* Right: segmentation cards */}
        <Box sx={{ flex: 1, p: 2, overflow: "auto" }}>
          <Typography variant="overline" color="text.secondary">
            Proposed entries ({proposals.length})
          </Typography>
          <Stack spacing={1.5}>
            {proposals.map((proposal) => (
              <Paper key={proposal.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    {proposal.payload?.title}
                  </Typography>
                  {proposal.payload?.catalog_action === "update_of" && (
                    <Chip label={`update of ${proposal.payload?.existing_key}`} size="small" color="info" />
                  )}
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }} useFlexGap flexWrap="wrap">
                  {(proposal.payload?.tags ?? []).map((tag: string) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" />
                  ))}
                </Stack>
                {(proposal.payload?.scope?.excluded?.length ?? 0) > 0 && (
                  <Alert severity="warning" icon={false} sx={{ mb: 0.5, py: 0 }}>
                    Nicht Bestandteil: {proposal.payload.scope.excluded.join("; ")}
                  </Alert>
                )}
                {proposal.payload?.merge_hint && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Merge hint: {proposal.payload.merge_hint}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ maxHeight: 90, overflow: "hidden", textOverflow: "ellipsis", my: 0.5 }}
                >
                  {(proposal.payload?.body_markdown ?? "").slice(0, 320)}…
                </Typography>
                <ProposalDecisionBar
                  actions={[
                    { decision: "published", label: "Publish as new entry", color: "success" },
                    ...(proposal.payload?.existing_key
                      ? [{ decision: "merged_as_version", label: `New version of ${proposal.payload.existing_key}`, color: "primary" as const }]
                      : []),
                    { decision: "rejected", label: "Reject", color: "error" },
                  ]}
                  onDecide={(decision) => decide(proposal, decision)}
                />
              </Paper>
            ))}
          </Stack>

          {unassigned.length > 0 && (
            <>
              <Typography variant="overline" color="text.secondary" sx={{ mt: 2, display: "block" }}>
                Unassigned sections (not dropped)
              </Typography>
              {unassigned.map((section, index) => (
                <Typography key={index} variant="body2" color="text.secondary">
                  • {section.heading} — {section.note}
                </Typography>
              ))}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
