import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtEventsService } from './events.service';
import { ProjectLockService } from './store/project-lock.service';
import { RequirementService } from './requirement.service';
import { validateQuote } from './pipelines/quote-validator';
import {
  Evidence,
  Proposal,
  ProposalDecision,
  ProposalKind,
  SeedOverride,
} from './types/tendertrace-types';

export interface SubmitProposalInput {
  kind: ProposalKind;
  payload: any;
  evidence?: Evidence | null;
  affectedRequirementIds?: string[];
  agentRunId?: string;
  promptVersion?: string;
  confidence?: number;
  classification?: Proposal['classification'];
  decisionStatus?: Proposal['decisionStatus'];
  scopeAssessment?: Proposal['scopeAssessment'];
  scopeRationale?: string;
  sourceArtifactId?: string;
  /** exact source text the agent saw — used for the verbatim-quote check */
  sourceText?: string;
  /** deterministic pre-pass proposals (e.g. REQ-id label links) skip the quote check */
  skipQuoteCheck?: boolean;
  seed?: SeedOverride;
}

export interface DecideInput {
  decision: ProposalDecision;
  edits?: any;
  resolutionNote?: string;
  actor: string;
  seed?: SeedOverride;
}

export interface DecideResult {
  success: boolean;
  conflict?: boolean;
  winning?: { decision: ProposalDecision; decidedBy?: string; decidedAt?: string };
  blocked?: boolean;
  blockers?: any[];
  proposal?: Proposal;
  effect?: any;
  error?: string;
}

export interface DecisionContext {
  project: string;
  proposal: Proposal;
  decision: ProposalDecision;
  edits?: any;
  resolutionNote?: string;
  actor: string;
  seed?: SeedOverride;
}

export type DecisionEffect = (ctx: DecisionContext) => Promise<any>;
export type DedupHook = (
  project: string,
  input: SubmitProposalInput,
) => Promise<{ attachedTo: string } | null>;
export type DecisionGuard = (ctx: DecisionContext) => Promise<{ blocked: boolean; blockers?: any[] } | null>;

/**
 * The ONLY write path into requirement content (spec §3.2 RequirementModule):
 * agents submit proposals; humans decide them; kind-specific effects create
 * versions, links, mappings, claim items etc.
 *
 * Decisions are first-writer-wins (spec §9.4/§12.5): the proposed→decided
 * transition is guarded under the per-project lock; a losing concurrent
 * decision gets {conflict:true} with the winning decision attached.
 *
 * Effects for kinds whose services live in later modules (drift staleness,
 * links, catalog publish, …) are late-bound via registerEffect() to avoid
 * circular dependencies.
 */
