import { Injectable } from '@nestjs/common';

export interface PreviewerMapping {
  viewer: string;
  extensions: string[];
}

@Injectable()
export class PreviewersService {
  getConfiguration(): { previewers: PreviewerMapping[] } {
    const raw = process.env.REGISTERED_PREVIEWERS || '';

    if (!raw) {
      return { previewers: this.getDefaults() };
    }

    const previewers: PreviewerMapping[] = raw
      .split('|')
      .map(entry => {
        const [viewer, extsStr] = entry.split(':');
        const extensions = extsStr ? extsStr.split(',').map(e => e.trim()) : [];
        return { viewer: viewer.trim(), extensions };
      })
      .filter(p => p.viewer && p.extensions.length > 0);

    return { previewers: previewers.length > 0 ? previewers : this.getDefaults() };
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
    ];
  }
}
