// A2UI v0.9 message builders for the restaurant-booking demo.
// Spec: https://a2ui.org/specification/v0.9-a2ui/

export const A2UI_VERSION = 'v0.9' as const;

export type A2uiMessage =
  | { version: 'v0.9'; createSurface: { surfaceId: string; catalogId: string; sendDataModel?: boolean } }
  | { version: 'v0.9'; updateComponents: { surfaceId: string; components: ComponentNode[] } }
  | { version: 'v0.9'; updateDataModel: { surfaceId: string; path?: string; value?: unknown } }
  | { version: 'v0.9'; deleteSurface: { surfaceId: string } };

export interface ComponentNode {
  component: string;
  id?: string;
  [key: string]: unknown;
}

// BoundValue: either a literal (literalString/literalNumber/literalBoolean) or a path ref.
export type BoundString = { literalString: string } | { path: string };
export type BoundNumber = { literalNumber: number } | { path: string };
export type BoundBoolean = { literalBoolean: boolean } | { path: string };

export function literalString(s: string): BoundString {
  return { literalString: s };
}
export function pathRef(p: string): { path: string } {
  return { path: p };
}

// Must match the catalog id of @a2ui/react's basicCatalog.
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/basic_catalog.json';

export function createSurface(surfaceId: string): A2uiMessage {
  return {
    version: A2UI_VERSION,
    createSurface: { surfaceId, catalogId: BASIC_CATALOG_ID, sendDataModel: false },
  };
}

export function updateComponents(surfaceId: string, components: ComponentNode[]): A2uiMessage {
  return { version: A2UI_VERSION, updateComponents: { surfaceId, components } };
}

export function updateDataModel(surfaceId: string, path: string, value: unknown): A2uiMessage {
  return { version: A2UI_VERSION, updateDataModel: { surfaceId, path, value } };
}

export function deleteSurface(surfaceId: string): A2uiMessage {
  return { version: A2UI_VERSION, deleteSurface: { surfaceId } };
}
