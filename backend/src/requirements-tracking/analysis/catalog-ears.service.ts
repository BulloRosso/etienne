import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { TtRepository } from '../graph/tt-repository';
import { TtFilesService } from '../store/files.service';
import { TtCatalogService } from '../catalog.service';
import { SearchProjectionService } from '../search-projection.service';
import { RunRegistryService } from '../pipelines/run-registry.service';
import { loadPrompt } from '../pipelines/prompt-loader';
import { runStructured } from '../pipelines/structured-run';
import { validateQuote } from '../pipelines/quote-validator';
import { catalogEarsSchema, CatalogEarsResult } from '../schemas/analysis.schema';
import { CapabilityStatement, CatalogService, ServiceVersion } from '../types/tendertrace-types';

/**
 * Catalog → EARS: expresses every published service as capability and
 * limitation statements (P-CAT-EARS) so requirement↔service matching is
 * EARS-to-EARS. Statements live on the ServiceVersion record, in a side
 * file next to the body, and in the search projection text.
 */
@Injectable()
export class CatalogEarsService {
  private readonly logger = new Logger(CatalogEarsService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly repository: TtRepository,
    private readonly files: TtFilesService,
    private readonly catalog: TtCatalogService,
    private readonly projections: SearchProjectionService,
    private readonly runs: RunRegistryService,
  ) {}

  async ensureCapabilities(
    project: string,
    serviceIds: string[],
    opts: {
      force?: boolean;
      onProgress?: (step: number, total: number, message: string) => Promise<void> | void;
    } = {},
  ): Promise<{ generated: number; skipped: number; failed: number; statements: number }> {
    const summary = { generated: 0, skipped: 0, failed: 0, statements: 0 };
    for (let index = 0; index < serviceIds.length; index++) {
      const serviceId = serviceIds[index];
      const bundle = await this.catalog.getWithBody(project, serviceId);
      if (!bundle || bundle.version.status !== 'published') {
        summary.skipped++;
        continue;
      }
      await opts.onProgress?.(index + 1, serviceIds.length, bundle.service.title);
      if (!opts.force && (bundle.version.earsCapabilities?.length ?? 0) > 0) {
        summary.skipped++;
        summary.statements += bundle.version.earsCapabilities!.length;
        continue;
      }
      try {
        const statements = await this.generate(project, bundle.service, bundle.version, bundle.bodyMarkdown);
        const updated: ServiceVersion = { ...bundle.version, earsCapabilities: statements };
        await this.repository.saveServiceVersion(project, updated);
        await this.files.writeJson(
          project,
          `catalog/services/${bundle.service.key}/v${bundle.version.versionNo}/capabilities.json`,
          statements,
        );
        await this.projections.indexServiceVersion(project, bundle.service, updated, bundle.bodyMarkdown);
        summary.generated++;
        summary.statements += statements.length;
      } catch (error: any) {
        this.logger.warn(`Capability statements failed for ${serviceId}: ${error.message}`);
        summary.failed++;
      }
    }
    return summary;
  }

  async generate(
    project: string,
    service: CatalogService,
    version: ServiceVersion,
    bodyMarkdown: string,
  ): Promise<CapabilityStatement[]> {
    const prompt = loadPrompt('p-cat-ears.v1');
    const run = await this.runs.start(project, {
      pipeline: 'catalog-ears',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('regular'),
    });

    const scopeLines = [
      ...version.scope.included.map((s) => `included: ${s}`),
      ...version.scope.excluded.map((s) => `excluded: ${s}`),
      ...version.scope.prerequisites.map((s) => `prerequisites: ${s}`),
      ...version.scope.deliverables.map((s) => `deliverables: ${s}`),
    ];
    const sourceText = `${scopeLines.join('\n')}\n${bodyMarkdown}`;
    const userMessage =
      `<service id="${service.id}" version_no="${version.versionNo}" title="${service.title}" ` +
      `tags="${version.tags.join(',')}">\n<scope>\n${scopeLines.join('\n') || '(none)'}\n</scope>\n\n` +
      `${bodyMarkdown}\n</service>`;

    const outcome = await runStructured(this.llm, {
      schema: catalogEarsSchema,
      systemPrompt: prompt.text,
      userMessage,
      tier: 'regular',
      temperature: 0,
      maxOutputTokens: 8000,
      postValidators: [
        (data: CatalogEarsResult) => {
          for (const statement of data.statements) {
            if (!validateQuote(sourceText, statement.evidence_quote).valid) {
              return `Statement "${statement.ears_text.slice(0, 60)}…": evidence_quote is not a verbatim snippet of the service text.`;
            }
          }
          return null;
        },
      ],
    });
    if (!outcome.ok || !outcome.data) {
      await this.runs.finish(project, run, 'failed');
      throw new Error(`P-CAT-EARS failed for ${service.id}: ${outcome.error}`);
    }
    await this.runs.finish(project, run, 'ok');
    return outcome.data.statements.map((statement) => ({
      earsText: statement.ears_text,
      pattern: statement.pattern,
      kind: statement.kind,
      scopeRef: statement.scope_ref,
      evidenceQuote: statement.evidence_quote,
    }));
  }

  /** Render capability statements for the <service> blocks of P-CAT-M / P-RESP-C. */
  static renderCapabilities(version: ServiceVersion): string {
    const statements = version.earsCapabilities ?? [];
    if (statements.length === 0) return '';
    return (
      `<capabilities>\n` +
      statements.map((s) => `- [${s.kind}/${s.scopeRef}] ${s.earsText}`).join('\n') +
      `\n</capabilities>`
    );
  }
}
