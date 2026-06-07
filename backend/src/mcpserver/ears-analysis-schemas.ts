/**
 * Zod schemas for the EARS document-analysis pipeline.
 *
 * These are passed directly to `LlmService.generateObjectWithMessages`
 * (schema-constrained structured output) AND reused by the `generateText`
 * fallback's `.safeParse()`.
 *
 * Provider structured-output grammars impose two constraints that shape these
 * schemas, and the resolution sits between them:
 *   - Anthropic/OpenAI strict mode require a CLOSED schema: every property
 *     declared and `additionalProperties: false`. So no `.passthrough()` and no
 *     loose `z.record` (both surface a non-false `additionalProperties`).
 *   - Anthropic's grammar compiler caps the number of OPTIONAL parameters
 *     (~40). A Requirement with ~20 `.optional()` fields, multiplied across the
 *     other item types, blows past it.
 *
 * Resolution: declare every field (closed schema) and make fields REQUIRED by
 * default, keeping only a small, deliberately-bounded set `.optional()`. The
 * prompt (extraction-system.md) already asks the model to emit every field, and
 * `buildRequirement()` / `buildContextFact()` etc. normalise + default whatever
 * comes back — so requiring fields costs nothing downstream while keeping the
 * optional-parameter count comfortably under the cap. `original_text` is the
 * load-bearing field; the rest are values the model fills per the prompt.
 */
import { z } from 'zod';

const numberOrString = z.union([z.number(), z.string()]);

// ---------------------------------------------------------------------------
// Chunk extraction (document_analysis_ears)
// ---------------------------------------------------------------------------

const requirementSchema = z.object({
  id: z.string(),
  original_text: z.string(),
  ears_normalized: z.string(),
  ears_type: z.string(),
  trigger_condition: z.string(),
  actor: z.string(),
  action: z.string(),
  constraint: z.string(),
  priority: z.string(),
  verification: z.string(),
  references_standard: z.string(),
  has_penalty: z.boolean(),
  source_section: z.string(),
  source_page: numberOrString,
  response_cluster: z.string(),
  ambiguity_flag: z.boolean(),
  ambiguity_notes: z.string(),
  // Newer prompt fields — kept optional so the model may omit them on tenders
  // that have no knockout/award/weight semantics. (Bounded optional count.)
  is_knockout: z.boolean().optional(),
  award_criterion_id: z.string().optional(),
  weight_points: numberOrString.optional(),
});

const contextFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string(),
  source_section: z.string(),
  source_page: numberOrString,
});

const commercialTermSchema = contextFactSchema;

const documentSectionSchema = z.object({
  section_number: z.string(),
  title: z.string(),
  title_en: z.string().optional(),
  page_start: numberOrString,
});

const evaluationMatrixEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  parent_id: z.string(),
  points: numberOrString,
});

export const chunkExtractionSchema = z.object({
  requirements: z.array(requirementSchema),
  context_facts: z.array(contextFactSchema),
  commercial_terms: z.array(commercialTermSchema),
  document_sections: z.array(documentSectionSchema),
  evaluation_matrix: z.array(evaluationMatrixEntrySchema),
});

export type ChunkExtraction = z.infer<typeof chunkExtractionSchema>;

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export const languageInfoSchema = z.object({
  language_code: z.string(),
  language_name: z.string(),
  confidence: z.string(),
});

export type LanguageInfoParsed = z.infer<typeof languageInfoSchema>;

// ---------------------------------------------------------------------------
// Cross-reference quality pass
// ---------------------------------------------------------------------------

const duplicateSchema = z.object({
  ids: z.array(z.string()),
  reason: z.string(),
});

const gapSchema = z.object({
  area: z.string(),
  explanation: z.string(),
});

export const crossReferenceSchema = z.object({
  duplicates: z.array(duplicateSchema),
  contradictions: z.array(duplicateSchema),
  gaps: z.array(gapSchema),
  executive_summary: z.string(),
});

export type CrossReferenceParsed = z.infer<typeof crossReferenceSchema>;

// ---------------------------------------------------------------------------
// Section extraction (extract_document_sections)
// ---------------------------------------------------------------------------

const sectionSchema = z.object({
  number: z.string(),
  title: z.string(),
  level: numberOrString,
  text: z.string(),
});

export const sectionChunkSchema = z.object({
  sections: z.array(sectionSchema),
  low_text_quality: z.boolean(),
});

export type SectionChunkParsed = z.infer<typeof sectionChunkSchema>;
