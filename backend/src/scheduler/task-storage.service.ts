import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TaskDefinition, TaskHistoryEntry, TaskStorage, TaskHistoryStorage } from './interfaces/task.interface';

@Injectable()
export class TaskStorageService {
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';

  private getProjectPath(project: string): string {
    return join(this.workspaceRoot, project);
  }

  private getEtienneDir(project: string): string {
    return join(this.getProjectPath(project), '.etienne');
  }

  private getTasksFilePath(project: string): string {
    return join(this.getEtienneDir(project), 'scheduled-tasks.json');
  }

  private getHistoryFilePath(project: string): string {
    return join(this.getEtienneDir(project), 'task-history.json');
  }

  async ensureEtienneDirectory(project: string): Promise<void> {
    const etienneDir = this.getEtienneDir(project);
    await fs.mkdir(etienneDir, { recursive: true });
  }

  async loadTasks(project: string): Promise<TaskDefinition[]> {
    try {
      const filePath = this.getTasksFilePath(project);
      const content = await fs.readFile(filePath, 'utf8');
      const storage: TaskStorage = JSON.parse(content);
      return storage.tasks || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async saveTasks(project: string, tasks: TaskDefinition[]): Promise<void> {
    await this.ensureEtienneDirectory(project);
    const filePath = this.getTasksFilePath(project);
    const storage: TaskStorage = { tasks };
    await fs.writeFile(filePath, JSON.stringify(storage, null, 2), 'utf8');
  }

  async loadHistory(project: string): Promise<TaskHistoryEntry[]> {
    try {
      const filePath = this.getHistoryFilePath(project);
      const content = await fs.readFile(filePath, 'utf8');
      const storage: TaskHistoryStorage = JSON.parse(content);
      return storage.taskHistory || [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async addHistoryEntry(project: string, entry: TaskHistoryEntry): Promise<void> {
    await this.ensureEtienneDirectory(project);
    const history = await this.loadHistory(project);
    history.unshift(entry); // Add to beginning (newest first)

    const filePath = this.getHistoryFilePath(project);
    const storage: TaskHistoryStorage = { taskHistory: history };
    await fs.writeFile(filePath, JSON.stringify(storage, null, 2), 'utf8');
  }

  async getAllProjects(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspaceRoot, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  async getProjectsWithTasks(): Promise<string[]> {
    const projects = await this.getAllProjects();
    const projectsWithTasks: string[] = [];

    for (const project of projects) {
      try {
        const tasks = await this.loadTasks(project);
        if (tasks.length > 0) {
          projectsWithTasks.push(project);
        }
      } catch {
        // Skip projects with errors
      }
    }

    return projectsWithTasks;
  }
}
