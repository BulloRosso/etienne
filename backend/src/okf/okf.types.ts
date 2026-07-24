/**
 * Types for OKF (Open Knowledge Format) v0.1 import/export.
 *
 * An OKF bundle is a directory of markdown "concept" files with YAML
 * frontmatter. Only `type` is required by the spec; `title`, `description`,
 * `resource`, `tags` and `timestamp` are the reserved queryable fields.
 * `index.md` (per-directory navigation) and `log.md` (changelog) are the
 * reserved filenames. Spec: github.com/GoogleCloudPlatform/knowledge-catalog
 */

export interface OkfFrontmatter {
  /** Concept type — the only field OKF v0.1 requires. */
  type: string;
  title?: string;
  description?: string;
  /** URL/URI pointing to the underlying resource (project-relative path on export). */
  resource?: string;
  tags?: string[];
  /** ISO 8601 creation/update timestamp. */
  timestamp?: string;
  /** The spec allows arbitrary producer-defined extra fields. */
  [k: string]: unknown;
}

export interface OkfExportOptions {
  /** Project-relative subfolder to export; empty/undefined = whole project. */
  path?: string;
  /** Extract text from PDF/Office files into concept bodies (default true). */
  extractText?: boolean;
}

export interface OkfExportResult {
  /** Suggested filename for Content-Disposition. */
  filename: string;
  /** Zip bytes ready to stream to the client. */
  buffer: Buffer;
  warnings: string[];
  conceptCount: number;
}

export interface OkfImportOptions {
  /** Project-relative target folder; defaults to okf/<bundle-root-name>. */
  targetPath?: string;
  /** Index imported concepts into the project RAG store (default true). */
  indexRag: boolean;
}

export interface OkfImportResult {
  success: boolean;
  /** Actual project-relative folder used (after collision suffixing). */
  targetPath: string;
  /** Number of markdown concept files found in the bundle. */
  conceptCount: number;
  filesWritten: number;
  /** RAG indexing successes (0 when indexing was disabled). */
  indexed: number;
  indexFailures: { path: string; message: string }[];
  warnings: string[];
  errors?: string[];
}
