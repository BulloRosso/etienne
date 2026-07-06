import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { LlmService } from '../../llm/llm.service';
import { ProposalService } from '../proposal.service';
import { TtEventsService } from '../events.service';
import { TtFilesService } from '../store/files.service';
import { TtRepository } from '../graph/tt-repository';
import { RunRegistryService } from './run-registry.service';
import { loadPrompt } from './prompt-loader';
import { runStructured } from './structured-run';
import { catalogImportSchema } from '../schemas/catalog.schema';

/**
 * Catalog import pipeline (spec §4 pipeline 8): DOCX → deterministic
 * conversion (mammoth: markdown + extracted images with stable ids, headings
 * preserved — the agent never receives binary formats, §12.11) → P-CAT-I
 * segments into proposed entries → catalog_import proposals for the Import
 * wizard → publishing creates service_versions.
 */
@Injectable()
export class CatalogImportPipeline {
  private readonly logger = new Logger(CatalogImportPipeline.name);

  constructor(
    private readonly llm: LlmService,
    private readonly proposals: ProposalService,
    private readonly events: TtEventsService,
    private readonly files: TtFilesService,
    private readonly repository: TtRepository,
    private readonly runs: RunRegistryService,
  ) {}

  /**
   * @param projectRelativeSource path of the uploaded DOCX relative to the project
   */
  async run(
    project: string,
    projectRelativeSource: string,
  ): Promise<{ runId: string; importId: string; proposalIds: string[] }> {
    const importId = await this.repository.nextKey(project, 'catalogImport', 'IMP-', 3);
    const original = await this.files.importProjectFile(
      project,
      projectRelativeSource,
      `catalog/imports/${importId}/original${path.extname(projectRelativeSource).toLowerCase()}`,
    );

    // deterministic conversion BEFORE any prompt (spec §12.11)
    const { markdown, images } = await this.convertDocx(project, importId, original.relativePath);
    await this.files.writeFile(project, `catalog/imports/${importId}/converted.md`, markdown);

    const prompt = loadPrompt('p-cat-i.v1');
    const run = await this.runs.start(project, {
      pipeline: 'catalog-import',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    // compact index of the existing catalog for update_of / merge hints
    const services = await this.repository.listServices(project);
    const indexLines: string[] = [];
    for (const service of services) {
      const versions = await this.repository.listServiceVersions(project, service.id);
      const current = versions.filter((version) => version.status === 'published').pop();
      indexLines.push(
        `${service.key} | ${service.title} | tags: ${current?.tags.join(', ') ?? ''}`,
      );
    }

    const outcome = await runStructured(this.llm, {
      schema: catalogImportSchema,
      systemPrompt: prompt.text,
      userMessage:
        `<document>\n${markdown}\n</document>\n\n<catalog>\n${indexLines.join('\n')}\n</catalog>`,
      tier: 'regular',
      temperature: 0,
      maxOutputTokens: 16000,
    });
    if (!outcome.ok || !outcome.data) {
      await this.runs.finish(project, run, 'failed');
      throw new Error(`Catalog import segmentation failed: ${outcome.error}`);
    }

    const proposalIds: string[] = [];
    for (const entry of outcome.data.entries) {
      const submitted = await this.proposals.submit(project, {
        kind: 'catalog_import',
        payload: {
          importId,
          ...entry,
          images,
        },
        evidence: null,
        affectedRequirementIds: [],
        confidence: entry.confidence,
        agentRunId: run.id,
        promptVersion: prompt.version,
        skipQuoteCheck: true, // wording preservation is reviewed in the wizard, not quote-checked
      });
      if ('id' in submitted) proposalIds.push(submitted.id);
    }
    if (outcome.data.unassigned_sections.length > 0) {
      await this.files.writeJson(
        project,
        `catalog/imports/${importId}/unassigned.json`,
        outcome.data.unassigned_sections,
      );
    }

    await this.runs.finish(project, run, 'ok', { proposalIds });
    await this.events.emit(project, 'run.finished', {
      runId: run.id,
      pipeline: 'catalog-import',
      importId,
      proposals: proposalIds.length,
      unassigned: outcome.data.unassigned_sections.length,
    });
    return { runId: run.id, importId, proposalIds };
  }

  async getImport(project: string, importId: string): Promise<{
    convertedMarkdown: string;
    unassigned: Array<{ heading: string; note: string }>;
    proposals: any[];
  }> {
    let convertedMarkdown = '';
    try {
      convertedMarkdown = await this.files.readText(
        project,
        `catalog/imports/${importId}/converted.md`,
      );
    } catch {
      // not converted
    }
    let unassigned: Array<{ heading: string; note: string }> = [];
    try {
      unassigned = await this.files.readJson(project, `catalog/imports/${importId}/unassigned.json`);
    } catch {
      // none
    }
    const proposals = (await this.repository.listProposals(project, { kind: 'catalog_import' })).filter(
      (proposal) => proposal.payload?.importId === importId,
    );
    return { convertedMarkdown, unassigned, proposals };
  }

  /** mammoth-based DOCX→markdown with image extraction to stable ids. */
  private async convertDocx(
    project: string,
    importId: string,
    relativePath: string,
  ): Promise<{ markdown: string; images: Array<{ imageId: string; relativePath: string }> }> {
    const absolute = this.files.absolutePath(project, relativePath);
    if (!absolute.toLowerCase().endsWith('.docx')) {
      // markdown/text uploads pass through unchanged
      return { markdown: await this.files.readText(project, relativePath), images: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth');
    const images: Array<{ imageId: string; relativePath: string }> = [];
    let imageCounter = 0;

    const result = await mammoth.convertToMarkdown(
      { path: absolute },
      {
        convertImage: mammoth.images.imgElement(async (image: any) => {
          imageCounter++;
          const imageId = `img-${imageCounter}`;
          const buffer = Buffer.from(await image.read('base64'), 'base64');
          const imagePath = `catalog/imports/${importId}/images/${imageId}.png`;
          await this.files.writeFile(project, imagePath, buffer);
          images.push({ imageId, relativePath: imagePath });
          // spec §5.5: image references of the form ![alt](img:{image_id})
          return { src: `img:${imageId}` };
        }),
      },
    );
    return { markdown: result.value as string, images };
  }
}
