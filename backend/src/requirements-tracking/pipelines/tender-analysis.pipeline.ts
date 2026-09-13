import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { Subscription } from 'rxjs';
import { IngestionService } from '../ingestion.service';
import { ExtractionPipeline } from './extraction.pipeline';
import { CatalogImportPipeline } from './catalog-import.pipeline';
import { AutoMappingPipeline } from './auto-mapping.pipeline';
import { CompliancePipeline } from './compliance.pipeline';
import { ProposalService } from '../proposal.service';
import { TtCatalogService } from '../catalog.service';
import { TtRepository } from '../graph/tt-repository';
import { TtSnapshotService } from '../graph/tt-snapshot';
import { TtFilesService } from '../store/files.service';
import { TtEventsService } from '../events.service';
import { GlossaryService } from '../analysis/glossary.service';
import { ExcelFigureService, Figure } from '../analysis/excel-figures';
import { ConsistencyCheckService } from '../analysis/consistency-check';
import { CatalogEarsService } from '../analysis/catalog-ears.service';
import { AnalysisReportService } from '../analysis/analysis-report.service';
import { normalizeUnit } from '../analysis/units';
import {
  AnalysisFileState,
  AnalysisOptions,
  AnalysisReadiness,
  AnalysisRunState,
  AnalysisStage,
  AnalysisStatusPayload,
  AnalysisStep,
} from '../analysis/analysis-types';
import { ConsistencyAlert, FeedEvent, Proposal } from '../types/tendertrace-types';

/**
 * Tender analysis orchestrator — the two-phase run behind the cockpit.
 *
 * Phase A (automated): discover tender/ + servicecatalog/ + analysis-template/
 *   → register + parse every tender file → figure index from workbooks →
 *   glossary from the catalog → EARS extraction (domain_text in our
 *   vocabulary) → Excel consistency check → catalog import + publish +
 *   capability statements → *awaiting review*.
 * Human gate: extraction cards are approved in the Review Queue, figure
 *   contradictions are resolved in the cockpit.
 * Phase B (explicit trigger): clear-match auto-mapping → compliance verdicts
 *   → management analysis (Markdown + DOCX). Mappings and verdicts stay
 *   proposals — nothing is decided on the agent's authority.
 *
 * State lives in requirements-tracking/analysis/<runId>/state.json; every
 * step reports percent + label + file through `analysis.progress` events.
 */

const TENDER_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.odt', '.rtf', '.pptx', '.xlsx', '.xlsm', '.xls', '.md', '.txt',
]);
const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls']);
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;
/** written while a single long call is in flight, so a live run never looks abandoned */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * A run counts as live only while it is `running` AND its heartbeat is fresh.
 * Every guard (pipeline, MCP tool, REST controller) must use THIS predicate:
 * `getStatus` is a pure read and never flips an abandoned run to `failed`, so
 * a status-only check would block new runs forever after a crash.
 */
export function isRunLive(state: { status?: string; heartbeatAt?: string } | null | undefined): boolean {
  if (!state || state.status !== 'running' || !state.heartbeatAt) return false;
  return Date.now() - Date.parse(state.heartbeatAt) < HEARTBEAT_STALE_MS;
}
const PROGRESS_THROTTLE_MS = 300;
const CATALOG_SOURCE_PATH = 'analysis/catalog-source.json';
const CURRENT_PATH = 'analysis/current.json';

const STEP_RANGES: Record<AnalysisStep, [number, number]> = {
  discover: [0, 3],
  parse: [3, 18],
  figures: [18, 21],
  glossary: [21, 25],
  extract: [25, 50],
  consistency: [50, 54],
  catalog: [54, 58],
  capabilities: [58, 60],
  awaiting_review: [60, 60],
  mapping: [60, 80],
  compliance: [80, 95],
  report: [95, 100],
  done: [100, 100],
};

const STEP_LABELS: Record<AnalysisStep, string> = {
  discover: 'Dateien ermitteln',
  parse: 'Dokument einlesen',
  figures: 'Kennzahlen aus dem Mengengerüst indexieren',
  glossary: 'Glossar aus dem Leistungskatalog bilden',
  extract: 'Anforderungen (EARS) extrahieren',
  consistency: 'Zahlen gegen das Mengengerüst prüfen',
  catalog: 'Leistungskatalog importieren',
  capabilities: 'Leistungskatalog in EARS überführen',
  awaiting_review: 'Wartet auf Prüfung der Anforderungen',
  mapping: 'Abgleich Anforderungen ↔ Leistungskatalog',
  compliance: 'Erfüllungsgrad bewerten',
  report: 'Management-Analyse erzeugen',
  done: 'Abgeschlossen',
};

interface SubProgressContext {
  docIndex: number;
  docCount: number;
}

@Injectable()
export class TenderAnalysisPipeline {
  private readonly logger = new Logger(TenderAnalysisPipeline.name);
  private readonly subContext = new Map<string, SubProgressContext>();
  private readonly lastEmit = new Map<string, number>();
  private readonly readyWatchers = new Map<string, Subscription>();

  constructor(
    private readonly ingestion: IngestionService,
    private readonly extraction: ExtractionPipeline,
    private readonly catalogImport: CatalogImportPipeline,
    private readonly autoMapping: AutoMappingPipeline,
    private readonly compliance: CompliancePipeline,
    private readonly proposals: ProposalService,
    private readonly catalog: TtCatalogService,
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly files: TtFilesService,
    private readonly events: TtEventsService,
    private readonly glossary: GlossaryService,
    private readonly excelFigures: ExcelFigureService,
    private readonly consistency: ConsistencyCheckService,
    private readonly catalogEars: CatalogEarsService,
    private readonly report: AnalysisReportService,
  ) {}

  // ---------------------------------------------------------------------------
  // Phase A
  // ---------------------------------------------------------------------------

