import { ToolService, McpTool, ElicitationCallback } from '../mcpserver/types';
import { StatefulWorkflowsService } from './stateful-workflows.service';
import { RuleEngineService } from '../event-handling/core/rule-engine.service';
import { EventRule } from '../event-handling/interfaces/event.interface';
import { randomUUID } from 'crypto';

/**
 * Workflow Tools Service
 *
 * Provides MCP tools for creating and managing XState v5 stateful workflows.
 * Supports human-in-the-loop via elicitation for chat-based approval states.
 */

const tools: McpTool[] = [
  {
    name: 'workflow_create',
    description: 'Create a new stateful workflow from an XState v5 machine configuration. The machine config must be a JSON-serializable XState v5 state machine definition with states and transitions. Returns the created workflow metadata. The workflow ID is a slug derived from the name (e.g., "Customer Onboarding" becomes "customer-onboarding").',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory path.',
        },
        name: {
          type: 'string',
          description: 'Human-readable name for the workflow (e.g., "Customer Onboarding", "Document Approval")',
        },
        description: {
          type: 'string',
          description: 'Description of what this workflow does',
        },
        machine_config: {
          type: 'object',
          description: 'XState v5 machine configuration object. Must include "initial" (string) and "states" (object mapping state names to state configurations). Each state config can have "on" (event-to-target mappings), "type" ("final" for end states), and "meta" (with optional "label", "description", "waitingFor" for human-in-the-loop states, and "onEntry" for state-entry actions). The waitingFor field can be "human_chat", "human_email", or "external". The onEntry field supports either "promptFile" (string, a .prompt file in workflows/ executed via Claude unattended endpoint, with optional "maxTurns" number default 20) OR "scriptFile" (string, a Python .py file in workflows/scripts/ executed directly, with optional "timeout" in seconds default 300). The script receives workflow context as JSON via stdin. Use promptFile for AI reasoning tasks; use scriptFile for deterministic data processing, API calls, or computations. For scripts, use "onSuccess" (string, event name to send after successful execution, e.g. "RECORDED") and "onError" (string, event name to send on failure, e.g. "ERROR") to automatically advance the workflow after script completion. Always specify onSuccess and onError so the workflow advances automatically.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization and filtering',
        },
      },
      required: ['project_name', 'name', 'machine_config'],
    },
  },
  {
    name: 'workflow_send_event',
    description: 'Send an event to a workflow to trigger a state transition. The event name must match a transition defined in the current state. If the new state is a human-in-the-loop state (waitingFor: "human_chat"), an interactive dialog will be shown to the user and the workflow may be automatically advanced based on their response. Returns the new state after the transition.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        workflow_id: {
          type: 'string',
          description: 'The workflow ID (slug derived from workflow name, e.g., "customer-onboarding")',
        },
        event: {
          type: 'string',
          description: 'The event name to send (e.g., "APPROVE", "REJECT", "SUBMIT", "TIMEOUT")',
        },
        data: {
          type: 'object',
          description: 'Optional event payload data',
        },
      },
      required: ['project_name', 'workflow_id', 'event'],
    },
  },
  {
    name: 'workflow_get_status',
    description: 'Get the current state, metadata, and available transitions for a workflow. Returns the workflow name, current state, state description, available events, and whether it is waiting for human input.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        workflow_id: {
          type: 'string',
          description: 'The workflow ID (slug derived from workflow name, e.g., "customer-onboarding")',
        },
      },
      required: ['project_name', 'workflow_id'],
    },
  },
  {
    name: 'workflow_list',
    description: 'List all workflows for a project with their current states. Optionally filter by tag or current state name.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        tag: {
          type: 'string',
          description: 'Optional: filter workflows by tag',
        },
        state: {
          type: 'string',
          description: 'Optional: filter workflows by current state name',
        },
      },
      required: ['project_name'],
    },
  },
  {
    name: 'workflow_get_definition',
    description: 'Get the full machine definition, persisted snapshot, and transition history of a workflow. Returns the complete workflow file content.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        workflow_id: {
          type: 'string',
          description: 'The workflow ID (slug derived from workflow name, e.g., "customer-onboarding")',
        },
      },
      required: ['project_name', 'workflow_id'],
    },
  },
  {
    name: 'workflow_delete',
    description: 'Delete a workflow permanently. This removes the workflow file from the project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        workflow_id: {
          type: 'string',
          description: 'The workflow ID (slug derived from workflow name, e.g., "customer-onboarding")',
        },
      },
      required: ['project_name', 'workflow_id'],
    },
  },
  {
    name: 'workflow_register_trigger',
    description: 'Register a condition monitoring rule that triggers a workflow state transition when an event matches. This connects real-time events (Email, MQTT, Filesystem, Webhook, etc.) to workflow transitions. Returns the created rule with its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        rule_name: {
          type: 'string',
          description: 'Human-readable name for the trigger rule (e.g., "Email triggers approval workflow")',
        },
        workflow_id: {
          type: 'string',
          description: 'The target workflow ID (slug, e.g., "customer-onboarding")',
        },
        workflow_event: {
          type: 'string',
          description: 'The event name to send to the workflow when triggered (e.g., "EMAIL_RECEIVED", "SENSOR_ALERT"). Must match a transition in the workflow\'s current state.',
        },
        condition: {
          type: 'object',
          description: 'The event condition to match. Use type "simple" for exact matching (e.g., {"type":"simple","event":{"group":"Email","name":"Email Received"}}), or "email-semantic" for natural language email filtering (e.g., {"type":"email-semantic","criteria":"emails about invoices"}).',
        },
        map_payload: {
          type: 'boolean',
          description: 'If true, the full triggering event payload is passed as data to the workflow transition. Default: true.',
        },
      },
      required: ['project_name', 'rule_name', 'workflow_id', 'workflow_event', 'condition'],
    },
  },
  {
    name: 'workflow_unregister_trigger',
    description: 'Remove a condition monitoring rule that was triggering a workflow. Pass either the rule_id to delete a specific rule, or workflow_id to delete all trigger rules for that workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        rule_id: {
          type: 'string',
          description: 'The specific rule ID to delete. Use workflow_list_triggers or check the rule ID returned by workflow_register_trigger.',
        },
        workflow_id: {
          type: 'string',
          description: 'Delete all trigger rules targeting this workflow ID. Used when you want to clean up all triggers for a workflow.',
        },
      },
      required: ['project_name'],
    },
  },
  {
    name: 'workflow_list_triggers',
    description: 'List all condition monitoring rules that trigger workflows for a project. Optionally filter by workflow_id to see only triggers for a specific workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project name (directory name in workspace)',
        },
        workflow_id: {
          type: 'string',
          description: 'Optional: filter to only show triggers for this workflow',
        },
      },
      required: ['project_name'],
    },
  },
];

