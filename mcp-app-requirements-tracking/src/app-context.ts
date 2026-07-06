/**
 * App-wide context: the connected MCP App bridge, workspace project, latest
 * tender summary, and the polled event feed (the sandboxed iframe cannot open
 * SSE — see rt_get_events).
 */
import { createContext, useContext } from "react";
import type { AppLike } from "./api";
import type { FeedEvent, TenderCounts, TenderMeta } from "./types";

export interface AppCtxValue {
  app: AppLike | null;
  project: string;
  tender: TenderMeta | null;
  counts: TenderCounts | null;
  events: FeedEvent[];
  lastSeq: number;
  /** re-fetch the tender summary (after own mutations) */
  refreshSummary: () => void;
}

export const AppCtx = createContext<AppCtxValue>({
  app: null,
  project: "",
  tender: null,
  counts: null,
  events: [],
  lastSeq: 0,
  refreshSummary: () => {},
});

export function useAppCtx(): AppCtxValue {
  return useContext(AppCtx);
}
