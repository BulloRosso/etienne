/**
 * Etienne Configuration Dashboard — MCP App (React)
 *
 * Two tabs:
 *   1. Services  — list / start / stop platform services
 *   2. Configuration — view / edit backend .env variables
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import s from "./mcp-app.module.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceInfo {
  name: string;
  displayName: string;
  description: string;
  port: number;
  status?: "running" | "stopped";
}

type Toast = { type: "success" | "error"; message: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson<T>(result: CallToolResult): T {
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text in result");
  return JSON.parse(textContent.text) as T;
}

// ─── Root component ──────────────────────────────────────────────────────────

function Dashboard() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "Etienne Configuration", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async (_params, _extra) => ({ });
      app.ontoolinput = async () => {};
      app.ontoolresult = async (result) => setToolResult(result);
      app.ontoolcancelled = () => {};
      app.onerror = console.error;
      app.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div><strong>Error:</strong> {error.message}</div>;
  if (!app) return <div className={s.main}><span className={s.spinner} /> Connecting...</div>;

  return (
    <DashboardInner
      app={app}
      toolResult={toolResult}
      hostContext={hostContext}
    />
  );
}

// ─── Inner dashboard (connected) ─────────────────────────────────────────────

interface DashboardInnerProps {
  app: App;
  toolResult: CallToolResult | null;
  hostContext?: McpUiHostContext;
}

function DashboardInner({ app, toolResult, hostContext }: DashboardInnerProps) {
  const [tab, setTab] = useState<"services" | "config">("services");
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Show toast briefly
  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Fetch services ──────────────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    try {
      const result = await app.callServerTool({
        name: "list_services",
        arguments: {},
      });
      const data = extractJson<ServiceInfo[]>(result);
      setServices(data);
      setLoading(false);
    } catch (e) {
      console.error("poll-services error:", e);
      setLoading(false);
    }
  }, [app]);

  // ── Fetch config ────────────────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const result = await app.callServerTool({
        name: "get_configuration",
        arguments: {},
      });
      const data = extractJson<Record<string, string>>(result);
      setConfig(data);
      setEditConfig(data);
    } catch (e) {
      console.error("get-config error:", e);
    }
  }, [app]);

  // ── Initial data from toolResult or poll ────────────────────────────────
  useEffect(() => {
    fetchServices();
    fetchConfig();
  }, [fetchServices, fetchConfig]);

  // If we got initial data from model-facing tool
  useEffect(() => {
    if (!toolResult) return;
    try {
      const data = extractJson<{
        services?: ServiceInfo[];
        configuration?: Record<string, string>;
      }>(toolResult);
      if (data.services) setServices(data.services);
      if (data.configuration) {
        setConfig(data.configuration);
        setEditConfig(data.configuration);
      }
      setLoading(false);
    } catch {
      // not the expected shape, ignore
    }
  }, [toolResult]);

  // ── Poll services every 5 s ────────────────────────────────────────────
  useEffect(() => {
    pollRef.current = setInterval(fetchServices, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchServices]);

  // ── Start / stop service ────────────────────────────────────────────────
  const handleServiceAction = useCallback(
    async (serviceName: string, action: "start" | "stop") => {
      setActionInProgress(serviceName);
      try {
        const toolName = action === "start" ? "start_service" : "stop_service";
        const result = await app.callServerTool({
          name: toolName,
          arguments: { service_name: serviceName },
        });
        const data = extractJson<{ success: boolean; message: string }>(result);
        showToast({
          type: data.success ? "success" : "error",
          message: data.message,
        });
        // Re-poll after action
        setTimeout(fetchServices, 1500);
      } catch (e) {
        showToast({
          type: "error",
          message: `Failed to ${action} ${serviceName}`,
        });
        console.error(e);
      } finally {
        setActionInProgress(null);
      }
    },
    [app, fetchServices, showToast],
  );

  // ── Save config ─────────────────────────────────────────────────────────
  const handleSaveConfig = useCallback(async () => {
    setActionInProgress("__config__");
    try {
      await app.callServerTool({
        name: "set_configuration",
        arguments: { config: editConfig },
      });
      setConfig(editConfig);
      setEditing(false);
      showToast({ type: "success", message: "Configuration saved" });
    } catch (e) {
      showToast({ type: "error", message: "Failed to save configuration" });
      console.error(e);
    } finally {
      setActionInProgress(null);
    }
  }, [app, editConfig, showToast]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <main
      className={s.main}
      style={{
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      {/* Tabs */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${tab === "services" ? s.tabActive : ""}`}
          onClick={() => setTab("services")}
        >
          Services
        </button>
        <button
          className={`${s.tab} ${tab === "config" ? s.tabActive : ""}`}
          onClick={() => setTab("config")}
        >
          Configuration
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`${s.toast} ${
            toast.type === "success" ? s.toastSuccess : s.toastError
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Services tab */}
      {tab === "services" && (
        <section>
          <div className={s.sectionHeader}>
            <span className={s.sectionTitle}>Platform Services</span>
            <button className={s.btn} onClick={fetchServices}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "var(--spacing-md)", textAlign: "center" }}>
              <span className={s.spinner} />
            </div>
          ) : (
            <div className={s.serviceList}>
              {services.map((svc) => (
                <div key={svc.name} className={s.serviceCard}>
                  <div className={s.serviceInfo}>
                    <div className={s.serviceName}>
                      {svc.displayName || svc.name}
                    </div>
                    {svc.description && (
                      <div className={s.serviceDescription}>
                        {svc.description}
                      </div>
                    )}
                    {svc.port > 0 && (
                      <div className={s.servicePort}>:{svc.port}</div>
                    )}
                  </div>
                  <div className={s.serviceActions}>
                    <span
                      className={`${s.statusBadge} ${
                        svc.status === "running"
                          ? s.statusRunning
                          : s.statusStopped
                      }`}
                    >
                      <span className={s.statusDot} />
                      {svc.status ?? "unknown"}
                    </span>

                    {svc.status === "running" ? (
                      <button
                        className={`${s.btn} ${s.btnDanger}`}
                        disabled={actionInProgress === svc.name}
                        onClick={() => handleServiceAction(svc.name, "stop")}
                      >
                        {actionInProgress === svc.name ? (
                          <span className={s.spinner} />
                        ) : (
                          "Stop"
                        )}
                      </button>
                    ) : (
                      <button
                        className={`${s.btn} ${s.btnPrimary}`}
                        disabled={actionInProgress === svc.name}
                        onClick={() => handleServiceAction(svc.name, "start")}
                      >
                        {actionInProgress === svc.name ? (
                          <span className={s.spinner} />
                        ) : (
                          "Start"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {services.length === 0 && (
                <div style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>
                  No services configured
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Configuration tab */}
      {tab === "config" && (
        <section>
          <div className={s.sectionHeader}>
            <span className={s.sectionTitle}>Backend Configuration</span>
            <div style={{ display: "flex", gap: "var(--spacing-xs)" }}>
              {editing ? (
                <>
                  <button
                    className={`${s.btn} ${s.btnPrimary}`}
                    disabled={actionInProgress === "__config__"}
                    onClick={handleSaveConfig}
                  >
                    {actionInProgress === "__config__" ? (
                      <span className={s.spinner} />
                    ) : (
                      "Save"
                    )}
                  </button>
                  <button
                    className={s.btn}
                    onClick={() => {
                      setEditConfig(config);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`${s.btn} ${s.btnPrimary}`}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                  <button className={s.btn} onClick={fetchConfig}>
                    Refresh
                  </button>
                </>
              )}
            </div>
          </div>

          <table className={s.configTable}>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(editing ? editConfig : config).map(
                ([key, value]) => (
                  <tr key={key}>
                    <td className={s.configKey}>{key}</td>
                    <td>
                      {editing ? (
                        <input
                          className={s.configInput}
                          value={value ?? ""}
                          onChange={(e) =>
                            setEditConfig((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className={s.configValue}>
                          {key.includes("KEY") ||
                          key.includes("PASSWORD") ||
                          key.includes("SECRET")
                            ? "****"
                            : (value ?? "")}
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
              {Object.keys(config).length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      color: "var(--color-text-secondary)",
                      textAlign: "center",
                    }}
                  >
                    No configuration loaded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
