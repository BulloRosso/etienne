// Paragraph segmentation for streamed stdout (Phase 1 of the App.jsx decomposition).
//
// The stdout SSE handler accumulates text in a buffer and flushes complete
// paragraphs (delimited by blank lines) as discrete `text_chunk` structured
// messages, keeping the trailing incomplete paragraph buffered. This is the file
// where the markdown-table-splitting class of bugs gets regression tests.
//
// Extracted verbatim from the original inline logic — behavior is unchanged.

/**
 * Split a buffer into completed paragraph segments plus the trailing remainder.
 *
 * A segment is a run of text followed by a blank-line delimiter (`\n\n+`). The
 * final part after the last delimiter is incomplete and returned as `remainder`
 * so the caller can keep accumulating into it.
 *
 * @param {string} buffer
 * @returns {{ segments: string[], remainder: string }}
 */
export function splitParagraphSegments(buffer) {
  // Split on \n\n but capture the delimiter so it's preserved in the output.
  const parts = buffer.split(/(\n\n+)/);

  // Single part means no paragraph break yet — nothing to flush.
  if (parts.length <= 1) {
    return { segments: [], remainder: buffer };
  }

  const segments = [];
  let currentContent = '';

  for (let i = 0; i < parts.length - 1; i++) {
    currentContent += parts[i];
    // If the next part is a newline run, append it and flush the segment.
    if (i + 1 < parts.length - 1 && /^\n\n+$/.test(parts[i + 1])) {
      currentContent += parts[i + 1];
      if (currentContent.trim()) {
        segments.push(currentContent);
      }
      currentContent = '';
      i++; // Skip the newline part we just consumed.
    }
  }

  // Any leftover non-final content that ends with newlines becomes a segment.
  if (currentContent.trim()) {
    segments.push(currentContent);
  }

  // The last part is the incomplete trailing paragraph — keep it buffered.
  return { segments, remainder: parts[parts.length - 1] };
}
