import { ToolService, McpTool } from './types';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

/**
 * Knowledge Graph Tools Service
 *
 * Provides MCP tools for managing documents in the knowledge graph vector store.
 * Allows Claude Code to learn from documents, search the knowledge base, and forget documents.
 */

/**
 * Tool definitions for knowledge graph document management
 */
const tools: McpTool[] = [
  {
    name: 'kg_learn_document',
    description: 'Adds a document to the vector store of the knowledge base. Reads the document content, generates embeddings, and stores it for semantic search. The filepath is relative to the project directory in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        filepath: {
          type: 'string',
          description: 'Relative path to the document file within the project workspace (e.g., "docs/readme.md", "data/report.txt").',
        },
      },
      required: ['project', 'filepath'],
    },
  },
  {
    name: 'kg_search_document',
    description: 'Searches documents inside the vector store of the knowledge base. The query is a question in natural language which is internally converted into a vector embedding. Returns the concatenation of the first 3 full document contents as plain text. If no content is found, returns "We have no data for this".',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        query: {
          type: 'string',
          description: 'Natural language query or question to search for in the knowledge base (e.g., "What is the architecture?", "How does authentication work?").',
        },
      },
      required: ['project', 'query'],
    },
  },
  {
    name: 'kg_forget_document',
    description: 'Deletes a document from the vector store of the knowledge base. The filepath is relative to the project directory in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        filepath: {
          type: 'string',
          description: 'Relative path to the document file within the project workspace (e.g., "docs/readme.md", "data/report.txt").',
        },
      },
      required: ['project', 'filepath'],
    },
  },
];

/**
 * Create a knowledge graph tools service with injected dependencies
 * @param vectorStoreService - The vector store service instance
 * @param openAiService - The OpenAI service instance for embeddings
 * @returns ToolService instance
 */
export function createKnowledgeGraphToolsService(
  vectorStoreService: VectorStoreService,
  openAiService: OpenAiService,
): ToolService {
  const workspaceDir = path.join(process.cwd(), '..', 'workspace');

  /**
   * Generate a unique document ID from filepath
   * @param filepath - Relative file path
   * @returns SHA256 hash of the filepath
   */
  function generateDocumentId(filepath: string): string {
    return crypto.createHash('sha256').update(filepath).digest('hex');
  }

  /**
   * Add a document to the knowledge base vector store
   *
   * @param project - Project name
   * @param filepath - Relative path to the document file
   * @returns Success message with document info
   */
  async function learnDocument(project: string, filepath: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!filepath) {
      throw new Error('Filepath is required.');
    }

    try {
      // Construct full path to the document
      const fullPath = path.join(workspaceDir, project, filepath);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch (error) {
        throw new Error(`File not found: ${filepath}`);
      }

      // Read file content
      const content = await fs.readFile(fullPath, 'utf-8');

      if (!content || content.trim().length === 0) {
        throw new Error('File is empty or contains no readable content.');
      }

      // Generate embedding for the document content
      const embedding = await openAiService.createEmbedding(content);

      // Create document ID from filepath
      const documentId = generateDocumentId(filepath);

      // Add document to vector store
      await vectorStoreService.addDocument(project, {
        id: documentId,
        content: content,
        embedding: embedding,
        metadata: {
          filepath: filepath,
          filename: path.basename(filepath),
          createdAt: new Date().toISOString(),
          contentLength: content.length,
        },
      });

      return {
        success: true,
        message: `Document successfully added to knowledge base: ${filepath}`,
        documentId: documentId,
        filepath: filepath,
        contentLength: content.length,
        projectName: project,
      };
    } catch (error: any) {
      throw new Error(`Failed to learn document: ${error.message}`);
    }
  }

  /**
   * Search for documents in the knowledge base
   *
   * @param project - Project name
   * @param query - Natural language query
   * @returns Concatenated content of top 3 matching documents or "We have no data for this"
   */
  async function searchDocument(project: string, query: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!query) {
      throw new Error('Query is required.');
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await openAiService.createEmbedding(query);

      // Search vector store for top 3 matches
      const results = await vectorStoreService.search(project, queryEmbedding, 3);

      // If no results found
      if (!results || results.length === 0) {
        return {
          success: true,
          content: 'We have no data for this',
          matchCount: 0,
          query: query,
        };
      }

      // Concatenate the content of all found documents
      const concatenatedContent = results
        .map((result, index) => {
          const separator = index === 0 ? '' : '\n\n---\n\n';
          return `${separator}[Document ${index + 1}: ${result.metadata.filepath || 'unknown'} (similarity: ${(result.similarity * 100).toFixed(1)}%)]\n\n${result.content}`;
        })
        .join('');

      return {
        success: true,
        content: concatenatedContent,
        matchCount: results.length,
        query: query,
        matches: results.map(r => ({
          filepath: r.metadata.filepath,
          similarity: r.similarity,
        })),
      };
    } catch (error: any) {
      throw new Error(`Failed to search documents: ${error.message}`);
    }
  }

  /**
   * Delete a document from the knowledge base vector store
   *
   * @param project - Project name
   * @param filepath - Relative path to the document file
   * @returns Success message
   */
  async function forgetDocument(project: string, filepath: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!filepath) {
      throw new Error('Filepath is required.');
    }

    try {
      // Create document ID from filepath
      const documentId = generateDocumentId(filepath);

      // Remove document from vector store
      await vectorStoreService.removeDocument(project, documentId);

      return {
        success: true,
        message: `Document successfully removed from knowledge base: ${filepath}`,
        documentId: documentId,
        filepath: filepath,
        projectName: project,
      };
    } catch (error: any) {
      throw new Error(`Failed to forget document: ${error.message}`);
    }
  }

  /**
   * Execute a tool by name with given arguments
   *
   * @param toolName - Name of the tool to execute
   * @param args - Arguments for the tool
   * @returns Tool execution result
   */
  async function execute(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'kg_learn_document':
        return learnDocument(args.project, args.filepath);

      case 'kg_search_document':
        return searchDocument(args.project, args.query);

      case 'kg_forget_document':
        return forgetDocument(args.project, args.filepath);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