/**
 * Create workflow tools service with dependencies
 */
export function createWorkflowToolsService(
  workflowsService: StatefulWorkflowsService,
  ruleEngineService?: RuleEngineService,
): ToolService {

  async function execute(toolName: string, args: any, elicit?: ElicitationCallback): Promise<any> {
    switch (toolName) {
      case 'workflow_create':
        return workflowsService.createWorkflow(
          args.project_name,
          args.name,
          args.description || '',
          args.machine_config,
          args.tags,
        );

      case 'workflow_send_event': {
        const result = await workflowsService.sendEvent(
          args.project_name,
          args.workflow_id,
          args.event,
          args.data,
        );

        // Check if new state is waiting for human chat input
        const status = await workflowsService.getStatus(args.project_name, args.workflow_id);
        if (status.isWaiting && status.waitingFor === 'human_chat' && elicit) {
          // Build available actions from the state's transitions
          const availableActions = status.availableEvents.map(e => e.toLowerCase());
          const enumValues = status.availableEvents;
          const enumNames = status.availableEvents.map(e =>
            e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          );

          const elicitResult = await elicit(
            status.waitingMessage || `Workflow "${status.name}" is waiting for your input in state "${status.stateLabel}".`,
            {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  title: 'Action',
                  description: 'Choose how to proceed',
                  enum: enumValues,
                  enumNames,
                },
                notes: {
                  type: 'string',
                  title: 'Notes',
                  description: 'Optional notes or additional information',
                  maxLength: 500,
                },
              },
              required: ['action'],
            },
          );

          if (elicitResult.action === 'accept' && elicitResult.content?.action) {
            // Auto-advance the workflow based on user choice
            const followUp = await workflowsService.sendEvent(
              args.project_name,
              args.workflow_id,
              elicitResult.content.action,
              { notes: elicitResult.content.notes, source: 'human_chat' },
            );
            return {
              ...result,
              humanResponse: elicitResult.content,
              followUpTransition: {
                previousState: followUp.previousState,
                currentState: followUp.currentState,
              },
            };
          }

          return {
            ...result,
            waitingForHuman: true,
            elicitationResult: elicitResult.action,
          };
        }

        return result;
      }

      case 'workflow_get_status':
        return workflowsService.getStatus(args.project_name, args.workflow_id);

      case 'workflow_list':
        return workflowsService.listWorkflows(args.project_name, args.tag, args.state);

      case 'workflow_get_definition':
        return workflowsService.getDefinition(args.project_name, args.workflow_id);

      case 'workflow_delete':
        return workflowsService.deleteWorkflow(args.project_name, args.workflow_id);

      case 'workflow_register_trigger': {
        if (!ruleEngineService) {
          throw new Error('Rule engine not available — trigger registration is not supported');
        }
        await ruleEngineService.loadRules(args.project_name);

        const rule: EventRule = {
          id: randomUUID(),
          name: args.rule_name,
          enabled: true,
          condition: args.condition,
          action: {
            type: 'workflow_event',
            workflowId: args.workflow_id,
            event: args.workflow_event,
            mapPayload: args.map_payload !== false, // default true
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        ruleEngineService.addRule(args.project_name, rule);
        await ruleEngineService.saveRules(args.project_name);

        return {
          success: true,
          message: `Trigger rule "${rule.name}" registered (${rule.id})`,
          rule,
        };
      }

      case 'workflow_unregister_trigger': {
        if (!ruleEngineService) {
          throw new Error('Rule engine not available — trigger management is not supported');
        }
        if (!args.rule_id && !args.workflow_id) {
          throw new Error('Either rule_id or workflow_id must be provided');
        }

        await ruleEngineService.loadRules(args.project_name);

        if (args.rule_id) {
          // Delete a specific rule
          const deleted = ruleEngineService.deleteRule(args.project_name, args.rule_id);
          if (!deleted) {
            return { success: false, message: `Rule "${args.rule_id}" not found` };
          }
          await ruleEngineService.saveRules(args.project_name);
          return { success: true, message: `Trigger rule "${args.rule_id}" deleted` };
        }

        // Delete all workflow_event rules targeting this workflow_id
        const allRules = ruleEngineService.getAllRules(args.project_name);
        const toDelete = allRules.filter(
          r => r.action.type === 'workflow_event' && (r.action as any).workflowId === args.workflow_id,
        );

        if (toDelete.length === 0) {
          return { success: false, message: `No trigger rules found for workflow "${args.workflow_id}"` };
        }

        for (const r of toDelete) {
          ruleEngineService.deleteRule(args.project_name, r.id);
        }
        await ruleEngineService.saveRules(args.project_name);

        return {
          success: true,
          message: `Deleted ${toDelete.length} trigger rule(s) for workflow "${args.workflow_id}"`,
          deletedRuleIds: toDelete.map(r => r.id),
        };
      }

      case 'workflow_list_triggers': {
        if (!ruleEngineService) {
          throw new Error('Rule engine not available — trigger listing is not supported');
        }
        await ruleEngineService.loadRules(args.project_name);

        const allRules = ruleEngineService.getAllRules(args.project_name);
        let workflowRules = allRules.filter(r => r.action.type === 'workflow_event');

        if (args.workflow_id) {
          workflowRules = workflowRules.filter(
            r => (r.action as any).workflowId === args.workflow_id,
          );
        }

        return {
          count: workflowRules.length,
          triggers: workflowRules.map(r => ({
            ruleId: r.id,
            ruleName: r.name,
            enabled: r.enabled,
            condition: r.condition,
            workflowId: (r.action as any).workflowId,
            workflowEvent: (r.action as any).event,
            mapPayload: (r.action as any).mapPayload,
          })),
        };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
