import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import axios from 'axios';
import { TaskStorageService } from './task-storage.service';
import { TaskDefinition, TaskHistoryEntry } from './interfaces/task.interface';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly backendUrl: string;
  private chatRefreshFlags = new Map<string, boolean>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly storageService: TaskStorageService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
  ) {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:6060';
  }

  async onModuleInit() {
    this.logger.log('Initializing scheduler from workspace projects...');
    await this.initializeFromWorkspace();
  }

  private async initializeFromWorkspace(): Promise<void> {
    try {
      const projects = await this.storageService.getAllProjects();

      for (const project of projects) {
        try {
          const tasks = await this.storageService.loadTasks(project);
          let tasksModified = false;
          const activeTasks: TaskDefinition[] = [];

          for (const task of tasks) {
            // Clean up expired one-time tasks
            if (this.isOneTimeTask(task)) {
              const parts = task.cronExpression.split(' ');
              if (parts.length === 5) {
                const [minute, hour, dayOfMonth, month] = parts;
                if (dayOfMonth !== '*' && month !== '*') {
                  const now = new Date();
                  const taskDate = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(dayOfMonth), parseInt(hour), parseInt(minute));
                  if (taskDate < now) {
                    this.logger.log(`Removing expired one-time task: ${task.name} (was scheduled for ${taskDate.toISOString()})`);
                    tasksModified = true;
                    continue;
                  }
                }
              }
            }

            activeTasks.push(task);
            await this.registerCronJob(project, task);
          }

          if (tasksModified) {
            await this.storageService.saveTasks(project, activeTasks);
          }

          if (activeTasks.length > 0) {
            this.logger.log(`Registered ${activeTasks.length} tasks for project: ${project}`);
          }
        } catch (error: any) {
          this.logger.warn(`Failed to load tasks for project ${project}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to initialize scheduler: ${error.message}`);
    }
  }

  private getCronJobName(project: string, taskId: string): string {
    return `${project}__${taskId}`;
  }

  private isOneTimeTask(task: TaskDefinition): boolean {
    if (task.type === 'one-time') return true;

    // Heuristic fallback: if day-of-month and month are specific numbers
    // while day-of-week is *, it's a one-time task
    const parts = task.cronExpression.split(' ');
    if (parts.length === 5) {
      const [, , dayOfMonth, month, dayOfWeek] = parts;
      if (dayOfMonth !== '*' && month !== '*' && dayOfWeek === '*') {
        return true;
      }
    }

    return false;
  }

  private async registerCronJob(project: string, task: TaskDefinition): Promise<void> {
    const jobName = this.getCronJobName(project, task.id);

    // Remove existing job if it exists
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch {
      // Job doesn't exist, continue
    }

    // Create new cron job
    const job = new CronJob(
      task.cronExpression,
      async () => {
        await this.executeTask(project, task);
      },
      null,
      true,
      task.timeZone || 'UTC',
    );

    this.schedulerRegistry.addCronJob(jobName, job);
    this.logger.log(`Registered cron job: ${jobName} with expression: ${task.cronExpression}`);
  }

  private async executeTask(project: string, task: TaskDefinition): Promise<void> {
    this.logger.log(`Executing scheduled task: ${task.name} for project: ${project}`);
    const startTime = Date.now();

    try {
      // Call the unattended endpoint - it handles chat persistence internally
      const url = `${this.backendUrl}/api/claude/unattended/${encodeURIComponent(project)}`;

      const response = await axios.post(
        url,
        {
          prompt: task.prompt,
          maxTurns: 20,
          source: `Scheduled: ${task.name}`
        },
        { timeout: 300000 } // 5 minute timeout
      );

      const duration = Date.now() - startTime;
      const timestamp = new Date().toISOString();
      const fullResponse = response.data?.response || 'Task completed successfully';
      const inputTokens = response.data?.tokenUsage?.input_tokens || 0;
      const outputTokens = response.data?.tokenUsage?.output_tokens || 0;

      // Record successful execution in task history
      const historyEntry: TaskHistoryEntry = {
        timestamp,
        name: task.name,
        response: fullResponse,
        isError: !response.data?.success,
        duration,
        inputTokens,
        outputTokens,
      };

      await this.storageService.addHistoryEntry(project, historyEntry);
      this.logger.log(`Task ${task.name} completed in ${duration}ms with ${inputTokens} input and ${outputTokens} output tokens`);

      // Track costs in budget monitoring
      if (inputTokens > 0 || outputTokens > 0) {
        try {
          await this.budgetMonitoringService.trackCosts(project, inputTokens, outputTokens);
          this.logger.log(`Task ${task.name} costs tracked in budget monitoring`);
        } catch (error: any) {
          this.logger.warn(`Failed to track costs for task ${task.name}: ${error.message}`);
        }
      }

      // Set refresh flag for frontend polling
      this.chatRefreshFlags.set(project, true);
      this.logger.log(`Chat refresh flag set for project: ${project}`);
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Record error
      const historyEntry: TaskHistoryEntry = {
        timestamp: new Date().toISOString(),
        name: task.name,
        response: error.message || 'Unknown error occurred',
        isError: true,
        duration,
      };

      await this.storageService.addHistoryEntry(project, historyEntry);
      this.logger.error(`Task ${task.name} failed: ${error.message}`);
    }

    // Auto-cleanup one-time tasks after execution
    if (this.isOneTimeTask(task)) {
      this.logger.log(`One-time task "${task.name}" executed, auto-deleting...`);
      try {
        await this.deleteTask(project, task.id);
        this.logger.log(`One-time task "${task.name}" (${task.id}) deleted successfully`);
      } catch (deleteError: any) {
        this.logger.error(`Failed to auto-delete one-time task "${task.name}": ${deleteError.message}`);
      }
    }
  }

  async getTasks(project: string): Promise<TaskDefinition[]> {
    return this.storageService.loadTasks(project);
  }

  async getHistory(project: string): Promise<TaskHistoryEntry[]> {
    return this.storageService.loadHistory(project);
  }

  async saveTasks(project: string, tasks: TaskDefinition[]): Promise<void> {
    // Save to storage
    await this.storageService.saveTasks(project, tasks);

    // Update cron jobs
    const existingTasks = await this.storageService.loadTasks(project);
    const existingIds = new Set(existingTasks.map(t => t.id));

    // Remove old jobs
    for (const task of existingTasks) {
      const jobName = this.getCronJobName(project, task.id);
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
      } catch {
        // Job doesn't exist
      }
    }

    // Register new jobs
    for (const task of tasks) {
      await this.registerCronJob(project, task);
    }
  }

  async createTask(project: string, task: TaskDefinition): Promise<TaskDefinition> {
    const tasks = await this.storageService.loadTasks(project);

    // Ensure unique ID
    if (tasks.find(t => t.id === task.id)) {
      throw new Error(`Task with ID ${task.id} already exists`);
    }

    tasks.push(task);
    await this.storageService.saveTasks(project, tasks);
    await this.registerCronJob(project, task);

    return task;
  }

  async updateTask(project: string, taskId: string, updatedTask: TaskDefinition): Promise<TaskDefinition> {
    const tasks = await this.storageService.loadTasks(project);
    const index = tasks.findIndex(t => t.id === taskId);

    if (index === -1) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    tasks[index] = updatedTask;
    await this.storageService.saveTasks(project, tasks);
    await this.registerCronJob(project, updatedTask);

    return updatedTask;
  }

  async deleteTask(project: string, taskId: string): Promise<void> {
    const tasks = await this.storageService.loadTasks(project);
    const filteredTasks = tasks.filter(t => t.id !== taskId);

    if (filteredTasks.length === tasks.length) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    await this.storageService.saveTasks(project, filteredTasks);

    // Remove cron job
    const jobName = this.getCronJobName(project, taskId);
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch {
      // Job doesn't exist
    }
  }

  async getTask(project: string, taskId: string): Promise<TaskDefinition | null> {
    const tasks = await this.storageService.loadTasks(project);
    return tasks.find(t => t.id === taskId) || null;
  }

  checkChatRefresh(project: string): boolean {
    return this.chatRefreshFlags.get(project) || false;
  }

  clearChatRefresh(project: string): void {
    this.chatRefreshFlags.delete(project);
  }
}
