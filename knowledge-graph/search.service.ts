import { Injectable } from '@nestjs/common';
import { VectorStoreService, VectorDocument } from '../vector-store/vector-store.service';
import { KnowledgeGraphService, Entity, Relationship } from '../knowledge-graph/knowledge-graph.service';
import { OpenAiService } from '../openai/openai.service';
import {
  CreateDocumentDto,
  CreateEntityDto,
  CreateRelationshipDto,
  SearchQueryDto,
  HybridSearchResult,
  VectorSearchDto,
  SparqlQueryDto,
  EntityType
} from './search.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly vectorStoreService: VectorStoreService,
    private readonly knowledgeGraphService: KnowledgeGraphService,
    private readonly openAiService: OpenAiService,
  ) {}

  /**
   * Erstellt ein neues Dokument mit Embedding und verknüpft es optional mit einer Entität
   */
  async createDocument(createDocumentDto: CreateDocumentDto): Promise<{ success: boolean; message: string }> {
    try {
      // Erstelle Embedding für den Inhalt
      const embedding = await this.openAiService.createEmbedding(createDocumentDto.content);

      // Erstelle Vector-Dokument
      const vectorDocument: VectorDocument = {
        id: createDocumentDto.id,
        content: createDocumentDto.content,
        embedding,
        metadata: {
          entityId: createDocumentDto.entityId,
          entityType: createDocumentDto.entityType,
          createdAt: new Date().toISOString(),
          ...createDocumentDto.metadata,
        },
      };

      // Speichere in Vector Store
      await this.vectorStoreService.addDocument(vectorDocument);

      return {
        success: true,
        message: `Dokument ${createDocumentDto.id} erfolgreich erstellt und gespeichert`,
      };
    } catch (error) {
      throw new Error(`Fehler beim Erstellen des Dokuments: ${error.message}`);
    }
  }

  /**
   * Erstellt eine neue Entität im Knowledge Graph
   */
  async createEntity(createEntityDto: CreateEntityDto): Promise<{ success: boolean; message: string }> {
    try {
      const entity: Entity = {
        id: createEntityDto.id,
        type: createEntityDto.type,
        properties: createEntityDto.properties,
      };

      await this.knowledgeGraphService.addEntity(entity);

      return {
        success: true,
        message: `Entität ${createEntityDto.id} erfolgreich erstellt`,
      };
    } catch (error) {
      throw new Error(`Fehler beim Erstellen der Entität: ${error.message}`);
    }
  }

  /**
   * Erstellt eine neue Beziehung zwischen Entitäten
   */
  async createRelationship(createRelationshipDto: CreateRelationshipDto): Promise<{ success: boolean; message: string }> {
    try {
      const relationship: Relationship = {
        subject: createRelationshipDto.subject,
        predicate: createRelationshipDto.predicate,
        object: createRelationshipDto.object,
        properties: createRelationshipDto.properties,
      };

      await this.knowledgeGraphService.addRelationship(relationship);

      return {
        success: true,
        message: `Beziehung ${createRelationshipDto.subject} -> ${createRelationshipDto.predicate} -> ${createRelationshipDto.object} erfolgreich erstellt`,
      };
    } catch (error) {
      throw new Error(`Fehler beim Erstellen der Beziehung: ${error.message}`);
    }
  }

  /**
   * Führt eine hybride Suche durch (Vector + Knowledge Graph)
   */
  async hybridSearch(searchQuery: SearchQueryDto): Promise<HybridSearchResult> {
    try {
      const result: HybridSearchResult = {
        vectorResults: [],
        knowledgeGraphResults: [],
        combinedResults: [],
        sparqlQuery: null,
      };

      // Vector-Suche
      if (searchQuery.includeVectorSearch) {
        const queryEmbedding = await this.openAiService.createEmbedding(searchQuery.query);
        result.vectorResults = await this.vectorStoreService.search(
          queryEmbedding,
          searchQuery.topK
        );
      }

      // Knowledge Graph Suche
      if (searchQuery.includeKnowledgeGraph) {
        try {
          const sparqlQuery = await this.openAiService.translateToSparql(searchQuery.query);
          result.sparqlQuery = sparqlQuery;
          result.knowledgeGraphResults = await this.knowledgeGraphService.executeSparqlQuery(sparqlQuery);
        } catch (sparqlError) {
          console.warn('SPARQL-Übersetzung fehlgeschlagen:', sparqlError.message);
          // Fallback: Einfache Textsuche in Entitäten
          result.knowledgeGraphResults = await this.fallbackEntitySearch(searchQuery.query);
        }
      }

      // Kombiniere und ranke Ergebnisse
      result.combinedResults = this.combineResults(result.vectorResults, result.knowledgeGraphResults);

      return result;
    } catch (error) {
      throw new Error(`Fehler bei der hybriden Suche: ${error.message}`);
    }
  }

  /**
   * Führt eine reine Vektorsuche durch
   */
  async vectorSearch(vectorSearchDto: VectorSearchDto) {
    try {
      const queryEmbedding = await this.openAiService.createEmbedding(vectorSearchDto.query);
      return await this.vectorStoreService.search(
        queryEmbedding,
        vectorSearchDto.topK,
        vectorSearchDto.filter
      );
    } catch (error) {
      throw new Error(`Fehler bei der Vektorsuche: ${error.message}`);
    }
  }

  /**
   * Führt eine SPARQL-Abfrage aus
   */
  async sparqlQuery(sparqlQueryDto: SparqlQueryDto) {
    try {
      return await this.knowledgeGraphService.executeSparqlQuery(sparqlQueryDto.query);
    } catch (error) {
      throw new Error(`Fehler bei der SPARQL-Abfrage: ${error.message}`);
    }
  }

  /**
   * Übersetzt natürliche Sprache in SPARQL
   */
  async translateToSparql(query: string): Promise<{ sparql: string }> {
    try {
      const sparql = await this.openAiService.translateToSparql(query);
      return { sparql };
    } catch (error) {
      throw new Error(`Fehler bei der SPARQL-Übersetzung: ${error.message}`);
    }
  }

  /**
   * Holt eine Entität nach ID
   */
  async getEntity(id: string): Promise<Entity | null> {
    return await this.knowledgeGraphService.findEntityById(id);
  }

  /**
   * Holt alle Entitäten eines bestimmten Typs
   */
  async getEntitiesByType(type: EntityType): Promise<Entity[]> {
    return await this.knowledgeGraphService.findEntitiesByType(type);
  }

  /**
   * Holt alle Beziehungen einer Entität
   */
  async getEntityRelationships(entityId: string): Promise<Relationship[]> {
    return await this.knowledgeGraphService.findRelationshipsByEntity(entityId);
  }

  /**
   * Holt Statistiken über Vector Store und Knowledge Graph
   */
  async getStats() {
    try {
      const [vectorStats, kgStats] = await Promise.all([
        this.vectorStoreService.getStats(),
        this.knowledgeGraphService.getStats(),
      ]);

      return {
        vectorStore: vectorStats,
        knowledgeGraph: kgStats,
      };
    } catch (error) {
      throw new Error(`Fehler beim Abrufen der Statistiken: ${error.message}`);
    }
  }

  /**
   * Löscht eine Entität und alle zugehörigen Dokumente
   */
  async deleteEntity(id: string): Promise<{ success: boolean; message: string }> {
    try {
      // Lösche aus Knowledge Graph
      await this.knowledgeGraphService.deleteEntity(id);

      // Finde und lösche zugehörige Dokumente aus Vector Store
      const vectorResults = await this.vectorStoreService.searchByEntityId(id);
      for (const result of vectorResults) {
        await this.vectorStoreService.removeDocument(result.id);
      }

      return {
        success: true,
        message: `Entität ${id} und zugehörige Dokumente erfolgreich gelöscht`,
      };
    } catch (error) {
      throw new Error(`Fehler beim Löschen der Entität: ${error.message}`);
    }
  }

  /**
   * Fallback-Methode für einfache Entitätssuche
   */
  private async fallbackEntitySearch(query: string): Promise<any[]> {
    const entityTypes: EntityType[] = [EntityType.Person, EntityType.Firma, EntityType.Produkt];
    const results = [];

    for (const type of entityTypes) {
      const entities = await this.knowledgeGraphService.findEntitiesByType(type);
      const matchingEntities = entities.filter(entity => 
        Object.values(entity.properties).some(value => 
          value.toLowerCase().includes(query.toLowerCase())
        )
      );
      results.push(...matchingEntities);
    }

    return results;
  }

  /**
   * Kombiniert und rankt Ergebnisse aus Vector- und Knowledge Graph-Suche
   */
  private combineResults(vectorResults: any[], kgResults: any[]): any[] {
    const combined = [];

    // Füge Vector-Ergebnisse hinzu
    vectorResults.forEach((result, index) => {
      combined.push({
        ...result,
        source: 'vector',
        rank: index + 1,
        combinedScore: result.similarity * 0.7, // Gewichtung für Vector-Ergebnisse
      });
    });

    // Füge Knowledge Graph-Ergebnisse hinzu
    kgResults.forEach((result, index) => {
      combined.push({
        ...result,
        source: 'knowledge_graph',
        rank: index + 1,
        combinedScore: (1 - index / Math.max(kgResults.length, 1)) * 0.3, // Gewichtung für KG-Ergebnisse
      });
    });

    // Sortiere nach kombiniertem Score
    return combined.sort((a, b) => b.combinedScore - a.combinedScore);
  }
}
