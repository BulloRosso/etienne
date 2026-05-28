/**
 * XLSX writer for the questionnaire fixture. Turns the structured object
 * in `inbox-xlsx.ts` into a real `.xlsx` file with:
 *
 *  - One sheet per `QuestionnaireSheet`.
 *  - A styled header row (bold, light-grey fill, frozen).
 *  - Column widths matching `QUESTIONNAIRE_COLUMNS`.
 *  - Wrap-text on Question / Reference / Response columns.
 *  - An empty Response column ready for the fill-back to populate.
 *
 * The output file is what the runtime XLSX path
 * (`backend/src/content-management/xlsx-parser.ts`) parses for section
 * extraction and what the fill-back writer opens as a template.
 */

import type ExcelJSType from 'exceljs';
import {
  QUESTIONNAIRE_COLUMNS,
  QUESTIONNAIRE_SHEETS,
  QUESTIONNAIRE_TITLE,
  type QuestionnaireSheet,
} from './inbox-xlsx';

// Mirror the docx-writer pattern: dynamic import out of backend/node_modules
// so the seed adds no script-level dependency. exceljs sits in
// backend/dependencies as part of the XLSX runtime path; this file is the
// only seed-time caller.
let cachedExcelJS: typeof ExcelJSType | null = null;
async function getExcelJS(): Promise<typeof ExcelJSType> {
  if (cachedExcelJS) return cachedExcelJS;
  try {
    const mod: any = await import('../../../backend/node_modules/exceljs/excel.js');
    cachedExcelJS = (mod.default ?? mod) as typeof ExcelJSType;
    return cachedExcelJS;
  } catch (e) {
    throw new Error(
      'Could not load exceljs from backend/node_modules. ' +
        'Run `cd backend && npm install` before running the seed script. ' +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

export async function writeQuestionnaireWorkbook(
  absoluteOutputPath: string,
): Promise<void> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NSÜN procurement';
  wb.created = new Date('2026-02-12T09:00:00Z');
  wb.title = QUESTIONNAIRE_TITLE;

  for (const sheet of QUESTIONNAIRE_SHEETS) {
    addSheet(wb, sheet);
  }

  await wb.xlsx.writeFile(absoluteOutputPath);
}

function addSheet(wb: ExcelJSType.Workbook, sheet: QuestionnaireSheet): void {
  const ws = wb.addWorksheet(sheet.name, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  // Column widths — keyed by the QUESTIONNAIRE_COLUMNS letters so the
  // sheet always renders consistently regardless of question text length.
  ws.columns = [
    { width: QUESTIONNAIRE_COLUMNS.id.width },
    { width: QUESTIONNAIRE_COLUMNS.question.width },
    { width: QUESTIONNAIRE_COLUMNS.mandatory.width },
    { width: QUESTIONNAIRE_COLUMNS.reference.width },
    { width: QUESTIONNAIRE_COLUMNS.weight.width },
    { width: QUESTIONNAIRE_COLUMNS.response.width },
  ];

  // Header row — bold + light-grey fill, mid-grey bottom border so it
  // visually separates from the data. Frozen via the worksheet view above.
  const header = ws.addRow([
    QUESTIONNAIRE_COLUMNS.id.header,
    QUESTIONNAIRE_COLUMNS.question.header,
    QUESTIONNAIRE_COLUMNS.mandatory.header,
    QUESTIONNAIRE_COLUMNS.reference.header,
    QUESTIONNAIRE_COLUMNS.weight.header,
    QUESTIONNAIRE_COLUMNS.response.header,
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });
  header.height = 22;

  for (const q of sheet.questions) {
    const row = ws.addRow([
      q.id,
      q.question,
      q.mandatory ? 'yes' : 'no',
      q.reference ?? '',
      // Weight: numeric value when set; empty otherwise so unweighted
      // questions don't appear as 0 (which would imply "explicitly
      // worthless" rather than "weight not specified").
      q.weightPoints ?? null,
      '', // Response — left empty; fill-back populates it.
    ]);
    row.getCell(QUESTIONNAIRE_COLUMNS.question.letter).alignment = {
      vertical: 'top',
      wrapText: true,
    };
    row.getCell(QUESTIONNAIRE_COLUMNS.reference.letter).alignment = {
      vertical: 'top',
      wrapText: true,
    };
    row.getCell(QUESTIONNAIRE_COLUMNS.response.letter).alignment = {
      vertical: 'top',
      wrapText: true,
    };
    row.getCell(QUESTIONNAIRE_COLUMNS.id.letter).font = { bold: true };
    row.getCell(QUESTIONNAIRE_COLUMNS.mandatory.letter).font = q.mandatory
      ? { color: { argb: 'FFB71C1C' }, bold: true }
      : { color: { argb: 'FF777777' } };
    // Weight cell — right-aligned, monospace-ish, with a subtle red
    // tint above the 20-point threshold so heavy-weight items pop in
    // the workbook the same way they will in the cockpit's "top-25"
    // filter. Empty cells render plain.
    const weightCell = row.getCell(QUESTIONNAIRE_COLUMNS.weight.letter);
    weightCell.alignment = { vertical: 'top', horizontal: 'right' };
    if (typeof q.weightPoints === 'number') {
      weightCell.numFmt = '0';
      if (q.weightPoints >= 20) {
        weightCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFDECEA' },
        };
        weightCell.font = { color: { argb: 'FFB71C1C' }, bold: true };
      } else {
        weightCell.font = { color: { argb: 'FF555555' } };
      }
    }
    row.height = Math.max(28, Math.min(120, Math.ceil(q.question.length / 4)));
  }
}
