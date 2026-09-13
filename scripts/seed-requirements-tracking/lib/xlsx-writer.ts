/**
 * Generic XLSX writer for the seed fixtures (ExcelJS from backend/node_modules,
 * so the seed adds no npm dependency). One sheet per fixture with a bold,
 * frozen header row; money columns get a € number format so the backend's
 * figure index can detect the unit from the cell format as well as from the
 * header.
 */
import type ExcelJSType from 'exceljs';
import type { WorkbookSheetFixture } from '../fixtures/tender-xlsx';

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

export async function renderWorkbook(sheets: WorkbookSheetFixture[], creator = 'Nordland Handels AG'): Promise<Buffer> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date('2026-09-01T09:00:00Z');

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] });
    ws.columns = sheet.header.map((_h, index) => ({ width: index === 0 ? 38 : 20 }));
    const header = ws.addRow(sheet.header);
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
    });
    for (const row of sheet.rows) {
      const added = ws.addRow(row);
      for (const letter of sheet.moneyColumns ?? []) {
        const cell = added.getCell(letter);
        if (typeof cell.value === 'number') cell.numFmt = '#,##0 "€"';
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}

export async function writeWorkbookFile(absolutePath: string, sheets: WorkbookSheetFixture[]): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(absolutePath, await renderWorkbook(sheets));
}
