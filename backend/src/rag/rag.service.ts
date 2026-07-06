import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingsService } from '../embeddings';
import { parseScopeName } from './scope-parser';
import { Bm25Service } from './bm25.service';
import { fuseRRF } from './hybrid-fusion';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:7100';

export interface IndexResult {
  success: boolean;
  documentId: string;
  scope: string;
  chunkCount: number;
  contentLength: number;
}

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, any>;
}

/** File extensions that need liteparse conversion */
const BINARY_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.docm', '.odt', '.rtf',
  '.ppt', '.pptx', '.pptm', '.odp',
  '.xls', '.xlsx', '.xlsm', '.ods',
]);

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');
  private readonly ensuredCollections = new Set<string>();
  private sentenceSplitter: any = null;

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly bm25Service: Bm25Service,
  ) {}

  private get hybridEnabled(): boolean {
    return process.env.RAG_HYBRID_ENABLED !== 'false';
  }

  /**
   * Lazily load LlamaIndex SentenceSplitter to avoid top-level import issues
   */
  private async getSentenceSplitter() {
    if (!this.sentenceSplitter) {
      const { SentenceSplitter } = await import('@llamaindex/core/node-parser');
      this.sentenceSplitter = new SentenceSplitter({
        chunkSize: 1024,
        chunkOverlap: 200,
      });
    }
    return this.sentenceSplitter;
  }

  /**
   * Split text into chunks using LlamaIndex SentenceSplitter
   */
  private async splitText(text: string): Promise<string[]> {
    const splitter = await this.getSentenceSplitter();
    // SentenceSplitter.splitText returns string[]
    return splitter.splitText(text);
  }

  // ── ChromaDB HTTP helpers (same pattern as VectorStoreService) ──

  private async ensureChromaAvailable(): Promise<void> {
    try {
      await axios.get(`${CHROMADB_URL}/api/v1/heartbeat`, { timeout: 2000 });
    } catch {
      throw new Error('ChromaDB service is not available. Please start the vector-store service on port 7100.');
    }
  }

  private async ensureCollection(project: string, collection: string): Promise<void> {
    const key = `${project}/${collection}`;
    if (this.ensuredCollections.has(key)) return;

    await this.ensureChromaAvailable();
    try {
      await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections`, {
        name: collection,
        metadata: { description: 'RAG document index' },
        get_or_create: true,
      });
      this.ensuredCollections.add(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to ensure RAG collection: ${message}`);
    }
  }

  private async addChunks(
    project: string,
    collection: string,
    chunks: { id: string; content: string; embedding: number[]; metadata: Record<string, any> }[],
  ): Promise<void> {
    if (chunks.length === 0) return;

    await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${collection}/add`, {
      ids: chunks.map(c => c.id),
      embeddings: chunks.map(c => c.embedding),
      documents: chunks.map(c => c.content),
      metadatas: chunks.map(c => c.metadata),
    });
  }

  private async removeChunksByDocumentId(
    project: string,
    collection: string,
    ftsTable: string,
    documentId: string,
  ): Promise<number> {
    // Fetch all chunk ids that carry this documentId in their metadata, then delete by id.
    // Mirrors VectorStoreService.removeDocumentChunks but uses /get (not /query) so we don't
    // need a dummy embedding of the collection's dimension.
    let ids: string[] = [];
    try {
      const response = await axios.post(
        `${CHROMADB_URL}/api/v1/${project}/collections/${collection}/get`,
        { where: { documentId }, include: ['metadatas'] },
      );
      ids = response.data?.results?.ids || response.data?.ids || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch chunks for deletion: ${message}`);
    }

    if (ids.length > 0) {
      await axios.delete(
        `${CHROMADB_URL}/api/v1/${project}/collections/${collection}/documents`,
        { data: { ids } },
      );
    }

    // Mirror the delete in BM25. Run even when Chroma returned 0 ids — the
    // sparse store might have rows from a previous index call that failed mid-way.
    try {
      this.bm25Service.removeByDocumentId(project, ftsTable, documentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`BM25 removeByDocumentId failed for ${documentId}: ${message}`);
    }

    return ids.length;
  }

  private async queryCollection(
    project: string,
    collection: string,
    queryEmbedding: number[],
    topK: number = 5,
    where?: Record<string, any>,
  ): Promise<SearchResult[]> {
    const body: any = {
      query_embeddings: [queryEmbedding],
      n_results: topK,
      include: ['documents', 'metadatas', 'distances'],
    };
    if (where) body.where = where;
    const response = await axios.post(`${CHROMADB_URL}/api/v1/${project}/collections/${collection}/query`, body);

    const results = response.data.results;
    const ids = results.ids[0] || [];
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];

    return ids.map((id: string, index: number) => {
      const distance = distances[index];
      const similarity = 1 - (distance / 2); // cosine distance to similarity
      return {
        id,
        content: documents[index] || '',
        similarity,
        metadata: metadatas[index] || {},
      };
    });
  }

  // ── Document content extraction ──

  /**
   * Extract text content from a file, using LiteParse for binary formats (PDF, Office docs).
   * LiteParse provides local parsing with built-in OCR — no external API needed.
   */
  private async extractContent(absolutePath: string): Promise<string> {
    const ext = path.extname(absolutePath).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) {
      this.logger.log(`Parsing binary file with LiteParse: ${absolutePath}`);
      // Use Function-based import to get a real ESM dynamic import that won't be
      // transpiled to require() by ts-node. @llamaindex/liteparse is ESM-only.
      const { LiteParse } = await (new Function('return import("@llamaindex/liteparse")'))();
      const parser = new LiteParse({ ocrEnabled: true, outputFormat: 'text' });
      const result = await parser.parse(absolutePath, true /* quiet */);
      if (!result.text || !result.text.trim()) {
        throw new Error('LiteParse returned empty content for the document.');
      }
      return result.text;
    }

    // Text/markdown files — read directly
    return fs.readFile(absolutePath, 'utf-8');
  }

  /**
   * For wiki pages: strip YAML frontmatter from the body before chunking, and
   * pull out a few fields (slug, title) to attach as chunk metadata so search
   * results can surface them. For non-wiki paths this is a no-op.
   */
  private wikiAwareExtract(documentPath: string, raw: string): {
    body: string;
    extraMetadata: Record<string, any>;
  } {
    const isWiki = /(^|[\\/])wiki[\\/](topics|sources)[\\/][^\\/]+\.md$/i.test(documentPath);
    if (!isWiki) return { body: raw, extraMetadata: {} };

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!fmMatch) {
      // Wiki path but no frontmatter — still tag as wiki source.
      return { body: raw, extraMetadata: { source: 'wiki' } };
    }

    const body = raw.slice(fmMatch[0].length);
    const fm = fmMatch[1];

    // Cheap line-based YAML field reader — enough for `slug:` and `title:` scalars
    // without pulling in a YAML parser.
    const readField = (name: string): string | undefined => {
      const m = fm.match(new RegExp(`^${name}\\s*:\\s*(.+?)\\s*$`, 'mi'));
      if (!m) return undefined;
      return m[1].replace(/^['"]|['"]$/g, '').trim() || undefined;
    };

    const slug = readField('slug') || path.basename(documentPath, '.md');
    const subdir = /wiki[\\/]sources[\\/]/i.test(documentPath) ? 'sources' : 'topics';

    return {
      body,
      extraMetadata: {
        source: 'wiki',
        wikiSlug: slug,
        wikiSection: subdir,
        wikiTitle: readField('title'),
      },
    };
  }

  // ── Public API ──

  /**
   * Index a document file for semantic search
   *
   * @param scopeName - Scope: project_<name>, global, or domain_<name>
   * @param documentPath - Path to the document (relative to project root in workspace)
   */
  async indexDocument(scopeName: string, documentPath: string): Promise<IndexResult> {
    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    // Resolve path — documentPath is relative to the project directory
    const projectDir = project.startsWith('_')
      ? this.workspaceDir // global/domains: documentPath should be a full workspace-relative path
      : path.join(this.workspaceDir, project);
    const absolutePath = path.resolve(projectDir, documentPath);

    // Verify file exists
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`File not found: ${documentPath}`);
    }

    // Extract text content
    const raw = await this.extractContent(absolutePath);
    if (!raw || raw.trim().length === 0) {
      throw new Error('File is empty or contains no readable content.');
    }

    // For wiki pages, drop YAML frontmatter and capture slug/title metadata
    const { body: content, extraMetadata } = this.wikiAwareExtract(documentPath, raw);

    // Split into chunks using LlamaIndex SentenceSplitter
    const chunks = await this.splitText(content);
    this.logger.log(`Document ${documentPath}: ${content.length} chars → ${chunks.length} chunks`);

    // Generate embeddings in batch
    const embeddings = await this.embeddingsService.embedBatch(chunks);

    // Generate document ID from path
    const documentId = crypto.createHash('sha256').update(documentPath).digest('hex').substring(0, 16);

    // Build chunk documents with metadata
    const chunkDocs = chunks.map((chunkContent, i) => ({
      id: `${documentId}-${i}`,
      content: chunkContent,
      embedding: embeddings[i],
      metadata: {
        documentId,
        filepath: documentPath,
        scope: scopeName,
        chunkNumber: i,
        totalChunks: chunks.length,
        contentLength: chunkContent.length,
        indexedAt: new Date().toISOString(),
        ...extraMetadata,
      },
    }));

    // Store in ChromaDB (dense), then in BM25 (sparse). Chroma-first so a BM25
    // failure can roll back the dense write; the reverse would risk orphan
    // BM25 rows that the next reindex would heal anyway, but we prefer
    // explicit consistency on the write path.
    await this.addChunks(project, collection, chunkDocs);
    try {
      this.bm25Service.indexChunks(
        project,
        ftsTable,
        chunkDocs.map((c) => ({ id: c.id, content: c.content, metadata: c.metadata })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`BM25 indexChunks failed for ${documentPath}: ${message}. Rolling back Chroma write.`);
      try {
        await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
      } catch (rollbackError) {
        const rbMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.logger.error(`Rollback failed: ${rbMessage}`);
      }
      throw error;
    }

    return {
      success: true,
      documentId,
      scope: scopeName,
      chunkCount: chunks.length,
      contentLength: content.length,
    };
  }

  /**
   * Re-index a document: remove any existing chunks for this path, then index fresh.
   * Use this on File Modified events so the vector store doesn't accumulate duplicates.
   */
  async reindexDocument(scopeName: string, documentPath: string): Promise<IndexResult & { removedChunks: number }> {
    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const documentId = crypto.createHash('sha256').update(documentPath).digest('hex').substring(0, 16);
    let removedChunks = 0;
    try {
      removedChunks = await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
    } catch (error) {
      // If the collection is empty or the document was never indexed, ignore and proceed to index.
      this.logger.warn(`reindexDocument: cleanup skipped for ${documentPath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const result = await this.indexDocument(scopeName, documentPath);
    return { ...result, removedChunks };
  }

  /**
   * Remove all indexed chunks for a document path. Use on File Deleted events.
   */
  async deleteDocument(scopeName: string, documentPath: string): Promise<{ success: boolean; documentId: string; removedChunks: number }> {
    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const documentId = crypto.createHash('sha256').update(documentPath).digest('hex').substring(0, 16);
    const removedChunks = await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
    return { success: true, documentId, removedChunks };
  }

  /**
   * Index a text chunk (up to 2000 characters)
   *
   * @param scopeName - Scope: project_<name>, global, or domain_<name>
   * @param textPart - Text to index (max 2000 chars)
   */
  async indexText(scopeName: string, textPart: string): Promise<IndexResult> {
    if (textPart.length > 2000) {
      throw new Error(`Text exceeds 2000 character limit (${textPart.length} chars). Use index_document for larger content.`);
    }
    if (!textPart.trim()) {
      throw new Error('Text cannot be empty.');
    }

    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    // Split (usually 1-2 chunks for ≤2000 chars)
    const chunks = await this.splitText(textPart);
    const embeddings = await this.embeddingsService.embedBatch(chunks);

    const documentId = crypto.createHash('sha256')
      .update(textPart.substring(0, 200) + Date.now())
      .digest('hex')
      .substring(0, 16);

    const chunkDocs = chunks.map((chunkContent, i) => ({
      id: `${documentId}-${i}`,
      content: chunkContent,
      embedding: embeddings[i],
      metadata: {
        documentId,
        source: 'text_input',
        scope: scopeName,
        chunkNumber: i,
        totalChunks: chunks.length,
        contentLength: chunkContent.length,
        indexedAt: new Date().toISOString(),
      },
    }));

    await this.addChunks(project, collection, chunkDocs);
    try {
      this.bm25Service.indexChunks(
        project,
        ftsTable,
        chunkDocs.map((c) => ({ id: c.id, content: c.content, metadata: c.metadata })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`BM25 indexChunks failed for text input: ${message}. Rolling back Chroma write.`);
      try {
        await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
      } catch (rollbackError) {
        const rbMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.logger.error(`Rollback failed: ${rbMessage}`);
      }
      throw error;
    }

    return {
      success: true,
      documentId,
      scope: scopeName,
      chunkCount: chunks.length,
      contentLength: textPart.length,
    };
  }

  /**
   * Index text under a caller-supplied stable documentId (replace-on-update).
   * Used by the requirements-tracking search projections, whose entries are keyed
   * `req:REQ-047:v3`, `svc:SVC-012:v3`, `issue:PORTAL-231` and must be rebuildable —
   * indexText's random ids cannot be replaced. Accepts arbitrary length (chunked)
   * and extra metadata that is stored on every chunk.
   */
  async indexTextWithId(
    scopeName: string,
    textPart: string,
    stableId: string,
    metadata: Record<string, any> = {},
  ): Promise<IndexResult> {
    if (!textPart.trim()) {
      throw new Error('Text cannot be empty.');
    }

    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const documentId = crypto.createHash('sha256').update(stableId).digest('hex').substring(0, 16);
    try {
      await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
    } catch {
      // never indexed before — fine
    }

    const chunks = await this.splitText(textPart);
    const embeddings = await this.embeddingsService.embedBatch(chunks);

    const chunkDocs = chunks.map((chunkContent, i) => ({
      id: `${documentId}-${i}`,
      content: chunkContent,
      embedding: embeddings[i],
      metadata: {
        ...metadata,
        documentId,
        stableId,
        source: 'projection',
        scope: scopeName,
        chunkNumber: i,
        totalChunks: chunks.length,
        contentLength: chunkContent.length,
        indexedAt: new Date().toISOString(),
      },
    }));

    await this.addChunks(project, collection, chunkDocs);
    try {
      this.bm25Service.indexChunks(
        project,
        ftsTable,
        chunkDocs.map((c) => ({ id: c.id, content: c.content, metadata: c.metadata })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`BM25 indexChunks failed for ${stableId}: ${message}. Rolling back Chroma write.`);
      try {
        await this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
      } catch (rollbackError) {
        const rbMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.logger.error(`Rollback failed: ${rbMessage}`);
      }
      throw error;
    }

    return {
      success: true,
      documentId,
      scope: scopeName,
      chunkCount: chunks.length,
      contentLength: textPart.length,
    };
  }

  /** Remove a stable-id entry from a projection scope. */
  async deleteTextWithId(scopeName: string, stableId: string): Promise<number> {
    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);
    const documentId = crypto.createHash('sha256').update(stableId).digest('hex').substring(0, 16);
    return this.removeChunksByDocumentId(project, collection, ftsTable, documentId);
  }

  /**
   * Hybrid search with a ChromaDB metadata where-clause on the dense side; the
   * sparse (BM25) side is post-filtered on the same metadata keys. Used by the
   * requirements-tracking projections to search one entity kind at a time.
   */
  async indexSearchWhere(
    scopeName: string,
    searchQuery: string,
    where: Record<string, any> | undefined,
    topK: number = 10,
  ): Promise<{ results: SearchResult[]; query: string; scope: string }> {
    if (!searchQuery.trim()) {
      throw new Error('Search query cannot be empty.');
    }

    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const queryEmbedding = await this.embeddingsService.embed(searchQuery);
    const hybrid = this.hybridEnabled;
    const candidatePoolSize = hybrid ? Math.max(20, topK * 2) : topK;

    const matchesWhere = (m: Record<string, any>) =>
      !where || Object.entries(where).every(([key, value]) => m?.[key] === value);

    const [denseResults, sparseResults] = await Promise.all([
      this.queryCollection(project, collection, queryEmbedding, candidatePoolSize, where),
      hybrid
        ? Promise.resolve(
            this.bm25Service
              .search(project, ftsTable, searchQuery, candidatePoolSize * 2)
              .filter((r) => matchesWhere(r.metadata)),
          )
        : Promise.resolve([] as SearchResult[]),
    ]);

    const results = hybrid
      ? fuseRRF(denseResults, sparseResults, 60, topK)
      : denseResults.slice(0, topK);

    return { results, query: searchQuery, scope: scopeName };
  }

  /**
   * Return the set of document paths that have been indexed in the given scope.
   */
  async getIndexedPaths(scopeName: string): Promise<string[]> {
    const { project, collection } = parseScopeName(scopeName, this.embeddingsService.dimension);

    try {
      await this.ensureCollection(project, collection);
    } catch {
      return []; // ChromaDB not available — treat as empty
    }

    try {
      const response = await axios.get(
        `${CHROMADB_URL}/api/v1/${project}/collections/${collection}/get`,
        { params: { include: 'metadatas' } },
      );

      const metadatas: Record<string, any>[] = response.data?.results?.metadatas
        || response.data?.metadatas
        || [];
      const paths = new Set<string>();
      for (const m of metadatas) {
        if (m?.filepath) paths.add(m.filepath);
      }
      return Array.from(paths);
    } catch {
      return [];
    }
  }

  /**
   * Semantic search across indexed content within a scope
   *
   * @param scopeName - Scope: project_<name>, global, or domain_<name>
   * @param searchQuery - Natural language search query
   */
  async indexSearch(scopeName: string, searchQuery: string): Promise<{ results: SearchResult[]; query: string; scope: string }> {
    if (!searchQuery.trim()) {
      throw new Error('Search query cannot be empty.');
    }

    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const queryEmbedding = await this.embeddingsService.embed(searchQuery);
    const hybrid = this.hybridEnabled;
    const candidatePoolSize = hybrid ? 20 : 5;

    const [denseResults, sparseResults] = await Promise.all([
      this.queryCollection(project, collection, queryEmbedding, candidatePoolSize),
      hybrid
        ? Promise.resolve(this.bm25Service.search(project, ftsTable, searchQuery, candidatePoolSize))
        : Promise.resolve([] as SearchResult[]),
    ]);

    const results = hybrid
      ? fuseRRF(denseResults, sparseResults, 60, 5)
      : denseResults.slice(0, 5);

    return {
      results,
      query: searchQuery,
      scope: scopeName,
    };
  }

  /**
   * Semantic search filtered to specific document filepaths.
   * Uses ChromaDB metadata where clause to restrict results.
   *
   * @param scopeName - Scope: project_<name>, global, or domain_<name>
   * @param searchQuery - Natural language search query
   * @param filepaths - Only return results from these document paths
   * @param topK - Number of results to return (default 10)
   */
  async indexSearchFiltered(
    scopeName: string,
    searchQuery: string,
    filepaths: string[],
    topK: number = 10,
  ): Promise<{ results: SearchResult[]; query: string; scope: string }> {
    if (!searchQuery.trim()) {
      throw new Error('Search query cannot be empty.');
    }

    const { project, collection, ftsTable } = parseScopeName(scopeName, this.embeddingsService.dimension);
    await this.ensureCollection(project, collection);

    const queryEmbedding = await this.embeddingsService.embed(searchQuery);
    const where = filepaths.length > 0
      ? { filepath: { $in: filepaths } }
      : undefined;
    const hybrid = this.hybridEnabled;
    // Fetch a wider candidate pool from each side when fusing so RRF has signal to work with.
    const candidatePoolSize = hybrid ? Math.max(20, topK * 2) : topK;

    const [denseResults, sparseResults] = await Promise.all([
      this.queryCollection(project, collection, queryEmbedding, candidatePoolSize, where),
      hybrid
        ? Promise.resolve(
            this.bm25Service.search(
              project,
              ftsTable,
              searchQuery,
              candidatePoolSize,
              filepaths.length > 0 ? filepaths : undefined,
            ),
          )
        : Promise.resolve([] as SearchResult[]),
    ]);

    const results = hybrid
      ? fuseRRF(denseResults, sparseResults, 60, topK)
      : denseResults.slice(0, topK);

    return {
      results,
      query: searchQuery,
      scope: scopeName,
    };
  }
}
