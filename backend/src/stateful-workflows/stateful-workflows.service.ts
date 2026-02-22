import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs-extra';
import { createMachine, createActor } from 'xstate';
import { EventBusService } from '../agent-bus/event-bus.service';
import { WorkflowTriggerMessage } from '../agent-bus/interfaces/bus-messages';

// ============================================
// Types
// ============================================

export interface WorkflowStateEntryAction {
  promptFile?: string;   // Filename in workflows/ dir (e.g., "process-email.prompt")
  scriptFile?: string;   // Filename in workflows/scripts/ dir (e.g., "process-data.py")
  maxTurns?: number;     // For prompts only (default: 20)
  timeout?: number;      // For scripts only, in seconds (default: 300)
  onSuccess?: string;    // Event to send after successful execution (e.g., "RECORDED")
  onError?: string;      // Event to send on failure (e.g., "ERROR")
}

export interface WorkflowStateMeta {
  label?: string;
  description?: string;
  waitingFor?: 'human_chat' | 'human_email' | 'external' | null;
  waitingMessage?: string;
  emailSubjectFilter?: string;
  onEntry?: WorkflowStateEntryAction;
}

export interface WorkflowTransitionInfo {
  project: string;
  workflowId: string;
  workflowName: string;
  previousState: string;
  newState: string;
  event: string;
  data?: any;
  newStateMeta: WorkflowStateMeta;
  isFinal?: boolean;
}

export interface WorkflowStateConfig {
  type?: 'final' | 'parallel';
  on?: Record<string, string | { target: string; guard?: string }>;
  entry?: string[];
  exit?: string[];
  meta?: WorkflowStateMeta;
}

export interface WorkflowMachineConfig {
  id?: string;
  initial: string;
  states: Record<string, WorkflowStateConfig>;
}

export interface WorkflowHistoryEntry {
  timestamp: string;
  fromState: string;
  toState: string;
  event: string;
  data?: any;
}

export interface WorkflowFile {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  machineConfig: WorkflowMachineConfig;
  persistedSnapshot: any | null;
  currentState: string;
  history: WorkflowHistoryEntry[];
  tags: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  description?: string;
  type: 'initial' | 'normal' | 'waiting' | 'final';
  isCurrent: boolean;
  waitingFor?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface WorkflowStatus {
  id: string;
  name: string;
  currentState: string;
  stateLabel: string;
  stateDescription: string;
  availableEvents: string[];
  isWaiting: boolean;
  waitingFor: string | null;
  waitingMessage: string | null;
  isFinal: boolean;
  version: number;
  updatedAt: string;
}

// ============================================
// Service
// ============================================

@Injectable()
export class StatefulWorkflowsService implements OnModuleInit {
  private readonly logger = new Logger(StatefulWorkflowsService.name);
  private readonly workspaceDir = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../workspace');
  private transitionCallbacks: Array<(info: WorkflowTransitionInfo) => void> = [];

  constructor(
    @Optional()
    private readonly eventBus?: EventBusService,
  ) {}

  async onModuleInit() {
    // Subscribe to workflow/trigger topic on the agent bus
    if (this.eventBus) {
      this.eventBus.subscribe('workflow/trigger', async (topic, msg: WorkflowTriggerMessage) => {
        try {
          this.logger.log(`Received workflow trigger from bus: ${msg.workflowId} / ${msg.event}`);
          await this.sendEvent(msg.projectName, msg.workflowId, msg.event, msg.data, {
            ignoreInvalidTransitions: true,
          });
        } catch (err: any) {
          this.logger.error(`Failed to process bus workflow trigger: ${err.message}`);
        }
      });
      this.logger.log('StatefulWorkflowsService subscribed to workflow/trigger on agent bus');
    }
  }

  /**
   * Register a callback that fires after every successful state transition.
   */
  onTransition(cb: (info: WorkflowTransitionInfo) => void): void {
    this.transitionCallbacks.push(cb);
  }

