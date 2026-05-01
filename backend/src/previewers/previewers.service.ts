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
  extensions: string[];
  contextMenuActions?: ContextMenuAction[];
}

export interface ServicePreviewerInfo {
  serviceName: string;
  viewerName: string;
  functions: string[];
  displayName: string;
  requiresService?: string;
}

export interface PreviewersConfiguration {
  previewers: PreviewerMapping[];
  servicePreviewers: ServicePreviewerInfo[];
}

// ── Service ──

@Injectable()
export class PreviewersService {
  private readonly contextActionsPath = join(__dirname, 'previewer-context-actions.json');

  constructor(private readonly configurationService: ConfigurationService) {}

  /**
   * Returns the full previewer configuration including extension mappings
   * and context menu actions merged from the JSON config file.
   */
  async getFullConfiguration(): Promise<PreviewersConfiguration> {
    const previewers = this.getExtensionMappings();
    const contextActions = await this.loadContextActions();

    // Merge context actions into previewers
    for (const entry of contextActions) {
      const previewer = previewers.find(p => p.viewer === entry.viewer);
      if (previewer) {
        previewer.contextMenuActions = entry.actions;
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
   * Updates context menu actions by writing the JSON config file.
   */
  async updateContextActions(actions: { viewer: string; actions: ContextMenuAction[] }[]): Promise<void> {
    await fs.writeFile(this.contextActionsPath, JSON.stringify(actions, null, 2), 'utf8');
  }

  /**
   * Saves both extension mappings and context menu actions.
   */
  async updateConfiguration(previewers: PreviewerMapping[]): Promise<void> {
    // Separate context actions from extension data
    const contextActions: { viewer: string; actions: ContextMenuAction[] }[] = [];
    const extensionOnly: PreviewerMapping[] = [];

    for (const p of previewers) {
      if (p.contextMenuActions && p.contextMenuActions.length > 0) {
        contextActions.push({ viewer: p.viewer, actions: p.contextMenuActions });
      }
      extensionOnly.push({ viewer: p.viewer, extensions: p.extensions });
    }

    await this.updateExtensionMappings(extensionOnly);
    await this.updateContextActions(contextActions);
  }

  // ── Private ──

  private async loadContextActions(): Promise<{ viewer: string; actions: ContextMenuAction[] }[]> {
    try {
      const content = await fs.readFile(this.contextActionsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      // File doesn't exist yet or is invalid — return defaults
      return this.getDefaultContextActions();
    }
  }

  private getDefaultContextActions(): { viewer: string; actions: ContextMenuAction[] }[] {
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
    ];
  }
}
