import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { ProposalService } from '../proposal.service';
import { SearchProjectionService } from '../search-projection.service';
import { TtEventsService } from '../events.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { linkResultSchema } from '../schemas/link.schema';
import { RequirementVersion, TrackerIssue } from '../types/tendertrace-types';

/**
 * Linking pipeline (spec §4 pipeline 5): per issue, retrieve candidate
 * requirements (embedding + key/label heuristics), then P-LINK proposes typed
 * links for the Link Review queue.
 *
 * Deterministic pre-pass: an issue whose labels or text carry an explicit
 * REQ-### id short-circuits to a high-confidence proposal without an LLM call.
 */
@Injectable()
export class LinkingPipeline {
  private readonly logger = new Logger(LinkingPipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly proposals: ProposalService,
    private readonly projections: SearchProjectionService,
    private readonly events: TtEventsService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  async run(project: string, issueKeys?: string[]): Promise<{ runId: string; proposalIds: string[] }> {
    const prompt = loadPrompt('p-link.v1');
    const run = await this.runs.start(project, {
      pipeline: 'linking',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const allIssues = await this.repository.listIssues(project);
    const issues = issueKeys
      ? allIssues.filter((issue) => issueKeys.includes(issue.key))
      : allIssues;
    const existingLinks = await this.repository.listLinks(project, {});
    const proposalIds: string[] = [];

    for (let index = 0; index < issues.length; index++) {
      const issue = issues[index];
      await this.events.emit(project, 'pipeline.progress', {
        runId: run.id,
        pipeline: 'linking',
        step: index + 1,
        total: issues.length,
        message: issue.key,
      });

      // skip issues that already have links (proposed or approved)
      if (existingLinks.some((link) => link.issueKey === issue.key && link.status !== 'rejected')) {
        continue;
      }

      // deterministic pre-pass: explicit REQ-### references
      const explicit = this.explicitRequirementIds(issue);
      if (explicit.length > 0) {
        for (const reqId of explicit) {
          const requirement = await this.repository.getRequirement(project, reqId);
          if (!requirement) continue;
          const submitted = await this.proposals.submit(project, {
            kind: 'link',
            payload: {
              issue_key: issue.key,
              requirement_id: reqId,
              relationship: 'implements',
              matches_current: true,
              rationale: `Issue explicitly references ${reqId} (label/text) — deterministic pre-pass, no LLM.`,
              issue_evidence: reqId,
            },
            evidence: null,
            affectedRequirementIds: [reqId],
            confidence: 0.99,
            agentRunId: run.id,
            skipQuoteCheck: true,
          });
          if ('id' in submitted) proposalIds.push(submitted.id);
        }
        continue;
      }

      // retrieval + P-LINK
      const candidates = await this.candidateRequirements(project, issue);
      if (candidates.length === 0) continue;

      const outcome = await runStructured(this.llm, {
        schema: linkResultSchema,
        systemPrompt: prompt.text,
        userMessage:
          `<issue key="${issue.key}" type="${issue.issueType}" epic="${issue.epicKey ?? ''}" ` +
          `labels="${issue.labels.join(',')}">\n${issue.summary}\n\n${issue.description}\n</issue>\n\n` +
          `<requirements>\n` +
          candidates
            .map(
              (version) =>
                `<requirement id="${version.requirementId}" version="${version.versionNo}" ` +
                `category="${version.category}">${version.earsText}</requirement>`,
            )
            .join('\n') +
          `\n</requirements>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 4000,
      });
      if (!outcome.ok || !outcome.data) {
        this.logger.warn(`Linking failed for ${issue.key}: ${outcome.error}`);
        continue;
      }

      for (const link of outcome.data.links) {
        const submitted = await this.proposals.submit(project, {
          kind: 'link',
          payload: { issue_key: issue.key, ...link },
          evidence: link.issue_evidence
            ? { quote: link.issue_evidence, location: issue.key }
            : null,
          affectedRequirementIds: [link.requirement_id],
          confidence: link.confidence,
          agentRunId: run.id,
          promptVersion: prompt.version,
          skipQuoteCheck: true, // issue text is the mirror, not a parsed artifact
        });
        if ('id' in submitted) proposalIds.push(submitted.id);
      }
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'linking',
      proposals: proposalIds.length,
    });
    return { runId: run.id, proposalIds };
  }

  private explicitRequirementIds(issue: TrackerIssue): string[] {
    const ids = new Set<string>();
    const pattern = /\bREQ-\d{3}\b/g;
    for (const label of issue.labels) {
      const matches = label.match(pattern);
      if (matches) matches.forEach((match) => ids.add(match));
    }
    const text = `${issue.summary}\n${issue.description}`;
    for (const match of text.match(pattern) ?? []) ids.add(match);
    return [...ids];
  }

  private async candidateRequirements(
    project: string,
    issue: TrackerIssue,
  ): Promise<RequirementVersion[]> {
    const hits = await this.projections.searchRequirements(
      project,
      `${issue.summary}\n${issue.description}`.slice(0, 1500),
      8,
    );
    const versions: RequirementVersion[] = [];
    for (const hit of hits) {
      const chain = await this.repository.getVersions(project, hit.refId);
      const current = chain[chain.length - 1];
      if (current) versions.push(current);
    }
    return versions;
  }
}
