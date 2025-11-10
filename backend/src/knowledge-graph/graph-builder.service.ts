import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';
const BASE_URI = 'http://example.org/kg/';

export interface Entity {
  id: string;
  type: 'Person' | 'Company' | 'Product' | 'Document';
  properties: Record<string, any>;
}

export interface Relationship {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'literal' | 'namedNode';
}

/**
 * GraphBuilderService - Extensible service for building knowledge graphs
 *
 * This service provides methods to:
 * - Add entities to the knowledge graph
 * - Create relationships between entities
 * - Update entity properties
 * - Query the graph
 *
 * Design principles:
 * - Stateless operations
 * - Clear separation between data and operations
 * - Easy to extend with new entity types
 * - Supports custom predicates and properties
 */
@Injectable()
export class GraphBuilderService {
  private readonly logger = new Logger(GraphBuilderService.name);

  /**
   * Add a single entity to the knowledge graph
   */
  async addEntity(project: string, entity: Entity): Promise<void> {
    try {
      const entityUri = `${BASE_URI}${entity.type}/${entity.id}`;
      const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const typeUri = `${BASE_URI}${entity.type}`;

      // Add type triple
      await this.addTriple(project, {
        subject: entityUri,
        predicate: rdfType,
        object: typeUri,
        objectType: 'namedNode'
      });

      // Add property triples
      for (const [key, value] of Object.entries(entity.properties)) {
        if (value !== null && value !== undefined) {
          await this.addTriple(project, {
            subject: entityUri,
            predicate: `${BASE_URI}${key}`,
            object: String(value),
            objectType: 'literal'
          });
        }
      }

      this.logger.log(`Added entity: ${entity.type}/${entity.id}`);
    } catch (error) {
      this.logger.error(`Failed to add entity ${entity.type}/${entity.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if an entity already exists in the knowledge graph
   */
  async entityExists(project: string, entityType: string, entityId: string): Promise<boolean> {
    try {
      const entityUri = `${BASE_URI}${entityType}/${entityId}`;
      const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: entityUri,
        predicate: rdfType,
        object: null
      }, {
        timeout: 5000
      });

      return response.data.results && response.data.results.length > 0;
    } catch (error) {
      this.logger.error(`Failed to check if entity exists ${entityType}/${entityId}:`, error.message);
      return false;
    }
  }

  /**
   * Add a single entity only if it doesn't already exist
   */
  async addEntityIfNotExists(project: string, entity: Entity): Promise<boolean> {
    const exists = await this.entityExists(project, entity.type, entity.id);

    if (exists) {
      this.logger.log(`Entity already exists, skipping: ${entity.type}/${entity.id}`);
      return false;
    }

    await this.addEntity(project, entity);
    return true;
  }

  /**
   * Add multiple entities in batch with deduplication
   */
  async addEntities(project: string, entities: Entity[]): Promise<{ added: number; skipped: number }> {
    this.logger.log(`Adding ${entities.length} entities to project: ${project}`);

    let added = 0;
    let skipped = 0;

    for (const entity of entities) {
      const wasAdded = await this.addEntityIfNotExists(project, entity);
      if (wasAdded) {
        added++;
      } else {
        skipped++;
      }
    }

    this.logger.log(`Successfully processed ${entities.length} entities: ${added} added, ${skipped} skipped (duplicates)`);
    return { added, skipped };
  }

  /**
   * Create a relationship between two entities
   */
  async addRelationship(
    project: string,
    subjectType: string,
    subjectId: string,
    predicate: string,
    objectType: string,
    objectId: string
  ): Promise<void> {
    const subjectUri = `${BASE_URI}${subjectType}/${subjectId}`;
    const objectUri = `${BASE_URI}${objectType}/${objectId}`;
    const predicateUri = `${BASE_URI}${predicate}`;

    await this.addTriple(project, {
      subject: subjectUri,
      predicate: predicateUri,
      object: objectUri,
      objectType: 'namedNode'
    });

    this.logger.log(`Added relationship: ${subjectType}/${subjectId} -[${predicate}]-> ${objectType}/${objectId}`);
  }

  /**
   * Add a custom triple to the knowledge graph
   */
  async addTriple(project: string, triple: Relationship): Promise<void> {
    try {
      await axios.post(`${QUADSTORE_URL}/${project}/quad`, triple, {
        timeout: 5000
      });
    } catch (error) {
      this.logger.error(`Failed to add triple:`, error.message);
      throw error;
    }
  }

  /**
   * Query entities by type
   */
  async getEntitiesByType(project: string, entityType: string): Promise<any[]> {
    try {
      const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const typeUri = `${BASE_URI}${entityType}`;

      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: null,
        predicate: rdfType,
        object: typeUri
      }, {
        timeout: 5000
      });

      return response.data.results || [];
    } catch (error) {
      this.logger.error(`Failed to query entities of type ${entityType}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all properties for an entity
   */
  async getEntityProperties(project: string, entityType: string, entityId: string): Promise<any[]> {
    try {
      const entityUri = `${BASE_URI}${entityType}/${entityId}`;

      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: entityUri,
        predicate: null,
        object: null
      }, {
        timeout: 5000
      });

      return response.data.results || [];
    } catch (error) {
      this.logger.error(`Failed to get properties for ${entityType}/${entityId}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete an entity and all its relationships
   */
  async deleteEntity(project: string, entityType: string, entityId: string): Promise<void> {
    try {
      const entityUri = `${BASE_URI}${entityType}/${entityId}`;
      const encodedUri = encodeURIComponent(entityUri);

      await axios.delete(`${QUADSTORE_URL}/${project}/entity/${encodedUri}`, {
        timeout: 5000
      });

      this.logger.log(`Deleted entity: ${entityType}/${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to delete entity ${entityType}/${entityId}:`, error.message);
      throw error;
    }
  }

  /**
   * Convert extracted entities from OpenAI format to Entity format
   */
  convertExtractedEntities(extractedData: any, sourceDocument?: string): Entity[] {
    const entities: Entity[] = [];
    const timestamp = new Date().toISOString();

    // Process Person entities
    if (extractedData.entities?.Person) {
      extractedData.entities.Person.forEach((name: string, index: number) => {
        entities.push({
          id: this.generateId('person', name),
          type: 'Person',
          properties: {
            name: name,
            extractedFrom: sourceDocument || 'unknown',
            extractedAt: timestamp,
            index: index
          }
        });
      });
    }

    // Process Company entities
    if (extractedData.entities?.Company) {
      extractedData.entities.Company.forEach((name: string, index: number) => {
        entities.push({
          id: this.generateId('company', name),
          type: 'Company',
          properties: {
            name: name,
            extractedFrom: sourceDocument || 'unknown',
            extractedAt: timestamp,
            index: index
          }
        });
      });
    }

    // Process Product entities
    if (extractedData.entities?.Product) {
      extractedData.entities.Product.forEach((name: string, index: number) => {
        entities.push({
          id: this.generateId('product', name),
          type: 'Product',
          properties: {
            name: name,
            extractedFrom: sourceDocument || 'unknown',
            extractedAt: timestamp,
            index: index
          }
        });
      });
    }

    return entities;
  }

  /**
   * Generate a consistent ID for an entity based on its name
   */
  private generateId(type: string, name: string): string {
    // Create a URL-safe, lowercase ID from the name
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${normalized}`;
  }

  /**
   * Get statistics about the knowledge graph
   */
  async getStats(project: string): Promise<any> {
    try {
      const response = await axios.get(`${QUADSTORE_URL}/${project}/stats`, {
        timeout: 5000
      });

      return response.data.stats;
    } catch (error) {
      this.logger.error(`Failed to get stats for project ${project}:`, error.message);
      throw error;
    }
  }
}
