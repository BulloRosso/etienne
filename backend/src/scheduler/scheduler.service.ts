import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { TaskStorageService } from './task-storage.service';
import { TaskDefinition, TaskHistoryEntry } from './interfaces/task.interface';
import { ClaudeService } from '../claude/claude.service';
import { ChatPersistence } from '../claude/chat.persistence';
import { BudgetMonitoringService } from '../budget-monitoring/budget-monitoring.service';
import { join } from 'path';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly workspaceRoot = process.env.WORKSPACE_ROOT || 'C:/Data/GitHub/claude-multitenant/workspace';
  private chatRefreshFlags = new Map<string, boolean>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly storageService: TaskStorageService,
    private readonly claudeService: ClaudeService,
    private readonly budgetMonitoringService: BudgetMonitoringService,
  ) {}

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
          for (const task of tasks) {
            await this.registerCronJob(project, task);
          }
          if (tasks.length > 0) {
            this.logger.log(`Registered ${tasks.length} tasks for project: ${project}`);
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
      // Use the streamPrompt method from ClaudeService (skip built-in chat persistence)
      const observable = this.claudeService.streamPrompt(project, task.prompt, undefined, undefined, undefined, true);

      let fullResponse = '';
      let inputTokens = 0;
      let outputTokens = 0;

      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (messageEvent) => {
            this.logger.debug(`Received event type: ${messageEvent.type}`);

            if (messageEvent.type === 'stdout') {
              const data = messageEvent.data;
              if (typeof data === 'string') {
                fullResponse += data;
              } else if (data && typeof data === 'object' && data.chunk) {
                // Extract chunk from object like {chunk: "text"}
                fullResponse += data.chunk;
              } else if (data && typeof data === 'object') {
                fullResponse += JSON.stringify(data);
              }
            } else if (messageEvent.type === 'usage') {
              try {
                const usageData = typeof messageEvent.data === 'string'
                  ? JSON.parse(messageEvent.data)
                  : messageEvent.data;
                inputTokens = usageData.input_tokens || 0;
                outputTokens = usageData.output_tokens || 0;
                this.logger.log(`Usage tracked: ${inputTokens} input, ${outputTokens} output tokens`);
              } catch (err) {
                this.logger.warn(`Failed to parse usage data: ${err.message}`);
              }
            } else if (messageEvent.type === 'completed') {
              this.logger.log('Task execution completed event received');
            }
          },
          error: (err) => {
            this.logger.error(`Observable error: ${err.message}`);
            reject(err);
          },
          complete: () => {
            this.logger.log('Observable completed');
            resolve();
          },
        });
      });

      const duration = Date.now() - startTime;
      const timestamp = new Date().toISOString();

      // Record successful execution in task history
      const historyEntry: TaskHistoryEntry = {
        timestamp,
        name: task.name,
        response: fullResponse || 'Task completed successfully',
        isError: false,
        duration,
        inputTokens,
        outputTokens,
      };

      await this.storageService.addHistoryEntry(project, historyEntry);
      this.logger.log(`Task ${task.name} completed in ${duration}ms with ${inputTokens} input and ${outputTokens} output tokens`);

      // Persist to chat history with [Scheduled: taskname] prefix
      try {
        const projectRoot = join(this.workspaceRoot, project);
        const chatPersistence = new ChatPersistence(projectRoot);

        const costs = inputTokens > 0 || outputTokens > 0 ? {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        } : undefined;

        await chatPersistence.appendMessages([
          {
            timestamp,
            isAgent: false,
            message: `[Scheduled: ${task.name}]\n\r ${task.prompt}`,
            costs: undefined
          },
          {
            timestamp,
            isAgent: true,
            message: fullResponse || 'Task completed successfully',
            costs
          }
        ]);

        this.logger.log(`Task ${task.name} persisted to chat history`);
      } catch (error: any) {
        this.logger.warn(`Failed to persist task ${task.name} to chat history: ${error.message}`);
      }

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