  private fireTransitionCallbacks(info: WorkflowTransitionInfo): void {
    for (const cb of this.transitionCallbacks) {
      try {
        cb(info);
      } catch (err: any) {
        this.logger.error(`Transition callback error: ${err.message}`);
      }
    }

    // Publish workflow status to agent bus
    if (this.eventBus) {
      this.eventBus.publish('workflow/status/transitioned', {
        correlationId: info.data?.correlationId || randomUUID(),
        projectName: info.project,
        workflowId: info.workflowId,
        workflowName: info.workflowName,
        previousState: info.previousState,
        newState: info.newState,
        event: info.event,
        isFinal: info.isFinal || false,
      }).catch(err => this.logger.error('Failed to publish workflow status to bus', err));
    }
  }

  // ---- File I/O ----

  private getWorkflowsDir(project: string): string {
    return path.join(this.workspaceDir, project, 'workflows');
  }

  private async ensureWorkflowsDir(project: string): Promise<void> {
    await fs.ensureDir(this.getWorkflowsDir(project));
  }

  private getWorkflowPath(project: string, workflowId: string): string {
    return path.join(this.getWorkflowsDir(project), `${workflowId}.workflow.json`);
  }

  private async readWorkflow(project: string, workflowId: string): Promise<WorkflowFile> {
    const filePath = this.getWorkflowPath(project, workflowId);
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Workflow not found: ${workflowId} in project ${project}`);
    }
    return fs.readJson(filePath);
  }

  private async writeWorkflow(project: string, workflow: WorkflowFile): Promise<void> {
    await this.ensureWorkflowsDir(project);
    const filePath = this.getWorkflowPath(project, workflow.id);
    await fs.writeJson(filePath, workflow, { spaces: 2 });
  }

  // ---- Helpers ----

  private getStateMeta(machineConfig: WorkflowMachineConfig, stateName: string): WorkflowStateMeta {
    return machineConfig.states[stateName]?.meta || {};
  }

  private getAvailableEvents(machineConfig: WorkflowMachineConfig, stateName: string): string[] {
    const stateConfig = machineConfig.states[stateName];
    if (!stateConfig?.on) return [];
    return Object.keys(stateConfig.on);
  }

  private isStateFinal(machineConfig: WorkflowMachineConfig, stateName: string): boolean {
    return machineConfig.states[stateName]?.type === 'final';
  }

  /**
   * Resolve an event name case-insensitively against the available events in a state.
   * Returns the canonical event name from the machine config, or the original if no match.
   */
  private resolveEventName(machineConfig: WorkflowMachineConfig, stateName: string, event: string): string {
    const available = this.getAvailableEvents(machineConfig, stateName);
    const eventLower = event.toLowerCase();
    const match = available.find(e => e.toLowerCase() === eventLower);
    return match || event;
  }

  /**
   * Convert a workflow name to a filesystem-safe slug.
   * "Customer Onboarding" -> "customer-onboarding"
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Build an XState-compatible config from our stored machineConfig.
   * We use the setup-free createMachine approach since our configs are simple.
   */
  private buildMachine(machineConfig: WorkflowMachineConfig) {
    return createMachine(machineConfig as any);
  }

  // ---- Public API ----

  async createWorkflow(
    project: string,
    name: string,
    description: string,
    machineConfig: WorkflowMachineConfig,
    tags?: string[],
  ): Promise<WorkflowFile> {
    // Validate required fields
    if (!machineConfig.initial) {
      throw new Error('machineConfig must have an "initial" state');
    }
    if (!machineConfig.states || Object.keys(machineConfig.states).length === 0) {
      throw new Error('machineConfig must have at least one state in "states"');
    }
    if (!machineConfig.states[machineConfig.initial]) {
      throw new Error(`Initial state "${machineConfig.initial}" not found in states`);
    }

    // Generate human-readable slug ID from name
    const id = this.slugify(name);
    if (!id) {
      throw new Error('Workflow name must contain at least one alphanumeric character');
    }

    // Check for duplicate
    const filePath = this.getWorkflowPath(project, id);
    if (await fs.pathExists(filePath)) {
      throw new Error(`A workflow with the name "${name}" (id: ${id}) already exists in project ${project}`);
    }

    // Validate via XState - this will throw if config is invalid
    const configWithId = { ...machineConfig, id };
    const machine = this.buildMachine(configWithId);

    // Create actor to get initial persisted snapshot
    const actor = createActor(machine);
    actor.start();
    const snapshot = actor.getPersistedSnapshot();
    actor.stop();

    const now = new Date().toISOString();
    const workflow: WorkflowFile = {
      id,
      name,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      version: 1,
      machineConfig: configWithId,
      persistedSnapshot: snapshot,
      currentState: machineConfig.initial,
      history: [],
      tags: tags || [],
    };

    await this.writeWorkflow(project, workflow);
    this.logger.log(`Created workflow "${name}" (${id}) in project ${project}`);

    // Fire transition callbacks if initial state has onEntry
    const initialMeta = this.getStateMeta(configWithId, machineConfig.initial);
    if (initialMeta.onEntry) {
      this.fireTransitionCallbacks({
        project,
        workflowId: id,
        workflowName: name,
        previousState: '',
        newState: machineConfig.initial,
        event: 'INIT',
        newStateMeta: initialMeta,
        isFinal: this.isStateFinal(configWithId, machineConfig.initial),
      });
    }

    return workflow;
  }

  async sendEvent(
    project: string,
    workflowId: string,
    event: string,
    data?: any,
    options?: { ignoreInvalidTransitions?: boolean },
  ): Promise<{ previousState: string; currentState: string; transitioned: boolean; ignored?: boolean; reason?: string; workflow: WorkflowFile }> {
    const workflow = await this.readWorkflow(project, workflowId);

    if (this.isStateFinal(workflow.machineConfig, workflow.currentState)) {
      if (options?.ignoreInvalidTransitions) {
        this.logger.warn(
          `Workflow "${workflow.name}" is in final state "${workflow.currentState}" — ignoring event "${event}"`,
        );
        return {
          previousState: workflow.currentState,
          currentState: workflow.currentState,
          transitioned: false,
          ignored: true,
          reason: `Workflow is in final state "${workflow.currentState}" and cannot receive events`,
          workflow,
        };
      }
      throw new Error(`Workflow "${workflow.name}" is in final state "${workflow.currentState}" and cannot receive events`);
    }

    const previousState = workflow.currentState;

    // Resolve event name case-insensitively against the machine config
    const resolvedEvent = this.resolveEventName(workflow.machineConfig, previousState, event);
    if (resolvedEvent !== event) {
      this.logger.log(`Resolved event "${event}" to "${resolvedEvent}" (case-insensitive match)`);
    }

    // Restore actor from persisted snapshot
    const machine = this.buildMachine(workflow.machineConfig);
    const actor = createActor(machine, {
      snapshot: workflow.persistedSnapshot,
    });
    actor.start();

    // Send the event
    const eventPayload = data ? { type: resolvedEvent, ...data } : { type: resolvedEvent };
    actor.send(eventPayload);

    // Get new state
    const newSnapshot = actor.getPersistedSnapshot();
    const actorSnapshot = actor.getSnapshot();
    const newState = typeof actorSnapshot.value === 'string'
      ? actorSnapshot.value
      : JSON.stringify(actorSnapshot.value);
    actor.stop();

    if (newState === previousState) {
      // Event didn't cause a transition
      const available = this.getAvailableEvents(workflow.machineConfig, previousState);
      const reason = `Event "${resolvedEvent}" did not cause a transition from state "${previousState}". Available events: ${available.join(', ') || 'none'}`;

      if (options?.ignoreInvalidTransitions) {
        this.logger.warn(`Workflow "${workflow.name}": ${reason} — event ignored`);
        return {
          previousState,
          currentState: previousState,
          transitioned: false,
          ignored: true,
          reason,
          workflow,
        };
      }
      throw new Error(reason);
    }

    // Update workflow
    workflow.persistedSnapshot = newSnapshot;
    workflow.currentState = newState;
    workflow.version += 1;
    workflow.updatedAt = new Date().toISOString();
    workflow.history.push({
      timestamp: workflow.updatedAt,
      fromState: previousState,
      toState: newState,
      event: resolvedEvent,
      data,
    });

    await this.writeWorkflow(project, workflow);
    this.logger.log(`Workflow "${workflow.name}" transitioned: ${previousState} -> ${newState} (event: ${resolvedEvent})`);

    // Fire transition callbacks
    const newStateMeta = this.getStateMeta(workflow.machineConfig, newState);
    this.fireTransitionCallbacks({
      project,
      workflowId: workflowId,
      workflowName: workflow.name,
      previousState,
      newState,
      event: resolvedEvent,
      data,
      newStateMeta,
      isFinal: this.isStateFinal(workflow.machineConfig, newState),
    });

    return { previousState, currentState: newState, transitioned: true, workflow };
  }

  async getStatus(project: string, workflowId: string): Promise<WorkflowStatus> {
    const workflow = await this.readWorkflow(project, workflowId);
    const meta = this.getStateMeta(workflow.machineConfig, workflow.currentState);
    const availableEvents = this.getAvailableEvents(workflow.machineConfig, workflow.currentState);
    const isFinal = this.isStateFinal(workflow.machineConfig, workflow.currentState);

    return {
      id: workflow.id,
      name: workflow.name,
      currentState: workflow.currentState,
      stateLabel: meta.label || workflow.currentState,
      stateDescription: meta.description || '',
      availableEvents,
      isWaiting: !!meta.waitingFor,
      waitingFor: meta.waitingFor || null,
      waitingMessage: meta.waitingMessage || null,
      isFinal,
      version: workflow.version,
      updatedAt: workflow.updatedAt,
    };
  }

  async listWorkflows(
    project: string,
    filterTag?: string,
    filterState?: string,
  ): Promise<Array<{
    id: string;
    name: string;
    description: string;
    currentState: string;
    tags: string[];
    updatedAt: string;
    isWaiting: boolean;
    isFinal: boolean;
  }>> {
    const dir = this.getWorkflowsDir(project);

    if (!await fs.pathExists(dir)) {
      return [];
    }

    const files = await fs.readdir(dir);
    const workflowFiles = files.filter(f => f.endsWith('.workflow.json'));

    const results = [];
    for (const file of workflowFiles) {
      try {
        const workflow: WorkflowFile = await fs.readJson(path.join(dir, file));
        const meta = this.getStateMeta(workflow.machineConfig, workflow.currentState);

        if (filterTag && !(workflow.tags || []).includes(filterTag)) continue;
        if (filterState && workflow.currentState !== filterState) continue;

        results.push({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          currentState: workflow.currentState,
          tags: workflow.tags || [],
          updatedAt: workflow.updatedAt,
          isWaiting: !!meta.waitingFor,
          isFinal: this.isStateFinal(workflow.machineConfig, workflow.currentState),
        });
      } catch (err: any) {
        this.logger.warn(`Failed to read workflow file ${file}: ${err.message}`);
      }
    }

    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getDefinition(project: string, workflowId: string): Promise<WorkflowFile> {
    return this.readWorkflow(project, workflowId);
  }

  async deleteWorkflow(project: string, workflowId: string): Promise<{ success: boolean; message: string }> {
    const filePath = this.getWorkflowPath(project, workflowId);
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Workflow not found: ${workflowId} in project ${project}`);
    }

