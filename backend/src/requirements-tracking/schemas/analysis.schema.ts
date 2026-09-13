/**
 * Zod schemas for the tender-analysis prompts: P-GLOSSARY, P-CONSIST,
 * P-CAT-EARS and P-ANALYSIS. Closed schemas, required-by-default (see the
 * constraints documented in extraction.schema.ts).
 */
import { z } from 'zod';
import { earsPatternSchema } from './extraction.schema';

export const glossaryTermSchema = z.object({
  our_term: z.string(),
  definition: z.string(),
  synonyms: z.array(z.string()),
  customer_terms: z.array(z.string()),
});

export const glossarySchema = z.object({
  language: z.string(),
  terms: z.array(glossaryTermSchema),
});

export type GlossaryResult = z.infer<typeof glossarySchema>;

export const consistencyResultSchema = z.object({
  matches: z.array(
    z.object({
      figure_id: z.string(),
      quantity_ref: z.string(),
      same_quantity: z.boolean(),
      reasoning: z.string(),
      confidence: z.number(),
    }),
  ),
});

export type ConsistencyResult = z.infer<typeof consistencyResultSchema>;

export const catalogEarsSchema = z.object({
  statements: z.array(
    z.object({
      ears_text: z.string(),
      pattern: earsPatternSchema,
      kind: z.enum(['capability', 'limitation']),
      scope_ref: z.enum(['included', 'excluded', 'prerequisites', 'deliverables', 'body']),
      evidence_quote: z.string(),
    }),
  ),
});

export type CatalogEarsResult = z.infer<typeof catalogEarsSchema>;

export const analysisNarrativeSchema = z.object({
  markdown: z.string(),
  fulfilment_rating: z.enum(['hoch', 'mittel', 'niedrig']),
  top_risks: z.array(z.string()),
  top_clarifications: z.array(z.string()),
});

export type AnalysisNarrative = z.infer<typeof analysisNarrativeSchema>;
