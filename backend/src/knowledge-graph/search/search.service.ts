import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { VectorStoreService } from '../vector-store/vector-store.service';
import { KnowledgeGraphService } from '../knowledge-graph.service';
import { GraphBuilderService } from '../graph-builder.service';
import { OpenAiService } from '../openai/openai.service';
import {
  CreateDocumentDto,
  CreateEntityDto,
  CreateRelationshipDto,
  SearchQueryDto,
  SparqlQueryDto,
  VectorSearchDto,
  HybridSearchResult
} from './search.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly knowledgeGraph: KnowledgeGraphService,
    private readonly graphBuilder: GraphBuilderService,
    private readonly openai: OpenAiService
  ) {}

  async createDocument(project: string, dto: CreateDocumentDto): Promise<any> {
    try {
      // Get embedding from OpenAI
      const embedding = await this.openai.createEmbedding(dto.content);

      // Store in vector database
      await this.vectorStore.addDocument(project, {
        id: dto.id,
        content: dto.content,
        embedding,
        metadata: {
          entityId: dto.entityId,
          entityType: dto.entityType,
          createdAt: new Date().toISOString(),
          ...dto.metadata
        }
      });

      return { success: true, id: dto.id };
    } catch (error) {
      throw new HttpException(
        `Failed to create document: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createEntity(project: string, dto: CreateEntityDto): Promise<any> {
    try {
      await this.knowledgeGraph.addEntity(project, dto);
      return { success: true, id: dto.id };
    } catch (error) {
      throw new HttpException(
        `Failed to create entity: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createRelationship(project: string, dto: CreateRelationshipDto): Promise<any> {
    try {
      await this.knowledgeGraph.addRelationship(project, dto);
      return { success: true };
    } catch (error) {
      throw new HttpException(
        `Failed to create relationship: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getEntity(project: string, id: string): Promise<any> {
    try {
      const entity = await this.knowledgeGraph.findEntityById(project, id);
      if (!entity) {
        throw new HttpException('Entity not found', HttpStatus.NOT_FOUND);
      }
      return entity;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get entity',
        error.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  async getEntitiesByType(project: string, type: string): Promise<any[]> {
    try {
      return await this.knowledgeGraph.findEntitiesByType(project, type);
    } catch (error) {
      throw new HttpException(
        `Failed to get entities: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteEntity(project: string, id: string): Promise<any> {
    try {
      await this.knowledgeGraph.deleteEntity(project, id);

      // Also delete related vector documents
      const relatedDocs = await this.vectorStore.searchByEntityId(project, id);
      for (const doc of relatedDocs) {
        await this.vectorStore.removeDocument(project, doc.id);
      }

      return { success: true };
    } catch (error) {
      throw new HttpException(
        `Failed to delete entity: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getEntityRelationships(project: string, id: string): Promise<any[]> {
    try {
      return await this.knowledgeGraph.findRelationshipsByEntity(project, id);
    } catch (error) {
      throw new HttpException(
        `Failed to get relationships: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async hybridSearch(project: string, dto: SearchQueryDto): Promise<HybridSearchResult> {
    const result: HybridSearchResult = {
      vectorResults: [],
      knowledgeGraphResults: [],
      combinedResults: [],
      sparqlQuery: undefined
    };

    try {
      // Vector search
      if (dto.includeVectorSearch) {
        const queryEmbedding = await this.openai.createEmbedding(dto.query);
        result.vectorResults = await this.vectorStore.search(project, queryEmbedding, dto.topK || 5);
      }

      // Knowledge graph search
      if (dto.includeKnowledgeGraph) {
        const sparqlQuery = await this.openai.translateToSparql(dto.query);
        result.sparqlQuery = sparqlQuery;

        try {
          result.knowledgeGraphResults = await this.knowledgeGraph.executeSparqlQuery(project, sparqlQuery);
        } catch (error) {
          console.warn('SPARQL query failed, using fallback:', error.message);
          result.knowledgeGraphResults = await this.fallbackEntitySearch(project, dto.query);
        }
      }

      // Combine results
      result.combinedResults = this.combineResults(result.vectorResults, result.knowledgeGraphResults);

      return result;
    } catch (error) {
      throw new HttpException(
        `Hybrid search failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async vectorSearch(project: string, dto: VectorSearchDto): Promise<any[]> {
    try {
      const queryEmbedding = await this.openai.createEmbedding(dto.query);
      return await this.vectorStore.search(project, queryEmbedding, dto.topK || 5);
    } catch (error) {
      throw new HttpException(
        `Vector search failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async sparqlQuery(project: string, dto: SparqlQueryDto): Promise<any[]> {
    try {
      return await this.knowledgeGraph.executeSparqlQuery(project, dto.query);
    } catch (error) {
      throw new HttpException(
        `SPARQL query failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async translateToSparql(query: string): Promise<string> {
    try {
      return await this.openai.translateToSparql(query);
    } catch (error) {
      throw new HttpException(
        `Translation failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getStats(project: string): Promise<any> {
    try {
      const vectorStats = await this.vectorStore.getStats(project);
      const kgStats = await this.knowledgeGraph.getStats(project);

      return {
        vectorStore: vectorStats,
        knowledgeGraph: kgStats
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get stats: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async fallbackEntitySearch(project: string, query: string): Promise<any[]> {
    // Simple fallback: search all entity types
    const results = [];
    for (const type of ['Person', 'Company', 'Product', 'Document']) {
      const entities = await this.knowledgeGraph.findEntitiesByType(project, type);
      results.push(...entities);
    }
    return results;
  }

  async parseMarkdown(project: string, content: string, sourceDocument?: string): Promise<any> {
    try {
      // Extract entities from markdown using OpenAI
      const extractionResult = await this.openai.extractEntitiesFromMarkdown(content);

      // Convert extracted entities to graph format
      const entities = this.graphBuilder.convertExtractedEntities(extractionResult, sourceDocument);

      // Create a Document entity to represent this upload
      const documentId = sourceDocument || `doc-${Date.now()}`;
      const documentEntity = {
        id: documentId,
        type: 'Document' as const,
        properties: {
          content: content.substring(0, 500), // Store first 500 chars as preview
          uploadedAt: new Date().toISOString(),
          entityCount: entities.length,
          fullContentLength: content.length
        }
      };

      // Add the document entity to knowledge graph
      await this.graphBuilder.addEntity(project, documentEntity);

      // Store the full document content in vector store
      const embedding = await this.openai.createEmbedding(content);
      await this.vectorStore.addDocument(project, {
        id: documentId,
        content: content,
        embedding: embedding,
        metadata: {
          documentId: documentId,
          uploadedAt: new Date().toISOString(),
          entityCount: entities.length,
          fullContentLength: content.length
        }
      });

      // Insert entities into knowledge graph with deduplication
      let addedCount = 0;
      let skippedCount = 0;

      if (entities.length > 0) {
        const result = await this.graphBuilder.addEntities(project, entities);
        addedCount = result.added;
        skippedCount = result.skipped;

        // Create relationships: Document -> contains -> Entity
        for (const entity of entities) {
          await this.graphBuilder.addRelationship(
            project,
            'Document',
            documentId,
            'contains',
            entity.type,
            entity.id
          );
        }
      }

      return {
        ...extractionResult,
        documentId: documentId,
        totalEntities: entities.length,
        entitiesAdded: addedCount,
        entitiesSkipped: skippedCount,
        entities: entities
      };
    } catch (error) {
      throw new HttpException(
        `Failed to parse markdown: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getDocumentById(project: string, id: string): Promise<any> {
    try {
      const document = await this.vectorStore.getDocumentById(project, id);
      if (!document) {
        throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
      }
      return document;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get document',
        error.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  private combineResults(vectorResults: any[], kgResults: any[]): any[] {
    const combined = [];

    // Add vector results with 70% weight
    for (const result of vectorResults) {
      combined.push({
        ...result,
        score: result.similarity * 0.7,
        source: 'vector'
      });
    }

    // Add KG results with 30% weight
    for (const result of kgResults) {
      combined.push({
        ...result,
        score: 0.3,
        source: 'knowledge_graph'
      });
    }

    // Sort by score
    return combined.sort((a, b) => b.score - a.score);
  }
}
