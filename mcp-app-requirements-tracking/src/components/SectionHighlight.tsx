/**
 * Source pane for the Review Queue (P-03): renders the parsed section text with
 * the provenance quote highlighted. The platform stores parsed text (LiteParse),
 * so highlighting is text-based, not PDF-overlay-based — no react-pdf in the
 * sandboxed single-file bundle.
 */
import { Box, Typography } from "@mui/material";
import { useEffect, useMemo, useRef } from "react";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Locate `quote` in `text`, tolerating whitespace differences. */
function findQuoteRange(text: string, quote: string): [number, number] | null {
  const direct = text.indexOf(quote);
  if (direct >= 0) return [direct, direct + quote.length];

  // whitespace-tolerant scan: match the normalized quote against a normalized
  // sliding window, then map back via an index map
  const map: number[] = [];
  let normalized = "";
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = /\s/.test(text[i]) ? " " : text[i];
    if (ch === " " && lastWasSpace) continue;
    normalized += ch;
    map.push(i);
    lastWasSpace = ch === " ";
  }
  const target = normalize(quote);
  const at = normalized.indexOf(target);
  if (at < 0 || at + target.length - 1 >= map.length) return null;
  return [map[at], map[at + target.length - 1] + 1];
}

export function SectionHighlight({
  text,
  quote,
  headingPath,
}: {
  text: string;
  quote?: string;
  headingPath?: string;
}) {
  const markRef = useRef<HTMLElement | null>(null);

  const segments = useMemo(() => {
    if (!quote) return [{ text, highlighted: false }];
    const range = findQuoteRange(text, quote);
    if (!range) return [{ text, highlighted: false }];
    return [
      { text: text.slice(0, range[0]), highlighted: false },
      { text: text.slice(range[0], range[1]), highlighted: true },
      { text: text.slice(range[1]), highlighted: false },
    ];
  }, [text, quote]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [segments]);

  return (
    <Box sx={{ overflow: "auto", height: "100%", p: 2 }}>
      {headingPath && (
        <Typography variant="overline" color="text.secondary" display="block">
          {headingPath}
        </Typography>
      )}
      <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
        {segments.map((segment, index) =>
          segment.highlighted ? (
            <mark
              key={index}
              className="tt-quote-highlight"
              ref={(el) => {
                markRef.current = el;
              }}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </Typography>
    </Box>
  );
}
