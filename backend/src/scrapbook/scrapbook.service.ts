import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import { LlmService } from '../llm/llm.service';

// Generate UUID v4 using native crypto
function uuidv4(): string {
  return crypto.randomUUID();
}

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

/**
 * Scrapbook node types following the PRD specification
 */
export type NodeType = 'ProjectTheme' | 'Category' | 'Subcategory' | 'Concept' | 'Attribute';

/**
 * Scrapbook node interface
 */
export interface ScrapbookNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  priority: number; // 1-10 (10 = highest)
  attentionWeight: number; // 0.01-1.00
  updatedAt: string;
  createdAt: string;
  iconName?: string;
  images?: string[];
  parentId?: string;
  customProperties?: Record<string, string | number>; // key = property id, value = property value
  groupId?: string; // ID of the group this node belongs to (if any)
  groupName?: string; // Name of the group (populated when fetching)
}

/**
 * Alternative group interface - represents a set of alternative options
 */
export interface AlternativeGroup {
  id: string;
  name: string;
  parentNodeId: string; // The parent node that has this group
  memberIds: string[]; // IDs of nodes that are members of this group
}

/**
 * Custom property definition
 */
export interface CustomPropertyDefinition {
  id: string;
  name: string;
  fieldType: 'text' | 'numeric' | 'currency';
  unit?: string; // e.g., 'kg', 'cm', '$', '€'
}

/**
 * Column configuration for topic table
 */
export interface ColumnConfig {
  id: string; // 'icon', 'label', 'images', 'priority', 'attention', 'description', 'created', 'actions' or custom property id
  visible: boolean;
  width?: number;
}

/**
 * Canvas settings for React Flow
 */
export interface CanvasSettings {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    expanded: boolean;
    childConnectorPosition?: 'Left' | 'Top' | 'Right' | 'Bottom'; // Which side the parent connector attaches to
  }>;
  zoom: number;
  viewport: { x: number; y: number };
  // Custom properties schema
  customProperties?: CustomPropertyDefinition[];
  // Column order and visibility for topic table
  columnConfig?: ColumnConfig[];
}

/**
 * Scrapbook Service
 *
 * Manages scrapbook mindmap nodes stored as RDF triples in quadstore.
 * Each project has its own knowledge graph namespace for scrapbook data.
 */
@Injectable()
export class ScrapbookService {
  private readonly logger = new Logger(ScrapbookService.name);
  private readonly baseUri = 'http://example.org/scrapbook/';
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || path.join(process.cwd(), '..', 'workspace');
  private quadstoreAvailable = false;

  constructor(private readonly llmService: LlmService) {
    this.checkQuadstoreAvailability();
  }

  private async checkQuadstoreAvailability(): Promise<void> {
    try {
      await axios.get(`${QUADSTORE_URL}/health`, { timeout: 2000 });
      this.quadstoreAvailable = true;
      this.logger.log('Quadstore service is available for scrapbook');
    } catch (error) {
      this.logger.warn('Quadstore service not available for scrapbook');
      this.quadstoreAvailable = false;
    }
  }

  private async ensureQuadstoreAvailable(): Promise<void> {
    // Re-check availability if previously unavailable (allows recovery without restart)
    if (!this.quadstoreAvailable) {
      await this.checkQuadstoreAvailability();
    }
    if (!this.quadstoreAvailable) {
      throw new BadRequestException('Quadstore service is not available. Please start the vector-store service on port 7000.');
    }
  }

  private getConfigPath(project: string, graphName: string = 'default'): string {
    if (graphName === 'default') {
      return path.join(this.workspaceDir, project, '.etienne', 'scrapbook.json');
    }
    return path.join(this.workspaceDir, project, '.etienne', `scrapbook.${graphName}.json`);
  }

  private getImagesDir(project: string, graphName: string = 'default'): string {
    if (graphName === 'default') {
      return path.join(this.workspaceDir, project, 'scrapbook', 'images');
    }
    return path.join(this.workspaceDir, project, 'scrapbook', graphName, 'images');
  }

  /**
   * Get the namespace for a project's scrapbook
   */
  private getProjectNamespace(project: string, graphName: string = 'default'): string {
    if (graphName === 'default') {
      return `scrapbook-${project}`;
    }
    return `scrapbook-${project}-${graphName}`;
  }

