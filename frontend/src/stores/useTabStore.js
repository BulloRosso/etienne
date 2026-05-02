import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useTabStore = create(
  persist(
    (set, get) => ({
      tabPaths: {},
      activeTab: {},
      visibleIndices: {},

      setTabPaths: (project, paths) =>
        set(state => ({
          tabPaths: { ...state.tabPaths, [project]: paths }
        })),

      setActiveTab: (project, index) =>
        set(state => ({
          activeTab: { ...state.activeTab, [project]: index }
        })),

      setVisibleIndices: (project, indices) =>
        set(state => ({
          visibleIndices: { ...state.visibleIndices, [project]: indices }
        })),

      getTabPaths: (project) => get().tabPaths[project] || [],
      getActiveTab: (project) => get().activeTab[project] ?? 0,
      getVisibleIndices: (project) => get().visibleIndices[project] || [],
    }),
    {
      name: 'preview-tabs',
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
