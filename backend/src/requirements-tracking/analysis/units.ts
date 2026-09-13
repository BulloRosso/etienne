/**
 * Units and numbers as they appear in German/English tender documents and
 * quantity workbooks. Pure functions, unit-tested; the consistency check
 * compares figures only after both sides are expressed in canonical units.
 */

export type CanonicalUnit =
  | 'EUR'
  | 'm2'
  | 'percent'
  | 'count'
  | 'hour'
  | 'minute'
  | 'second'
  | 'day'
  | 'month'
  | 'year'
  | 'kW'
  | 'kWh'
  | 'MW'
  | 'MWh'
  | 'km'
  | 'm'
  | 'kg'
  | 't'
  | 'celsius'
  | 'unknown';

export interface NormalizedUnit {
  unit: CanonicalUnit;
  /** multiply the raw value by this to express it in the canonical unit */
  factor: number;
  /** rate suffix ("/Tag", "pro Monat") when present */
  per?: CanonicalUnit;
}

interface UnitRule {
  re: RegExp;
  unit: CanonicalUnit;
  factor?: number;
}

const UNIT_RULES: UnitRule[] = [
  { re: /^(?:mrd\.?|milliarden?)\s*(?:€|eur|euro)?$/i, unit: 'EUR', factor: 1e9 },
  { re: /^(?:mio\.?|millionen?|million)\s*(?:€|eur|euro)?$/i, unit: 'EUR', factor: 1e6 },
  { re: /^(?:t€|teur|tsd\.?\s*(?:€|eur)|k€|keur|tausend\s*(?:€|euro))$/i, unit: 'EUR', factor: 1e3 },
  { re: /^(?:€|eur\.?|euro)$/i, unit: 'EUR' },
  { re: /^(?:m²|m2|qm|quadratmeter)$/i, unit: 'm2' },
  { re: /^(?:%|prozent|percent|pct)$/i, unit: 'percent' },
  { re: /^(?:h|std\.?|stunden?|hours?|hrs?)$/i, unit: 'hour' },
  { re: /^(?:min\.?|minuten?|minutes?)$/i, unit: 'minute' },
  { re: /^(?:s|sek\.?|sekunden?|seconds?|sec\.?)$/i, unit: 'second' },
  { re: /^(?:d|tage?n?|days?|at|arbeitstage?n?|werktage?n?|kalendertage?n?)$/i, unit: 'day' },
  { re: /^(?:monate?n?|months?|mon\.?)$/i, unit: 'month' },
  { re: /^(?:jahre?n?|years?|a\.?|jahr)$/i, unit: 'year' },
  { re: /^kwh$/i, unit: 'kWh' },
  { re: /^kw$/i, unit: 'kW' },
  { re: /^mwh$/i, unit: 'MWh' },
  { re: /^mw$/i, unit: 'MW' },
  { re: /^km$/i, unit: 'km' },
  { re: /^(?:m|meter|lfm)$/i, unit: 'm' },
  { re: /^kg$/i, unit: 'kg' },
  { re: /^(?:t|to\.?|tonnen?)$/i, unit: 't' },
  { re: /^(?:°\s?c|°|grad(?:\s*celsius)?)$/i, unit: 'celsius' },
  {
    re: /^(?:stück|stk\.?|pcs\.?|pieces?|paletten?|palettenstellpl(?:ä|a)tze|stellpl(?:ä|a)tze|positionen?|picks?|pickpositionen|auftragspositionen|einheiten?|anzahl|units?|mitarbeiter(?:innen)?|personen|fte|zeilen|auftr(?:ä|a)ge|sendungen|lieferungen|touren|fahrzeuge|artikel|sku|skus|ladungstr(?:ä|a)ger|colli|packst(?:ü|u)cke|kartons?)$/i,
    unit: 'count',
  },
];

const RATE_RE = /\s*(?:\/|pro|je|per)\s*([A-Za-zÄÖÜäöüß.]+)\s*$/i;

