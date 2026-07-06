/**
 * P-06 Service Catalog — search + tag filter, entry list, detail with rendered
 * markdown, four-column scope panel, version history with diffs, usage view,
 * and a simple draft editor with publish.
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
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useState } from "react";
import { callTool } from "../api";
import { useAppCtx } from "../app-context";
import { EarsDiff } from "../components/EarsDiff";
import { useNav } from "../nav";

const SCOPE_LABELS: Record<string, string> = {
  included: "Enthalten",
  excluded: "Nicht Bestandteil",
  prerequisites: "Voraussetzungen",
  deliverables: "Liefergegenstände",
};

export function ServiceCatalog() {
  const { app, project } = useAppCtx();
  const { navigate } = useNav();
  const [services, setServices] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [bundle, setBundle] = useState<any | null>(null);
  const [tab, setTab] = useState<"body" | "scope" | "versions" | "edit">("body");
  const [error, setError] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await callTool<{ services: any[] }>(app, "rt_list_services", {
        projectName: project,
        q: query || undefined,
      });
      setServices(result.services ?? []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, query]);

  useEffect(() => {
    if (app && project) void load();
  }, [app, project, load]);

  const open = useCallback(
    async (serviceId: string) => {
      try {
        const result = await callTool<any>(app, "rt_get_service", {
          projectName: project,
          serviceId,
        });
        if (result.error) setError(result.error);
        else {
          setBundle(result);
          setDraftBody(result.bodyMarkdown ?? "");
          setDraftTags((result.version?.tags ?? []).join(", "));
          setTab("body");
        }
      } catch (err: any) {
        setError(err.message);
      }
    },
    [app, project],
  );

  const saveDraft = useCallback(async () => {
    if (!bundle) return;
    try {
      const result = await callTool<any>(app, "rt_save_service_draft", {
        projectName: project,
        serviceId: bundle.service.id,
        bodyMarkdown: draftBody,
        tags: draftTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      if (result.error) setError(result.error);
      else await open(bundle.service.id);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, bundle, draftBody, draftTags, open]);

  const publish = useCallback(async () => {
    if (!bundle) return;
    const draft = bundle.versions?.find((version: any) => version.status === "draft");
    if (!draft) {
      setError("No draft version to publish — save a draft first.");
      return;
    }
    try {
      const result = await callTool<any>(app, "rt_publish_service_version", {
        projectName: project,
        serviceId: bundle.service.id,
        versionNo: draft.versionNo,
      });
      if (result.error) setError(result.error);
      else await open(bundle.service.id);
    } catch (err: any) {
      setError(err.message);
    }
  }, [app, project, bundle, open]);

  return (
    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: list */}
      <Paper square elevation={0} sx={{ width: 300, borderRight: 1, borderColor: "divider", p: 1.5, overflow: "auto" }}>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
          <Button size="small" onClick={() => navigate("catalog-import")}>
            Import
          </Button>
        </Stack>
        <List dense>
          {services.map((service) => (
            <ListItemButton
              key={service.id}
              selected={bundle?.service?.id === service.id}
              onClick={() => void open(service.id)}
            >
              <ListItemText
                primary={`${service.id} · ${service.title}`}
                secondary={service.currentVersion ? `v${service.currentVersion.versionNo} · ${service.currentVersion.tags.join(", ")}` : "no published version"}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Right: detail */}
      <Box sx={{ flex: 1, p: 2, overflow: "auto" }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {!bundle && (
          <Typography variant="body2" color="text.secondary">
            Select a catalog entry.
          </Typography>
        )}
        {bundle && (
          <>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6">{bundle.service.title}</Typography>
              <Chip label={bundle.service.id} size="small" sx={{ fontFamily: "monospace" }} />
              <Chip label={`v${bundle.version.versionNo} ${bundle.version.status}`} size="small" color={bundle.version.status === "published" ? "success" : "default"} />
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary">
                mapped in {bundle.usage?.mappings ?? 0} places
              </Typography>
              <Button size="small" variant="outlined" onClick={() => void publish()}>
                Publish draft
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ my: 0.5 }}>
              {bundle.version.tags.map((tag: string) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" />
              ))}
            </Stack>

            <Tabs value={tab} onChange={(_, value) => setTab(value)}>
              <Tab value="body" label="Body" />
              <Tab value="scope" label="Scope" />
              <Tab value="versions" label={`Versions (${bundle.versions.length})`} />
              <Tab value="edit" label="Edit draft" />
            </Tabs>
            <Divider sx={{ mb: 1.5 }} />

            {tab === "body" && (
              <Box sx={{ "& img": { maxWidth: "100%" } }}>
                <ReactMarkdown>{bundle.bodyMarkdown}</ReactMarkdown>
              </Box>
            )}

            {tab === "scope" && (
              <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                {Object.entries(SCOPE_LABELS).map(([key, label]) => (
                  <Paper key={key} variant="outlined" sx={{ p: 1.5, minWidth: 220, flex: 1 }}>
                    <Typography variant="subtitle2" color={key === "excluded" ? "error" : undefined} gutterBottom>
                      {label}
                    </Typography>
                    {(bundle.version.scope?.[key] ?? []).map((item: string, index: number) => (
                      <Typography key={index} variant="body2">
                        • {item}
                      </Typography>
                    ))}
                    {(bundle.version.scope?.[key] ?? []).length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}

            {tab === "versions" && (
              <Stack spacing={1}>
                {bundle.versions.map((version: any, index: number) => (
                  <Paper key={version.versionNo} variant="outlined" sx={{ p: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={`v${version.versionNo}`}
                        size="small"
                        color={version.status === "published" ? "success" : "default"}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {version.status} {version.publishedAt ? `· ${version.publishedAt.slice(0, 10)} · ${version.publishedBy}` : ""}
                        {" · "}source: {version.source}
                      </Typography>
                    </Stack>
                    {index > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        <EarsDiff
                          before={(bundle.versions[index - 1].tags ?? []).join(", ") + " | " + JSON.stringify(bundle.versions[index - 1].scope)}
                          after={(version.tags ?? []).join(", ") + " | " + JSON.stringify(version.scope)}
                        />
                      </Box>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}

            {tab === "edit" && (
              <Stack spacing={1.5}>
                <TextField
                  label="Tags (comma-separated)"
                  size="small"
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                />
                <TextField
                  label="Body markdown"
                  multiline
                  minRows={14}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
                <Box>
                  <Button variant="contained" onClick={() => void saveDraft()}>
                    Save as draft version
                  </Button>
                </Box>
              </Stack>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
