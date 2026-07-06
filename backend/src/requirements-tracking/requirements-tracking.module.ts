import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { ContentManagementModule } from '../content-management/content-management.module';
import { RequirementsTrackingController } from './requirements-tracking.controller';
import { RequirementsTrackingService } from './requirements-tracking.service';
import { TtGraphClient } from './graph/tt-graph.client';
import { TtRepository } from './graph/tt-repository';
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
import { DecisionEffectsService } from './decision-effects.service';
import { ProposalDedupService } from './proposal-dedup.service';
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

/**
 * TenderTrace — requirements tracking (spec: requirements-docs/requirements-tracking/).
 *
 * Storage maps entirely onto existing infrastructure: the per-project rdf-store
 * (:7000) holds identity/relations/provenance in named graphs; content lives on
 * the workspace filesystem under requirements-tracking/; search projections run
 * on the RagService hybrid layer. LlmModule and EmbeddingsModule are @Global.
 *
 * The UI is the mcp-app-requirements-tracking MCP app, served through the
 * 'requirements-tracking' group in McpServerFactoryService.
 */
@Module({
  imports: [RagModule, ContentManagementModule],
  controllers: [RequirementsTrackingController],
  providers: [
    TtGraphClient,
    TtRepository,
    TtSnapshotService,
    TtFilesService,
    ProjectLockService,
    TtEventsService,
    IngestionService,
    ProposalService,
    RequirementService,
    SearchProjectionService,
    RunRegistryService,
    ExtractionPipeline,
    BaselineService,
    ThreadService,
    LifecycleService,
    DecisionEffectsService,
    ProposalDedupService,
    DriftPipeline,
    CaptureService,
    CapturePipeline,
    MockTrackerAdapter,
    TrackerMirrorService,
    LinkingPipeline,
    ShadowScopePipeline,
    TtExportService,
    ReportService,
    TtCatalogService,
    CatalogImportPipeline,
    AutoMappingPipeline,
    CompliancePipeline,
    ResponseService,
    ClaimsService,
    RequirementsTrackingService,
  ],
  exports: [RequirementsTrackingService, TtEventsService],
})
export class RequirementsTrackingModule {}
