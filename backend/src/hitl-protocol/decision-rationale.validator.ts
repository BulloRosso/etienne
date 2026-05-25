import * as fs from 'fs';
import * as path from 'path';
import { DecisionRationale } from './interfaces/hitl-protocol.interface';

const MAX_REASONING_LENGTH = 2000;

export class DecisionRationaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionRationaleValidationError';
  }
}

export interface ValidateDecisionRationaleOptions {
  /** Absolute path to the project root (typically `<workspace>/<project>`). */
  projectRoot: string;
  /** When true, every evidence document path must exist on disk. Defaults to true. */
  requireDocumentsExist?: boolean;
}

export function validateDecisionRationale(
  rationale: DecisionRationale,
  options: ValidateDecisionRationaleOptions,
): void {
  if (!rationale || typeof rationale !== 'object') {
    throw new DecisionRationaleValidationError('rationale must be an object');
  }

  const reasoning = typeof rationale.reasoning === 'string' ? rationale.reasoning.trim() : '';
  if (reasoning.length === 0) {
    throw new DecisionRationaleValidationError('rationale.reasoning must be a non-empty string');
  }
  if (reasoning.length > MAX_REASONING_LENGTH) {
    throw new DecisionRationaleValidationError(
      `rationale.reasoning exceeds ${MAX_REASONING_LENGTH} characters`,
    );
  }

  if (!Array.isArray(rationale.evidenceDocuments)) {
    throw new DecisionRationaleValidationError('rationale.evidenceDocuments must be an array');
  }

  if (typeof rationale.recordedAt !== 'string' || !rationale.recordedAt) {
    throw new DecisionRationaleValidationError('rationale.recordedAt must be an ISO 8601 string');
  }
  if (Number.isNaN(Date.parse(rationale.recordedAt))) {
    throw new DecisionRationaleValidationError('rationale.recordedAt is not a valid ISO 8601 timestamp');
  }

  const projectRootResolved = path.resolve(options.projectRoot);
  const requireExist = options.requireDocumentsExist !== false;

  for (const docPath of rationale.evidenceDocuments) {
    if (typeof docPath !== 'string' || docPath.length === 0) {
      throw new DecisionRationaleValidationError(
        'every entry in rationale.evidenceDocuments must be a non-empty string',
      );
    }
    if (path.isAbsolute(docPath)) {
      throw new DecisionRationaleValidationError(
        `evidence document path must be project-relative: ${docPath}`,
      );
    }
    const resolved = path.resolve(projectRootResolved, docPath);
    const rel = path.relative(projectRootResolved, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new DecisionRationaleValidationError(
        `evidence document path escapes the project root: ${docPath}`,
      );
    }
    if (requireExist && !fs.existsSync(resolved)) {
      throw new DecisionRationaleValidationError(
        `evidence document not found: ${docPath}`,
      );
    }
  }
}
