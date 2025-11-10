import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { VectorStore } from 'hnswsqlite';
import * as path from 'path';
import * as fs from 'fs';

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    entityId?: string;
    entityType?: string;
    createdAt: string;
    [key: string]: any;
  };
}

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: any;
}

@Injectable()
export class VectorStoreService implements OnModuleInit, OnModuleDestroy {
  private vectorStore: VectorStore;
  private readonly dbPath: string;

  constructor() {
    // Erstelle data Verzeichnis falls es nicht existiert
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'vectors.db');
  }

  async onModuleInit() {
    await this.initializeVectorStore();
  }

  async onModuleDestroy() {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }

  private async initializeVectorStore() {
    try {
      this.vectorStore = new VectorStore({
        filename: this.dbPath,
        dimension: 1536, // OpenAI text-embedding-3-small Dimension
        metric: 'cosine',
        maxElements: 1000000,
        m: 16,
        efConstruction: 200,
        efSearch: 50,
      });

      await this.vectorStore.initialize();
      console.log('Vector Store initialisiert:', this.dbPath);
    } catch (error) {
      console.error('Fehler beim Initialisieren der Vector Store:', error);
      throw error;
    }
  }

  /**
   * Fügt ein neues Dokument mit Embedding hinzu
   */
  async addDocument(document: VectorDocument): Promise<void> {
    try {
      await this.vectorStore.add({
        id: document.id,
        values: document.embedding,
        metadata: {
          content: document.content,
          ...document.metadata,
        },
      });
    } catch (error) {
      throw new Error(`Failed to add document: ${error.message}`);
    }
  }

  /**
   * Sucht ähnliche Vektoren
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: any
  ): Promise<SearchResult[]> {
    try {
      const results = await this.vectorStore.query({
        vector: queryEmbedding,
        topK,
        filter,
      });

      return results.map((result) => ({
        id: result.id,
        content: result.metadata.content,
        similarity: result.score,
        metadata: result.metadata,
      }));
    } catch (error) {
      throw new Error(`Failed to search vectors: ${error.message}`);
    }
  }

  /**
   * Entfernt ein Dokument
   */
  async removeDocument(id: string): Promise<void> {
    try {
      await this.vectorStore.delete(id);
    } catch (error) {
      throw new Error(`Failed to remove document: ${error.message}`);
    }
  }

  /**
   * Sucht nach Entitäts-ID
   */
  async searchByEntityId(entityId: string): Promise<SearchResult[]> {
    return this.search([], 100, { entityId });
  }

  /**
   * Gibt Statistiken über die Vector Store zurück
   */
  async getStats(): Promise<{
    totalDocuments: number;
    dimensions: number;
  }> {
    try {
      const count = await this.vectorStore.count();
      return {
        totalDocuments: count,
        dimensions: 1536,
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  /**
   * Aktualisiert ein existierendes Dokument
   */
  async updateDocument(document: VectorDocument): Promise<void> {
    try {
      // Lösche altes Dokument und füge neues hinzu
      await this.removeDocument(document.id);
      await this.addDocument(document);
    } catch (error) {
      throw new Error(`Failed to update document: ${error.message}`);
    }
  }
}
