/**
 * P-02 Tender Workspace — document list with parse/pipeline status, phase
 * stepper, KPI tiles, live activity feed (via rt_get_events polling).
 * Registering a document here triggers extraction (bid phase) or drift
 * (implementation phase).
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
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DescriptionIcon from "@mui/icons-material/Description";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { KpiTiles, PhaseStepper } from "../components/Common";
import type { TenderDocument } from "../types";

const PARSE_STATUS_COLOR: Record<string, "default" | "info" | "success" | "warning" | "error"> = {
  pending: "default",
  parsing: "info",
  parsed: "success",
  needs_ocr: "warning",
  failed: "error",
};

export function TenderWorkspace() {
  const { app, project, tender, counts, events, refreshSummary } = useAppCtx();
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regPath, setRegPath] = useState("");
  const [regTitle, setRegTitle] = useState("");
  const [regKind, setRegKind] = useState<"tender" | "artifact">("tender");
  const [regArtifactType, setRegArtifactType] = useState("minutes");
  const [busy, setBusy] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const result = await callTool<{ documents: TenderDocument[] }>(app, "rt_list_documents", {
        projectName: project,
      });
      setDocuments(result.documents ?? []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void loadDocuments();
  }, [app, project, loadDocuments]);

  // refresh the document list when pipeline events arrive
  useEffect(() => {
    const relevant = events.some((event) =>
      ["run.finished", "run.failed", "proposal.new"].includes(event.type),
    );
    if (relevant) void loadDocuments();
  }, [events, loadDocuments]);

  const startPipeline = useCallback(
    async (doc: TenderDocument) => {
      setError(null);
      try {
        if (doc.kind === "tender") {
          await callTool(app, "rt_start_extraction", { projectName: project, docId: doc.id });
        } else {
          await callTool(app, "rt_start_drift", { projectName: project, artifactId: doc.id });
        }
        refreshSummary();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project, refreshSummary],
  );

  const register = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await callTool(app, "rt_register_document", {
        projectName: project,
        path: regPath || undefined,
        title: regTitle || regPath.split("/").pop() || "Dokument",
        kind: regKind,
        artifactType: regKind === "artifact" ? regArtifactType : undefined,
      });
      setRegisterOpen(false);
      setRegPath("");
      setRegTitle("");
      await loadDocuments();
      refreshSummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, regPath, regTitle, regKind, regArtifactType, loadDocuments, refreshSummary]);

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <Box sx={{ flex: 1, p: 2, overflow: "auto" }}>
        <Typography variant="h6">{tender?.title ?? project}</Typography>
        <PhaseStepper tender={tender} />
        <KpiTiles
          tiles={[
            { label: "Documents", value: counts?.documents ?? 0 },
            { label: "Requirements", value: counts?.requirements ?? 0 },
            {
              label: "Open proposals",
              value: Object.values(counts?.openProposalsByKind ?? {}).reduce((a, b) => a + b, 0),
            },
            { label: "Conflicts", value: counts?.unresolvedConflicts ?? 0 },
          ]}
        />
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ my: 1 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
          <Typography variant="subtitle1">Documents & artifacts</Typography>
          <Button size="small" variant="outlined" onClick={() => setRegisterOpen(true)}>
            Register document
          </Button>
        </Box>
        <List dense>
          {documents.map((doc) => (
            <ListItem
              key={doc.id}
              divider
              secondaryAction={
                doc.parseStatus === "parsed" && (
                  <Button
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => void startPipeline(doc)}
                  >
                    {doc.kind === "tender" ? "Extract" : "Analyze drift"}
                  </Button>
                )
              }
            >
              <DescriptionIcon fontSize="small" sx={{ mr: 1, opacity: 0.6 }} />
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {doc.id}
                    </Typography>
                    <Typography variant="body2">{doc.title}</Typography>
                    <Chip
                      label={doc.parseStatus}
                      size="small"
                      color={PARSE_STATUS_COLOR[doc.parseStatus] ?? "default"}
                      variant="outlined"
                    />
                    {doc.kind === "artifact" && (
                      <Chip label={doc.artifactType ?? "artifact"} size="small" />
                    )}
                  </Stack>
                }
                secondary={doc.artifactDate ?? doc.uploadedAt?.slice(0, 10)}
              />
            </ListItem>
          ))}
          {documents.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No documents yet — register tender documents to start extraction.
            </Typography>
          )}
        </List>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Activity feed (polled) */}
      <Paper square elevation={0} sx={{ width: 320, p: 1.5, overflow: "auto" }}>
        <Typography variant="subtitle2" gutterBottom>
          Activity
        </Typography>
        {[...events].reverse().slice(0, 60).map((event) => (
          <Box key={event.seq} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {event.ts?.replace("T", " ").slice(0, 19)}
            </Typography>
            <Typography variant="body2">
              <b>{event.type}</b>{" "}
              {event.payload?.message ??
                event.payload?.proposalId ??
                event.payload?.requirementId ??
                event.payload?.docId ??
                ""}
            </Typography>
          </Box>
        ))}
        {events.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No activity yet.
          </Typography>
        )}
      </Paper>

      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Register document</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "16px !important" }}>
          <TextField
            label="Project-relative path (e.g. documents/leistungsbeschreibung.docx)"
            value={regPath}
            onChange={(e) => setRegPath(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label="Title"
            value={regTitle}
            onChange={(e) => setRegTitle(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            select
            label="Kind"
            value={regKind}
            onChange={(e) => setRegKind(e.target.value as any)}
            size="small"
          >
            <MenuItem value="tender">Tender document</MenuItem>
            <MenuItem value="artifact">Implementation artifact</MenuItem>
          </TextField>
          {regKind === "artifact" && (
            <TextField
              select
              label="Artifact type"
              value={regArtifactType}
              onChange={(e) => setRegArtifactType(e.target.value)}
              size="small"
            >
              <MenuItem value="email">Email</MenuItem>
              <MenuItem value="minutes">Meeting minutes</MenuItem>
              <MenuItem value="change_request">Change request</MenuItem>
              <MenuItem value="spec">Spec</MenuItem>
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy || !regPath} onClick={() => void register()}>
            Register & parse
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
