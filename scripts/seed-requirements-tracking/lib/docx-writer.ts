/**
 * Minimal DOCX writer for the seed fixtures.
 *
 * Reuses `@turbodocx/html-to-docx` from backend/node_modules (the backend
 * depends on it for the DOCX export), so the seed adds no npm dependency.
 * Lines starting with `# `, `## `, `### ` become headings (h2/h3/h4 under
 * the document title), everything else becomes paragraphs. mammoth turns
 * those headings back into markdown headings when the pipeline parses the
 * file, which is what the sectionizer keys on.
 */

type HtmlToDocxFn = (html: string, header: string | null, options?: unknown) => Promise<Buffer | Uint8Array>;

let htmlToDocx: HtmlToDocxFn | null = null;

async function getHtmlToDocx(): Promise<HtmlToDocxFn> {
  if (htmlToDocx) return htmlToDocx;
  try {
    const mod: any = await import('../../../backend/node_modules/@turbodocx/html-to-docx/dist/html-to-docx.umd.js');
    const fn = (mod.default ?? mod) as HtmlToDocxFn;
    if (typeof fn !== 'function') throw new Error('@turbodocx/html-to-docx did not export a callable function');
    htmlToDocx = fn;
    return htmlToDocx;
  } catch (e) {
    throw new Error(
      'Could not load @turbodocx/html-to-docx from backend/node_modules. ' +
        'Run `cd backend && npm install` before running the seed script. ' +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
}

export function bodyToHtml(title: string, body: string): string {
  const blocks: string[] = [`<h1>${escapeHtml(title)}</h1>`];
  for (const para of body.split(/\n\s*\n/)) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length + 1;
      blocks.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
      continue;
    }
    const withBreaks = trimmed
      .split('\n')
      .map((line) => escapeHtml(line.trim()))
      .join('<br/>');
    blocks.push(`<p>${withBreaks}</p>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>${blocks.join('')}</body></html>`;
}

export async function renderDocx(title: string, body: string): Promise<Buffer> {
  const fn = await getHtmlToDocx();
  const buf = await fn(bodyToHtml(title, body), null, { table: { row: { cantSplit: true } } });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as unknown as Uint8Array);
}