  /**
   * Create a new scrapbook node
   */
  async createNode(project: string, node: Partial<ScrapbookNode>, parentId?: string, graphName: string = 'default'): Promise<ScrapbookNode> {
    await this.ensureQuadstoreAvailable();

    const now = new Date().toISOString();
    const newNode: ScrapbookNode = {
      id: node.id || uuidv4(),
      type: node.type || 'Category',
      label: node.label || 'New Node',
      description: node.description || '',
      priority: node.priority ?? 5,
      attentionWeight: node.attentionWeight ?? 0.5,
      updatedAt: now,
      createdAt: now,
      iconName: node.iconName,
      images: node.images || [],
      parentId: parentId,
      customProperties: node.customProperties || {},
    };

    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${newNode.id}`;
    const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    // Add type triple
    await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
      subject: nodeUri,
      predicate: rdfType,
      object: `${this.baseUri}${newNode.type}`,
      objectType: 'namedNode'
    });

    // Add property triples
    const properties = {
      label: newNode.label,
      description: newNode.description,
      priority: String(newNode.priority),
      attentionWeight: String(newNode.attentionWeight),
      updatedAt: newNode.updatedAt,
      createdAt: newNode.createdAt,
      iconName: newNode.iconName || '',
      images: JSON.stringify(newNode.images || []),
      customProperties: JSON.stringify(newNode.customProperties || {}),
    };

    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined && value !== null) {
        await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
          subject: nodeUri,
          predicate: `${this.baseUri}${key}`,
          object: value,
          objectType: 'literal'
        });
      }
    }

    // Add parent relationship if provided
    if (parentId) {
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: nodeUri,
        predicate: `${this.baseUri}hasParent`,
        object: `${this.baseUri}${parentId}`,
        objectType: 'namedNode'
      });
    }

    this.logger.log(`Created scrapbook node: ${newNode.label} (${newNode.id})`);
    return newNode;
  }

  /**
   * Get a node by ID
   */
  async getNode(project: string, nodeId: string, graphName: string = 'default'): Promise<ScrapbookNode | null> {
    await this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    try {
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: nodeUri,
        predicate: null,
        object: null
      });

      if (!response.data.results || response.data.results.length === 0) {
        return null;
      }

      return this.parseNodeFromTriples(response.data.results, nodeId);
    } catch (error: any) {
      this.logger.error(`Failed to get node ${nodeId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all nodes for a project
   */
  async getAllNodes(project: string, graphName: string = 'default'): Promise<ScrapbookNode[]> {
    await this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project, graphName);
    const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    try {
      // Find all scrapbook nodes by type
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: null,
        predicate: rdfType,
        object: null
      });

      if (!response.data.results || response.data.results.length === 0) {
        return [];
      }

      // Filter to only scrapbook types
      const scrapbookTypes = ['ProjectTheme', 'Category', 'Subcategory', 'Concept', 'Attribute'];
      const nodeUris = response.data.results
        .filter((quad: any) => {
          const type = quad.object.value.replace(this.baseUri, '');
          return scrapbookTypes.includes(type);
        })
        .map((quad: any) => quad.subject.value);

      // Get full details for each node
      const nodes: ScrapbookNode[] = [];
      for (const uri of nodeUris) {
        const nodeId = uri.replace(this.baseUri, '');
        const node = await this.getNode(project, nodeId, graphName);
        if (node) {
          nodes.push(node);
        }
      }

      return nodes;
    } catch (error: any) {
      this.logger.error(`Failed to get all nodes: ${error.message}`);
      return [];
    }
  }

  /**
   * Get root node (ProjectTheme)
   */
  async getRootNode(project: string, graphName: string = 'default'): Promise<ScrapbookNode | null> {
    const nodes = await this.getAllNodes(project, graphName);
    return nodes.find(n => n.type === 'ProjectTheme') || null;
  }

  /**
   * Get children of a node
   */
  async getChildren(project: string, parentId: string, graphName: string = 'default'): Promise<ScrapbookNode[]> {
    await this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project, graphName);
    const parentUri = `${this.baseUri}${parentId}`;

    try {
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: null,
        predicate: `${this.baseUri}hasParent`,
        object: parentUri
      });

      if (!response.data.results || response.data.results.length === 0) {
        return [];
      }

      const children: ScrapbookNode[] = [];
      for (const quad of response.data.results) {
        const childId = quad.subject.value.replace(this.baseUri, '');
        const child = await this.getNode(project, childId, graphName);
        if (child) {
          children.push(child);
        }
      }

      return children;
    } catch (error: any) {
      this.logger.error(`Failed to get children: ${error.message}`);
      return [];
    }
  }

  /**
   * Update a node
   */
  async updateNode(project: string, nodeId: string, updates: Partial<ScrapbookNode>, graphName: string = 'default'): Promise<ScrapbookNode> {
    this.logger.log(`updateNode called with nodeId=${nodeId}, updates=${JSON.stringify(updates)}`);

    const existingNode = await this.getNode(project, nodeId, graphName);
    if (!existingNode) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    this.logger.log(`Existing node customProperties: ${JSON.stringify(existingNode.customProperties)}`);

    // Delete old property triples
    await this.deleteNodeProperties(project, nodeId, graphName);

    // Create updated node - merge customProperties properly
    const mergedCustomProperties = {
      ...(existingNode.customProperties || {}),
      ...(updates.customProperties || {}),
    };

    const updatedNode: ScrapbookNode = {
      ...existingNode,
      ...updates,
      customProperties: mergedCustomProperties,
      id: nodeId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    this.logger.log(`Updated node customProperties: ${JSON.stringify(updatedNode.customProperties)}`);

    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    // Re-add property triples
    const properties = {
      label: updatedNode.label,
      description: updatedNode.description,
      priority: String(updatedNode.priority),
      attentionWeight: String(updatedNode.attentionWeight),
      updatedAt: updatedNode.updatedAt,
      createdAt: updatedNode.createdAt,
      iconName: updatedNode.iconName || '',
      images: JSON.stringify(updatedNode.images || []),
      customProperties: JSON.stringify(updatedNode.customProperties || {}),
    };

    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined && value !== null) {
        await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
          subject: nodeUri,
          predicate: `${this.baseUri}${key}`,
          object: value,
          objectType: 'literal'
        });
      }
    }

    this.logger.log(`Updated scrapbook node: ${updatedNode.label} (${nodeId})`);
    return updatedNode;
  }

  /**
   * Update the parent of a node (change connection)
   */
  async updateNodeParent(project: string, nodeId: string, newParentId: string | null, graphName: string = 'default'): Promise<ScrapbookNode> {
    await this.ensureQuadstoreAvailable();

    const node = await this.getNode(project, nodeId, graphName);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    if (node.type === 'ProjectTheme') {
      throw new BadRequestException('Cannot change parent of root node');
    }

    // Validate new parent exists (if not null)
    if (newParentId) {
      const newParent = await this.getNode(project, newParentId, graphName);
      if (!newParent) {
        throw new NotFoundException(`New parent node ${newParentId} not found`);
      }

      // Prevent circular references - check if newParentId is a descendant of nodeId
      const isDescendant = await this.isDescendantOf(project, newParentId, nodeId, graphName);
      if (isDescendant) {
        throw new BadRequestException('Cannot set a descendant as parent (circular reference)');
      }
    }

    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    // Remove existing parent relationship
    if (node.parentId) {
      try {
        await axios.delete(`${QUADSTORE_URL}/${namespace}/quad`, {
          data: {
            subject: nodeUri,
            predicate: `${this.baseUri}hasParent`,
            object: `${this.baseUri}${node.parentId}`,
            objectType: 'namedNode'
          }
        });
      } catch (e) {
        this.logger.warn(`Failed to delete old parent relationship: ${e.message}`);
      }
    }

    // Add new parent relationship if provided
    if (newParentId) {
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: nodeUri,
        predicate: `${this.baseUri}hasParent`,
        object: `${this.baseUri}${newParentId}`,
        objectType: 'namedNode'
      });
    }

    this.logger.log(`Updated parent of node ${nodeId} from ${node.parentId || 'none'} to ${newParentId || 'none'}`);

    // Return updated node
    return await this.getNode(project, nodeId, graphName);
  }

  /**
   * Check if a node is a descendant of another node
   */
  private async isDescendantOf(project: string, nodeId: string, potentialAncestorId: string, graphName: string = 'default'): Promise<boolean> {
    const children = await this.getChildren(project, potentialAncestorId, graphName);
    for (const child of children) {
      if (child.id === nodeId) {
        return true;
      }
      if (await this.isDescendantOf(project, nodeId, child.id, graphName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Delete a node and all its descendants
   */
  async deleteNode(project: string, nodeId: string, graphName: string = 'default'): Promise<void> {
    const node = await this.getNode(project, nodeId, graphName);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    if (node.type === 'ProjectTheme') {
      throw new BadRequestException('Cannot delete root node');
    }

    // Recursively delete children first
    const children = await this.getChildren(project, nodeId, graphName);
    for (const child of children) {
      await this.deleteNode(project, child.id, graphName);
    }

    // Delete the node itself
    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    try {
      await axios.delete(`${QUADSTORE_URL}/${namespace}/entity/${encodeURIComponent(nodeUri)}`);
      this.logger.log(`Deleted scrapbook node: ${node.label} (${nodeId})`);
    } catch (error: any) {
      this.logger.error(`Failed to delete node ${nodeId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find node by label (case insensitive)
   */
  async findNodeByLabel(project: string, label: string, graphName: string = 'default'): Promise<ScrapbookNode | null> {
    const nodes = await this.getAllNodes(project, graphName);
    return nodes.find(n => n.label.toLowerCase() === label.toLowerCase()) || null;
  }

  /**
   * Get full tree structure
   */
  async getTree(project: string, graphName: string = 'default'): Promise<any> {
    const root = await this.getRootNode(project, graphName);
    if (!root) {
      return null;
    }

    const buildTree = async (node: ScrapbookNode): Promise<any> => {
      const children = await this.getChildren(project, node.id, graphName);
      const childTrees = await Promise.all(children.map(c => buildTree(c)));
      return {
        ...node,
        children: childTrees.sort((a, b) => b.priority - a.priority),
      };
    };

    return buildTree(root);
  }

  /**
   * Save canvas settings
   */
  async saveCanvasSettings(project: string, settings: CanvasSettings, graphName: string = 'default'): Promise<void> {
    const configPath = this.getConfigPath(project, graphName);
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, settings, { spaces: 2 });
    this.logger.log(`Saved canvas settings for project: ${project}, graph: ${graphName}`);
  }

  /**
   * Load canvas settings
   */
  async loadCanvasSettings(project: string, graphName: string = 'default'): Promise<CanvasSettings | null> {
    const configPath = this.getConfigPath(project, graphName);
    try {
      if (await fs.pathExists(configPath)) {
        return await fs.readJson(configPath);
      }
    } catch (error: any) {
      this.logger.error(`Failed to load canvas settings: ${error.message}`);
    }
    return null;
  }

  /**
   * Upload an image for a node
   * Returns the filename and optionally the updated description if describe_image was enabled
   */
  async uploadImage(project: string, nodeId: string, filename: string, buffer: Buffer, describeImage: boolean = false, graphName: string = 'default'): Promise<{ filename: string; description?: string }> {
    const imagesDir = this.getImagesDir(project, graphName);
    await fs.ensureDir(imagesDir);

    const ext = path.extname(filename);
    const newFilename = `${nodeId}-${uuidv4()}${ext}`;
    const filepath = path.join(imagesDir, newFilename);

    await fs.writeFile(filepath, buffer);

    // Update node with new image
    const node = await this.getNode(project, nodeId, graphName);
    let updatedDescription: string | undefined;

    if (node) {
      const images = [...(node.images || []), newFilename];
      const updates: Partial<ScrapbookNode> = { images };

      // If describe image is enabled, use Claude to describe the image
      if (describeImage) {
        try {
          const imageDescription = await this.describeImageWithClaude(buffer, ext);
          // Append description to existing description
          const currentDescription = node.description || '';
          const newDescription = currentDescription
            ? `${currentDescription}\n\n${imageDescription}`
            : imageDescription;
          updates.description = newDescription;
          updatedDescription = newDescription;
          this.logger.log(`Added image description for node ${nodeId}`);
        } catch (error: any) {
          this.logger.error(`Failed to describe image: ${error.message}`);
          // Continue without description - don't fail the upload
        }
      }

      await this.updateNode(project, nodeId, updates, graphName);
    }

    return { filename: newFilename, description: updatedDescription };
  }

  /**
   * Describe an image using the configured LLM provider (vision)
   */
  private async describeImageWithClaude(buffer: Buffer, extension: string): Promise<string> {
    const text = await this.llmService.generateTextWithMessages({
      tier: 'regular',
      maxOutputTokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: buffer },
            {
              type: 'text',
              text: 'Describe what you see in 4 sentences. Be neutral and look for details to recognize the overall style, mood or tone. Do not start with "This image shows" or similar phrases - just describe the content directly.',
            },
          ],
        },
      ],
    });

    if (!text) {
      throw new Error('No text response from LLM');
    }
    return text;
  }

  /**
   * Delete an image
   */
  async deleteImage(project: string, nodeId: string, filename: string, graphName: string = 'default'): Promise<void> {
    const imagesDir = this.getImagesDir(project, graphName);
    const filepath = path.join(imagesDir, filename);

    if (await fs.pathExists(filepath)) {
      await fs.remove(filepath);
    }

    // Update node to remove image reference
    const node = await this.getNode(project, nodeId, graphName);
    if (node) {
      const images = (node.images || []).filter(img => img !== filename);
      await this.updateNode(project, nodeId, { images }, graphName);
    }
  }

  /**
   * Initialize with example data (Building a House)
   */
  async initializeExampleData(project: string, graphName: string = 'default'): Promise<ScrapbookNode> {
    // Check if root already exists
    const existingRoot = await this.getRootNode(project, graphName);
    if (existingRoot) {
      // Delete existing data first
      const allNodes = await this.getAllNodes(project, graphName);
      for (const node of allNodes) {
        if (node.type !== 'ProjectTheme') {
          try {
            await this.deleteNode(project, node.id, graphName);
          } catch (e) {
            // Ignore errors during cleanup
          }
        }
      }
      // Delete root
      const namespace = this.getProjectNamespace(project, graphName);
      const nodeUri = `${this.baseUri}${existingRoot.id}`;
      try {
        await axios.delete(`${QUADSTORE_URL}/${namespace}/entity/${encodeURIComponent(nodeUri)}`);
      } catch (e) {
        // Ignore
      }
    }

    // Create root node
    const root = await this.createNode(project, {
      type: 'ProjectTheme',
      label: 'Building a House',
      description: 'I want to build a house for me, my wife and two little children and our cat. It should have a cozy familiar atmosphere.',
      priority: 10,
      attentionWeight: 1.0,
      iconName: 'FaHome',
    }, undefined, graphName);

    // Create categories with subcategories
    // Only Living Room and Kitchen have priorities set; all others have priority 0
    const categories = [
      {
        label: 'Living Room',
        iconName: 'FaCouch',
        priority: 8,
        attentionWeight: 0.85,
        subcategories: [
          { label: 'Sofa', iconName: 'FaCouch', priority: 0, description: 'Main seating area' },
          { label: 'TV Setup', iconName: 'FaTv', priority: 0, description: 'Entertainment center' },
          { label: 'Coffee Table', iconName: 'FaTable', priority: 0 },
          { label: 'Lighting', iconName: 'FaLightbulb', priority: 0 },
          { label: 'Plants', iconName: 'FaLeaf', priority: 0 },
        ]
      },
      {
        label: 'Masterbedroom & Bath',
        iconName: 'FaBed',
        priority: 0,
        attentionWeight: 0.80,
        subcategories: [
          { label: 'Bed Frame', iconName: 'FaBed', priority: 0 },
          { label: 'Wardrobe', iconName: 'FaDoorClosed', priority: 0 },
          { label: 'Bathroom Fixtures', iconName: 'FaBath', priority: 0 },
          { label: 'Vanity', iconName: 'FaMirror', priority: 0 },
        ]
      },
      {
        label: 'Child 1 Room',
        iconName: 'FaChild',
        priority: 0,
        attentionWeight: 0.75,
        subcategories: [
          { label: 'Bed', iconName: 'FaBed', priority: 0 },
          { label: 'Study Desk', iconName: 'FaDesktop', priority: 0 },
          { label: 'Toy Storage', iconName: 'FaBox', priority: 0 },
          { label: 'Bookshelf', iconName: 'FaBook', priority: 0 },
        ]
      },
      {
        label: 'Child 2 Room',
        iconName: 'FaChild',
        priority: 0,
        attentionWeight: 0.70,
        subcategories: [
          { label: 'Bed', iconName: 'FaBed', priority: 0 },
          { label: 'Play Area', iconName: 'FaPuzzlePiece', priority: 0 },
          { label: 'Wardrobe', iconName: 'FaDoorClosed', priority: 0 },
        ]
      },
      {
        label: 'Kitchen',
        iconName: 'FaUtensils',
        priority: 6,
        attentionWeight: 0.90,
        subcategories: [
          { label: 'Fridges', iconName: 'FaSnowflake', priority: 0, description: 'Compare features, prices and availability' },
          { label: 'Stove & Oven', iconName: 'FaFire', priority: 0 },
          { label: 'Dishwasher', iconName: 'FaWater', priority: 0 },
          { label: 'Countertops', iconName: 'FaLayerGroup', priority: 0 },
          { label: 'Cabinets', iconName: 'FaArchive', priority: 0 },
        ]
      },
    ];

    for (const cat of categories) {
      const category = await this.createNode(project, {
        type: 'Category',
        label: cat.label,
        iconName: cat.iconName,
        priority: cat.priority,
        attentionWeight: cat.attentionWeight,
      }, root.id, graphName);

      for (const sub of cat.subcategories) {
        await this.createNode(project, {
          type: 'Subcategory',
          label: sub.label,
          iconName: sub.iconName,
          priority: sub.priority,
          description: sub.description || '',
          attentionWeight: 0.5,
        }, category.id, graphName);
      }
    }

    this.logger.log(`Initialized example data for project: ${project}`);
    return root;
  }

  /**
   * Generate markdown description of the scrapbook
   */
  async describeScrapbook(project: string, categoryName?: string, graphName: string = 'default'): Promise<string> {
    let startNode: ScrapbookNode | null;

    if (categoryName) {
      startNode = await this.findNodeByLabel(project, categoryName, graphName);
      if (!startNode) {
        return `Category "${categoryName}" not found in scrapbook.`;
      }
    } else {
      startNode = await this.getRootNode(project, graphName);
      if (!startNode) {
        return 'Scrapbook is empty. No root node found.';
      }
    }

    const describeNode = async (node: ScrapbookNode, level: number): Promise<string> => {
      const prefix = '#'.repeat(Math.min(level, 5));
      let md = `${prefix} ${node.label}\n\n`;

      if (node.description) {
        md += `${node.description}\n\n`;
      }

      // Convert priority to human-readable text (skip for priority < 2)
      if (node.priority >= 9) {
        md += 'This is of highest priority.\n';
      } else if (node.priority >= 7) {
        md += 'This has high priority.\n';
      } else if (node.priority >= 5) {
        md += 'This has medium priority.\n';
      } else if (node.priority >= 2) {
        md += 'This has lower priority.\n';
      }
      // priority < 2: no sentence generated

      // Convert attention weight
      if (node.attentionWeight >= 0.8) {
        md += 'Currently under active focus.\n';
      } else if (node.attentionWeight >= 0.5) {
        md += 'Moderate attention currently.\n';
      } else if (node.attentionWeight >= 0.2) {
        md += 'Not actively focused on this item.\n';
      } else {
        md += 'This item is for information only.\n';
      }

      md += '\n';

      // Add children
      const children = await this.getChildren(project, node.id, graphName);
      for (const child of children.sort((a, b) => b.priority - a.priority)) {
        md += await describeNode(child, level + 1);
      }

      return md;
    };

    return describeNode(startNode, 1);
  }

  // Private helper methods

  private async deleteNodeProperties(project: string, nodeId: string, graphName: string = 'default'): Promise<void> {
    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    const properties = ['label', 'description', 'priority', 'attentionWeight', 'updatedAt', 'createdAt', 'iconName', 'images', 'customProperties'];

    for (const prop of properties) {
      try {
        // First query to find existing value
        const matchResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
          subject: nodeUri,
          predicate: `${this.baseUri}${prop}`,
          object: null
        });

        // Delete each matching quad specifically
        if (matchResponse.data.results) {
          for (const quad of matchResponse.data.results) {
            // Determine objectType based on the quad's object termType
            // All scrapbook properties are stored as literals
            const objectType = quad.object.type === 'Literal' ? 'literal' : 'namedNode';

            await axios.delete(`${QUADSTORE_URL}/${namespace}/quad`, {
              data: {
                subject: nodeUri,
                predicate: `${this.baseUri}${prop}`,
                object: quad.object.value,
                objectType: objectType
              }
            });
          }
        }
      } catch (e) {
        // Ignore errors - property might not exist
        this.logger.debug(`Failed to delete property ${prop} for node ${nodeId}: ${e.message}`);
      }
    }
  }

  private parseNodeFromTriples(triples: any[], nodeId: string): ScrapbookNode {
    const node: Partial<ScrapbookNode> = {
      id: nodeId,
      customProperties: {}, // Default to empty object for backwards compatibility
    };

    for (const triple of triples) {
      const predicate = triple.predicate.value.replace(this.baseUri, '');
      const value = triple.object.value;

      switch (predicate) {
        case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type':
          node.type = value.replace(this.baseUri, '') as NodeType;
          break;
        case 'label':
          node.label = value;
          break;
        case 'description':
          node.description = value;
          break;
        case 'priority':
          node.priority = parseInt(value, 10);
          break;
        case 'attentionWeight':
          node.attentionWeight = parseFloat(value);
          break;
        case 'updatedAt':
          node.updatedAt = value;
          break;
        case 'createdAt':
          node.createdAt = value;
          break;
        case 'iconName':
          node.iconName = value || undefined;
          break;
        case 'images':
          try {
            node.images = JSON.parse(value);
          } catch (e) {
            node.images = [];
          }
          break;
        case 'customProperties':
          try {
            node.customProperties = JSON.parse(value);
          } catch (e) {
            node.customProperties = {};
          }
          break;
        case 'hasParent':
          node.parentId = value.replace(this.baseUri, '');
          break;
      }
    }

    return node as ScrapbookNode;
  }

  /**
   * Create scrapbook from text using LLM extraction
   */
  async createFromText(project: string, text: string, graphName: string = 'default'): Promise<ScrapbookNode> {
    await this.ensureQuadstoreAvailable();

    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text content is required');
    }

    // Delete existing mindmap data if any
    const existingRoot = await this.getRootNode(project, graphName);
    if (existingRoot) {
      const allNodes = await this.getAllNodes(project, graphName);
      const namespace = this.getProjectNamespace(project, graphName);

      // Delete all nodes
      for (const node of allNodes) {
        const nodeUri = `${this.baseUri}${node.id}`;
        try {
          await axios.delete(`${QUADSTORE_URL}/${namespace}/entity/${encodeURIComponent(nodeUri)}`);
        } catch (e) {
          // Ignore deletion errors
        }
      }
      this.logger.log(`Cleared existing scrapbook data for project: ${project}`);
    }

    // Load the extraction prompt
    const promptPath = path.join(__dirname, '..', 'prompts', 'scrapbook-extraction.md');
    let systemPrompt: string;
    try {
      systemPrompt = await fs.readFile(promptPath, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to load extraction prompt: ${error.message}`);
      throw new BadRequestException('Failed to load extraction prompt');
    }

    // Call OpenAI to extract structure
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Define the JSON schema for structured output
    const schema = {
      type: 'object',
      properties: {
        root: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['ProjectTheme'] },
            label: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'number' },
            attentionWeight: { type: 'number' },
            iconName: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/node' },
            },
          },
          required: ['type', 'label', 'description', 'priority', 'attentionWeight', 'iconName', 'children'],
          additionalProperties: false,
        },
      },
      required: ['root'],
      additionalProperties: false,
      $defs: {
        node: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Category', 'Subcategory', 'Concept', 'Attribute'] },
            label: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'number' },
            attentionWeight: { type: 'number' },
            iconName: { type: 'string' },
            alternativeGroup: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/$defs/node' },
            },
          },
          required: ['type', 'label', 'description', 'priority', 'attentionWeight', 'iconName', 'children'],
          additionalProperties: false,
        },
      },
    };

    try {
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        instructions: systemPrompt,
        input: text,
        temperature: 0.3,
        text: {
          format: {
            type: 'json_schema',
            name: 'scrapbook_extraction',
            schema: schema,
          },
        },
      });

      // Extract the structured output from the response
      const outputItem = response.output.find((item: any) => item.type === 'message');
      if (!outputItem || !outputItem.content) {
        throw new Error('No message content in response');
      }

      const textContent = outputItem.content.find((c: any) => c.type === 'output_text');
      if (!textContent) {
        throw new Error('No text content in response');
      }

      const result = JSON.parse(textContent.text);
      this.logger.log(`Extracted scrapbook structure: ${JSON.stringify(result, null, 2)}`);

      // Create nodes from the extracted structure
      const rootData = result.root;
      const root = await this.createNode(project, {
        type: 'ProjectTheme',
        label: rootData.label,
        description: rootData.description,
        priority: rootData.priority,
        attentionWeight: rootData.attentionWeight,
        iconName: rootData.iconName,
      }, undefined, graphName);

      // Recursively create child nodes and track alternative groups
      const createChildren = async (parentId: string, children: any[], depth: number): Promise<Map<string, string[]>> => {
        // Map to track alternativeGroup -> nodeIds for this level
        const alternativeGroupsMap = new Map<string, string[]>();

        if (!children || children.length === 0) return alternativeGroupsMap;

        for (const child of children) {
          // Determine type based on depth if not specified
          let nodeType = child.type;
          if (!nodeType) {
            if (depth === 1) nodeType = 'Category';
            else if (depth === 2) nodeType = 'Subcategory';
            else if (depth === 3) nodeType = 'Concept';
            else nodeType = 'Attribute';
          }

          const node = await this.createNode(project, {
            type: nodeType as NodeType,
            label: child.label,
            description: child.description,
            priority: child.priority || 5,
            attentionWeight: child.attentionWeight || 0.5,
            iconName: child.iconName,
          }, parentId, graphName);

          // Track alternative group if specified
          if (child.alternativeGroup) {
            const groupName = child.alternativeGroup;
            if (!alternativeGroupsMap.has(groupName)) {
              alternativeGroupsMap.set(groupName, []);
            }
            alternativeGroupsMap.get(groupName)!.push(node.id);
          }

          // Process nested children
          if (child.children && child.children.length > 0) {
            const nestedGroups = await createChildren(node.id, child.children, depth + 1);
            // Process nested alternative groups at each level
            for (const [groupName, nodeIds] of nestedGroups.entries()) {
              if (nodeIds.length >= 2) {
                try {
                  await this.assignNodesToGroup(project, nodeIds, groupName, graphName);
                  this.logger.log(`Created alternative group "${groupName}" with ${nodeIds.length} nodes`);
                } catch (error: any) {
                  this.logger.warn(`Failed to create alternative group "${groupName}": ${error.message}`);
                }
              }
            }
          }
        }

        return alternativeGroupsMap;
      };

      if (rootData.children && rootData.children.length > 0) {
        const topLevelGroups = await createChildren(root.id, rootData.children, 1);
        // Process any top-level alternative groups
        for (const [groupName, nodeIds] of topLevelGroups.entries()) {
          if (nodeIds.length >= 2) {
            try {
              await this.assignNodesToGroup(project, nodeIds, groupName, graphName);
              this.logger.log(`Created alternative group "${groupName}" with ${nodeIds.length} nodes`);
            } catch (error: any) {
              this.logger.warn(`Failed to create alternative group "${groupName}": ${error.message}`);
            }
          }
        }
      }

      this.logger.log(`Created scrapbook from text for project: ${project}`);
      return root;
    } catch (error: any) {
      this.logger.error(`Failed to create scrapbook from text: ${error.message}`);
      throw new BadRequestException(`Failed to extract scrapbook structure: ${error.message}`);
    }
  }

  // ==================== GROUP MANAGEMENT ====================

  /**
   * Assign nodes to a group (creates new group or adds to existing)
   * A node can only be part of one group at a time - if it's already in a group, it will be moved
   */
  async assignNodesToGroup(
    project: string,
    nodeIds: string[],
    groupName: string,
    graphName: string = 'default',
  ): Promise<AlternativeGroup> {
    await this.ensureQuadstoreAvailable();

    if (!nodeIds || nodeIds.length < 2) {
      throw new BadRequestException('At least 2 nodes are required to form a group');
    }

    // Validate all nodes exist and have the same parent
    const nodes: ScrapbookNode[] = [];
    let commonParentId: string | undefined;

    for (const nodeId of nodeIds) {
      const node = await this.getNode(project, nodeId, graphName);
      if (!node) {
        throw new NotFoundException(`Node ${nodeId} not found`);
      }
      if (node.type === 'ProjectTheme') {
        throw new BadRequestException('Cannot add root node to a group');
      }

      // Check all nodes share the same parent
      if (commonParentId === undefined) {
        commonParentId = node.parentId;
      } else if (node.parentId !== commonParentId) {
        throw new BadRequestException('All nodes must share the same parent to form a group');
      }

      nodes.push(node);
    }

    if (!commonParentId) {
      throw new BadRequestException('Nodes must have a parent to form a group');
    }

    const namespace = this.getProjectNamespace(project, graphName);

    // Remove nodes from any existing groups first
    for (const node of nodes) {
      if (node.groupId) {
        await this.removeNodeFromGroupInternal(project, node.id, node.groupId, graphName);
      }
    }

    // Check if a group with this name already exists under this parent
    let groupId: string | undefined;
    const existingGroups = await this.getGroupsForParent(project, commonParentId, graphName);
    const existingGroup = existingGroups.find(g => g.name === groupName);

    if (existingGroup) {
      groupId = existingGroup.id;
    } else {
      // Create a new group
      groupId = uuidv4();
      const groupUri = `${this.baseUri}group-${groupId}`;
      const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

      // Add group type
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: groupUri,
        predicate: rdfType,
        object: `${this.baseUri}AlternativeGroup`,
        objectType: 'namedNode'
      });

      // Add group name
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: groupUri,
        predicate: `${this.baseUri}groupName`,
        object: groupName,
        objectType: 'literal'
      });

      // Link group to parent node
      const parentUri = `${this.baseUri}${commonParentId}`;
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: parentUri,
        predicate: `${this.baseUri}hasChildGroup`,
        object: groupUri,
        objectType: 'namedNode'
      });
    }

    // Add nodes as members of the group
    const groupUri = `${this.baseUri}group-${groupId}`;
    for (const nodeId of nodeIds) {
      const nodeUri = `${this.baseUri}${nodeId}`;
      await axios.post(`${QUADSTORE_URL}/${namespace}/quad`, {
        subject: groupUri,
        predicate: `${this.baseUri}hasMember`,
        object: nodeUri,
        objectType: 'namedNode'
      });
    }

    this.logger.log(`Assigned nodes ${nodeIds.join(', ')} to group "${groupName}" (${groupId})`);

    return {
      id: groupId,
      name: groupName,
      parentNodeId: commonParentId,
      memberIds: nodeIds,
    };
  }

  /**
   * Remove a node from its group
   */
  async removeNodeFromGroup(project: string, nodeId: string, graphName: string = 'default'): Promise<void> {
    await this.ensureQuadstoreAvailable();

    const node = await this.getNode(project, nodeId, graphName);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    // Find the group this node belongs to
    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    try {
      // Find all groups that have this node as a member
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: null,
        predicate: `${this.baseUri}hasMember`,
        object: nodeUri
      });

      if (response.data.results && response.data.results.length > 0) {
        for (const quad of response.data.results) {
          const groupUri = quad.subject.value;
          const groupId = groupUri.replace(`${this.baseUri}group-`, '');
          await this.removeNodeFromGroupInternal(project, nodeId, groupId, graphName);
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to remove node from group: ${error.message}`);
      throw error;
    }
  }

  /**
   * Internal helper to remove a node from a specific group
   */
  private async removeNodeFromGroupInternal(
    project: string,
    nodeId: string,
    groupId: string,
    graphName: string = 'default',
  ): Promise<void> {
    const namespace = this.getProjectNamespace(project, graphName);
    const groupUri = `${this.baseUri}group-${groupId}`;
    const nodeUri = `${this.baseUri}${nodeId}`;

    try {
      // Remove the hasMember relationship
      await axios.delete(`${QUADSTORE_URL}/${namespace}/quad`, {
        data: {
          subject: groupUri,
          predicate: `${this.baseUri}hasMember`,
          object: nodeUri,
          objectType: 'namedNode'
        }
      });

      // Check if the group still has any members
      const membersResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: groupUri,
        predicate: `${this.baseUri}hasMember`,
        object: null
      });

      // If no members left, delete the group
      if (!membersResponse.data.results || membersResponse.data.results.length === 0) {
        await this.deleteGroup(project, groupId, graphName);
      }

      this.logger.log(`Removed node ${nodeId} from group ${groupId}`);
    } catch (error: any) {
      this.logger.warn(`Failed to remove node from group: ${error.message}`);
    }
  }

  /**
   * Delete a group and all its relationships
   */
  private async deleteGroup(project: string, groupId: string, graphName: string = 'default'): Promise<void> {
    const namespace = this.getProjectNamespace(project, graphName);
    const groupUri = `${this.baseUri}group-${groupId}`;

    try {
      // Delete all quads where group is the subject
      await axios.delete(`${QUADSTORE_URL}/${namespace}/entity/${encodeURIComponent(groupUri)}`);

      // Delete hasChildGroup relationship from parent
      const parentResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: null,
        predicate: `${this.baseUri}hasChildGroup`,
        object: groupUri
      });

      if (parentResponse.data.results) {
        for (const quad of parentResponse.data.results) {
          await axios.delete(`${QUADSTORE_URL}/${namespace}/quad`, {
            data: {
              subject: quad.subject.value,
              predicate: `${this.baseUri}hasChildGroup`,
              object: groupUri,
              objectType: 'namedNode'
            }
          });
        }
      }

      this.logger.log(`Deleted group ${groupId}`);
    } catch (error: any) {
      this.logger.warn(`Failed to delete group ${groupId}: ${error.message}`);
    }
  }

  /**
   * Get all groups for a parent node
   */
  async getGroupsForParent(project: string, parentNodeId: string, graphName: string = 'default'): Promise<AlternativeGroup[]> {
    await this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project, graphName);
    const parentUri = `${this.baseUri}${parentNodeId}`;

    try {
      // Find all groups linked to this parent
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: parentUri,
        predicate: `${this.baseUri}hasChildGroup`,
        object: null
      });

      if (!response.data.results || response.data.results.length === 0) {
        return [];
      }

      const groups: AlternativeGroup[] = [];

      for (const quad of response.data.results) {
        const groupUri = quad.object.value;
        const groupId = groupUri.replace(`${this.baseUri}group-`, '');

        // Get group name
        const nameResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
          subject: groupUri,
          predicate: `${this.baseUri}groupName`,
          object: null
        });

        const groupName = nameResponse.data.results?.[0]?.object?.value || 'Unknown';

        // Get group members
        const membersResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
          subject: groupUri,
          predicate: `${this.baseUri}hasMember`,
          object: null
        });

        const memberIds = (membersResponse.data.results || [])
          .map((m: any) => m.object.value.replace(this.baseUri, ''));

        groups.push({
          id: groupId,
          name: groupName,
          parentNodeId,
          memberIds,
        });
      }

      return groups;
    } catch (error: any) {
      this.logger.error(`Failed to get groups for parent: ${error.message}`);
      return [];
    }
  }

  /**
   * Get group info for a specific node
   */
  async getNodeGroup(project: string, nodeId: string, graphName: string = 'default'): Promise<{ groupId: string; groupName: string } | null> {
    await this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project, graphName);
    const nodeUri = `${this.baseUri}${nodeId}`;

    try {
      // Find groups that have this node as a member
      const response = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: null,
        predicate: `${this.baseUri}hasMember`,
        object: nodeUri
      });

      if (!response.data.results || response.data.results.length === 0) {
        return null;
      }

      // Get the first (and should be only) group
      const groupUri = response.data.results[0].subject.value;
      const groupId = groupUri.replace(`${this.baseUri}group-`, '');

      // Get group name
      const nameResponse = await axios.post(`${QUADSTORE_URL}/${namespace}/match`, {
        subject: groupUri,
        predicate: `${this.baseUri}groupName`,
        object: null
      });

      const groupName = nameResponse.data.results?.[0]?.object?.value || 'Unknown';

      return { groupId, groupName };
    } catch (error: any) {
      this.logger.error(`Failed to get node group: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all nodes with their group info populated
   */
  async getAllNodesWithGroups(project: string, graphName: string = 'default'): Promise<ScrapbookNode[]> {
    const nodes = await this.getAllNodes(project, graphName);

    // Populate group info for each node
    for (const node of nodes) {
      const groupInfo = await this.getNodeGroup(project, node.id, graphName);
      if (groupInfo) {
        node.groupId = groupInfo.groupId;
        node.groupName = groupInfo.groupName;
      }
    }

    return nodes;
  }

  // ==================== MULTI-SCRAPBOOK MANAGEMENT ====================

  /**
   * List all scrapbooks for a project by scanning for .scbk files
   */
  async listScrapbooks(project: string): Promise<Array<{ name: string; graphName: string; createdAt: string; filename: string }>> {
    const projectDir = path.join(this.workspaceDir, project);
    try {
      const files = await fs.readdir(projectDir);
      const scrapbooks = [];

      for (const file of files) {
        if (file.endsWith('.scbk')) {
          try {
            const content = await fs.readJson(path.join(projectDir, file));
            scrapbooks.push({
              name: content.name || file,
              graphName: content.graphName,
              createdAt: content.createdAt,
              filename: file,
            });
          } catch {
            // Skip malformed .scbk files
          }
        }
      }

      return scrapbooks;
    } catch {
      return [];
    }
  }

  /**
   * Create a new scrapbook: write .scbk file and create root node
   */
  async createScrapbook(project: string, name: string): Promise<{ filename: string; graphName: string }> {
    const graphName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!graphName) {
      throw new BadRequestException('Invalid scrapbook name');
    }

    const filename = `scrapbook.${graphName}.scbk`;
    const projectDir = path.join(this.workspaceDir, project);
    const filePath = path.join(projectDir, filename);

    if (await fs.pathExists(filePath)) {
      throw new BadRequestException(`Scrapbook '${graphName}' already exists`);
    }

    const scbkContent = {
      name,
      graphName,
      createdAt: new Date().toISOString(),
      version: 1,
    };

    await fs.ensureDir(projectDir);
    await fs.writeJson(filePath, scbkContent, { spaces: 2 });

    // Create root node for this scrapbook
    await this.createNode(project, {
      type: 'ProjectTheme',
      label: name,
      description: '',
      priority: 5,
      attentionWeight: 0.5,
    }, undefined, graphName);

    this.logger.log(`Created scrapbook '${name}' (${graphName}) for project: ${project}`);
    return { filename, graphName };
  }

  /**
   * Delete a scrapbook: remove .scbk file, all graph data, canvas settings, and images
   */
  async deleteScrapbook(project: string, graphName: string): Promise<void> {
    const projectDir = path.join(this.workspaceDir, project);
    const filename = `scrapbook.${graphName}.scbk`;
    const filePath = path.join(projectDir, filename);

    // Delete the .scbk file
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }

    // Delete all graph data from Quadstore
    const namespace = this.getProjectNamespace(project, graphName);
    try {
      await axios.delete(`${QUADSTORE_URL}/${namespace}`);
    } catch {
      // Namespace may not exist yet
    }

    // Delete canvas settings file
    const configPath = this.getConfigPath(project, graphName);
    if (await fs.pathExists(configPath)) {
      await fs.remove(configPath);
    }

    // Delete images directory
    const imagesDir = this.getImagesDir(project, graphName);
    if (await fs.pathExists(imagesDir)) {
      await fs.remove(imagesDir);
    }

    this.logger.log(`Deleted scrapbook '${graphName}' for project: ${project}`);
  }
}
