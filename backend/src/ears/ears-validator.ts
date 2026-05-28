/**
 * EARS structural validator — pure rules, no LLM.
 *
 * Three jobs:
 *
 *   1. `validateRequirement(req)` — runs per-type completeness checks and
 *      ambiguity heuristics. Returns a small flag set the cockpit renders
 *      as warning chips on the row.
 *
 *   2. `splitCompound(req)` — splits "the system shall do X and Y" into
 *      two atomic requirements. Conservative: only splits when the EARS
 *      text clearly contains multiple verbs joined by "and"/"or". If the
 *      LLM-extracted `action` field is a single verb, that's a strong
 *      signal it was already atomised — leave it alone.
 *
 *   3. `proposeClarification(req)` — templates a clarification question
 *      from `ambiguity_notes` so the bid manager can paste it into the
 *      buyer Q&A as a structured question.
 *
 * Why rule-based: deterministic, auditable, free. The cockpit shows
 * *why* a row is flagged, not just *that* it is; LLM-graded ambiguity
 * is impossible to debug when the verdict disagrees with the rule.
 */

export type EarsType =
  | 'ubiquitous'
  | 'event_driven'
  | 'state_driven'
  | 'unwanted_behavior'
  | 'optional';

export type ValidationFlag =
  | 'missing-trigger'        // event_driven / unwanted_behavior / optional with empty trigger
  | 'missing-state'          // state_driven with no named state in the trigger
  | 'missing-action'         // any with empty action
  | 'missing-measurable'     // constraint contains a weasel word but no number/unit
  | 'vague-modal'            // matches the vague-modal regex
  | 'compound-suspected';    // ears text contains "and"/"or" between two verbs

/**
 * Minimal subset of `Requirement` the validator needs. Kept loose so the
 * seed can pass coverage-row-shaped objects directly without a converter.
 */
export interface ValidatableRequirement {
  id?: string;
  requirementId?: string;          // coverage-row alias for id
  ears_normalized?: string;
  ears?: string;                   // coverage-row alias
  ears_type?: EarsType;
  earsType?: EarsType;
  trigger_condition?: string;
  trigger?: string;
  actor?: string;
  action?: string;
  constraint?: string;
  ambiguity_flag?: boolean;
  ambiguityFlag?: boolean;
  ambiguity_notes?: string;
  ambiguityNotes?: string;
  source_section?: string;
  sourceLocation?: string;
}

const VAGUE_MODAL_RE =
  /\b(?:should\s+ideally|where\s+appropriate|as\s+far\s+as\s+possible|if\s+necessary|where\s+feasible|to\s+the\s+extent\s+possible|may\s+consider|wo\s+m[oö]glich|wenn\s+m[oö]glich|nach\s+M[oö]glichkeit|soweit\s+m[oö]glich|gegebenenfalls|ggf\.?)\b/i;

const WEASEL_WORDS_RE =
  /\b(?:sufficient|adequate|reasonable|appropriate|acceptable|suitable|effective|robust|good|fast|quick|slow|small|large|ausreichend|angemessen|geeignet|hinreichend|akzeptabel|robust)\b/i;

const HAS_NUMBER_WITH_UNIT_RE =
  /\b\d+(?:[.,]\d+)?\s*(?:%|s|ms|m|km|kHz|MHz|GHz|kV|MV|V|kA|A|W|kW|MW|GW|°C|°F|Hz|°|pu|bar|Pa|kPa|MPa|min|h|d|year|years|Jahr|Jahre|Sekunden?|Minuten?|Stunden?|Tag(?:e|en)?)\b/i;

// "the system shall do X and (then|also)? do Y" — two verbs separated by and/or.
// Conservative: looks for a *verb-like* token (shall|must|will|darf|muss|soll) repeating.
const COMPOUND_RE =
  /\b(?:shall|must|will|should|may|darf|muss|soll|sollte|kann)\b[\s\S]{5,200}?\b(?:and|or|und|oder)\b[\s\S]{0,40}?\b(?:also|then|additionally|further|auch|zudem|weiterhin)?\s*\b(?:shall|must|will|should|may|darf|muss|soll|sollte|kann|provide|deliver|maintain|ensure|support|generate|emit|bereitstellen|liefern|gew[äa]hrleisten|sicherstellen|unterst[üu]tzen)\b/i;

// Read a field by either snake_case (LLM/extraction shape) or camelCase
// (coverage-row shape) so callers don't need a converter.
function pick<T>(obj: any, snake: string, camel: string): T | undefined {
  if (obj == null) return undefined;
  return (obj[snake] ?? obj[camel]) as T | undefined;
}

function isEmpty(s: unknown): boolean {
  return typeof s !== 'string' || s.trim().length === 0;
}

/**
 * Run per-type structural checks + ambiguity heuristics. Returns the
 * complete (unique, stable-ordered) flag set for the requirement.
 */
