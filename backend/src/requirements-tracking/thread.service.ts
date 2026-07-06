import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import {
  Baseline,
  Proposal,
  Requirement,
  RequirementIssueLink,
  RequirementRelation,
  RequirementVersion,
  ServiceRequirementMapping,
  StatusChange,
  TrackerIssue,
} from './types/tendertrace-types';

export interface ThreadVersionEntry {
  version: RequirementVersion;
  proposal: Proposal | null;
  inBaseline: string | null; // baseline label if this version is frozen in one
}

export interface RequirementThread {
  requirement: Requirement;
  versions: ThreadVersionEntry[];
  relations: RequirementRelation[];
  mappings: ServiceRequirementMapping[];
  links: Array<{ link: RequirementIssueLink; issue: TrackerIssue | null }>;
  statusHistory: StatusChange[];
}

/**
 * Thread assembly (spec §3.5): the product's central data structure — one
 * vertical timeline per requirement from tender quote through baseline, every
 * approved diff, current version, linked issues, to acceptance. Assembled by
 * match()-fan-out through the repository — no SPARQL on the hot path (§11.5).
 */
@Injectable()
export class ThreadService {
  private readonly logger = new Logger(ThreadService.name);

  constructor(private readonly repository: TtRepository) {}

  async getThread(project: string, reqId: string): Promise<RequirementThread | null> {
    const requirement = await this.repository.getRequirement(project, reqId);
    if (!requirement) return null;

    const [versions, relations, mappings, links, statusHistory, baselines] = await Promise.all([
      this.repository.getVersions(project, reqId),
      this.repository.listRelations(project, reqId),
      this.repository.listMappings(project, { requirementId: reqId }),
      this.repository.listLinks(project, { requirementId: reqId }),
      this.repository.listStatusChanges(project, reqId),
      this.repository.listBaselines(project),
    ]);

    const baselineByVersion = new Map<string, string>();
    for (const baseline of baselines as Baseline[]) {
      for (const versionId of baseline.requirementVersionIds) {
        if (!baselineByVersion.has(versionId)) {
          baselineByVersion.set(versionId, baseline.label);
        }
      }
    }

    const versionEntries: ThreadVersionEntry[] = [];
    for (const version of versions) {
      const proposal = version.createdFromProposalId
        ? await this.repository.getProposal(project, version.createdFromProposalId)
        : null;
      versionEntries.push({
        version,
        proposal,
        inBaseline: baselineByVersion.get(version.id) ?? null,
      });
    }

    const linkEntries: Array<{ link: RequirementIssueLink; issue: TrackerIssue | null }> = [];
    for (const link of links) {
      const issue = await this.repository.getIssue(project, link.issueKey);
      linkEntries.push({ link, issue });
    }

    return {
      requirement,
      versions: versionEntries,
      relations,
      mappings,
      links: linkEntries,
      statusHistory,
    };
  }
}
