import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtFilesService } from './store/files.service';
import { TtEventsService } from './events.service';
import { TtExportService } from './export.service';
import { RunRegistryService } from './pipelines/run-registry.service';
import { loadPrompt } from './pipelines/prompt-loader';
import { runStructured } from './pipelines/structured-run';
import { devrepNarrativeSchema, DevrepNarrative } from './schemas/devrep.schema';
import {
  DeviationReport,
  ImplementationStatus,
  Proposal,
  RequirementVersion,
} from './types/tendertrace-types';

const COVERAGE_GRACE_DAYS = 14; // spec §3.5 coverage-gap rule (configurable)

export interface ReportThread {
  requirementId: string;
  kind: 'changed' | 'new' | 'relaxed' | 'retired';
  baselineText: string | null;
  currentText: string;
  implementationStatus: ImplementationStatus | null;
  diffs: Array<{
    versionNo: number;
    date: string;
    decision: string | null;
    decidedBy: string | null;
    evidenceQuote: string | null;
    text: string;
  }>;
}

export interface ReportData {
  params: any;
  asOf: string;
  baselineLabel: string;
  kpis: {
    changed: number;
    changedInScope: number;
    changedChangeOrders: number;
    new: number;
    relaxed: number;
    pending: number;
    conflicts: number;
    shadow: number;
    coverageGaps: number;
  };
  threads: ReportThread[];
  pending: Array<{ id: string; kind: string; classification?: string; affected: string[] }>;
  conflicts: Array<{ id: string; from: string; to: string }>;
  shadowItems: Array<{ id: string; issueKey: string; summary: string }>;
  coverageGaps: Array<{ requirementId: string; text: string }>;
}

