import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtEventsService } from './events.service';
import { ProjectLockService } from './store/project-lock.service';
import { RequirementService } from './requirement.service';
import { Baseline, SeedOverride } from './types/tendertrace-types';

export interface FreezeResult {
  success: boolean;
  blocked?: boolean;
  blockers?: Array<{ kind: string; ref: string; detail: string }>;
  baseline?: Baseline;
  error?: string;
}

/**
 * Baseline freeze (spec §2 Phase C / §3.4): the approved requirement set
 * becomes an immutable, labelled version. Append-only from this point — any
 * later change exists only as an approved diff on top of it.
 *
 * Gate: unresolved conflicts_with relations block the freeze (spec §3.6),
 * returned as blockers rather than a partial success (spec §9.4).
 */
@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
    private readonly locks: ProjectLockService,
    private readonly requirements: RequirementService,
  ) {}

  async freeze(
    project: string,
    label: string,
    actor: string,
    seed?: SeedOverride,
  ): Promise<FreezeResult> {
    return this.locks.withLock(project, async () => {
      const existing = await this.repository.getBaseline(project, label);
      if (existing) {
        return { success: false, error: `Baseline ${label} already exists` };
      }

      const conflicts = await this.requirements.unresolvedConflicts(project);
      if (conflicts.length > 0) {
        return {
          success: false,
          blocked: true,
          blockers: conflicts.map((relation) => ({
            kind: 'conflict',
            ref: relation.id,
            detail: `${relation.fromRequirementId} conflicts with ${relation.toRequirementId}`,
          })),
        };
      }

      const requirements = await this.repository.listRequirements(project);
      const draftSet = requirements.filter((requirement) => requirement.status === 'draft');
      if (draftSet.length === 0) {
        return { success: false, error: 'No draft requirements to freeze' };
      }

      const versionIds: string[] = [];
      for (const requirement of draftSet) {
        const versions = await this.repository.getVersions(project, requirement.id);
        const current = versions[versions.length - 1];
        if (current) versionIds.push(current.id);
      }

      const frozenAt = seed?.at ?? new Date().toISOString();
      const baseline: Baseline = {
        id: `baseline/${label}`,
        label,
        frozenAt,
        frozenBy: seed?.by ?? actor,
        requirementVersionIds: versionIds,
      };
      await this.repository.saveBaseline(project, baseline);

      for (const requirement of draftSet) {
        await this.repository.updateRequirement(project, {
          ...requirement,
          status: 'baselined',
          implementationStatus: requirement.implementationStatus ?? 'unplanned',
        });
      }

      const meta = await this.repository.getTenderMeta(project);
      if (meta) {
        await this.repository.saveTenderMeta(project, {
          ...meta,
          baselineLabel: label,
          phase: 'implementation',
        });
      }

      this.snapshots.invalidate(project);
      await this.events.emit(project, 'baseline.frozen', {
        label,
        requirements: versionIds.length,
        by: baseline.frozenBy,
      });
      this.logger.log(`Baseline ${label} frozen for ${project}: ${versionIds.length} requirements`);
      return { success: true, baseline };
    });
  }
}
