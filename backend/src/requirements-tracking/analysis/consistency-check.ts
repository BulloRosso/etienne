import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { TtRepository } from '../graph/tt-repository';
import { TtEventsService } from '../events.service';
import { RunRegistryService } from '../pipelines/run-registry.service';
import { loadPrompt } from '../pipelines/prompt-loader';
import { runStructured } from '../pipelines/structured-run';
import { consistencyResultSchema } from '../schemas/analysis.schema';
import { ConsistencyAlert, Proposal } from '../types/tendertrace-types';
import { Figure } from './excel-figures';
import {
  CanonicalUnit,
  TextNumber,
  extractNumbersFromText,
  normalizeUnit,
  unitsCompatible,
  withinTolerance,
} from './units';

/**
 * Excel consistency check: for every extraction proposal, find workbook
 * figures that denote the SAME quantity (semantic matching by P-CONSIST on
 * a deterministically pre-filtered candidate set) and raise an alert only
 * when the values differ beyond tolerance. Matched-and-equal pairs are
 * recorded but never alerted; requirements without numbers cost no LLM call.
 */

const MAX_CANDIDATES = 8;
const MIN_MATCH_CONFIDENCE = 0.6;
const MAGNITUDE_WINDOW: [number, number] = [0.2, 5];

interface RequirementQuantity {
  ref: string; // q0 / t1
  value: number;
  unit: CanonicalUnit;
  raw: string;
  approx: boolean;
  factor: number;
  origin: 'quantities' | 'text';
}

export interface ConsistencyProgress {
  (step: number, total: number, message: string): Promise<void> | void;
}

export interface ConsistencyRunResult {
  checked: number;
  matched: number;
  skipped: number;
  llmCalls: number;
  alerts: Array<ConsistencyAlert & { proposalId: string }>;
}

