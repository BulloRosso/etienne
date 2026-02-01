/**
 * Convert markdown to Telegram-supported HTML tags
 *
 * Telegram supports these HTML tags:
 * - <b>, <strong> - Bold
 * - <i>, <em> - Italic
 * - <u>, <ins> - Underline
 * - <s>, <strike> - Strikethrough
 * - <code> - Inline code
 * - <pre> - Code blocks
 * - <a href=""> - Hyperlinks
 *
 * Line breaks use \n (not <br>)
 */

/**
 * Escape HTML special characters to prevent injection
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert markdown to Telegram HTML
 */
export function markdownToTelegramHtml(markdown: string): string {
  let result = markdown;

  // First, extract and protect code blocks to prevent processing their contents
  const codeBlocks: string[] = [];
  const codeBlockPlaceholder = '\x00CODEBLOCK\x00';

  // Handle fenced code blocks with language (```lang\ncode\n```)
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trimEnd());
    const block = lang
      ? `<pre><code class="language-${lang}">${escapedCode}</code></pre>`
      : `<pre>${escapedCode}</pre>`;
    codeBlocks.push(block);
    return codeBlockPlaceholder;
  });

  // Handle fenced code blocks without newline after language (```code```)
  result = result.replace(/```([\s\S]*?)```/g, (_, code) => {
    const escapedCode = escapeHtml(code.trim());
    const block = `<pre>${escapedCode}</pre>`;
    codeBlocks.push(block);
    return codeBlockPlaceholder;
  });

  // Extract and protect inline code to prevent processing their contents
  const inlineCodes: string[] = [];
  const inlineCodePlaceholder = '\x00INLINECODE\x00';

  result = result.replace(/`([^`\n]+)`/g, (_, code) => {
    const escapedCode = escapeHtml(code);
    inlineCodes.push(`<code>${escapedCode}</code>`);
    return inlineCodePlaceholder;
  });

  // Now escape HTML in the remaining text
  result = escapeHtml(result);

  // Convert markdown syntax to HTML

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  result = result.replace(/__([^_]+)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (but not within words for underscore)
  result = result.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  result = result.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Headers: convert to bold (Telegram doesn't support headers)
  // # Header -> Bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Horizontal rules: ---, ***, ___ -> just a line
  result = result.replace(/^[-*_]{3,}$/gm, '────────────────');

  // Blockquotes: > text -> just indent with a bar character
  result = result.replace(/^>\s?(.*)$/gm, '│ $1');

  // Unordered lists: - item or * item -> bullet point
  result = result.replace(/^[-*+]\s+(.+)$/gm, '• $1');

  // Ordered lists: 1. item -> keep as is but clean up
  result = result.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');

  // Restore inline code
  let inlineIndex = 0;
  result = result.replace(new RegExp(inlineCodePlaceholder.replace(/\x00/g, '\\x00'), 'g'), () => {
    return inlineCodes[inlineIndex++] || '';
  });

  // Restore code blocks
  let blockIndex = 0;
  result = result.replace(new RegExp(codeBlockPlaceholder.replace(/\x00/g, '\\x00'), 'g'), () => {
    return codeBlocks[blockIndex++] || '';
  });

  return result;
}

/**
 * Split text into chunks that respect Telegram's message size limit
 * while preserving HTML tag integrity
 */
export function splitTelegramMessage(text: string, maxLength: number = 4000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // Check if adding this paragraph would exceed the limit
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      // Save current chunk if it has content
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }

      // If a single paragraph is too long, split by lines
      if (paragraph.length > maxLength) {
        const lines = paragraph.split('\n');
        currentChunk = '';

        for (const line of lines) {
          if (currentChunk.length + line.length + 1 > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }

            // If a single line is too long, split by characters
            if (line.length > maxLength) {
              let remaining = line;
              while (remaining.length > maxLength) {
                // Try to split at a space
                let splitPoint = remaining.lastIndexOf(' ', maxLength);
                if (splitPoint === -1 || splitPoint < maxLength / 2) {
                  splitPoint = maxLength;
                }
                chunks.push(remaining.substring(0, splitPoint).trim());
                remaining = remaining.substring(splitPoint).trim();
              }
              currentChunk = remaining;
            } else {
              currentChunk = line;
            }
          } else {
            currentChunk += (currentChunk ? '\n' : '') + line;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
