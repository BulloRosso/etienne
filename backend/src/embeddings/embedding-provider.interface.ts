export interface EmbeddingProvider {
  /** Provider name, e.g. "transformers" or "openai" */
  readonly name: string;

  /** Dimensionality of vectors produced by this provider (set after initialize) */
  readonly dimension: number;

  /** Model identifier used by this provider */
  readonly model: string;

  /**
   * Initialize the provider (load models, verify API keys, detect dimension).
   * Called once during module init before any requests are served.
   */
  initialize(): Promise<void>;

  /** Generate an embedding vector for a single text input */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in a single batch.
   * More efficient than calling embed() in a loop.
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}
