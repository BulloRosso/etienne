import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtEventsService } from './events.service';
import {
  Proposal,
  Requirement,
  RequirementRelation,
  RequirementVersion,
  RelationKind,
  SeedOverride,
} from './types/tendertrace-types';

/**
 * Requirement lifecycle around the append-only version model:
 * REQ-key assignment at extraction-proposal approval (spec §12.8), version
 * creation from approved diffs, relations (§3.6), retire, and manual acceptance.
 * All entry points are called by ProposalService/tools under the project lock.
 */
@Injectable()
export class RequirementService {
  private readonly logger = new Logger(RequirementService.name);

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
  ) {}

  private now(seed?: SeedOverride): string {
    return seed?.at ?? new Date().toISOString();
  }

  /**
   * Approve an extraction proposal → draft requirement with version 1.
   * Requirement keys are sequential per tender and never reused (§12.8).
   * `edits` lets the reviewer adjust the EARS record inline before approval.
   */
  async createFromExtraction(
    project: string,
    proposal: Proposal,
    edits: Partial<RequirementVersion> | undefined,
    seed?: SeedOverride,
  ): Promise<Requirement> {
    const reqId = await this.repository.nextKey(project, 'requirement', 'REQ-', 3);
    const payload = proposal.payload ?? {};
    const at = this.now(seed);

    // never let reviewer edits change identity fields
    const {
      id: _ignoredId,
      requirementId: _ignoredReqId,
      versionNo: _ignoredVersionNo,
      ...safeEdits
    } = (edits ?? {}) as Partial<RequirementVersion>;

    const version: RequirementVersion = {
      earsPattern: payload.ears_pattern,
      earsFields: payload.ears_fields,
      earsText: payload.ears_text,
      category: payload.category,
      modality: payload.modality,
      quantities: payload.quantities ?? [],
      sourceRef: payload.source ?? proposal.evidence ?? {},
      ambiguities: payload.ambiguities ?? [],
      createdFromProposalId: proposal.id,
      createdAt: at,
      language: payload.language,
      ...safeEdits,
      id: `${reqId}/v/1`,
      requirementId: reqId,
      versionNo: 1,
    };

    const requirement: Requirement = {
      id: reqId,
      status: 'draft',
      currentVersionId: version.id,
      implementationStatus: 'unplanned',
    };

    await this.repository.createRequirement(project, requirement, version);
    await this.createSameClauseSiblings(project, reqId, version, seed);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'requirement.created', {
      requirementId: reqId,
      proposalId: proposal.id,
    });
    return requirement;
  }

  /**
   * derived_from_same_clause: automatic sibling relation for requirements sharing
   * one source quote (§3.6 — created by extraction, automatic).
   */
  private async createSameClauseSiblings(
    project: string,
    reqId: string,
    version: RequirementVersion,
    seed?: SeedOverride,
  ): Promise<void> {
    const quote = version.sourceRef?.quote;
    if (!quote) return;
    const requirements = await this.repository.listRequirements(project);
    for (const other of requirements) {
      if (other.id === reqId) continue;
      const otherVersions = await this.repository.getVersions(project, other.id);
      const v1 = otherVersions[0];
      if (v1?.sourceRef?.quote === quote) {
        await this.createRelation(
          project,
          {
            kind: 'derived_from_same_clause',
            fromRequirementId: reqId,
            toRequirementId: other.id,
            origin: 'extraction',
            status: 'approved',
          },
          seed,
        );
      }
    }
  }

  /**
   * Approve a drift diff → new version. The caller (ProposalService) handles
   * claim items and staleness fan-out; this only appends the version.
   */
  async addVersionFromDiff(
    project: string,
    reqId: string,
    proposal: Proposal,
    seed?: SeedOverride,
  ): Promise<RequirementVersion> {
    const requirement = await this.repository.getRequirement(project, reqId);
    if (!requirement) throw new Error(`Unknown requirement ${reqId}`);
    const versions = await this.repository.getVersions(project, reqId);
    const current = versions[versions.length - 1];
    if (!current) throw new Error(`Requirement ${reqId} has no versions`);

    const payload = proposal.payload ?? {};
    const diff = payload.diff ?? {};
    const nextNo = current.versionNo + 1;

    const version: RequirementVersion = {
      ...current,
      id: `${reqId}/v/${nextNo}`,
      versionNo: nextNo,
      earsText: diff.after_ears_text ?? current.earsText,
      earsFields: this.applyChangedFields(current.earsFields, diff.changed_fields),
      modality: diff.modality_change?.after ?? current.modality,
      quantities: payload.quantities ?? current.quantities,
      createdFromProposalId: proposal.id,
      createdAt: this.now(seed),
      supersedesVersionId: current.id,
    };

    await this.repository.addVersion(project, requirement, version);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'requirement.version', {
      requirementId: reqId,
      versionNo: nextNo,
      proposalId: proposal.id,
      decision: proposal.decision,
    });
    return version;
  }

  private applyChangedFields(
    fields: RequirementVersion['earsFields'],
    changedFields?: Array<{ field: string; before: string; after: string }>,
  ): RequirementVersion['earsFields'] {
    if (!changedFields) return fields;
    const next: any = { ...fields };
    for (const change of changedFields) {
      if (change.field in next) next[change.field] = change.after;
    }
    return next;
  }

  /** Create a brand-new requirement from a drift NEW_REQUIREMENT proposal. */
  async createFromDrift(
    project: string,
    proposal: Proposal,
    seed?: SeedOverride,
  ): Promise<Requirement> {
    const payload = proposal.payload?.new_requirement ?? proposal.payload ?? {};
    const synthetic: Proposal = { ...proposal, payload };
    const requirement = await this.createFromExtraction(project, synthetic, undefined, seed);
    // post-baseline additions enter the baselined set directly
    const meta = await this.repository.getTenderMeta(project);
    if (meta?.baselineLabel) {
      await this.repository.updateRequirement(project, {
        ...requirement,
        status: 'baselined',
      });
    }
    return requirement;
  }

  /** Relaxation/removal approved → requirement retired (spec §3.5 outer machine). */
  async retire(project: string, reqId: string, seed?: SeedOverride): Promise<void> {
    const requirement = await this.repository.getRequirement(project, reqId);
    if (!requirement) throw new Error(`Unknown requirement ${reqId}`);
    await this.repository.updateRequirement(project, { ...requirement, status: 'retired' });
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'requirement.retired', { requirementId: reqId });
  }

  /** Manual acceptance (Abnahme) — the only human-set implementation state. */
  async accept(
    project: string,
    reqId: string,
    actor: string,
    seed?: SeedOverride,
  ): Promise<Requirement> {
    const requirement = await this.repository.getRequirement(project, reqId);
    if (!requirement) throw new Error(`Unknown requirement ${reqId}`);
    if (requirement.status !== 'baselined') {
      throw new Error(`Requirement ${reqId} is not baselined (status: ${requirement.status})`);
    }
    if (requirement.implementationStatus === 'accepted') {
      throw new Error(`Requirement ${reqId} is already accepted`);
    }
    const at = this.now(seed);
    const updated: Requirement = {
      ...requirement,
      implementationStatus: 'accepted',
      acceptedBy: seed?.by ?? actor,
      acceptedAt: at,
    };
    await this.repository.updateRequirement(project, updated);
    await this.repository.appendStatusChange(project, {
      requirementId: reqId,
      from: requirement.implementationStatus ?? null,
      to: 'accepted',
      at,
    });
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'requirement.accepted', { requirementId: reqId, by: updated.acceptedBy });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Relations (§3.6)
  // ---------------------------------------------------------------------------

  async createRelation(
    project: string,
    input: {
      kind: RelationKind;
      fromRequirementId: string;
      toRequirementId: string;
      origin: RequirementRelation['origin'];
      status?: RequirementRelation['status'];
      createdFromProposalId?: string;
    },
    seed?: SeedOverride,
  ): Promise<RequirementRelation> {
    // avoid duplicates (same kind between same pair, either direction for undirected kinds)
    const existing = await this.repository.listRelations(project);
    const undirected = input.kind === 'derived_from_same_clause' || input.kind === 'conflicts_with';
    const duplicate = existing.find(
      (relation) =>
        relation.kind === input.kind &&
        ((relation.fromRequirementId === input.fromRequirementId &&
          relation.toRequirementId === input.toRequirementId) ||
          (undirected &&
            relation.fromRequirementId === input.toRequirementId &&
            relation.toRequirementId === input.fromRequirementId)),
    );
    if (duplicate) return duplicate;

    const relId = await this.repository.nextKey(project, 'relation', 'R-', 4);
    const relation: RequirementRelation = {
      id: relId,
      kind: input.kind,
      fromRequirementId: input.fromRequirementId,
      toRequirementId: input.toRequirementId,
      origin: input.origin,
      createdFromProposalId: input.createdFromProposalId,
      status: input.status ?? 'approved',
      createdAt: this.now(seed),
    };
    await this.repository.saveRelation(project, relation);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'relation.created', {
      relationId: relId,
      kind: input.kind,
      from: input.fromRequirementId,
      to: input.toRequirementId,
    });
    return relation;
  }

  /**
   * Resolve a conflicts_with relation (blocking gate for baseline freeze and
   * response export, spec §3.6).
   */
  async resolveConflict(
    project: string,
    relationId: string,
    resolutionNote: string,
    seed?: SeedOverride,
  ): Promise<RequirementRelation> {
    const relations = await this.repository.listRelations(project);
    const relation = relations.find((r) => r.id === relationId);
    if (!relation) throw new Error(`Unknown relation ${relationId}`);
    if (relation.kind !== 'conflicts_with') {
      throw new Error(`Relation ${relationId} is not a conflict`);
    }
    const resolved: RequirementRelation = {
      ...relation,
      status: 'resolved',
      resolutionNote,
    };
    await this.repository.updateRelation(project, resolved);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'conflict.resolved', { relationId, resolutionNote });
    return resolved;
  }

  async unresolvedConflicts(project: string): Promise<RequirementRelation[]> {
    const relations = await this.repository.listRelations(project);
    return relations.filter((r) => r.kind === 'conflicts_with' && r.status !== 'resolved');
  }
}
