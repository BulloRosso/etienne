import { ToolService, McpTool } from './types';
import { RagService } from '../rag/rag.service';

/**
 * RAG (Retrieval-Augmented Generation) Tools Service
 *
 * Provides MCP tools for indexing documents and searching across
 * scoped document libraries:
 * - project_<name>  — project-specific documents
 * - global          — cross-project shared library
 * - domain_<name>   — topic-specific collections
 */

const tools: McpTool[] = [
  {
    name: 'rag_index_document',
    description:
      'Index a document file for semantic search. Reads the file, extracts text (supports PDF, Word, Excel, PowerPoint via liteparse), splits into chunks, and stores embeddings in the specified scope. Use scope "project_<name>" for project docs, "global" for cross-project, or "domain_<name>" for topic-specific libraries.',
    inputSchema: {
      type: 'object',
      properties: {
        scope_name: {
          type: 'string',
          description:
            'The document scope/library to index into. Use "project_<project_name>" (default, for project documents), "global" (cross-project), or "domain_<domain_name>" (topic-specific, e.g. "domain_legal").',
        },
        document_path: {
          type: 'string',
          description:
            'Path to the document file, relative to the project root in the workspace (e.g., "documents/report.pdf", "docs/architecture.md").',
        },
      },
      required: ['scope_name', 'document_path'],
    },
  },
  {
    name: 'rag_index_text',
    description:
      'Index a short text chunk (up to 2000 characters) for semantic search. Use this to add knowledge snippets, notes, or extracted content to a scope without needing a file.',
    inputSchema: {
      type: 'object',
      properties: {
        scope_name: {
          type: 'string',
          description:
            'The document scope/library to index into. Use "project_<project_name>", "global", or "domain_<domain_name>".',
        },
        text_part: {
          type: 'string',
          description: 'Text content to index (maximum 2000 characters).',
        },
      },
      required: ['scope_name', 'text_part'],
    },
  },
  {
    name: 'rag_index_search',
    description:
      'Semantic search across indexed documents within a scope. Returns the top matching document chunks with similarity scores. Use scope "project_<name>" to search project docs, "global" to search across all projects, or "domain_<name>" for topic-specific searches.',
    inputSchema: {
      type: 'object',
      properties: {
        scope_name: {
          type: 'string',
          description:
            'The document scope/library to search. Use "project_<project_name>", "global", or "domain_<domain_name>".',
        },
        search_query: {
          type: 'string',
          description:
            'Natural language search query (e.g., "What is the authentication architecture?", "Find documents about compliance").',
        },
      },
      required: ['scope_name', 'search_query'],
    },
  },
];

/**
 * Create a RAG tools service with injected dependencies
 */
export function createRagToolsService(ragService: RagService): ToolService {
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'rag_index_document':
        return ragService.indexDocument(args.scope_name, args.document_path);

      case 'rag_index_text':
        return ragService.indexText(args.scope_name, args.text_part);

      case 'rag_index_search':
        return ragService.indexSearch(args.scope_name, args.search_query);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
