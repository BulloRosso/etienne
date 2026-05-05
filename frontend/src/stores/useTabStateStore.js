import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

function isExpired(timestamp) {
  return Date.now() - timestamp > EXPIRY_MS;
}

function makeKey(project, filePath) {
  return `${project}::${filePath}`;
}

function sweepExpired(indicators) {
  const cleaned = {};
  for (const [key, entry] of Object.entries(indicators)) {
    if (!isExpired(entry.timestamp)) {
      cleaned[key] = entry;
    }
  }
  return cleaned;
}

const useTabStateStore = create(
  persist(
    (set, get) => ({
      indicators: {},

      setTabState: (project, filePath, color) =>
        set(state => ({
          indicators: {
            ...state.indicators,
            [makeKey(project, filePath)]: { color, timestamp: Date.now() },
          },
        })),

      clearTabState: (project, filePath) =>
        set(state => {
          const key = makeKey(project, filePath);
          if (!(key in state.indicators)) return state;
          const { [key]: _, ...rest } = state.indicators;
          return { indicators: rest };
        }),

      getTabState: (project, filePath) => {
        const key = makeKey(project, filePath);
        const entry = get().indicators[key];
        if (!entry) return null;
        if (isExpired(entry.timestamp)) {
          // Lazy cleanup of expired entry
          set(state => {
            const { [key]: _, ...rest } = state.indicators;
            return { indicators: rest };
          });
          return null;
        }
        return entry;
      },
    }),
    {
      name: 'tab-state-indicators',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('Failed to persist tab state indicators:', e);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.indicators = sweepExpired(state.indicators);
        }
      },
    }
  )
);

export default useTabStateStore;
