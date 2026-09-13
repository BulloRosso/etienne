import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { ContentManagementService } from '../../content-management/content-management.service';
import { TtRepository } from '../graph/tt-repository';
import { TtFilesService } from '../store/files.service';
import { TtEventsService } from '../events.service';
import { RunRegistryService } from '../pipelines/run-registry.service';
import { loadPrompt, renderPrompt } from '../pipelines/prompt-loader';
import { runStructured } from '../pipelines/structured-run';
import { analysisNarrativeSchema, AnalysisNarrative } from '../schemas/analysis.schema';
import {
  Ambiguity,
  ComplianceVerdict,
  ConsistencyAlert,
  Modality,
  Proposal,
  TenderMeta,
} from '../types/tendertrace-types';
import { AnalysisRunState } from './analysis-types';

/**
 * Management analysis (spec: tender-analysis stage 5). A deterministic
 * assembly over the graph builds every number and table; the only generative
 * step is P-ANALYSIS, which writes the narrative around server-rendered
 * blocks. The document follows `analysis-template/*.md`, lands in
 * out/analysis/ as Markdown + DOCX, and is snapshotted for reproducibility.
 */

export type ReportVerdict = ComplianceVerdict | 'PENDING';

export interface ReportRequirementRow {
  id: string;
  /** the extraction card the requirement was created from (carries the alerts) */
  proposalId?: string;
  earsText: string;
  domainText?: string;
  modality: Modality;
  category: string;
  verdict: ReportVerdict;
  verdictStatus: 'approved' | 'proposed' | 'none';
  justification?: string;
  deviation?: string;
  riskNote?: string;
  services: Array<{ serviceId: string; title: string; coverage: string; status: 'approved' | 'proposed' }>;
  alerts: ConsistencyAlert[];
  ambiguities: Ambiguity[];
  document?: string;
  page?: number;
}

export interface AnalysisReportData {
  tender: TenderMeta | null;
  runId: string;
  generatedAt: string;
  language: string;
  reliable: boolean;
  documents: Array<{ docId: string; title: string; sections?: number }>;
  kpis: {
    requirements: number;
    mandatory: number;
    target: number;
    optional: number;
    verdicts: Record<ReportVerdict, number>;
    mappedFull: number;
    mappedPartial: number;
    unmapped: number;
    unmappedMandatory: number;
    alerts: number;
    unresolvedAlerts: number;
    clarifications: number;
    internalQuestions: number;
    fulfilmentScore: number;
    openReviews: number;
  };
  requirements: ReportRequirementRow[];
  byCategory: Record<string, { total: number; verdicts: Record<ReportVerdict, number> }>;
  consistencyAlerts: Array<ConsistencyAlert & { proposalId: string; requirementId?: string }>;
  clarifications: Array<{ requirementId?: string; proposalId?: string; document: string; section: string; question: string; type: string }>;
  internalQuestions: Array<{ requirementId: string; question: string; ownerRole: string }>;
  unmappedMandatory: Array<{ requirementId: string; earsText: string }>;
  termMappings: Array<{ customerTerm: string; ourTerm: string; count: number }>;
}

const BLOCK_NAMES = [
  'kpis',
  'verdict_matrix',
  'by_category',
  'alerts',
  'clarifications',
  'internal_questions',
  'unmapped_mandatory',
  'terms',
  'reliability',
] as const;
type BlockName = (typeof BLOCK_NAMES)[number];
const BLOCK_TOKEN_RE = /\{\{block:([a-z_]+)\}\}/g;

const VERDICT_LABEL: Record<ReportVerdict, string> = {
  FULL: 'erfüllt',
  PARTIAL: 'teilweise',
  NON_COMPLIANT: 'nicht erfüllt',
  NEEDS_INPUT: 'intern zu klären',
  PENDING: 'offen',
};
const MODALITY_LABEL: Record<Modality, string> = { mandatory: 'MUSS', target: 'SOLL', optional: 'KANN' };

