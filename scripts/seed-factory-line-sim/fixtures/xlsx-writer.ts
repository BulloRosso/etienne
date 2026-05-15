/**
 * Minimal XLSX writer. Produces a single-sheet workbook from a 2-D array
 * of cells, using adm-zip (already a backend dep) for the OOXML zip.
 *
 * This is intentionally small — just enough to make the
 * `office-and-pdf-documents` skill able to parse our quality reports. It
 * supports strings and numbers; null becomes blank; booleans / dates are
 * rendered via toString.
 */

// Use the adm-zip from backend's node_modules to avoid adding a
// script-level dependency. The path is relative to where this file ends
// up in the repo: scripts/seed-factory-line-sim/fixtures/xlsx-writer.ts
//
// We use a dynamic import so the seed script can fail gracefully if
// adm-zip is missing.
let AdmZip: typeof import('adm-zip') | null = null;
async function getAdmZip(): Promise<typeof import('adm-zip')> {
  if (AdmZip) return AdmZip;
  try {
    const mod = await import('../../../backend/node_modules/adm-zip/adm-zip.js');
    AdmZip = (mod.default ?? mod) as typeof import('adm-zip');
    return AdmZip;
  } catch (e) {
    throw new Error(
      'Could not load adm-zip from backend/node_modules. ' +
        'Run `cd backend && npm install` before running the seed script.',
    );
  }
}

export type CellValue = string | number | boolean | null | undefined;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!));
}

function colName(idx: number): string {
  // 0 → A, 25 → Z, 26 → AA …
  let s = '';
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function buildSheetXml(rows: CellValue[][], sharedStrings: string[]): string {
  const ssIndex = new Map<string, number>();
  for (let i = 0; i < sharedStrings.length; i++) ssIndex.set(sharedStrings[i]!, i);

  const rowXml: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const cells: string[] = [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v === null || v === undefined || v === '') continue;
      const ref = `${colName(c)}${r + 1}`;
      if (typeof v === 'number' && Number.isFinite(v)) {
        cells.push(`<c r="${ref}"><v>${v}</v></c>`);
      } else {
        const s = String(v);
        let idx = ssIndex.get(s);
        if (idx === undefined) {
          idx = sharedStrings.length;
          sharedStrings.push(s);
          ssIndex.set(s, idx);
        }
        cells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`);
      }
    }
    rowXml.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml.join('')}</sheetData></worksheet>`;
}

function buildSharedStringsXml(strings: string[]): string {
  const items = strings.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Quality" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

export async function writeXlsx(rows: CellValue[][]): Promise<Buffer> {
  const Zip = await getAdmZip();
  const z = new Zip();

  const sharedStrings: string[] = [];
  const sheetXml = buildSheetXml(rows, sharedStrings); // mutates sharedStrings
  const sharedStringsXml = buildSharedStringsXml(sharedStrings);

  z.addFile('[Content_Types].xml', Buffer.from(CONTENT_TYPES_XML, 'utf8'));
  z.addFile('_rels/.rels', Buffer.from(ROOT_RELS_XML, 'utf8'));
  z.addFile('xl/workbook.xml', Buffer.from(WORKBOOK_XML, 'utf8'));
  z.addFile('xl/_rels/workbook.xml.rels', Buffer.from(WORKBOOK_RELS_XML, 'utf8'));
  z.addFile('xl/sharedStrings.xml', Buffer.from(sharedStringsXml, 'utf8'));
  z.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf8'));

  return z.toBuffer();
}