  async runPhaseA(project: string, opts: AnalysisOptions = {}): Promise<AnalysisRunState> {
    await this.assertNoLiveRun(project);
    const tender = await this.repository.getTenderMeta(project);
    const runId = await this.repository.nextKey(project, 'analysisRun', 'AN-', 3);
    const now = new Date().toISOString();
    const state: AnalysisRunState = {
      schema: 'tendertrace.analysis.v1',
      runId,
      tenderKey: tender?.key ?? project,
      status: 'running',
      phase: 'A',
      percent: 0,
      step: 'discover',
      stepLabel: STEP_LABELS.discover,
      startedAt: now,
      updatedAt: now,
      heartbeatAt: now,
      options: {
        force: Boolean(opts.force),
        minMappingConfidence: opts.minMappingConfidence ?? 0.75,
        language: opts.language ?? tender?.language ?? 'de',
        autoPublishCatalog: opts.autoPublishCatalog ?? true,
        extractWorkbooks: Boolean(opts.extractWorkbooks),
      },
      inputs: { tenderDir: 'tender', catalogFiles: [] },
      files: [],
      extraction: { proposalIds: [], failedChunks: 0, mergeCandidates: 0, documents: 0 },
      figures: { count: 0 },
      glossary: { terms: 0 },
      consistency: { checked: 0, matched: 0, alerts: [] },
      catalog: { serviceIds: [], published: 0, capabilities: 0, skipped: false },
      review: { open: 0, approved: 0, rejected: 0, total: 0 },
      agentRunIds: [],
      errors: [],
    };
    await this.files.writeJson(project, CURRENT_PATH, { runId });
    await this.saveState(project, state);
    await this.events.emit(project, 'analysis.started', { runId, phase: 'A' });

    const subscription = this.subscribeSubProgress(project, state);
    try {
      await this.discover(project, state);
      await this.parseAll(project, state);
      const figures = await this.buildFigures(project, state);
      const glossaryText = await this.buildGlossary(project, state);
      await this.extractAll(project, state, glossaryText);
      await this.checkConsistency(project, state, figures);
      await this.importCatalog(project, state);

      state.status = 'awaiting_review';
      state.phase = 'A';
      await this.refreshReview(project, state);
      await this.progress(project, state, { step: 'awaiting_review', fraction: 1, currentFile: undefined, message: undefined });
      await this.events.emit(project, 'analysis.phase_changed', {
        runId,
        phase: 'A',
        status: state.status,
        openProposals: state.review.open,
        alerts: state.consistency.alerts.length,
      });
      this.watchReadiness(project);
      await this.maybeEmitReady(project);
    } catch (error: any) {
      await this.fail(project, state, 'A', error);
      throw error;
    } finally {
      subscription.unsubscribe();
      this.subContext.delete(runId);
    }
    return state;
  }

