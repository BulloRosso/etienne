/**
 * HITL Protocol v0.8 — Core Type Definitions
 *
 * Open standard for Human-in-the-Loop interactions in autonomous agent services.
 * "HITL Protocol is to human decisions what OAuth is to authentication."
 */

// ---------------------------------------------------------------------------
// Verification policies
// ---------------------------------------------------------------------------

export type VerificationPolicyLevel = 'optional' | 'required' | 'step_up_only';
export type HITLDecision = 'approve' | 'deny' | 'escalate';
export type DecisionMethod =
  | 'modal_click'
  | 'telegram_inline_button'
  | 'teams_adaptive_card'
  | 'api_response';

// ---------------------------------------------------------------------------
// Incoming verification request (from external service)
// ---------------------------------------------------------------------------

export interface HITLVerificationRequest {
  /** Identifier of the calling service (e.g. "oracle-integration", "crewai-prod") */
  service_id: string;
  /** Action category (e.g. "file_delete", "deploy", "approve_expense") */
  action_type: string;
  /** Human-readable description of what the agent wants to do */
  action_description: string;
  /** Requested verification policy */
  verification_policy: VerificationPolicyLevel;
  /** Action-specific data for human review */
  payload: any;
  /** Timeout in milliseconds (default: 300 000 = 5 min) */
  timeout_ms?: number;
  /** Platform-specific rendering hints */
  platform_hints?: Record<string, any>;
  /** Callback URL for async inline submit */
  submit_url?: string;
  /** Bearer token the platform uses when POSTing to submit_url */
  submit_token?: string;
  /** Arbitrary metadata passed through unchanged */
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Response returned to the calling service
// ---------------------------------------------------------------------------

export interface HITLVerificationResponse {
  request_id: string;
  decision: HITLDecision;
  proof_of_human: ProofOfHuman;
  modified_payload?: any;
}

// ---------------------------------------------------------------------------
// Proof of Human — cryptographically verifiable decision record
// ---------------------------------------------------------------------------

export interface ProofOfHuman {
  timestamp: string;
  user_id: string;
  decision_method: DecisionMethod;
  session_fingerprint?: string;
  platform: string;
  verification_policy_applied: VerificationPolicyLevel;
}

// ---------------------------------------------------------------------------
// Project-level verification policy configuration
// ---------------------------------------------------------------------------

export interface HITLActionOverride {
  action_type: string;
  policy: VerificationPolicyLevel;
}

export interface HITLStepUpCriterion {
  pattern: string;
  policy: VerificationPolicyLevel;
}

export interface HITLProjectConfig {
  enabled: boolean;
  default_policy: VerificationPolicyLevel;
  timeout_ms: number;
  action_overrides: HITLActionOverride[];
  step_up_criteria: HITLStepUpCriterion[];
  allowed_services: string[];
  delivery_channels: string[];
}

export interface VerificationPolicy {
  default_policy: VerificationPolicyLevel;
  action_overrides: HITLActionOverride[];
  step_up_criteria: HITLStepUpCriterion[];
  supported_platforms: string[];
}

// ---------------------------------------------------------------------------
// Policy evaluation result
// ---------------------------------------------------------------------------

export interface PolicyEvaluation {
  effective_policy: VerificationPolicyLevel;
  requires_human_review: boolean;
  step_up_criteria_matched?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Pending HITL request (tracked while waiting for human response)
// ---------------------------------------------------------------------------

export interface PendingHITLRequest {
  id: string;
  project: string;
  request: HITLVerificationRequest;
  resolve: (response: HITLVerificationResponse) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  response?: HITLVerificationResponse;
}

// ---------------------------------------------------------------------------
// Frontend response DTO
// ---------------------------------------------------------------------------

export interface HITLFrontendResponse {
  request_id: string;
  decision: HITLDecision;
  modified_payload?: any;
  user_id?: string;
}

// ---------------------------------------------------------------------------
// Async verification status
// ---------------------------------------------------------------------------

export interface HITLAsyncStatus {
  request_id: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  proof_of_human?: ProofOfHuman;
  decision?: HITLDecision;
}
