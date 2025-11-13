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
import { NaiveChunkingStrategy } from '../chunking';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class SearchService {
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');

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
      // Vector search - request more results since we'll deduplicate chunks
      if (dto.includeVectorSearch) {
        const queryEmbedding = await this.openai.createEmbedding(dto.query);
        const topK = (dto.topK || 5) * 3; // Request 3x more to account for chunks
        const rawResults = await this.vectorStore.search(project, queryEmbedding, topK);

        // Deduplicate chunks and group by document
        result.vectorResults = this.deduplicateChunks(rawResults).slice(0, dto.topK || 5);
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
      const topK = (dto.topK || 5) * 3; // Request 3x more to account for chunks
      const rawResults = await this.vectorStore.search(project, queryEmbedding, topK);

      // Deduplicate chunks and group by document
      return this.deduplicateChunks(rawResults).slice(0, dto.topK || 5);
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

  async translateToSparql(query: string, project?: string): Promise<string> {
    try {
      return await this.openai.translateToSparql(query, project);
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

  async parseMarkdown(project: string, content: string, sourceDocument?: string, useGraphLayer: boolean = true): Promise<any> {
    try {
      const documentId = sourceDocument || `doc-${Date.now()}`;

      // Create chunking strategy - use Naive Chunking with 8096 chars and 20% overlap
      const chunkingStrategy = new NaiveChunkingStrategy(8096, 0.2);
      const chunks = chunkingStrategy.chunk(documentId, content);

      console.log(`📄 Document ${documentId}: ${content.length} chars -> ${chunks.length} chunks`);

      // Skip entity extraction if graph layer is disabled
      if (!useGraphLayer) {
        // Store each chunk in vector store with embeddings
        const chunkDocuments = await Promise.all(
          chunks.map(async (chunk) => {
            const embedding = await this.openai.createEmbedding(chunk.content);
            return {
              id: chunk.chunkId,
              content: chunk.content,
              embedding: embedding,
              metadata: {
                documentId: documentId,
                chunkNumber: chunk.chunkNumber,
                startPosition: chunk.startPosition,
                endPosition: chunk.endPosition,
                totalChunks: chunk.totalChunks,
                contentLength: chunk.content.length,
                createdAt: new Date().toISOString(),
                uploadedAt: new Date().toISOString(),
                fullContentLength: content.length,
                useGraphLayer: false
              }
            };
          })
        );

        // Batch insert chunks into vector store
        await this.vectorStore.addDocumentChunks(project, chunkDocuments);

        return {
          documentId: documentId,
          totalChunks: chunks.length,
          chunkingStrategy: chunkingStrategy.getName(),
          totalEntities: 0,
          entitiesAdded: 0,
          entitiesSkipped: 0,
          entities: [],
          summary: []
        };
      }

      // Extract entities from markdown using OpenAI (now with project-specific schema)
      const extractionResult = await this.openai.extractEntitiesFromMarkdown(project, content);

      // Convert extracted entities to graph format
      const entities = this.graphBuilder.convertExtractedEntities(extractionResult, sourceDocument);

      // Create a Document entity to represent this upload
      const documentEntity = {
        id: documentId,
        type: 'Document' as const,
        properties: {
          content: content.substring(0, 500), // Store first 500 chars as preview
          uploadedAt: new Date().toISOString(),
          entityCount: entities.length,
          fullContentLength: content.length,
          totalChunks: chunks.length,
          chunkingStrategy: chunkingStrategy.getName()
        }
      };

      // Add the document entity to knowledge graph
      await this.graphBuilder.addEntity(project, documentEntity);

      // Create embeddings for all chunks in parallel
      const chunkDocuments = await Promise.all(
        chunks.map(async (chunk) => {
          const embedding = await this.openai.createEmbedding(chunk.content);
          return {
            id: chunk.chunkId,
            content: chunk.content,
            embedding: embedding,
            metadata: {
              documentId: documentId,
              chunkNumber: chunk.chunkNumber,
              startPosition: chunk.startPosition,
              endPosition: chunk.endPosition,
              totalChunks: chunk.totalChunks,
              contentLength: chunk.content.length,
              createdAt: new Date().toISOString(),
              uploadedAt: new Date().toISOString(),
              entityCount: entities.length,
              fullContentLength: content.length,
              useGraphLayer: true
            }
          };
        })
      );

      // Batch insert chunks into vector store
      await this.vectorStore.addDocumentChunks(project, chunkDocuments);

      // Add chunk entities to knowledge graph with "isChunkOf" relationships
      const chunkMetadataArray = chunks.map(chunk => ({
        chunkId: chunk.chunkId,
        documentId: documentId,
        metadata: {
          chunkNumber: chunk.chunkNumber,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          totalChunks: chunk.totalChunks,
          contentLength: chunk.content.length
        }
      }));

      await this.knowledgeGraph.addDocumentChunks(project, chunkMetadataArray);

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
        totalChunks: chunks.length,
        chunkingStrategy: chunkingStrategy.getName(),
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

  async listDocuments(project: string): Promise<any[]> {
    try {
      return await this.vectorStore.listDocuments(project);
    } catch (error) {
      throw new HttpException(
        `Failed to list documents: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteDocument(project: string, id: string): Promise<any> {
    try {
      // First check if document exists
      const document = await this.vectorStore.getDocumentById(project, id);
      if (!document) {
        throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
      }

      // Delete from vector store
      await this.vectorStore.removeDocument(project, id);

      return { success: true, id };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to delete document',
        error.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Deduplicates and groups chunk results by document
   * Returns the best matching chunk for each document
   */
  private deduplicateChunks(results: any[]): any[] {
    const documentMap = new Map<string, any>();

    for (const result of results) {
      const documentId = result.metadata?.documentId || result.id;
      const isChunk = result.id?.includes('-') && result.metadata?.chunkNumber;

      if (!isChunk) {
        // Not a chunk, add as-is (or update if better score)
        if (!documentMap.has(documentId) || documentMap.get(documentId).score < result.score) {
          documentMap.set(documentId, {
            ...result,
            isChunk: false
          });
        }
      } else {
        // This is a chunk
        const existing = documentMap.get(documentId);

        if (!existing) {
          // First chunk for this document
          documentMap.set(documentId, {
            ...result,
            isChunk: true,
            documentId: documentId,
            matchedChunks: [result.id]
          });
        } else if (existing.score < result.score || result.score === undefined) {
          // Better matching chunk found, replace
          documentMap.set(documentId, {
            ...result,
            isChunk: true,
            documentId: documentId,
            matchedChunks: [...(existing.matchedChunks || []), result.id]
          });
        } else {
          // Keep existing, just add chunk ID to list
          existing.matchedChunks = [...(existing.matchedChunks || [existing.id]), result.id];
        }
      }
    }

    return Array.from(documentMap.values());
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

  async getEntitySchema(project: string): Promise<any> {
    try {
      const schemaPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'entity-schema.ttl');

      // Check if file exists
      try {
        await fs.access(schemaPath);
        const content = await fs.readFile(schemaPath, 'utf-8');
        return { schema: content };
      } catch (error) {
        // File doesn't exist, return empty
        return { schema: '' };
      }
    } catch (error) {
      throw new HttpException(
        `Failed to get entity schema: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async saveEntitySchema(project: string, schema: string): Promise<any> {
    try {
      const kgDir = path.join(this.workspaceDir, project, 'knowledge-graph');
      const schemaPath = path.join(kgDir, 'entity-schema.ttl');

      // Ensure directory exists
      await fs.mkdir(kgDir, { recursive: true });

      // Write schema file
      await fs.writeFile(schemaPath, schema, 'utf-8');

      return { success: true, path: schemaPath };
    } catch (error) {
      throw new HttpException(
        `Failed to save entity schema: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getExtractionPrompt(project: string): Promise<any> {
    try {
      const promptPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'extraction-prompt.md');

      // Check if file exists
      try {
        await fs.access(promptPath);
        const content = await fs.readFile(promptPath, 'utf-8');
        return { prompt: content };
      } catch (error) {
        // File doesn't exist, return empty
        return { prompt: '' };
      }
    } catch (error) {
      throw new HttpException(
        `Failed to get extraction prompt: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async saveExtractionPrompt(project: string, prompt: string): Promise<any> {
    try {
      const kgDir = path.join(this.workspaceDir, project, 'knowledge-graph');
      const promptPath = path.join(kgDir, 'extraction-prompt.md');

      // Ensure directory exists
      await fs.mkdir(kgDir, { recursive: true });

      // Write prompt file
      await fs.writeFile(promptPath, prompt, 'utf-8');

      return { success: true, path: promptPath };
    } catch (error) {
      throw new HttpException(
        `Failed to save extraction prompt: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
