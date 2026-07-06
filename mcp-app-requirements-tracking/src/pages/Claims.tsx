/**
 * P-12 Claims — claim list, item selection from approved change-order diffs,
 * generated Nachtrag preview (baseline → change → evidence → approval trail
 * per item), pricing fields, DOCX export.
 */
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useCallback, useEffect, useState } from "react";
import { callTool, postHostAction } from "../api";
import { useAppCtx } from "../app-context";
import { EvidenceQuote } from "../components/EvidenceQuote";
import { ReqLink } from "../nav";
import type { Proposal } from "../types";

interface Claim {
  id: string;
  title: string;
  status: string;
  proposalIds: string[];
  narratives?: Record<string, string>;
  pricing?: Record<string, string>;
  exportPath?: string;
}

export function Claims() {
  const { app, project } = useAppCtx();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimable, setClaimable] = useState<Proposal[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await callTool<{ claims: Claim[]; claimable: Proposal[] }>(
        app,
        "rt_list_claims",
        { projectName: project },
      );
      setClaims(result.claims ?? []);
      setClaimable(result.claimable ?? []);
      if (selectedClaim) {
        const updated = result.claims?.find((claim) => claim.id === selectedClaim.id);
        if (updated) {
          setSelectedClaim(updated);
          setPricingDrafts(updated.pricing ?? {});
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, selectedClaim?.id]);

  useEffect(() => {
    if (app && project) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, project]);

  const createClaim = useCallback(async () => {
    try {
      const result = await callTool<{ claim: Claim }>(app, "rt_create_claim", {
        projectName: project,
        title: newTitle,
      });
      setNewTitle("");
      setSelectedClaim(result.claim);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, newTitle, load]);

  const addItems = useCallback(async () => {
    if (!selectedClaim || checked.size === 0) return;
    try {
      const result = await callTool<any>(app, "rt_add_claim_items", {
        projectName: project,
        claimId: selectedClaim.id,
        proposalIds: [...checked],
      });
      if (result.error) setError(result.error);
      setChecked(new Set());
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, selectedClaim, checked, load]);

  const generate = useCallback(async () => {
    if (!selectedClaim) return;
    setBusy(true);
    try {
      const result = await callTool<any>(app, "rt_generate_claim", {
        projectName: project,
        claimId: selectedClaim.id,
      });
      if (result.error) setError(result.error);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, selectedClaim, load]);

  const savePricingAndExport = useCallback(async () => {
    if (!selectedClaim) return;
    setBusy(true);
    try {
      await callTool(app, "rt_set_claim_pricing", {
        projectName: project,
        claimId: selectedClaim.id,
        pricing: pricingDrafts,
      });
      const result = await callTool<any>(app, "rt_export_claim", {
        projectName: project,
        claimId: selectedClaim.id,
      });
      if (result.path) postHostAction("open-host-preview", { path: result.path });
      else if (result.error) setError(result.error);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, selectedClaim, pricingDrafts, load]);

  const itemProposals = (claim: Claim): Proposal[] =>
    claim.proposalIds
      .map((pid) => claimable.find((proposal) => proposal.id === pid))
      .filter(Boolean) as Proposal[];

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: claims + claimable pool */}
      <Paper square elevation={0} sx={{ width: 320, borderRight: 1, borderColor: "divider", p: 1.5, overflow: "auto" }}>
        <Stack direction="row" spacing={1}>
          <TextField size="small" fullWidth placeholder="New claim title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Button size="small" startIcon={<AddIcon />} disabled={!newTitle} onClick={() => void createClaim()}>
            Add
          </Button>
        </Stack>
        <List dense>
          {claims.map((claim) => (
            <ListItemButton
              key={claim.id}
              selected={selectedClaim?.id === claim.id}
              onClick={() => {
                setSelectedClaim(claim);
                setPricingDrafts(claim.pricing ?? {});
              }}
            >
              <ListItemText primary={`${claim.id} · ${claim.title}`} secondary={`${claim.status} · ${claim.proposalIds.length} items`} />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle2" gutterBottom>
          Approved change orders
        </Typography>
        <List dense>
          {claimable.map((proposal) => (
            <ListItem
              key={proposal.id}
              disablePadding
              secondaryAction={
                <Checkbox
                  edge="end"
                  size="small"
                  checked={checked.has(proposal.id)}
                  disabled={selectedClaim?.proposalIds.includes(proposal.id)}
                  onChange={(event) => {
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(proposal.id);
                      else next.delete(proposal.id);
                      return next;
                    });
                  }}
                />
              }
            >
              <ListItemText
                primary={`${proposal.id} → ${proposal.affectedRequirementIds.join(", ")}`}
                secondary={proposal.evidence?.quote?.slice(0, 60)}
              />
            </ListItem>
          ))}
        </List>
        <Button size="small" variant="outlined" fullWidth disabled={!selectedClaim || checked.size === 0} onClick={() => void addItems()}>
          Add selected to {selectedClaim?.id ?? "claim"}
        </Button>
      </Paper>

      {/* Right: Nachtrag preview */}
      <Box sx={{ flex: 1, p: 2, overflow: "auto" }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {!selectedClaim ? (
          <Typography variant="body2" color="text.secondary">
            Select or create a claim, then add approved change orders.
          </Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                {selectedClaim.title}
              </Typography>
              <Chip label={selectedClaim.status} size="small" />
              <Button size="small" startIcon={<AutoAwesomeIcon />} disabled={busy || selectedClaim.proposalIds.length === 0} onClick={() => void generate()}>
                Generate narratives
              </Button>
              <Button size="small" variant="contained" startIcon={<FileDownloadIcon />} disabled={busy || selectedClaim.status === "draft"} onClick={() => void savePricingAndExport()}>
                Export Nachtrag
              </Button>
            </Stack>

            {itemProposals(selectedClaim).map((proposal, index) => (
              <Paper key={proposal.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">Position {index + 1}</Typography>
                  {proposal.affectedRequirementIds.map((reqId) => (
                    <ReqLink key={reqId} reqId={reqId} />
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    {proposal.decidedBy} · {proposal.decidedAt?.slice(0, 10)}
                  </Typography>
                </Stack>
                {selectedClaim.narratives?.[proposal.id] && (
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {selectedClaim.narratives[proposal.id]}
                  </Typography>
                )}
                {proposal.payload?.diff && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {proposal.payload.diff.before_ears_text} → {proposal.payload.diff.after_ears_text}
                  </Typography>
                )}
                <EvidenceQuote evidence={proposal.evidence} />
                <TextField
                  size="small"
                  label="Preis"
                  value={pricingDrafts[proposal.id] ?? ""}
                  onChange={(e) =>
                    setPricingDrafts((prev) => ({ ...prev, [proposal.id]: e.target.value }))
                  }
                  sx={{ mt: 1, width: 220 }}
                />
              </Paper>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
