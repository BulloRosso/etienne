import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { TtRepository } from './graph/tt-repository';
import { TtGraphClient, q } from './graph/tt-graph.client';
import { TtSnapshotService } from './graph/tt-snapshot';
import { TtFilesService } from './store/files.service';
import { TtEventsService } from './events.service';
import { TtExportService } from './export.service';
import { TtCatalogService } from './catalog.service';
import { RequirementService } from './requirement.service';
import { RunRegistryService } from './pipelines/run-registry.service';
import { loadPrompt, renderPrompt } from './pipelines/prompt-loader';
import { CLASS, GRAPH_TENDER, IRI, P, RDF_TYPE } from './graph/tt-vocab';

export interface ResponseSection {
  id: string; // RS-01
  title: string;
  order: number;
  instructions?: string;
  allocatedRequirementIds: string[];
  currentVersionNo: number; // 0 = never written
}

/**
 * Response builder (spec §3.2 ResponseModule / P-05): section tree in the
 * graph, bodies as append-only files response/sections/<id>-v<n>.md. Drafting
 * (P-RESP-D) consumes ONLY human-approved verdicts + mapped published services;
 * gaps render as visible [MISSING: …] placeholders; export is blocked while
 * placeholders remain (spec §9.4) and while conflicts are unresolved (§3.6).
 */
@Injectable()
export class ResponseService {
  private readonly logger = new Logger(ResponseService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly repository: TtRepository,
    private readonly graph: TtGraphClient,
    private readonly snapshots: TtSnapshotService,
    private readonly files: TtFilesService,
    private readonly events: TtEventsService,
    private readonly exporter: TtExportService,
    private readonly catalog: TtCatalogService,
    private readonly requirements: RequirementService,
    private readonly runs: RunRegistryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Section tree (graph) + bodies (files)
  // ---------------------------------------------------------------------------

  private async saveSectionNode(project: string, section: ResponseSection): Promise<void> {
    const iri = IRI.responseSection(section.id);
    const existing = await this.graph.match(project, {
      subject: iri,
      predicate: P.record,
      graph: GRAPH_TENDER,
    });
    const puts = [
      q.node(iri, RDF_TYPE, CLASS.ResponseSection, GRAPH_TENDER),
      q.literal(iri, P.record, JSON.stringify({ ...section, _rev: (existing.length ?? 0) + 1 }), GRAPH_TENDER),
    ];
    await this.graph.put(project, puts);
    if (existing.length > 0) {
      await this.graph.batch(project, {
        dels: existing.map((quad) => ({
          subject: iri,
          predicate: P.record,
          object: quad.object.value,
          objectType: 'literal' as const,
          graph: GRAPH_TENDER,
        })),
      });
    }
    this.snapshots.invalidate(project);
  }

  async listSections(project: string): Promise<ResponseSection[]> {
    const snapshot = await this.snapshots.get(project);
    return snapshot
      .recordsOfType<ResponseSection>(CLASS.ResponseSection)
      .sort((a, b) => a.order - b.order);
  }

  async createSection(
    project: string,
    input: { title: string; instructions?: string; allocatedRequirementIds?: string[] },
  ): Promise<ResponseSection> {
    const sections = await this.listSections(project);
    const id = `RS-${String(sections.length + 1).padStart(2, '0')}`;
    const section: ResponseSection = {
      id,
      title: input.title,
      order: sections.length + 1,
      instructions: input.instructions,
      allocatedRequirementIds: input.allocatedRequirementIds ?? [],
      currentVersionNo: 0,
    };
    await this.saveSectionNode(project, section);
    return section;
  }

  async getSectionBody(project: string, sectionId: string): Promise<string> {
    const sections = await this.listSections(project);
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section || section.currentVersionNo === 0) return '';
    return this.files.readText(
      project,
      `response/sections/${sectionId}-v${section.currentVersionNo}.md`,
    );
  }

  /** Manual save → append-only version file (spec §12.6). */
  async saveSectionBody(project: string, sectionId: string, markdown: string): Promise<ResponseSection> {
    const sections = await this.listSections(project);
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section) throw new Error(`Unknown response section ${sectionId}`);
    const nextVersion = section.currentVersionNo + 1;
    await this.files.writeFile(project, `response/sections/${sectionId}-v${nextVersion}.md`, markdown);
    const updated = { ...section, currentVersionNo: nextVersion };
    await this.saveSectionNode(project, updated);
    await this.events.emit(project, 'response.saved', { sectionId, versionNo: nextVersion });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Drafting (P-RESP-D) — approved content only
  // ---------------------------------------------------------------------------

