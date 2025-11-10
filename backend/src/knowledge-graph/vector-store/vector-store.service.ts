import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

interface VectorDocument {
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

interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: any;
}

@Injectable()
export class VectorStoreService implements OnModuleInit, OnModuleDestroy {
  private stores: Map<string, any> = new Map();
  private readonly workspaceDir = path.join(process.cwd(), 'workspace');
  private readonly dimension = 1536; // OpenAI text-embedding-3-small

  async onModuleInit() {
    // Stores are now initialized per project on demand
  }

  async onModuleDestroy() {
    for (const [project, store] of this.stores.entries()) {
      if (store && store.close) {
        await store.close();
      }
    }
  }

  private getDbPath(project: string): string {
    return path.join(this.workspaceDir, project, 'knowledge-graph', 'vectors.db');
  }

  private async initializeForProject(project: string) {
    if (this.stores.has(project)) {
      return this.stores.get(project);
    }

    const dbPath = this.getDbPath(project);

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize hnswsqlite or mock store
    try {
      const { HNSWSQLite } = await import('hnswsqlite');
      const store = new HNSWSQLite(dbPath, {
        space: 'cosine',
        dim: this.dimension,
        m: 16,
        efConstruction: 200,
        efSearch: 50,
        maxElements: 1000000
      });
      this.stores.set(project, store);
      console.log(`✅ Vector store initialized for project: ${project}`);
      return store;
    } catch (error) {
      console.warn(`hnswsqlite not available for ${project}, using mock store:`, error.message);
      // Create a mock store for development
      const mockStore = this.createMockStore();
      this.stores.set(project, mockStore);
      return mockStore;
    }
  }

  private createMockStore() {
    const mockData = new Map();

    return {
      documents: mockData,
      addItem: async (id: string, vector: number[], metadata: any) => {
        mockData.set(id, { id, vector, metadata });
      },
      search: async (queryVector: number[], k: number) => {
        // Simple mock search - return all documents
        const results = [];
        for (const [id, doc] of mockData.entries()) {
          results.push({
            id,
            distance: Math.random(),
            metadata: doc.metadata
          });
        }
        return results.slice(0, k);
      },
      removeItem: async (id: string) => {
        mockData.delete(id);
      },
      close: async () => {}
    };
  }

  async addDocument(project: string, doc: VectorDocument): Promise<void> {
    const store = await this.initializeForProject(project);
    await store.addItem(doc.id, doc.embedding, {
      content: doc.content,
      ...doc.metadata
    });
  }

  async search(project: string, queryEmbedding: number[], topK: number = 5): Promise<SearchResult[]> {
    const store = await this.initializeForProject(project);
    const results = await store.search(queryEmbedding, topK);

    return results.map((result: any) => ({
      id: result.id,
      content: result.metadata?.content || '',
      similarity: 1 - result.distance, // Convert distance to similarity
      metadata: result.metadata
    }));
  }

  async removeDocument(project: string, id: string): Promise<void> {
    const store = await this.initializeForProject(project);
    await store.removeItem(id);
  }

  async searchByEntityId(project: string, entityId: string): Promise<SearchResult[]> {
    const store = await this.initializeForProject(project);
    // This is a simplified implementation
    // In production, you'd want to add proper filtering
    const allResults = await store.search(new Array(this.dimension).fill(0), 1000);

    return allResults
      .filter((result: any) => result.metadata?.entityId === entityId)
      .map((result: any) => ({
        id: result.id,
        content: result.metadata?.content || '',
        similarity: 1 - result.distance,
        metadata: result.metadata
      }));
  }

  async updateDocument(project: string, doc: VectorDocument): Promise<void> {
    await this.removeDocument(project, doc.id);
    await this.addDocument(project, doc);
  }

  async getStats(project: string): Promise<any> {
    const store = await this.initializeForProject(project);
    if (store.documents) {
      // Mock store
      return {
        documentCount: store.documents.size,
        dimension: this.dimension
      };
    }

    // Real store - would need to implement actual counting
    return {
      documentCount: 0,
      dimension: this.dimension
    };
  }

  async getDocumentById(project: string, id: string): Promise<VectorDocument | null> {
    const store = await this.initializeForProject(project);

    if (store.documents) {
      // Mock store
      const doc = store.documents.get(id);
      if (doc) {
        return {
          id: doc.id,
          content: doc.metadata?.content || '',
          embedding: doc.vector,
          metadata: doc.metadata
        };
      }
      return null;
    }

    // Real store - search with a zero vector and filter by ID
    // This is not ideal but works for now
    const allResults = await store.search(new Array(this.dimension).fill(0), 10000);
    const result = allResults.find((r: any) => r.id === id);

    if (result) {
      return {
        id: result.id,
        content: result.metadata?.content || '',
        embedding: [], // Not retrieved in search
        metadata: result.metadata
      };
    }

    return null;
  }
}
