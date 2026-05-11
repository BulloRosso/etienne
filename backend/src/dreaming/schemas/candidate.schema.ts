import { z } from 'zod';

export const candidateSchema = z.object({
  title: z.string().min(1).max(200),
  when: z.string().min(1),
  do: z.string().min(1),
  because: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export const reflectOutputSchema = z.object({
  candidates: z.array(candidateSchema),
});

export type CandidateOutput = z.infer<typeof candidateSchema>;
