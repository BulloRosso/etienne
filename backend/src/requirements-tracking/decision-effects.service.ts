import { Injectable, Logger } from '@nestjs/common';
import { ProposalService, DecisionContext } from './proposal.service';
import { RequirementService } from './requirement.service';
import { LifecycleService } from './lifecycle.service';
import { SearchProjectionService } from './search-projection.service';
import { TtRepository } from './graph/tt-repository';
import { MockTrackerAdapter } from './tracker/mock-tracker.adapter';
import { TtCatalogService } from './catalog.service';
import {
  ComplianceRecord,
  RequirementIssueLink,
  ServiceRequirementMapping,
} from './types/tendertrace-types';

/**
 * Kind-specific decision effects beyond extraction (which lives in
 * ProposalService itself). Late-bound registration avoids circular deps.
 *
 * drift:
 *   in_scope / change_order → new requirement version + staleness fan-out
 *   (NEW_REQUIREMENT → new requirement; RELAXATION_OR_REMOVAL with no diff →
 *   retire; CONFLICT → confirmed conflicts_with relation, blocking until
 *   resolved). change_order additionally becomes claimable — claims select
 *   approved change-order proposals directly (spec P-12).
 * acceptance_signal: confirmed_acceptance → manual-grade acceptance.
 * progress_update: noted — the decided proposal itself is the thread event.
 *
 * Guard (spec §12.9): approving a drift diff whose conflict cross-check found
 * potential_conflict requires a resolutionNote in the same decision.
 */
@Injectable()
export class DecisionEffectsService {
  private readonly logger = new Logger(DecisionEffectsService.name);

  constructor(
    private readonly proposals: ProposalService,
    private readonly requirements: RequirementService,
    private readonly lifecycle: LifecycleService,
    private readonly projections: SearchProjectionService,
    private readonly repository: TtRepository,
    private readonly tracker: MockTrackerAdapter,
    private readonly catalog: TtCatalogService,
  ) {
    this.proposals.registerEffect('drift', (ctx) => this.driftEffect(ctx));
    this.proposals.registerEffect('acceptance_signal', (ctx) => this.acceptanceEffect(ctx));
    this.proposals.registerEffect('progress_update', async () => ({ noted: true }));
    this.proposals.registerEffect('link', (ctx) => this.linkEffect(ctx));
    this.proposals.registerEffect('shadow_scope', (ctx) => this.shadowEffect(ctx));
    this.proposals.registerEffect('mapping', (ctx) => this.mappingEffect(ctx));
    this.proposals.registerEffect('compliance', (ctx) => this.complianceEffect(ctx));
    this.proposals.registerEffect('catalog_import', (ctx) => this.catalogImportEffect(ctx));
    this.proposals.registerDecisionGuard((ctx) => this.conflictGuard(ctx));
    // keep the search projection in sync with extraction approvals too
    this.proposals.registerEffect('extraction', (ctx) => this.extractionEffect(ctx));
  }

