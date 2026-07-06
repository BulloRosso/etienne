import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtGraphClient } from './graph/tt-graph.client';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtFilesService } from './store/files.service';
import { ProjectLockService } from './store/project-lock.service';
import { IngestionService } from './ingestion.service';
import { ProposalService } from './proposal.service';
import { RequirementService } from './requirement.service';
import { SearchProjectionService } from './search-projection.service';
import { TtEventsService } from './events.service';
import { RunRegistryService } from './pipelines/run-registry.service';
import { ExtractionPipeline } from './pipelines/extraction.pipeline';
import { BaselineService } from './baseline.service';
import { ThreadService } from './thread.service';
import { LifecycleService } from './lifecycle.service';
import { DriftPipeline } from './pipelines/drift.pipeline';
import { CaptureService } from './capture/capture.service';
import { CapturePipeline } from './pipelines/capture.pipeline';
import { MockTrackerAdapter } from './tracker/mock-tracker.adapter';
import { TrackerMirrorService } from './tracker/tracker-mirror.service';
import { LinkingPipeline } from './pipelines/linking.pipeline';
import { ShadowScopePipeline } from './pipelines/shadow-scope.pipeline';
import { TtExportService } from './export.service';
import { ReportService } from './report.service';
import { TtCatalogService } from './catalog.service';
import { CatalogImportPipeline } from './pipelines/catalog-import.pipeline';
import { AutoMappingPipeline } from './pipelines/auto-mapping.pipeline';
import { CompliancePipeline } from './pipelines/compliance.pipeline';
import { ResponseService } from './response.service';
import { ClaimsService } from './claims.service';
import { CLASS } from './graph/tt-vocab';
import { Proposal, TenderMeta } from './types/tendertrace-types';

export interface TenderSummary {
  tender: TenderMeta | null;
  counts: {
    documents: number;
    requirements: number;
    openProposalsByKind: Record<string, number>;
    unresolvedConflicts: number;
    staleLinks: number;
    staleMappings: number;
    pendingShadow: number;
    openCaptures: number;
  };
}

/**
 * Facade over the TenderTrace services — the single injection point for the
 * MCP tools file (requirements-tracking-tools.ts) and the REST controller.
 * Sub-services are exposed directly; cross-cutting summaries live here.
 */
@Injectable()
export class RequirementsTrackingService {
  private readonly logger = new Logger(RequirementsTrackingService.name);

  constructor(
    public readonly repository: TtRepository,
    public readonly graph: TtGraphClient,
    public readonly snapshots: TtSnapshotService,
    public readonly files: TtFilesService,
    public readonly locks: ProjectLockService,
    public readonly ingestion: IngestionService,
    public readonly proposals: ProposalService,
    public readonly requirements: RequirementService,
    public readonly projections: SearchProjectionService,
    public readonly events: TtEventsService,
    public readonly runs: RunRegistryService,
    public readonly extraction: ExtractionPipeline,
    public readonly baselines: BaselineService,
    public readonly threads: ThreadService,
    public readonly lifecycle: LifecycleService,
    public readonly drift: DriftPipeline,
    public readonly captures: CaptureService,
    public readonly capturePipeline: CapturePipeline,
    public readonly tracker: MockTrackerAdapter,
    public readonly trackerMirror: TrackerMirrorService,
    public readonly linking: LinkingPipeline,
    public readonly shadow: ShadowScopePipeline,
    public readonly exporter: TtExportService,
    public readonly reports: ReportService,
    public readonly catalog: TtCatalogService,
    public readonly catalogImport: CatalogImportPipeline,
    public readonly autoMapping: AutoMappingPipeline,
    public readonly compliance: CompliancePipeline,
    public readonly response: ResponseService,
    public readonly claims: ClaimsService,
  ) {}

  /** Create a capture and run the conversational pipeline in the background. */
  startCapture(project: string, pastedText: string, createdBy: string, hint?: string) {
    return this.captures.create(project, pastedText, createdBy, hint).then((capture) => {
      this.capturePipeline
        .run(project, capture, createdBy)
        .catch((error) =>
          this.events.emit(project, 'run.failed', {
            pipeline: 'capture',
            captureId: capture.id,
            error: error.message,
          }),
        );
      return capture;
    });
  }

  async getTenderSummary(project: string): Promise<TenderSummary> {
    const snapshot = await this.snapshots.get(project);
    const tender = await this.repository.getTenderMeta(project);

    const proposals = snapshot.recordsOfType<Proposal>(CLASS.Proposal);
    const openProposalsByKind: Record<string, number> = {};
    for (const proposal of proposals) {
      if (proposal.status === 'proposed') {
        openProposalsByKind[proposal.kind] = (openProposalsByKind[proposal.kind] ?? 0) + 1;
      }
    }

    const relations = snapshot.recordsOfType<any>(CLASS.Relation);
    const unresolvedConflicts = relations.filter(
      (relation) => relation.kind === 'conflicts_with' && relation.status !== 'resolved',
    ).length;

    const links = snapshot.recordsOfType<any>(CLASS.IssueLink);
    const staleLinks = links.filter(
      (link) => link.status === 'approved' && link.staleSince,
    ).length;

    const mappings = snapshot.recordsOfType<any>(CLASS.Mapping);
    const staleMappings = mappings.filter(
      (mapping) => mapping.status === 'approved' && mapping.staleSince,
    ).length;

    const captures = snapshot.recordsOfType<any>(CLASS.Capture);
    const openCaptures = captures.filter(
      (capture) => capture.status === 'processing' || capture.status === 'awaiting_answers',
    ).length;

    return {
      tender,
      counts: {
        documents: snapshot.recordsOfType<any>(CLASS.Document).length,
        requirements: snapshot.recordsOfType<any>(CLASS.Requirement).length,
        openProposalsByKind,
        unresolvedConflicts,
        staleLinks,
        staleMappings,
        pendingShadow: openProposalsByKind['shadow_scope'] ?? 0,
        openCaptures,
      },
    };
  }

  /** Create/update the tender meta record (called by seed and first document upload). */
  async initTender(project: string, meta: Partial<TenderMeta>): Promise<TenderMeta> {
    const existing = await this.repository.getTenderMeta(project);
    const merged: TenderMeta = {
      key: meta.key ?? existing?.key ?? project,
      title: meta.title ?? existing?.title ?? project,
      phase: meta.phase ?? existing?.phase ?? 'intake',
      baselineLabel: meta.baselineLabel ?? existing?.baselineLabel,
      language: meta.language ?? existing?.language ?? 'de',
    };
    await this.repository.saveTenderMeta(project, merged);
    this.snapshots.invalidate(project);
    return merged;
  }
}
