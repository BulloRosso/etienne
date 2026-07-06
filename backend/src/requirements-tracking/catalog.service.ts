import { Injectable, Logger } from '@nestjs/common';
import { TtRepository } from './graph/tt-repository';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtFilesService } from './store/files.service';
import { TtEventsService } from './events.service';
import { ProjectLockService } from './store/project-lock.service';
import { LifecycleService } from './lifecycle.service';
import { SearchProjectionService } from './search-projection.service';
import {
  CatalogService as CatalogEntry,
  SeedOverride,
  ServiceKind,
  ServiceScope,
  ServiceVersion,
} from './types/tendertrace-types';

const EMPTY_SCOPE: ServiceScope = {
  included: [],
  excluded: [],
  prerequisites: [],
  deliverables: [],
};

/**
 * Service catalog (spec §3.2 CatalogModule): the company's structured offering
 * knowledge. Entries are versioned; bodies are markdown files under
 * catalog/services/<key>/v<n>/body.md, immutable once published — edits create
 * the next version. Republishing marks approved mappings stale instead of
 * silently re-running (spec §3.4).
 */
@Injectable()
export class TtCatalogService {
  private readonly logger = new Logger(TtCatalogService.name);

  constructor(
    private readonly repository: TtRepository,
    private readonly snapshots: TtSnapshotService,
    private readonly files: TtFilesService,
    private readonly events: TtEventsService,
    private readonly locks: ProjectLockService,
    private readonly lifecycle: LifecycleService,
    private readonly projections: SearchProjectionService,
  ) {}

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  async createService(
    project: string,
    input: { kind?: ServiceKind; title: string; key?: string },
  ): Promise<CatalogEntry> {
    return this.locks.withLock(project, async () => {
      const id = await this.repository.nextKey(project, 'service', 'SVC-', 3);
      const service: CatalogEntry = {
        id,
        kind: input.kind ?? 'service',
        key: input.key ?? this.slugify(input.title),
        title: input.title,
        status: 'active',
      };
      await this.repository.saveService(project, service);
      this.snapshots.invalidate(project);
      return service;
    });
  }

  /** Create or update the (single) draft version on top of the latest version. */
  async saveDraftVersion(
    project: string,
    serviceId: string,
    input: {
      bodyMarkdown: string;
      tags?: string[];
      scope?: Partial<ServiceScope>;
      source?: 'manual' | 'docx_import';
      sourceDocumentId?: string;
    },
  ): Promise<ServiceVersion> {
    const service = await this.repository.getService(project, serviceId);
    if (!service) throw new Error(`Unknown service ${serviceId}`);

    const versions = await this.repository.listServiceVersions(project, serviceId);
    const draft = versions.find((version) => version.status === 'draft');
    const versionNo = draft ? draft.versionNo : (versions[versions.length - 1]?.versionNo ?? 0) + 1;

    const bodyPath = `catalog/services/${service.key}/v${versionNo}/body.md`;
    await this.files.writeFile(project, bodyPath, input.bodyMarkdown);

    const version: ServiceVersion = {
      id: `${serviceId}/v/${versionNo}`,
      serviceId,
      versionNo,
      bodyMarkdownPath: bodyPath,
      images: draft?.images ?? [],
      tags: input.tags ?? draft?.tags ?? [],
      scope: { ...EMPTY_SCOPE, ...(draft?.scope ?? {}), ...(input.scope ?? {}) },
      source: input.source ?? draft?.source ?? 'manual',
      sourceDocumentId: input.sourceDocumentId ?? draft?.sourceDocumentId,
      status: 'draft',
    };
    await this.repository.saveServiceVersion(project, version);
    this.snapshots.invalidate(project);
    return version;
  }

