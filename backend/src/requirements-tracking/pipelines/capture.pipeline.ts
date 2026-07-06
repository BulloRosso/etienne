import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { LlmService } from '../../llm/llm.service';
import { tryParseLlmJson } from '../../mcpserver/document-analysis-tools';
import { CaptureService } from '../capture/capture.service';
import { ProposalService } from '../proposal.service';
import { SearchProjectionService } from '../search-projection.service';
import { TtRepository } from '../graph/tt-repository';
import { TtFilesService } from '../store/files.service';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt, renderPrompt } from './prompt-loader';
import { Capture } from '../types/tendertrace-types';

/**
 * Conversational capture pipeline (P-CAPTURE, spec §4 pipeline 9): the one
 * interactive run. Implemented as an LlmService.runWithTools loop whose
 * ask_user tool suspends on the CaptureService promise until the user answers
 * through the REST endpoint (or the 15-min timeout skips). Everything it
 * produces still lands as proposals through the standard write path — the
 * conversation buys better classification, not write access.
 */
@Injectable()
export class CapturePipeline {
  private readonly logger = new Logger(CapturePipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly captures: CaptureService,
    private readonly proposals: ProposalService,
    private readonly projections: SearchProjectionService,
    private readonly repository: TtRepository,
    private readonly files: TtFilesService,
    private readonly runs: RunRegistryService,
  ) {}

  async run(project: string, capture: Capture, user: string): Promise<void> {
    const prompt = loadPrompt('p-capture.v1');
    const run = await this.runs.start(project, {
      pipeline: 'capture',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const pastedText = await this.files.readText(
      project,
      `artifacts/pasted-${capture.id}.md`,
    );
    const submittedIds: string[] = [];
    let askUsed = false;

    const tools = {
      search_requirements: tool({
        description:
          'Hybrid search over the current requirement set (baseline + current versions).',
        inputSchema: z.object({ query: z.string(), topK: z.number().optional() }),
        execute: async (input) => {
          const hits = await this.projections.searchRequirements(
            project,
            input.query,
            input.topK ?? 8,
          );
          return hits.map((hit) => ({ id: hit.refId, text: hit.content.slice(0, 400) }));
        },
      }),
      get_requirement: tool({
        description: 'Read one requirement with its current version.',
        inputSchema: z.object({ reqId: z.string() }),
        execute: async (input) => {
          const versions = await this.repository.getVersions(project, input.reqId);
          const current = versions[versions.length - 1];
          if (!current) return { error: `Unknown requirement ${input.reqId}` };
          return {
            id: input.reqId,
            versionNo: current.versionNo,
            ears_text: current.earsText,
            modality: current.modality,
            category: current.category,
            quantities: current.quantities,
            tender_quote: current.sourceRef?.quote,
          };
        },
      }),
      ask_user: tool({
        description:
          'Present up to 3 short clarifying questions to the user (options where possible). ' +
          'Ask AT MOST ONCE per capture; batch all questions into one call.',
        inputSchema: z.object({
          questions: z
            .array(
              z.object({
                question: z.string(),
                options: z.array(z.string()).optional(),
              }),
            )
            .max(3),
        }),
        execute: async (input) => {
          if (askUsed) {
            return { error: 'ask_user may only be called once per capture session.' };
          }
          askUsed = true;
          const answered = await this.captures.askQuestions(project, capture.id, input.questions);
          return {
            answers: answered.map((question) => ({
              question: question.question,
              answer: question.skipped ? null : (question.answer ?? null),
              skipped: question.skipped ?? false,
            })),
          };
        },
      }),
      submit_proposal: tool({
        description:
          'Submit one proposal (standard drift schema §5.2-A plus PROGRESS_UPDATE / ' +
          'ACCEPTANCE_SIGNAL). evidence.quote must be verbatim from the paste; user ' +
          'answers are attestations stored separately, never merged into quotes.',
        inputSchema: z.object({
          classification: z.enum([
            'CONFIRMATION',
            'MODIFICATION',
            'NEW_REQUIREMENT',
            'RELAXATION_OR_REMOVAL',
            'CONFLICT',
            'CLARIFICATION_NEEDED',
            'PROGRESS_UPDATE',
            'ACCEPTANCE_SIGNAL',
          ]),
          decision_status: z.enum(['requested', 'decided']).nullable(),
          affected_requirement_ids: z.array(z.string()),
          evidence: z.object({
            quote: z.string(),
            location: z.string().nullable(),
            speaker_or_author: z.string().nullable(),
            date: z.string().nullable(),
          }),
          diff: z
            .object({
              before_ears_text: z.string(),
              after_ears_text: z.string(),
              changed_fields: z.array(
                z.object({ field: z.string(), before: z.string(), after: z.string() }),
              ),
            })
            .nullable(),
          new_requirement: z.any().nullable(),
          conflict: z.any().nullable(),
          scope_assessment: z.enum(['likely_in_scope', 'likely_change', 'unclear']).nullable(),
          scope_rationale: z.string().nullable(),
          clarification_question_draft: z.string().nullable(),
          confidence: z.number(),
        }),
        execute: async (input) => {
          const kind =
            input.classification === 'PROGRESS_UPDATE'
              ? 'progress_update'
              : input.classification === 'ACCEPTANCE_SIGNAL'
                ? 'acceptance_signal'
                : 'drift';
          try {
            const result = await this.proposals.submit(project, {
              kind,
              payload: {
                diff: input.diff,
                new_requirement: input.new_requirement,
                conflict: input.conflict,
                clarification_question_draft: input.clarification_question_draft,
                captureId: capture.id,
              },
              evidence: {
                quote: input.evidence.quote,
                location: input.evidence.location ?? undefined,
                speaker_or_author: input.evidence.speaker_or_author,
                date: input.evidence.date,
              },
              affectedRequirementIds: input.affected_requirement_ids,
              classification: input.classification as any,
              decisionStatus: input.decision_status,
              scopeAssessment: input.scope_assessment ?? undefined,
              scopeRationale: input.scope_rationale ?? undefined,
              confidence: input.confidence,
              agentRunId: run.id,
              sourceArtifactId: capture.artifactId,
              sourceText: pastedText,
            });
            if ('attachedTo' in result) {
              return { success: true, attachedTo: result.attachedTo };
            }
            submittedIds.push(result.id);
            return { success: true, proposalId: result.id };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
    };

    const systemPrompt = renderPrompt(prompt, {
      user,
      now: new Date().toISOString(),
      tender_id: project,
    });

    try {
      const result = await this.llm.runWithTools({
        tier: 'regular',
        system: systemPrompt,
        messages: [{ role: 'user', content: `<paste>\n${pastedText}\n</paste>` }],
        tools,
        maxSteps: 16,
        maxOutputTokens: 8000,
      });
      const summary = tryParseLlmJson(result.text) ?? { raw: result.text?.slice(0, 500) };
      await this.captures.finalize(project, capture.id, submittedIds, summary);
      await this.runs.finish(project, run, 'ok', { proposalIds: submittedIds });
    } catch (error: any) {
      this.logger.error(`Capture ${capture.id} failed: ${error.message}`);
      await this.captures.finalize(project, capture.id, submittedIds, { error: error.message }, true);
      await this.runs.finish(project, run, 'failed');
    }
  }
}