  async draftSection(project: string, sectionId: string, companyName = 'NovaSys GmbH'): Promise<{
    sectionId: string;
    versionNo: number;
    missing: string[];
  }> {
    const sections = await this.listSections(project);
    const section = sections.find((entry) => entry.id === sectionId);
    if (!section) throw new Error(`Unknown response section ${sectionId}`);

    const prompt = loadPrompt('p-resp-d.v1');
    const run = await this.runs.start(project, {
      pipeline: 'response-draft',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    // approved verdicts + mapped published services only
    const complianceRecords = await this.repository.listCompliance(project);
    const blocks: string[] = [];
    for (const reqId of section.allocatedRequirementIds) {
      const verdict = complianceRecords.find((record) => record.requirementId === reqId);
      const versions = await this.repository.getVersions(project, reqId);
      const current = versions[versions.length - 1];
      if (!current) continue;
      let serviceBlocks = '';
      for (const ref of verdict?.evidenceRefs ?? []) {
        const bundle = await this.catalog.getWithBody(project, ref.serviceId, ref.versionNo);
        if (bundle) {
          serviceBlocks +=
            `<service id="${ref.serviceId}" version_no="${ref.versionNo}" title="${bundle.service.title}">\n` +
            `scope: ${JSON.stringify(bundle.version.scope)}\n\n${bundle.bodyMarkdown}\n</service>\n`;
        }
      }
      blocks.push(
        `<requirement id="${reqId}" modality="${current.modality}">\n${current.earsText}\n` +
          (verdict
            ? `verdict: ${verdict.verdict}\njustification: ${verdict.justification}\n` +
              (verdict.deviation ? `deviation: ${verdict.deviation}\n` : '')
            : 'verdict: NONE APPROVED YET\n') +
          serviceBlocks +
          `</requirement>`,
      );
    }

    const systemPrompt = renderPrompt(prompt, {
      company_name: companyName,
      section_heading: section.title,
      section_instructions: section.instructions ?? 'Keine besonderen Formvorgaben.',
      style_guide: 'Sachlich, präzise, "wir"-Form, deutsch.',
    });
    const text = await this.llm.generateTextWithMessages({
      tier: 'regular',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `<approved>\n${blocks.join('\n\n')}\n</approved>` },
      ],
      maxOutputTokens: 8000,
      temperature: 0.2,
    });

    // deterministic coverage check: every allocated requirement addressed or [MISSING]
    const missing = section.allocatedRequirementIds.filter(
      (reqId) => !text.includes(reqId) && !text.includes('[MISSING'),
    );
    let body = text;
    for (const reqId of missing) {
      body += `\n\n[MISSING: Anforderung ${reqId} ist im Entwurf nicht adressiert — Verdikt prüfen]\n<!-- trace: ${reqId} -->`;
    }

    const saved = await this.saveSectionBody(project, sectionId, body);
    await this.runs.finish(project, run, 'ok');
    return {
      sectionId,
      versionNo: saved.currentVersionNo,
      missing: this.findMissingPlaceholders(body),
    };
  }

  private findMissingPlaceholders(markdown: string): string[] {
    return [...markdown.matchAll(/\[MISSING:([^\]]*)\]/g)].map((match) => match[1].trim());
  }

  // ---------------------------------------------------------------------------
  // Export — blocked on [MISSING] and unresolved conflicts (spec §9.4)
  // ---------------------------------------------------------------------------

  async export(
    project: string,
    force = false,
  ): Promise<{ path?: string; blocked?: boolean; blockers?: any[] }> {
    const sections = await this.listSections(project);
    const blockers: any[] = [];

    const conflicts = await this.requirements.unresolvedConflicts(project);
    for (const conflict of conflicts) {
      blockers.push({
        kind: 'conflict',
        ref: conflict.id,
        detail: `${conflict.fromRequirementId} conflicts with ${conflict.toRequirementId}`,
      });
    }

    const bodies: Array<{ section: ResponseSection; body: string }> = [];
    for (const section of sections) {
      const body = await this.getSectionBody(project, section.id);
      bodies.push({ section, body });
      for (const placeholder of this.findMissingPlaceholders(body)) {
        blockers.push({ kind: 'missing', ref: section.id, detail: placeholder });
      }
    }

    if (blockers.length > 0 && !force) {
      return { blocked: true, blockers };
    }

    const meta = await this.repository.getTenderMeta(project);
    const lines: string[] = [`# Angebot — ${meta?.title ?? project}`, ''];
    for (const { section, body } of bodies) {
      lines.push(`## ${section.title}`, '', body.replace(/<!--\s*trace:[^>]*-->/g, ''), '');
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = await this.exporter.renderDocx(
      project,
      lines.join('\n'),
      `exports/response-${timestamp}.docx`,
    );
    return { path };
  }
}