    await fs.remove(filePath);
    this.logger.log(`Deleted workflow ${workflowId} from project ${project}`);
    return { success: true, message: `Workflow ${workflowId} deleted` };
  }

  async getGraphRepresentation(
    project: string,
    workflowId: string,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; currentState: string }> {
    const workflow = await this.readWorkflow(project, workflowId);
    const { machineConfig, currentState } = workflow;

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const [stateName, stateConfig] of Object.entries(machineConfig.states)) {
      const meta = stateConfig.meta || {};
      const isFinal = stateConfig.type === 'final';
      const isWaiting = !!meta.waitingFor;
      const isInitial = stateName === machineConfig.initial;

      nodes.push({
        id: stateName,
        label: meta.label || stateName,
        description: meta.description,
        type: isFinal ? 'final' : isWaiting ? 'waiting' : isInitial ? 'initial' : 'normal',
        isCurrent: stateName === currentState,
        waitingFor: meta.waitingFor || undefined,
      });

      // Create edges from transitions
      if (stateConfig.on) {
        for (const [eventName, target] of Object.entries(stateConfig.on)) {
          const targetState = typeof target === 'string' ? target : target.target;
          edges.push({
            id: `${stateName}-${eventName}-${targetState}`,
            source: stateName,
            target: targetState,
            label: eventName,
          });
        }
      }
    }

    return { nodes, edges, currentState };
  }
}
