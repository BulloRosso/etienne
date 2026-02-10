import { ToolService, McpTool } from './types';
import { VectorStoreService } from '../knowledge-graph/vector-store/vector-store.service';
import { OpenAiService } from '../knowledge-graph/openai/openai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
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
    description: 'Adds a document to the vector store of the knowledge base. Reads the document content, generates embeddings, and stores it for semantic search. The filepath is relative to the project directory in the workspace. For binary files (PDF, DOCX, XLSX, PPTX) that cannot be read as UTF-8, convert the file to markdown text first using the markitdown library, then pass the converted text in the optional content parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        filepath: {
          type: 'string',
          description: 'Relative path to the document file within the project workspace (e.g., "docs/readme.md", "data/report.txt"). This is used as the document identifier even when content is provided directly.',
        },
        content: {
          type: 'string',
          description: 'Optional. Pre-extracted text content of the document. When provided, the tool uses this content instead of reading from the file. Use this for binary files (PDF, DOCX, XLSX, PPTX) that have been converted to text using markitdown.',
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
  {
    name: 'kg_find_Companies',
    description: 'Finds one or more companies in the knowledge graph according to the natural language query. Uses the entity schema to construct a SPARQL query and returns a list of companies with their properties.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        query: {
          type: 'string',
          description: 'Natural language query to find companies (e.g., "Companies in the automotive industry", "All companies founded after 2010").',
        },
      },
      required: ['project', 'query'],
    },
  },
  {
    name: 'kg_find_Persons',
    description: 'Finds one or more persons in the knowledge graph according to the natural language query. Returns a list of persons with their properties and the companies they are employed by.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        query: {
          type: 'string',
          description: 'Natural language query to find persons (e.g., "Scientists working on AI", "Engineers at Tesla").',
        },
      },
      required: ['project', 'query'],
    },
  },
  {
    name: 'kg_find_Products',
    description: 'Finds one or more products in the knowledge graph according to the natural language query. Returns a list of products with their properties and the companies that manufacture them.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'The project name (directory name in workspace). Extract this from the current working directory.',
        },
        query: {
          type: 'string',
          description: 'Natural language query to find products (e.g., "Electric vehicles", "Products using AI technology").',
        },
      },
      required: ['project', 'query'],
    },
  },
];

/**
 * Create a knowledge graph tools service with injected dependencies
 * @param vectorStoreService - The vector store service instance
 * @param openAiService - The OpenAI service instance for embeddings
 * @param knowledgeGraphService - The knowledge graph service instance for SPARQL queries
 * @returns ToolService instance
 */
