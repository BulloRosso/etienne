import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DecisionSupportService } from './decision-support.service';
import { LlmService } from '../llm/llm.service';
import { EventRouterService } from '../event-handling/core/event-router.service';
import { InterceptorsService } from '../interceptors/interceptors.service';
import { InternalEvent } from '../event-handling/interfaces/event.interface';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as officeparser from 'officeparser';

const OFFICE_EXTENSIONS = new Set([
  '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.odt', '.ods', '.odp',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const WORKSPACE_ROOT = path.join(process.cwd(), '..', 'workspace');

@Injectable()
export class OntologyLearningService implements OnModuleInit {
  private readonly logger = new Logger(OntologyLearningService.name);

  constructor(
    private readonly dss: DecisionSupportService,
    private readonly llm: LlmService,
    private readonly eventRouter: EventRouterService,
    private readonly interceptors: InterceptorsService,
  ) {}

  async onModuleInit() {
    this.eventRouter.subscribe(async (event: InternalEvent) => {
      if (event.group !== 'Filesystem') return;
      if (event.name !== 'File Created' && event.name !== 'File Modified') return;

      const filePath = event.payload?.path as string;
      const projectName = event.projectName;
      if (!filePath || !projectName) return;

      const ext = path.extname(filePath).toLowerCase();
      const isOffice = OFFICE_EXTENSIONS.has(ext);
      const isImage = IMAGE_EXTENSIONS.has(ext);
      if (!isOffice && !isImage) return;

      // Check if learning-agent skill is enabled for this project
      const skillDir = path.join(WORKSPACE_ROOT, projectName, '.claude', 'skills', 'learning-agent');
      const skillExists = await fs.pathExists(path.join(skillDir, 'SKILL.md'));
      if (!skillExists) return;

      // Launch background task — fire and forget
      const absoluteFilePath = event.payload?.absolutePath;
      if (isImage) {
        this.processImageFile(projectName, filePath, absoluteFilePath).catch(err => {
          this.logger.error(`Background image learning failed for ${filePath}: ${err.message}`);
        });
      } else {
        this.processOfficeDocument(projectName, filePath, absoluteFilePath).catch(err => {
          this.logger.error(`Background document learning failed for ${filePath}: ${err.message}`);
        });
      }
    });

    this.logger.log('OntologyLearningService subscribed to filesystem events');
  }

  /**
   * Extract text from an Office document and feed it into ontology learning.
   */
  private async processOfficeDocument(
    projectName: string,
    relativePath: string,
    absolutePath: string,
  ): Promise<void> {
    const fileName = path.basename(relativePath);
    this.logger.log(`Processing Office document for ontology learning: ${fileName} (project: ${projectName})`);

    let textContent: string;
    try {
      const filePath = absolutePath || path.join(WORKSPACE_ROOT, relativePath);
      const ast = await officeparser.parseOffice(filePath);
      textContent = typeof ast === 'string' ? ast : ast.toText();
    } catch (err: any) {
      this.logger.warn(`Could not extract text from ${fileName}: ${err.message}`);
      return;
    }

    if (!textContent || textContent.trim().length < 20) {
      this.logger.debug(`Document ${fileName} has insufficient text content, skipping`);
      return;
    }

    await this.learnFromText(projectName, fileName, textContent);
  }

  /**
   * Extract text from an image via LLM vision and feed it into ontology learning.
   */
  private async processImageFile(
    projectName: string,
    relativePath: string,
    absolutePath: string,
  ): Promise<void> {
    const fileName = path.basename(relativePath);
    this.logger.log(`Processing image for ontology learning: ${fileName} (project: ${projectName})`);

    const filePath = absolutePath || path.join(WORKSPACE_ROOT, relativePath);

    let imageBuffer: Buffer;
    try {
      imageBuffer = await fs.readFile(filePath);
    } catch (err: any) {
      this.logger.warn(`Could not read image file ${fileName}: ${err.message}`);
      return;
    }

    const ext = path.extname(fileName).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const base64Data = imageBuffer.toString('base64');

    // Use LLM vision to extract text from the image
    let extractedText: string;
    try {
      extractedText = await this.llm.generateTextWithMessages({
        tier: 'regular',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: `data:${mimeType};base64,${base64Data}`,
              },
              {
                type: 'text',
                text: 'Extract ALL text visible in this image. Return only the extracted text, preserving structure (tables, lists, headings). If there is no readable text, respond with exactly: NO_TEXT_FOUND',
              },
            ],
          },
        ],
        maxOutputTokens: 4096,
      });
    } catch (err: any) {
      this.logger.warn(`LLM vision extraction failed for ${fileName}: ${err.message}`);
      return;
    }

    if (!extractedText || extractedText.trim() === 'NO_TEXT_FOUND' || extractedText.trim().length < 20) {
      this.logger.debug(`Image ${fileName} has no meaningful text content, skipping`);
      return;
    }

    this.logger.log(`Extracted ${extractedText.length} chars of text from image ${fileName}`);
    await this.learnFromText(projectName, fileName, extractedText);
  }

  /**
   * Shared ontology learning pipeline: takes extracted text and creates entities/relationships.
   */
  private async learnFromText(
    projectName: string,
    fileName: string,
    textContent: string,
  ): Promise<void> {
    // Truncate very large documents to avoid LLM context limits
    const maxChars = 12000;
    const content = textContent.length > maxChars
      ? textContent.substring(0, maxChars) + '\n\n[...truncated...]'
      : textContent;

    const ontologyContext = await this.dss.buildOntologyContext(projectName);

    const systemPrompt = `You are an ontology learning agent. You analyze documents to extract business entities and relationships for a knowledge graph.

${ontologyContext}

## Your Task
Analyze the document below and extract:
1. New entity instances that should be added to the ontology (use existing types where possible)
2. Updates to existing entities (new properties or changed values)
3. New relationships between entities

## Rules
- Only extract concrete, factual information — no speculation
- Use existing entity types from the ontology above when they match
- If a truly new entity type is needed, include it but mark it clearly
- Generate IDs in lowercase-hyphenated format, prefixed by type: e.g., customer-acme-corp
- Skip entities that already exist in the ontology (check IDs above)
- Do NOT extract trivial or generic information

## Output Format
Return a JSON block wrapped in <ontology_update> tags:

<ontology_update>
{
  "entities": [
    { "id": "customer-acme-corp", "type": "Customer", "properties": { "name": "Acme Corp", "industry": "Manufacturing" } }
  ],
  "relationships": [
    { "subject": "customer-acme-corp", "predicate": "orderedFrom", "object": "vendor-globex" }
  ],
  "summary": "Brief description of what was learned"
}
</ontology_update>

If there is nothing meaningful to extract, return an empty update:
<ontology_update>
{ "entities": [], "relationships": [], "summary": "No new ontology-relevant information found" }
</ontology_update>`;

    const userMessage = `Document: "${fileName}"\n\nContent:\n${content}`;

    let llmResponse: string;
    try {
      llmResponse = await this.llm.generateTextWithMessages({
        tier: 'regular',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        maxOutputTokens: 2048,
      });
    } catch (err: any) {
      this.logger.error(`LLM extraction failed for ${fileName}: ${err.message}`);
      return;
    }

    const match = llmResponse.match(/<ontology_update>([\s\S]*?)<\/ontology_update>/);
    if (!match) {
      this.logger.debug(`No ontology_update block in LLM response for ${fileName}`);
      return;
    }

    let update: { entities: any[]; relationships: any[]; summary: string };
    try {
      update = JSON.parse(match[1].trim());
    } catch {
      this.logger.warn(`Failed to parse ontology_update JSON for ${fileName}`);
      return;
    }

    const entities = update.entities || [];
    const relationships = update.relationships || [];

    if (entities.length === 0 && relationships.length === 0) {
      this.logger.debug(`No ontology updates extracted from ${fileName}`);
      return;
    }

    let entitiesCreated = 0;
    let relationshipsCreated = 0;

    for (const entity of entities) {
      try {
        await this.dss.createOntologyEntity(
          projectName,
          entity.id,
          entity.type,
          entity.properties || {},
        );
        entitiesCreated++;
      } catch (err: any) {
        this.logger.warn(`Failed to create entity ${entity.id}: ${err.message}`);
      }
    }

    for (const rel of relationships) {
      try {
        await this.dss.bootstrapOntology(projectName, [], [rel]);
        relationshipsCreated++;
      } catch (err: any) {
        this.logger.warn(`Failed to create relationship: ${err.message}`);
      }
    }

    this.logger.log(
      `Ontology learning from ${fileName}: ${entitiesCreated} entities, ${relationshipsCreated} relationships created`,
    );

    if (entitiesCreated > 0 || relationshipsCreated > 0) {
      this.interceptors.addInterceptor(projectName, {
        event_type: 'knowledge-acquired',
        source: 'OntologyLearningService',
        document: fileName,
        entitiesCreated,
        relationshipsCreated,
        summary: update.summary || `Learned from ${fileName}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
