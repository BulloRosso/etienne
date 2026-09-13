import { DocumentSection } from '../types/tendertrace-types';

/**
 * Heading-aware sectionizer for parsed tender documents (pure, unit-tested).
 *
 * Parsed text arrives in three shapes:
 *   - markdown with `#` headings (mammoth DOCX conversion, catalog .md files)
 *   - layout-preserved plain text from LiteParse (PDF/OCR) — NO `#` headings,
 *     but numbered chapter lines ("3.2.1 Wareneingang"), ALL-CAPS titles and
 *     keyword headings ("Anlage 2", "§ 5 Haftung") are usually intact
 *   - our own workbook rendering (`## Tabelle: <sheet>`)
 *
 * Page provenance comes from `<!-- page: N -->` marker lines that
 * `joinPages()` inserts between LiteParse pages. Without markers the old
 * ~3000-chars/page estimate is used (and reported via `pageSource`).
 */

export const PAGE_MARKER_RE = /^<!--\s*page:\s*(\d+)\s*-->$/;
const DEFAULT_CHARS_PER_PAGE = 3000;

export interface SectionizeOptions {
  charsPerPage?: number;
}

export interface SectionizeResult {
  sections: DocumentSection[];
  pageSource: 'markers' | 'estimated';
}

/** Join per-page texts with page markers so downstream steps keep real page numbers. */
export function joinPages(pages: Array<{ pageNum: number; text: string }>): string {
  return (
    pages
      .map((page) => `<!-- page: ${page.pageNum} -->\n${(page.text ?? '').replace(/\s+$/, '')}`)
      .join('\n\n') + '\n'
  );
}

const NUMBERED_RE = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.{1,90})$/;
const THOUSANDS_RE = /^\d{1,3}(?:\.\d{3})+$/;
const TOC_LINE_RE = /\.{3,}\s*\d+\s*$|\s\d{1,3}\s*$/;
const QUANTITY_LINE_RE = /^\d+(?:[.,]\d+)*\s*(?:€|EUR|Euro|m²|m2|qm|%|Std|h\b|Tage?|Monate?|Jahre?|kg|t\b)/i;
const KEYWORD_RE = /^(?:Anlage|Anhang|Kapitel|Abschnitt|Teil|Los|Artikel|§)\s*\d*[a-z]?(?:[\s:.\-–—]+\S.{0,80})?$/i;
const SENTENCE_END_RE = /[.;:,]$/;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (letters.length < 3) return false;
  if (!/[A-ZÄÖÜ]{3,}/.test(text)) return false;
  return letters === letters.toUpperCase();
}

/**
 * Decide whether a (trimmed) line is a heading. Returns level + title or null.
 * Conservative on purpose: a false heading only splits a section, a missed
 * heading only merges two — but a quantity line mistaken for a heading would
 * hide figures from extraction, so those are rejected explicitly.
 */
export function detectHeading(line: string): { level: number; title: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (PAGE_MARKER_RE.test(trimmed)) return null;

  const markdown = /^(#{1,4})\s+(.*\S)\s*$/.exec(trimmed);
  if (markdown) return { level: markdown[1].length, title: markdown[2].trim() };

  const numbered = NUMBERED_RE.exec(trimmed);
  if (numbered) {
    const [, number, title] = numbered;
    const cleanTitle = title.trim();
    const rejected =
      THOUSANDS_RE.test(number) ||
      TOC_LINE_RE.test(cleanTitle) ||
      QUANTITY_LINE_RE.test(trimmed) ||
      SENTENCE_END_RE.test(cleanTitle) ||
      wordCount(cleanTitle) > 14 ||
      /^\d/.test(cleanTitle);
    if (!rejected) {
      return { level: Math.min(number.split('.').length, 4), title: `${number} ${cleanTitle}` };
    }
  }

  if (KEYWORD_RE.test(trimmed) && !SENTENCE_END_RE.test(trimmed) && wordCount(trimmed) <= 12) {
    return { level: 1, title: trimmed };
  }

  if (trimmed.length <= 80 && isAllCaps(trimmed) && !SENTENCE_END_RE.test(trimmed) && wordCount(trimmed) <= 10) {
    return { level: 1, title: trimmed };
  }

  return null;
}

/**
 * Split normalized text into sections at heading boundaries, with char
 * offsets and page ranges. Section ids are `${docId}/sec/${n}` (1-based, in
 * order of appearance) — the same contract the proposals and the Review Queue
 * provenance highlight rely on.
 */
export function sectionizeDocument(
  docId: string,
  markdown: string,
  opts: SectionizeOptions = {},
): SectionizeResult {
  const charsPerPage = opts.charsPerPage ?? DEFAULT_CHARS_PER_PAGE;
  const lines = markdown.split('\n');
  const hasMarkers = lines.some((line) => PAGE_MARKER_RE.test(line.trim()));

  interface Raw {
    headingPath: string;
    charFrom: number;
    charTo: number;
    pageFrom: number;
    pageTo: number;
    text: string;
  }
  const raws: Raw[] = [];
  const headingStack: string[] = [];
  let current: Raw | null = null;
  let offset = 0;
  let page = 1;

  const pushCurrent = (end: number) => {
    // a section consisting only of page markers (e.g. the marker before the first heading) is noise
    if (current && current.text.replace(/<!--[^>]*-->/g, '').trim().length > 0) {
      current.charTo = end;
      current.pageTo = Math.max(current.pageFrom, page);
      raws.push(current);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const marker = PAGE_MARKER_RE.exec(trimmed);
    if (marker) {
      page = parseInt(marker[1], 10);
    }
    const heading = marker ? null : detectHeading(trimmed);
    if (heading) {
      pushCurrent(offset);
      headingStack.length = heading.level - 1;
      headingStack[heading.level - 1] = heading.title;
      current = {
        headingPath: headingStack.filter(Boolean).join(' > '),
        charFrom: offset,
        charTo: offset,
        pageFrom: page,
        pageTo: page,
        text: '',
      };
    }
    if (!current) {
      current = { headingPath: '(preamble)', charFrom: 0, charTo: 0, pageFrom: page, pageTo: page, text: '' };
    }
    current.text += `${line}\n`;
    offset += line.length + 1;
  }
  pushCurrent(offset);

  const sections = raws.map((raw, index) => ({
    id: `${docId}/sec/${index + 1}`,
    documentId: docId,
    headingPath: raw.headingPath,
    pageFrom: hasMarkers ? raw.pageFrom : Math.floor(raw.charFrom / charsPerPage) + 1,
    pageTo: hasMarkers
      ? raw.pageTo
      : Math.floor(Math.max(raw.charTo - 1, 0) / charsPerPage) + 1,
    charFrom: raw.charFrom,
    charTo: raw.charTo,
    text: raw.text.trim(),
  }));

  return { sections, pageSource: hasMarkers ? 'markers' : 'estimated' };
}
