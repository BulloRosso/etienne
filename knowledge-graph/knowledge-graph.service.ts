import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Quadstore } from 'quadstore';
import { DataFactory } from 'rdf-data-factory';
import * as path from 'path';
import * as fs from 'fs';

const df = new DataFactory();

// Basis URIs für das Knowledge Graph Schema
const KG_NS = 'http://example.org/kg/';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';

export interface Entity {
  id: string;
  type: 'Person' | 'Firma' | 'Produkt';
  properties: { [key: string]: string };
}

export interface Relationship {
  subject: string;
  predicate: string;
  object: string;
  properties?: { [key: string]: string };
}

@Injectable()
export class KnowledgeGraphService implements OnModuleInit, OnModuleDestroy {
  private quadstore: Quadstore;
  private readonly dbPath: string;

  constructor() {
    // Erstelle data Verzeichnis falls es nicht existiert
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'knowledge-graph');
  }

  async onModuleInit() {
    await this.initializeKnowledgeGraph();
    await this.initializeSchema();
  }

  async onModuleDestroy() {
    if (this.quadstore) {
      await this.quadstore.close();
    }
  }

  private async initializeKnowledgeGraph() {
    try {
      this.quadstore = new Quadstore({
        backend: require('leveldown'),
        path: this.dbPath,
      });

      await this.quadstore.open();
      console.log('Knowledge Graph initialisiert:', this.dbPath);
    } catch (error) {
      console.error('Fehler beim Initialisieren des Knowledge Graph:', error);
      throw error;
    }
  }

  private async initializeSchema() {
    // Definiere Entitätstypen
    const entityTypes = [
      { type: 'Person', label: 'Person' },
      { type: 'Firma', label: 'Firma' },
      { type: 'Produkt', label: 'Produkt' }
    ];

    // Definiere Beziehungstypen
    const relationshipTypes = [
      { type: 'istAngestelltBei', label: 'ist angestellt bei' },
      { type: 'stelltHer', label: 'stellt her' },
      { type: 'arbeitetMit', label: 'arbeitet mit' },
      { type: 'hatKunde', label: 'hat Kunde' }
    ];

    try {
      // Füge Entitätstypen hinzu
      for (const entityType of entityTypes) {
        await this.quadstore.put(df.quad(
          df.namedNode(KG_NS + entityType.type),
          df.namedNode(RDF_NS + 'type'),
          df.namedNode(RDFS_NS + 'Class')
        ));
        
        await this.quadstore.put(df.quad(
          df.namedNode(KG_NS + entityType.type),
          df.namedNode(RDFS_NS + 'label'),
          df.literal(entityType.label, 'de')
        ));
      }

      // Füge Beziehungstypen hinzu
      for (const relType of relationshipTypes) {
        await this.quadstore.put(df.quad(
          df.namedNode(KG_NS + relType.type),
          df.namedNode(RDF_NS + 'type'),
          df.namedNode(RDF_NS + 'Property')
        ));
        
        await this.quadstore.put(df.quad(
          df.namedNode(KG_NS + relType.type),
          df.namedNode(RDFS_NS + 'label'),
          df.literal(relType.label, 'de')
        ));
      }
    } catch (error) {
      console.error('Fehler beim Initialisieren des Schemas:', error);
    }
  }

  /**
   * Fügt eine neue Entität hinzu
   */
  async addEntity(entity: Entity): Promise<void> {
    try {
      const entityUri = df.namedNode(KG_NS + 'entity/' + entity.id);
      const typeUri = df.namedNode(KG_NS + entity.type);

      // Füge Typ hinzu
      await this.quadstore.put(df.quad(
        entityUri,
        df.namedNode(RDF_NS + 'type'),
        typeUri
      ));

      // Füge Eigenschaften hinzu
      for (const [property, value] of Object.entries(entity.properties)) {
        await this.quadstore.put(df.quad(
          entityUri,
          df.namedNode(KG_NS + property),
          df.literal(value)
        ));
      }
    } catch (error) {
      throw new Error(`Failed to add entity: ${error.message}`);
    }
  }

  /**
   * Fügt eine neue Beziehung hinzu
   */
  async addRelationship(relationship: Relationship): Promise<void> {
    try {
      const subjectUri = df.namedNode(KG_NS + 'entity/' + relationship.subject);
      const objectUri = df.namedNode(KG_NS + 'entity/' + relationship.object);
      const predicateUri = df.namedNode(KG_NS + relationship.predicate);

      await this.quadstore.put(df.quad(
        subjectUri,
        predicateUri,
        objectUri
      ));

      // Füge zusätzliche Eigenschaften der Beziehung hinzu, falls vorhanden
      if (relationship.properties) {
        const relationshipId = `${relationship.subject}_${relationship.predicate}_${relationship.object}`;
        const relationshipUri = df.namedNode(KG_NS + 'relationship/' + relationshipId);
        
        await this.quadstore.put(df.quad(
          relationshipUri,
          df.namedNode(RDF_NS + 'type'),
          df.namedNode(KG_NS + 'Relationship')
        ));
        
        await this.quadstore.put(df.quad(
          relationshipUri,
          df.namedNode(KG_NS + 'subject'),
          subjectUri
        ));
        
        await this.quadstore.put(df.quad(
          relationshipUri,
          df.namedNode(KG_NS + 'predicate'),
          predicateUri
        ));
        
        await this.quadstore.put(df.quad(
          relationshipUri,
          df.namedNode(KG_NS + 'object'),
          objectUri
        ));

        for (const [property, value] of Object.entries(relationship.properties)) {
          await this.quadstore.put(df.quad(
            relationshipUri,
            df.namedNode(KG_NS + property),
            df.literal(value)
          ));
        }
      }
    } catch (error) {
      throw new Error(`Failed to add relationship: ${error.message}`);
    }
  }

  /**
   * Führt eine SPARQL-Abfrage aus
   */
  async executeSparqlQuery(query: string): Promise<any[]> {
    try {
      const results = await this.quadstore.sparql(query);
      return results;
    } catch (error) {
      throw new Error(`Failed to execute SPARQL query: ${error.message}`);
    }
  }

  /**
   * Findet eine Entität nach ID
   */
  async findEntityById(id: string): Promise<Entity | null> {
    try {
      const query = `
        PREFIX kg: <${KG_NS}>
        PREFIX rdf: <${RDF_NS}>
        
        SELECT ?type ?property ?value WHERE {
          kg:entity/${id} rdf:type ?type .
          OPTIONAL {
            kg:entity/${id} ?property ?value .
            FILTER(?property != rdf:type)
          }
        }
      `;

      const results = await this.executeSparqlQuery(query);
      
      if (results.length === 0) return null;

      const entity: Entity = {
        id,
        type: results[0].type.value.replace(KG_NS, '') as any,
        properties: {}
      };

      results.forEach(result => {
        if (result.property && result.value) {
          const propertyName = result.property.value.replace(KG_NS, '');
          entity.properties[propertyName] = result.value.value;
        }
      });

      return entity;
    } catch (error) {
      throw new Error(`Failed to find entity: ${error.message}`);
    }
  }

  /**
   * Findet alle Entitäten eines bestimmten Typs
   */
  async findEntitiesByType(type: string): Promise<Entity[]> {
    try {
      const query = `
        PREFIX kg: <${KG_NS}>
        PREFIX rdf: <${RDF_NS}>
        
        SELECT ?entity ?property ?value WHERE {
          ?entity rdf:type kg:${type} .
          OPTIONAL {
            ?entity ?property ?value .
            FILTER(?property != rdf:type)
          }
        }
      `;

      const results = await this.executeSparqlQuery(query);
      const entitiesMap = new Map<string, Entity>();

      results.forEach(result => {
        const entityId = result.entity.value.replace(KG_NS + 'entity/', '');
        
        if (!entitiesMap.has(entityId)) {
          entitiesMap.set(entityId, {
            id: entityId,
            type: type as any,
            properties: {}
          });
        }

        const entity = entitiesMap.get(entityId);
        if (result.property && result.value) {
          const propertyName = result.property.value.replace(KG_NS, '');
          entity.properties[propertyName] = result.value.value;
        }
      });

      return Array.from(entitiesMap.values());
    } catch (error) {
      throw new Error(`Failed to find entities by type: ${error.message}`);
    }
  }

  /**
   * Findet alle Beziehungen einer Entität
   */
  async findRelationshipsByEntity(entityId: string): Promise<Relationship[]> {
    try {
      const query = `
        PREFIX kg: <${KG_NS}>
        
        SELECT ?predicate ?object WHERE {
          kg:entity/${entityId} ?predicate ?object .
          FILTER(STRSTARTS(STR(?predicate), "${KG_NS}"))
          FILTER(STRSTARTS(STR(?object), "${KG_NS}entity/"))
        }
        UNION
        SELECT ?predicate ?subject WHERE {
          ?subject ?predicate kg:entity/${entityId} .
          FILTER(STRSTARTS(STR(?predicate), "${KG_NS}"))
          FILTER(STRSTARTS(STR(?subject), "${KG_NS}entity/"))
        }
      `;

      const results = await this.executeSparqlQuery(query);
      
      return results.map(result => ({
        subject: result.subject ? 
          result.subject.value.replace(KG_NS + 'entity/', '') : entityId,
        predicate: result.predicate.value.replace(KG_NS, ''),
        object: result.object ? 
          result.object.value.replace(KG_NS + 'entity/', '') : entityId,
      }));
    } catch (error) {
      throw new Error(`Failed to find relationships: ${error.message}`);
    }
  }

  /**
   * Löscht eine Entität und alle zugehörigen Beziehungen
   */
  async deleteEntity(id: string): Promise<void> {
    try {
      const entityUri = df.namedNode(KG_NS + 'entity/' + id);
      
      // Lösche alle Quads mit dieser Entität als Subject
      const subjectQuads = await this.quadstore.match(entityUri, null, null);
      for await (const quad of subjectQuads) {
        await this.quadstore.delete(quad);
      }
      
      // Lösche alle Quads mit dieser Entität als Object
      const objectQuads = await this.quadstore.match(null, null, entityUri);
      for await (const quad of objectQuads) {
        await this.quadstore.delete(quad);
      }
    } catch (error) {
      throw new Error(`Failed to delete entity: ${error.message}`);
    }
  }

  /**
   * Gibt Statistiken über das Knowledge Graph zurück
   */
  async getStats(): Promise<{
    totalQuads: number;
    entitiesByType: { [type: string]: number };
  }> {
    try {
      // Zähle alle Quads
      const allQuads = await this.quadstore.match(null, null, null);
      const quads = [];
      for await (const quad of allQuads) {
        quads.push(quad);
      }

      // Zähle Entitäten nach Typ
      const entitiesByType = {};
      const entityTypes = ['Person', 'Firma', 'Produkt'];
      
      for (const type of entityTypes) {
        const entities = await this.findEntitiesByType(type);
        entitiesByType[type] = entities.length;
      }

      return {
        totalQuads: quads.length,
        entitiesByType
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }
}
