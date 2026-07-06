/**
 * P-05 Response Builder — section tree left, editor right. Trace chips (REQ +
 * SVC ids) come from the drafted markdown's <!-- trace --> markers; [MISSING]
 * placeholders render as warning chips; export is blocked (with the blocker
 * list) while placeholders or conflicts remain.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  List,
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
import SaveIcon from "@mui/icons-material/Save";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callTool, postHostAction } from "../api";
import { useAppCtx } from "../app-context";
import { ReqLink } from "../nav";

interface Section {
  id: string;
  title: string;
  order: number;
  instructions?: string;
  allocatedRequirementIds: string[];
  currentVersionNo: number;
  body: string;
  missing: string[];
}

export function ResponseBuilder() {
  const { app, project } = useAppCtx();
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newReqIds, setNewReqIds] = useState("");

  const selected = sections.find((section) => section.id === selectedId) ?? null;

  const load = useCallback(async () => {
    try {
      const result = await callTool<{ sections: Section[] }>(app, "rt_get_response_sections", {
        projectName: project,
      });
      setSections(result.sections ?? []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  useEffect(() => {
    setDraft(selected?.body ?? "");
  }, [selectedId, selected?.currentVersionNo]);

  const traces = useMemo(() => {
    const matches = [...draft.matchAll(/<!--\s*trace:\s*([^>]*?)-->/g)];
    const ids = new Set<string>();
    for (const match of matches) {
      for (const token of match[1].split(/[|,]/)) {
        const id = token.trim();
        if (/^REQ-\d+/.test(id)) ids.add(id);
      }
    }
    return [...ids];
  }, [draft]);

  const createSection = useCallback(async () => {
    try {
      await callTool(app, "rt_create_response_section", {
        projectName: project,
        title: newTitle,
        allocatedRequirementIds: newReqIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      });
      setNewTitle("");
      setNewReqIds("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, newTitle, newReqIds, load]);

  const draftSection = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await callTool<any>(app, "rt_draft_section", {
        projectName: project,
        sectionId: selected.id,
      });
      if (result.error) setError(result.error);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project, selected, load]);

  const save = useCallback(async () => {
    if (!selected) return;
    try {
      await callTool(app, "rt_save_section", {
        projectName: project,
        sectionId: selected.id,
        markdown: draft,
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, selected, draft, load]);

  const exportDocx = useCallback(async () => {
    setBusy(true);
    setBlockers(null);
    try {
      const result = await callTool<any>(app, "rt_export_response", { projectName: project });
      if (result.blocked) setBlockers(result.blockers ?? []);
      else if (result.path) postHostAction("open-host-preview", { path: result.path });
      else if (result.error) setError(result.error);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [app, project]);

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: section tree */}
      <Paper square elevation={0} sx={{ width: 280, borderRight: 1, borderColor: "divider", p: 1.5, overflow: "auto" }}>
        <Button fullWidth size="small" startIcon={<FileDownloadIcon />} variant="contained" disabled={busy} onClick={() => void exportDocx()}>
          Export response DOCX
        </Button>
        <List dense sx={{ mt: 1 }}>
          {sections.map((section) => (
            <ListItemButton
              key={section.id}
              selected={selectedId === section.id}
              onClick={() => setSelectedId(section.id)}
            >
              <ListItemText
                primary={`${section.id} · ${section.title}`}
                secondary={`v${section.currentVersionNo}${section.missing.length > 0 ? ` · ${section.missing.length} MISSING` : ""}`}
              />
            </ListItemButton>
          ))}
        </List>
        <Divider sx={{ my: 1 }} />
        <Typography variant="caption" color="text.secondary">
          New section
        </Typography>
        <TextField size="small" fullWidth placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} sx={{ my: 0.5 }} />
        <TextField size="small" fullWidth placeholder="REQ-001, REQ-002…" value={newReqIds} onChange={(e) => setNewReqIds(e.target.value)} sx={{ mb: 0.5 }} />
        <Button size="small" startIcon={<AddIcon />} disabled={!newTitle} onClick={() => void createSection()}>
          Add
        </Button>
      </Paper>

      {/* Right: editor */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2, overflow: "hidden" }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {blockers && (
          <Alert severity="warning" onClose={() => setBlockers(null)} sx={{ mb: 1 }}>
            Export blocked:{" "}
            {blockers.map((blocker, index) => (
              <span key={index}>
                [{blocker.kind}] {blocker.ref}: {blocker.detail}{" "}
              </span>
            ))}
          </Alert>
        )}
        {!selected ? (
          <Typography variant="body2" color="text.secondary">
            Select or create a section.
          </Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ flex: 1 }}>
                {selected.title}
              </Typography>
              <Button size="small" startIcon={<AutoAwesomeIcon />} disabled={busy} onClick={() => void draftSection()}>
                Draft (P-RESP-D)
              </Button>
              <Button size="small" startIcon={<SaveIcon />} disabled={draft === selected.body} onClick={() => void save()}>
                Save v{selected.currentVersionNo + 1}
              </Button>
            </Stack>

            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
              {selected.allocatedRequirementIds.map((reqId) => (
                <ReqLink key={reqId} reqId={reqId} />
              ))}
              {traces
                .filter((reqId) => !selected.allocatedRequirementIds.includes(reqId))
                .map((reqId) => (
                  <ReqLink key={reqId} reqId={reqId} />
                ))}
              {selected.missing.map((placeholder, index) => (
                <Chip key={index} label={`MISSING: ${placeholder}`} size="small" color="error" />
              ))}
            </Stack>

            <TextField
              multiline
              fullWidth
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              sx={{
                flex: 1,
                "& .MuiInputBase-root": { height: "100%", alignItems: "flex-start", fontFamily: "monospace", fontSize: 13 },
              }}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