/** Normalize a raw unit string ("T€", "qm", "Std./Tag") to a canonical unit + factor. */
export function normalizeUnit(raw: string | null | undefined): NormalizedUnit {
  if (!raw) return { unit: 'unknown', factor: 1 };
  let text = raw.trim().replace(/^[(\[]|[)\]]$/g, '').trim();
  let per: CanonicalUnit | undefined;
  const rate = RATE_RE.exec(text);
  if (rate && text.length > rate[0].length) {
    const perUnit = normalizeUnit(rate[1]).unit;
    if (perUnit !== 'unknown') {
      per = perUnit;
      text = text.slice(0, text.length - rate[0].length).trim();
    }
  }
  for (const rule of UNIT_RULES) {
    if (rule.re.test(text)) return { unit: rule.unit, factor: rule.factor ?? 1, per };
  }
  // sentence punctuation glued to the unit ("m².", "Monate,")
  if (/[.,;:]$/.test(text)) {
    const stripped = normalizeUnit(text.replace(/[.,;:]+$/, ''));
    if (stripped.unit !== 'unknown') return { ...stripped, per: stripped.per ?? per };
  }
  return { unit: 'unknown', factor: 1, per };
}

/**
 * Find a unit inside a header/label like "Fläche (m²)", "Budget in T€",
 * "Reaktionszeit [Std.]", "Anzahl Palettenstellplätze".
 */
export function detectUnitInLabel(label: string | null | undefined): NormalizedUnit | null {
  if (!label) return null;
  const bracket = /[(\[]([^)\]]{1,24})[)\]]/.exec(label);
  if (bracket) {
    const normalized = normalizeUnit(bracket[1]);
    if (normalized.unit !== 'unknown') return normalized;
  }
  const inUnit = /\b(?:in|je|pro)\s+([A-Za-zÄÖÜäöüß€²%.]{1,16})\s*$/i.exec(label);
  if (inUnit) {
    const normalized = normalizeUnit(inUnit[1]);
    if (normalized.unit !== 'unknown') return normalized;
  }
  const tokens = label.split(/[\s/|,:;]+/).filter(Boolean);
  for (const token of [...tokens].reverse()) {
    const normalized = normalizeUnit(token);
    if (normalized.unit !== 'unknown' && normalized.unit !== 'count') return normalized;
  }
  for (const token of tokens) {
    const normalized = normalizeUnit(token);
    if (normalized.unit === 'count') return normalized;
  }
  return null;
}

/**
 * Parse "12.500", "12.500,50", "1,45", "1 450 000", "0.3" → number.
 * German conventions win: a lone comma is a decimal separator; a lone dot is
 * a thousands separator only when it groups exactly three digits.
 */