function emptyVerdicts(): Record<ReportVerdict, number> {
  return { FULL: 0, PARTIAL: 0, NON_COMPLIANT: 0, NEEDS_INPUT: 0, PENDING: 0 };
}

function md(text: unknown): string {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function formatNumber(value: number, unit: string): string {
  const number = Number.isInteger(value)
    ? value.toLocaleString('de-DE')
    : value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const unitLabel: Record<string, string> = {
    EUR: '€',
    m2: 'm²',
    percent: '%',
    count: '',
    hour: 'Std.',
    day: 'Tage',
    month: 'Monate',
    year: 'Jahre',
    minute: 'Min.',
    second: 's',
    unknown: '',
  };
  const suffix = unitLabel[unit] ?? unit;
  return suffix ? `${number} ${suffix}` : number;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tender';
}

export const DEFAULT_TEMPLATE = `# Management-Analyse

## Management Summary
Kurze Einschätzung: Können wir die Ausschreibung erfüllen? Welche Vorbehalte gelten?

## Erfüllungsgrad je Leistungsbereich
{{block:by_category}}

## Kennzahlen
{{block:kpis}}

## Risiken & Abweichungen
{{block:alerts}}

## Klärungsbedarf beim Kunden
{{block:clarifications}}

## Interne offene Punkte
{{block:internal_questions}}

## Empfehlung / nächste Schritte
`;

@Injectable()
export class AnalysisReportService {
  private readonly logger = new Logger(AnalysisReportService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly content: ContentManagementService,
    private readonly repository: TtRepository,
    private readonly files: TtFilesService,
    private readonly events: TtEventsService,
    private readonly runs: RunRegistryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Deterministic assembly (no LLM)
  // ---------------------------------------------------------------------------

  async assemble(
    project: string,
    run: AnalysisRunState,
    requirementIds: string[],
  ): Promise<AnalysisReportData> {
    const tender = await this.repository.getTenderMeta(project);
    const language = run.options.language || tender?.language || 'de';
    const requirementIdSet = new Set(requirementIds);

    const complianceRecords = await this.repository.listCompliance(project);
    const approvedVerdicts = new Map(complianceRecords.map((record) => [record.requirementId, record]));
    const complianceProposals = await this.repository.listProposals(project, { kind: 'compliance' });
    const proposedVerdicts = new Map<string, Proposal>();
    for (const proposal of complianceProposals) {
      if (proposal.status !== 'proposed') continue;
      const reqId = proposal.payload?.requirement_id;
      if (reqId) proposedVerdicts.set(reqId, proposal); // list is sorted by createdAt → latest wins
    }
    const approvedMappings = (await this.repository.listMappings(project, {})).filter(
      (mapping) => mapping.status === 'approved' && !mapping.staleSince,
    );
    const mappingProposals = (await this.repository.listProposals(project, { kind: 'mapping' })).filter(
      (proposal) => proposal.status === 'proposed',
    );
    const services = await this.repository.listServices(project);
    const serviceTitle = (serviceId: string) =>
      services.find((service) => service.id === serviceId)?.title ?? serviceId;

    const extractionProposals = await this.repository.listProposals(project, { kind: 'extraction' });
    const proposalById = new Map(extractionProposals.map((proposal) => [proposal.id, proposal]));
    const runProposalIds = new Set(run.extraction.proposalIds);

    const rows: ReportRequirementRow[] = [];
    const termCounts = new Map<string, { customerTerm: string; ourTerm: string; count: number }>();
    const requirements = await this.repository.listRequirements(project);
    for (const requirement of requirements) {
      if (requirement.status === 'retired') continue;
      if (requirementIdSet.size > 0 && !requirementIdSet.has(requirement.id)) continue;
      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (!current) continue;

      const approved = approvedVerdicts.get(requirement.id);
      const proposed = proposedVerdicts.get(requirement.id);
      const verdictSource = approved ?? proposed?.payload;
      const verdict: ReportVerdict = approved?.verdict ?? proposed?.payload?.verdict ?? 'PENDING';

      const serviceRows: ReportRequirementRow['services'] = [
        ...approvedMappings
          .filter((mapping) => mapping.requirementId === requirement.id)
          .map((mapping) => ({
            serviceId: mapping.serviceVersionId.split('/')[0],
            title: serviceTitle(mapping.serviceVersionId.split('/')[0]),
            coverage: mapping.coverage,
            status: 'approved' as const,
          })),
        ...mappingProposals
          .filter((proposal) => proposal.payload?.requirement_id === requirement.id)
          .map((proposal) => ({
            serviceId: proposal.payload.service_id,
            title: serviceTitle(proposal.payload.service_id),
            coverage: proposal.payload.coverage,
            status: 'proposed' as const,
          })),
      ];

      const sourceProposal = proposalById.get(current.createdFromProposalId);
      const alerts: ConsistencyAlert[] =
        sourceProposal?.payload?.consistency_alerts ?? current.consistencyAlerts ?? [];

      for (const mapping of current.termMappings ?? []) {
        const key = `${mapping.customerTerm.toLowerCase()}→${mapping.ourTerm.toLowerCase()}`;
        const entry = termCounts.get(key) ?? { customerTerm: mapping.customerTerm, ourTerm: mapping.ourTerm, count: 0 };
        entry.count++;
        termCounts.set(key, entry);
      }

      rows.push({
        id: requirement.id,
        proposalId: sourceProposal?.id ?? current.createdFromProposalId,
        earsText: current.earsText,
        domainText: current.domainText,
        modality: current.modality,
        category: current.category,
        verdict,
        verdictStatus: approved ? 'approved' : proposed ? 'proposed' : 'none',
        justification: verdictSource?.justification,
        deviation: verdictSource?.deviation ?? undefined,
        riskNote: verdictSource?.riskNote ?? verdictSource?.risk_note ?? undefined,
        services: serviceRows,
        alerts,
        ambiguities: current.ambiguities ?? [],
        document: current.sourceRef?.document,
        page: current.sourceRef?.page,
      });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    // aggregates
    const verdicts = emptyVerdicts();
    const byCategory: AnalysisReportData['byCategory'] = {};
    let mappedFull = 0;
    let mappedPartial = 0;
    let unmapped = 0;
    const unmappedMandatory: AnalysisReportData['unmappedMandatory'] = [];
    const internalQuestions: AnalysisReportData['internalQuestions'] = [];
    const clarifications: AnalysisReportData['clarifications'] = [];
    const consistencyAlerts: AnalysisReportData['consistencyAlerts'] = [];

    for (const row of rows) {
      verdicts[row.verdict]++;
      const category = (byCategory[row.category] ??= { total: 0, verdicts: emptyVerdicts() });
      category.total++;
      category.verdicts[row.verdict]++;
      if (row.services.some((service) => service.coverage === 'full')) mappedFull++;
      else if (row.services.some((service) => service.coverage === 'partial')) mappedPartial++;
      else {
        unmapped++;
        if (row.modality === 'mandatory' && row.verdict !== 'FULL') {
          unmappedMandatory.push({ requirementId: row.id, earsText: row.earsText });
        }
      }
      const question =
        (approvedVerdicts.get(row.id)?.internalQuestion ?? proposedVerdicts.get(row.id)?.payload?.internal_question) ?? null;
      if (row.verdict === 'NEEDS_INPUT' && question?.question) {
        internalQuestions.push({ requirementId: row.id, question: question.question, ownerRole: question.owner_role ?? '' });
      }
      for (const ambiguity of row.ambiguities) {
        if (!ambiguity.clarification_question_draft) continue;
        clarifications.push({
          requirementId: row.id,
          document: row.document ?? '',
          section: '',
          question: ambiguity.clarification_question_draft,
          type: ambiguity.type,
        });
      }
      for (const alert of row.alerts) {
        consistencyAlerts.push({ ...alert, proposalId: row.proposalId ?? '', requirementId: row.id });
        // Resolving an alert as "clarify" already injects a drafted bidder
        // question into the card's ambiguities (see resolveAlert), which the
        // loop above collects. Only synthesise a question for an alert nobody
        // has decided yet — otherwise every resolved contradiction produced
        // two near-identical questions in the report.
        if (!alert.resolution) {
          clarifications.push({
            requirementId: row.id,
            document: row.document ?? '',
            section: `${alert.sheet}!${alert.cell}`,
            question:
              `Bitte bestätigen Sie den gültigen Wert für „${alert.label}“: die Leistungsbeschreibung nennt ` +
              `${alert.tenderRaw}, das Mengengerüst (${alert.sheet}!${alert.cell}) nennt ${formatNumber(alert.excelValue, alert.excelUnit)}.`,
            type: 'figure_contradiction_unresolved',
          });
        }
      }
    }

    // alerts on cards of this run that were not approved (still count for the reader)
    const openReviews = run.extraction.proposalIds.filter(
      (id) => proposalById.get(id)?.status === 'proposed',
    ).length;
    for (const proposalId of runProposalIds) {
      const proposal = proposalById.get(proposalId);
      if (!proposal || proposal.status === 'approved') continue;
      for (const alert of proposal.payload?.consistency_alerts ?? []) {
        if (proposal.status === 'rejected') continue;
        consistencyAlerts.push({ ...alert, proposalId });
      }
    }
    const unresolvedAlerts = consistencyAlerts.filter((alert) => !alert.resolution).length;
    const decided = rows.length;
    const fulfilmentScore = decided === 0 ? 0 : Math.round(((verdicts.FULL + 0.5 * verdicts.PARTIAL) / decided) * 100);
    const reliable = clarifications.length === 0 && internalQuestions.length === 0 && unresolvedAlerts === 0;

    const documents = (await this.repository.listDocuments(project))
      .filter((document) => document.kind === 'tender')
      .map((document) => ({ docId: document.id, title: document.title, sections: document.sectionCount }));

    return {
      tender,
      runId: run.runId,
      generatedAt: new Date().toISOString(),
      language,
      reliable,
      documents,
      kpis: {
        requirements: rows.length,
        mandatory: rows.filter((row) => row.modality === 'mandatory').length,
        target: rows.filter((row) => row.modality === 'target').length,
        optional: rows.filter((row) => row.modality === 'optional').length,
        verdicts,
        mappedFull,
        mappedPartial,
        unmapped,
        unmappedMandatory: unmappedMandatory.length,
        alerts: consistencyAlerts.length,
        unresolvedAlerts,
        clarifications: clarifications.length,
        internalQuestions: internalQuestions.length,
        fulfilmentScore,
        openReviews,
      },
      requirements: rows,
      byCategory,
      consistencyAlerts,
      clarifications,
      internalQuestions,
      unmappedMandatory,
      termMappings: [...termCounts.values()].sort((a, b) => b.count - a.count),
    };
  }

  // ---------------------------------------------------------------------------
  // Deterministic blocks (markdown)
  // ---------------------------------------------------------------------------

  renderBlocks(data: AnalysisReportData): Record<BlockName, string> {
    const k = data.kpis;
    const kpis = [
      '| Kennzahl | Wert |',
      '|---|---|',
      `| Anforderungen gesamt | ${k.requirements} |`,
      `| davon MUSS / SOLL / KANN | ${k.mandatory} / ${k.target} / ${k.optional} |`,
      `| erfüllt | ${k.verdicts.FULL} |`,
      `| teilweise erfüllt | ${k.verdicts.PARTIAL} |`,
      `| nicht erfüllt | ${k.verdicts.NON_COMPLIANT} |`,
      `| intern zu klären | ${k.verdicts.NEEDS_INPUT} |`,
      `| noch ohne Bewertung | ${k.verdicts.PENDING} |`,
      `| Erfüllungsgrad (erfüllt = 1, teilweise = 0,5) | ${k.fulfilmentScore} % |`,
      `| Anforderungen ohne Katalog-Zuordnung | ${k.unmapped} (davon MUSS: ${k.unmappedMandatory}) |`,
      `| Zahlenwidersprüche Text ↔ Mengengerüst | ${k.alerts} (ungeklärt: ${k.unresolvedAlerts}) |`,
      `| Klärungsfragen an den Kunden | ${k.clarifications} |`,
      `| Interne Rückfragen | ${k.internalQuestions} |`,
      `| Anforderungskarten noch in Prüfung | ${k.openReviews} |`,
    ].join('\n');

    const verdictMatrix = [
      '| ID | Anforderung | Modalität | Bewertung | Katalog-Services | Abweichung |',
      '|---|---|---|---|---|---|',
      ...data.requirements.map((row) => {
        const services = row.services
          .map((service) => `${md(service.title)} (${service.coverage}${service.status === 'proposed' ? ', vorgeschlagen' : ''})`)
          .join('; ');
        const verdict = `${VERDICT_LABEL[row.verdict]}${row.verdictStatus === 'proposed' ? ' *' : ''}`;
        return `| ${row.id} | ${md(truncate(row.domainText ?? row.earsText, 160))} | ${MODALITY_LABEL[row.modality]} | ${verdict} | ${services || '—'} | ${md(truncate(row.deviation ?? '', 120)) || '—'} |`;
      }),
      '',
      '\\* Bewertung vom Agenten vorgeschlagen, noch nicht freigegeben.',
    ].join('\n');

    const byCategory = [
      '| Leistungsbereich | gesamt | erfüllt | teilweise | nicht erfüllt | intern zu klären | offen |',
      '|---|---|---|---|---|---|---|',
      ...Object.entries(data.byCategory)
        .sort((a, b) => b[1].total - a[1].total)
        .map(
          ([category, entry]) =>
            `| ${category} | ${entry.total} | ${entry.verdicts.FULL} | ${entry.verdicts.PARTIAL} | ${entry.verdicts.NON_COMPLIANT} | ${entry.verdicts.NEEDS_INPUT} | ${entry.verdicts.PENDING} |`,
        ),
    ].join('\n');

    const resolutionLabel: Record<string, string> = {
      tender: 'Wert der Leistungsbeschreibung übernommen',
      excel: 'Wert des Mengengerüsts übernommen',
      clarify: 'beim Kunden zu klären',
    };
    const alerts =
      data.consistencyAlerts.length === 0
        ? '_Keine Widersprüche zwischen den Dokumenten und dem Mengengerüst festgestellt._'
        : [
            '| Kennzahl | Leistungsbeschreibung | Mengengerüst | Abweichung | Status |',
            '|---|---|---|---|---|',
            ...data.consistencyAlerts.map(
              (alert) =>
                `| ${md(alert.label)}${alert.requirementId ? ` (${alert.requirementId})` : ''} | ${md(alert.tenderRaw)} | ${formatNumber(alert.excelValue, alert.excelUnit)} (${alert.sheet}!${alert.cell}) | ${alert.deviationPct.toLocaleString('de-DE')} % | ${alert.resolution ? resolutionLabel[alert.resolution] : '**ungeklärt**'} |`,
            ),
          ].join('\n');

    const clarifications =
      data.clarifications.length === 0
        ? '_Keine offenen Klärungsfragen an den Kunden._'
        : data.clarifications
            .map(
              (item, index) =>
                `${index + 1}. ${item.question}${item.requirementId ? ` _(${item.requirementId}${item.section ? `, ${item.section}` : ''})_` : ''}`,
            )
            .join('\n');

    const internalQuestions =
      data.internalQuestions.length === 0
        ? '_Keine internen Rückfragen._'
        : [
            '| Anforderung | Frage | Verantwortlich |',
            '|---|---|---|',
            ...data.internalQuestions.map((item) => `| ${item.requirementId} | ${md(item.question)} | ${md(item.ownerRole)} |`),
          ].join('\n');

    const unmappedMandatory =
      data.unmappedMandatory.length === 0
        ? '_Alle MUSS-Anforderungen sind einem Katalog-Service zugeordnet._'
        : data.unmappedMandatory.map((item) => `- **${item.requirementId}** — ${truncate(item.earsText, 200)}`).join('\n');

    const terms =
      data.termMappings.length === 0
        ? '_Keine abweichende Kundenterminologie erkannt._'
        : [
            '| Kundenbegriff | Unser Begriff | Vorkommen |',
            '|---|---|---|',
            ...data.termMappings.map((item) => `| ${md(item.customerTerm)} | ${md(item.ourTerm)} | ${item.count} |`),
          ].join('\n');

    const reliability = data.reliable
      ? '> ✅ **Analyse belastbar** — keine offenen Kundenklärungen, keine internen Rückfragen, keine ungeklärten Widersprüche.'
      : `> ⚠️ **Analyse mit Vorbehalten** — ${data.kpis.clarifications} Klärungsfrage(n) an den Kunden, ${data.kpis.internalQuestions} interne Rückfrage(n), ${data.kpis.unresolvedAlerts} ungeklärte(r) Zahlenwiderspruch/-sprüche. Die Bewertung gilt unter diesen Vorbehalten.`;

    return {
      kpis,
      verdict_matrix: verdictMatrix,
      by_category: byCategory,
      alerts,
      clarifications,
      internal_questions: internalQuestions,
      unmapped_mandatory: unmappedMandatory,
      terms,
      reliability,
    };
  }

  /** Replace block tokens; append blocks the narrative did not place so nothing is lost. */
  private substituteBlocks(markdown: string, blocks: Record<BlockName, string>): string {
    const used = new Set<string>();
    let output = markdown.replace(BLOCK_TOKEN_RE, (_token, name: string) => {
      if (!(name in blocks)) return '';
      used.add(name);
      return blocks[name as BlockName];
    });
    const appendix: string[] = [];
    const titles: Record<BlockName, string> = {
      kpis: 'Kennzahlen',
      verdict_matrix: 'Bewertungsmatrix',
      by_category: 'Erfüllungsgrad je Leistungsbereich',
      alerts: 'Zahlenwidersprüche',
      clarifications: 'Klärungsbedarf beim Kunden',
      internal_questions: 'Interne offene Punkte',
      unmapped_mandatory: 'MUSS-Anforderungen ohne Katalog-Zuordnung',
      terms: 'Terminologie-Abgleich',
      reliability: 'Belastbarkeit',
    };
    for (const name of BLOCK_NAMES) {
      if (used.has(name)) continue;
      appendix.push(`### ${titles[name]}\n\n${blocks[name]}`);
    }
    if (appendix.length > 0) output += `\n\n## Anhang\n\n${appendix.join('\n\n')}\n`;
    return output;
  }

  /** Narrative-free document (used when the LLM is unavailable or fails). */
  private deterministicDocument(template: string, data: AnalysisReportData, blocks: Record<BlockName, string>): string {
    const title = `# Management-Analyse — ${data.tender?.title ?? data.runId}`;
    const intro = `${blocks.reliability}\n\n_Automatisch erzeugt am ${data.generatedAt.slice(0, 10)} (Lauf ${data.runId}); die Erzählteile konnten nicht generiert werden — Kennzahlen und Tabellen sind vollständig._`;
    const body = template.replace(/^#\s+.*$/m, '').trim();
    return this.substituteBlocks(`${title}\n\n${intro}\n\n${body}`, blocks);
  }

  // ---------------------------------------------------------------------------
  // Generate: narrative + files
  // ---------------------------------------------------------------------------

  async generate(
    project: string,
    run: AnalysisRunState,
    requirementIds: string[],
    template?: string,
  ): Promise<NonNullable<AnalysisRunState['report']> & { data: AnalysisReportData }> {
    const data = await this.assemble(project, run, requirementIds);
    const blocks = this.renderBlocks(data);
    const templateText = template?.trim() ? template : DEFAULT_TEMPLATE;

    let markdown: string;
    let narrativeOk = false;
    let narrative: AnalysisNarrative | null = null;
    try {
      const prompt = loadPrompt('p-analysis.v1');
      const agentRun = await this.runs.start(project, {
        pipeline: 'analysis-report',
        promptVersion: prompt.version,
        promptHash: prompt.hash,
        model: this.llm.getModelId('regular'),
      });
      const compactData = {
        ...data,
        requirements: data.requirements.map((row) => ({
          id: row.id,
          text: row.domainText ?? row.earsText,
          modality: row.modality,
          category: row.category,
          verdict: row.verdict,
          verdictStatus: row.verdictStatus,
          justification: row.justification,
          deviation: row.deviation,
          riskNote: row.riskNote,
          services: row.services.map((service) => `${service.title} (${service.coverage})`),
          alerts: row.alerts.length,
          ambiguities: row.ambiguities.map((ambiguity) => ambiguity.type),
        })),
      };
      const outcome = await runStructured(this.llm, {
        schema: analysisNarrativeSchema,
        systemPrompt: renderPrompt(prompt, { language: data.language }),
        userMessage: `<template>\n${templateText}\n</template>\n\n<data>\n${JSON.stringify(compactData, null, 1)}\n</data>`,
        tier: 'regular',
        temperature: 0.2,
        maxOutputTokens: 12000,
        postValidators: [
          (result: AnalysisNarrative) => {
            const tokens = [...result.markdown.matchAll(BLOCK_TOKEN_RE)].map((match) => match[1]);
            const unknown = tokens.filter((token) => !(BLOCK_NAMES as readonly string[]).includes(token));
            if (unknown.length > 0) return `Unknown block token(s): ${unknown.join(', ')}. Use only the documented tokens.`;
            if (!tokens.includes('kpis')) return 'The document must contain {{block:kpis}}.';
            if (!tokens.includes('clarifications')) return 'The document must contain {{block:clarifications}}.';
            return null;
          },
        ],
      });
      if (outcome.ok && outcome.data) {
        narrative = outcome.data;
        markdown = this.substituteBlocks(outcome.data.markdown, blocks);
        narrativeOk = true;
        await this.runs.finish(project, agentRun, 'ok');
      } else {
        this.logger.warn(`P-ANALYSIS failed for ${project}: ${outcome.error}`);
        markdown = this.deterministicDocument(templateText, data, blocks);
        await this.runs.finish(project, agentRun, 'failed');
      }
    } catch (error: any) {
      this.logger.warn(`P-ANALYSIS unavailable for ${project}: ${error.message}`);
      markdown = this.deterministicDocument(templateText, data, blocks);
    }

    const base = `out/analysis/${slug(data.tender?.key ?? project)}-analysis`;
    const markdownPath = `${base}.md`;
    const snapshotPath = `${base}.snapshot.json`;
    await this.files.writeProjectFile(project, markdownPath, markdown);
    await this.files.writeProjectFile(
      project,
      snapshotPath,
      JSON.stringify({ data, narrative, narrativeOk, blocks }, null, 2),
    );
    await this.files.writeFile(project, `analysis/${run.runId}/report.md`, markdown);
    await this.files.writeJson(project, `analysis/${run.runId}/report.json`, { data, narrative, narrativeOk });

    let docxPath: string | undefined;
    try {
      const buffer = await this.content.exportMarkdownToDocxBuffer(markdown);
      docxPath = `${base}.docx`;
      await this.files.writeProjectFile(project, docxPath, buffer);
      await this.files.writeFile(project, `analysis/${run.runId}/report.docx`, buffer);
    } catch (error: any) {
      this.logger.warn(`DOCX rendering failed for ${project}: ${error.message}`);
    }

    const report = {
      markdownPath,
      docxPath,
      snapshotPath,
      generatedAt: data.generatedAt,
      reliable: data.reliable,
      narrativeOk,
    };
    await this.events.emit(project, 'analysis.report_ready', { runId: run.runId, ...report });
    return { ...report, data };
  }
}
