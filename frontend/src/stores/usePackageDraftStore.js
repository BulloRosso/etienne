import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiAxios } from '../services/api';

const emptyManifest = () => ({
  schemaVersion: 1,
  name: '',
  agentName: '',
  language: 'en',
  missionBrief: '',
  agentRole: undefined,
  applicationType: undefined,
  template: undefined,
  skills: [],
  subagents: [],
  mcpServers: [],
  a2aAgents: [],
  copyUIFrom: undefined,
});

let resolveTimer = null;

/**
 * Draft state for the Agent Package Composer.
 *
 * Holds the user's in-progress manifest, the latest resolved lockfile, and
 * derived validation info. Persisted to sessionStorage so a refresh doesn't
 * blow away the draft.
 *
 * The store debounces resolve requests by 300ms — components call
 * `requestResolve()` after any mutating action and the store collapses
 * bursts into a single POST /api/packages/resolve call.
 */
const usePackageDraftStore = create(
  persist(
    (set, get) => ({
      manifest: emptyManifest(),
      lockfile: null,
      conflicts: [],
      warnings: [],
      resolving: false,
      resolveError: null,
      lastResolveAt: null,

      // ── mutations ────────────────────────────────────────────────────
      setMeta: (partial) =>
        set((state) => ({
          manifest: { ...state.manifest, ...partial },
        })),

      setAppType: (id) =>
        set((state) => ({
          manifest: {
            ...state.manifest,
            applicationType: id ? { id } : undefined,
          },
        })),

      setTemplate: (name) =>
        set((state) => ({
          manifest: {
            ...state.manifest,
            template: name ? { name } : undefined,
          },
        })),

      setAgentRole: (role) =>
        set((state) => ({
          manifest: { ...state.manifest, agentRole: role || undefined },
        })),

      /**
       * Add a catalog item to the manifest.
       * kind: 'skill' | 'subagent' | 'mcp-server'
       * For mcp-server, `extra` should carry `{ config, envBindings? }`.
       * No-op if the item is already in the manifest.
       */
      addItem: (kind, name, source, extra = {}) =>
        set((state) => {
          const m = state.manifest;
          if (kind === 'skill') {
            if (m.skills.some((s) => s.name === name)) return {};
            return {
              manifest: {
                ...m,
                skills: [...m.skills, { name, source }],
              },
            };
          }
          if (kind === 'subagent') {
            if (m.subagents.some((s) => s.name === name)) return {};
            return {
              manifest: {
                ...m,
                subagents: [...m.subagents, { name, source }],
              },
            };
          }
          if (kind === 'mcp-server') {
            if (m.mcpServers.some((s) => s.name === name)) return {};
            return {
              manifest: {
                ...m,
                mcpServers: [
                  ...m.mcpServers,
                  { name, config: extra.config || {}, envBindings: extra.envBindings },
                ],
              },
            };
          }
          return {};
        }),

      /**
       * Remove a user-selected item. Auto-added (transitive) items are
       * blocked at the UI layer — this store doesn't enforce it because
       * the lockfile is the source of truth for provenance.
       */
      removeItem: (kind, name) =>
        set((state) => {
          const m = state.manifest;
          if (kind === 'skill') {
            return { manifest: { ...m, skills: m.skills.filter((s) => s.name !== name) } };
          }
          if (kind === 'subagent') {
            return {
              manifest: { ...m, subagents: m.subagents.filter((s) => s.name !== name) },
            };
          }
          if (kind === 'mcp-server') {
            return {
              manifest: { ...m, mcpServers: m.mcpServers.filter((s) => s.name !== name) },
            };
          }
          return {};
        }),

      /**
       * Remove the entire extraFiles bundle.
       */
      clearExtraFiles: () =>
        set((state) => {
          const { extraFiles, ...rest } = state.manifest;
          return { manifest: rest };
        }),

      /**
       * Remove a single path from the extraFiles bundle. If the last path
       * is removed, drop the whole extraFiles object so the manifest stays
       * tidy.
       */
      removeExtraFile: (path) =>
        set((state) => {
          if (!state.manifest.extraFiles) return {};
          const remaining = state.manifest.extraFiles.paths.filter((p) => p !== path);
          if (remaining.length === 0) {
            const { extraFiles, ...rest } = state.manifest;
            return { manifest: rest };
          }
          return {
            manifest: {
              ...state.manifest,
              extraFiles: { ...state.manifest.extraFiles, paths: remaining },
            },
          };
        }),

      bindMcpEnv: (serverName, key, value) =>
        set((state) => ({
          manifest: {
            ...state.manifest,
            mcpServers: state.manifest.mcpServers.map((s) =>
              s.name === serverName
                ? { ...s, envBindings: { ...(s.envBindings || {}), [key]: value } }
                : s,
            ),
          },
        })),

      reset: () =>
        set({
          manifest: emptyManifest(),
          lockfile: null,
          conflicts: [],
          warnings: [],
          resolving: false,
          resolveError: null,
          lastResolveAt: null,
        }),

      loadManifest: (manifest) =>
        set({
          manifest: { ...emptyManifest(), ...manifest },
          lockfile: null,
          conflicts: [],
          warnings: [],
        }),

      // ── resolve (debounced) ─────────────────────────────────────────
      /**
       * Debounced — collapses bursts of mutations into one resolve POST.
       * Components call this after any addItem/removeItem/setMeta/etc.
       */
      requestResolve: () => {
        if (resolveTimer) {
          clearTimeout(resolveTimer);
        }
        resolveTimer = setTimeout(() => {
          get().resolveNow();
        }, 300);
      },

      resolveNow: async () => {
        const { manifest } = get();
        set({ resolving: true, resolveError: null });
        try {
          const { data } = await apiAxios.post('/api/packages/resolve', manifest);
          set({
            lockfile: data.lockfile,
            conflicts: data.lockfile?.conflicts || [],
            warnings: data.lockfile?.warnings || [],
            resolving: false,
            lastResolveAt: Date.now(),
          });
        } catch (err) {
          set({
            resolving: false,
            resolveError: err?.response?.data?.message || err?.message || 'Resolve failed',
          });
        }
      },
    }),
    {
      name: 'package-draft',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('Failed to persist package draft to sessionStorage:', e);
          }
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
      // Only persist the manifest — lockfile is derived from a POST roundtrip.
      partialize: (state) => ({ manifest: state.manifest }),
    },
  ),
);

export default usePackageDraftStore;
