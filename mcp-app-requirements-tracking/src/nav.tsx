/**
 * In-app navigation. No router — hash routing is unreliable inside the
 * sandboxed srcdoc iframe. A NavContext holds {page, params} + a back stack;
 * every requirement id anywhere in the UI renders as <ReqLink>, which
 * navigates to the Requirement Thread (P-09) — the spec's global rule:
 * "the thread is the hub; queues and reports are spokes".
 */
import { Link as MuiLink, Chip } from "@mui/material";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { postViewerState } from "./api";

export type PageId =
  | "dashboard"
  | "workspace"
  | "review-queue"
  | "compliance-matrix"
  | "response-builder"
  | "service-catalog"
  | "catalog-import"
  | "drift-inbox"
  | "requirement-thread"
  | "link-review"
  | "deviation-report"
  | "claims"
  | "quick-capture"
  | "admin-audit";

export interface NavLocation {
  page: PageId;
  params: Record<string, string>;
}

interface NavContextValue {
  location: NavLocation;
  navigate: (page: PageId, params?: Record<string, string>) => void;
  back: () => void;
  canGoBack: boolean;
}

const NavContext = createContext<NavContextValue>({
  location: { page: "dashboard", params: {} },
  navigate: () => {},
  back: () => {},
  canGoBack: false,
});

export function NavProvider({
  initialPage,
  initialParams,
  children,
}: {
  initialPage: PageId;
  initialParams?: Record<string, string>;
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<NavLocation[]>([
    { page: initialPage, params: initialParams ?? {} },
  ]);

  const navigate = useCallback((page: PageId, params: Record<string, string> = {}) => {
    setStack((prev) => [...prev, { page, params }]);
    postViewerState({ page, params });
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const value = useMemo<NavContextValue>(
    () => ({
      location: stack[stack.length - 1],
      navigate,
      back,
      canGoBack: stack.length > 1,
    }),
    [stack, navigate, back],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  return useContext(NavContext);
}

/** Requirement-id chip that links to the thread view (P-09). */
export function ReqLink({ reqId, size = "small" }: { reqId: string; size?: "small" | "medium" }) {
  const { navigate } = useNav();
  return (
    <Chip
      label={reqId}
      size={size}
      color="primary"
      variant="outlined"
      onClick={() => navigate("requirement-thread", { reqId })}
      sx={{ fontFamily: "monospace", cursor: "pointer" }}
    />
  );
}

/** Inline text link variant for dense contexts (report lines, narratives). */
export function ReqTextLink({ reqId }: { reqId: string }) {
  const { navigate } = useNav();
  return (
    <MuiLink
      component="button"
      type="button"
      onClick={() => navigate("requirement-thread", { reqId })}
      sx={{ fontFamily: "monospace" }}
    >
      {reqId}
    </MuiLink>
  );
}

export const PAGE_TITLES: Record<PageId, string> = {
  dashboard: "Dashboard",
  workspace: "Tender Workspace",
  "review-queue": "Review Queue",
  "compliance-matrix": "Compliance Matrix",
  "response-builder": "Response Builder",
  "service-catalog": "Service Catalog",
  "catalog-import": "Catalog Import",
  "drift-inbox": "Drift Inbox",
  "requirement-thread": "Requirement Thread",
  "link-review": "Link Review",
  "deviation-report": "Deviation Report",
  claims: "Claims",
  "quick-capture": "Quick Capture",
  "admin-audit": "Admin & Audit",
};
