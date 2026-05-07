import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { QuickActionsDto } from './dto/quick-actions.dto';

@Injectable()
export class QuickActionsService {
  private readonly logger = new Logger(QuickActionsService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  private get filePath(): string {
    return path.join(this.workspaceDir, '.agent', 'quick-actions.json');
  }

  async get(): Promise<QuickActionsDto> {
    if (!(await fs.pathExists(this.filePath))) {
      return { actions: [] };
    }
    const data = await fs.readJson(this.filePath);
    return { actions: Array.isArray(data?.actions) ? data.actions : [] };
  }

  async save(payload: QuickActionsDto): Promise<void> {
    const agentDir = path.join(this.workspaceDir, '.agent');
    await fs.ensureDir(agentDir);
    const normalized: QuickActionsDto = {
      actions: Array.isArray(payload?.actions) ? payload.actions : [],
    };
    await fs.writeJson(this.filePath, normalized, { spaces: 2 });
    this.logger.log(`Saved quick-actions.json (${normalized.actions.length} entries)`);
  }
}
