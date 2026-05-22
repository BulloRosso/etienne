import { PackageLockfile, ValidationIssue } from './lockfile.dto';

/**
 * Response from POST /api/packages/resolve — manifest + resolved state.
 */
export interface ResolveResult {
  lockfile: PackageLockfile;
}

/**
 * Response from POST /api/packages/validate — lighter, no lockfile body.
 */
export interface ValidateResult {
  conflicts: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Response from POST /api/packages/deploy.
 */
export interface DeployResult {
  success: boolean;
  projectName: string;
  warnings?: string[];
  guidanceDocuments?: string[];
  errors?: string[];
}
