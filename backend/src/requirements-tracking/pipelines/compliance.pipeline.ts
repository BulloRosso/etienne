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
import { complianceVerdictSchema, ComplianceVerdictResult } from '../schemas/catalog.schema';
import { ServiceVersion } from '../types/tendertrace-types';

/**
 * Compliance classification pipeline (P-RESP-C, spec §4 pipeline 3): per
 * requirement, grounded on APPROVED mappings first, catalog-wide retrieval
 * second. Server-side checks mirror the prompt's grounding rules — cited
 * service ids must exist, and SCOPE EXCLUSIONS OVERRIDE BODY TEXT: a FULL
 * verdict citing a service whose excluded[]/prerequisites[] hits the
 * requirement is rejected (enforced twice on purpose; a false FULL is the one
 * failure the product must never ship, spec §4 chain notes).
 */
@Injectable()
export class CompliancePipeline {
  private readonly logger = new Logger(CompliancePipeline.name);

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
    const prompt = loadPrompt('p-resp-c.v1');
    const run = await this.runs.start(project, {
      pipeline: 'compliance',
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
    const proposalIds: string[] = [];

    for (let index = 0; index < targets.length; index++) {
      const requirement = targets[index];
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'compliance',
        step: index + 1,
        total: targets.length,
        message: requirement.id,
      });

      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (!current) continue;

      // approved mappings FIRST, then catalog-wide retrieval
      const mappings = await this.repository.listMappings(project, {
        requirementId: requirement.id,
      });
      const approvedMappings = mappings.filter((mapping) => mapping.status === 'approved');
      const serviceBlocks: string[] = [];
      const scopeByService = new Map<string, ServiceVersion>();

      for (const mapping of approvedMappings) {
        const [serviceId, , versionNoRaw] = mapping.serviceVersionId.split('/');
        const bundle = await this.catalog.getWithBody(
          project,
          serviceId,
          parseInt(versionNoRaw, 10),
        );
        if (!bundle) continue;
        scopeByService.set(serviceId, bundle.version);
        serviceBlocks.push(
          `<service id="${serviceId}" version_no="${bundle.version.versionNo}" mapped="true" ` +
            `coverage="${mapping.coverage}" mapping_rationale="${mapping.rationale ?? ''}" ` +
            `kind="${bundle.service.kind}" title="${bundle.service.title}" ` +
            `tags="${bundle.version.tags.join(',')}">\n` +
            `scope: ${JSON.stringify(bundle.version.scope)}\n\n${bundle.bodyMarkdown}\n</service>`,
        );
      }

      const hits = await this.projections.searchServices(project, current.earsText, 4);
      for (const hit of hits) {
        const serviceId = hit.metadata?.serviceId ?? hit.refId.split('/')[0];
        if (scopeByService.has(serviceId)) continue;
        const bundle = await this.catalog.getWithBody(project, serviceId);
        if (!bundle || bundle.version.status !== 'published') continue;
        scopeByService.set(serviceId, bundle.version);
        serviceBlocks.push(
          `<service id="${serviceId}" version_no="${bundle.version.versionNo}" mapped="false" ` +
            `kind="${bundle.service.kind}" title="${bundle.service.title}" ` +
            `tags="${bundle.version.tags.join(',')}">\n` +
            `scope: ${JSON.stringify(bundle.version.scope)}\n\n${bundle.bodyMarkdown}\n</service>`,
        );
      }

      const outcome = await runStructured(this.llm, {
        schema: complianceVerdictSchema,
        systemPrompt: prompt.text,
        userMessage:
          `<requirement id="${requirement.id}" modality="${current.modality}" ` +
          `category="${current.category}">\n${current.earsText}\n` +
          `quantities: ${JSON.stringify(current.quantities)}\n` +
          `tender_quote: ${current.sourceRef?.quote ?? ''}\n</requirement>\n\n` +
          `<services>\n${serviceBlocks.join('\n\n') || '(no catalog evidence found)'}\n</services>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 4000,
        postValidators: [
          (result: ComplianceVerdictResult) =>
            this.serverChecks(result, current.modality, scopeByService),
        ],
      });
      if (!outcome.ok || !outcome.data) {
        this.logger.warn(`Compliance failed for ${requirement.id}: ${outcome.error}`);
        continue;
      }

      const submitted = await this.proposals.submit(project, {
        kind: 'compliance',
        payload: { ...outcome.data, requirement_id: requirement.id },
        evidence: null,
        affectedRequirementIds: [requirement.id],
        confidence: outcome.data.confidence,
        agentRunId: run.id,
        promptVersion: prompt.version,
        skipQuoteCheck: true,
      });
      if ('id' in submitted) proposalIds.push(submitted.id);
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'compliance',
      proposals: proposalIds.length,
    });
    return { runId: run.id, proposalIds };
  }

  /** Deterministic grounding checks (spec §4 compliance chain, enforced twice). */
  private serverChecks(
    result: ComplianceVerdictResult,
    modality: string,
    scopeByService: Map<string, ServiceVersion>,
  ): string | null {
    if (result.verdict === 'FULL' || result.verdict === 'PARTIAL') {
      if (result.evidence_refs.length === 0) {
        return `${result.verdict} verdict without cited service evidence — cite service ids or return NEEDS_INPUT.`;
      }
      for (const ref of result.evidence_refs) {
        if (!scopeByService.has(ref.service_id)) {
          return `Cited service ${ref.service_id} was not provided — only cite services from the input.`;
        }
      }
    }
    if (result.verdict === 'FULL') {
      // scope-exclusion override: any exclusion/prerequisite text overlapping the
      // requirement forbids FULL. Heuristic: exclusion terms present in justification
      // or evidence — conservative overlap on significant words.
      for (const ref of result.evidence_refs) {
        const version = scopeByService.get(ref.service_id);
        if (!version) continue;
        for (const excluded of [...version.scope.excluded, ...version.scope.prerequisites]) {
          const significant = excluded
            .toLowerCase()
            .split(/[^a-zäöüß0-9-]+/i)
            .filter((word) => word.length > 4);
          const target = result.justification.toLowerCase();
          if (significant.length > 0 && significant.every((word) => target.includes(word))) {
            return (
              `FULL verdict conflicts with a scope exclusion of ${ref.service_id} ` +
              `("${excluded}") — scope exclusions override body text; use PARTIAL with the exclusion quoted.`
            );
          }
        }
      }
    }
    if (result.verdict === 'PARTIAL' && modality === 'mandatory' && !result.risk_note) {
      return 'PARTIAL verdict on a mandatory (MUSS) requirement needs a risk_note (award risk).';
    }
    return null;
  }
}
