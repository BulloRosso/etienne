import { Injectable, Logger } from '@nestjs/common';
import { RagService } from '../rag/rag.service';
import { TtRepository } from './graph/tt-repository';
import { TtFilesService } from './store/files.service';
import {
  CatalogService,
  Requirement,
  RequirementVersion,
  ServiceVersion,
  TrackerIssue,
} from './types/tendertrace-types';

export interface ProjectionHit {
  stableId: string;
  kind: 'requirement' | 'service' | 'issue';
  refId: string; // REQ-047 / SVC-012/v/3 / PORTAL-231
  content: string;
  similarity: number;
  metadata: Record<string, any>;
}

/**
 * Search projections (spec §11.1): full-text + embedding retrieval over
 * requirements, catalog services and mirrored issues. Runs on the existing
 * RagService hybrid layer (ChromaDB dense + BM25 sparse, RRF fusion) in the
 * dedicated `reqtrack_<project>` scope. Projections are cache, not truth —
 * rebuild() re-derives everything from the graph + files.
 */
@Injectable()
export class SearchProjectionService {
  private readonly logger = new Logger(SearchProjectionService.name);

  constructor(
    private readonly rag: RagService,
    private readonly repository: TtRepository,
    private readonly files: TtFilesService,
  ) {}

  private scope(project: string): string {
    return `reqtrack_${project}`;
  }

  // ---------------------------------------------------------------------------
  // Indexing (called on approval/publish/sync; failures are logged, not fatal —
  // the projection is rebuildable)
  // ---------------------------------------------------------------------------

  async indexRequirementVersion(project: string, version: RequirementVersion): Promise<void> {
    const text = [
      version.earsText,
      version.sourceRef?.quote,
      version.category,
      version.modality,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await this.rag.indexTextWithId(this.scope(project), text, `req:${version.requirementId}`, {
        kind: 'requirement',
        refId: version.requirementId,
        versionNo: version.versionNo,
        category: version.category,
        modality: version.modality,
      });
    } catch (error: any) {
      this.logger.warn(`Projection index failed for ${version.requirementId}: ${error.message}`);
    }
  }

  async removeRequirement(project: string, reqId: string): Promise<void> {
    try {
      await this.rag.deleteTextWithId(this.scope(project), `req:${reqId}`);
    } catch (error: any) {
      this.logger.warn(`Projection delete failed for ${reqId}: ${error.message}`);
    }
  }

  async indexServiceVersion(
    project: string,
    service: CatalogService,
    version: ServiceVersion,
    bodyMarkdown: string,
  ): Promise<void> {
    const scopeLines = [
      ...version.scope.included.map((s) => `Enthalten: ${s}`),
      ...version.scope.excluded.map((s) => `Nicht Bestandteil: ${s}`),
      ...version.scope.prerequisites.map((s) => `Voraussetzung: ${s}`),
      ...version.scope.deliverables.map((s) => `Liefergegenstand: ${s}`),
    ];
    const text = [service.title, version.tags.join(', '), scopeLines.join('\n'), bodyMarkdown]
      .filter(Boolean)
      .join('\n\n');
    try {
      await this.rag.indexTextWithId(
        this.scope(project),
        text,
        `svc:${version.serviceId}:v${version.versionNo}`,
        {
          kind: 'service',
          refId: `${version.serviceId}/v/${version.versionNo}`,
          serviceId: version.serviceId,
          versionNo: version.versionNo,
          serviceKind: service.kind,
          tags: version.tags.join(','),
        },
      );
    } catch (error: any) {
      this.logger.warn(`Projection index failed for ${version.serviceId}: ${error.message}`);
    }
  }

  async indexIssue(project: string, issue: TrackerIssue): Promise<void> {
    const text = [
      issue.key,
      issue.summary,
      issue.description,
      issue.labels.join(', '),
      ...issue.comments.map((c) => c.body),
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await this.rag.indexTextWithId(this.scope(project), text, `issue:${issue.key}`, {
        kind: 'issue',
        refId: issue.key,
        statusCategory: issue.statusCategory,
      });
    } catch (error: any) {
      this.logger.warn(`Projection index failed for ${issue.key}: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  private async search(
    project: string,
    query: string,
    kind: 'requirement' | 'service' | 'issue',
    topK: number,
  ): Promise<ProjectionHit[]> {
    try {
      const { results } = await this.rag.indexSearchWhere(
        this.scope(project),
        query,
        { kind },
        topK,
      );
      return results.map((result) => ({
        stableId: result.metadata?.stableId ?? result.id,
        kind,
        refId: result.metadata?.refId ?? '',
        content: result.content,
        similarity: result.similarity,
        metadata: result.metadata ?? {},
      }));
    } catch (error: any) {
      this.logger.warn(`Projection search failed (${kind}): ${error.message}`);
      return [];
    }
  }

  searchRequirements(project: string, query: string, topK = 10): Promise<ProjectionHit[]> {
    return this.search(project, query, 'requirement', topK);
  }

  searchServices(project: string, query: string, topK = 10): Promise<ProjectionHit[]> {
    return this.search(project, query, 'service', topK);
  }

  searchIssues(project: string, query: string, topK = 10): Promise<ProjectionHit[]> {
    return this.search(project, query, 'issue', topK);
  }

  // ---------------------------------------------------------------------------
  // Rebuild — projections are cache; truth is graph + files
  // ---------------------------------------------------------------------------

  async rebuild(project: string): Promise<{ requirements: number; services: number; issues: number }> {
    const requirements = await this.repository.listRequirements(project);
    let reqCount = 0;
    for (const requirement of requirements) {
      if (requirement.status === 'retired') continue;
      const versions = await this.repository.getVersions(project, requirement.id);
      const current = versions[versions.length - 1];
      if (current) {
        await this.indexRequirementVersion(project, current);
        reqCount++;
      }
    }

    const services = await this.repository.listServices(project);
    let svcCount = 0;
    for (const service of services) {
      const versions = await this.repository.listServiceVersions(project, service.id);
      const published = versions.filter((v) => v.status === 'published');
      const latest = published[published.length - 1];
      if (latest) {
        let body = '';
        try {
          body = await this.files.readText(project, latest.bodyMarkdownPath);
        } catch {
          // body file missing — index metadata only
        }
        await this.indexServiceVersion(project, service, latest, body);
        svcCount++;
      }
    }

    const issues = await this.repository.listIssues(project);
    for (const issue of issues) {
      await this.indexIssue(project, issue);
    }

    this.logger.log(
      `Rebuilt projections for ${project}: ${reqCount} requirements, ${svcCount} services, ${issues.length} issues`,
    );
    return { requirements: reqCount, services: svcCount, issues: issues.length };
  }
}
