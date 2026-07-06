/**
 * Zod schema for P-EXTRACT v1 output (spec §5.1). Closed schema, required-by-
 * default, bounded optionals — the constraints documented at the top of
 * backend/src/mcpserver/ears-analysis-schemas.ts apply here too.
 */
import { z } from 'zod';

export const earsPatternSchema = z.enum([
  'ubiquitous',
  'event_driven',
  'state_driven',
  'unwanted_behavior',
  'optional_feature',
  'complex',
]);

export const modalitySchema = z.enum(['mandatory', 'target', 'optional']);

export const categorySchema = z.enum([
  'functional',
  'performance',
  'security',
  'interface',
  'data',
  'usability',
  'process',
  'commercial',
  'legal',
  'documentation',
]);

export const earsFieldsSchema = z.object({
  system: z.string().nullable(),
  trigger: z.string().nullable(),
  state: z.string().nullable(),
  condition: z.string().nullable(),
  feature: z.string().nullable(),
  response: z.string().nullable(),
});

export const quantitySchema = z.object({
  value: z.number(),
  unit: z.string(),
  kind: z.enum(['threshold', 'target', 'count', 'deadline']),
});

export const ambiguitySchema = z.object({
  type: z.enum([
    'vague_term',
    'missing_threshold',
    'missing_trigger',
    'undefined_actor',
    'conflicting_reference',
    'undefined_reference',
  ]),
  note: z.string(),
  clarification_question_draft: z.string(),
});

export const sourceSchema = z.object({
  document: z.string(),
  section: z.string(),
  page: z.number(),
  quote: z.string(),
});

export const extractedRequirementSchema = z.object({
  temp_id: z.string(),
  ears_pattern: earsPatternSchema,
  ears_fields: earsFieldsSchema,
  ears_text: z.string(),
  category: categorySchema,
  modality: modalitySchema,
  quantities: z.array(quantitySchema),
  source: sourceSchema,
  ambiguities: z.array(ambiguitySchema),
  dependencies: z.array(z.string()),
  confidence: z.number(),
});

export const extractionResultSchema = z.object({
  requirements: z.array(extractedRequirementSchema),
  non_requirements_noted: z.array(
    z.object({
      kind: z.enum(['context', 'client_duty', 'informational']),
      quote: z.string(),
      note: z.string(),
    }),
  ),
  section_summary: z.string(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
