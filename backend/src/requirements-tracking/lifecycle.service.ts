import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtEventsService } from './events.service';
import {
  ImplementationStatus,
  RequirementIssueLink,
  SeedOverride,
  StaleNotice,
  TrackerIssue,
} from './types/tendertrace-types';

/**
 * Implementation lifecycle (spec §3.5) — deterministic, no LLM:
 *   unplanned   = no approved links
 *   planned     = links exist, all issues todo
 *   in_progress = any linked issue in progress
 *   implemented = all `implements`-links done
 *   accepted    = manual Abnahme only (RequirementService.accept)
 *
 * Staleness rule: approving any diff sets stale_since on all the requirement's
 * approved links + mappings and drafts the tracker comment for human posting.
 * A stale link's issue no longer counts as done, which regresses
 * implemented → in_progress exactly as the spec's state machine demands.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
  ) {}

  /** Pure derivation per §3.5 — unit-testable. */
  deriveStatus(
    links: RequirementIssueLink[],
    issuesByKey: Map<string, TrackerIssue>,
  ): ImplementationStatus {
    const approved = links.filter((link) => link.status === 'approved');
    if (approved.length === 0) return 'unplanned';

    const linkStates = approved.map((link) => {
      const issue = issuesByKey.get(link.issueKey);
      const category = issue?.statusCategory ?? 'todo';
      // a stale link's issue is treated as reopened (not done)
      const effective = link.staleSince && category === 'done' ? 'in_progress' : category;
      return { link, category: effective };
    });

    const implementsLinks = linkStates.filter(
      (state) =>
        state.link.relationship === 'implements' ||
        state.link.relationship === 'partially_implements',
    );
    if (
      implementsLinks.length > 0 &&
      implementsLinks.every((state) => state.category === 'done')
    ) {
      return 'implemented';
    }
    if (linkStates.some((state) => state.category === 'in_progress')) return 'in_progress';
    if (linkStates.every((state) => state.category === 'todo')) return 'planned';
    // mixed done/todo without all implements done
    return 'in_progress';
  }

  /** Recompute one requirement (or all) after link/issue changes. */
  async recompute(project: string, reqId?: string, seed?: SeedOverride): Promise<void> {
    const issues = await this.repository.listIssues(project);
    const issuesByKey = new Map(issues.map((issue) => [issue.key, issue]));
    const requirements = reqId
      ? [await this.repository.getRequirement(project, reqId)].filter(Boolean)
      : await this.repository.listRequirements(project);

    for (const requirement of requirements) {
      if (!requirement || requirement.status !== 'baselined') continue;
      if (requirement.implementationStatus === 'accepted') continue; // manual state wins

      const links = await this.repository.listLinks(project, {
        requirementId: requirement.id,
      });
      const derived = this.deriveStatus(links, issuesByKey);
      if (derived === requirement.implementationStatus) continue;

      const at = seed?.at ?? new Date().toISOString();
      await this.repository.updateRequirement(project, {
        ...requirement,
        implementationStatus: derived,
      });
      await this.repository.appendStatusChange(project, {
        requirementId: requirement.id,
        from: requirement.implementationStatus ?? null,
        to: derived,
        at,
      });
      await this.events.emit(project, 'requirement.status', {
        requirementId: requirement.id,
        from: requirement.implementationStatus,
        to: derived,
      });
    }
    this.snapshots.invalidate(project);
  }

  /**
   * Staleness fan-out on diff approval (spec §3.5): flag links + mappings,
   * draft the tracker comment (posted only by a human), recompute status.
   */
  async applyStalenessOnDiff(
    project: string,
    reqId: string,
    newVersionLabel: string,
    newEarsText: string,
    seed?: SeedOverride,
  ): Promise<void> {
    const at = seed?.at ?? new Date().toISOString();

    const links = await this.repository.listLinks(project, {
      requirementId: reqId,
      status: 'approved',
    });
    const staleIssueKeys: string[] = [];
    for (const link of links) {
      if (link.staleSince) continue;
      await this.repository.updateLink(project, { ...link, staleSince: at });
      staleIssueKeys.push(link.issueKey);
    }

    const mappings = await this.repository.listMappings(project, { requirementId: reqId });
    for (const mapping of mappings) {
      if (mapping.status !== 'approved' || mapping.staleSince) continue;
      await this.repository.updateMapping(project, { ...mapping, staleSince: at });
    }

    if (staleIssueKeys.length > 0) {
      const noticeId = await this.repository.nextKey(project, 'staleNotice', 'SN-', 3);
      const notice: StaleNotice = {
        id: noticeId,
        requirementId: reqId,
        issueKeys: staleIssueKeys,
        draftComment:
          `Requirement changed in ${newVersionLabel}: ${newEarsText} — ` +
          `see the requirement diff in TenderTrace. Please review whether this ticket still matches the current scope.`,
        createdAt: at,
      };
      await this.repository.saveStaleNotice(project, notice);
      await this.events.emit(project, 'links.stale', {
        requirementId: reqId,
        issueKeys: staleIssueKeys,
        noticeId,
      });
    }

    await this.recompute(project, reqId, seed);
  }

  /** Republishing a service or approving a diff marks mappings stale (spec §3.4). */
  async applyStalenessOnServiceRepublish(
    project: string,
    serviceId: string,
    seed?: SeedOverride,
  ): Promise<void> {
    const at = seed?.at ?? new Date().toISOString();
    const mappings = await this.repository.listMappings(project, {});
    for (const mapping of mappings) {
      if (mapping.status !== 'approved' || mapping.staleSince) continue;
      if (mapping.serviceVersionId.startsWith(`${serviceId}/`)) {
        await this.repository.updateMapping(project, { ...mapping, staleSince: at });
      }
    }
    this.snapshots.invalidate(project);
  }
}
