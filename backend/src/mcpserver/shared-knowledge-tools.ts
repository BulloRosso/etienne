import { ToolService, McpTool } from './types';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { EmbeddingsService } from '../embeddings';
import { LlmService } from '../llm/llm.service';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Shared Knowledge Tools Service
 *
 * Provides MCP tools for cross-project knowledge search in A2A scenarios.
 * When a partner agent cannot answer a question from its own project context,
 * these tools allow searching knowledge graphs and vector stores across
 * all workspace projects.
 *
 * Audit logging: every tool call is appended to
 * <calling-project>/shared-knowledge/mcp-calls.md
 */

const tools: McpTool[] = [
  {
    name: 'sk_search_cross_project',
    description:
      'Search knowledge across all projects in the workspace. Queries vector stores (semantic search) and .knowledge files (entity/instance text matching) from every project. Returns aggregated results with project attribution. Use this when the current project\'s knowledge is insufficient to answer a question.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query.',
        },
        exclude_projects: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of project names to skip (e.g., the calling project itself).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'sk_list_knowledge_sources',
    description:
      'List all available knowledge sources across the workspace. Returns every project that has .knowledge files or vector store collections, including entity type summaries and document counts.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'sk_query_project_graph',
    description:
      'Query a specific project\'s knowledge graph using natural language. Translates the query into SPARQL using the project\'s .knowledge schema and executes it against the RDF store. Use this to look up structured entities (suppliers, products, persons, etc.) in another project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The target project name (directory name in workspace).',
        },
        query: {
          type: 'string',
          description:
            'Natural language query (e.g., "All suppliers in Taiwan", "Products in the CPU category").',
        },
        entity_type: {
          type: 'string',
          description:
            'Optional entity type filter in PascalCase (e.g., "Supplier", "Product", "Person"). If omitted, all entity types are searched.',
        },
      },
      required: ['project', 'query'],
    },
  },
];

