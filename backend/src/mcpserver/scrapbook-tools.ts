import { ToolService, McpTool } from './types';
import { ScrapbookService } from '../scrapbook/scrapbook.service';
import { SSEPublisherService } from '../event-handling/publishers/sse-publisher.service';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Scrapbook Tools Service
 *
 * Provides MCP tools for AI agents to interact with the scrapbook/mindmap system.
 * Allows agents to understand the content of the knowledge graph and add new nodes.
 */

/**
 * Tool definitions for scrapbook management
 */
const tools: McpTool[] = [
  {
    name: 'scrapbook_create_root_node',
    description: 'Creates the root node (ProjectTheme) for a new scrapbook. This must be called before any other nodes can be added. Only one root node can exist per scrapbook. Returns an error if a root node already exists.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        label: {
          type: 'string',
          description: 'The label/name for the root node — typically the project or main topic name.',
        },
        description: {
          type: 'string',
          description: 'Optional description for the root node.',
        },
        icon_name: {
          type: 'string',
          description: 'Optional icon name from react-icons (e.g., "FaHome", "FaBook").',
        },
      },
      required: ['project', 'label'],
    },
  },
  {
    name: 'scrapbook_describe_node',
    description: 'Describes the content of the scrapbook/mindmap. If a category name is provided, returns the description of that category and its children. If no category is provided, returns the full scrapbook content. The description is formatted as markdown with priorities and attention weights translated to human-readable sentences.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        category_node_name: {
          type: 'string',
          description: 'Optional category node name to describe. Case insensitive. If empty, returns the full scrapbook content.',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'scrapbook_add_node',
    description: 'Adds a new node to the scrapbook under the specified parent node. The parent node name is case insensitive. Returns the created node or an error message if mandatory fields are missing.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        parent_node_name: {
          type: 'string',
          description: 'The name of the parent node under which to add the new node. Case insensitive.',
        },
        label: {
          type: 'string',
          description: 'The label/name for the new node.',
        },
        description: {
          type: 'string',
          description: 'Optional description for the new node.',
        },
        priority: {
          type: 'number',
          description: 'Priority level from 1-10 (10 = highest). Defaults to 5.',
        },
        attention_weight: {
          type: 'number',
          description: 'Attention weight from 0.01-1.00 (1.00 = highest focus). Defaults to 0.5.',
        },
        icon_name: {
          type: 'string',
          description: 'Optional icon name from react-icons (e.g., "FaHome", "FaBook").',
        },
      },
      required: ['project', 'parent_node_name', 'label'],
    },
  },
  {
    name: 'scrapbook_update_node',
    description: 'Updates an existing node in the scrapbook. The node name is case insensitive. Only provided fields will be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        node_name: {
          type: 'string',
          description: 'The name of the node to update. Case insensitive.',
        },
        new_label: {
          type: 'string',
          description: 'New label/name for the node.',
        },
        description: {
          type: 'string',
          description: 'New description for the node.',
        },
        priority: {
          type: 'number',
          description: 'New priority level from 1-10 (10 = highest).',
        },
        attention_weight: {
          type: 'number',
          description: 'New attention weight from 0.01-1.00 (1.00 = highest focus).',
        },
        icon_name: {
          type: 'string',
          description: 'New icon name from react-icons (e.g., "FaHome", "FaBook").',
        },
      },
      required: ['project', 'node_name'],
    },
  },
  {
    name: 'scrapbook_get_focus_items',
    description: 'Returns the nodes that should be focused on based on high priority and attention weight. Useful for understanding what the user considers most important.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        min_priority: {
          type: 'number',
          description: 'Minimum priority threshold (1-10). Defaults to 7.',
        },
        min_attention: {
          type: 'number',
          description: 'Minimum attention weight threshold (0.01-1.00). Defaults to 0.5.',
        },
      },
      required: ['project'],
    },
  },
];

/**
 * Create a scrapbook tools service with injected dependencies
 * @param scrapbookService - The scrapbook service instance
 * @returns ToolService instance
 */
