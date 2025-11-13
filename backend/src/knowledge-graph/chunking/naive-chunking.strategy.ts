import { ChunkingStrategy, DocumentChunk } from './chunking-strategy.interface';

/**
 * Naive Chunking Strategy
 *
 * Splits documents into fixed-size chunks with overlapping content.
 * - Default chunk size: 8096 characters
 * - Default overlap: 20% (1619 characters)
 *
 * Example:
 * For a 20000 character document with 8096 chunk size and 20% overlap:
 * - Chunk 1: chars 0-8096
 * - Chunk 2: chars 6477-14573 (overlaps 1619 chars with chunk 1)
 * - Chunk 3: chars 12954-20000 (overlaps 1619 chars with chunk 2)
 */
export class NaiveChunkingStrategy implements ChunkingStrategy {
  private readonly chunkSize: number;
  private readonly overlapPercentage: number;
  private readonly overlapSize: number;

  /**
   * Creates a new Naive Chunking Strategy
   * @param chunkSize Maximum size of each chunk in characters (default: 8096)
   * @param overlapPercentage Percentage of overlap between chunks (default: 0.2 = 20%)
   */
  constructor(chunkSize: number = 8096, overlapPercentage: number = 0.2) {
    if (chunkSize <= 0) {
      throw new Error('Chunk size must be greater than 0');
    }
    if (overlapPercentage < 0 || overlapPercentage >= 1) {
      throw new Error('Overlap percentage must be between 0 and 1 (exclusive)');
    }

    this.chunkSize = chunkSize;
    this.overlapPercentage = overlapPercentage;
    this.overlapSize = Math.floor(chunkSize * overlapPercentage);
  }

  getName(): string {
    return 'Naive Chunking';
  }

  chunk(documentId: string, content: string): DocumentChunk[] {
    // If content is smaller than chunk size, return single chunk
    if (content.length <= this.chunkSize) {
      return [{
        chunkId: `${documentId}-1`,
        documentId,
        chunkNumber: 1,
        content,
        startPosition: 0,
        endPosition: content.length,
        totalChunks: 1
      }];
    }

    const chunks: DocumentChunk[] = [];
    let currentPosition = 0;
    let chunkNumber = 1;
    const stepSize = this.chunkSize - this.overlapSize;

    while (currentPosition < content.length) {
      const endPosition = Math.min(currentPosition + this.chunkSize, content.length);
      const chunkContent = content.substring(currentPosition, endPosition);

      chunks.push({
        chunkId: `${documentId}-${chunkNumber}`,
        documentId,
        chunkNumber,
        content: chunkContent,
        startPosition: currentPosition,
        endPosition,
        totalChunks: 0 // Will be updated after all chunks are created
      });

      currentPosition += stepSize;
      chunkNumber++;

      // Break if we've reached the end
      if (endPosition === content.length) {
        break;
      }
    }

    // Update total chunks count for all chunks
    const totalChunks = chunks.length;
    chunks.forEach(chunk => {
      chunk.totalChunks = totalChunks;
    });

    return chunks;
  }

  /**
   * Gets information about this chunking strategy
   */
  getInfo(): {
    name: string;
    chunkSize: number;
    overlapPercentage: number;
    overlapSize: number;
  } {
    return {
      name: this.getName(),
      chunkSize: this.chunkSize,
      overlapPercentage: this.overlapPercentage,
      overlapSize: this.overlapSize
    };
  }
}
