import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface RecentProject {
  name: string;
  accessedAt: string;
}

export interface RecentChat {
  projectName: string;
  sessionId: string;
  title: string;
  accessedAt: string;
}

export interface RecentNotification {
  text: string;
  projectName: string;
  receivedAt: string;
}

export interface RecentItems {
  projects: RecentProject[];
  chats: RecentChat[];
  notifications: RecentNotification[];
}

@Injectable()
export class RecentItemsService {
  private readonly logger = new Logger(RecentItemsService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  private get filePath(): string {
    return path.join(this.workspaceDir, '.etienne', 'recent-items.json');
  }

  private defaultItems(): RecentItems {
    return { projects: [], chats: [], notifications: [] };
  }

  async loadRecentItems(): Promise<RecentItems> {
    try {
      if (await fs.pathExists(this.filePath)) {
        const data = await fs.readJson(this.filePath);
        return {
          projects: data.projects || [],
          chats: data.chats || [],
          notifications: data.notifications || [],
        };
      }
    } catch (error: any) {
      this.logger.warn(`Failed to load recent items: ${error.message}`);
    }
    return this.defaultItems();
  }

  private async save(items: RecentItems): Promise<void> {
    await fs.ensureDir(path.dirname(this.filePath));
    await fs.writeJson(this.filePath, items, { spaces: 2 });
  }

  async trackProject(name: string): Promise<void> {
    const items = await this.loadRecentItems();
    const now = new Date().toISOString();
    items.projects = items.projects.filter((p) => p.name !== name);
    items.projects.unshift({ name, accessedAt: now });
    items.projects = items.projects.slice(0, 10);
    await this.save(items);
  }

  async trackChat(
    projectName: string,
    sessionId: string,
    title: string,
  ): Promise<void> {
    const items = await this.loadRecentItems();
    const now = new Date().toISOString();
    items.chats = items.chats.filter((c) => c.sessionId !== sessionId);
    items.chats.unshift({ projectName, sessionId, title, accessedAt: now });
    items.chats = items.chats.slice(0, 10);
    await this.save(items);
  }

  async trackNotification(
    text: string,
    projectName: string,
  ): Promise<void> {
    const items = await this.loadRecentItems();
    const now = new Date().toISOString();
    items.notifications.unshift({ text, projectName, receivedAt: now });
    items.notifications = items.notifications.slice(0, 10);
    await this.save(items);
  }
}