export function createScrapbookToolsService(
  scrapbookService: ScrapbookService,
  ssePublisher?: SSEPublisherService,
): ToolService {

  /**
   * Create the root node (ProjectTheme) for a new scrapbook
   */
  async function createRootNode(
    project: string,
    label: string,
    description?: string,
    iconName?: string,
  ): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!label) {
      throw new Error('Label is required for the root node.');
    }

    // Check if a root node already exists
    const existingRoot = await scrapbookService.getRootNode(project);
    if (existingRoot) {
      return {
        success: false,
        error: `A root node already exists: "${existingRoot.label}". Each scrapbook can only have one root node.`,
      };
    }

    try {
      const newNode = await scrapbookService.createNode(
        project,
        {
          type: 'ProjectTheme',
          label,
          description: description || '',
          priority: 5,
          attentionWeight: 0.5,
          iconName,
        },
      );

      // Write the .scbk meta file so the UI auto-detects the scrapbook
      const workspaceDir = process.env.WORKSPACE_ROOT || path.join(process.cwd(), '..', 'workspace');
      const projectDir = path.join(workspaceDir, project);
      const filename = 'scrapbook.default.scbk';
      const filePath = path.join(projectDir, filename);

      if (!(await fs.pathExists(filePath))) {
        const scbkContent = {
          name: label,
          graphName: 'default',
          createdAt: new Date().toISOString(),
          version: 1,
        };
        await fs.ensureDir(projectDir);
        await fs.writeJson(filePath, scbkContent, { spaces: 2 });

        // Notify the frontend so the preview tab auto-opens
        if (ssePublisher) {
          ssePublisher.broadcastToProject(project, 'file_added', {
            path: filename,
          });
        }
      }

      return {
        success: true,
        message: `Successfully created scrapbook with root node "${label}"`,
        node: {
          id: newNode.id,
          label: newNode.label,
          type: newNode.type,
          priority: newNode.priority,
          attentionWeight: newNode.attentionWeight,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Root node could not be created because: * ${error.message}`,
      };
    }
  }

  /**
   * Describe a node or the full scrapbook
   */
  async function describeNode(project: string, categoryNodeName?: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    try {
      const markdown = await scrapbookService.describeScrapbook(project, categoryNodeName);
      return {
        success: true,
        description: markdown,
        categorySearched: categoryNodeName || '(full scrapbook)',
      };
    } catch (error: any) {
      throw new Error(`Failed to describe scrapbook: ${error.message}`);
    }
  }

  /**
   * Add a new node to the scrapbook
   */
  async function addNode(
    project: string,
    parentNodeName: string,
    label: string,
    description?: string,
    priority?: number,
    attentionWeight?: number,
    iconName?: string,
  ): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!parentNodeName) {
      throw new Error('Parent node name is required.');
    }

    if (!label) {
      throw new Error('Label is required for the new node.');
    }

    // Validate label uniqueness
    const existingNode = await scrapbookService.findNodeByLabel(project, label);
    if (existingNode) {
      return {
        success: false,
        error: `Node could not be created because: * A node with label "${label}" already exists.`,
      };
    }

    // Find parent node
    const parentNode = await scrapbookService.findNodeByLabel(project, parentNodeName);
    if (!parentNode) {
      return {
        success: false,
        error: `Node could not be created because: * Parent node "${parentNodeName}" not found.`,
      };
    }

    // Determine type based on parent type
    let nodeType: 'Category' | 'Subcategory' | 'Concept' | 'Attribute' = 'Subcategory';
    if (parentNode.type === 'ProjectTheme') {
      nodeType = 'Category';
    } else if (parentNode.type === 'Category') {
      nodeType = 'Subcategory';
    } else if (parentNode.type === 'Subcategory') {
      nodeType = 'Concept';
    } else {
      nodeType = 'Attribute';
    }

    try {
      const newNode = await scrapbookService.createNode(
        project,
        {
          type: nodeType,
          label,
          description: description || '',
          priority: priority ?? 5,
          attentionWeight: attentionWeight ?? 0.5,
          iconName,
        },
        parentNode.id,
      );

      return {
        success: true,
        message: `Successfully created node "${label}" under "${parentNodeName}"`,
        node: {
          id: newNode.id,
          label: newNode.label,
          type: newNode.type,
          parentId: newNode.parentId,
          priority: newNode.priority,
          attentionWeight: newNode.attentionWeight,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Node could not be created because: * ${error.message}`,
      };
    }
  }

  /**
   * Update an existing node
   */
  async function updateNode(
    project: string,
    nodeName: string,
    newLabel?: string,
    description?: string,
    priority?: number,
    attentionWeight?: number,
    iconName?: string,
  ): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!nodeName) {
      throw new Error('Node name is required.');
    }

    // Find the node
    const node = await scrapbookService.findNodeByLabel(project, nodeName);
    if (!node) {
      return {
        success: false,
        error: `Node "${nodeName}" not found.`,
      };
    }

    // Check for label uniqueness if changing label
    if (newLabel && newLabel.toLowerCase() !== node.label.toLowerCase()) {
      const existingNode = await scrapbookService.findNodeByLabel(project, newLabel);
      if (existingNode) {
        return {
          success: false,
          error: `Cannot rename: a node with label "${newLabel}" already exists.`,
        };
      }
    }

    try {
      const updates: any = {};
      if (newLabel !== undefined) updates.label = newLabel;
      if (description !== undefined) updates.description = description;
      if (priority !== undefined) updates.priority = priority;
      if (attentionWeight !== undefined) updates.attentionWeight = attentionWeight;
      if (iconName !== undefined) updates.iconName = iconName;

      const updatedNode = await scrapbookService.updateNode(project, node.id, updates);

      return {
        success: true,
        message: `Successfully updated node "${nodeName}"`,
        node: {
          id: updatedNode.id,
          label: updatedNode.label,
          type: updatedNode.type,
          priority: updatedNode.priority,
          attentionWeight: updatedNode.attentionWeight,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to update node: ${error.message}`,
      };
    }
  }

  /**
   * Get high-priority focus items
   */
  async function getFocusItems(
    project: string,
    minPriority: number = 7,
    minAttention: number = 0.5,
  ): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    try {
      const allNodes = await scrapbookService.getAllNodes(project);

      const focusItems = allNodes
        .filter(n => n.priority >= minPriority && n.attentionWeight >= minAttention)
        .sort((a, b) => {
          // Sort by priority first, then by attention weight
          if (b.priority !== a.priority) return b.priority - a.priority;
          return b.attentionWeight - a.attentionWeight;
        })
        .map(n => ({
          label: n.label,
          type: n.type,
          priority: n.priority,
          attentionWeight: n.attentionWeight,
          description: n.description || '(no description)',
        }));

      return {
        success: true,
        count: focusItems.length,
        thresholds: { minPriority, minAttention },
        focusItems,
      };
    } catch (error: any) {
      throw new Error(`Failed to get focus items: ${error.message}`);
    }
  }

  /**
   * Execute a tool by name with given arguments
   */
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'scrapbook_create_root_node':
        return createRootNode(
          args.project,
          args.label,
          args.description,
          args.icon_name,
        );

      case 'scrapbook_describe_node':
        return describeNode(args.project, args.category_node_name);

      case 'scrapbook_add_node':
        return addNode(
          args.project,
          args.parent_node_name,
          args.label,
          args.description,
          args.priority,
          args.attention_weight,
          args.icon_name,
        );

      case 'scrapbook_update_node':
        return updateNode(
          args.project,
          args.node_name,
          args.new_label,
          args.description,
          args.priority,
          args.attention_weight,
          args.icon_name,
        );

      case 'scrapbook_get_focus_items':
        return getFocusItems(args.project, args.min_priority, args.min_attention);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
