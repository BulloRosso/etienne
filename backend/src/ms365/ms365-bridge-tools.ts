import { ToolService } from '../mcpserver/types';
import { GraphClientService } from './graph-client.service';
import { OneDriveSyncService } from './onedrive-sync.service';
import { WritebackWatcherService } from './writeback-watcher.service';

export function createMs365BridgeToolsService(
  graph: GraphClientService,
  sync: OneDriveSyncService,
  watcher: WritebackWatcherService,
  getProject: () => string | null,
): ToolService {
  const requireProject = (): string => {
    const p = getProject();
    if (!p) throw new Error('No project context. Pass X-Project-Name header or ?project= query param.');
    return p;
  };

  return {
    tools: [
      {
        name: 'list_drives',
        description: 'List the OneDrive and SharePoint drives accessible to the connected Microsoft 365 account for this project.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'list_sites',
        description: 'Search SharePoint sites accessible to the project account. Use with org-mode auth.',
        inputSchema: {
          type: 'object' as const,
          properties: { query: { type: 'string', description: 'Optional search string; leave empty to list followed sites.' } },
        },
      },
      {
        name: 'list_site_drives',
        description: 'List document libraries (drives) inside a SharePoint site.',
        inputSchema: {
          type: 'object' as const,
          properties: { site_id: { type: 'string' } },
          required: ['site_id'],
        },
      },
      {
        name: 'add_sync_root',
        description: 'Register a remote folder (in OneDrive or a SharePoint drive) as a sync root mirrored under /workspace/<project>/onedrive/<label>/. After adding, call stub_tree to materialize the file tree as stubs.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            drive_id: { type: 'string', description: 'Drive ID; omit for personal /me/drive.' },
            remote_path: { type: 'string', description: 'Remote folder path relative to drive root (e.g. "Documents" or ""  for root).' },
            label: { type: 'string', description: 'Local subdirectory label (e.g. "personal" or "sharepoint-marketing").' },
          },
          required: ['remote_path', 'label'],
        },
      },
      {
        name: 'list_sync_roots',
        description: 'List the currently registered sync roots for this project.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'remove_sync_root',
        description: 'Unregister a sync root by label. Does not delete local files.',
        inputSchema: {
          type: 'object' as const,
          properties: { label: { type: 'string' } },
          required: ['label'],
        },
      },
      {
        name: 'stub_tree',
        description: 'Sync the file tree under each sync root: download every file and create folders locally. Files are written directly (no stubs) so Read/Glob work without extra steps. Files that fail to download fall back to *.onedrive-stub placeholders.',
        inputSchema: {
          type: 'object' as const,
          properties: { root_label: { type: 'string', description: 'Limit to one sync root; omit to sync all roots.' } },
        },
      },
      {
        name: 'hydrate_path',
        description: 'Force-download a remote path now (used when a fallback stub exists or to refresh a file). Normal new files are already downloaded by stub_tree and run_delta.',
        inputSchema: {
          type: 'object' as const,
          properties: { remote_path: { type: 'string', description: 'Remote path from the mapping.' } },
          required: ['remote_path'],
        },
      },
      {
        name: 'search_onedrive',
        description: 'Search OneDrive for files by query string. Does not hydrate — returns metadata only.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' },
            drive_id: { type: 'string', description: 'Restrict to a specific drive; omit for /me/drive.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'sync_status',
        description: 'Get the current sync status: registered roots, entries known, hydrated count, pending uploads, conflicts.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'run_delta',
        description: 'Force a delta poll now (instead of waiting for the background timer). Updates the mapping with remote changes; does not auto-hydrate.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'push_now',
        description: 'One-shot scan: upload any local files that are new or changed since last push, and delete remote files whose local copy has been removed. Use this after editing or deleting files locally.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'get_auto_sync',
        description: 'Return whether auto-sync is enabled for this project (delta poll every 20s + chokidar write-back).',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'set_auto_sync',
        description: 'Enable or disable auto-sync. When on: delta polling and write-back start automatically. When off: both stop.',
        inputSchema: {
          type: 'object' as const,
          properties: { enabled: { type: 'boolean' } },
          required: ['enabled'],
        },
      },
      {
        name: 'create_folder',
        description: 'Create a folder on OneDrive at a given parent path.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            parent_path: { type: 'string' },
            folder_name: { type: 'string' },
            drive_id: { type: 'string' },
          },
          required: ['folder_name'],
        },
      },
    ],

    execute: async (toolName: string, args: any): Promise<any> => {
      const project = requireProject();

      switch (toolName) {
        case 'list_drives':
          return { drives: await graph.listDrives(project) };

        case 'list_sites':
          return { sites: await graph.listSites(project, args.query) };

        case 'list_site_drives':
          return { drives: await graph.listSiteDrives(project, args.site_id) };

        case 'add_sync_root': {
          const root = await sync.addRoot(project, {
            driveId: args.drive_id,
            remotePath: args.remote_path || '',
            label: args.label,
          });
          if (await sync.getAutoSync(project)) {
            sync.startDeltaPolling(project);
          }
          return { root };
        }

        case 'list_sync_roots':
          return { roots: await sync.listRoots(project) };

        case 'remove_sync_root': {
          const result = await sync.removeRoot(project, args.label);
          if (!(await sync.hasAnyRoots(project))) {
            sync.stopDeltaPolling(project);
            watcher.stopWatching(project);
          }
          return { ok: true, ...result };
        }

        case 'stub_tree':
          return await sync.stubTree(project, args.root_label);

        case 'hydrate_path':
          return await sync.hydratePath(project, args.remote_path);

        case 'search_onedrive':
          return { results: await graph.searchFiles(project, args.query, args.drive_id) };

        case 'sync_status': {
          const s = await sync.getStatus(project);
          return { ...s, writebackActive: watcher.isWatching(project) };
        }

        case 'run_delta':
          return await sync.runDelta(project);

        case 'push_now':
          return await sync.pushNow(project);

        case 'get_auto_sync':
          return { enabled: await sync.getAutoSync(project) };

        case 'set_auto_sync': {
          await sync.setAutoSync(project, !!args.enabled);
          if (args.enabled) {
            sync.startDeltaPolling(project);
          } else {
            sync.stopDeltaPolling(project);
          }
          return { enabled: !!args.enabled };
        }

        case 'create_folder': {
          const item = await graph.createFolder(project, args.parent_path || '', args.folder_name, args.drive_id);
          return { folder: item };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    },
  };
}
