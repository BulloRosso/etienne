import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { LlmService } from '../../llm/llm.service';
import { TtFilesService } from '../store/files.service';
import { RunRegistryService } from '../pipelines/run-registry.service';
import { loadPrompt, renderPrompt } from '../pipelines/prompt-loader';
import { runStructured } from '../pipelines/structured-run';
import { glossarySchema, GlossaryResult } from '../schemas/analysis.schema';

/**
 * Domain glossary: OUR catalog vocabulary with definitions, synonyms and the
 * customer phrasings a tender is likely to use. Built once per catalog
 * version by P-GLOSSARY (LLM) and merged with an optional user-maintained
 * `servicecatalog/glossary.md`. Rendered as the <glossary> block of
 * P-EXTRACT v2 so extraction can emit `domain_text` in our vocabulary.
 */

export interface GlossaryTerm {
  ourTerm: string;
  definition: string;
  synonyms: string[];
  customerTerms: string[];
  source: 'catalog' | 'user';
}

export interface Glossary {
  language: string;
  terms: GlossaryTerm[];
  catalogSha256: string;
  userSha256?: string;
  builtAt: string;
  promptVersion?: string;
}

export const GLOSSARY_PATH = 'analysis/glossary.json';

@Injectable()
export class GlossaryService {
  private readonly logger = new Logger(GlossaryService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly files: TtFilesService,
    private readonly runs: RunRegistryService,
  ) {}

  private sha(text: string | undefined): string | undefined {
    return text === undefined ? undefined : crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Build (or reuse) the glossary for the given catalog markdown. Cached at
   * requirements-tracking/analysis/glossary.json keyed by catalog + user
   * glossary hashes; `force` rebuilds.
   */
  async build(
    project: string,
    catalogMarkdown: string,
    userGlossaryMarkdown?: string,
    opts: { force?: boolean; language?: string } = {},
  ): Promise<{ glossary: Glossary; cached: boolean; runId?: string }> {
    const catalogSha256 = this.sha(catalogMarkdown)!;
    const userSha256 = this.sha(userGlossaryMarkdown);

    if (!opts.force) {
      try {
        const cached = await this.files.readJson<Glossary>(project, GLOSSARY_PATH);
        if (cached.catalogSha256 === catalogSha256 && cached.userSha256 === userSha256) {
          return { glossary: cached, cached: true };
        }
      } catch {
        // no cache yet
      }
    }

    const userTerms = userGlossaryMarkdown ? this.parseUserGlossary(userGlossaryMarkdown) : [];
    let catalogTerms: GlossaryTerm[] = [];
    let language = opts.language ?? 'de';
    let runId: string | undefined;

    if (catalogMarkdown.trim().length > 0) {
      const prompt = loadPrompt('p-glossary.v1');
      const run = await this.runs.start(project, {
        pipeline: 'glossary',
        promptVersion: prompt.version,
        promptHash: prompt.hash,
        model: this.llm.getModelId('regular'),
      });
      runId = run.id;
      const outcome = await runStructured(this.llm, {
        schema: glossarySchema,
        systemPrompt: renderPrompt(prompt, { language }),
        userMessage: `<catalog>\n${catalogMarkdown.slice(0, 60000)}\n</catalog>`,
        tier: 'regular',
        temperature: 0,
        maxOutputTokens: 12000,
      });
      if (outcome.ok && outcome.data) {
        catalogTerms = this.fromResult(outcome.data);
        language = outcome.data.language || language;
        await this.runs.finish(project, run, 'ok');
      } else {
        this.logger.warn(`Glossary build failed for ${project}: ${outcome.error}`);
        await this.runs.finish(project, run, 'failed');
      }
    }

    const glossary: Glossary = {
      language,
      terms: this.merge(catalogTerms, userTerms),
      catalogSha256,
      userSha256,
      builtAt: new Date().toISOString(),
      promptVersion: 'v1',
    };
    await this.files.writeJson(project, GLOSSARY_PATH, glossary);
    return { glossary, cached: false, runId };
  }

  private fromResult(result: GlossaryResult): GlossaryTerm[] {
    return result.terms
      .filter((term) => term.our_term.trim().length > 0)
      .slice(0, 120)
      .map((term) => ({
        ourTerm: term.our_term.trim(),
        definition: term.definition.trim(),
        synonyms: uniq(term.synonyms),
        customerTerms: uniq(term.customer_terms),
        source: 'catalog' as const,
      }));
  }

  /**
   * User glossary formats (servicecatalog/glossary.md):
   *   | Kundenbegriff | Unser Begriff | Hinweis |   (markdown table)
   *   - Kundenbegriff → Unser Begriff (Hinweis)    (bullets; also "->" and "=")
   */
  parseUserGlossary(markdown: string): GlossaryTerm[] {
    const byOurTerm = new Map<string, GlossaryTerm>();
    const add = (customer: string, ours: string, note: string) => {
      const ourTerm = ours.trim();
      const customerTerm = customer.trim();
      if (!ourTerm || !customerTerm) return;
      const key = ourTerm.toLowerCase();
      const existing = byOurTerm.get(key);
      if (existing) {
        if (!existing.customerTerms.includes(customerTerm)) existing.customerTerms.push(customerTerm);
        if (note && !existing.definition) existing.definition = note.trim();
      } else {
        byOurTerm.set(key, {
          ourTerm,
          definition: note.trim(),
          synonyms: [],
          customerTerms: [customerTerm],
          source: 'user',
        });
      }
    };

    for (const rawLine of markdown.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('|')) {
        const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
        if (cells.length < 2) continue;
        if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue; // separator row
        if (/^kundenbegriff|^customer/i.test(cells[0]) && /unser|our/i.test(cells[1])) continue; // header
        add(cells[0], cells[1], cells[2] ?? '');
        continue;
      }
      const bullet = /^[-*+]\s+(.+?)\s*(?:→|->|=>|=)\s*(.+?)\s*(?:\((.*)\))?$/.exec(line);
      if (bullet) add(bullet[1], bullet[2], bullet[3] ?? '');
    }
    return [...byOurTerm.values()];
  }

