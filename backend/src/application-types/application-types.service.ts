import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export type LocalizedString = string | Record<string, string>;

export interface MenuItemBase {
  id: string;
  type: 'modal' | 'document' | 'url' | 'subagent';
  icon?: string;
  labels: LocalizedString;
  payload: Record<string, any>;
}

export interface ApplicationTypeConfig {
  id: string;
  version?: string;
  labels: LocalizedString;
  sidebar: {
    bgColor?: string;
    headingLabels: LocalizedString;
  };
  menuItems: MenuItemBase[];
}

export interface ApplicationTypeListEntry {
  id: string;
  version?: string;
  label: string;
  hasThumbnail: boolean;
}

export interface EffectiveMenuItem {
  id: string;
  type: MenuItemBase['type'];
  icon?: string;
  label: string;
  payload: Record<string, any>;
}

export interface EffectiveApplicationConfig {
  id: string;
  label: string;
  sidebar: {
    bgColor: string;
    heading: string;
  };
  menuItems: EffectiveMenuItem[];
}

export interface ResourceRef {
  typeId: string;
  fileName: string;
  uri: string;
}

const DEFAULT_BG_COLOR = '#E3F2FD';

@Injectable()
export class ApplicationTypesService {
  private readonly logger = new Logger(ApplicationTypesService.name);
  private readonly workspaceDir = path.resolve(
    process.cwd(),
    process.env.WORKSPACE_ROOT || '../workspace',
  );

  private getRepositoryPath(): string {
    return (
      process.env.APPLICATION_TYPES_REPOSITORY ||
      path.resolve(process.cwd(), '..', 'application-types-repository')
    );
  }

  private getTypeDir(typeId: string): string {
    return path.join(this.getRepositoryPath(), typeId);
  }

