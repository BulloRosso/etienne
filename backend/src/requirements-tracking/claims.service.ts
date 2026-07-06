import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtEventsService } from './events.service';
import { TtExportService } from './export.service';
import { RunRegistryService } from './pipelines/run-registry.service';
import { loadPrompt } from './pipelines/prompt-loader';
import { Claim, Proposal } from './types/tendertrace-types';

/**
 * Claims (spec §3.2 ClaimModule / P-12): a claim collects approved
 * change-order proposals; the Nachtrag document is assembled deterministically
 * (baseline text → changed text → evidence → approval trail per item); the
 * only generative step is P-CLAIM's per-change narrative paragraph.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly events: TtEventsService,
    private readonly exporter: TtExportService,
    private readonly runs: RunRegistryService,
  ) {}

  /** Approved change-order proposals available for claim items. */
  async claimableProposals(project: string): Promise<Proposal[]> {
    const proposals = await this.repository.listProposals(project, { kind: 'drift' });
    return proposals.filter((proposal) => proposal.decision === 'change_order');
  }

  async create(project: string, title: string): Promise<Claim> {
    const id = await this.repository.nextKey(project, 'claim', 'CL-', 2);
    const claim: Claim = {
      id,
      title,
      status: 'draft',
      proposalIds: [],
      createdAt: new Date().toISOString(),
    };
    await this.repository.saveClaim(project, claim);
    this.snapshots.invalidate(project);
    return claim;
  }

  async addItems(project: string, claimId: string, proposalIds: string[]): Promise<Claim> {
    const claim = await this.repository.getClaim(project, claimId);
    if (!claim) throw new Error(`Unknown claim ${claimId}`);
    for (const pid of proposalIds) {
      const proposal = await this.repository.getProposal(project, pid);
      if (!proposal || proposal.decision !== 'change_order') {
        throw new Error(`Proposal ${pid} is not an approved change order`);
      }
    }
    const updated: Claim = {
      ...claim,
      proposalIds: [...new Set([...claim.proposalIds, ...proposalIds])],
    };
    await this.repository.saveClaim(project, updated);
    this.snapshots.invalidate(project);
    return updated;
  }

  /** Deterministic assembly + P-CLAIM narratives per item. */
  async generate(project: string, claimId: string): Promise<Claim> {
    const claim = await this.repository.getClaim(project, claimId);
    if (!claim) throw new Error(`Unknown claim ${claimId}`);

    const prompt = loadPrompt('p-claim.v1');
    const run = await this.runs.start(project, {
      pipeline: 'claim',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const narratives: Record<string, string> = {};
    for (const pid of claim.proposalIds) {
      const item = await this.buildItem(project, pid);
      if (!item) continue;
      try {
        narratives[pid] = await this.llm.generateTextWithMessages({
          tier: 'regular',
          messages: [
            { role: 'system', content: prompt.text },
            { role: 'user', content: JSON.stringify(item, null, 1) },
          ],
          maxOutputTokens: 800,
          temperature: 0.1,
        });
      } catch (error: any) {
        this.logger.warn(`Claim narrative failed for ${pid}: ${error.message}`);
      }
    }
    await this.runs.finish(project, run, 'ok');

    const generated: Claim = { ...claim, narratives, status: 'generated' };
    await this.repository.saveClaim(project, generated);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'claim.generated', { claimId, items: claim.proposalIds.length });
    return generated;
  }

  /** Everything one Nachtrag position needs — entirely from approved data. */
  private async buildItem(project: string, proposalId: string): Promise<any | null> {
    const proposal = await this.repository.getProposal(project, proposalId);
    if (!proposal) return null;
    const reqId = proposal.affectedRequirementIds[0];
    if (!reqId) return null;
    const versions = await this.repository.getVersions(project, reqId);
    const createdVersion = versions.find((version) => version.createdFromProposalId === proposalId);
    const baselineVersion = createdVersion
      ? versions.find((version) => version.versionNo === createdVersion.versionNo - 1)
      : null;
    const first = versions[0];
    return {
      requirement_id: reqId,
      baseline: {
        version_no: baselineVersion?.versionNo,
        ears_text: baselineVersion?.earsText,
        tender_quote: first?.sourceRef?.quote,
        tender_source: `${first?.sourceRef?.document ?? ''} ${first?.sourceRef?.section ?? ''} S.${first?.sourceRef?.page ?? ''}`,
      },
      changed: {
        version_no: createdVersion?.versionNo,
        ears_text: createdVersion?.earsText,
      },
      evidence: proposal.evidence,
      decision: {
        decision: proposal.decision,
        decided_by: proposal.decidedBy,
        decided_at: proposal.decidedAt,
      },
    };
  }

  async setPricing(project: string, claimId: string, pricing: Record<string, string>): Promise<Claim> {
    const claim = await this.repository.getClaim(project, claimId);
    if (!claim) throw new Error(`Unknown claim ${claimId}`);
    const updated: Claim = { ...claim, pricing: { ...(claim.pricing ?? {}), ...pricing } };
    await this.repository.saveClaim(project, updated);
    this.snapshots.invalidate(project);
    return updated;
  }

  async exportDocx(project: string, claimId: string): Promise<string> {
    const claim = await this.repository.getClaim(project, claimId);
    if (!claim) throw new Error(`Unknown claim ${claimId}`);
    const meta = await this.repository.getTenderMeta(project);

    const lines: string[] = [
      `# Nachtrag — ${claim.title}`,
      '',
      `Projekt: ${meta?.title ?? project} (${meta?.key ?? ''})  `,
      `Stand: ${new Date().toISOString().slice(0, 10)}`,
      '',
    ];
    let position = 0;
    for (const pid of claim.proposalIds) {
      const item = await this.buildItem(project, pid);
      if (!item) continue;
      position++;
      lines.push(`## Position ${position}: ${item.requirement_id}`, '');
      if (claim.narratives?.[pid]) lines.push(claim.narratives[pid], '');
      lines.push(
        `**Baseline (v${item.baseline.version_no ?? '1'}):** ${item.baseline.ears_text ?? ''}`,
        '',
        `**Geändert (v${item.changed.version_no ?? ''}):** ${item.changed.ears_text ?? ''}`,
        '',
        `**Beleg:** „${item.evidence?.quote ?? ''}“ — ${item.evidence?.speaker_or_author ?? ''}, ${item.evidence?.date ?? ''} (${item.evidence?.location ?? ''})`,
        '',
        `**Entscheidung:** ${item.decision.decision} durch ${item.decision.decided_by} am ${item.decision.decided_at?.slice(0, 10)}`,
        '',
        `**Preis:** ${claim.pricing?.[pid] ?? '[MISSING: Preis]'}`,
        '',
        '---',
        '',
      );
    }

    const path = await this.exporter.renderDocx(
      project,
      lines.join('\n'),
      `exports/claims/${claimId}-nachtrag.docx`,
    );
    await this.repository.saveClaim(project, { ...claim, exportPath: path });
    return path;
  }
}