export function createSharedKnowledgeToolsService(
  vectorStoreService: VectorStoreService,
  openAiService: OpenAiService,
  knowledgeGraphService: KnowledgeGraphService,
  getProjectRoot: () => string | null,
  embeddingsService: EmbeddingsService,
  llmService: LlmService,
): ToolService {
  const workspaceDir =
    process.env.WORKSPACE_ROOT || path.join(process.cwd(), '..', 'workspace');

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Discover all project directories in the workspace.
   */
  async function discoverWorkspaceProjects(
    excludeProjects?: string[],
  ): Promise<string[]> {
    const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
    const excludeSet = new Set(excludeProjects || []);

    return entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith('.') &&
          !excludeSet.has(e.name),
      )
      .map((e) => e.name);
  }

  /**
   * Find and parse all *.knowledge files in a project directory (top-level only).
   */
  async function findKnowledgeFiles(
    projectName: string,
  ): Promise<Array<{ filename: string; data: any }>> {
    const projectDir = path.join(workspaceDir, projectName);
    const results: Array<{ filename: string; data: any }> = [];

    try {
      const files = await fs.readdir(projectDir);
      for (const file of files) {
        if (file.endsWith('.knowledge')) {
          try {
            const content = await fs.readFile(
              path.join(projectDir, file),
              'utf-8',
            );
            results.push({ filename: file, data: JSON.parse(content) });
          } catch {
            // skip malformed files
          }
        }
      }
    } catch {
      // project dir unreadable — skip
    }

    return results;
  }

  /**
   * Extract the first N sentences from a text string.
   */
  function extractFirstSentences(text: string, count = 3): string {
    const sentences = text.match(/[^.!?]*[.!?]+/g);
    if (!sentences) return text.substring(0, 300);
    return sentences.slice(0, count).join('').trim();
  }

  /**
   * Append an audit log entry to <calling-project>/shared-knowledge/mcp-calls.md.
   * Fire-and-forget: errors are silently caught.
   */
  async function appendAuditLog(
    toolName: string,
    argsStr: string,
    responseText: string,
  ): Promise<void> {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) return;

      const projectName =
        projectRoot.split('/').pop() || projectRoot.split('\\').pop();
      if (!projectName) return;

      const auditDir = path.join(workspaceDir, projectName, 'shared-knowledge');
      await fs.mkdir(auditDir, { recursive: true });

      const logPath = path.join(auditDir, 'mcp-calls.md');
      const timestamp = new Date().toISOString();
      const preview = extractFirstSentences(responseText);

      const entry = `### [${timestamp}] ${toolName}(${argsStr})\n${preview}\n\n`;
      await fs.appendFile(logPath, entry, 'utf-8');
    } catch {
      // never block tool execution
    }
  }

  // ── Tool implementations ────────────────────────────────

  /**
   * Search knowledge across all workspace projects.
   */
  async function searchCrossProject(
    query: string,
    excludeProjects?: string[],
  ): Promise<any> {
    if (!query) throw new Error('Query is required.');

    const projects = await discoverWorkspaceProjects(excludeProjects);

    // 1. Vector search across projects (parallel)
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embeddingsService.embed(query);
    } catch (err: any) {
      throw new Error(`Failed to create embedding: ${err.message}`);
    }

    const vectorPromises = projects.map(async (project) => {
      try {
        const results = await vectorStoreService.search(
          project,
          queryEmbedding,
          { topK: 3 },
        );
        return results.map((r) => ({
          project,
          source: 'vector-store' as const,
          filepath: r.metadata?.filepath || r.id,
          similarity: r.similarity,
          content: r.content,
        }));
      } catch {
        return []; // project has no vector collection — skip
      }
    });

    const vectorSettled = await Promise.allSettled(vectorPromises);
    const vectorResults = vectorSettled
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => (r as PromiseFulfilledResult<any[]>).value);

    // 2. Text match against .knowledge file instances
    const knowledgeResults: any[] = [];
    const queryLower = query.toLowerCase();

    for (const project of projects) {
      const knowledgeFiles = await findKnowledgeFiles(project);
      for (const { filename, data } of knowledgeFiles) {
        if (!data.instances) continue;

        for (const instance of data.instances) {
          const props = instance.properties || {};
          const propsText = Object.values(props).join(' ').toLowerCase();
          if (propsText.includes(queryLower) || instance.id?.toLowerCase().includes(queryLower)) {
            knowledgeResults.push({
              project,
              source: 'knowledge-file',
              knowledgeFile: filename,
              entityId: instance.id,
              entityType: instance.type,
              properties: props,
            });
          }
        }
      }
    }

    // 3. Merge and sort vector results by similarity
    const sortedVectorResults = vectorResults.sort(
      (a, b) => b.similarity - a.similarity,
    );

    const result = {
      success: true,
      query,
      projectsSearched: projects.length,
      vectorResults: {
        count: sortedVectorResults.length,
        items: sortedVectorResults,
      },
      knowledgeFileResults: {
        count: knowledgeResults.length,
        items: knowledgeResults,
      },
    };

    // Audit log
    const argsStr = `query="${query}"${excludeProjects ? `, exclude_projects=${JSON.stringify(excludeProjects)}` : ''}`;
    const summary = `Found ${sortedVectorResults.length} vector results and ${knowledgeResults.length} knowledge file matches across ${projects.length} projects.`;
    appendAuditLog('sk_search_cross_project', argsStr, summary).catch(
      () => {},
    );

    return result;
  }

  /**
   * List all knowledge sources across the workspace.
   */
  async function listKnowledgeSources(): Promise<any> {
    const projects = await discoverWorkspaceProjects();

    const projectSources: any[] = [];

    for (const project of projects) {
      const knowledgeFiles = await findKnowledgeFiles(project);

      const kfSummaries = knowledgeFiles.map(({ filename, data }) => ({
        filename,
        name: data.name || filename,
        description: data.description || '',
        entityTypes: (data.entityTypes || []).map((et: any) => et.type),
        instanceCount: (data.instances || []).length,
      }));

      // Check vector store availability
      let vectorStoreInfo: any = null;
      try {
        // Attempt a zero-result search to verify the collection exists
        const embedding = new Array(embeddingsService.dimension).fill(0);
        const results = await vectorStoreService.search(project, embedding, {
          topK: 1,
        });
        vectorStoreInfo = { exists: true, sampleCount: results.length };
      } catch {
        vectorStoreInfo = { exists: false };
      }

      if (kfSummaries.length > 0 || vectorStoreInfo.exists) {
        projectSources.push({
          project,
          knowledgeFiles: kfSummaries,
          vectorStore: vectorStoreInfo,
        });
      }
    }

    const result = {
      success: true,
      totalProjects: projects.length,
      projectsWithKnowledge: projectSources.length,
      sources: projectSources,
    };

    const summary = `Found ${projectSources.length} projects with knowledge sources out of ${projects.length} total projects.`;
    appendAuditLog('sk_list_knowledge_sources', '', summary).catch(() => {});

    return result;
  }

  /**
   * Query a specific project's knowledge graph via natural language → SPARQL.
   */
  async function queryProjectGraph(
    project: string,
    query: string,
    entityType?: string,
  ): Promise<any> {
    if (!project) throw new Error('Project name is required.');
    if (!query) throw new Error('Query is required.');

    // Verify the project exists
    const projectDir = path.join(workspaceDir, project);
    try {
      await fs.access(projectDir);
    } catch {
      throw new Error(`Project "${project}" not found in workspace.`);
    }

    // Load .knowledge files for schema context
    const knowledgeFiles = await findKnowledgeFiles(project);
    let schemaContext = '';

    if (knowledgeFiles.length > 0) {
      for (const { data } of knowledgeFiles) {
        if (data.entityTypes) {
          schemaContext += 'Entity Types:\n';
          for (const et of data.entityTypes) {
            schemaContext += `- ${et.type} (properties: ${(et.properties || []).join(', ')}): ${et.description || ''}\n`;
          }
        }
        if (data.relationships) {
          schemaContext += '\nRelationships:\n';
          for (const rel of data.relationships) {
            schemaContext += `- ${rel.from} —[${rel.relation}]→ ${rel.to}\n`;
          }
        }
      }
    }

    // Fallback: also try TTL schema
    if (!schemaContext) {
      const schemaPath = path.join(
        workspaceDir,
        project,
        'knowledge-graph',
        'entity-schema.ttl',
      );
      try {
        await fs.access(schemaPath);
        schemaContext = await fs.readFile(schemaPath, 'utf-8');
      } catch {
        schemaContext = `Base URI: http://example.org/kg/\nNo schema available — generate a best-effort SPARQL query.`;
      }
    }

    const targetType = entityType || 'any entity';

    // Generate SPARQL via LLM
    const systemPrompt = `You are a SPARQL query generator for a knowledge graph.

Entity Schema:
${schemaContext}

Your task is to generate a SPARQL query that finds ${targetType} entities matching the user's query.

Important rules:
1. Always use the base URI http://example.org/kg/
2. Include relevant properties in the SELECT
3. Use FILTER or pattern matching to satisfy the query criteria
4. Return ONLY the SPARQL query without any explanation or markdown formatting`;

    const userPrompt = `Generate a SPARQL query to find ${targetType} entities matching: "${query}"`;

    const result = await llmService.generateTextWithMessages({
      tier: 'small',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 1024,
    });

    let sparqlQuery = result.trim();
    sparqlQuery = sparqlQuery
      .replace(/```sparql\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Execute the SPARQL query
    const sparqlResults = await knowledgeGraphService.executeSparqlQuery(
      project,
      sparqlQuery,
    );

    // Transform results
    const entities = transformSparqlResults(sparqlResults, entityType || 'Entity');

    const result = {
      success: true,
      project,
      query,
      entityType: entityType || 'all',
      sparqlQuery,
      count: entities.length,
      entities,
    };

    const argsStr = `project="${project}", query="${query}"${entityType ? `, entity_type="${entityType}"` : ''}`;
    const summary = `Found ${entities.length} entities in project "${project}" matching "${query}".`;
    appendAuditLog('sk_query_project_graph', argsStr, summary).catch(
      () => {},
    );

    return result;
  }

  /**
   * Transform SPARQL results into structured JSON (same pattern as knowledge-graph-tools.ts).
   */
  function transformSparqlResults(results: any[], entityType: string): any[] {
    if (!results || results.length === 0) return [];

    const entitiesMap = new Map<string, any>();

    for (const triple of results) {
      const entityUri = triple.subject;

      if (!entitiesMap.has(entityUri)) {
        entitiesMap.set(entityUri, {
          uri: entityUri,
          id: entityUri.replace('http://example.org/kg/', ''),
          type: entityType,
          properties: {},
          relationships: [],
        });
      }

      const entity = entitiesMap.get(entityUri);
      const predicate = triple.predicate.replace('http://example.org/kg/', '');
      const object = triple.object;

      if (object.startsWith('http://')) {
        entity.relationships.push({
          predicate,
          target: object.replace('http://example.org/kg/', ''),
          targetUri: object,
        });
      } else {
        entity.properties[predicate] = object;
      }
    }

    return Array.from(entitiesMap.values());
  }

  // ── Execute dispatcher ──────────────────────────────────

  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'sk_search_cross_project':
        return searchCrossProject(args.query, args.exclude_projects);

      case 'sk_list_knowledge_sources':
        return listKnowledgeSources();

      case 'sk_query_project_graph':
        return queryProjectGraph(args.project, args.query, args.entity_type);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
