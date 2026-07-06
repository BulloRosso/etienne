import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { IngestionService } from '../ingestion.service';
import { ProposalService } from '../proposal.service';
import { SearchProjectionService } from '../search-projection.service';
import { TtEventsService } from '../events.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt, renderPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { validateQuote } from './quote-validator';
import {
  conflictCheckSchema,
  driftAnalysisSchema,
  driftScreeningSchema,
  DriftAnalysis,
} from '../schemas/drift.schema';
import { RequirementVersion } from '../types/tendertrace-types';

/**
 * Drift pipeline (spec §4 pipeline 2): inbound artifact →
 *   Stage 1 screening (P-DRIFT-S, small tier, compact requirement index) →
 *   Stage 2 analysis (P-DRIFT-A, regular tier, full candidate versions) →
 *   conflict cross-check (P-DRIFT-C) for MODIFICATION / NEW_REQUIREMENT →
 * proposals land in the Drift Inbox. Cross-artifact dedup happens inside
 * ProposalService.submit (ProposalDedupService hook).
 *
 * Runs pre-baseline too (spec §12.4): Q&A answers and Nachsendungen amend
 * requirements before freeze; decision role gating is the UI's concern.
 */
@Injectable()
export class DriftPipeline {
  private readonly logger = new Logger(DriftPipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly ingestion: IngestionService,
    private readonly proposals: ProposalService,
    private readonly projections: SearchProjectionService,
    private readonly events: TtEventsService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  async run(project: string, artifactId: string): Promise<{ runId: string; proposalIds: string[] }> {
    const artifact = await this.repository.getDocument(project, artifactId);
    if (!artifact) throw new Error(`Unknown artifact ${artifactId}`);

    const artifactText = await this.loadArtifactText(project, artifactId);
    const screeningPrompt = loadPrompt('p-drift-s.v1');
    const analysisPrompt = loadPrompt('p-drift-a.v1');

    const run = await this.runs.start(project, {
      pipeline: 'drift',
      promptVersion: `${screeningPrompt.version}+${analysisPrompt.version}`,
      promptHash: analysisPrompt.hash,
      model: this.llm.getModelId('regular'),
    });

    // ── Stage 1: screening on the small tier with a compact index ──────────
    const index = await this.compactRequirementIndex(project);
    const screening = await runStructured(this.llm, {
      schema: driftScreeningSchema,
      systemPrompt: screeningPrompt.text,
      userMessage:
        `<artifact type="${artifact.artifactType ?? 'unknown'}" date="${artifact.artifactDate ?? ''}">\n` +
        `${artifactText}\n</artifact>\n\n<baseline_index>\n${index}\n</baseline_index>`,
      tier: 'small',
      temperature: 0,
      maxOutputTokens: 8000,
    });

    if (!screening.ok || !screening.data) {
      await this.runs.finish(project, run, 'failed');
      throw new Error(`Drift screening failed: ${screening.error}`);
    }

    await this.events.emit(project, 'pipeline.progress', {
      runId: run.id,
      pipeline: 'drift',
      artifactId,
      step: 1,
      total: 1 + screening.data.candidates.length,
      message: `${screening.data.candidates.length} candidate statements`,
    });

    // ── Stage 2: per-candidate analysis on the strong tier ─────────────────
    const proposalIds: string[] = [];
    for (let index2 = 0; index2 < screening.data.candidates.length; index2++) {
      const candidate = screening.data.candidates[index2];
      const analysis = await this.analyzeCandidate(
        project,
        analysisPrompt,
        artifact.artifactType ?? 'artifact',
        artifact.artifactDate ?? '',
        artifact.artifactParties ?? '',
        artifactText,
        candidate,
      );
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'drift',
        artifactId,
        step: 2 + index2,
        total: 1 + screening.data.candidates.length,
        message: analysis ? analysis.classification : 'analysis failed',
      });
      if (!analysis || analysis.classification === 'NO_IMPACT') continue;

      // conflict cross-check for scope-changing classifications
      let conflictChecks: any[] = [];
      if (
        analysis.classification === 'MODIFICATION' ||
        analysis.classification === 'NEW_REQUIREMENT'
      ) {
        conflictChecks = await this.crossCheck(project, analysis);
      }

      try {
        const submitted = await this.proposals.submit(project, {
          kind: 'drift',
          payload: {
            diff: analysis.diff,
            new_requirement: analysis.new_requirement,
            conflict: analysis.conflict,
            conflict_checks: conflictChecks,
            clarification_question_draft: analysis.clarification_question_draft,
            location_hint: candidate.location_hint,
          },
          evidence: {
            quote: analysis.evidence.quote,
            location: analysis.evidence.location ?? candidate.location_hint,
            speaker_or_author: analysis.evidence.speaker_or_author,
            date: analysis.evidence.date ?? artifact.artifactDate,
          },
          affectedRequirementIds: analysis.affected_requirement_ids,
          classification: analysis.classification,
          decisionStatus: analysis.decision_status,
          scopeAssessment: analysis.scope_assessment ?? undefined,
          scopeRationale: analysis.scope_rationale ?? undefined,
          confidence: analysis.confidence,
          agentRunId: run.id,
          promptVersion: analysisPrompt.version,
          sourceArtifactId: artifactId,
          sourceText: artifactText,
        });
        if ('id' in submitted) proposalIds.push(submitted.id);
      } catch (error: any) {
        this.logger.warn(`Drift proposal rejected server-side: ${error.message}`);
      }
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'drift',
      artifactId,
      proposals: proposalIds.length,
    });
    return { runId: run.id, proposalIds };
  }

  // ---------------------------------------------------------------------------

  private async loadArtifactText(project: string, artifactId: string): Promise<string> {
    const document = await this.repository.getDocument(project, artifactId);
    if (!document) throw new Error(`Unknown artifact ${artifactId}`);
    if (document.parseStatus !== 'parsed' || !document.parsedPath) {
      const parsed = await this.ingestion.parseDocument(project, artifactId);
      if (parsed.parseStatus !== 'parsed') {
        throw new Error(`Artifact ${artifactId} could not be parsed (${parsed.parseStatus})`);
      }
    }
    return (await this.ingestion.getSections(project, artifactId))
      .map((section) => section.text)
      .join('\n\n');
  }

  private async compactRequirementIndex(project: string): Promise<string> {
    const requirements = await this.repository.listRequirements(project);
    const lines: string[] = [];
    for (const requirement of requirements) {
      if (requirement.status === 'retired') continue;
      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (current) lines.push(`${requirement.id}: ${current.earsText}`);
    }
    return lines.join('\n');
  }

  private async analyzeCandidate(
    project: string,
    analysisPrompt: ReturnType<typeof loadPrompt>,
    artifactType: string,
    artifactDate: string,
    artifactParties: string,
    artifactText: string,
    candidate: {
      statement_quote: string;
      location_hint: string;
      speaker_or_author: string | null;
      candidate_requirement_ids: string[];
    },
  ): Promise<DriftAnalysis | null> {
    const candidateVersions: RequirementVersion[] = [];
    for (const reqId of candidate.candidate_requirement_ids) {
      const versions = await this.repository.getVersions(project, reqId);
      const current = versions[versions.length - 1];
      if (current) candidateVersions.push(current);
    }

    const requirementsBlock = candidateVersions
      .map(
        (version) =>
          `<requirement id="${version.requirementId}" version="${version.versionNo}" ` +
          `modality="${version.modality}" category="${version.category}">\n` +
          `${version.earsText}\n` +
          `ears_fields: ${JSON.stringify(version.earsFields)}\n` +
          `quantities: ${JSON.stringify(version.quantities)}\n` +
          `tender_quote: ${version.sourceRef?.quote ?? ''}\n</requirement>`,
      )
      .join('\n');

    const systemPrompt = renderPrompt(analysisPrompt, {
      artifact_date: artifactDate,
      artifact_parties: artifactParties,
    });
    const outcome = await runStructured(this.llm, {
      schema: driftAnalysisSchema,
      systemPrompt,
      userMessage:
        `<artifact type="${artifactType}" date="${artifactDate}" parties="${artifactParties}">\n` +
        `${artifactText}\n</artifact>\n\n` +
        `<candidate location="${candidate.location_hint}" speaker="${candidate.speaker_or_author ?? ''}">\n` +
        `${candidate.statement_quote}\n</candidate>\n\n` +
        `<requirements>\n${requirementsBlock}\n</requirements>`,
      tier: 'regular',
      temperature: 0,
      maxOutputTokens: 8000,
      postValidators: [
        (analysis: DriftAnalysis) => {
          if (analysis.classification === 'NO_IMPACT') return null;
          const check = validateQuote(artifactText, analysis.evidence.quote);
          return check.valid
            ? null
            : 'evidence.quote must be copied character-for-character from the artifact text.';
        },
      ],
    });
    if (!outcome.ok || !outcome.data) {
      this.logger.warn(`Drift analysis failed for candidate: ${outcome.error}`);
      return null;
    }
    return outcome.data;
  }

  /** P-DRIFT-C against the nearest-neighbour requirements (same category + embedding sim). */
  private async crossCheck(project: string, analysis: DriftAnalysis): Promise<any[]> {
    const afterText =
      analysis.diff?.after_ears_text ?? analysis.new_requirement?.ears_text ?? '';
    if (!afterText) return [];

    const neighbours = await this.projections.searchRequirements(project, afterText, 20);
    const excluded = new Set(analysis.affected_requirement_ids);
    const neighbourVersions: RequirementVersion[] = [];
    for (const hit of neighbours) {
      if (excluded.has(hit.refId)) continue;
      const versions = await this.repository.getVersions(project, hit.refId);
      const current = versions[versions.length - 1];
      if (current) neighbourVersions.push(current);
      if (neighbourVersions.length >= 20) break;
    }
    if (neighbourVersions.length === 0) return [];

    const prompt = loadPrompt('p-drift-c.v1');
    const outcome = await runStructured(this.llm, {
      schema: conflictCheckSchema,
      systemPrompt: prompt.text,
      userMessage:
        `<proposed_after_state>\n${afterText}\n</proposed_after_state>\n\n<related_requirements>\n` +
        neighbourVersions
          .map(
            (version) =>
              `<requirement id="${version.requirementId}" modality="${version.modality}">${version.earsText}</requirement>`,
          )
          .join('\n') +
        '\n</related_requirements>',
      tier: 'regular',
      temperature: 0,
      maxOutputTokens: 4000,
    });
    if (!outcome.ok || !outcome.data) return [];
    return outcome.data.checks.filter((check) => check.verdict === 'potential_conflict');
  }
}
