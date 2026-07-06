/**
 * Zod schemas for the service catalog pipelines: P-CAT-I import segmentation
 * (spec §5.5) and P-CAT-M requirement↔service auto-mapping.
 */
import { z } from 'zod';

export const catalogImportSchema = z.object({
  entries: z.array(
    z.object({
      title: z.string(),
      body_markdown: z.string(),
      tags: z.array(z.string()),
      scope: z.object({
        included: z.array(z.string()),
        excluded: z.array(z.string()),
        prerequisites: z.array(z.string()),
        deliverables: z.array(z.string()),
      }),
      catalog_action: z.enum(['new', 'update_of']),
      existing_key: z.string().nullable(),
      merge_hint: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
  unassigned_sections: z.array(z.object({ heading: z.string(), note: z.string() })),
});

export type CatalogImportResult = z.infer<typeof catalogImportSchema>;

export const mappingResultSchema = z.object({
  requirement_id: z.string(),
  mappings: z.array(
    z.object({
      service_id: z.string(),
      service_version_no: z.number(),
      coverage: z.enum(['full', 'partial', 'related']),
      rationale: z.string(),
      service_evidence: z.array(z.string()),
      gap_or_exclusion: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
});

export type MappingResult = z.infer<typeof mappingResultSchema>;

export const complianceVerdictSchema = z.object({
  requirement_id: z.string(),
  verdict: z.enum(['FULL', 'PARTIAL', 'NON_COMPLIANT', 'NEEDS_INPUT']),
  justification: z.string(),
  evidence_refs: z.array(z.object({ service_id: z.string(), version_no: z.number() })),
  deviation: z.string().nullable(),
  risk_note: z.string().nullable(),
  internal_question: z
    .object({ question: z.string(), owner_role: z.string() })
    .nullable(),
  confidence: z.number(),
});

export type ComplianceVerdictResult = z.infer<typeof complianceVerdictSchema>;
