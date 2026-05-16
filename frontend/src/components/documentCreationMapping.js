/**
 * Pure mapping/tracking logic for the Document Creation flow.
 *
 * Extracted from DocumentCreationModal.jsx so it can be unit-tested without a
 * DOM. The modal imports `recomputeStatus`, `mergeMappings` and
 * `buildMappingFile`; the backend tracking test imports the same module.
 *
 * The single source of truth is `source-target.sectionmappings.json`. The
 * dashboard owns the user fields (source, transformation, languages, mode);
 * the document-creation skill owns the skill fields (status, provenance,
 * lastRun). On every save the modal does a read-modify-write so a skill run
 * that happened while the modal was open is never clobbered.
 */

export const STATUSES = [
  'unmapped',
  'mapped',
  'generated',
  'skipped',
  'error',
  'reviewed',
];

// Statuses the skill (not the UI) owns. The UI must not invent these.
const SKILL_STATUSES = new Set(['generated', 'skipped', 'error']);

/**
 * Stable key for a target section.
 */
export function targetKeyOf(targetSection) {
  if (!targetSection) return '';
  return `${targetSection.number}||${targetSection.title}`;
}

/**
 * Decide a mapping's status given the user's current intent and the
 * authoritative base row last written (possibly by the skill).
 *
 * Rules:
 *  - no source            -> 'unmapped'
 *  - base was reviewed and inputs unchanged   -> 'reviewed' (sticky)
 *  - base had a skill status and the user did NOT change source/transformation
 *                         -> keep the skill status (generated/skipped/error)
 *  - base had a skill status but the user changed source/transformation
 *                         -> 'mapped' (it must be regenerated)
 *  - otherwise            -> 'mapped'
 *
 * `current`  = { sourceSection: 'num||title' | '', transformation: string }
 * `baseRow`  = the corresponding mapping object from the fetched file, or null
 */
export function recomputeStatus(current, baseRow) {
  const hasSource = !!(current && current.sourceSection);
  if (!hasSource) return 'unmapped';

  if (!baseRow) return 'mapped';

  const baseStatus = baseRow.status;
  const baseHadSkillState =
    SKILL_STATUSES.has(baseStatus) || baseStatus === 'reviewed';
  if (!baseHadSkillState) return 'mapped';

  // Reconstruct the base's user intent to detect a change.
  const baseSourceSection = baseRow.source
    ? `${baseRow.source.section}||${baseRow.source.title || ''}`
    : '';
  const baseTransformation = baseRow.transformation || '';

  const changed =
    baseSourceSection !== (current.sourceSection || '') ||
    baseTransformation !== (current.transformation || '');

  if (changed) return 'mapped';
  return baseStatus; // sticky generated / skipped / error / reviewed
}

/**
 * Build the full mappings-file object from UI state, WITHOUT a base.
 * Used only for the very first save (no file exists yet).
 *
 * `ui` = {
 *   sourceDocuments, templateDocument, targetLanguage, mode, outputFile,
 *   sourceLanguageCode,
 *   rows: [{ targetSection:{number,title}, sourceSection:'num||title'|'',
 *            transformation }]
 * }
 */
export function buildMappingFile(ui) {
  return {
    sourceDocuments: ui.sourceDocuments || [],
    templateDocument: ui.templateDocument || '',
    targetLanguage: ui.targetLanguage,
    mode: ui.mode,
    outputFile: ui.outputFile,
    mappings: (ui.rows || []).map((r) => {
      let source = null;
      if (r.sourceSection) {
        const [number, title] = r.sourceSection.split('||');
        source = {
          document: (ui.sourceDocuments || [])[0] || '',
          section: number,
          title: title || '',
        };
      }
      return {
        targetSection: { ...r.targetSection },
        source,
        transformation: r.transformation || '',
        sourceLanguage: ui.sourceLanguageCode || 'unknown',
        status: recomputeStatus(
          { sourceSection: r.sourceSection, transformation: r.transformation },
          null,
        ),
      };
    }),
  };
}

/**
 * Read-modify-write merge. `base` is the freshly-fetched file object (or null
 * if none exists). `ui` is the same shape as for buildMappingFile.
 *
 * UI-owned fields are overwritten from `ui`; skill-owned fields
 * (provenance, and the top-level lastRun) are preserved from `base`; status is
 * recomputed against the base row so a skill result is only invalidated when
 * the user actually changed that row.
 */
