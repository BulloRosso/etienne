import { ToolService, McpTool } from './types';
import { UserOrdersService } from '../user-orders/user-orders.service';

export function createUserOrdersToolsService(
  userOrdersService: UserOrdersService,
): ToolService {
  const tools: McpTool[] = [
    {
      name: 'add_user_order',
      description:
        'Create a new user order to track a higher-level task. Use this when starting complex multi-step work like research, report creation, or monitoring tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'The chat session ID where the order is created',
          },
          projectName: {
            type: 'string',
            description: 'The project name where the chat session lives',
          },
          orderTitle: {
            type: 'string',
            description: 'Short title for the order (max 60 characters)',
          },
          orderDescription: {
            type: 'string',
            description: 'Description of the order (max 2096 characters)',
          },
          orderType: {
            type: 'string',
            description: 'Type of order',
            enum: ['Research', 'Scheduled Activity', 'Monitoring'],
          },
        },
        required: ['sessionId', 'projectName', 'orderTitle', 'orderDescription'],
      },
    },
    {
      name: 'update_user_order',
      description:
        'Update the status of an existing user order. Use this to report progress, completion, failure, or when human input is needed.',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'The UUID of the order to update',
          },
          statusNew: {
            type: 'string',
            description: 'The new status',
            enum: [
              'in-progress',
              'complete-success',
              'complete-failure',
              'canceled-by-user',
              'canceled-by-agent',
              'requires-human-input',
              'blocked-by',
              'paused',
            ],
          },
          statusMessage: {
            type: 'string',
            description: 'A message describing the status change',
          },
        },
        required: ['orderId', 'statusNew', 'statusMessage'],
      },
    },
    {
      name: 'get_user_order',
      description: 'Get the details of a specific user order by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'The UUID of the order to retrieve',
          },
        },
        required: ['orderId'],
      },
    },
  ];

  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'add_user_order': {
        const order = await userOrdersService.addOrder(
          args.sessionId,
          args.projectName,
          args.orderTitle,
          args.orderDescription,
          args.orderType || 'Research',
        );
        return { orderId: order.orderId };
      }
      case 'update_user_order': {
        const order = await userOrdersService.updateOrder(
          args.orderId,
          args.statusNew,
          args.statusMessage,
        );
        if (!order) {
          throw new Error(`Order '${args.orderId}' not found`);
        }
        return { success: true };
      }
      case 'get_user_order': {
        const order = await userOrdersService.getOrder(args.orderId);
        if (!order) {
          throw new Error(`Order '${args.orderId}' not found`);
        }
        return order;
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
