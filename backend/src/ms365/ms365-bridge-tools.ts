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
        description: 'Materialize the file tree under each sync root as empty stub files (*.onedrive-stub). Stubs make Glob/ls work. Use hydrate_path to fetch real content for a specific file.',
        inputSchema: {
          type: 'object' as const,
          properties: { root_label: { type: 'string', description: 'Limit to one sync root; omit to stub all roots.' } },
        },
      },
      {
        name: 'hydrate_path',
        description: 'Download the real content for a remote path and replace its stub with the actual file. Call this before Read on a stub.',
        inputSchema: {
          type: 'object' as const,
          properties: { remote_path: { type: 'string', description: 'Remote path from the mapping (as shown in stub contents).' } },
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
        name: 'start_writeback',
        description: 'Start the chokidar watcher that uploads local edits under /workspace/<project>/onedrive/ back to OneDrive.',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'stop_writeback',
        description: 'Stop the write-back watcher for this project.',
        inputSchema: { type: 'object' as const, properties: {} },
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
          sync.startDeltaPolling(project);
          return { root };
        }

        case 'list_sync_roots':
          return { roots: await sync.listRoots(project) };

        case 'remove_sync_root':
          await sync.removeRoot(project, args.label);
          return { ok: true };

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

        case 'start_writeback':
          watcher.startWatching(project);
          return { watching: true };

        case 'stop_writeback':
          watcher.stopWatching(project);
          return { watching: false };

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