  private async discover(project: string, state: AnalysisRunState): Promise<void> {
    await this.progress(project, state, { step: 'discover', fraction: 0, message: 'tender/, servicecatalog/, analysis-template/' });
    const tenderNames = (await this.files.listProjectDir(project, 'tender')).filter(
      (name) => !name.startsWith('~$') && !name.startsWith('.') && TENDER_EXTENSIONS.has(path.extname(name).toLowerCase()),
    );
    const catalogNames = (await this.files.listProjectDir(project, 'servicecatalog')).filter(
      (name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'glossary.md',
    );
    const hasGlossary = await this.files.projectFileExists(project, 'servicecatalog/glossary.md');
    const templateNames = (await this.files.listProjectDir(project, 'analysis-template')).filter((name) =>
      name.toLowerCase().endsWith('.md'),
    );

    const describe = async (
      folder: string,
      name: string,
      kind: AnalysisFileState['kind'],
    ): Promise<AnalysisFileState> => ({
      name,
      projectPath: `${folder}/${name}`,
      kind,
      ext: path.extname(name).toLowerCase(),
      sha256: await this.files.projectFileSha256(project, `${folder}/${name}`),
      status: 'pending',
    });

    state.files = [];
    for (const name of tenderNames) state.files.push(await describe('tender', name, 'tender'));
    for (const name of catalogNames) state.files.push(await describe('servicecatalog', name, 'catalog'));
    if (hasGlossary) state.files.push(await describe('servicecatalog', 'glossary.md', 'glossary'));
    if (templateNames[0]) state.files.push(await describe('analysis-template', templateNames[0], 'template'));

    state.inputs = {
      tenderDir: 'tender',
      catalogFiles: catalogNames.map((name) => `servicecatalog/${name}`),
      glossaryFile: hasGlossary ? 'servicecatalog/glossary.md' : undefined,
      templateFile: templateNames[0] ? `analysis-template/${templateNames[0]}` : undefined,
    };
    if (tenderNames.length === 0) {
      throw new Error('Keine Ausschreibungsunterlagen im Ordner tender/ gefunden (PDF, Word, Excel).');
    }
    if (catalogNames.length === 0) {
      state.errors.push({ step: 'discover', error: 'Kein Leistungskatalog (servicecatalog/*.md) gefunden — Abgleich und Glossar entfallen.', at: new Date().toISOString(), severity: 'notice' });
    }
    await this.progress(project, state, { step: 'discover', fraction: 1, message: `${tenderNames.length} Ausschreibungsdatei(en), ${catalogNames.length} Katalogdatei(en)` });
  }

  private async parseAll(project: string, state: AnalysisRunState): Promise<void> {
    const tenderFiles = state.files.filter((file) => file.kind === 'tender');
    const existing = await this.repository.listDocuments(project);
    for (let index = 0; index < tenderFiles.length; index++) {
      const file = tenderFiles[index];
      await this.progress(project, state, {
        step: 'parse',
        fraction: index / tenderFiles.length,
        currentFile: file.name,
        message: `Datei ${index + 1} von ${tenderFiles.length}`,
      });
      try {
        let document = existing.find((doc) => doc.kind === 'tender' && doc.sha256 === file.sha256);
        if (document) {
          file.reason = 'bereits registriert (gleicher Inhalt)';
        } else {
          document = await this.ingestion.registerDocument(project, {
            projectRelativePath: file.projectPath,
            title: path.basename(file.name, path.extname(file.name)),
            kind: 'tender',
          });
        }
        file.docId = document.id;
        file.status = 'registered';
        if (document.parseStatus !== 'parsed' || state.options.force) {
          document = await this.ingestion.parseDocument(project, document.id);
        }
        file.sections = document.sectionCount;
        file.pageSource = document.pageSource;
        if (document.parseStatus === 'parsed') file.status = 'parsed';
        else if (document.parseStatus === 'needs_ocr') {
          file.status = 'needs_ocr';
          file.error = 'Kein Text erkennbar (OCR erforderlich)';
        } else {
          file.status = 'failed';
          file.error = document.parseNotes ?? `Parse-Status ${document.parseStatus}`;
        }
      } catch (error: any) {
        file.status = 'failed';
        file.error = error.message;
        state.errors.push({ step: 'parse', file: file.name, error: error.message, at: new Date().toISOString() });
      }
      await this.saveState(project, state);
    }
    this.snapshots.invalidate(project);
    await this.progress(project, state, { step: 'parse', fraction: 1, currentFile: undefined, message: `${tenderFiles.filter((f) => f.status === 'parsed').length} von ${tenderFiles.length} Dateien gelesen` });
  }

  private async buildFigures(project: string, state: AnalysisRunState): Promise<Figure[]> {
    await this.progress(project, state, { step: 'figures', fraction: 0 });
    const figures: Figure[] = [];
    for (const file of state.files) {
      if (file.kind !== 'tender' || !file.docId || file.status !== 'parsed') continue;
      const cells = await this.ingestion.getCells(project, file.docId);
      if (cells.length === 0) continue;
      await this.progress(project, state, { step: 'figures', fraction: 0.5, currentFile: file.name });
      const index = this.excelFigures.buildIndex(cells);
      file.figures = index.length;
      figures.push(...index);
    }
    const figuresPath = `analysis/${state.runId}/figures.json`;
    await this.files.writeJson(project, figuresPath, figures);
    state.figures = { count: figures.length, path: figuresPath };
    await this.progress(project, state, { step: 'figures', fraction: 1, currentFile: undefined, message: `${figures.length} Kennzahlen indexiert` });
    return figures;
  }

  /**
   * Reject catalog-import proposals left undecided by an earlier run: the
   * current run creates its own import, so the old cards can never be
   * published and would only clutter the wizard and the open-work counts.
   */
  private async rejectOrphanedImports(project: string, state: AnalysisRunState): Promise<void> {
    const open = await this.repository.listProposals(project, { kind: 'catalog_import', status: 'proposed' });
    let rejected = 0;
    for (const proposal of open) {
      const decided = await this.proposals.decide(project, proposal.id, {
        decision: 'rejected',
        actor: 'analysis',
        resolutionNote: `Verworfen durch Lauf ${state.runId}: Import ${proposal.payload?.importId ?? '?'} wurde nicht abgeschlossen.`,
      });
      if (decided.success) rejected++;
    }
    if (rejected > 0) {
      state.errors.push({
        step: 'catalog',
        error: `${rejected} unentschiedene Katalog-Importkarte(n) eines früheren Laufs verworfen.`,
        at: new Date().toISOString(),
        severity: 'notice',
      });
    }
  }

  private async catalogMarkdown(project: string, state: AnalysisRunState): Promise<string> {
    const parts: string[] = [];
    for (const file of state.inputs.catalogFiles) {
      parts.push(await this.files.readProjectText(project, file));
    }
    return parts.join('\n\n---\n\n');
  }

  private async buildGlossary(project: string, state: AnalysisRunState): Promise<string> {
    await this.progress(project, state, { step: 'glossary', fraction: 0 });
    const catalogMd = await this.catalogMarkdown(project, state);
    if (!catalogMd.trim()) {
      state.glossary = { terms: 0 };
      await this.progress(project, state, { step: 'glossary', fraction: 1, message: 'kein Leistungskatalog — ohne Glossar' });
      return '';
    }
    const userMd = state.inputs.glossaryFile
      ? await this.files.readProjectText(project, state.inputs.glossaryFile)
      : undefined;
    try {
      const built = await this.glossary.build(project, catalogMd, userMd, {
        force: state.options.force,
        language: state.options.language,
      });
      if (built.runId) state.agentRunIds.push(built.runId);
      state.glossary = { terms: built.glossary.terms.length, path: 'analysis/glossary.json', cached: built.cached };
      await this.progress(project, state, {
        step: 'glossary',
        fraction: 1,
        message: `${built.glossary.terms.length} Begriffe${built.cached ? ' (aus Cache)' : ''}`,
      });
      return this.glossary.render(built.glossary);
    } catch (error: any) {
      state.errors.push({ step: 'glossary', error: error.message, at: new Date().toISOString() });
      await this.progress(project, state, { step: 'glossary', fraction: 1, message: `Glossar fehlgeschlagen: ${error.message}` });
      return '';
    }
  }

  private async extractAll(project: string, state: AnalysisRunState, glossaryText: string): Promise<void> {
    const candidates = state.files.filter(
      (file) =>
        file.kind === 'tender' &&
        file.status === 'parsed' &&
        (state.options.extractWorkbooks || !WORKBOOK_EXTENSIONS.has(file.ext)),
    );
    for (const file of state.files) {
      if (file.kind === 'tender' && file.status === 'parsed' && WORKBOOK_EXTENSIONS.has(file.ext) && !state.options.extractWorkbooks) {
        file.reason = 'Mengengerüst: nur Kennzahlen-Index, keine Extraktion';
      }
    }
    const existing = await this.repository.listProposals(project, { kind: 'extraction' });
    state.extraction.documents = candidates.length;
    await this.progress(project, state, { step: 'extract', fraction: 0 });

    for (let index = 0; index < candidates.length; index++) {
      const file = candidates[index];
      this.subContext.set(state.runId, { docIndex: index, docCount: candidates.length });
      await this.progress(project, state, {
        step: 'extract',
        fraction: index / candidates.length,
        currentFile: file.name,
        message: `Dokument ${index + 1} von ${candidates.length}`,
      });
      const prior = existing.filter((proposal) => proposal.payload?.source?.documentId === file.docId);
      if (prior.length > 0 && !state.options.force) {
        file.status = 'extracted';
        file.reason = `bereits extrahiert (${prior.length} Karten)`;
        file.proposals = prior.length;
        state.extraction.proposalIds.push(...prior.map((proposal) => proposal.id));
        await this.saveState(project, state);
        continue;
      }
      file.status = 'extracting';
      try {
        const result = await this.extraction.run(project, file.docId!, { glossaryText, runTag: state.runId });
        file.status = 'extracted';
        file.proposals = result.proposalIds.length;
        file.chunks = result.chunks;
        state.extraction.failedChunks += result.failedChunks;
        state.extraction.proposalIds.push(...result.proposalIds);
        state.agentRunIds.push(result.runId);
        if (result.failedChunks > 0) {
          state.errors.push({ step: 'extract', file: file.name, error: `${result.failedChunks} Abschnitt(e) konnten nicht extrahiert werden`, at: new Date().toISOString() });
        }
      } catch (error: any) {
        file.status = 'failed';
        file.error = error.message;
        state.errors.push({ step: 'extract', file: file.name, error: error.message, at: new Date().toISOString() });
      }
      await this.saveState(project, state);
    }
    this.subContext.delete(state.runId);
    await this.progress(project, state, {
      step: 'extract',
      fraction: 1,
      currentFile: undefined,
      message: `${state.extraction.proposalIds.length} Anforderungen vorgeschlagen`,
    });
  }

  private async checkConsistency(project: string, state: AnalysisRunState, figures: Figure[]): Promise<void> {
    await this.progress(project, state, { step: 'consistency', fraction: 0 });
    if (figures.length === 0 || state.extraction.proposalIds.length === 0) {
      state.consistency = { checked: 0, matched: 0, alerts: [] };
      await this.progress(project, state, { step: 'consistency', fraction: 1, message: figures.length === 0 ? 'kein Mengengerüst — Prüfung entfällt' : 'keine Anforderungen' });
      return;
    }
    try {
      const result = await this.consistency.run(project, state.extraction.proposalIds, figures, {
        runTag: state.runId,
        onProgress: (step, total, message) =>
          this.progress(project, state, { step: 'consistency', fraction: step / total, message: `${message} (${step}/${total})` }),
      });
      state.consistency = { checked: result.checked, matched: result.matched, alerts: result.alerts };
      // per-file alert counts
      for (const alert of result.alerts) {
        const proposal = await this.repository.getProposal(project, alert.proposalId);
        const docId = proposal?.payload?.source?.documentId;
        const file = state.files.find((entry) => entry.docId === docId);
        if (file) file.alerts = (file.alerts ?? 0) + 1;
      }
      await this.progress(project, state, {
        step: 'consistency',
        fraction: 1,
        message: `${result.matched} Kennzahlen abgeglichen, ${result.alerts.length} Widerspruch/-sprüche`,
      });
    } catch (error: any) {
      state.errors.push({ step: 'consistency', error: error.message, at: new Date().toISOString() });
      await this.progress(project, state, { step: 'consistency', fraction: 1, message: `Prüfung fehlgeschlagen: ${error.message}` });
    }
  }

  private async importCatalog(project: string, state: AnalysisRunState): Promise<void> {
    await this.progress(project, state, { step: 'catalog', fraction: 0 });
    const catalogMd = await this.catalogMarkdown(project, state);
    if (!catalogMd.trim()) {
      state.catalog = { serviceIds: [], published: 0, capabilities: 0, skipped: true, reason: 'kein Leistungskatalog' };
      await this.progress(project, state, { step: 'capabilities', fraction: 1, message: 'kein Leistungskatalog' });
      return;
    }
    const sha256 = crypto.createHash('sha256').update(catalogMd).digest('hex');

    let serviceIds: string[] = [];
    let importId: string | undefined;
    let published = 0;
    let skipped = false;
    let reason: string | undefined;

    let prior: { sha256: string; importId?: string; serviceIds: string[] } | null = null;
    try {
      prior = await this.files.readJson(project, CATALOG_SOURCE_PATH);
    } catch {
      prior = null;
    }
    if (prior && prior.sha256 === sha256 && !state.options.force) {
      let allPublished = prior.serviceIds.length > 0;
      for (const serviceId of prior.serviceIds) {
        const bundle = await this.catalog.getWithBody(project, serviceId);
        if (!bundle || bundle.version.status !== 'published') allPublished = false;
      }
      if (allPublished) {
        serviceIds = prior.serviceIds;
        importId = prior.importId;
        skipped = true;
        reason = 'Leistungskatalog unverändert';
      }
    }

    if (!skipped) {
      try {
        const sourcePath = `analysis/${state.runId}/catalog-source.md`;
        await this.files.writeFile(project, sourcePath, catalogMd);
        // undecided imports of an earlier (crashed) run would otherwise linger
        // forever in the import wizard and double the Dashboard's open count
        await this.rejectOrphanedImports(project, state);
        const result = await this.withHeartbeat(project, state, () =>
          this.catalogImport.run(project, `requirements-tracking/${sourcePath}`),
        );
        importId = result.importId;
        state.agentRunIds.push(result.runId);
        await this.progress(project, state, { step: 'catalog', fraction: 0.5, message: `${result.proposalIds.length} Katalogeinträge erkannt` });

        for (const proposalId of result.proposalIds) {
          const proposal = await this.repository.getProposal(project, proposalId);
          if (!proposal) continue;
          if (!state.options.autoPublishCatalog) {
            reason = 'Einträge warten im Import-Assistenten auf Freigabe';
            continue;
          }
          const decision =
            proposal.payload?.catalog_action === 'update_of' && proposal.payload?.existing_key
              ? 'merged_as_version'
              : 'published';
          const decided = await this.proposals.decide(project, proposalId, { decision, actor: 'analysis' });
          if (decided.success && decided.effect?.serviceId) {
            serviceIds.push(decided.effect.serviceId);
            published++;
          } else if (decided.error) {
            state.errors.push({ step: 'catalog', error: `${proposal.payload?.title ?? proposalId}: ${decided.error}`, at: new Date().toISOString() });
          }
        }
        await this.files.writeJson(project, CATALOG_SOURCE_PATH, { sha256, importId, serviceIds, at: new Date().toISOString() });
      } catch (error: any) {
        state.errors.push({ step: 'catalog', error: error.message, at: new Date().toISOString() });
        reason = `Import fehlgeschlagen: ${error.message}`;
      }
    }

    state.catalog = { importId, serviceIds, published, capabilities: 0, skipped, reason };
    await this.progress(project, state, { step: 'capabilities', fraction: 0, message: `${serviceIds.length} Services` });
    if (serviceIds.length > 0) {
      try {
        const summary = await this.withHeartbeat(project, state, () =>
          this.catalogEars.ensureCapabilities(project, serviceIds, {
            force: state.options.force,
            onProgress: (step, total, message) =>
              this.progress(project, state, { step: 'capabilities', fraction: step / total, currentFile: message }),
          }),
        );
        state.catalog.capabilities = summary.statements;
        if (summary.failed > 0) {
          state.errors.push({ step: 'capabilities', error: `${summary.failed} Service(s) ohne EARS-Statements`, at: new Date().toISOString() });
        }
      } catch (error: any) {
        state.errors.push({ step: 'capabilities', error: error.message, at: new Date().toISOString() });
      }
    }
    await this.progress(project, state, {
      step: 'capabilities',
      fraction: 1,
      currentFile: undefined,
      message: `${serviceIds.length} Services, ${state.catalog.capabilities} EARS-Statements`,
    });
  }

  // ---------------------------------------------------------------------------
  // Phase B
  // ---------------------------------------------------------------------------

  async runPhaseB(
    project: string,
    runId?: string,
    opts: { allowOpen?: boolean } = {},
  ): Promise<AnalysisRunState> {
    const state = await this.loadState(project, runId);
    if (!state) throw new Error('Kein Analyse-Lauf vorhanden — bitte zuerst die Analyse starten.');
    if (isRunLive(state)) {
      throw new Error(`Analyse ${state.runId} läuft bereits.`);
    }
    await this.refreshReview(project, state);
    const unresolved = (await this.collectAlerts(project, state)).filter((alert) => !alert.resolution).length;
    if (!opts.allowOpen && (state.review.open > 0 || unresolved > 0)) {
      throw new Error(
        `Noch nicht bereit: ${state.review.open} offene Anforderungskarte(n), ${unresolved} ungeklärte(r) Widerspruch/-sprüche.`,
      );
    }

    state.status = 'running';
    state.phase = 'B';
    state.finishedAt = undefined;
    state.readyNotifiedAt = state.readyNotifiedAt ?? new Date().toISOString();
    await this.progress(project, state, { step: 'mapping', fraction: 0, currentFile: undefined, message: undefined });
    await this.events.emit(project, 'analysis.phase_changed', { runId: state.runId, phase: 'B', status: 'running' });

    const subscription = this.subscribeSubProgress(project, state);
    try {
      const requirementIds = await this.requirementIdsOfRun(project, state);
      if (requirementIds.length === 0) {
        throw new Error('Keine freigegebenen Anforderungen — bitte zuerst Karten in der Review-Queue freigeben.');
      }

      const mapping = await this.autoMapping.run(project, requirementIds, {
        minConfidence: state.options.minMappingConfidence,
        allowRelated: false,
        useDomainText: true,
        fallbackAllServices: true,
        runTag: state.runId,
      });
      state.agentRunIds.push(mapping.runId);
      state.mapping = {
        proposalIds: mapping.proposalIds,
        dropped: mapping.dropped,
        retrievalFallback: mapping.retrievalFallback,
        requirementIds,
      };
      if (mapping.retrievalFallback) {
        state.errors.push({ step: 'mapping', error: 'Vektorsuche lieferte keine Kandidaten — alle Services wurden direkt verglichen.', at: new Date().toISOString(), severity: 'notice' });
      }
      await this.progress(project, state, { step: 'mapping', fraction: 1, currentFile: undefined, message: `${mapping.proposalIds.length} klare Zuordnungen vorgeschlagen` });

      await this.progress(project, state, { step: 'compliance', fraction: 0 });
      const verdicts = await this.compliance.run(project, requirementIds, { runTag: state.runId });
      state.agentRunIds.push(verdicts.runId);
      state.compliance = { proposalIds: verdicts.proposalIds, verdicts: verdicts.verdicts };
      await this.progress(project, state, { step: 'compliance', fraction: 1, currentFile: undefined, message: `${verdicts.proposalIds.length} Bewertungen vorgeschlagen` });

      await this.generateReport(project, state, requirementIds);

      // housekeeping notices (orphan cleanup, retrieval fallback) are shown in
      // the Details panel but must not make a clean run look degraded
      const failures = this.realFailures(state);
      state.status = failures.length > 0 ? 'partial' : 'finished';
      state.finishedAt = new Date().toISOString();
      await this.progress(project, state, { step: 'done', fraction: 1, currentFile: undefined, message: state.report?.reliable ? 'Analyse belastbar' : 'Analyse mit Vorbehalten' });
      await this.events.emit(project, 'analysis.finished', {
        runId: state.runId,
        status: state.status,
        reportPath: state.report?.markdownPath,
        docxPath: state.report?.docxPath,
        reliable: state.report?.reliable,
        counts: { mappings: state.mapping.proposalIds.length, verdicts: state.compliance.verdicts },
      });
    } catch (error: any) {
      await this.fail(project, state, 'B', error);
      throw error;
    } finally {
      subscription.unsubscribe();
      this.subContext.delete(state.runId);
    }
    return state;
  }

  /** Re-render the management analysis over the current decisions (no new mapping/verdict run). */
  async regenerateReport(project: string, runId?: string): Promise<AnalysisRunState> {
    const state = await this.loadState(project, runId);
    if (!state) throw new Error('Kein Analyse-Lauf vorhanden.');
    if (!state.mapping) throw new Error('Der Abgleich (Phase B) wurde noch nicht ausgeführt.');
    const requirementIds = await this.requirementIdsOfRun(project, state);
    await this.generateReport(project, state, requirementIds);
    // A regenerate is a legitimate point to re-evaluate the run: without this
    // a stale `partial` (e.g. recorded before housekeeping notices were
    // distinguished from failures) would survive every re-render.
    if (state.status === 'finished' || state.status === 'partial') {
      state.status = this.realFailures(state).length > 0 ? 'partial' : 'finished';
    }
    await this.saveState(project, state);
    return state;
  }

  /** Run-state entries that represent an actual failure, not housekeeping. */
  private realFailures(state: AnalysisRunState): AnalysisRunState['errors'] {
    const NOTICE_RE = /verworfen\.|Vektorsuche lieferte keine Kandidaten|Kein Leistungskatalog/;
    return state.errors.filter(
      (entry) => entry.severity !== 'notice' && !NOTICE_RE.test(entry.error),
    );
  }

  private async generateReport(project: string, state: AnalysisRunState, requirementIds: string[]): Promise<void> {
    await this.progress(project, state, { step: 'report', fraction: 0.1, message: 'Daten zusammenstellen' });
    const template = state.inputs.templateFile
      ? await this.files.readProjectText(project, state.inputs.templateFile)
      : undefined;
    const result = await this.withHeartbeat(project, state, () =>
      this.report.generate(project, state, requirementIds, template),
    );
    state.report = {
      markdownPath: result.markdownPath,
      docxPath: result.docxPath,
      snapshotPath: result.snapshotPath,
      generatedAt: result.generatedAt,
      reliable: result.reliable,
      narrativeOk: result.narrativeOk,
    };
    if (!result.narrativeOk) {
      state.errors.push({ step: 'report', error: 'Erzählteil konnte nicht generiert werden — Bericht enthält nur Kennzahlen und Tabellen.', at: new Date().toISOString() });
    }
    await this.progress(project, state, { step: 'report', fraction: 1, message: result.docxPath ? 'Markdown + DOCX erzeugt' : 'Markdown erzeugt (DOCX fehlgeschlagen)' });
  }

  // ---------------------------------------------------------------------------
  // Status / cockpit model
  // ---------------------------------------------------------------------------

  async listRuns(project: string): Promise<AnalysisRunState[]> {
    const entries = await this.files.listDir(project, 'analysis');
    const runs: AnalysisRunState[] = [];
    for (const entry of entries) {
      if (!/^AN-\d+$/.test(entry)) continue;
      try {
        runs.push(await this.files.readJson<AnalysisRunState>(project, `analysis/${entry}/state.json`));
      } catch {
        // partial directory
      }
    }
    return runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }

  async getStatus(project: string, runId?: string): Promise<AnalysisStatusPayload> {
    const state = await this.loadState(project, runId);
    if (!state) {
      return {
        state: null,
        readiness: this.emptyReadiness(),
        stages: this.stages(null, this.emptyReadiness()),
        alerts: [],
        currentStage: 1,
      };
    }
    // A run whose process died mid-flight is REPORTED as stale, but never
    // mutated here: getStatus is a read path, and a single long LLM call
    // (catalog import, report) must not let a poller kill the live run.
    // The owning process is the only writer; assertNoLiveRun() uses the same
    // staleness rule to decide whether a new run may start.
    if (state.status === 'running' && Date.now() - Date.parse(state.heartbeatAt) > HEARTBEAT_STALE_MS) {
      state.message =
        `${state.message ? `${state.message} — ` : ''}Kein Lebenszeichen seit ` +
        `${Math.round((Date.now() - Date.parse(state.heartbeatAt)) / 60000)} Min. ` +
        `(Backend neu gestartet? Ein neuer Lauf kann gestartet werden.)`;
    }
    await this.refreshReview(project, state);
    const alerts = await this.collectAlerts(project, state);
    const readiness = await this.readiness(project, state, alerts);
    const stages = this.stages(state, readiness);
    const currentStage = Math.max(1, stages.findIndex((stage) => stage.status !== 'done') + 1 || stages.length);
    return { state, readiness, stages, alerts, currentStage };
  }

  private emptyReadiness(): AnalysisReadiness {
    return {
      phaseADone: false,
      phaseB: false,
      reliable: false,
      openReviews: 0,
      approvedRequirements: 0,
      unresolvedAlerts: 0,
      resolvedAlerts: 0,
      clarifyForCustomer: 0,
      internalQuestions: 0,
      pendingMappings: 0,
      pendingVerdicts: 0,
    };
  }

  private async readiness(
    project: string,
    state: AnalysisRunState,
    alerts: AnalysisStatusPayload['alerts'],
  ): Promise<AnalysisReadiness> {
    const phaseADone = state.status !== 'running' || state.phase === 'B';
    const unresolvedAlerts = alerts.filter((alert) => !alert.resolution).length;
    const resolvedAlerts = alerts.length - unresolvedAlerts;
    const proposals = await this.runProposals(project, state);
    let ambiguityQuestions = 0;
    for (const proposal of proposals) {
      if (proposal.status !== 'approved') continue;
      ambiguityQuestions += (proposal.payload?.ambiguities ?? []).filter((a: any) => a?.clarification_question_draft).length;
    }
    // Resolving an alert as "clarify" injects a drafted bidder question into
    // the card's ambiguities (resolveAlert), so those alerts are ALREADY part
    // of ambiguityQuestions. Adding them again double-counted every resolved
    // contradiction and made the cockpit disagree with the report (17 vs 16).
    const clarifyForCustomer = ambiguityQuestions;

    let internalQuestions = 0;
    let pendingMappings = 0;
    let pendingVerdicts = 0;
    if (state.mapping) {
      const requirementIds = new Set(state.mapping.requirementIds);
      const records = await this.repository.listCompliance(project);
      const verdictProposals = await this.repository.listProposals(project, { kind: 'compliance' });
      const latestByReq = new Map<string, { verdict: string; question: any }>();
      for (const record of records) {
        if (requirementIds.has(record.requirementId)) latestByReq.set(record.requirementId, { verdict: record.verdict, question: record.internalQuestion });
      }
      for (const proposal of verdictProposals) {
        if (proposal.status !== 'proposed') continue;
        const reqId = proposal.payload?.requirement_id;
        if (!requirementIds.has(reqId)) continue;
        pendingVerdicts++;
        if (!latestByReq.has(reqId)) latestByReq.set(reqId, { verdict: proposal.payload?.verdict, question: proposal.payload?.internal_question });
      }
      internalQuestions = [...latestByReq.values()].filter((entry) => entry.verdict === 'NEEDS_INPUT').length;
      const mappingProposals = await this.repository.listProposals(project, { kind: 'mapping', status: 'proposed' });
      pendingMappings = mappingProposals.filter((proposal) => requirementIds.has(proposal.payload?.requirement_id)).length;
    }

    return {
      phaseADone,
      phaseB: phaseADone && state.status !== 'failed' && state.review.open === 0 && unresolvedAlerts === 0 && state.review.approved > 0,
      reliable: state.report ? state.report.reliable : clarifyForCustomer === 0 && internalQuestions === 0 && unresolvedAlerts === 0,
      openReviews: state.review.open,
      approvedRequirements: state.review.approved,
      unresolvedAlerts,
      resolvedAlerts,
      clarifyForCustomer,
      internalQuestions,
      pendingMappings,
      pendingVerdicts,
    };
  }

  private stages(state: AnalysisRunState | null, readiness: AnalysisReadiness): AnalysisStage[] {
    const phaseARunning = state?.status === 'running' && state.phase === 'A';
    const phaseBRunning = state?.status === 'running' && state.phase === 'B';
    const phaseAFailed = state?.status === 'failed' && state.phase === 'A';
    const phaseBFailed = state?.status === 'failed' && state.phase === 'B';
    const phaseADone = Boolean(state) && !phaseARunning && !phaseAFailed;
    const finished = state?.status === 'finished' || state?.status === 'partial';
    const parsedFiles = state?.files.filter((file) => file.kind === 'tender' && ['parsed', 'extracted', 'extracting'].includes(file.status)).length ?? 0;
    const tenderFiles = state?.files.filter((file) => file.kind === 'tender').length ?? 0;

    const ingest: AnalysisStage = {
      id: 'ingest',
      status: !state ? 'pending' : phaseARunning ? 'running' : phaseAFailed ? 'failed' : 'done',
      headline: !state
        ? 'Dokumente aus tender/ einlesen und Anforderungen extrahieren'
        : phaseARunning
          ? `${state.percent} % · ${state.stepLabel}${state.currentFile ? ` · ${state.currentFile}` : ''}`
          : phaseAFailed
            ? `Fehlgeschlagen bei „${state.stepLabel}“`
            : `${parsedFiles} von ${tenderFiles} Dateien gelesen, ${state.extraction.proposalIds.length} Anforderungen vorgeschlagen`,
      detail: state?.message ?? (state ? `${state.figures.count} Kennzahlen, ${state.catalog.serviceIds.length} Katalog-Services` : ''),
      blockedBy: [],
    };

    const review: AnalysisStage = {
      id: 'review',
      status: !phaseADone ? 'pending' : readiness.openReviews > 0 ? 'waiting' : 'done',
      headline: !phaseADone
        ? 'Vorgeschlagene Anforderungen fachlich prüfen'
        : readiness.openReviews > 0
          ? `${readiness.openReviews} von ${state!.review.total} Anforderungen noch zu prüfen`
          : `${readiness.approvedRequirements} Anforderungen freigegeben, ${state!.review.rejected} verworfen`,
      detail: 'Jede Karte wird von einem Menschen freigegeben oder verworfen (Review-Queue).',
      blockedBy: phaseADone ? [] : ['ingest'],
    };

    const contradictions: AnalysisStage = {
      id: 'contradictions',
      status: !phaseADone ? 'pending' : readiness.unresolvedAlerts > 0 ? 'waiting' : 'done',
      headline: !phaseADone
        ? 'Zahlen in Text und Mengengerüst abgleichen'
        : readiness.unresolvedAlerts > 0
          ? `${readiness.unresolvedAlerts} Widerspruch/-sprüche zwischen Dokumenten und Mengengerüst zu klären`
          : readiness.resolvedAlerts > 0
            ? `${readiness.resolvedAlerts} Widerspruch/-sprüche geklärt`
            : 'Keine Widersprüche zwischen Dokumenten und Mengengerüst',
      detail: 'Nur Kennzahlen, die in beiden Quellen vorkommen und abweichen, werden gemeldet.',
      blockedBy: phaseADone ? [] : ['ingest'],
    };

    const mappingBlockers = [
      ...(readiness.openReviews > 0 ? ['review'] : []),
      ...(readiness.unresolvedAlerts > 0 ? ['contradictions'] : []),
      ...(!phaseADone ? ['ingest'] : []),
    ];
    const mapping: AnalysisStage = {
      id: 'mapping',
      status: phaseBRunning && state!.step !== 'report'
        ? 'running'
        : phaseBFailed
          ? 'failed'
          : finished || (phaseBRunning && state!.step === 'report')
            ? 'done'
            : mappingBlockers.length > 0
              ? 'blocked'
              : 'pending',
      headline: phaseBRunning && state!.step !== 'report'
        ? `${state!.percent} % · ${state!.stepLabel}`
        : finished || (phaseBRunning && state!.step === 'report')
          ? `${state!.mapping?.proposalIds.length ?? 0} Zuordnungen, ${state!.compliance?.proposalIds.length ?? 0} Bewertungen vorgeschlagen`
          : mappingBlockers.length > 0
            ? 'Freigeschaltet, sobald 0 offene Anforderungen und 0 ungeklärte Widersprüche'
            : 'Bereit: Anforderungen mit dem Leistungskatalog abgleichen',
      detail: state?.compliance
        ? `erfüllt ${state.compliance.verdicts.FULL ?? 0} · teilweise ${state.compliance.verdicts.PARTIAL ?? 0} · nicht erfüllt ${state.compliance.verdicts.NON_COMPLIANT ?? 0} · intern zu klären ${state.compliance.verdicts.NEEDS_INPUT ?? 0}`
        : 'Nur klare Übereinstimmungen werden zugeordnet; jede Zuordnung bleibt ein Vorschlag.',
      blockedBy: mappingBlockers,
    };

    const report: AnalysisStage = {
      id: 'report',
      status: state?.report
        ? 'done'
        : phaseBRunning && state!.step === 'report'
          ? 'running'
          : phaseBFailed
            ? 'failed'
            : 'pending',
      headline: state?.report
        ? readiness.reliable
          ? 'Analyse belastbar'
          : `Analyse mit Vorbehalten: ${readiness.clarifyForCustomer} Kundenklärung(en), ${readiness.internalQuestions} interne Rückfrage(n)`
        : 'Management-Analyse nach der Vorlage erzeugen (Markdown + Word)',
      detail: state?.report ? `Erzeugt ${state.report.generatedAt.slice(0, 16).replace('T', ' ')}` : '',
      blockedBy: state?.report ? [] : ['mapping'],
    };

    return [ingest, review, contradictions, mapping, report];
  }

  // ---------------------------------------------------------------------------
  // Alerts (cockpit stage 3)
  // ---------------------------------------------------------------------------

  private async runProposals(project: string, state: AnalysisRunState): Promise<Proposal[]> {
    const proposals: Proposal[] = [];
    for (const id of state.extraction.proposalIds) {
      const proposal = await this.repository.getProposal(project, id);
      if (proposal) proposals.push(proposal);
    }
    return proposals;
  }

  private async collectAlerts(project: string, state: AnalysisRunState): Promise<AnalysisStatusPayload['alerts']> {
    const alerts: AnalysisStatusPayload['alerts'] = [];
    for (const proposal of await this.runProposals(project, state)) {
      if (proposal.status === 'rejected') continue;
      const list: ConsistencyAlert[] = proposal.payload?.consistency_alerts ?? [];
      list.forEach((alert, alertIndex) =>
        alerts.push({
          ...alert,
          proposalId: proposal.id,
          alertIndex,
          proposalStatus: proposal.status,
          earsText: proposal.payload?.ears_text ?? '',
        }),
      );
    }
    return alerts;
  }

  async resolveAlert(
    project: string,
    input: {
      proposalId: string;
      alertIndex: number;
      resolution: 'tender' | 'excel' | 'clarify';
      note?: string;
      actor: string;
    },
  ): Promise<{ success: boolean; alert?: ConsistencyAlert; error?: string }> {
    const proposal = await this.repository.getProposal(project, input.proposalId);
    if (!proposal) return { success: false, error: `Unknown proposal ${input.proposalId}` };
    const alerts: ConsistencyAlert[] = [...(proposal.payload?.consistency_alerts ?? [])];
    const alert = alerts[input.alertIndex];
    if (!alert) return { success: false, error: `No alert #${input.alertIndex} on ${input.proposalId}` };

    const now = new Date().toISOString();
    const resolved: ConsistencyAlert = {
      ...alert,
      resolution: input.resolution,
      resolvedBy: input.actor,
      resolvedAt: now,
      resolutionNote: input.note,
    };
    alerts[input.alertIndex] = resolved;
    const payload: any = { ...proposal.payload, consistency_alerts: alerts };

    if (input.resolution === 'excel' && proposal.status === 'proposed') {
      // take the workbook value: structured quantity + the number inside the EARS texts
      payload.quantities = (payload.quantities ?? []).map((quantity: any) => {
        const factor = normalizeUnit(quantity.unit).factor;
        return typeof quantity.value === 'number' && Math.abs(quantity.value * factor - alert.tenderValue) < 1e-6
          ? { ...quantity, value: alert.excelValue / factor }
          : quantity;
      });
      const literal = /[-+]?\d[\d.,]*/.exec(alert.tenderRaw)?.[0];
      if (literal) {
        const replacement = Number.isInteger(alert.excelValue)
          ? alert.excelValue.toLocaleString('de-DE')
          : alert.excelValue.toLocaleString('de-DE', { maximumFractionDigits: 2 });
        for (const field of ['ears_text', 'domain_text']) {
          if (typeof payload[field] === 'string') payload[field] = payload[field].split(literal).join(replacement);
        }
      }
    }
    // Idempotent per figure: re-deciding an alert (or deciding it twice from
    // two surfaces) must REPLACE its drafted question, never append a second
    // one — duplicates land straight in the customer's bidder questions.
    const noteFor = (figureId: string) => `Zahlenwiderspruch zum Mengengerüst (${figureId})`;
    payload.ambiguities = (payload.ambiguities ?? []).filter(
      (entry: any) => !(entry?.type === 'conflicting_reference' && entry?.note === noteFor(alert.figureId)),
    );
    if (input.resolution === 'clarify') {
      const question =
        `Zu „${alert.label}“: Die Leistungsbeschreibung nennt ${alert.tenderRaw}, das Mengengerüst ` +
        `(${alert.sheet}!${alert.cell}) nennt ${alert.excelRaw}. Welcher Wert ist verbindlich?`;
      payload.ambiguities = [
        ...payload.ambiguities,
        { type: 'conflicting_reference', note: noteFor(alert.figureId), clarification_question_draft: question },
      ];
    }

    await this.repository.updateProposal(project, { ...proposal, payload });
    // A card approved BEFORE its alert was resolved has already frozen a
    // requirement version without the injected question and without the
    // resolution. The report reads versions, so the customer question would
    // silently disappear (observed on run AN-005: cockpit 15, report 14).
    if (proposal.status === 'approved') {
      await this.syncResolvedAlertIntoVersion(project, proposal.id, payload);
    }
    this.snapshots.invalidate(project);
    await this.events.emit(project, 'analysis.alert_resolved', {
      proposalId: proposal.id,
      alertIndex: input.alertIndex,
      resolution: input.resolution,
      by: input.actor,
    });
    await this.maybeEmitReady(project);
    return { success: true, alert: resolved };
  }


  /**
   * Mirror a post-approval alert resolution onto the requirement version that
   * was created from this card, so `ambiguities` and `consistencyAlerts` on
   * the version match the decided card.
   */
  private async syncResolvedAlertIntoVersion(project: string, proposalId: string, payload: any): Promise<void> {
    try {
      const requirements = await this.repository.listRequirements(project);
      for (const requirement of requirements) {
        if (requirement.status === 'retired') continue;
        const versions = await this.repository.getVersions(project, requirement.id);
        const current = versions[versions.length - 1];
        if (!current || current.createdFromProposalId !== proposalId) continue;
        await this.repository.updateVersion(project, {
          ...current,
          ambiguities: payload.ambiguities ?? current.ambiguities ?? [],
          consistencyAlerts: payload.consistency_alerts ?? current.consistencyAlerts ?? [],
          ...(typeof payload.ears_text === 'string' ? { earsText: payload.ears_text } : {}),
          ...(typeof payload.domain_text === 'string' ? { domainText: payload.domain_text } : {}),
          ...(Array.isArray(payload.quantities) ? { quantities: payload.quantities } : {}),
        });
        return;
      }
    } catch (error: any) {
      this.logger.warn(`Could not sync resolved alert of ${proposalId} into its requirement version: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async requirementIdsOfRun(project: string, state: AnalysisRunState): Promise<string[]> {
    const approved = new Set(
      (await this.runProposals(project, state))
        .filter((proposal) => proposal.status === 'approved')
        .map((proposal) => proposal.id),
    );
    const requirements = await this.repository.listRequirements(project);
    const ids: string[] = [];
    for (const requirement of requirements) {
      if (requirement.status === 'retired') continue;
      if (approved.size === 0) {
        ids.push(requirement.id);
        continue;
      }
      const versions = await this.repository.getVersions(project, requirement.id);
      if (versions.some((version) => approved.has(version.createdFromProposalId))) ids.push(requirement.id);
    }
    return ids;
  }

  private async refreshReview(project: string, state: AnalysisRunState): Promise<void> {
    const proposals = await this.runProposals(project, state);
    state.review = {
      open: proposals.filter((proposal) => proposal.status === 'proposed').length,
      approved: proposals.filter((proposal) => proposal.status === 'approved').length,
      rejected: proposals.filter((proposal) => proposal.status === 'rejected').length,
      total: proposals.length,
    };
  }

  private async assertNoLiveRun(project: string): Promise<void> {
    const current = await this.loadState(project);
    if (isRunLive(current)) {
      throw new Error(`Analyse ${current!.runId} läuft bereits (${current!.percent} % · ${current!.stepLabel}).`);
    }
  }

  private async loadState(project: string, runId?: string): Promise<AnalysisRunState | null> {
    let id = runId;
    if (!id) {
      try {
        id = (await this.files.readJson<{ runId: string }>(project, CURRENT_PATH)).runId;
      } catch {
        return null;
      }
    }
    try {
      return await this.files.readJson<AnalysisRunState>(project, `analysis/${id}/state.json`);
    } catch {
      return null;
    }
  }

  private async saveState(project: string, state: AnalysisRunState): Promise<void> {
    const now = new Date().toISOString();
    state.updatedAt = now;
    if (state.status === 'running') state.heartbeatAt = now;
    await this.files.writeJson(project, `analysis/${state.runId}/state.json`, state);
  }

  /**
   * Keep the heartbeat fresh across a single long-running call (catalog
   * import, capability generation, report narrative). Without this the run
   * looks abandoned while one LLM request is in flight.
   */
  private async withHeartbeat<T>(project: string, state: AnalysisRunState, work: () => Promise<T>): Promise<T> {
    const timer = setInterval(() => {
      void this.saveState(project, state).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
    try {
      return await work();
    } finally {
      clearInterval(timer);
    }
  }

  private async progress(
    project: string,
    state: AnalysisRunState,
    patch: { step?: AnalysisStep; fraction?: number; currentFile?: string; message?: string },
  ): Promise<void> {
    const stepChanged = patch.step !== undefined && patch.step !== state.step;
    if (patch.step) {
      state.step = patch.step;
      state.stepLabel = STEP_LABELS[patch.step];
    }
    if (patch.fraction !== undefined) {
      const [from, to] = STEP_RANGES[state.step];
      const fraction = Math.min(1, Math.max(0, patch.fraction));
      state.percent = Math.max(state.percent, Math.round(from + (to - from) * fraction));
    }
    if ('currentFile' in patch) state.currentFile = patch.currentFile;
    if ('message' in patch) state.message = patch.message;
    await this.saveState(project, state);

    const last = this.lastEmit.get(state.runId) ?? 0;
    if (stepChanged || Date.now() - last >= PROGRESS_THROTTLE_MS || patch.fraction === 1) {
      this.lastEmit.set(state.runId, Date.now());
      await this.events.emit(project, 'analysis.progress', {
        runId: state.runId,
        phase: state.phase,
        status: state.status,
        percent: state.percent,
        step: state.step,
        stepLabel: state.stepLabel,
        file: state.currentFile,
        message: state.message,
      });
    }
  }

  /** Map sub-pipeline `pipeline.progress` events (tagged with our run id) into the overall percent. */
  private subscribeSubProgress(project: string, state: AnalysisRunState): Subscription {
    return this.events.stream(project).subscribe((event: FeedEvent) => {
      if (event.type !== 'pipeline.progress' || event.payload?.analysisRunId !== state.runId) return;
      const { pipeline, step, total, message } = event.payload;
      if (!total) return;
      const within = step / total;
      let fraction: number | undefined;
      let analysisStep: AnalysisStep | undefined;
      if (pipeline === 'extraction') {
        const context = this.subContext.get(state.runId);
        fraction = context ? (context.docIndex + within) / context.docCount : within;
        analysisStep = 'extract';
      } else if (pipeline === 'auto-mapping') {
        fraction = within;
        analysisStep = 'mapping';
      } else if (pipeline === 'compliance') {
        fraction = within;
        analysisStep = 'compliance';
      }
      if (analysisStep === undefined) return;
      void this.progress(project, state, {
        step: analysisStep,
        fraction,
        message: `${message} (${step}/${total})`,
      }).catch((error) => this.logger.warn(`progress relay failed: ${error.message}`));
    });
  }

  private async fail(project: string, state: AnalysisRunState, phase: 'A' | 'B', error: any): Promise<void> {
    state.status = 'failed';
    state.phase = phase;
    state.errors.push({ step: state.step, error: String(error?.message ?? error), at: new Date().toISOString() });
    state.message = String(error?.message ?? error);
    await this.saveState(project, state);
    await this.events.emit(project, 'analysis.failed', {
      runId: state.runId,
      phase,
      step: state.step,
      error: state.message,
    });
    this.logger.warn(`Tender analysis ${state.runId} failed in phase ${phase}/${state.step}: ${state.message}`);
  }

  /** Emit analysis.ready_for_phase_b once when the review queue and the alert list are clear. */
  private watchReadiness(project: string): void {
    if (this.readyWatchers.has(project)) return;
    const subscription = this.events.stream(project).subscribe((event: FeedEvent) => {
      if (event.type === 'proposal.decided' && event.payload?.kind === 'extraction') {
        void this.maybeEmitReady(project).catch(() => undefined);
      }
    });
    this.readyWatchers.set(project, subscription);
  }

  private async maybeEmitReady(project: string): Promise<void> {
    const state = await this.loadState(project);
    if (!state || state.status !== 'awaiting_review' || state.readyNotifiedAt) return;
    await this.refreshReview(project, state);
    const unresolved = (await this.collectAlerts(project, state)).filter((alert) => !alert.resolution).length;
    if (state.review.open === 0 && unresolved === 0 && state.review.approved > 0) {
      state.readyNotifiedAt = new Date().toISOString();
      await this.saveState(project, state);
      await this.events.emit(project, 'analysis.ready_for_phase_b', { runId: state.runId, approved: state.review.approved });
    } else {
      await this.saveState(project, state);
    }
  }
}
