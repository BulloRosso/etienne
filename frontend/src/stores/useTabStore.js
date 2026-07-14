import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Tab visibility is tracked by file path, not by index into the files array —
// indices go stale whenever files are added/removed/reordered, which used to
// leave open tabs invisible until the list happened to be rebuilt.
const useTabStore = create(
  persist(
    (set, get) => ({
      tabPaths: {},
      activeTabPath: {},
      visiblePaths: {},

      setTabPaths: (project, paths) =>
        set(state => ({
          tabPaths: { ...state.tabPaths, [project]: paths }
        })),

      setActiveTabPath: (project, path) =>
        set(state => ({
          activeTabPath: { ...state.activeTabPath, [project]: path }
        })),

      setVisiblePaths: (project, paths) =>
        set(state => ({
          visiblePaths: { ...state.visiblePaths, [project]: paths }
        })),

      getTabPaths: (project) => get().tabPaths[project] || [],
      getActiveTabPath: (project) => get().activeTabPath[project] ?? null,
      getVisiblePaths: (project) => get().visiblePaths[project] || [],
    }),
    {
      name: 'preview-tabs',
      version: 1,
      // v0 persisted numeric activeTab/visibleIndices; keep the open tab
      // paths (used for restore) and drop the index-based state.
      migrate: (persisted) => ({
        tabPaths: persisted?.tabPaths || {},
        activeTabPath: {},
        visiblePaths: {},
      }),
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('Failed to persist tab state to sessionStorage:', e);
          }
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);

export default useTabStore;
