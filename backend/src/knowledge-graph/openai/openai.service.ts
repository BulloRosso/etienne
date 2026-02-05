import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class OpenAiService {
  private client: OpenAI | null = null;
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');
  private readonly logger = new Logger(OpenAiService.name);
  private readonly isAvailable: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.isAvailable = true;
      this.logger.log('OpenAI service initialized successfully');
    } else {
      this.isAvailable = false;
      this.logger.warn('OPENAI_API_KEY not set. OpenAI features (embeddings, SPARQL translation, entity extraction) will not be available.');
    }
  }

  /**
   * Check if OpenAI service is available
   */
  public checkAvailability(): boolean {
    return this.isAvailable;
  }

  /**
   * Throws an error if OpenAI is not available
   */
  private ensureAvailable(): void {
    if (!this.client) {
      throw new Error('OpenAI service is not available. Please set OPENAI_API_KEY environment variable to enable this feature.');
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    this.ensureAvailable();
    try {
      const response = await this.client!.embeddings.create({
        model: 'text-embedding-3-small',
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new Error(`Failed to create embedding: ${error.message}`);
    }
  }

  async translateToSparql(query: string, project?: string): Promise<string> {
    this.ensureAvailable();
    let schemaContext = '';

    // Load project-specific schema if project is provided
    if (project) {
      try {
        const schemaPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'entity-schema.ttl');
        await fs.access(schemaPath);
        schemaContext = await fs.readFile(schemaPath, 'utf-8');
      } catch (error) {
        // Fall back to default schema if file doesn't exist
        schemaContext = '';
      }
    }

    // Use default schema if no project-specific schema found
    if (!schemaContext) {
      schemaContext = `Entity Types:
- Person (properties: name, email, phone)
- Company (properties: name, industry, location)
- Product (properties: name, description, price, category)
- Document (properties: content, uploadedAt, entityCount, fullContentLength)

Relationship Types:
- worksAt / isEmployeeOf (is employed at): Person → Company
- manufactures / isManufacturedBy: Company → Product
- worksWith (works with): Person → Person
- hasCustomer (has customer): Company → Company
- invented: Person → Product
- contains: Document → Person/Company/Product

Base URI: http://example.org/kg/`;
    }

    const systemPrompt = `You are a SPARQL query generator for a knowledge graph with the following schema:

${schemaContext}

Convert the natural language query into a valid SPARQL query. Return ONLY the SPARQL query without any explanation or markdown formatting.`;

    try {
      const response = await this.client!.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1
      });

      let sparqlQuery = response.choices[0].message.content.trim();

      // Clean up the query - remove markdown code blocks if present
      sparqlQuery = sparqlQuery.replace(/```sparql\n?/g, '').replace(/```\n?/g, '').trim();

      return sparqlQuery;
    } catch (error) {
      throw new Error(`Failed to translate to SPARQL: ${error.message}`);
    }
  }

  async expandSearchContext(query: string): Promise<string[]> {
    this.ensureAvailable();
    try {
      const response = await this.client!.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Generate 3-5 related search terms and synonyms for the given query. Return as comma-separated list.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.3
      });

      const terms = response.choices[0].message.content.trim().split(',');
      return terms.map(term => term.trim());
    } catch (error) {
      throw new Error(`Failed to expand search context: ${error.message}`);
    }
  }

  async extractEntitiesFromMarkdown(project: string, content: string): Promise<any> {
    this.ensureAvailable();
    try {
      // Load schema and extraction prompt from files
      const schemaPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'entity-schema.ttl');
      const promptPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'extraction-prompt.md');

      let instructions: string;
      let schemaDescription = '';

      // Try to load custom RDF schema for documentation/context
      try {
        await fs.access(schemaPath);
        schemaDescription = await fs.readFile(schemaPath, 'utf-8');
      } catch (error) {
        // No custom schema, will use default in prompt
        schemaDescription = '';
      }

      // Try to load custom extraction prompt, fallback to default
      try {
        await fs.access(promptPath);
        instructions = await fs.readFile(promptPath, 'utf-8');
        // Replace placeholder with actual content
        instructions = instructions.replace('[INPUT_TEXT_PLACEHOLDER]', '');

        // If we have a schema, prepend it to the instructions for context
        if (schemaDescription) {
          instructions = `# Entity Schema\n\n${schemaDescription}\n\n# Extraction Instructions\n\n${instructions}`;
        }
      } catch (error) {
        // Use default instructions if file doesn't exist
        instructions = 'You are an entity extraction AI. Extract entities from the given markdown text and categorize them into Person (people names), Company (company/organization names), and Product (product/invention names). Only include entities that are clearly mentioned in the text.';
      }

      // Use a flexible JSON Schema that allows any entity type
      const schema = {
        type: 'object',
        properties: {
          entities: {
            type: 'object',
            properties: {
              Person: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of person names found in the text'
              },
              Company: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of company or organization names found in the text'
              },
              Product: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of product or invention names found in the text'
              },
              Employee: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of employee names found in the text'
              },
              Technology: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of technologies found in the text'
              }
            },
            required: ['Person', 'Company', 'Product', 'Employee', 'Technology'],
            additionalProperties: false
          }
        },
        required: ['entities'],
        additionalProperties: false
      };

      // Use Responses API instead of Chat Completions
      const response = await this.client!.responses.create({
        model: 'gpt-4.1-mini',
        instructions: instructions,
        input: content,
        temperature: 0.1,
        text: {
          format: {
            type: 'json_schema',
            name: 'entity_extraction',
            schema: schema
          }
        }
      });

      // Extract the structured output from the response
      const outputItem = response.output.find(item => item.type === 'message');
      if (!outputItem || !outputItem.content) {
        throw new Error('No message content in response');
      }

      const textContent = outputItem.content.find(c => c.type === 'output_text');
      if (!textContent) {
        throw new Error('No text content in response');
      }

      const result = JSON.parse(textContent.text);

      // Format the result for frontend display
      const formatted = [];
      for (const [type, names] of Object.entries(result.entities || {})) {
        const entityList = names as string[];
        if (entityList && entityList.length > 0) {
          formatted.push({
            type,
            count: entityList.length,
            examples: entityList.slice(0, 3) // Show first 3 examples
          });
        }
      }

      return { entities: result.entities, summary: formatted };
    } catch (error) {
      throw new Error(`Failed to extract entities: ${error.message}`);
    }
  }
}
