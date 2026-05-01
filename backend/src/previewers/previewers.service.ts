import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '../configuration/configuration.service';
import { promises as fs } from 'fs';
import { join } from 'path';

// ── Interfaces ──

export interface ContextMenuActionParam {
  name: string;      // prop name passed to modal, e.g. 'filename'
  source: string;    // 'filePath' | 'fileName' | 'projectName' | 'folderPath' | template string
}

export interface ContextMenuCondition {
  type: 'extension' | 'filename' | 'pathContains';
  value: string;
}

export interface ContextMenuAction {
  id: string;
  labels: Record<string, string>;       // { en, de, it, zh }
  icon?: string;                         // e.g. 'codicon codicon-checklist'
  modalComponent: string;               // component name or '__preview__'
  params: ContextMenuActionParam[];
  condition?: ContextMenuCondition;
  minRole?: string;                      // e.g. 'user'
}

export interface PreviewerMapping {
  viewer: string;
  type?: 'file' | 'service' | 'mcpui';   // defaults to 'file' for backward compat
  extensions: string[];
  contextMenuActions?: ContextMenuAction[];
  mcpGroup?: string;                       // MCP server group name (e.g. 'budget')
  mcpToolName?: string;                    // MCP tool to call (e.g. 'render_budget')
}

export interface ServicePreviewerInfo {
  serviceName: string;
  viewerName: string;
  functions: string[];
  displayName: string;
  requiresService?: string;
}

export interface PreviewerMetadataEntry {
  viewer: string;
  type?: 'file' | 'service' | 'mcpui';
  mcpGroup?: string;
  mcpToolName?: string;
  extensions?: string[];
  actions?: ContextMenuAction[];
}

export interface PreviewersConfiguration {
  previewers: PreviewerMapping[];
  servicePreviewers: ServicePreviewerInfo[];
}

// ── Service ──

@Injectable()
export class PreviewersService {
  private readonly metadataPath = join(__dirname, 'previewer-metadata.json');

  constructor(private readonly configurationService: ConfigurationService) {}

  /**
   * Returns the full previewer configuration including extension mappings
   * and context menu actions merged from the JSON config file.
   */
  async getFullConfiguration(): Promise<PreviewersConfiguration> {
    const previewers = this.getExtensionMappings();
    const metadata = await this.loadMetadata();

    // Merge metadata (type, mcpGroup, mcpToolName, contextMenuActions) into previewers
    for (const entry of metadata) {
      let previewer = previewers.find(p => p.viewer === entry.viewer);
      if (!previewer && entry.type === 'mcpui') {
        // MCP UI previewers may not be in REGISTERED_PREVIEWERS env — add them
        previewer = { viewer: entry.viewer, extensions: entry.extensions || [] };
        previewers.push(previewer);
      }
      if (previewer) {
        if (entry.type) previewer.type = entry.type;
        if (entry.mcpGroup) previewer.mcpGroup = entry.mcpGroup;
        if (entry.mcpToolName) previewer.mcpToolName = entry.mcpToolName;
        if (entry.actions) previewer.contextMenuActions = entry.actions;
      }
    }

    return {
      previewers,
      servicePreviewers: this.getServicePreviewers(),
    };
  }

  /**
   * Returns extension mappings from REGISTERED_PREVIEWERS env var (or defaults).
   */
  getExtensionMappings(): PreviewerMapping[] {
    const raw = process.env.REGISTERED_PREVIEWERS || '';

    if (!raw) {
      return this.getDefaults();
    }

    const previewers: PreviewerMapping[] = raw
      .split('|')
      .map(entry => {
        const [viewer, extsStr] = entry.split(':');
        const extensions = extsStr ? extsStr.split(',').map(e => e.trim()) : [];
        return { viewer: viewer.trim(), extensions };
      })
      .filter(p => p.viewer && p.extensions.length > 0);

    return previewers.length > 0 ? previewers : this.getDefaults();
  }

  /**
   * Backward-compatible: returns { previewers } shape for existing callers.
   */
  getConfiguration(): { previewers: PreviewerMapping[] } {
    return { previewers: this.getExtensionMappings() };
  }

  /**
   * Returns service previewers (not file-extension based).
   */
  getServicePreviewers(): ServicePreviewerInfo[] {
    return [
      {
        serviceName: 'imap',
        viewerName: 'imap',
        functions: ['/inbox'],
        displayName: 'Email Inbox',
        requiresService: 'imap-connector',
      },
    ];
  }

  /**
   * Updates extension mappings by writing to REGISTERED_PREVIEWERS in .env.
   */
  async updateExtensionMappings(previewers: PreviewerMapping[]): Promise<void> {
    const serialized = previewers
      .map(p => `${p.viewer}:${p.extensions.join(',')}`)
      .join('|');

    const config = (await this.configurationService.getConfiguration()) || {};
    config['REGISTERED_PREVIEWERS'] = serialized;
    await this.configurationService.saveConfiguration(config);
    process.env.REGISTERED_PREVIEWERS = serialized;
  }