  private getProjectMarkerPath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne', 'application-type.json');
  }

  private getProjectAgentsDir(project: string): string {
    return path.join(this.workspaceDir, project, '.claude', 'agents');
  }

  private resolveLabel(value: LocalizedString | undefined, lng: string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[lng] || value['en'] || Object.values(value)[0] || '';
  }

  async listApplicationTypes(lng = 'en'): Promise<ApplicationTypeListEntry[]> {
    const repoPath = this.getRepositoryPath();
    if (!(await fs.pathExists(repoPath))) {
      return [];
    }

    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    const results: ApplicationTypeListEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const config = await this.readConfig(entry.name);
        if (!config) continue;
        const thumbnailPath = path.join(this.getTypeDir(entry.name), 'thumbnail.png');
        results.push({
          id: config.id,
          version: config.version,
          label: this.resolveLabel(config.labels, lng),
          hasThumbnail: await fs.pathExists(thumbnailPath),
        });
      } catch (err: any) {
        this.logger.warn(`Failed to load application type "${entry.name}": ${err.message}`);
      }
    }

    return results.sort((a, b) => a.label.localeCompare(b.label));
  }

  async getApplicationType(id: string): Promise<ApplicationTypeConfig | null> {
    return this.readConfig(id);
  }

  private async readConfig(typeId: string): Promise<ApplicationTypeConfig | null> {
    const configPath = path.join(this.getTypeDir(typeId), 'config.json');
    if (!(await fs.pathExists(configPath))) return null;
    const parsed = (await fs.readJson(configPath)) as ApplicationTypeConfig;
    if (!parsed.id) parsed.id = typeId;
    return parsed;
  }

  async getProjectApplicationType(project: string): Promise<string | null> {
    const markerPath = this.getProjectMarkerPath(project);
    if (!(await fs.pathExists(markerPath))) return null;
    try {
      const data = (await fs.readJson(markerPath)) as { id?: string };
      return data.id || null;
    } catch (err: any) {
      this.logger.warn(`Failed to read application-type marker for ${project}: ${err.message}`);
      return null;
    }
  }

  async setProjectApplicationType(project: string, id: string | null): Promise<void> {
    const markerPath = this.getProjectMarkerPath(project);

    if (id === null || id === undefined || id === '') {
      if (await fs.pathExists(markerPath)) {
        await fs.remove(markerPath);
        this.logger.log(`Cleared application type for project ${project}`);
      }
      return;
    }

    const config = await this.readConfig(id);
    if (!config) {
      throw new Error(`Application type "${id}" not found`);
    }

    await fs.ensureDir(path.dirname(markerPath));
    await fs.writeJson(markerPath, { id }, { spaces: 2 });
    this.logger.log(`Set application type "${id}" for project ${project}`);

    await this.provisionSubagents(project, id);
  }

  private async provisionSubagents(project: string, typeId: string): Promise<void> {
    const sourceDir = path.join(this.getTypeDir(typeId), 'subagents');
    if (!(await fs.pathExists(sourceDir))) return;

    const targetDir = this.getProjectAgentsDir(project);
    await fs.ensureDir(targetDir);

    const files = await fs.readdir(sourceDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const target = path.join(targetDir, file);
      if (await fs.pathExists(target)) {
        this.logger.log(`Subagent "${file}" already exists in project ${project} — skipping`);
        continue;
      }
      await fs.copy(path.join(sourceDir, file), target);
      this.logger.log(`Provisioned subagent "${file}" into project ${project}`);
    }
  }

  async getEffectiveConfig(
    project: string,
    lng = 'en',
  ): Promise<EffectiveApplicationConfig | null> {
    const id = await this.getProjectApplicationType(project);
    if (!id) return null;
    const config = await this.readConfig(id);
    if (!config) return null;

    return {
      id: config.id,
      label: this.resolveLabel(config.labels, lng),
      sidebar: {
        bgColor: config.sidebar?.bgColor || DEFAULT_BG_COLOR,
        heading: this.resolveLabel(config.sidebar?.headingLabels, lng),
      },
      menuItems: (config.menuItems || []).map((item) => ({
        id: item.id,
        type: item.type,
        icon: item.icon,
        label: this.resolveLabel(item.labels, lng),
        payload: item.payload || {},
      })),
    };
  }

  async getResourceHtml(typeId: string, resourceName: string): Promise<string | null> {
    const filePath = path.join(this.getTypeDir(typeId), 'resources', resourceName);
    if (!(await fs.pathExists(filePath))) return null;
    const raw = await fs.readFile(filePath, 'utf-8');

    // Inline the MCP Apps SDK bundle so the sandboxed srcdoc iframe (allow-scripts only,
    // no allow-same-origin) does not need to fetch anything from a CDN.
    if (raw.includes('__EXT_APPS_BUNDLE__')) {
      const bundle = await this.loadExtAppsBundle();
      return raw.replace('__EXT_APPS_BUNDLE__', () => bundle);
    }
    return raw;
  }

  private cachedExtAppsBundle: string | null = null;

  private async loadExtAppsBundle(): Promise<string> {
    if (this.cachedExtAppsBundle) return this.cachedExtAppsBundle;
    const candidates = [
      path.resolve(process.cwd(), '..', 'frontend', 'node_modules', '@modelcontextprotocol', 'ext-apps', 'dist', 'src', 'app-with-deps.js'),
      path.resolve(process.cwd(), 'node_modules', '@modelcontextprotocol', 'ext-apps', 'dist', 'src', 'app-with-deps.js'),
    ];
    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) {
        const raw = await fs.readFile(candidate, 'utf-8');
        // Rewrite the trailing `export { x as App, y as PostMessageTransport, ... };`
        // into a window assignment so a classic <script> inlining it can read symbols.
        // The bundle's tail is a single `export { … };` statement.
        const exportRe = /export\s*\{([^}]+)\}\s*;\s*$/;
        const m = raw.match(exportRe);
        let rewritten = raw;
        if (m) {
          const bindings = m[1].split(',').map((part) => {
            const seg = part.trim();
            if (!seg) return null;
            // form is "<local> as <exported>" or just "<name>"
            const asMatch = seg.match(/^(\S+)\s+as\s+(\S+)$/);
            if (asMatch) {
              return `${asMatch[2]}: ${asMatch[1]}`;
            }
            return `${seg}: ${seg}`;
          }).filter(Boolean).join(', ');
          rewritten = raw.replace(exportRe, `;window.__mcpApps = { ${bindings} };`);
        } else {
          this.logger.warn('Could not find trailing export {} in ext-apps bundle — symbols will not be exposed');
        }
        this.cachedExtAppsBundle = rewritten;
        return rewritten;
      }
    }
    this.logger.warn('MCP Apps SDK bundle (app-with-deps.js) not found — iframe resources will be broken');
    return '/* ext-apps bundle missing */';
  }

  async listAllResources(): Promise<ResourceRef[]> {
    const repoPath = this.getRepositoryPath();
    if (!(await fs.pathExists(repoPath))) return [];

    const out: ResourceRef[] = [];
    const types = await fs.readdir(repoPath, { withFileTypes: true });
    for (const t of types) {
      if (!t.isDirectory()) continue;
      const resDir = path.join(repoPath, t.name, 'resources');
      if (!(await fs.pathExists(resDir))) continue;
      const files = await fs.readdir(resDir);
      for (const file of files) {
        if (!file.endsWith('.html')) continue;
        out.push({
          typeId: t.name,
          fileName: file,
          uri: `ui://app-types/${t.name}/${file}`,
        });
      }
    }
    return out;
  }

  async getThumbnailPath(typeId: string): Promise<string | null> {
    const p = path.join(this.getTypeDir(typeId), 'thumbnail.png');
    if (!(await fs.pathExists(p))) return null;
    return p;
  }
}
