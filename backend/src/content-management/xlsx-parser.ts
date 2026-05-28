/**
 * XLSX support for questionnaire-style RFPs.
 *
 * Two responsibilities:
 *
 *  1. `parseXlsxToSections` — read a workbook and emit the same
 *     `{title, body}` shape the existing `extractSectionsToWiki` already
 *     consumes for DOCX/PDF sources. One section per question row, so
 *     each question gets its own planned-response wiki stub.
 *
 *  2. `fillBackResponsesIntoXlsx` — round-trip a workbook with the
 *     committed planned responses written into the answer column,
 *     mirroring the DOCX `fillBackResponsesIntoSource` contract so the
 *     export modal can render results uniformly.
 *
 * Cells are addressed via `sourceRef: { sheet, row, column }` on each
 * coverage row, written there by the seed (and by future extraction
 * runs). Locator matching is therefore O(1) per row — no text matching
 * against the cell contents.
 */
import ExcelJS from 'exceljs';

export interface XlsxSection {
  title: string;
  body: string;
  sourceRef: { sheet: string; row: number; column: string };
}

export interface XlsxSourceRef {
  sheet: string;
  row: number;
  column: string;
}

export interface XlsxFillBackRow {
  requirementId: string;
  body: string | null;
  sourceRef?: XlsxSourceRef;
}

export interface XlsxFillBackResult {
  filled: Array<{ requirementId: string; locator: string }>;
  unfilled: Array<{ requirementId: string; locator: string; reason: string }>;
}

const QUESTION_COLUMN_CANDIDATES = ['question', 'frage', 'item', 'requirement'];
const ID_COLUMN_CANDIDATES = ['id', '#', 'ref', 'no.', 'no'];

function normaliseHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
}

/**
 * Walk every sheet, treat row 1 as the header, and emit one section per
 * data row using the detected question column. If no obvious question
 * column exists on a sheet, fall back to the first text column.
 */
export async function parseXlsxToSections(absolutePath: string): Promise<XlsxSection[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);

  const sections: XlsxSection[] = [];

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    const headerRow = worksheet.getRow(1);
    if (!headerRow || worksheet.rowCount < 2) return;

    const headers: { col: number; letter: string; key: string }[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers.push({
        col: colNumber,
        letter: columnNumberToLetter(colNumber),
        key: normaliseHeader(cell.value),
      });
    });
    if (headers.length === 0) return;

    const questionCol =
      headers.find((h) => QUESTION_COLUMN_CANDIDATES.includes(h.key)) ??
      headers.find((h) => !ID_COLUMN_CANDIDATES.includes(h.key)) ??
      headers[0];
    const idCol = headers.find((h) => ID_COLUMN_CANDIDATES.includes(h.key));

    const otherCols = headers.filter(
      (h) => h.col !== questionCol.col && (!idCol || h.col !== idCol.col),
    );

    for (let r = 2; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const questionRaw = row.getCell(questionCol.col).value;
      const questionText = cellValueToText(questionRaw);
      if (!questionText.trim()) continue;

      const idText = idCol ? cellValueToText(row.getCell(idCol.col).value) : '';
      const title = idText
        ? `${sheetName} · ${idText}: ${truncate(questionText, 80)}`
        : `${sheetName} · row ${r}: ${truncate(questionText, 80)}`;

      const bodyParts: string[] = [];
      bodyParts.push(`**Sheet:** ${sheetName}`);
      bodyParts.push(`**Row:** ${r}`);
      if (idText) bodyParts.push(`**ID:** ${idText}`);
      bodyParts.push('');
      bodyParts.push(`> ${questionText.replace(/\n/g, '\n> ')}`);
      bodyParts.push('');

      const extras: string[] = [];
      for (const h of otherCols) {
        const v = cellValueToText(row.getCell(h.col).value);
        if (!v.trim()) continue;
        extras.push(`- **${h.key}**: ${v}`);
      }
      if (extras.length > 0) {
        bodyParts.push('### Metadata');
        bodyParts.push(...extras);
      }

      sections.push({
        title,
        body: bodyParts.join('\n'),
        sourceRef: { sheet: sheetName, row: r, column: questionCol.letter },
      });
    }
  });

  return sections;
}

/**
 * Open the template workbook, write each committed row's body into the
 * cell at `<sourceRef.sheet>!<answerColumnLetter><sourceRef.row>`, and
 * save to `outputAbsolutePath`. Returns a `{filled, unfilled}` summary
 * shaped like the DOCX fill-back so the modal renders both identically.
 *
 * The answer column is resolved per-sheet by header text (default:
 * "Response") so the template's own column layout drives where answers
 * go — we don't assume column letter.
 */
export async function fillBackResponsesIntoXlsx(args: {
  templateAbsolutePath: string;
  outputAbsolutePath: string;
  answerColumnHeader: string;
  rows: XlsxFillBackRow[];
}): Promise<XlsxFillBackResult> {
  const { templateAbsolutePath, outputAbsolutePath, answerColumnHeader, rows } = args;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templateAbsolutePath);

  const answerColCache = new Map<string, number | null>();
  const resolveAnswerCol = (sheetName: string): number | null => {
    if (answerColCache.has(sheetName)) return answerColCache.get(sheetName)!;
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      answerColCache.set(sheetName, null);
      return null;
    }
    const headerRow = ws.getRow(1);
    let resolved: number | null = null;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (normaliseHeader(cell.value) === normaliseHeader(answerColumnHeader)) {
        resolved = colNumber;
      }
    });
    answerColCache.set(sheetName, resolved);
    return resolved;
  };

  const filled: Array<{ requirementId: string; locator: string }> = [];
  const unfilled: Array<{ requirementId: string; locator: string; reason: string }> = [];

  for (const r of rows) {
    const locator = r.sourceRef
      ? `${r.sourceRef.sheet}!${r.sourceRef.column}${r.sourceRef.row}`
      : '';
    if (!r.sourceRef) {
      unfilled.push({
        requirementId: r.requirementId,
        locator: '',
        reason: 'no sourceRef on coverage row',
      });
      continue;
    }
    if (!r.body) {
      unfilled.push({
        requirementId: r.requirementId,
        locator,
        reason: 'no planned-response page found',
      });
      continue;
    }
    const ws = workbook.getWorksheet(r.sourceRef.sheet);
    if (!ws) {
      unfilled.push({
        requirementId: r.requirementId,
        locator,
        reason: `sheet "${r.sourceRef.sheet}" not in template`,
      });
      continue;
    }
    const answerCol = resolveAnswerCol(r.sourceRef.sheet);
    if (!answerCol) {
      unfilled.push({
        requirementId: r.requirementId,
        locator,
        reason: `no "${answerColumnHeader}" column on sheet "${r.sourceRef.sheet}"`,
      });
      continue;
    }
    const targetRow = ws.getRow(r.sourceRef.row);
    targetRow.getCell(answerCol).value = r.body;
    targetRow.getCell(answerCol).alignment = { wrapText: true, vertical: 'top' };
    targetRow.commit();
    filled.push({ requirementId: r.requirementId, locator });
  }

  await workbook.xlsx.writeFile(outputAbsolutePath);
  return { filled, unfilled };
}

export function isXlsxPath(path: string): boolean {
  return /\.xlsx$/i.test(path);
}

function cellValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as any;
    if (typeof v.text === 'string') return v.text;
    if (typeof v.result === 'string' || typeof v.result === 'number') return String(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((rt: any) => rt.text ?? '').join('');
    if (typeof v.hyperlink === 'string') return v.text ?? v.hyperlink;
  }
  return String(value);
}

function columnNumberToLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
