import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

const QUADSTORE_URL = process.env.QUADSTORE_URL || 'http://localhost:7000';

interface Entity {
  id: string;
  type: 'Person' | 'Company' | 'Product' | 'Document';
  properties: { [key: string]: string };
}

interface Relationship {
  subject: string;
  predicate: string;
  object: string;
  properties?: { [key: string]: string };
}

@Injectable()
export class KnowledgeGraphService implements OnModuleInit, OnModuleDestroy {
  private readonly baseUri = 'http://example.org/kg/';
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');
  private quadstoreAvailable = false;

  async onModuleInit() {
    // Check if Quadstore service is available
    try {
      await axios.get(`${QUADSTORE_URL}/health`, { timeout: 2000 });
      this.quadstoreAvailable = true;
      console.log('✅ Quadstore service is available');
    } catch (error) {
      console.warn('⚠️  Quadstore service not available, operations will fail. Start the vector-store service on port 7000.');
      this.quadstoreAvailable = false;
    }
  }

  async onModuleDestroy() {
    // Cleanup if needed
  }

  private getDataDir(project: string): string {
    return path.join(this.workspaceDir, project, 'knowledge-graph');
  }

  private ensureQuadstoreAvailable() {
    if (!this.quadstoreAvailable) {
      throw new Error('Quadstore service is not available. Please start the vector-store service on port 7000.');
    }
  }

  async addEntity(project: string, entity: Entity): Promise<void> {
    this.ensureQuadstoreAvailable();

    const entityUri = `${this.baseUri}${entity.id}`;
    const typeUri = `${this.baseUri}${entity.type}`;
    const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

    // Add type triple
    await axios.post(`${QUADSTORE_URL}/${project}/quad`, {
      subject: entityUri,
      predicate: rdfType,
      object: typeUri,
      objectType: 'namedNode'
    });

    // Add property triples
    for (const [key, value] of Object.entries(entity.properties)) {
      const predicate = `${this.baseUri}${key}`;
      await axios.post(`${QUADSTORE_URL}/${project}/quad`, {
        subject: entityUri,
        predicate: predicate,
        object: value,
        objectType: 'literal'
      });
    }
  }

  async addRelationship(project: string, relationship: Relationship): Promise<void> {
    this.ensureQuadstoreAvailable();

    const subject = `${this.baseUri}${relationship.subject}`;
    const predicate = `${this.baseUri}${relationship.predicate}`;
    const object = `${this.baseUri}${relationship.object}`;

    await axios.post(`${QUADSTORE_URL}/${project}/quad`, {
      subject,
      predicate,
      object,
      objectType: 'namedNode'
    });

    // Add relationship properties if any
    if (relationship.properties) {
      const relationshipId = `${relationship.subject}-${relationship.predicate}-${relationship.object}`;
      const relationshipUri = `${this.baseUri}rel/${relationshipId}`;

      for (const [key, value] of Object.entries(relationship.properties)) {
        const propPredicate = `${this.baseUri}${key}`;
        await axios.post(`${QUADSTORE_URL}/${project}/quad`, {
          subject: relationshipUri,
          predicate: propPredicate,
          object: value,
          objectType: 'literal'
        });
      }
    }
  }

  async executeSparqlQuery(project: string, query: string): Promise<any[]> {
    this.ensureQuadstoreAvailable();

    try {
      // For now, just return all triples
      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: null,
        predicate: null,
        object: null
      });

      return response.data.results.map((quad: any) => ({
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value
      }));
    } catch (error) {
      throw new Error(`SPARQL query execution failed: ${error.message}`);
    }
  }

  async findEntityById(project: string, id: string): Promise<any> {
    this.ensureQuadstoreAvailable();

    const entityUri = `${this.baseUri}${id}`;

    try {
      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: entityUri,
        predicate: null,
        object: null
      });

      const properties: any = { id };

      for (const quad of response.data.results) {
        const predicate = quad.predicate.value.replace(this.baseUri, '');
        const value = quad.object.value;

        if (predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
          properties.type = value.replace(this.baseUri, '');
        } else {
          properties[predicate] = value;
        }
      }

      return Object.keys(properties).length > 1 ? properties : null;
    } catch (error) {
      return null;
    }
  }

  async findEntitiesByType(project: string, type: string): Promise<any[]> {
    this.ensureQuadstoreAvailable();

    const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const typeUri = `${this.baseUri}${type}`;

    try {
      const response = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: null,
        predicate: rdfType,
        object: typeUri
      });

      const entities = [];
      for (const quad of response.data.results) {
        const entityId = quad.subject.value.replace(this.baseUri, '');
        const entity = await this.findEntityById(project, entityId);
        if (entity) {
          entities.push(entity);
        }
      }

      return entities;
    } catch (error) {
      return [];
    }
  }

  async findRelationshipsByEntity(project: string, entityId: string): Promise<any[]> {
    this.ensureQuadstoreAvailable();

    const entityUri = `${this.baseUri}${entityId}`;
    const relationships = [];

    try {
      // Find outgoing relationships
      const outgoingResponse = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: entityUri,
        predicate: null,
        object: null
      });

      for (const quad of outgoingResponse.data.results) {
        const predicate = quad.predicate.value;
        if (predicate !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
            !predicate.includes('#') &&
            quad.object.type === 'NamedNode') {
          relationships.push({
            subject: entityId,
            predicate: predicate.replace(this.baseUri, ''),
            object: quad.object.value.replace(this.baseUri, ''),
            direction: 'outgoing'
          });
        }
      }

      // Find incoming relationships
      const incomingResponse = await axios.post(`${QUADSTORE_URL}/${project}/match`, {
        subject: null,
        predicate: null,
        object: entityUri
      });

      for (const quad of incomingResponse.data.results) {
        relationships.push({
          subject: quad.subject.value.replace(this.baseUri, ''),
          predicate: quad.predicate.value.replace(this.baseUri, ''),
          object: entityId,
          direction: 'incoming'
        });
      }

      return relationships;
    } catch (error) {
      return [];
    }
  }

  async deleteEntity(project: string, id: string): Promise<void> {
    this.ensureQuadstoreAvailable();

    const entityUri = `${this.baseUri}${id}`;

    await axios.delete(`${QUADSTORE_URL}/${project}/entity/${encodeURIComponent(entityUri)}`);
  }

  async getStats(project: string): Promise<any> {
    this.ensureQuadstoreAvailable();

    try {
      const response = await axios.get(`${QUADSTORE_URL}/${project}/stats`);
      return response.data.stats;
    } catch (error) {
      console.error('Error getting stats:', error.message);
      return {
        totalQuads: 0,
        entityCount: 0,
        entityTypes: {
          Person: 0,
          Company: 0,
          Product: 0,
          Document: 0
        }
      };
    }
  }
}