export function mergeMappings(base, ui) {
  const baseByKey = new Map();
  if (base && Array.isArray(base.mappings)) {
    for (const m of base.mappings) {
      baseByKey.set(targetKeyOf(m.targetSection), m);
    }
  }

  const merged = {
    sourceDocuments: ui.sourceDocuments || [],
    templateDocument: ui.templateDocument || '',
    targetLanguage: ui.targetLanguage,
    mode: ui.mode,
    outputFile: ui.outputFile,
    mappings: (ui.rows || []).map((r) => {
      const key = targetKeyOf(r.targetSection);
      const baseRow = baseByKey.get(key) || null;

      let source = null;
      if (r.sourceSection) {
        const [number, title] = r.sourceSection.split('||');
        source = {
          document: (ui.sourceDocuments || [])[0] || '',
          section: number,
          title: title || '',
        };
      }

      const status = recomputeStatus(
        { sourceSection: r.sourceSection, transformation: r.transformation },
        baseRow,
      );

      const out = {
        targetSection: { ...r.targetSection },
        source,
        transformation: r.transformation || '',
        sourceLanguage: ui.sourceLanguageCode || 'unknown',
        status,
      };

      // Preserve skill-written provenance unless the row was invalidated
      // back to 'mapped'/'unmapped' (then it no longer describes the output).
      if (
        baseRow &&
        baseRow.provenance &&
        (status === 'generated' ||
          status === 'skipped' ||
          status === 'error' ||
          status === 'reviewed')
      ) {
        out.provenance = baseRow.provenance;
      }
      return out;
    }),
  };

  // Top-level lastRun is skill-owned: preserve verbatim.
  if (base && base.lastRun) {
    merged.lastRun = base.lastRun;
  }

  return merged;
}

/**
 * Validate the optional tracking schema. Returns an array of error strings
 * (empty = valid). Absent tracking fields are acceptable (backward compat).
 */
export function validateTrackingSchema(obj) {
  const errors = [];
  const isIso = (s) =>
    typeof s === 'string' && !Number.isNaN(Date.parse(s));
  const isHash = (s) => typeof s === 'string' && /^sha256:[0-9a-f]{8,}$/.test(s);

  if (!obj || typeof obj !== 'object') {
    return ['root is not an object'];
  }

  if ('lastRun' in obj && obj.lastRun != null) {
    const lr = obj.lastRun;
    if (!isIso(lr.at)) errors.push('lastRun.at is not ISO-8601');
    for (const k of ['filled', 'skipped', 'error']) {
      if (typeof lr[k] !== 'number') errors.push(`lastRun.${k} is not a number`);
    }
    if (typeof lr.outputFile !== 'string') {
      errors.push('lastRun.outputFile is not a string');
    }
  }

  const mappings = Array.isArray(obj.mappings) ? obj.mappings : [];
  mappings.forEach((m, i) => {
    if ('status' in m && m.status != null) {
      if (!STATUSES.includes(m.status)) {
        errors.push(`mappings[${i}].status "${m.status}" is invalid`);
      }
    }
    if ('provenance' in m && m.provenance != null) {
      const p = m.provenance;
      if (!isIso(p.generatedAt)) {
        errors.push(`mappings[${i}].provenance.generatedAt is not ISO-8601`);
      }
      if (!isHash(p.sourceHash)) {
        errors.push(
          `mappings[${i}].provenance.sourceHash must match sha256:<hex>`,
        );
      }
      if (typeof p.outputSection !== 'string') {
        errors.push(`mappings[${i}].provenance.outputSection is not a string`);
      }
      if (typeof p.note !== 'string') {
        errors.push(`mappings[${i}].provenance.note is not a string`);
      }
    }
  });

  return errors;
}

/**
 * Build the per-key status map for display. `rows` is the UI rows; `baseByKey`
 * maps targetKey -> the mapping object last seen on disk (with skill fields and
 * the source/transformation that were saved when the skill ran). Status for a
 * row reflects: current UI intent vs. that saved base.
 */
export function statusMap(rows, baseByKey) {
  const out = {};
  for (const r of rows || []) {
    const key = targetKeyOf(r.targetSection);
    out[key] = recomputeStatus(
      { sourceSection: r.sourceSection, transformation: r.transformation },
      baseByKey[key] || null,
    );
  }
  return out;
}

/**
 * Convenience derived counts for the coverage meter.
 */
export function coverageCounts(rows, statusByKey) {
  let mapped = 0;
  let generated = 0;
  let reviewed = 0;
  for (const r of rows || []) {
    const s = statusByKey[targetKeyOf(r.targetSection)] || 'unmapped';
    if (s !== 'unmapped') mapped += 1;
    if (s === 'generated') generated += 1;
    if (s === 'reviewed') reviewed += 1;
  }
  return { total: (rows || []).length, mapped, generated, reviewed };
}
