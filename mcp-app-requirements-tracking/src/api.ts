/**
 * Tool-call plumbing: the sandboxed iframe reaches the backend ONLY through
 * MCP tool calls via the host bridge (App.callServerTool). extractJson follows
 * the compliance-matrix pattern (text content → JSON, tolerating the
 * double-wrapped array shape some transports produce).
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type AppLike = {
  callServerTool: (params: { name: string; arguments: any }) => Promise<unknown>;
};

export function extractJson<T>(result: CallToolResult): T {
  const textContent = result.content?.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") throw new Error("No text in result");
  let parsed = JSON.parse(textContent.text);
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === "text" && parsed[0]?.text) {
    parsed = JSON.parse(parsed[0].text);
  }
  return parsed as T;
}

export async function callTool<T>(
  app: AppLike | null,
  name: string,
  args: Record<string, any>,
): Promise<T> {
  if (!app) throw new Error("Host bridge not connected yet");
  const result = (await app.callServerTool({ name, arguments: args })) as CallToolResult;
  return extractJson<T>(result);
}

/**
 * Host actions via postMessage — reuses the existing compliance-cockpit-action
 * handler in frontend/src/App.jsx (open-host-preview opens any project file in
 * the host preview pane; used for DOCX exports and source documents).
 */
export function postHostAction(action: string, payload: Record<string, any>): void {
  try {
    window.parent.postMessage({ type: "compliance-cockpit-action", action, payload }, "*");
  } catch (error) {
    console.error("[tendertrace] postHostAction failed:", error);
  }
}

/** Report UI state to the host so the chat model can see where the user is. */
export function postViewerState(state: Record<string, any>): void {
  try {
    window.parent.postMessage({ type: "viewer-state-update", state }, "*");
  } catch {
    // host may not listen — fine
  }
}