@Injectable()
export class ProposalService {
  private readonly logger = new Logger(ProposalService.name);
  private readonly effects = new Map<ProposalKind, DecisionEffect>();
  private readonly guards: DecisionGuard[] = [];
  private dedupHook: DedupHook | null = null;

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
    private readonly locks: ProjectLockService,
    private readonly requirements: RequirementService,
  ) {
    this.effects.set('extraction', (ctx) => this.extractionEffect(ctx));
  }

  registerEffect(kind: ProposalKind, effect: DecisionEffect): void {
    this.effects.set(kind, effect);
  }

  registerDedupHook(hook: DedupHook): void {
    this.dedupHook = hook;
  }

  registerDecisionGuard(guard: DecisionGuard): void {
    this.guards.push(guard);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async submit(project: string, input: SubmitProposalInput): Promise<Proposal | { attachedTo: string }> {
    // universal grounding contract: verbatim evidence quote (spec §4)
    if (input.evidence?.quote && input.sourceText && !input.skipQuoteCheck) {
      const check = validateQuote(input.sourceText, input.evidence.quote);
      if (!check.valid) {
        throw new Error(`Evidence quote validation failed: ${check.reason}`);
      }
    }

    // cross-artifact dedup (spec §12.3) — attach evidence to an open proposal instead
    if (this.dedupHook) {
      const attached = await this.dedupHook(project, input);
      if (attached) {
        await this.events.emit(project, 'proposal.evidence-attached', {
          proposalId: attached.attachedTo,
          kind: input.kind,
        });
        return attached;
      }
    }

    return this.locks.withLock(project, async () => {
      const pid = await this.repository.nextKey(project, 'proposal', 'P-', 4);
      const proposal: Proposal = {
        id: pid,
        kind: input.kind,
        status: 'proposed',
        payload: input.payload,
        evidence: input.evidence ?? null,
        affectedRequirementIds: input.affectedRequirementIds ?? [],
        agentRunId: input.agentRunId,
        promptVersion: input.promptVersion,
        confidence: input.confidence,
        createdAt: input.seed?.at ?? new Date().toISOString(),
        classification: input.classification,
        decisionStatus: input.decisionStatus,
        scopeAssessment: input.scopeAssessment,
        scopeRationale: input.scopeRationale,
        sourceArtifactId: input.sourceArtifactId,
      };
      await this.repository.saveProposal(project, proposal);
      this.snapshots.invalidate(project);
      await this.events.emit(project, 'proposal.new', {
        proposalId: pid,
        kind: input.kind,
        classification: input.classification,
        affectedRequirementIds: proposal.affectedRequirementIds,
        confidence: input.confidence,
      });
      return proposal;
    });
  }

  /** Attach additional evidence to an open proposal (dedup path). */
  async attachEvidence(project: string, proposalId: string, evidence: Evidence): Promise<void> {
    await this.locks.withLock(project, async () => {
      const proposal = await this.repository.getProposal(project, proposalId);
      if (!proposal || proposal.status !== 'proposed') return;
      const primary = proposal.evidence ?? { quote: evidence.quote };
      primary.additional = [...(primary.additional ?? []), evidence];
      await this.repository.updateProposal(project, { ...proposal, evidence: primary });
      this.snapshots.invalidate(project);
    });
  }

  // ---------------------------------------------------------------------------
  // Decide
  // ---------------------------------------------------------------------------

  async decide(project: string, proposalId: string, input: DecideInput): Promise<DecideResult> {
    return this.locks.withLock(project, async () => {
      const proposal = await this.repository.getProposal(project, proposalId);
      if (!proposal) return { success: false, error: `Unknown proposal ${proposalId}` };

      // first-writer-wins guard
      if (proposal.status !== 'proposed') {
        return {
          success: false,
          conflict: true,
          winning: {
            decision: proposal.decision!,
            decidedBy: proposal.decidedBy,
            decidedAt: proposal.decidedAt,
          },
        };
      }

      const context: DecisionContext = {
        project,
        proposal,
        decision: input.decision,
        edits: input.edits,
        resolutionNote: input.resolutionNote,
        actor: input.seed?.by ?? input.actor,
        seed: input.seed,
      };

      for (const guard of this.guards) {
        const verdict = await guard(context);
        if (verdict?.blocked) {
          return { success: false, blocked: true, blockers: verdict.blockers ?? [] };
        }
      }

      let effect: any;
      const handler = this.effects.get(proposal.kind);
      if (handler && input.decision !== 'rejected' && input.decision !== 'clarify') {
        effect = await handler(context);
      }

      const decided: Proposal = {
        ...proposal,
        status: input.decision === 'rejected' || input.decision === 'clarify' ? 'rejected' : 'approved',
        decision: input.decision,
        decidedBy: context.actor,
        decidedAt: input.seed?.at ?? new Date().toISOString(),
        decisionNote: input.resolutionNote,
      };
      await this.repository.updateProposal(project, decided);
      this.snapshots.invalidate(project);
      await this.events.emit(project, 'proposal.decided', {
        proposalId,
        kind: proposal.kind,
        decision: input.decision,
        by: context.actor,
        effect: effect && typeof effect === 'object' ? { ...effect, payload: undefined } : effect,
      });
      return { success: true, proposal: decided, effect };
    });
  }

  async bulkDecide(
    project: string,
    input: {
      kind: ProposalKind;
      decision: ProposalDecision;
      minConfidence?: number;
      proposalIds?: string[];
      actor: string;
      seed?: SeedOverride;
    },
  ): Promise<Array<{ proposalId: string } & DecideResult>> {
    let candidates: Proposal[];
    if (input.proposalIds?.length) {
      candidates = [];
      for (const pid of input.proposalIds) {
        const proposal = await this.repository.getProposal(project, pid);
        if (proposal) candidates.push(proposal);
      }
    } else {
      candidates = await this.repository.listProposals(project, {
        kind: input.kind,
        status: 'proposed',
      });
      if (input.minConfidence !== undefined) {
        candidates = candidates.filter(
          (proposal) => (proposal.confidence ?? 0) >= input.minConfidence!,
        );
      }
      // cards with ambiguities or low confidence cannot be bulk-approved (spec §5.1 notes)
      candidates = candidates.filter(
        (proposal) =>
          !(proposal.payload?.ambiguities?.length > 0) && (proposal.confidence ?? 0) >= 0.7,
      );
    }

    const results: Array<{ proposalId: string } & DecideResult> = [];
    for (const proposal of candidates) {
      const result = await this.decide(project, proposal.id, {
        decision: input.decision,
        actor: input.actor,
        seed: input.seed,
      });
      results.push({ proposalId: proposal.id, ...result });
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Built-in effects
  // ---------------------------------------------------------------------------

  private async extractionEffect(ctx: DecisionContext): Promise<any> {
    const requirement = await this.requirements.createFromExtraction(
      ctx.project,
      ctx.proposal,
      ctx.edits,
      ctx.seed,
    );
    return { requirementId: requirement.id };
  }
}
