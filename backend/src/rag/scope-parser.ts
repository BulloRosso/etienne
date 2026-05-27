export interface ScopeMapping {
  /** ChromaDB project parameter (maps to a PersistentClient instance) */
  project: string;
  /** ChromaDB collection name within the project */
  collection: string;
  /** SQLite FTS5 virtual table name for the BM25 sparse index (dimension-independent) */
  ftsTable: string;
}

/**
 * Parse a scope name into ChromaDB project + collection coordinates and the
 * matching BM25 FTS5 table name. BM25 is dimension-agnostic, so ftsTable omits
 * the embedding dimension suffix that Chroma collections carry.
 *
 * Scope conventions:
 * - "project_<name>"  → project documents library (default)
 * - "global"          → cross-project shared library
 * - "domain_<name>"   → topic-specific library (e.g. domain_legal)
 */
export function parseScopeName(scopeName: string, dimension: number): ScopeMapping {
  if (scopeName === 'global') {
    return { project: '_global', collection: `rag_${dimension}`, ftsTable: 'rag_fts' };
  }

  if (scopeName.startsWith('domain_')) {
    const domain = scopeName.substring(7);
    if (!domain) throw new Error('Domain name cannot be empty. Use format: domain_<name>');
    return { project: '_domains', collection: `rag_${domain}_${dimension}`, ftsTable: `rag_${domain}_fts` };
  }

  if (scopeName.startsWith('project_')) {
    const projectName = scopeName.substring(8);
    if (!projectName) throw new Error('Project name cannot be empty. Use format: project_<name>');
    return { project: projectName, collection: `rag_${dimension}`, ftsTable: 'rag_fts' };
  }

  // Fallback: treat bare string as project name
  return { project: scopeName, collection: `rag_${dimension}`, ftsTable: 'rag_fts' };
}