export function createKnowledgeGraphToolsService(
  vectorStoreService: VectorStoreService,
  openAiService: OpenAiService,
  knowledgeGraphService: KnowledgeGraphService,
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
  async function learnDocument(project: string, filepath: string, providedContent?: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!filepath) {
      throw new Error('Filepath is required.');
    }

    try {
      let content: string;

      if (providedContent) {
        // Use pre-extracted content (e.g., from markitdown conversion of binary files)
        content = providedContent;
      } else {
        // Read content from file
        const fullPath = path.join(workspaceDir, project, filepath);

        // Check if file exists
        try {
          await fs.access(fullPath);
        } catch (error) {
          throw new Error(`File not found: ${filepath}`);
        }

        content = await fs.readFile(fullPath, 'utf-8');
      }

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
   * Generate SPARQL query from natural language using OpenAI and entity schema
   *
   * @param project - Project name
   * @param query - Natural language query
   * @param entityType - Type of entity to search for (Person, Company, Product)
   * @returns Generated SPARQL query string
   */
  async function generateSparqlQuery(
    project: string,
    query: string,
    entityType: string,
  ): Promise<string> {
    try {
      // Load entity schema if available
      const schemaPath = path.join(workspaceDir, project, 'knowledge-graph', 'entity-schema.ttl');
      let schemaContext = '';

      try {
        await fs.access(schemaPath);
        schemaContext = await fs.readFile(schemaPath, 'utf-8');
      } catch (error) {
        // Use default schema information if file doesn't exist
        schemaContext = `
Base URI: http://example.org/kg/

Entity Types:
- Person (properties: name, email, phone, position)
- Company (properties: name, industry, location, foundedYear)
- Product (properties: name, description, price, category)

Relationship Types:
- isEmployeeOf / worksAt: Person → Company
- isManufacturedBy / manufactures: Product → Company
- isOf: Product → Technology
`;
      }

      // Create a specialized prompt for SPARQL generation
      const systemPrompt = `You are a SPARQL query generator for a knowledge graph.

Entity Schema:
${schemaContext}

Your task is to generate a SPARQL query that finds ${entityType} entities matching the user's query.

Important rules:
1. Always use the base URI http://example.org/kg/
2. For Companies: Include properties like name, industry, location
3. For Persons: Include properties like name, position, and include their employment relationships (isEmployeeOf or worksAt)
4. For Products: Include properties like name, description, and include manufacturing relationships (isManufacturedBy)
5. Use FILTER clauses to match the query criteria
6. Return ONLY the SPARQL query without any explanation or markdown formatting`;

      const userPrompt = `Generate a SPARQL query to find ${entityType} entities matching: "${query}"`;

      const response = await openAiService['client'].chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      });

      let sparqlQuery = response.choices[0].message.content.trim();

      // Clean up the query - remove markdown code blocks if present
      sparqlQuery = sparqlQuery.replace(/```sparql\n?/g, '').replace(/```\n?/g, '').trim();

      return sparqlQuery;
    } catch (error: any) {
      throw new Error(`Failed to generate SPARQL query: ${error.message}`);
    }
  }

  /**
   * Find companies in the knowledge graph
   *
   * @param project - Project name
   * @param query - Natural language query
   * @returns List of companies with their properties
   */
  async function findCompanies(project: string, query: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!query) {
      throw new Error('Query is required.');
    }

    try {
      // Generate SPARQL query using OpenAI
      const sparqlQuery = await generateSparqlQuery(project, query, 'Company');

      // Execute the SPARQL query
      const results = await knowledgeGraphService.executeSparqlQuery(project, sparqlQuery);

      // Transform results into a structured format
      const companies = transformSparqlResults(results, 'Company');

      return {
        success: true,
        query: query,
        sparqlQuery: sparqlQuery,
        count: companies.length,
        companies: companies,
      };
    } catch (error: any) {
      throw new Error(`Failed to find companies: ${error.message}`);
    }
  }

  /**
   * Find persons in the knowledge graph
   *
   * @param project - Project name
   * @param query - Natural language query
   * @returns List of persons with their properties and employment relationships
   */
  async function findPersons(project: string, query: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!query) {
      throw new Error('Query is required.');
    }

    try {
      // Generate SPARQL query using OpenAI
      const sparqlQuery = await generateSparqlQuery(project, query, 'Person');

      // Execute the SPARQL query
      const results = await knowledgeGraphService.executeSparqlQuery(project, sparqlQuery);

      // Transform results into a structured format
      const persons = transformSparqlResults(results, 'Person');

      return {
        success: true,
        query: query,
        sparqlQuery: sparqlQuery,
        count: persons.length,
        persons: persons,
      };
    } catch (error: any) {
      throw new Error(`Failed to find persons: ${error.message}`);
    }
  }

  /**
   * Find products in the knowledge graph
   *
   * @param project - Project name
   * @param query - Natural language query
   * @returns List of products with their properties and manufacturing relationships
   */
  async function findProducts(project: string, query: string): Promise<any> {
    if (!project) {
      throw new Error('Project name is required. Extract it from the workspace path.');
    }

    if (!query) {
      throw new Error('Query is required.');
    }

    try {
      // Generate SPARQL query using OpenAI
      const sparqlQuery = await generateSparqlQuery(project, query, 'Product');

      // Execute the SPARQL query
      const results = await knowledgeGraphService.executeSparqlQuery(project, sparqlQuery);

      // Transform results into a structured format
      const products = transformSparqlResults(results, 'Product');

      return {
        success: true,
        query: query,
        sparqlQuery: sparqlQuery,
        count: products.length,
        products: products,
      };
    } catch (error: any) {
      throw new Error(`Failed to find products: ${error.message}`);
    }
  }

  /**
   * Transform SPARQL results into structured JSON format
   *
   * @param results - Raw SPARQL query results (array of triples)
   * @param entityType - Type of entity being queried
   * @returns Structured array of entities
   */
  function transformSparqlResults(results: any[], entityType: string): any[] {
    if (!results || results.length === 0) {
      return [];
    }

    // Group triples by subject (entity URI)
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

      // Determine if this is a property or relationship
      if (object.startsWith('http://')) {
        // This is a relationship
        entity.relationships.push({
          predicate: predicate,
          target: object.replace('http://example.org/kg/', ''),
          targetUri: object,
        });
      } else {
        // This is a property
        entity.properties[predicate] = object;
      }
    }

    return Array.from(entitiesMap.values());
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
        return learnDocument(args.project, args.filepath, args.content);

      case 'kg_search_document':
        return searchDocument(args.project, args.query);

      case 'kg_forget_document':
        return forgetDocument(args.project, args.filepath);

      case 'kg_find_Companies':
        return findCompanies(args.project, args.query);

      case 'kg_find_Persons':
        return findPersons(args.project, args.query);

      case 'kg_find_Products':
        return findProducts(args.project, args.query);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return {
    tools,
    execute,
  };
}
