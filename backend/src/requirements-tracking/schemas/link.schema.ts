/**
 * Zod schemas for requirement↔issue linking (P-LINK, spec §5.6) and
 * shadow-scope classification (P-SHADOW, spec §5.7).
 */
import { z } from 'zod';

export const linkResultSchema = z.object({
  issue_key: z.string(),
  links: z.array(
    z.object({
      requirement_id: z.string(),
      relationship: z.enum([
        'implements',
        'partially_implements',
        'tests',
        'documents',
        'related',
      ]),
      matches_current: z.boolean(),
      rationale: z.string(),
      issue_evidence: z.string(),
      confidence: z.number(),
    }),
  ),
});

export type LinkResult = z.infer<typeof linkResultSchema>;

export const shadowResultSchema = z.object({
  issue_key: z.string(),
  classification: z.enum([
    'implements_existing',
    'internal_work',
    'undocumented_scope_candidate',
    'unclear',
  ]),
  links: z.array(
    z.object({
      requirement_id: z.string(),
      relationship: z.enum([
        'implements',
        'partially_implements',
        'tests',
        'documents',
        'related',
      ]),
      matches_current: z.boolean(),
      rationale: z.string(),
      issue_evidence: z.string(),
      confidence: z.number(),
    }),
  ),
  functionality_summary: z.string(),
  origin_evidence: z.array(z.object({ quote: z.string(), location: z.string() })),
  internal_rationale: z.string().nullable(),
  assignee_question: z.string().nullable(),
  confidence: z.number(),
});

export type ShadowResult = z.infer<typeof shadowResultSchema>;
