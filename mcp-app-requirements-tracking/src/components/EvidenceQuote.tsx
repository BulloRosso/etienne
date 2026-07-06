/**
 * Verbatim evidence quote block with source attribution — the load-bearing UI
 * element of every proposal card: the quote is the ONLY evidence; everything
 * else is derived (spec §5.9 evidence integrity).
 */
import { Box, Divider, Typography } from "@mui/material";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import type { Evidence } from "../types";

export function EvidenceQuote({ evidence }: { evidence: Evidence | null }) {
  if (!evidence?.quote) return null;
  const attribution = [evidence.speaker_or_author, evidence.date, evidence.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <Box
      sx={{
        borderLeft: 3,
        borderColor: "warning.main",
        pl: 1.5,
        py: 0.5,
        bgcolor: "action.hover",
        borderRadius: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
        <FormatQuoteIcon fontSize="small" color="disabled" />
        <Typography variant="body2" sx={{ fontStyle: "italic", whiteSpace: "pre-wrap" }}>
          {evidence.quote}
        </Typography>
      </Box>
      {attribution && (
        <Typography variant="caption" color="text.secondary" sx={{ pl: 3 }}>
          {attribution}
        </Typography>
      )}
      {(evidence.additional?.length ?? 0) > 0 && (
        <>
          <Divider sx={{ my: 0.5 }} />
          {evidence.additional!.map((extra, index) => (
            <Box key={index} sx={{ pl: 3, mt: 0.5 }}>
              <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                {extra.quote}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[extra.speaker_or_author, extra.date, extra.location].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}
