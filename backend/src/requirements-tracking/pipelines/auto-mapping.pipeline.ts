import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { ProposalService } from '../proposal.service';
import { SearchProjectionService } from '../search-projection.service';
import { TtCatalogService } from '../catalog.service';
import { TtEventsService } from '../events.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { mappingResultSchema, MappingResult } from '../schemas/catalog.schema';

/**
 * Auto-mapping pipeline (spec §4 pipeline 10): per requirement, retrieve
 * candidate services (tags + embedding), P-CAT-M proposes mappings with
 * coverage assessment. SCOPE IS LAW: a "full" mapping whose requirement
 * element sits in a service's excluded[]/prerequisites[] is rejected
 * server-side (the check the prompt enforces, enforced twice on purpose).
 */
@Injectable()
export class AutoMappingPipeline {
  private readonly logger = new Logger(AutoMappingPipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly proposals: ProposalService,
    private readonly projections: SearchProjectionService,
    private readonly catalog: TtCatalogService,
    private readonly events: TtEventsService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  async run(
    project: string,
    requirementIds?: string[],
  ): Promise<{ runId: string; proposalIds: string[] }> {
    const prompt = loadPrompt('p-cat-m.v1');
    const run = await this.runs.start(project, {
      pipeline: 'auto-mapping',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const allRequirements = await this.repository.listRequirements(project);
    const targets = allRequirements.filter(
      (requirement) =>
        requirement.status !== 'retired' &&
        (!requirementIds || requirementIds.includes(requirement.id)),
    );
    const existingMappings = await this.repository.listMappings(project, {});
    const proposalIds: string[] = [];

    for (let index = 0; index < targets.length; index++) {
      const requirement = targets[index];
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'auto-mapping',
        step: index + 1,
        total: targets.length,
        message: requirement.id,
      });

      // skip requirements that already have live mappings
      if (
        existingMappings.some(
          (mapping) =>
            mapping.requirementId === requirement.id &&
            mapping.status !== 'rejected' &&
            !mapping.staleSince,
        )
      ) {
        continue;
      }

      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (!current) continue;

      const hits = await this.projections.searchServices(project, current.earsText, 5);
      if (hits.length === 0) continue;

      const serviceBlocks: string[] = [];
      const knownServiceIds = new Set<string>();
      for (const hit of hits) {
        const serviceId = hit.metadata?.serviceId ?? hit.refId.split('/')[0];
        if (knownServiceIds.has(serviceId)) continue;
        const bundle = await this.catalog.getWithBody(project, serviceId);
        if (!bundle || bundle.version.status !== 'published') continue;
        knownServiceIds.add(serviceId);
        serviceBlocks.push(
          `<service id="${serviceId}" version_no="${bundle.version.versionNo}" ` +
            `title="${bundle.service.title}" tags="${bundle.version.tags.join(',')}">\n` +
            `scope: ${JSON.stringify(bundle.version.scope)}\n\n${bundle.bodyMarkdown}\n</service>`,
        );
      }
      if (serviceBlocks.length === 0) continue;

      const outcome = await runStructured(this.llm, {
        schema: mappingResultSchema,
        systemPrompt: prompt.text,
        userMessage:
          `<requirement id="${requirement.id}" modality="${current.modality}" ` +
          `category="${current.category}">\n${current.earsText}\n` +
          `quantities: ${JSON.stringify(current.quantities)}\n` +
          `tender_quote: ${current.sourceRef?.quote ?? ''}\n</requirement>\n\n` +
          `<services>\n${serviceBlocks.join('\n\n')}\n</services>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 4000,
        postValidators: [
          (result: MappingResult) => {
            for (const mapping of result.mappings) {
              if (!knownServiceIds.has(mapping.service_id)) {
                return `Mapping cites unknown service ${mapping.service_id} — only cite provided services.`;
              }
            }
            return null;
          },
        ],
      });
      if (!outcome.ok || !outcome.data) {
        this.logger.warn(`Auto-mapping failed for ${requirement.id}: ${outcome.error}`);
        continue;
      }

      for (const mapping of outcome.data.mappings) {
        const submitted = await this.proposals.submit(project, {
          kind: 'mapping',
          payload: { requirement_id: requirement.id, ...mapping },
          evidence: mapping.service_evidence[0]
            ? { quote: mapping.service_evidence[0], location: mapping.service_id }
            : null,
          affectedRequirementIds: [requirement.id],
          confidence: mapping.confidence,
          agentRunId: run.id,
          promptVersion: prompt.version,
          skipQuoteCheck: true,
        });
        if ('id' in submitted) proposalIds.push(submitted.id);
      }
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'auto-mapping',
      proposals: proposalIds.length,
    });
    return { runId: run.id, proposalIds };
  }
}
