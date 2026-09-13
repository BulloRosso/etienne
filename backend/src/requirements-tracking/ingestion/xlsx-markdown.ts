import ExcelJS from 'exceljs';
import { cellValueToText, columnNumberToLetter } from '../../content-management/xlsx-parser';

/**
 * Workbook → markdown + machine-readable cell records.
 *
 * LiteParse renders spreadsheets through LibreOffice→PDF and loses sheet
 * names and cell addresses. Tender quantity sheets ("Mengengerüst") are the
 * one place where the raw figures live, so the requirements pipeline reads
 * them with ExcelJS instead:
 *
 *   ## Tabelle: Mengen
 *   Spalten: A Position | B Anzahl | C Einheit
 *   - [Mengen!A3:C3] Position: Palettenstellplätze | Anzahl: 12000 | Einheit: Stück
 *
 * One line per row keeps every value verbatim-quotable (the extraction
 * prompt's quote check is a substring check) and carries the cell range
 * inline, while `cells` feeds the deterministic figure index used by the
 * Excel consistency check.
 */

export type XlsxCellType = 'number' | 'string' | 'date' | 'bool' | 'formula' | 'empty';

export interface XlsxCellRecord {
  sheet: string;
  address: string; // "B3"
  row: number;
  col: string; // "B"
  colIndex: number;
  type: XlsxCellType;
  value: number | string | boolean | null;
  text: string;
  numFmt?: string;
  rowHeader?: string;
  colHeader?: string;
}

export interface RenderedWorkbook {
  markdown: string;
  cells: XlsxCellRecord[];
  sheets: Array<{ name: string; headerRow: number; rows: number }>;
}

export async function renderWorkbookToMarkdown(absolutePath: string): Promise<RenderedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);
  return renderWorkbook(workbook);
}

function classify(value: unknown): { type: XlsxCellType; value: XlsxCellRecord['value'] } {
  if (value === null || value === undefined || value === '') return { type: 'empty', value: null };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'boolean') return { type: 'bool', value };
  if (value instanceof Date) return { type: 'date', value: value.toISOString().slice(0, 10) };
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'object') {
    const v = value as any;
    if ('formula' in v || 'sharedFormula' in v) {
      const result = v.result;
      if (typeof result === 'number') return { type: 'formula', value: result };
      if (result instanceof Date) return { type: 'date', value: result.toISOString().slice(0, 10) };
      if (typeof result === 'string') return { type: 'formula', value: result };
      return { type: 'formula', value: null };
    }
    if (Array.isArray(v.richText)) {
      return { type: 'string', value: v.richText.map((rt: any) => rt.text ?? '').join('') };
    }
    if (typeof v.text === 'string') return { type: 'string', value: v.text };
    if (typeof v.result === 'number') return { type: 'number', value: v.result };
    if (typeof v.hyperlink === 'string') return { type: 'string', value: v.text ?? v.hyperlink };
  }
  return { type: 'string', value: String(value) };
}

function displayText(
  record: { type: XlsxCellType; value: XlsxCellRecord['value'] },
  numFmt?: string,
  raw?: unknown,
): string {
  if (record.type === 'empty' || record.value === null) return '';
  if ((record.type === 'number' || record.type === 'formula') && typeof record.value === 'number') {
    if (numFmt && numFmt.includes('%')) {
      const percent = Math.round(record.value * 100 * 10000) / 10000;
      return `${percent}%`;
    }
    return String(Math.round(record.value * 1e6) / 1e6);
  }
  if (record.type === 'date') return String(record.value);
  if (record.type === 'bool') return record.value ? 'true' : 'false';
  return typeof record.value === 'string' ? record.value : cellValueToText(raw);
}

/** Pure rendering over an already-loaded workbook (unit-testable without files). */
export function renderWorkbook(workbook: ExcelJS.Workbook): RenderedWorkbook {
  const cells: XlsxCellRecord[] = [];
  const sheets: RenderedWorkbook['sheets'] = [];
  const blocks: string[] = [];

  workbook.eachSheet((worksheet) => {
    const sheetName = worksheet.name;
    const rowCount = worksheet.rowCount;
    if (rowCount === 0) return;

    // header row = first row (within the first 10) with >= 2 non-empty cells, mostly text
    let headerRow = 0;
    for (let r = 1; r <= Math.min(rowCount, 10); r++) {
      const row = worksheet.getRow(r);
      let nonEmpty = 0;
      let textual = 0;
      row.eachCell({ includeEmpty: false }, (cell) => {
        const c = classify(cell.value);
        if (c.type === 'empty') return;
        nonEmpty++;
        if (c.type === 'string') textual++;
      });
      if (nonEmpty >= 2 && textual * 2 >= nonEmpty) {
        headerRow = r;
        break;
      }
    }

    const headers = new Map<number, string>();
    if (headerRow > 0) {
      worksheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const text = displayText(classify(cell.value), cell.numFmt, cell.value).trim();
        if (text) headers.set(colNumber, text);
      });
    }

    const lines: string[] = [`## Tabelle: ${sheetName}`, ''];
    if (headers.size > 0) {
      lines.push(
        `Spalten: ${[...headers.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([col, text]) => `${columnNumberToLetter(col)} ${text}`)
          .join(' | ')}`,
      );
      lines.push('');
    }

    let dataRows = 0;
    for (let r = headerRow + 1; r <= rowCount; r++) {
      const row = worksheet.getRow(r);
      const rowCells: Array<{ colNumber: number; record: XlsxCellRecord }> = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const classified = classify(cell.value);
        if (classified.type === 'empty') return;
        rowCells.push({
          colNumber,
          record: {
            sheet: sheetName,
            address: `${columnNumberToLetter(colNumber)}${r}`,
            row: r,
            col: columnNumberToLetter(colNumber),
            colIndex: colNumber,
            type: classified.type,
            value: classified.value,
            text: displayText(classified, cell.numFmt, cell.value),
            numFmt: cell.numFmt || undefined,
            colHeader: headers.get(colNumber),
          },
        });
      });
      if (rowCells.length === 0) continue;
      rowCells.sort((a, b) => a.colNumber - b.colNumber);

      const rowHeaderCell = rowCells.find((entry) => entry.record.type === 'string');
      const rowHeader = rowHeaderCell?.record.text.trim() || undefined;
      for (const entry of rowCells) {
        if (entry !== rowHeaderCell && rowHeader) entry.record.rowHeader = rowHeader;
        cells.push(entry.record);
      }

      const first = rowCells[0].record.col;
      const last = rowCells[rowCells.length - 1].record.col;
      const parts = rowCells.map(
        (entry) =>
          `${entry.record.colHeader ?? entry.record.col}: ${entry.record.text.replace(/\s+/g, ' ').trim()}`,
      );
      lines.push(`- [${sheetName}!${first}${r}:${last}${r}] ${parts.join(' | ')}`);
      dataRows++;
    }
    lines.push('');
    blocks.push(lines.join('\n'));
    sheets.push({ name: sheetName, headerRow, rows: dataRows });
  });

  return { markdown: blocks.join('\n'), cells, sheets };
}
