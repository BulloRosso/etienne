/**
 * TenderTrace — MCP App (React + MUI).
 *
 * One app, all 14 pages (P-01…P-14), internal navigation via NavContext:
 * cross-page deep links (every REQ id → thread) are impossible across sibling
 * iframes, so the whole product lives in one bundle. Which page opens first is
 * decided by the sentinel file (out/tendertrace/pages/<page>.tendertrace.json)
 * whose content the render tool echoes back.
 *
 * Backend I/O goes exclusively through MCP tool calls (App.callServerTool) —
 * the sandboxed iframe has no SSE, no host fetch. Live-ness comes from polling
 * rt_get_events (~5 s) plus refetch-after-own-mutation.
 */
import {
  Alert,
  AppBar,
  Box,
  CircularProgress,
  CssBaseline,
  IconButton,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HomeIcon from "@mui/icons-material/Home";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, extractJson } from "./api";
import { AppCtx, type AppCtxValue } from "./app-context";
import { NavProvider, PAGE_TITLES, useNav, type PageId } from "./nav";
import type { FeedEvent, RenderPayload, TenderCounts, TenderMeta } from "./types";
import { Dashboard } from "./pages/Dashboard";
import { TenderWorkspace } from "./pages/TenderWorkspace";
import { ReviewQueue } from "./pages/ReviewQueue";
import { RequirementThread } from "./pages/RequirementThread";
import { DriftInbox } from "./pages/DriftInbox";
import { QuickCapture } from "./pages/QuickCapture";
import { LinkReview } from "./pages/LinkReview";
import { DeviationReport } from "./pages/DeviationReport";
import { ComplianceMatrix } from "./pages/ComplianceMatrix";
import { ServiceCatalog } from "./pages/ServiceCatalog";
import { CatalogImportWizard } from "./pages/CatalogImportWizard";
import { ResponseBuilder } from "./pages/ResponseBuilder";
import { Claims } from "./pages/Claims";
import { AdminAudit } from "./pages/AdminAudit";

const EVENT_POLL_MS = 5000;

const VALID_PAGES: PageId[] = [
  "dashboard",
  "workspace",
  "review-queue",
  "compliance-matrix",
  "response-builder",
  "service-catalog",
  "catalog-import",
  "drift-inbox",
  "requirement-thread",
  "link-review",
  "deviation-report",
  "claims",
  "quick-capture",
  "admin-audit",
];

/** Placeholder for pages that arrive in later build phases. */
function ComingSoon({ page }: { page: PageId }) {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h6">{PAGE_TITLES[page]}</Typography>
      <Typography variant="body2" color="text.secondary">
        This page is part of a later build phase.
      </Typography>
    </Box>
  );
}

function PageSwitch() {
  const { location } = useNav();
  switch (location.page) {
    case "dashboard":
      return <Dashboard />;
    case "workspace":
      return <TenderWorkspace />;
    case "review-queue":
      return <ReviewQueue />;
    case "requirement-thread":
      return <RequirementThread />;
    case "drift-inbox":
      return <DriftInbox />;
    case "quick-capture":
      return <QuickCapture />;
    case "link-review":
      return <LinkReview />;
    case "deviation-report":
      return <DeviationReport />;
    case "compliance-matrix":
      return <ComplianceMatrix />;
    case "service-catalog":
      return <ServiceCatalog />;
    case "catalog-import":
      return <CatalogImportWizard />;
    case "response-builder":
      return <ResponseBuilder />;
    case "claims":
      return <Claims />;
    case "admin-audit":
      return <AdminAudit />;
    default:
      return <ComingSoon page={location.page} />;
  }
}

function Shell() {
  const { location, back, canGoBack, navigate } = useNav();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Tooltip title="Back">
            <span>
              <IconButton size="small" disabled={!canGoBack} onClick={back}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Dashboard">
            <IconButton size="small" onClick={() => navigate("dashboard")}>
              <HomeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            TenderTrace — {PAGE_TITLES[location.page]}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <PageSwitch />
      </Box>
    </Box>
  );
}

function TenderTraceApp() {
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [tender, setTender] = useState<TenderMeta | null>(null);
  const [counts, setCounts] = useState<TenderCounts | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const lastSeqRef = useRef(0);
  const appRef = useRef<ReturnType<typeof useApp>["app"] | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "TenderTrace", version: "1.0.0" },
    capabilities: {},
    autoResize: false,
    onAppCreated: (a) => {
      a.onteardown = async () => ({});
      a.ontoolinput = async () => {};
      a.ontoolresult = async (result) => setToolResult(result);
      a.ontoolcancelled = () => {};
      a.onerror = console.error;
      a.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
    appRef.current = app ?? null;
  }, [app]);

  const payload: RenderPayload | null = useMemo(() => {
    if (!toolResult) return null;
    try {
      const parsed = extractJson<RenderPayload>(toolResult);
      return parsed?.schema === "tendertrace.v1" ? parsed : null;
    } catch {
      return null;
    }
  }, [toolResult]);

  useEffect(() => {
    if (payload) {
      setTender(payload.tender);
      setCounts(payload.counts);
    }
  }, [payload]);

  const project = payload?.workspaceProject ?? "";

  const refreshSummary = useCallback(() => {
    const currentApp = appRef.current;
    if (!currentApp || !project) return;
    void (async () => {
      try {
        const summary = await callTool<{ tender: TenderMeta | null; counts: TenderCounts }>(
          currentApp,
          "rt_get_dashboard",
          { projectName: project },
        );
        setTender(summary.tender);
        setCounts(summary.counts);
      } catch (err) {
        console.error("[tendertrace] summary refresh failed:", err);
      }
    })();
  }, [project]);

  // event polling (the iframe cannot open SSE)
  useEffect(() => {
    if (!app || !project) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await callTool<{ events: FeedEvent[]; lastSeq: number }>(
          appRef.current,
          "rt_get_events",
          { projectName: project, sinceSeq: lastSeqRef.current },
        );
        if (cancelled) return;
        if (result.events.length > 0) {
          lastSeqRef.current = result.lastSeq;
          setEvents((prev) => [...prev, ...result.events].slice(-300));
        }
      } catch {
        // transient — next poll retries
      }
    };
    void poll();
    const interval = setInterval(poll, EVENT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [app, project]);

  const themeMode = (hostContext as any)?.theme === "dark" ? "dark" : "light";
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: { mode: themeMode },
        typography: { fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif' },
      }),
    [themeMode],
  );

  const ctxValue: AppCtxValue = useMemo(
    () => ({
      app: app ?? null,
      project,
      tender,
      counts,
      events,
      lastSeq: lastSeqRef.current,
      refreshSummary,
    }),
    [app, project, tender, counts, events, refreshSummary],
  );

  const initialPage: PageId = VALID_PAGES.includes(payload?.page as PageId)
    ? (payload!.page as PageId)
    : "dashboard";
  const initialParams: Record<string, string> = payload?.entityId
    ? { reqId: payload.entityId }
    : {};

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          Host connection failed: {String(error)}
        </Alert>
      )}
      {!payload ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 2 }}>
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">
            Waiting for TenderTrace data…
          </Typography>
        </Box>
      ) : (
        <AppCtx.Provider value={ctxValue}>
          {/* key remounts navigation when the host re-renders with a different sentinel */}
          <NavProvider key={`${project}:${initialPage}`} initialPage={initialPage} initialParams={initialParams}>
            <Shell />
          </NavProvider>
        </AppCtx.Provider>
      )}
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TenderTraceApp />
  </StrictMode>,
);