  /**
   * Saves metadata (type, mcpGroup, mcpToolName, contextMenuActions, extensions for MCP UI) to JSON file.
   */
  async saveMetadata(entries: PreviewerMetadataEntry[]): Promise<void> {
    await fs.writeFile(this.metadataPath, JSON.stringify(entries, null, 2), 'utf8');
  }

  /**
   * Saves both extension mappings and metadata.
   */
  async updateConfiguration(previewers: PreviewerMapping[]): Promise<void> {
    const metadata: PreviewerMetadataEntry[] = [];
    const extensionOnly: PreviewerMapping[] = [];

    for (const p of previewers) {
      const hasMetadata = p.type === 'mcpui' || p.mcpGroup || p.mcpToolName
        || (p.contextMenuActions && p.contextMenuActions.length > 0);

      if (hasMetadata) {
        const entry: PreviewerMetadataEntry = { viewer: p.viewer };
        if (p.type) entry.type = p.type;
        if (p.mcpGroup) entry.mcpGroup = p.mcpGroup;
        if (p.mcpToolName) entry.mcpToolName = p.mcpToolName;
        if (p.type === 'mcpui') entry.extensions = p.extensions;
        if (p.contextMenuActions && p.contextMenuActions.length > 0) {
          entry.actions = p.contextMenuActions;
        }
        metadata.push(entry);
      }

      // MCP UI previewers store extensions in metadata, not in env var
      if (p.type !== 'mcpui') {
        extensionOnly.push({ viewer: p.viewer, extensions: p.extensions });
      }
    }

    await this.updateExtensionMappings(extensionOnly);
    await this.saveMetadata(metadata);
  }

  // ── Private ──

  private async loadMetadata(): Promise<PreviewerMetadataEntry[]> {
    try {
      const content = await fs.readFile(this.metadataPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return this.getDefaultMetadata();
    }
  }

  private getDefaultMetadata(): PreviewerMetadataEntry[] {
    return [
      {
        viewer: 'requirements',
        actions: [
          {
            id: 'generate-offer',
            labels: {
              en: 'Generate Offer Paragraphs',
              de: 'Angebotsabschnitte generieren',
              it: 'Genera paragrafi offerta',
              zh: '生成报价段落',
            },
            icon: 'codicon codicon-notebook',
            modalComponent: 'OfferGeneratorModal',
            params: [{ name: 'projectName', source: 'projectName' }],
            condition: { type: 'filename', value: 'selected-requirements.md' },
            minRole: 'user',
          },
        ],
      },
      {
        viewer: 'pdf',
        actions: [
          {
            id: 'extract-requirements',
            labels: {
              en: 'Extract Requirements',
              de: 'Anforderungen extrahieren',
              it: 'Estrai requisiti',
              zh: '提取需求',
            },
            icon: 'codicon codicon-checklist',
            modalComponent: '__preview__',
            params: [
              {
                name: 'filePath',
                source: 'out/requirements-analysis/${fileNameWithoutExt}.requirements.json',
              },
            ],
            condition: { type: 'pathContains', value: 'inbox' },
            minRole: 'user',
          },
        ],
      },
      {
        viewer: 'budget',
        type: 'mcpui',
        extensions: ['.budget.json'],
        mcpGroup: 'budget',
        mcpToolName: 'render_budget',
      },
    ];
  }

  private getDefaults(): PreviewerMapping[] {
    return [
      { viewer: 'html', extensions: ['.html', '.htm'] },
      { viewer: 'json', extensions: ['.json'] },
      { viewer: 'jsonl', extensions: ['.jsonl'] },
      { viewer: 'markdown', extensions: ['.md'] },
      { viewer: 'mermaid', extensions: ['.mermaid'] },
      { viewer: 'research', extensions: ['.research'] },
      { viewer: 'image', extensions: ['.jpg', '.jpeg', '.png', '.gif'] },
      { viewer: 'excel', extensions: ['.xls', '.xlsx'] },
      { viewer: 'prompt', extensions: ['.prompt'] },
      { viewer: 'workflow', extensions: ['.workflow.json'] },
      { viewer: 'scrapbook', extensions: ['.scbk'] },
      { viewer: 'video', extensions: ['.youtube', '.videos', '.mp4'] },
      { viewer: 'knowledge', extensions: ['.knowledge'] },
      { viewer: 'pdf', extensions: ['.pdf'] },
      { viewer: 'docx', extensions: ['.docx', '.doc'] },
      { viewer: 'requirements', extensions: ['.requirements.json'] },
      { viewer: 'artifacts', extensions: ['.artifacts.md'] },
      { viewer: 'budget', extensions: ['.budget.json'] },
    ];
  }
}
