export interface ScopeMapping {
  /** ChromaDB project parameter (maps to a PersistentClient instance) */
  project: string;
  /** ChromaDB collection name within the project */
  collection: string;
}

/**
 * Parse a scope name into ChromaDB project + collection coordinates.
 *
 * Scope conventions:
 * - "project_<name>"  → project documents library (default)
 * - "global"          → cross-project shared library
 * - "domain_<name>"   → topic-specific library (e.g. domain_legal)
 */
export function parseScopeName(scopeName: string, dimension: number): ScopeMapping {
  if (scopeName === 'global') {
    return { project: '_global', collection: `rag_${dimension}` };
  }

  if (scopeName.startsWith('domain_')) {
    const domain = scopeName.substring(7);
    if (!domain) throw new Error('Domain name cannot be empty. Use format: domain_<name>');
    return { project: '_domains', collection: `rag_${domain}_${dimension}` };
  }

  if (scopeName.startsWith('project_')) {
    const projectName = scopeName.substring(8);
    if (!projectName) throw new Error('Project name cannot be empty. Use format: project_<name>');
    return { project: projectName, collection: `rag_${dimension}` };
  }

  // Fallback: treat bare string as project name
  return { project: scopeName, collection: `rag_${dimension}` };
}