  /** Publish = immutable from here (guarded, first-writer-wins under the lock). */
  async publish(
    project: string,
    serviceId: string,
    versionNo: number,
    actor: string,
    seed?: SeedOverride,
  ): Promise<ServiceVersion> {
    return this.locks.withLock(project, async () => {
      const service = await this.repository.getService(project, serviceId);
      if (!service) throw new Error(`Unknown service ${serviceId}`);
      const version = await this.repository.getServiceVersion(project, serviceId, versionNo);
      if (!version) throw new Error(`Unknown version ${serviceId}/v/${versionNo}`);
      if (version.status === 'published') {
        throw new Error(`Version ${serviceId}/v/${versionNo} is already published`);
      }

      const published: ServiceVersion = {
        ...version,
        status: 'published',
        publishedAt: seed?.at ?? new Date().toISOString(),
        publishedBy: seed?.by ?? actor,
      };
      await this.repository.saveServiceVersion(project, published);
      await this.repository.saveService(project, {
        ...service,
        currentVersionId: published.id,
      });

      // search projection + staleness on republish
      let body = '';
      try {
        body = await this.files.readText(project, published.bodyMarkdownPath);
      } catch {
        // metadata-only indexing
      }
      await this.projections.indexServiceVersion(project, service, published, body);
      if (versionNo > 1) {
        await this.lifecycle.applyStalenessOnServiceRepublish(project, serviceId, seed);
      }

      this.snapshots.invalidate(project);
      await this.events.emit(project, 'service.published', {
        serviceId,
        versionNo,
        by: published.publishedBy,
      });
      return published;
    });
  }

  async archive(project: string, serviceId: string): Promise<void> {
    const service = await this.repository.getService(project, serviceId);
    if (!service) throw new Error(`Unknown service ${serviceId}`);
    await this.repository.saveService(project, { ...service, status: 'archived' });
    this.snapshots.invalidate(project);
  }

  async list(
    project: string,
    filter: { q?: string; tags?: string[]; kind?: string } = {},
  ): Promise<Array<CatalogEntry & { currentVersion?: ServiceVersion }>> {
    const services = await this.repository.listServices(project);
    const results: Array<CatalogEntry & { currentVersion?: ServiceVersion }> = [];
    for (const service of services) {
      if (filter.kind && service.kind !== filter.kind) continue;
      const versions = await this.repository.listServiceVersions(project, service.id);
      const published = versions.filter((version) => version.status === 'published');
      const current = published[published.length - 1];
      if (filter.tags?.length && !filter.tags.some((tag) => current?.tags.includes(tag))) continue;
      if (
        filter.q &&
        !`${service.title} ${current?.tags.join(' ') ?? ''}`
          .toLowerCase()
          .includes(filter.q.toLowerCase())
      )
        continue;
      results.push({ ...service, currentVersion: current });
    }
    return results;
  }

  async getWithBody(
    project: string,
    serviceId: string,
    versionNo?: number,
  ): Promise<{
    service: CatalogEntry;
    version: ServiceVersion;
    bodyMarkdown: string;
    versions: ServiceVersion[];
  } | null> {
    const service = await this.repository.getService(project, serviceId);
    if (!service) return null;
    const versions = await this.repository.listServiceVersions(project, serviceId);
    const version = versionNo
      ? versions.find((entry) => entry.versionNo === versionNo)
      : versions.filter((entry) => entry.status === 'published').pop() ?? versions[versions.length - 1];
    if (!version) return null;
    let bodyMarkdown = '';
    try {
      bodyMarkdown = await this.files.readText(project, version.bodyMarkdownPath);
    } catch {
      bodyMarkdown = '';
    }
    return { service, version, bodyMarkdown, versions };
  }

  /** Usage view: where a service is mapped ("mapped in N requirements"). */
  async usage(project: string, serviceId: string): Promise<{ mappings: number; requirements: string[] }> {
    const mappings = await this.repository.listMappings(project, {});
    const mine = mappings.filter(
      (mapping) =>
        mapping.serviceVersionId.startsWith(`${serviceId}/`) && mapping.status === 'approved',
    );
    return {
      mappings: mine.length,
      requirements: [...new Set(mine.map((mapping) => mapping.requirementId))],
    };
  }
}