/** Deterministic candidate pre-filter (exported for the unit test). */
export function candidateFigures(quantities: RequirementQuantity[], figures: Figure[], context: string): Figure[] {
  const tokens = new Set(
    context
      .toLowerCase()
      .split(/[^a-zäöüß0-9]+/)
      .filter((token) => token.length >= 4),
  );
  const scored: Array<{ figure: Figure; score: number }> = [];
  for (const figure of figures) {
    if (figure.kind === 'year') continue;
    let best = 0;
    for (const quantity of quantities) {
      if (!unitsCompatible(quantity.unit, figure.unit)) continue;
      const ratio = figure.value === 0 ? (quantity.value === 0 ? 1 : Infinity) : quantity.value / figure.value;
      const magnitudeOk = ratio >= MAGNITUDE_WINDOW[0] && ratio <= MAGNITUDE_WINDOW[1];
      const labelTokens = figure.label
        .toLowerCase()
        .split(/[^a-zäöüß0-9]+/)
        .filter((token) => token.length >= 4);
      const overlap = labelTokens.filter((token) => tokens.has(token)).length;
      const labelOk = labelTokens.length > 0 && overlap / labelTokens.length >= 0.15;
      if (!magnitudeOk && !labelOk) continue;
      const score = (magnitudeOk ? 1 : 0) + (labelOk ? 1 + overlap : 0) + (quantity.unit === figure.unit && figure.unit !== 'unknown' ? 1 : 0);
      if (score > best) best = score;
    }
    if (best > 0) scored.push({ figure, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.figure);
}

/** Quantities of one proposal: structured `quantities[]` ∪ numbers found in text (exported for the unit test). */
export function requirementQuantities(payload: any): RequirementQuantity[] {
  const result: RequirementQuantity[] = [];
  const seen = new Set<string>();
  const push = (entry: RequirementQuantity) => {
    const key = `${entry.unit}:${Math.round(entry.value * 1000)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(entry);
  };
  const structured: Array<{ value: number; unit: string }> = Array.isArray(payload?.quantities) ? payload.quantities : [];
  structured.forEach((quantity, index) => {
    if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) return;
    const normalized = normalizeUnit(quantity.unit);
    push({
      ref: `q${index}`,
      value: quantity.value * normalized.factor,
      unit: normalized.unit,
      raw: `${quantity.value} ${quantity.unit ?? ''}`.trim(),
      approx: false,
      factor: normalized.factor,
      origin: 'quantities',
    });
  });
  const text = [payload?.ears_text, payload?.source?.quote].filter(Boolean).join('\n');
  extractNumbersFromText(text).forEach((number: TextNumber, index) => {
    push({
      ref: `t${index}`,
      value: number.value,
      unit: number.unit,
      raw: number.raw,
      approx: number.approx,
      factor: number.factor,
      origin: 'text',
    });
  });
  return result;
}

@Injectable()
export class ConsistencyCheckService {
  private readonly logger = new Logger(ConsistencyCheckService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly repository: TtRepository,
    private readonly events: TtEventsService,
    private readonly runs: RunRegistryService,
  ) {}

  async run(
    project: string,
    proposalIds: string[],
    figures: Figure[],
    opts: { onProgress?: ConsistencyProgress; runTag?: string } = {},
  ): Promise<ConsistencyRunResult> {
    const result: ConsistencyRunResult = { checked: 0, matched: 0, skipped: 0, llmCalls: 0, alerts: [] };
    if (proposalIds.length === 0 || figures.length === 0) {
      result.skipped = proposalIds.length;
      return result;
    }

    const prompt = loadPrompt('p-consist.v1');
    const run = await this.runs.start(project, {
      pipeline: 'consistency',
      promptVersion: prompt.version,
      promptHash: prompt.hash,
      model: this.llm.getModelId('small'),
    });

    for (let index = 0; index < proposalIds.length; index++) {
      const proposalId = proposalIds[index];
      const proposal = await this.repository.getProposal(project, proposalId);
      if (!proposal) continue;
      await opts.onProgress?.(index + 1, proposalIds.length, proposalId);

      const quantities = requirementQuantities(proposal.payload);
      if (quantities.length === 0) {
        result.skipped++;
        continue;
      }
      const context = `${proposal.payload?.ears_text ?? ''} ${proposal.payload?.source?.quote ?? ''}`;
      const candidates = candidateFigures(quantities, figures, context);
      if (candidates.length === 0) {
        result.skipped++;
        continue;
      }
      result.checked++;

      const userMessage =
        `<requirement id="${proposal.id}">\n` +
        `ears_text: ${proposal.payload?.ears_text ?? ''}\n` +
        `quote: ${proposal.payload?.source?.quote ?? ''}\n` +
        `quantities:\n` +
        quantities.map((q) => `  ${q.ref}: ${q.value} ${q.unit} (im Text: "${q.raw}")`).join('\n') +
        `\n</requirement>\n\n<figures>\n` +
        candidates
          .map((f) => `${f.id} | ${f.label} | ${f.value} ${f.unit} | Zelle: "${f.rawText}"`)
          .join('\n') +
        `\n</figures>`;

      result.llmCalls++;
      const outcome = await runStructured(this.llm, {
        schema: consistencyResultSchema,
        systemPrompt: prompt.text,
        userMessage,
        tier: 'small',
        temperature: 0,
        maxOutputTokens: 2000,
        postValidators: [
          (data) => {
            for (const match of data.matches) {
              if (!candidates.some((f) => f.id === match.figure_id)) {
                return `Unknown figure_id ${match.figure_id} — cite only the provided figures.`;
              }
              if (!quantities.some((q) => q.ref === match.quantity_ref)) {
                return `Unknown quantity_ref ${match.quantity_ref} — cite only the provided quantity refs.`;
              }
            }
            return null;
          },
        ],
      });
      if (!outcome.ok || !outcome.data) {
        this.logger.warn(`Consistency check failed for ${proposal.id}: ${outcome.error}`);
        continue;
      }

      const alerts: ConsistencyAlert[] = [];
      const usedFigures = new Set<string>();
      for (const match of outcome.data.matches) {
        if (!match.same_quantity || match.confidence < MIN_MATCH_CONFIDENCE) continue;
        if (usedFigures.has(match.figure_id)) continue;
        const figure = candidates.find((f) => f.id === match.figure_id)!;
        const quantity = quantities.find((q) => q.ref === match.quantity_ref)!;
        usedFigures.add(figure.id);
        result.matched++;
        const tolerance = withinTolerance(
          { value: quantity.value, raw: quantity.raw, approx: quantity.approx, factor: quantity.factor },
          { value: figure.value },
        );
        if (tolerance.equal) continue;
        alerts.push({
          figureId: figure.id,
          sheet: figure.sheet,
          cell: figure.cell,
          label: figure.label,
          tenderValue: quantity.value,
          tenderUnit: quantity.unit,
          tenderRaw: quantity.raw,
          excelValue: figure.value,
          excelUnit: figure.unit,
          excelRaw: figure.rawText,
          deviationAbs: tolerance.deviationAbs,
          deviationPct: Math.round(tolerance.deviationPct * 10) / 10,
          note: match.reasoning,
          severity: tolerance.deviationPct >= 5 ? 'error' : 'warning',
        });
      }

      await this.persist(project, proposal, alerts, candidates.length, opts.runTag);
      for (const alert of alerts) {
        result.alerts.push({ ...alert, proposalId: proposal.id });
        await this.events.emit(project, 'analysis.alert', {
          runId: opts.runTag,
          proposalId: proposal.id,
          alert,
        });
      }
    }

    await this.runs.finish(project, run, 'ok');
    return result;
  }

  /** Write alerts onto the proposal payload; keep resolutions of alerts that re-occur unchanged. */
  private async persist(
    project: string,
    proposal: Proposal,
    alerts: ConsistencyAlert[],
    figuresConsidered: number,
    runTag?: string,
  ): Promise<void> {
    const previous: ConsistencyAlert[] = proposal.payload?.consistency_alerts ?? [];
    const merged = alerts.map((alert) => {
      const earlier = previous.find(
        (candidate) =>
          candidate.figureId === alert.figureId &&
          candidate.tenderValue === alert.tenderValue &&
          candidate.excelValue === alert.excelValue,
      );
      return earlier?.resolution ? { ...alert, resolution: earlier.resolution, resolvedBy: earlier.resolvedBy, resolvedAt: earlier.resolvedAt, resolutionNote: earlier.resolutionNote } : alert;
    });
    await this.repository.updateProposal(project, {
      ...proposal,
      payload: {
        ...proposal.payload,
        consistency_alerts: merged,
        consistency_checked: { figures: figuresConsidered, at: new Date().toISOString(), runId: runTag },
      },
    });
  }
}
