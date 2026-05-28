/**
 * Minimal docx writer for the requirements-hv seed.
 *
 * Reuses `@turbodocx/html-to-docx` from backend/node_modules (the backend
 * already depends on it for content-management.service.ts's docx export
 * endpoint), so the seed adds no new npm dependency. Same pattern as
 * scripts/seed-factory-line-sim/fixtures/xlsx-writer.ts (adm-zip).
 *
 * The seed's inbox documents are plain English text — bid functional spec
 * paragraphs, no tables, no images — so we don't need full markdown→HTML
 * conversion. A tiny helper that escapes the body and wraps it in
 * paragraphs / headings is enough.
 */

type HtmlToDocxFn = (
  html: string,
  header: string | null,
  options?: unknown,
) => Promise<Buffer | Uint8Array>;

let htmlToDocx: HtmlToDocxFn | null = null;

async function getHtmlToDocx(): Promise<HtmlToDocxFn> {
  if (htmlToDocx) return htmlToDocx;
  try {
    // Dynamic import from backend/node_modules so the seed adds no
    // script-level dependency. The `main` field of the package points at
    // dist/html-to-docx.umd.js — that's what tsx will resolve.
    const mod: any = await import('../../../backend/node_modules/@turbodocx/html-to-docx/dist/html-to-docx.umd.js');
    const fn = (mod.default ?? mod) as HtmlToDocxFn;
    if (typeof fn !== 'function') {
      throw new Error('@turbodocx/html-to-docx did not export a callable function');
    }
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
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!),
  );
}

/**
 * Render a plain-text body (paragraphs separated by blank lines) into a
 * minimal HTML document suitable for html-to-docx. Lines that start with
 * `# `, `## `, `### ` become headings; everything else becomes paragraphs.
 */
function bodyToHtml(title: string, body: string): string {
  const blocks: string[] = [];
  blocks.push(`<h1>${escapeHtml(title)}</h1>`);
  const paragraphs = body.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length + 1; // # → h2, ## → h3, ### → h4
      blocks.push(`<h${level}>${escapeHtml(m[2].trim())}</h${level}>`);
    } else {
      const withBreaks = trimmed
        .split('\n')
        .map((l) => escapeHtml(l.trim()))
        .join('<br/>');
      blocks.push(`<p>${withBreaks}</p>`);
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>${blocks.join('')}</body></html>`;
}

export async function renderDocx(title: string, body: string): Promise<Buffer> {
  const fn = await getHtmlToDocx();
  const html = bodyToHtml(title, body);
  const buf = await fn(html, null, { table: { row: { cantSplit: true } } });
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf as unknown as Uint8Array);
}