  /** User entries win: they add customer terms to catalog terms or create new ones. */
  private merge(catalogTerms: GlossaryTerm[], userTerms: GlossaryTerm[]): GlossaryTerm[] {
    const merged = new Map<string, GlossaryTerm>();
    for (const term of catalogTerms) merged.set(term.ourTerm.toLowerCase(), { ...term });
    for (const term of userTerms) {
      const key = term.ourTerm.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.customerTerms = uniq([...term.customerTerms, ...existing.customerTerms]);
        if (!existing.definition && term.definition) existing.definition = term.definition;
        existing.source = 'user';
      } else {
        merged.set(key, { ...term });
      }
    }
    return [...merged.values()];
  }

  /** Render the <glossary> block for P-EXTRACT v2 (bounded size). */
  render(glossary: Glossary | null | undefined, maxChars = 6000): string {
    if (!glossary || glossary.terms.length === 0) return '';
    const lines: string[] = [];
    let used = 0;
    for (const term of glossary.terms) {
      const parts = [`- ${term.ourTerm}`];
      if (term.customerTerms.length > 0) parts.push(`Kundenbegriffe: ${term.customerTerms.join(', ')}`);
      if (term.synonyms.length > 0) parts.push(`Synonyme: ${term.synonyms.join(', ')}`);
      if (term.definition) parts.push(term.definition);
      const line = parts.join(' — ');
      if (used + line.length + 1 > maxChars) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.join('\n');
  }

  async load(project: string): Promise<Glossary | null> {
    try {
      return await this.files.readJson<Glossary>(project, GLOSSARY_PATH);
    } catch {
      return null;
    }
  }
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
