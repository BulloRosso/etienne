import { z } from 'zod';

export const sourceVerdictSchema = z.object({
  url: z.string().url().or(z.string().min(1)),
  verdict: z.enum(['supports', 'contradicts', 'neutral']),
  note: z.string().optional(),
});

export const groundOutputSchema = z.object({
  sources: z.array(sourceVerdictSchema),
});
