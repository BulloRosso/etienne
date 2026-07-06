/**
 * Universal grounding check (spec §4): every proposal MUST include a verbatim
 * evidence quote that exists character-for-character in the provided source.
 * Parsed text can differ from what the model saw in whitespace and hyphenation,
 * so an exact substring check is tried first, then a whitespace-normalized one.
 */

const normalize = (text: string): string =>
  text
    .replace(/[­]/g, '') // soft hyphens
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // line-break hyphenation
    .replace(/\s+/g, ' ')
    .trim();

export interface QuoteCheckResult {
  valid: boolean;
  exact: boolean;
  reason?: string;
}

export function validateQuote(sourceText: string, quote: string): QuoteCheckResult {
  if (!quote || quote.trim().length === 0) {
    return { valid: false, exact: false, reason: 'Empty evidence quote' };
  }
  if (sourceText.includes(quote)) {
    return { valid: true, exact: true };
  }
  if (normalize(sourceText).includes(normalize(quote))) {
    return { valid: true, exact: false };
  }
  return {
    valid: false,
    exact: false,
    reason: 'Evidence quote not found verbatim in the source text',
  };
}
