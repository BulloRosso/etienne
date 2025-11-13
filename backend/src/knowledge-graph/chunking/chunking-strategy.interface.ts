/**
 * Represents a chunk of a document
 */
export interface DocumentChunk {
  /**
   * Unique identifier for the chunk (e.g., "doc-id-1", "doc-id-2")
   */
  chunkId: string;

  /**
   * The original document ID
   */
  documentId: string;

  /**
   * The chunk number (1-indexed)
   */
  chunkNumber: number;

  /**
   * The content of this chunk
   */
  content: string;

  /**
   * Start position in the original document
   */
  startPosition: number;

  /**
   * End position in the original document
   */
  endPosition: number;

  /**
   * Total number of chunks for this document
   */
  totalChunks: number;
}

/**
 * Interface for document chunking strategies
 */
export interface ChunkingStrategy {
  /**
   * The name of the chunking strategy
   */
  getName(): string;

  /**
   * Splits a document into chunks based on the strategy
   * @param documentId The ID of the document being chunked
   * @param content The full content of the document
   * @returns Array of document chunks
   */
  chunk(documentId: string, content: string): DocumentChunk[];
}
