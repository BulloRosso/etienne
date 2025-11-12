import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';

const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:7100';
const COLLECTION_NAME = 'documents'; // Default collection name for documents

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
  private readonly dimension = 1536; // OpenAI text-embedding-3-small

  async onModuleInit() {
    // Check if ChromaDB service is available
    try {
      await axios.get(`${CHROMADB_URL}/api/v1/heartbeat`, { timeout: 2000 });
      console.log('✅ ChromaDB service is available');
    } catch (error) {
      console.warn('⚠️  ChromaDB service not available at startup. Will retry on first request.');
    }
  }

  async onModuleDestroy() {
    // ChromaDB server manages its own connections
  }

  private async ensureChromadbAvailable() {
    // Always try to check if ChromaDB is available (don't rely only on init check)
    try {
      await axios.get(`${CHROMADB_URL}/api/v1/heartbeat`, { timeout: 2000 });
    } catch (error) {
      throw new Error('ChromaDB service is not available. Please start the vector-store service on port 7100.');
    }
  }

  private async ensureCollection(project: string): Promise<void> {
    await this.ensureChromadbAvailable();

    try {
      // Try to get the collection, if it doesn't exist, create it
      await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections`, {
        name: COLLECTION_NAME,
        metadata: { description: 'Document embeddings for vector similarity search' },
        get_or_create: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to ensure collection exists: ${message}`);
    }
  }

  async addDocument(project: string, doc: VectorDocument): Promise<void> {
    await this.ensureCollection(project);

    try {
      await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/add`, {
        ids: [doc.id],
        embeddings: [doc.embedding],
        documents: [doc.content],
        metadatas: [{
          content: doc.content,
          ...doc.metadata
        }]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add document: ${message}`);
    }
  }

  async search(project: string, queryEmbedding: number[], topK: number = 5): Promise<SearchResult[]> {
    await this.ensureCollection(project);

    try {
      const response = await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/query`, {
        query_embeddings: [queryEmbedding],
        n_results: topK,
        include: ['documents', 'metadatas', 'distances']
      });

      const results = response.data.results;

      // ChromaDB returns results in arrays for batch queries
      const ids = results.ids[0] || [];
      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];
      const distances = results.distances[0] || [];

      return ids.map((id: string, index: number) => {
        // ChromaDB with cosine distance returns values from 0 (identical) to 2 (opposite)
        // Convert to similarity percentage: similarity = 1 - (distance / 2)
        // This gives 1.0 for identical vectors, 0.0 for opposite vectors
        const distance = distances[index];
        const similarity = 1 - (distance / 2);

        return {
          id,
          content: documents[index] || '',
          similarity,
          metadata: metadatas[index] || {}
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Search failed: ${message}`);
    }
  }

  async removeDocument(project: string, id: string): Promise<void> {
    await this.ensureCollection(project);

    try {
      await axios.delete(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/documents`, {
        data: {
          ids: [id]
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove document: ${message}`);
    }
  }

  async searchByEntityId(project: string, entityId: string): Promise<SearchResult[]> {
    await this.ensureCollection(project);

    try {
      // Use ChromaDB's where clause to filter by entityId
      const response = await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/query`, {
        query_embeddings: [new Array(this.dimension).fill(0)],
        n_results: 1000,
        where: { entityId: entityId },
        include: ['documents', 'metadatas', 'distances']
      });

      const results = response.data.results;
      const ids = results.ids[0] || [];
      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];
      const distances = results.distances[0] || [];

      return ids.map((id: string, index: number) => {
        const distance = distances[index];
        const similarity = 1 - (distance / 2);
        return {
          id,
          content: documents[index] || '',
          similarity,
          metadata: metadatas[index] || {}
        };
      });
    } catch (error) {
      return [];
    }
  }

  async updateDocument(project: string, doc: VectorDocument): Promise<void> {
    await this.removeDocument(project, doc.id);
    await this.addDocument(project, doc);
  }

  async getStats(project: string): Promise<any> {
    await this.ensureCollection(project);

    try {
      const response = await axios.get(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}`);

      return {
        documentCount: response.data.collection.count || 0,
        dimension: this.dimension
      };
    } catch (error) {
      return {
        documentCount: 0,
        dimension: this.dimension
      };
    }
  }

  async getDocumentById(project: string, id: string): Promise<VectorDocument | null> {
    await this.ensureCollection(project);

    try {
      const response = await axios.get(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/get`, {
        params: {
          ids: [id],
          include: ['documents', 'metadatas', 'embeddings']
        }
      });

      const results = response.data.results;

      if (results.ids && results.ids.length > 0) {
        return {
          id: results.ids[0],
          content: results.documents?.[0] || '',
          embedding: results.embeddings?.[0] || [],
          metadata: results.metadatas?.[0] || {}
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async listDocuments(project: string): Promise<VectorDocument[]> {
    await this.ensureCollection(project);

    try {
      // Get all documents from the collection
      const response = await axios.get(`${CHROMADB_URL}/api/v1/${project}/collections/${COLLECTION_NAME}/get`, {
        params: {
          include: ['documents', 'metadatas', 'embeddings']
        }
      });

      const results = response.data.results;
      const ids = results.ids || [];
      const documents = results.documents || [];
      const metadatas = results.metadatas || [];
      const embeddings = results.embeddings || [];

      return ids.map((id: string, index: number) => ({
        id,
        content: documents[index] || '',
        embedding: embeddings[index] || [],
        metadata: metadatas[index] || {}
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error listing documents:', message);
      return [];
    }
  }
}
