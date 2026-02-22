import { Injectable, Logger } from '@nestjs/common';
import { DssQueryAdapterService } from './dss-query-adapter.service';
import { EntityContext } from './interfaces/bus-messages';

@Injectable()
export class ContextInjectorService {
  private readonly logger = new Logger(ContextInjectorService.name);

  constructor(private readonly dssAdapter: DssQueryAdapterService) {}

  /**
   * Fetch entity context from the knowledge graph
   */
  async getEntityContext(
    project: string,
    entityId: string,
    correlationId?: string,
  ): Promise<EntityContext | null> {
    return this.dssAdapter.queryEntityContext(project, entityId, correlationId);
  }

  /**
   * Format entity context as markdown for LLM prompt injection
   */
  formatForPrompt(
    context: EntityContext,
    options?: { includeRelationships?: boolean },
  ): string {
    const includeRels = options?.includeRelationships !== false;
    const lines: string[] = [];

    lines.push(`## Entity Context: ${context.entityId}`);
    lines.push(`Type: ${context.entityType}`);

    const props = Object.entries(context.properties)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (props) {
      lines.push(`Properties: ${props}`);
    }

    if (includeRels && context.relationships.length > 0) {
      lines.push('Relationships:');
      for (const rel of context.relationships) {
        const arrow = rel.direction === 'outgoing' ? '→' : '←';
        lines.push(`  - ${rel.predicate} ${arrow} ${rel.target}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Full pipeline: fetch entity context + format + inject into base prompt
   */
  async injectContext(
    project: string,
    entityId: string,
    basePrompt: string,
    correlationId?: string,
  ): Promise<string> {
    const context = await this.getEntityContext(project, entityId, correlationId);
    if (!context) {
      this.logger.debug(`No context found for entity ${entityId}, returning base prompt`);
      return basePrompt;
    }

    const contextBlock = this.formatForPrompt(context);
    return `${contextBlock}\n\n---\n\n${basePrompt}`;
  }
}
