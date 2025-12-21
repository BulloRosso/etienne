/**
 * Confirmation Tools - Example tools demonstrating MCP elicitation
 *
 * These tools use the elicitation feature to request user confirmation
 * before performing potentially dangerous operations.
 */

import { ToolService, ElicitationCallback } from './types';

/**
 * Example tools that demonstrate elicitation for confirmations
 */
export const confirmationToolsService: ToolService = {
  tools: [
    {
      name: 'confirm_dangerous_operation',
      description: 'Performs a simulated dangerous operation that requires user confirmation before proceeding. Use this to test elicitation functionality.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          operation: {
            type: 'string',
            description: 'Description of the operation to perform'
          },
          target: {
            type: 'string',
            description: 'Target of the operation (e.g., file path, resource name)'
          }
        },
        required: ['operation', 'target']
      }
    },
    {
      name: 'confirm_with_options',
      description: 'Demonstrates elicitation with multiple form fields including selection, text input, and boolean confirmation.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform'
          }
        },
        required: ['action']
      }
    }
  ],

  execute: async (toolName: string, args: any, elicit?: ElicitationCallback): Promise<any> => {
    if (toolName === 'confirm_dangerous_operation') {
      return handleConfirmDangerousOperation(args, elicit);
    } else if (toolName === 'confirm_with_options') {
      return handleConfirmWithOptions(args, elicit);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }
};

/**
 * Handle the confirm_dangerous_operation tool
 */
async function handleConfirmDangerousOperation(
  args: { operation: string; target: string },
  elicit?: ElicitationCallback
): Promise<any> {
  if (!elicit) {
    return {
      error: true,
      message: 'Elicitation not available - cannot request user confirmation'
    };
  }

  // Request confirmation from user
  const result = await elicit(
    `⚠️ You are about to perform: "${args.operation}" on "${args.target}"\n\nThis action may be irreversible. Are you sure you want to proceed?`,
    {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          title: 'Confirm',
          description: 'Check this box to confirm the operation'
        },
        reason: {
          type: 'string',
          title: 'Reason (optional)',
          description: 'Optionally provide a reason for this operation'
        }
      },
      required: ['confirm']
    }
  );

  // Handle the response
  if (result.action === 'decline') {
    return {
      success: false,
      status: 'declined',
      message: 'User explicitly declined the operation'
    };
  }

  if (result.action === 'cancel') {
    return {
      success: false,
      status: 'cancelled',
      message: 'Operation was cancelled'
    };
  }

  if (result.action === 'accept' && result.content?.confirm === true) {
    // User confirmed - perform the operation (simulated)
    return {
      success: true,
      status: 'completed',
      message: `Operation "${args.operation}" was performed on "${args.target}"`,
      reason: result.content?.reason || 'No reason provided',
      timestamp: new Date().toISOString()
    };
  }

  return {
    success: false,
    status: 'not_confirmed',
    message: 'User did not confirm the operation'
  };
}

/**
 * Handle the confirm_with_options tool
 * Demonstrates various form field types
 */
async function handleConfirmWithOptions(
  args: { action: string },
  elicit?: ElicitationCallback
): Promise<any> {
  if (!elicit) {
    return {
      error: true,
      message: 'Elicitation not available - cannot request user input'
    };
  }

  // Request input with multiple field types
  const result = await elicit(
    `Configure settings for: "${args.action}"`,
    {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          title: 'Priority Level',
          description: 'Select the priority for this action',
          enum: ['low', 'medium', 'high', 'critical'],
          enumNames: ['Low Priority', 'Medium Priority', 'High Priority', 'Critical']
        },
        count: {
          type: 'integer',
          title: 'Repeat Count',
          description: 'How many times to perform this action',
          minimum: 1,
          maximum: 10
        },
        notify: {
          type: 'boolean',
          title: 'Send Notification',
          description: 'Send email notification when complete'
        },
        notes: {
          type: 'string',
          title: 'Notes',
          description: 'Additional notes for this action',
          maxLength: 500
        }
      },
      required: ['priority', 'count']
    }
  );

  if (result.action !== 'accept') {
    return {
      success: false,
      status: result.action,
      message: `User ${result.action}ed the request`
    };
  }

  // Process with user's selections
  return {
    success: true,
    status: 'configured',
    action: args.action,
    configuration: {
      priority: result.content?.priority,
      repeatCount: result.content?.count,
      notifyOnComplete: result.content?.notify || false,
      notes: result.content?.notes || ''
    },
    timestamp: new Date().toISOString()
  };
}

export default confirmationToolsService;