  /** Approve an AI-proposed mapping (Gate 1 of the compliance chain). */
  private async mappingEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, seed } = ctx;
    const payload = proposal.payload ?? {};
    const at = seed?.at ?? new Date().toISOString();
    const mappingId = await this.repository.nextKey(project, 'mapping', 'M-', 4);
    const mapping: ServiceRequirementMapping = {
      id: mappingId,
      serviceVersionId: `${payload.service_id}/v/${payload.service_version_no}`,
      requirementId: payload.requirement_id,
      coverage: payload.coverage,
      origin: 'ai',
      rationale: payload.rationale,
      serviceEvidence: payload.service_evidence,
      gapOrExclusion: payload.gap_or_exclusion ?? undefined,
      createdFromProposalId: proposal.id,
      status: 'approved',
      createdAt: at,
    };
    await this.repository.saveMapping(project, mapping);
    return { mappingId };
  }

  /** Approve a compliance verdict (Gate 2) → usable for response drafting. */
  private async complianceEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, edits } = ctx;
    const payload = { ...(proposal.payload ?? {}), ...(edits ?? {}) };
    const record: ComplianceRecord = {
      requirementId: payload.requirement_id,
      verdict: payload.verdict,
      justification: payload.justification,
      evidenceRefs: (payload.evidence_refs ?? []).map((ref: any) => ({
        serviceId: ref.service_id,
        versionNo: ref.version_no,
      })),
      deviation: payload.deviation ?? null,
      riskNote: payload.risk_note ?? null,
      internalQuestion: payload.internal_question ?? null,
      approvedFromProposalId: proposal.id,
    };
    await this.repository.saveCompliance(project, record);
    return { requirementId: record.requirementId, verdict: record.verdict };
  }

  /** Import-wizard publish: new entry or new version of an existing entry. */
  private async catalogImportEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, decision, actor, seed } = ctx;
    const payload = { ...(proposal.payload ?? {}), ...(ctx.edits ?? {}) };

    let serviceId: string;
    if (decision === 'merged_as_version' && payload.existing_key) {
      const services = await this.repository.listServices(project);
      const existing = services.find((service) => service.key === payload.existing_key);
      if (!existing) throw new Error(`Unknown existing service key ${payload.existing_key}`);
      serviceId = existing.id;
    } else {
      const created = await this.catalog.createService(project, {
        kind: 'service',
        title: payload.title,
      });
      serviceId = created.id;
    }

    const draft = await this.catalog.saveDraftVersion(project, serviceId, {
      bodyMarkdown: payload.body_markdown,
      tags: payload.tags,
      scope: payload.scope,
      source: 'docx_import',
    });
    const published = await this.catalog.publish(
      project,
      serviceId,
      draft.versionNo,
      actor,
      seed,
    );
    return { serviceId, versionNo: published.versionNo };
  }

  /** Approve a proposed requirement↔issue link → derived status feeds off it. */
  private async linkEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, seed } = ctx;
    const payload = proposal.payload ?? {};
    const link = await this.createApprovedLink(
      project,
      payload.requirement_id,
      payload.issue_key,
      payload.relationship ?? 'implements',
      proposal.id,
      payload.rationale,
      payload.matches_current,
      seed,
    );
    // non-invasive write-back: REQ label on the tracker issue
    await this.tracker.addLabel(project, payload.issue_key, payload.requirement_id);
    await this.lifecycle.recompute(project, payload.requirement_id, seed);
    return { linkId: link.id };
  }

  /**
   * Shadow-scope three-way decision (spec §2 step 15): link it, mark internal,
   * or escalate as a drift proposal with the ticket text as evidence.
   */
  private async shadowEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, decision, seed } = ctx;
    const payload = proposal.payload ?? {};
    const issueKey = payload.issue_key;

    if (decision === 'linked') {
      const links = payload.links?.length
        ? payload.links
        : ctx.edits?.links ?? [];
      const created: string[] = [];
      for (const link of links) {
        const saved = await this.createApprovedLink(
          project,
          link.requirement_id,
          issueKey,
          link.relationship ?? 'implements',
          proposal.id,
          link.rationale,
          link.matches_current,
          seed,
        );
        await this.tracker.addLabel(project, issueKey, link.requirement_id);
        await this.lifecycle.recompute(project, link.requirement_id, seed);
        created.push(saved.id);
      }
      return { linkIds: created };
    }

    if (decision === 'internal') {
      await this.tracker.addLabel(project, issueKey, 'internal');
      return { internal: true };
    }

    if (decision === 'escalated_to_drift') {
      const issue = await this.repository.getIssue(project, issueKey);
      const quote = payload.origin_evidence?.[0]?.quote ?? issue?.summary ?? issueKey;
      const drift = await this.proposals.submit(project, {
        kind: 'drift',
        payload: {
          new_requirement: null,
          diff: null,
          conflict: null,
          clarification_question_draft:
            `Ticket ${issueKey} delivers functionality without contractual basis: ` +
            `${payload.functionality_summary ?? issue?.summary ?? ''}. Nachtrag oder in-scope?`,
          escalated_from_issue: issueKey,
        },
        evidence: {
          quote,
          location: payload.origin_evidence?.[0]?.location ?? `ticket ${issueKey}`,
        },
        affectedRequirementIds: [],
        classification: 'CLARIFICATION_NEEDED',
        confidence: proposal.confidence,
        seed,
        skipQuoteCheck: true,
      });
      return { escalatedTo: 'id' in drift ? drift.id : drift.attachedTo };
    }
    return {};
  }

  private async createApprovedLink(
    project: string,
    requirementId: string,
    issueKey: string,
    relationship: RequirementIssueLink['relationship'],
    proposalId: string,
    rationale: string | undefined,
    matchesCurrent: boolean | undefined,
    seed?: DecisionContext['seed'],
  ): Promise<RequirementIssueLink> {
    const at = seed?.at ?? new Date().toISOString();
    const linkId = await this.repository.nextKey(project, 'link', 'L-', 4);
    const link: RequirementIssueLink = {
      id: linkId,
      requirementId,
      issueKey,
      relationship,
      createdFromProposalId: proposalId,
      status: 'approved',
      matchesCurrent,
      rationale,
      createdAt: at,
      // an issue matching an OLDER formulation is stale from birth (spec §5.6 rule 5)
      staleSince: matchesCurrent === false ? at : undefined,
    };
    await this.repository.saveLink(project, link);
    return link;
  }

  private async extractionEffect(ctx: DecisionContext): Promise<any> {
    const requirement = await this.requirements.createFromExtraction(
      ctx.project,
      ctx.proposal,
      ctx.edits,
      ctx.seed,
    );
    const versions = await this.repository.getVersions(ctx.project, requirement.id);
    const current = versions[versions.length - 1];
    if (current) await this.projections.indexRequirementVersion(ctx.project, current);
    return { requirementId: requirement.id };
  }

  private async conflictGuard(
    ctx: DecisionContext,
  ): Promise<{ blocked: boolean; blockers?: any[] } | null> {
    if (ctx.proposal.kind !== 'drift') return null;
    if (ctx.decision !== 'in_scope' && ctx.decision !== 'change_order') return null;
    const checks: Array<{ requirement_id: string; verdict: string; explanation?: string }> =
      ctx.proposal.payload?.conflict_checks ?? [];
    const potentials = checks.filter((check) => check.verdict === 'potential_conflict');
    if (potentials.length > 0 && !ctx.resolutionNote) {
      return {
        blocked: true,
        blockers: potentials.map((check) => ({
          kind: 'potential_conflict',
          ref: check.requirement_id,
          detail:
            check.explanation ??
            'Conflict cross-check flagged this requirement — resolve it in the same decision (add resolutionNote).',
        })),
      };
    }
    return null;
  }

  private async driftEffect(ctx: DecisionContext): Promise<any> {
    const { project, proposal, decision, seed } = ctx;
    const classification = proposal.classification;
    const versionLabel = (versionNo: number) => `v1.${versionNo - 1}`;

    switch (classification) {
      case 'MODIFICATION': {
        const reqId = proposal.affectedRequirementIds[0];
        if (!reqId) throw new Error('MODIFICATION proposal without affected requirement');
        const version = await this.requirements.addVersionFromDiff(project, reqId, proposal, seed);
        await this.projections.indexRequirementVersion(project, version);
        await this.lifecycle.applyStalenessOnDiff(
          project,
          reqId,
          versionLabel(version.versionNo),
          version.earsText,
          seed,
        );
        return { requirementId: reqId, versionNo: version.versionNo, decision };
      }
      case 'RELAXATION_OR_REMOVAL': {
        const reqId = proposal.affectedRequirementIds[0];
        if (!reqId) throw new Error('RELAXATION proposal without affected requirement');
        if (proposal.payload?.diff?.after_ears_text) {
          const version = await this.requirements.addVersionFromDiff(project, reqId, proposal, seed);
          await this.projections.indexRequirementVersion(project, version);
          await this.lifecycle.applyStalenessOnDiff(
            project,
            reqId,
            versionLabel(version.versionNo),
            version.earsText,
            seed,
          );
          return { requirementId: reqId, versionNo: version.versionNo, relaxed: true };
        }
        await this.requirements.retire(project, reqId, seed);
        await this.projections.removeRequirement(project, reqId);
        return { requirementId: reqId, retired: true };
      }
      case 'NEW_REQUIREMENT': {
        const requirement = await this.requirements.createFromDrift(project, proposal, seed);
        const versions = await this.repository.getVersions(project, requirement.id);
        const current = versions[versions.length - 1];
        if (current) await this.projections.indexRequirementVersion(project, current);
        return { requirementId: requirement.id, created: true };
      }
      case 'CONFLICT': {
        const conflicting = proposal.payload?.conflict?.conflicting_requirement_id;
        const source = proposal.affectedRequirementIds[0] ?? conflicting;
        if (!conflicting || !source) {
          throw new Error('CONFLICT proposal without both requirement ids');
        }
        const relation = await this.requirements.createRelation(
          project,
          {
            kind: 'conflicts_with',
            fromRequirementId: source,
            toRequirementId: conflicting,
            origin: 'drift',
            status: 'approved', // confirmed, but NOT resolved — blocking until resolutionNote
            createdFromProposalId: proposal.id,
          },
          seed,
        );
        return { relationId: relation.id, blocking: true };
      }
      case 'CONFIRMATION':
      default:
        // evidence recorded on the decided proposal; nothing else changes
        return { noted: true };
    }
  }

  private async acceptanceEffect(ctx: DecisionContext): Promise<any> {
    const reqId = ctx.proposal.affectedRequirementIds[0];
    if (!reqId) throw new Error('acceptance_signal proposal without affected requirement');
    const requirement = await this.requirements.accept(ctx.project, reqId, ctx.actor, ctx.seed);
    return { requirementId: reqId, accepted: true, by: requirement.acceptedBy };
  }
}
