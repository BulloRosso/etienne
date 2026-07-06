/**
 * Zod schemas for the drift pipeline (spec §5.2): P-DRIFT-S screening,
 * P-DRIFT-A diff analysis, P-DRIFT-C conflict cross-check. Closed schemas,
 * nullable-over-optional where the prompt says "null".
 */
import { z } from 'zod';
import {
  ambiguitySchema,
  categorySchema,
  earsFieldsSchema,
  earsPatternSchema,
  modalitySchema,
  quantitySchema,
  sourceSchema,
} from './extraction.schema';

// ── Stage 1: screening (P-DRIFT-S, fast model) ──────────────────────────────

export const driftScreeningSchema = z.object({
  candidates: z.array(
    z.object({
      statement_quote: z.string(),
      location_hint: z.string(),
      speaker_or_author: z.string().nullable(),
      candidate_requirement_ids: z.array(z.string()),
      signal: z.enum([
        'addition',
        'modification',
        'contradiction',
        'removal',
        'confirmation',
        'unclear',
      ]),
    }),
  ),
});

export type DriftScreening = z.infer<typeof driftScreeningSchema>;

// ── Stage 2: diff analysis (P-DRIFT-A, strong model) ────────────────────────

export const driftAnalysisSchema = z.object({
  classification: z.enum([
    'NO_IMPACT',
    'CONFIRMATION',
    'MODIFICATION',
    'NEW_REQUIREMENT',
    'RELAXATION_OR_REMOVAL',
    'CONFLICT',
    'CLARIFICATION_NEEDED',
  ]),
  decision_status: z.enum(['requested', 'decided']).nullable(),
  affected_requirement_ids: z.array(z.string()),
  evidence: z.object({
    quote: z.string(),
    location: z.string().nullable(),
    speaker_or_author: z.string().nullable(),
    date: z.string().nullable(),
  }),
  diff: z
    .object({
      before_ears_text: z.string(),
      after_ears_text: z.string(),
      changed_fields: z.array(
        z.object({ field: z.string(), before: z.string(), after: z.string() }),
      ),
      modality_change: z
        .object({ before: modalitySchema, after: modalitySchema })
        .nullable(),
    })
    .nullable(),
  new_requirement: z
    .object({
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
    })
    .nullable(),
  conflict: z
    .object({
      statement_summary: z.string(),
      conflicting_requirement_id: z.string(),
      nature: z.string(),
    })
    .nullable(),
  scope_assessment: z.enum(['likely_in_scope', 'likely_change', 'unclear']).nullable(),
  scope_rationale: z.string().nullable(),
  clarification_question_draft: z.string().nullable(),
  confidence: z.number(),
});

export type DriftAnalysis = z.infer<typeof driftAnalysisSchema>;

// ── Conflict cross-check (P-DRIFT-C) ─────────────────────────────────────────

export const conflictCheckSchema = z.object({
  checks: z.array(
    z.object({
      requirement_id: z.string(),
      verdict: z.enum(['consistent', 'potential_conflict']),
      explanation: z.string().nullable(),
    }),
  ),
});

export type ConflictCheck = z.infer<typeof conflictCheckSchema>;
