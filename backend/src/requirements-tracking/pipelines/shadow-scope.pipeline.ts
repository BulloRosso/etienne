import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { ProposalService } from '../proposal.service';
import { TtEventsService } from '../events.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { shadowResultSchema } from '../schemas/link.schema';

/**
 * Shadow-scope pipeline (spec §4 pipeline 6): over issues that are unlinked
 * and not labeled internal, P-SHADOW classifies what the untracked work is.
 * implements_existing → link proposals; undocumented_scope_candidate / unclear
 * → shadow cards in Link Review with the three-way human decision.
 * Undocumented scope is caught while it's one ticket, not at project end.
 */
@Injectable()
export class ShadowScopePipeline {
  private readonly logger = new Logger(ShadowScopePipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly proposals: ProposalService,
    private readonly events: TtEventsService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  async run(project: string): Promise<{ runId: string; proposalIds: string[] }> {
    const prompt = loadPrompt('p-shadow.v1');
    const run = await this.runs.start(project, {
      pipeline: 'shadow-scope',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const issues = await this.repository.listIssues(project);
    const links = await this.repository.listLinks(project, {});
    const openProposals = await this.repository.listProposals(project, { status: 'proposed' });
    const linkedKeys = new Set(
      links.filter((link) => link.status !== 'rejected').map((link) => link.issueKey),
    );
    const pendingKeys = new Set(
      openProposals
        .filter((proposal) => proposal.kind === 'shadow_scope' || proposal.kind === 'link')
        .map((proposal) => proposal.payload?.issue_key)
        .filter(Boolean),
    );

    const candidates = issues.filter(
      (issue) =>
        !linkedKeys.has(issue.key) &&
        !pendingKeys.has(issue.key) &&
        !issue.labels.includes('internal'),
    );

    // compact requirement index (id + one-line text)
    const requirements = await this.repository.listRequirements(project);
    const indexLines: string[] = [];
    for (const requirement of requirements) {
      if (requirement.status === 'retired') continue;
      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (current) indexLines.push(`${requirement.id}: ${current.earsText}`);
    }
    const index = indexLines.join('\n');

    const proposalIds: string[] = [];
    for (let position = 0; position < candidates.length; position++) {
      const issue = candidates[position];
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'shadow-scope',
        step: position + 1,
        total: candidates.length,
        message: issue.key,
      });

      const issueText =
        `${issue.summary}\n\n${issue.description}\n\n` +
        issue.comments.map((comment) => `[${comment.date} ${comment.author}] ${comment.body}`).join('\n');

      const outcome = await runStructured(this.llm, {
        schema: shadowResultSchema,
        systemPrompt: prompt.text,
        userMessage: `<issue key="${issue.key}" type="${issue.issueType}">\n${issueText}\n</issue>\n\n<index>\n${index}\n</index>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 4000,
      });
      if (!outcome.ok || !outcome.data) {
        this.logger.warn(`Shadow classification failed for ${issue.key}: ${outcome.error}`);
        continue;
      }
      const result = outcome.data;

      if (result.classification === 'internal_work') {
        // internal work still gets a card so a human confirms the label
        // (the cost of a false internal is silent unpaid work — spec §5.7 rule 1)
      }

      if (result.classification === 'implements_existing' && result.links.length > 0) {
        for (const link of result.links) {
          const submitted = await this.proposals.submit(project, {
            kind: 'link',
            payload: { issue_key: issue.key, ...link },
            evidence: link.issue_evidence
              ? { quote: link.issue_evidence, location: issue.key }
              : null,
            affectedRequirementIds: [link.requirement_id],
            confidence: link.confidence,
            agentRunId: run.id,
            skipQuoteCheck: true,
          });
          if ('id' in submitted) proposalIds.push(submitted.id);
        }
        continue;
      }

      const submitted = await this.proposals.submit(project, {
        kind: 'shadow_scope',
        payload: {
          issue_key: issue.key,
          classification: result.classification,
          links: result.links,
          functionality_summary: result.functionality_summary,
          origin_evidence: result.origin_evidence,
          internal_rationale: result.internal_rationale,
          assignee_question: result.assignee_question,
        },
        evidence: result.origin_evidence[0]
          ? { quote: result.origin_evidence[0].quote, location: result.origin_evidence[0].location }
          : null,
        affectedRequirementIds: result.links.map((link) => link.requirement_id),
        confidence: result.confidence,
        agentRunId: run.id,
        promptVersion: prompt.version,
        skipQuoteCheck: true,
      });
      if ('id' in submitted) proposalIds.push(submitted.id);
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'shadow-scope',
      proposals: proposalIds.length,
    });
    return { runId: run.id, proposalIds };
  }
}