export function validateRequirement(req: ValidatableRequirement): ValidationFlag[] {
  const flags = new Set<ValidationFlag>();

  const ears = pick<string>(req, 'ears_normalized', 'ears') ?? '';
  const type = pick<EarsType>(req, 'ears_type', 'earsType');
  const triggerProvided = pick<string>(req, 'trigger_condition', 'trigger');
  const trigger = triggerProvided ?? '';
  const actionProvided = req.action;
  const action = actionProvided ?? '';
  const constraint = req.constraint ?? '';

  // Per-type completeness checks. They only fire when the caller has
  // *provided* the relevant structural field — an undefined field means
  // "we don't know" (e.g. coverage rows without enriched KG properties),
  // not "the requirement is broken". This prevents the validator from
  // crying wolf on every row of a legacy dataset.
  if (type === 'event_driven' || type === 'unwanted_behavior' || type === 'optional') {
    if (triggerProvided !== undefined && isEmpty(trigger)) flags.add('missing-trigger');
  }
  if (type === 'state_driven' && triggerProvided !== undefined) {
    // "named state" = the trigger contains a noun-phrase-looking token
    // (anything beyond a bare while/wenn). We can't parse grammar without
    // an NLP model, so the proxy is: trigger has at least 3 words after
    // the leading marker.
    const stripped = trigger.replace(/^(while|w[aä]hrend)\s+/i, '').trim();
    if (stripped.split(/\s+/).length < 3) flags.add('missing-state');
  }
  if (actionProvided !== undefined && isEmpty(action)) flags.add('missing-action');

  // Ambiguity heuristics — run regardless of type
  if (VAGUE_MODAL_RE.test(ears)) flags.add('vague-modal');
  if (WEASEL_WORDS_RE.test(constraint) && !HAS_NUMBER_WITH_UNIT_RE.test(constraint)) {
    flags.add('missing-measurable');
  }
  if (COMPOUND_RE.test(ears) && !isSingleVerbAction(action)) {
    flags.add('compound-suspected');
  }

  return [...flags];
}

/**
 * Split a "shall do X and Y" requirement into two atoms. Returns the
 * caller's input as a single-element array if no clean split is found —
 * never silently drops content.
 *
 * Each emitted atom inherits the parent's metadata and gets a suffixed
 * id (`-a`, `-b`, …). Callers thread `splitFrom: parent.id` onto the
 * atoms so the cockpit can show provenance.
 */
export function splitCompound<T extends ValidatableRequirement>(
  req: T,
): Array<T & { id: string; ears_normalized: string }> {
  const ears = pick<string>(req, 'ears_normalized', 'ears') ?? '';
  // Accept either the extraction-shape `id` or the coverage-row
  // `requirementId` as the parent id — atoms suffix from whichever.
  const id = req.id ?? req.requirementId ?? '';
  // Guard: if the LLM-extracted `action` is a single verb, the parse was
  // already atomic — don't re-split it even if the EARS prose happens to
  // contain "and". This matches the validator's compound-suspected rule.
  if (isSingleVerbAction(req.action ?? '')) {
    return [{ ...req, id, ears_normalized: ears }] as Array<
      T & { id: string; ears_normalized: string }
    >;
  }
  // Cheap split: look for "the <actor> shall <X>, and shall <Y>" or
  // "the <actor> shall <X> and <Y>". We split on the conjunction only
  // when it is followed by either (a) another modal verb or (b) one of
  // a small set of action verbs. The COMPOUND_RE proves this is
  // possible; here we actually do it.
  const match = ears.match(
    /^(?<head>.*?\b(?:shall|must|will|should|may|darf|muss|soll|sollte|kann)\b\s+)(?<a>.+?)\s+(?:and|or|und|oder)\s+(?:also\s+|then\s+|auch\s+|zudem\s+)?(?<b>.+)$/i,
  );
  if (!match?.groups) return [{ ...req, id, ears_normalized: ears }] as Array<
    T & { id: string; ears_normalized: string }
  >;
  const head = match.groups.head;
  const a = match.groups.a.replace(/[.;,]\s*$/, '').trim();
  // Strip a redundant leading modal + optional adverb from the second
  // clause when the head already ends with a modal — otherwise the atom
  // reads "the converter shall shall also restore …".
  const b = match.groups.b
    .replace(
      /^(?:shall|must|will|should|may|darf|muss|soll|sollte|kann)\s+(?:also\s+|then\s+|auch\s+|zudem\s+)?/i,
      '',
    )
    .replace(/[.;,]\s*$/, '')
    .trim();
  if (!a || !b) {
    return [{ ...req, id, ears_normalized: ears }] as Array<
      T & { id: string; ears_normalized: string }
    >;
  }
  return [
    { ...req, id: `${id}-a`, ears_normalized: `${head}${a}.` } as T & {
      id: string;
      ears_normalized: string;
    },
    { ...req, id: `${id}-b`, ears_normalized: `${head}${b}.` } as T & {
      id: string;
      ears_normalized: string;
    },
  ];
}

/**
 * When `ambiguity_flag` is set, template a clarification question the
 * bid manager can paste into the buyer Q&A. Returns null when the row
 * isn't flagged or carries no notes to quote.
 */
export function proposeClarification(req: ValidatableRequirement): string | null {
  const flagged = pick<boolean>(req, 'ambiguity_flag', 'ambiguityFlag') ?? false;
  if (!flagged) return null;
  const notes = pick<string>(req, 'ambiguity_notes', 'ambiguityNotes') ?? '';
  const locator =
    pick<string>(req, 'source_section', 'sourceLocation') ?? '';
  const ears = pick<string>(req, 'ears_normalized', 'ears') ?? '';
  const id = req.id ?? req.requirementId ?? '';

  const baseRef = locator ? ` in ${locator}` : '';
  if (notes.trim()) {
    return (
      `Regarding ${id || 'this requirement'}${baseRef}: ${notes.trim()}. ` +
      `Please confirm the intended measurable criterion so we can commit a definite response.`
    );
  }
  // Fall back to a templated question that quotes the EARS text.
  return (
    `Regarding ${id || 'this requirement'}${baseRef}: the wording "${ears}" ` +
    `leaves the acceptance criterion open. Please confirm the measurable threshold so we can commit a definite response.`
  );
}

// Helper for splitCompound: a single-token "action" means the LLM
// already atomised. We refuse to split in that case.
function isSingleVerbAction(action: string): boolean {
  if (isEmpty(action)) return false;
  return action.trim().split(/\s+/).length <= 2;
}
