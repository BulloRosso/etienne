import { create } from 'zustand';

/**
 * Per-project file-selection state, surfaced for cross-component reuse.
 *
 * The Filesystem component owns the canonical selection (paths + mode) and
 * publishes it here so distant features — currently the "Promote to package"
 * flow — can read the user's current ticks without prop-drilling.
 *
 * Not persisted: selection is a transient UI state, not part of the saved
 * draft (which lives in usePackageDraftStore).
 */
const useFileSelectionStore = create((set, get) => ({
  /** Project name the selection belongs to. Cleared when project changes. */
  project: null,
  /** Project-relative POSIX paths. */
  paths: [],
  /** True iff the Filesystem checkbox UI is currently active. */
  selectionMode: false,

  publish: (project, paths, selectionMode) =>
    set({ project, paths: [...paths], selectionMode }),

  clear: () => set({ project: null, paths: [], selectionMode: false }),

  /**
   * Snapshot the current selection, but ONLY if it belongs to the project
   * the caller is acting on. Returns [] otherwise.
   */
  snapshotFor: (project) => {
    const s = get();
    if (s.project !== project) return [];
    return [...s.paths];
  },
}));

export default useFileSelectionStore;
