import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';

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
}

/**
 * Canvas settings for React Flow
 */
export interface CanvasSettings {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    expanded: boolean;
  }>;
  zoom: number;
  viewport: { x: number; y: number };
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

  constructor() {
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

  private ensureQuadstoreAvailable(): void {
    if (!this.quadstoreAvailable) {
      throw new BadRequestException('Quadstore service is not available. Please start the vector-store service on port 7000.');
    }
  }

  private getConfigPath(project: string): string {
    return path.join(this.workspaceDir, project, '.etienne', 'scrapbook.json');
  }

  private getImagesDir(project: string): string {
    return path.join(this.workspaceDir, project, 'scrapbook', 'images');
  }

  /**
   * Get the namespace for a project's scrapbook
   */
  private getProjectNamespace(project: string): string {
    return `scrapbook-${project}`;
  }

  /**
   * Create a new scrapbook node
   */
  async createNode(project: string, node: Partial<ScrapbookNode>, parentId?: string): Promise<ScrapbookNode> {
    this.ensureQuadstoreAvailable();

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
    };

    const namespace = this.getProjectNamespace(project);
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
  async getNode(project: string, nodeId: string): Promise<ScrapbookNode | null> {
    this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project);
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
  async getAllNodes(project: string): Promise<ScrapbookNode[]> {
    this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project);
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
        const node = await this.getNode(project, nodeId);
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
  async getRootNode(project: string): Promise<ScrapbookNode | null> {
    const nodes = await this.getAllNodes(project);
    return nodes.find(n => n.type === 'ProjectTheme') || null;
  }

  /**
   * Get children of a node
   */
  async getChildren(project: string, parentId: string): Promise<ScrapbookNode[]> {
    this.ensureQuadstoreAvailable();

    const namespace = this.getProjectNamespace(project);
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
        const child = await this.getNode(project, childId);
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
  async updateNode(project: string, nodeId: string, updates: Partial<ScrapbookNode>): Promise<ScrapbookNode> {
    const existingNode = await this.getNode(project, nodeId);
    if (!existingNode) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    // Delete old property triples
    await this.deleteNodeProperties(project, nodeId);

    // Create updated node
    const updatedNode: ScrapbookNode = {
      ...existingNode,
      ...updates,
      id: nodeId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    const namespace = this.getProjectNamespace(project);
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
   * Delete a node and all its descendants
   */
  async deleteNode(project: string, nodeId: string): Promise<void> {
    const node = await this.getNode(project, nodeId);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    if (node.type === 'ProjectTheme') {
      throw new BadRequestException('Cannot delete root node');
    }

    // Recursively delete children first
    const children = await this.getChildren(project, nodeId);
    for (const child of children) {
      await this.deleteNode(project, child.id);
    }

    // Delete the node itself
    const namespace = this.getProjectNamespace(project);
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
  async findNodeByLabel(project: string, label: string): Promise<ScrapbookNode | null> {
    const nodes = await this.getAllNodes(project);
    return nodes.find(n => n.label.toLowerCase() === label.toLowerCase()) || null;
  }

  /**
   * Get full tree structure
   */
  async getTree(project: string): Promise<any> {
    const root = await this.getRootNode(project);
    if (!root) {
      return null;
    }

    const buildTree = async (node: ScrapbookNode): Promise<any> => {
      const children = await this.getChildren(project, node.id);
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
  async saveCanvasSettings(project: string, settings: CanvasSettings): Promise<void> {
    const configPath = this.getConfigPath(project);
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, settings, { spaces: 2 });
    this.logger.log(`Saved canvas settings for project: ${project}`);
  }

  /**
   * Load canvas settings
   */
  async loadCanvasSettings(project: string): Promise<CanvasSettings | null> {
    const configPath = this.getConfigPath(project);
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
   */
  async uploadImage(project: string, nodeId: string, filename: string, buffer: Buffer): Promise<string> {
    const imagesDir = this.getImagesDir(project);
    await fs.ensureDir(imagesDir);

    const ext = path.extname(filename);
    const newFilename = `${nodeId}-${uuidv4()}${ext}`;
    const filepath = path.join(imagesDir, newFilename);

    await fs.writeFile(filepath, buffer);

    // Update node with new image
    const node = await this.getNode(project, nodeId);
    if (node) {
      const images = [...(node.images || []), newFilename];
      await this.updateNode(project, nodeId, { images });
    }

    return newFilename;
  }

  /**
   * Delete an image
   */
  async deleteImage(project: string, nodeId: string, filename: string): Promise<void> {
    const imagesDir = this.getImagesDir(project);
    const filepath = path.join(imagesDir, filename);

    if (await fs.pathExists(filepath)) {
      await fs.remove(filepath);
    }

    // Update node to remove image reference
    const node = await this.getNode(project, nodeId);
    if (node) {
      const images = (node.images || []).filter(img => img !== filename);
      await this.updateNode(project, nodeId, { images });
    }
  }

  /**
   * Initialize with example data (Building a House)
   */
  async initializeExampleData(project: string): Promise<ScrapbookNode> {
    // Check if root already exists
    const existingRoot = await this.getRootNode(project);
    if (existingRoot) {
      // Delete existing data first
      const allNodes = await this.getAllNodes(project);
      for (const node of allNodes) {
        if (node.type !== 'ProjectTheme') {
          try {
            await this.deleteNode(project, node.id);
          } catch (e) {
            // Ignore errors during cleanup
          }
        }
      }
      // Delete root
      const namespace = this.getProjectNamespace(project);
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
    });

    // Create categories with subcategories
    const categories = [
      {
        label: 'Living Room',
        iconName: 'FaCouch',
        priority: 9,
        attentionWeight: 0.85,
        subcategories: [
          { label: 'Sofa', iconName: 'FaCouch', priority: 8, description: 'Main seating area' },
          { label: 'TV Setup', iconName: 'FaTv', priority: 7, description: 'Entertainment center' },
          { label: 'Coffee Table', iconName: 'FaTable', priority: 6 },
          { label: 'Lighting', iconName: 'FaLightbulb', priority: 7 },
          { label: 'Plants', iconName: 'FaLeaf', priority: 5 },
        ]
      },
      {
        label: 'Masterbedroom & Bath',
        iconName: 'FaBed',
        priority: 9,
        attentionWeight: 0.80,
        subcategories: [
          { label: 'Bed Frame', iconName: 'FaBed', priority: 8 },
          { label: 'Wardrobe', iconName: 'FaDoorClosed', priority: 7 },
          { label: 'Bathroom Fixtures', iconName: 'FaBath', priority: 8 },
          { label: 'Vanity', iconName: 'FaMirror', priority: 6 },
        ]
      },
      {
        label: 'Child 1 Room',
        iconName: 'FaChild',
        priority: 8,
        attentionWeight: 0.75,
        subcategories: [
          { label: 'Bed', iconName: 'FaBed', priority: 8 },
          { label: 'Study Desk', iconName: 'FaDesktop', priority: 7 },
          { label: 'Toy Storage', iconName: 'FaBox', priority: 6 },
          { label: 'Bookshelf', iconName: 'FaBook', priority: 6 },
        ]
      },
      {
        label: 'Child 2 Room',
        iconName: 'FaChild',
        priority: 8,
        attentionWeight: 0.70,
        subcategories: [
          { label: 'Bed', iconName: 'FaBed', priority: 8 },
          { label: 'Play Area', iconName: 'FaPuzzlePiece', priority: 7 },
          { label: 'Wardrobe', iconName: 'FaDoorClosed', priority: 6 },
        ]
      },
      {
        label: 'Kitchen',
        iconName: 'FaUtensils',
        priority: 9,
        attentionWeight: 0.90,
        subcategories: [
          { label: 'Fridges', iconName: 'FaSnowflake', priority: 9, description: 'Compare features, prices and availability' },
          { label: 'Stove & Oven', iconName: 'FaFire', priority: 9 },
          { label: 'Dishwasher', iconName: 'FaWater', priority: 7 },
          { label: 'Countertops', iconName: 'FaLayerGroup', priority: 8 },
          { label: 'Cabinets', iconName: 'FaArchive', priority: 7 },
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
      }, root.id);

      for (const sub of cat.subcategories) {
        await this.createNode(project, {
          type: 'Subcategory',
          label: sub.label,
          iconName: sub.iconName,
          priority: sub.priority,
          description: sub.description || '',
          attentionWeight: 0.5,
        }, category.id);
      }
    }

    this.logger.log(`Initialized example data for project: ${project}`);
    return root;
  }

  /**
   * Generate markdown description of the scrapbook
   */
  async describeScrapbook(project: string, categoryName?: string): Promise<string> {
    let startNode: ScrapbookNode | null;

    if (categoryName) {
      startNode = await this.findNodeByLabel(project, categoryName);
      if (!startNode) {
        return `Category "${categoryName}" not found in scrapbook.`;
      }
    } else {
      startNode = await this.getRootNode(project);
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

      // Convert priority to human-readable text
      if (node.priority >= 9) {
        md += 'This is of highest priority.\n';
      } else if (node.priority >= 7) {
        md += 'This has high priority.\n';
      } else if (node.priority >= 5) {
        md += 'This has medium priority.\n';
      } else {
        md += 'This has lower priority.\n';
      }

      // Convert attention weight
      if (node.attentionWeight >= 0.8) {
        md += 'Currently under active focus.\n';
      } else if (node.attentionWeight >= 0.5) {
        md += 'Moderate attention currently.\n';
      } else {
        md += 'Not actively focused on this item.\n';
      }

      md += '\n';

      // Add children
      const children = await this.getChildren(project, node.id);
      for (const child of children.sort((a, b) => b.priority - a.priority)) {
        md += await describeNode(child, level + 1);
      }

      return md;
    };

    return describeNode(startNode, 1);
  }

  // Private helper methods

  private async deleteNodeProperties(project: string, nodeId: string): Promise<void> {
    const namespace = this.getProjectNamespace(project);
    const nodeUri = `${this.baseUri}${nodeId}`;

    const properties = ['label', 'description', 'priority', 'attentionWeight', 'updatedAt', 'createdAt', 'iconName', 'images'];

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
    const node: Partial<ScrapbookNode> = { id: nodeId };

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
        case 'hasParent':
          node.parentId = value.replace(this.baseUri, '');
          break;
      }
    }

    return node as ScrapbookNode;
  }
}
