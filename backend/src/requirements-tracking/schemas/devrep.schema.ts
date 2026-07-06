/** Zod schema for the deviation-report narrative (P-DEVREP, spec §5.8). */
import { z } from 'zod';

export const devrepNarrativeSchema = z.object({
  executive_summary: z.string(),
  change_lines: z.array(
    z.object({ requirement_id: z.string(), line: z.string() }),
  ),
  attention_items: z.array(
    z.object({
      kind: z.enum(['pending', 'conflict', 'shadow', 'coverage_gap']),
      ref: z.string(),
      line: z.string(),
    }),
  ),
});

export type DevrepNarrative = z.infer<typeof devrepNarrativeSchema>;