/**
 * Deviation report (spec §3.2 ReportModule / §4 pipeline 7): a deterministic
 * query layer over the append-only graph assembles the report data ("threads");
 * the only generative step is P-DEVREP's narrative. Reports are snapshotted so
 * any report is reproducible as-of its generation time — the "what had been
 * negotiated by date X" question is itself claim evidence.
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly files: TtFilesService,
    private readonly events: TtEventsService,
    private readonly exporter: TtExportService,
    private readonly runs: RunRegistryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Deterministic assembly (no LLM)
  // ---------------------------------------------------------------------------

  async assemble(project: string, params: DeviationReport['params']): Promise<ReportData> {
    const meta = await this.repository.getTenderMeta(project);
    const baselineLabel = params.sinceBaseline ?? meta?.baselineLabel ?? 'v1.0';
    const baseline = await this.repository.getBaseline(project, baselineLabel);
    if (!baseline) throw new Error(`Unknown baseline ${baselineLabel}`);
    const asOf = params.dateTo ?? new Date().toISOString();

    const baselineVersionByReq = new Map<string, string>();
    for (const versionId of baseline.requirementVersionIds) {
      baselineVersionByReq.set(versionId.split('/')[0], versionId);
    }

    const requirements = await this.repository.listRequirements(project);
    const statusChanges = await this.repository.listStatusChanges(project);
    const threads: ReportThread[] = [];
    const coverageGaps: ReportData['coverageGaps'] = [];
    let changedInScope = 0;
    let changedChangeOrders = 0;
    let newCount = 0;
    let relaxedCount = 0;

    for (const requirement of requirements) {
      const versions = (await this.repository.getVersions(project, requirement.id)).filter(
        (version) => version.createdAt <= asOf,
      );
      if (versions.length === 0) continue;
      const current = versions[versions.length - 1];
      const baselineVersionId = baselineVersionByReq.get(requirement.id);

      // as-of implementation status from the append-only StatusChange history
      const history = statusChanges.filter(
        (change) => change.requirementId === requirement.id && change.at <= asOf,
      );
      const implementationStatus =
        history.length > 0
          ? history[history.length - 1].to
          : requirement.status === 'baselined'
            ? (requirement.implementationStatus ?? 'unplanned')
            : null;

      const buildDiffs = async (chain: RequirementVersion[]): Promise<ReportThread['diffs']> => {
        const diffs: ReportThread['diffs'] = [];
        for (const version of chain) {
          const proposal = version.createdFromProposalId
            ? await this.repository.getProposal(project, version.createdFromProposalId)
            : null;
          diffs.push({
            versionNo: version.versionNo,
            date: version.createdAt,
            decision: proposal?.decision ?? null,
            decidedBy: proposal?.decidedBy ?? null,
            evidenceQuote: proposal?.evidence?.quote ?? null,
            text: version.earsText,
          });
        }
        return diffs;
      };

      if (!baselineVersionId) {
        // created after baseline
        if (requirement.status !== 'retired') {
          newCount++;
          threads.push({
            requirementId: requirement.id,
            kind: 'new',
            baselineText: null,
            currentText: current.earsText,
            implementationStatus,
            diffs: await buildDiffs(versions),
          });
        }
        continue;
      }

      const baselineVersionNo = parseInt(baselineVersionId.split('/v/')[1], 10);
      const baselineVersion = versions.find((version) => version.versionNo === baselineVersionNo);

      if (requirement.status === 'retired') {
        relaxedCount++;
        threads.push({
          requirementId: requirement.id,
          kind: 'retired',
          baselineText: baselineVersion?.earsText ?? null,
          currentText: current.earsText,
          implementationStatus,
          diffs: await buildDiffs(versions.filter((v) => v.versionNo > baselineVersionNo)),
        });
      } else if (current.versionNo !== baselineVersionNo) {
        const postDiffs = await buildDiffs(
          versions.filter((version) => version.versionNo > baselineVersionNo),
        );
        for (const diff of postDiffs) {
          if (diff.decision === 'change_order') changedChangeOrders++;
          else if (diff.decision === 'in_scope') changedInScope++;
        }
        threads.push({
          requirementId: requirement.id,
          kind: 'changed',
          baselineText: baselineVersion?.earsText ?? null,
          currentText: current.earsText,
          implementationStatus,
          diffs: postDiffs,
        });
      }

      // coverage gap: mandatory requirement without any implementation link
      // past the grace period after entering implementation (spec §3.5)
      if (
        requirement.status === 'baselined' &&
        current.modality === 'mandatory' &&
        (implementationStatus ?? 'unplanned') === 'unplanned'
      ) {
        const graceEnd =
          new Date(baseline.frozenAt).getTime() + COVERAGE_GRACE_DAYS * 24 * 3600 * 1000;
        if (new Date(asOf).getTime() > graceEnd) {
          coverageGaps.push({ requirementId: requirement.id, text: current.earsText });
        }
      }
    }

    const allProposals = await this.repository.listProposals(project, {});
    const pending = allProposals
      .filter((proposal) => proposal.status === 'proposed' && proposal.createdAt <= asOf)
      .filter((proposal) => ['drift', 'shadow_scope', 'acceptance_signal'].includes(proposal.kind))
      .map((proposal: Proposal) => ({
        id: proposal.id,
        kind: proposal.kind,
        classification: proposal.classification,
        affected: proposal.affectedRequirementIds,
      }));

    const relations = await this.repository.listRelations(project);
    const conflicts = relations
      .filter((relation) => relation.kind === 'conflicts_with' && relation.status !== 'resolved')
      .map((relation) => ({
        id: relation.id,
        from: relation.fromRequirementId,
        to: relation.toRequirementId,
      }));

    const shadowItems = allProposals
      .filter((proposal) => proposal.kind === 'shadow_scope' && proposal.status === 'proposed')
      .map((proposal) => ({
        id: proposal.id,
        issueKey: proposal.payload?.issue_key ?? '',
        summary: proposal.payload?.functionality_summary ?? '',
      }));

    const changed = threads.filter((thread) => thread.kind === 'changed').length;
    return {
      params,
      asOf,
      baselineLabel,
      kpis: {
        changed,
        changedInScope,
        changedChangeOrders,
        new: newCount,
        relaxed: relaxedCount,
        pending: pending.length,
        conflicts: conflicts.length,
        shadow: shadowItems.length,
        coverageGaps: coverageGaps.length,
      },
      threads,
      pending,
      conflicts,
      shadowItems,
      coverageGaps,
    };
  }

  // ---------------------------------------------------------------------------
  // Generate (assembly + P-DEVREP narrative + snapshot)
  // ---------------------------------------------------------------------------

  async generate(
    project: string,
    params: DeviationReport['params'],
    generatedBy: string,
  ): Promise<DeviationReport> {
    const data = await this.assemble(project, params);
    const prompt = loadPrompt('p-devrep.v1');
    const run = await this.runs.start(project, {
      pipeline: 'deviation-report',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    let narrative: DevrepNarrative | undefined;
    const outcome = await runStructured(this.llm, {
      schema: devrepNarrativeSchema,
      systemPrompt: prompt.text,
      userMessage: `<data>\n${JSON.stringify(data, null, 1)}\n</data>`,
      tier: 'regular',
      temperature: 0.1,
      maxOutputTokens: 8000,
    });
    if (outcome.ok && outcome.data) {
      narrative = outcome.data;
      await this.runs.finish(project, run, 'ok');
    } else {
      this.logger.warn(`Deviation narrative failed: ${outcome.error} — report ships without it`);
      await this.runs.finish(project, run, 'failed');
    }

    const reportId = await this.repository.nextKey(project, 'report', 'DR-', 2);
    const snapshotPath = `reports/${reportId}.snapshot.json`;
    await this.files.writeJson(project, snapshotPath, { data, narrative });

    const report: DeviationReport = {
      id: reportId,
      params,
      generatedAt: new Date().toISOString(),
      generatedBy,
      snapshotPath,
      narrative,
    };
    await this.repository.saveReport(project, report);
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'report.ready', { reportId, kpis: data.kpis });
    return report;
  }

  async getReportWithData(
    project: string,
    reportId: string,
  ): Promise<{
    report: DeviationReport;
    data: ReportData;
    narrative?: DeviationReport['narrative'];
  } | null> {
    const report = await this.repository.getReport(project, reportId);
    if (!report) return null;
    const snapshot = await this.files.readJson<{
      data: ReportData;
      narrative?: DeviationReport['narrative'];
    }>(project, report.snapshotPath);
    return { report, data: snapshot.data, narrative: report.narrative ?? snapshot.narrative };
  }

  async updateNarrative(
    project: string,
    reportId: string,
    narrative: DeviationReport['narrative'],
  ): Promise<void> {
    const report = await this.repository.getReport(project, reportId);
    if (!report) throw new Error(`Unknown report ${reportId}`);
    await this.repository.saveReport(project, { ...report, narrative });
    this.snapshots.invalidate(project);
  }

  // ---------------------------------------------------------------------------
  // DOCX export
  // ---------------------------------------------------------------------------

  async exportDocx(project: string, reportId: string): Promise<string> {
    const bundle = await this.getReportWithData(project, reportId);
    if (!bundle) throw new Error(`Unknown report ${reportId}`);
    const { report, data, narrative } = bundle;
    const meta = await this.repository.getTenderMeta(project);

    const lines: string[] = [
      `# Abweichungsbericht — ${meta?.title ?? project}`,
      '',
      `Baseline: ${data.baselineLabel} · Stand: ${data.asOf.slice(0, 10)} · erstellt von ${report.generatedBy}`,
      '',
      '## Kennzahlen',
      '',
      `| Geändert | davon Nachtrag | Neu | Entfallen | Offen | Konflikte | Shadow Scope | Abdeckungslücken |`,
      '|---|---|---|---|---|---|---|---|',
      `| ${data.kpis.changed} | ${data.kpis.changedChangeOrders} | ${data.kpis.new} | ${data.kpis.relaxed} | ${data.kpis.pending} | ${data.kpis.conflicts} | ${data.kpis.shadow} | ${data.kpis.coverageGaps} |`,
      '',
    ];
    if (narrative?.executive_summary) {
      lines.push('## Zusammenfassung', '', narrative.executive_summary, '');
    }
    if (narrative?.change_lines?.length) {
      lines.push('## Änderungen', '');
      for (const change of narrative.change_lines) lines.push(`- **${change.requirement_id}**: ${change.line}`);
      lines.push('');
    }
    lines.push('## Anforderungs-Threads', '');
    for (const thread of data.threads) {
      lines.push(`### ${thread.requirementId} (${thread.kind})`, '');
      if (thread.baselineText) lines.push(`*Baseline:* ${thread.baselineText}`, '');
      for (const diff of thread.diffs) {
        lines.push(
          `- v${diff.versionNo} (${diff.date.slice(0, 10)}${diff.decision ? `, ${diff.decision}` : ''}${diff.decidedBy ? `, ${diff.decidedBy}` : ''}): ${diff.text}` +
            (diff.evidenceQuote ? `\n  - Beleg: „${diff.evidenceQuote}“` : ''),
        );
      }
      lines.push(
        `- *Aktuell:* ${thread.currentText}` +
          (thread.implementationStatus ? ` — Umsetzungsstatus: ${thread.implementationStatus}` : ''),
        '',
      );
    }
    if (narrative?.attention_items?.length) {
      lines.push('## Entscheidungsbedarf', '');
      for (const item of narrative.attention_items) lines.push(`- [${item.kind}] ${item.ref}: ${item.line}`);
      lines.push('');
    }
    if (data.coverageGaps.length) {
      lines.push('## Abdeckungslücken (MUSS ohne Umsetzungsticket)', '');
      for (const gap of data.coverageGaps) lines.push(`- **${gap.requirementId}**: ${gap.text}`);
    }

    const path = await this.exporter.renderDocx(
      project,
      lines.join('\n'),
      `exports/deviation-${reportId}.docx`,
    );
    await this.repository.saveReport(project, { ...report, exportPath: path });
    return path;
  }
}