export function parseGermanNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  let s = String(text).trim().replace(/[\s   ']/g, '');
  if (!/^[-+]?\d[\d.,]*$/.test(s)) return null;
  const sign = s.startsWith('-') ? -1 : 1;
  s = s.replace(/^[-+]/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized =
      lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = s.split(',').length - 1;
    normalized = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(?:\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? sign * value : null;
}

export interface TextNumber {
  value: number; // in canonical unit
  unit: CanonicalUnit;
  raw: string; // the number as written, e.g. "1,45 Mio. €"
  approx: boolean;
  factor: number;
  per?: CanonicalUnit;
}

const NUMBER_TOKEN_RE = /(?<![\d.,§€])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?(?:\.\d+)?)(?![\d])/g;
const APPROX_RE = /(?:\bca\.?|\bcirca|\brund|\betwa|\bungef(?:ä|a)hr|~|≈)\s*$/i;
const MULTIPLIER_RE = /^\s*(mio\.?|mrd\.?|tsd\.?|millionen?|milliarden?|T|k)(?=[\s€]|$)/i;
const UNIT_TOKEN_RE =
  /^\s*(°\s?C|[€%²]|[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß²]{0,24}\.?(?:\s*(?:\/|pro|je)\s*[A-Za-zÄÖÜäöüß]{1,12})?)/;
const GLUED_UNIT_RE = /^(m²|m2|qm|kwh|kw|mwh|mw|km|kg)\b/i;

/**
 * Extract numbers with their units from free text. Section references
 * ("3.2.1"), times ("14:00"), paragraph refs ("§ 613a"), years without a
 * unit and small unit-less integers (list numbering) are skipped.
 */
export function extractNumbersFromText(text: string): TextNumber[] {
  const results: TextNumber[] = [];
  if (!text) return results;
  NUMBER_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER_TOKEN_RE.exec(text)) !== null) {
    const rawNumber = match[1];
    const start = match.index;
    const end = start + rawNumber.length;
    const after = text.slice(end, end + 40);
    const before = text.slice(Math.max(0, start - 14), start);

    if (/^[.:,]\d/.test(after)) continue; // 3.2.1 / 14:00 / 1,5 (already consumed)
    if (/^[a-zäöü]/i.test(after) && !GLUED_UNIT_RE.test(after)) {
      // "613a", "12x", "3rd" — letters glued to the number are identifiers, except "18.500m²"
      continue;
    }
    const parsed = parseGermanNumber(rawNumber);
    if (parsed === null) continue;

    let rest = after;
    let factor = 1;
    let unitRaw = '';
    const multiplier = MULTIPLIER_RE.exec(rest);
    if (multiplier) {
      unitRaw = multiplier[1];
      rest = rest.slice(multiplier[0].length);
    }
    const unitMatch = UNIT_TOKEN_RE.exec(rest);
    const candidates: string[] = [];
    if (unitMatch) {
      const token = unitMatch[1].replace(/\s+/g, ' ').trim();
      if (unitRaw) candidates.push(`${unitRaw} ${token}`);
      candidates.push(token);
    }
    if (unitRaw) candidates.push(unitRaw);

    let normalized: NormalizedUnit = { unit: 'unknown', factor: 1 };
    let chosen = '';
    for (const candidate of candidates) {
      const attempt = normalizeUnit(candidate);
      if (attempt.unit !== 'unknown') {
        normalized = attempt;
        chosen = candidate;
        break;
      }
    }
    if (normalized.unit === 'unknown' && unitRaw) {
      // "1,45 Mio." without a currency — keep the magnitude, unit unknown
      factor = normalizeUnit(`${unitRaw} €`).factor;
      chosen = unitRaw;
    } else {
      factor = normalized.factor;
    }

    const isYear =
      normalized.unit === 'unknown' && /^\d{4}$/.test(rawNumber) && parsed >= 1900 && parsed <= 2100;
    if (isYear) continue;
    if (normalized.unit === 'unknown' && Math.abs(parsed) < 10 && Number.isInteger(parsed)) continue;
    if (normalized.unit === 'unknown' && /^\.\s/.test(after)) continue; // "1. Gegenstand"

    results.push({
      value: parsed * factor,
      unit: normalized.unit,
      raw: chosen ? `${rawNumber} ${chosen}`.trim() : rawNumber,
      approx: APPROX_RE.test(before),
      factor,
      per: normalized.per,
    });
  }
  return results;
}

export interface ToleranceResult {
  equal: boolean;
  deviationAbs: number;
  deviationPct: number;
  tolerance: number;
}

function halfLastDigit(raw: string | undefined, factor: number): number {
  if (!raw) return 0.5 * factor;
  const numberPart = /[-+]?\d[\d.,\s]*/.exec(raw)?.[0]?.replace(/\s/g, '') ?? '';
  const lastDot = numberPart.lastIndexOf('.');
  const lastComma = numberPart.lastIndexOf(',');
  let decimals = 0;
  if (lastComma >= 0 && lastComma > lastDot) decimals = numberPart.length - lastComma - 1;
  else if (lastDot >= 0 && !/^\d{1,3}(?:\.\d{3})+$/.test(numberPart)) {
    decimals = numberPart.length - lastDot - 1;
  }
  return 0.5 * Math.pow(10, -decimals) * factor;
}

/**
 * Two figures denote the same value when they differ by less than 0.5 % of
 * the reference or half of the last written digit (so "1,45 Mio. €" equals
 * 1.450.000 €), widened to 5 % for approximate wording ("ca. 12.000").
 */
export function withinTolerance(
  a: { value: number; raw?: string; approx?: boolean; factor?: number },
  b: { value: number },
): ToleranceResult {
  const deviationAbs = Math.abs(a.value - b.value);
  const reference = Math.max(Math.abs(b.value), Number.EPSILON);
  let tolerance = Math.max(0.005 * reference, halfLastDigit(a.raw, a.factor ?? 1));
  if (a.approx) tolerance = Math.max(tolerance, 0.05 * reference);
  return {
    equal: deviationAbs <= tolerance,
    deviationAbs,
    deviationPct: (deviationAbs / reference) * 100,
    tolerance,
  };
}

/** Units that may legitimately be compared with each other. */
export function unitsCompatible(a: CanonicalUnit, b: CanonicalUnit): boolean {
  if (a === b) return true;
  const loose = new Set<CanonicalUnit>(['unknown', 'count']);
  return loose.has(a) && loose.has(b);
}
