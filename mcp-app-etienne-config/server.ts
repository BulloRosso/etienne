import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Backend API base URL — the etienne-configuration MCP tools endpoint
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:6060";
const MCP_AUTH = process.env.MCP_AUTH ?? "test123";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

// ─── Helpers to call the backend REST API ────────────────────────────────────

async function backendGet<T = unknown>(endpoint: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: MCP_AUTH },
  });
  if (!res.ok) throw new Error(`Backend ${endpoint}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function backendPost<T = unknown>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: MCP_AUTH,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Backend ${endpoint}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Etienne Configuration App",
    version: "1.0.0",
  });

  const resourceUri = "ui://etienne-config/mcp-app.html";

  // ── Model-facing tool: show the configuration dashboard ──────────────────
  registerAppTool(
    server,
    "show-etienne-dashboard",
    {
      title: "Etienne Configuration Dashboard",
      description:
        "Opens an interactive dashboard to manage platform services (start/stop/status) and backend configuration (.env variables).",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      // Fetch initial data to provide as text fallback
      const [services, config] = await Promise.all([
        backendGet("/api/process-manager"),
        backendGet("/api/configuration"),
      ]);
      const summary = {
        services,
        configuration: config,
        timestamp: new Date().toISOString(),
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    },
  );

  // ── App-only tool: poll service statuses ─────────────────────────────────
  registerAppTool(
    server,
    "poll-services",
    {
      title: "Poll Services",
      description: "Returns all services with their current status. App-only.",
      inputSchema: {},
      _meta: { ui: { visibility: ["app"] } },
    },
    async (): Promise<CallToolResult> => {
      const services = await backendGet<
        Array<{ name: string; displayName: string; description: string; port: number }>
      >("/api/process-manager");

      const statuses = await Promise.all(
        services.map(async (svc) => {
          const status = await backendGet<{ status: string; port?: number }>(
            `/api/process-manager/${svc.name}`,
          );
          return { ...svc, ...status };
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(statuses) }],
      };
    },
  );

  // ── App-only tool: start a service ───────────────────────────────────────
  registerAppTool(
    server,
    "start-service",
    {
      title: "Start Service",
      description: "Start a service by name. App-only.",
      inputSchema: { service_name: z.string().describe("Service to start") },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ service_name }: { service_name: string }): Promise<CallToolResult> => {
      const result = await backendPost(`/api/process-manager/${service_name}`, {
        action: "start",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  // ── App-only tool: stop a service ────────────────────────────────────────
  registerAppTool(
    server,
    "stop-service",
    {
      title: "Stop Service",
      description: "Stop a service by name. App-only.",
      inputSchema: { service_name: z.string().describe("Service to stop") },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ service_name }: { service_name: string }): Promise<CallToolResult> => {
      const result = await backendPost(`/api/process-manager/${service_name}`, {
        action: "stop",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  // ── App-only tool: get configuration ─────────────────────────────────────
  registerAppTool(
    server,
    "get-config",
    {
      title: "Get Configuration",
      description: "Read all backend .env configuration. App-only.",
      inputSchema: {},
      _meta: { ui: { visibility: ["app"] } },
    },
    async (): Promise<CallToolResult> => {
      const config = await backendGet("/api/configuration");
      return {
        content: [{ type: "text", text: JSON.stringify(config) }],
      };
    },
  );

  // ── App-only tool: save configuration ────────────────────────────────────
  registerAppTool(
    server,
    "save-config",
    {
      title: "Save Configuration",
      description: "Save backend .env configuration (full replace). App-only.",
      inputSchema: {
        config: z.record(z.string(), z.string()),
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ config }: { config: Record<string, unknown> }): Promise<CallToolResult> => {
      const result = await backendPost("/api/configuration", config as Record<string, string>);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  // ── Resource: the bundled React UI ───────────────────────────────────────
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Etienne Configuration Dashboard UI",
    },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}

// ─── HTTP transport entrypoint ───────────────────────────────────────────────

async function main() {
  const port = parseInt(process.env.PORT ?? "3002", 10);

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.listen(port, () => {
    console.log(
      `Etienne Configuration MCP App server listening on http://localhost:${port}/mcp`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
