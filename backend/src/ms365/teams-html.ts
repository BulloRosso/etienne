/**
 * Lightweight Teams chatMessage HTML -> markdown-ish plain text conversion for
 * channel transcripts. Deliberately hand-rolled (no new dependency): Teams
 * message HTML is a small, predictable subset.
 *
 * Handles: <at> mentions, paragraphs/line breaks, bold/italic/strike, links,
 * inline/block code, blockquotes, lists, hosted-content images (rewritten to
 * local asset refs by the caller via the images callback), entity decoding.
 */

export interface TeamsHtmlResult {
  text: string;
  mentions: string[];
  /** hostedContents ids referenced by <img> tags, in document order */
  hostedContentIds: string[];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const HOSTED_CONTENT_RX = /hostedContents\/([^/'"]+)\/\$value/;

/**
 * Convert Teams message HTML to readable markdown-ish text.
 * @param html            body.content when body.contentType === 'html'
 * @param assetRefForImage maps a hostedContent id (or null for external src) +
 *                         original src to the string that replaces the <img>,
 *                         e.g. `![img](assets/123-abc.png)`; return '' to drop.
 */
export function teamsHtmlToMarkdown(
  html: string,
  assetRefForImage?: (hostedContentId: string | null, src: string) => string,
): TeamsHtmlResult {
  const mentions: string[] = [];
  const hostedContentIds: string[] = [];
  let s = html || '';

  // Normalize newlines; HTML source newlines are not significant.
  s = s.replace(/\r\n?/g, '\n');

  // <at id="0">Name</at> -> @Name
  s = s.replace(/<at\b[^>]*>([\s\S]*?)<\/at>/gi, (_, name) => {
    const clean = decodeEntities(String(name).replace(/<[^>]+>/g, '')).trim();
    if (clean) mentions.push(clean);
    return `@${clean}`;
  });

  // Preserve code blocks before other transforms. Teams emits <pre> for code blocks.
  const codeBlocks: string[] = [];
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, body) => {
    const inner = decodeEntities(String(body).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
    codeBlocks.push(inner.replace(/\n+$/g, ''));
    return ` CODEBLOCK${codeBlocks.length - 1} `;
  });

  // Inline images -> asset refs (hosted content) or alt text.
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = /src\s*=\s*"([^"]*)"|src\s*=\s*'([^']*)'/i.exec(tag);
    const src = decodeEntities(srcMatch?.[1] ?? srcMatch?.[2] ?? '');
    const hcMatch = HOSTED_CONTENT_RX.exec(src);
    const hcId = hcMatch ? hcMatch[1] : null;
    if (hcId) hostedContentIds.push(hcId);
    if (assetRefForImage) return assetRefForImage(hcId, src);
    return hcId ? '[inline image]' : (src ? `![img](${src})` : '');
  });

  // <a href="...">text</a> -> [text](href)
  s = s.replace(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_, h1, h2, text) => {
    const href = decodeEntities(h1 ?? h2 ?? '');
    const label = decodeEntities(String(text).replace(/<[^>]+>/g, '')).trim() || href;
    return href ? `[${label}](${href})` : label;
  });

  // Inline code
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, body) => {
    const inner = decodeEntities(String(body).replace(/<[^>]+>/g, ''));
    return '`' + inner + '`';
  });

  // Emphasis
  s = s.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, body) => `**${body}**`);
  s = s.replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, body) => `*${body}*`);
  s = s.replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, body) => `~~${body}~~`);

  // Blockquotes -> '> '-prefixed lines. Inner block tags are resolved here
  // (emphasis/links/code were already converted above).
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, body) => {
    let inner = String(body)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    inner = decodeEntities(inner).trim();
    if (!inner) return '\n';
    return '\n' + inner.split('\n').map((l) => '> ' + l.trim()).join('\n') + '\n';
  });

  // Lists
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/li>/gi, '');
  s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n');

  // Paragraphs / divs / breaks -> newlines
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n');
  s = s.replace(/<(p|div|h[1-6])\b[^>]*>/gi, '');
  s = s.replace(/<\/td>\s*<td\b[^>]*>/gi, ' | ');

  // Strip anything left (attachment markers, spans, tables, unknown tags)
  s = s.replace(/<[^>]+>/g, '');

  s = decodeEntities(s);

  // Restore code blocks
  s = s.replace(/ CODEBLOCK(\d+) /g, (_, idx) => '\n```\n' + codeBlocks[Number(idx)] + '\n```\n');

  // Whitespace cleanup: trim line ends, collapse 3+ newlines, trim result
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: s, mentions, hostedContentIds };
}
