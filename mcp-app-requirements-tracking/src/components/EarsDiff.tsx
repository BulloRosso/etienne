/**
 * Word-level before/after diff of EARS text (jsdiff), used by the Drift Inbox
 * cards (P-08), the thread timeline (P-09) and catalog version diffs (P-06).
 */
import { Box, Typography } from "@mui/material";
import { diffWords } from "diff";

export function EarsDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before ?? "", after ?? "");
  return (
    <Box sx={{ lineHeight: 1.7 }}>
      <Typography variant="body2" component="div">
        {parts.map((part, index) => {
          if (part.added) {
            return (
              <mark key={index} className="tt-diff-add">
                {part.value}
              </mark>
            );
          }
          if (part.removed) {
            return (
              <mark key={index} className="tt-diff-del">
                {part.value}
              </mark>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </Typography>
    </Box>
  );
}

/** Side-by-side variant: struck-through before, highlighted after. */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Box sx={{ opacity: 0.75 }}>
        <Typography variant="caption" color="text.secondary">
          Before
        </Typography>
        <Typography variant="body2">{before}</Typography>
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary">
          After
        </Typography>
        <EarsDiff before={before} after={after} />
      </Box>
    </Box>
  );
}
