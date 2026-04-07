import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { LlmService } from '../../llm/llm.service';

@Injectable()
export class OpenAiService {
  private readonly workspaceDir = path.join(process.cwd(), '..', 'workspace');
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private readonly llm: LlmService) {
    this.logger.log('OpenAiService initialized (using LlmService for LLM calls)');
  }

  /**
   * Check if the underlying LLM service has an API key configured
   */
  async checkAvailability(): Promise<boolean> {
    return this.llm.hasApiKey();
  }

  async translateToSparql(query: string, project?: string): Promise<string> {
    let schemaContext = '';

    // Load project-specific schema if project is provided
    if (project) {
      try {
        const schemaPath = path.join(this.workspaceDir, project, 'knowledge-graph', 'entity-schema.ttl');
        await fs.access(schemaPath);
        schemaContext = await fs.readFile(schemaPath, 'utf-8');
      } catch (error) {
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

    const result = await this.llm.generateTextWithMessages({
      tier: 'small',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      maxOutputTokens: 1024,
    });

    // Clean up the query - remove markdown code blocks if present
    return result.replace(/```sparql\n?/g, '').replace(/```\n?/g, '').trim();
  }

  async expandSearchContext(query: string): Promise<string[]> {
    const result = await this.llm.generateTextWithMessages({
      tier: 'small',
      messages: [
        {
          role: 'system',
          content: 'Generate 3-5 related search terms and synonyms for the given query. Return as comma-separated list.',
        },
        { role: 'user', content: query },
      ],
      maxOutputTokens: 256,
    });

    const terms = result.trim().split(',');
    return terms.map(term => term.trim());
  }

  async extractEntitiesFromMarkdown(project: string, content: string): Promise<any> {
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
      schemaDescription = '';
    }

    // Try to load custom extraction prompt, fallback to default
    try {
      await fs.access(promptPath);
      instructions = await fs.readFile(promptPath, 'utf-8');
      instructions = instructions.replace('[INPUT_TEXT_PLACEHOLDER]', '');

      if (schemaDescription) {
        instructions = `# Entity Schema\n\n${schemaDescription}\n\n# Extraction Instructions\n\n${instructions}`;
      }
    } catch (error) {
      instructions = 'You are an entity extraction AI. Extract entities from the given markdown text and categorize them into Person (people names), Company (company/organization names), and Product (product/invention names). Only include entities that are clearly mentioned in the text.';
    }

    const systemPrompt = `${instructions}

You MUST respond with valid JSON only, no markdown formatting, no explanation. Use this exact structure:
{
  "entities": {
    "Person": ["name1", "name2"],
    "Company": ["company1"],
    "Product": ["product1"],
    "Employee": ["employee1"],
    "Technology": ["tech1"]
  }
}

All five keys (Person, Company, Product, Employee, Technology) must be present. Use empty arrays for categories with no matches.`;

    const result = await this.llm.generateTextWithMessages({
      tier: 'small',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: content },
      ],
      maxOutputTokens: 2048,
    });

    // Parse the JSON response, stripping any markdown code blocks
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Format the result for frontend display
    const formatted = [];
    for (const [type, names] of Object.entries(parsed.entities || {})) {
      const entityList = names as string[];
      if (entityList && entityList.length > 0) {
        formatted.push({
          type,
          count: entityList.length,
          examples: entityList.slice(0, 3),
        });
      }
    }

    return { entities: parsed.entities, summary: formatted };
  }
}
