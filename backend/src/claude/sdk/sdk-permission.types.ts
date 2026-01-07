/**
 * SDK Permission Types
 *
 * Type definitions for handling Claude Agent SDK's canUseTool callback,
 * AskUserQuestion tool, and ExitPlanMode tool.
 */

/**
 * Permission update rule for SDK
 */
export interface PermissionUpdate {
  toolName: string;
  permission: 'allow' | 'deny' | 'ask';
}

/**
 * SDK Permission Result (returned by canUseTool callback)
 */
export interface PermissionResult {
  behavior: 'allow' | 'deny';
  updatedInput?: any;
  updatedPermissions?: PermissionUpdate[];
  message?: string;  // Required when behavior is 'deny'
  interrupt?: boolean;  // When true, halts the entire session
}

/**
 * AskUserQuestion tool input schema (from Claude Agent SDK)
 */
export interface AskUserQuestionInput {
  questions: Array<{
    question: string;     // Full question text ending in "?"
    header: string;       // Short label, max 12 characters
    options: Array<{
      label: string;      // Display text, 1-5 words
      description: string; // Explanation of this choice
    }>;
    multiSelect: boolean; // Allow selecting multiple options
  }>;
  answers?: Record<string, string>; // User responses (populated by UI)
}

/**
 * ExitPlanMode tool input schema (from Claude Agent SDK)
 */
export interface ExitPlanModeInput {
  // Note: The actual plan is written to a plan file, not passed here
  // ExitPlanMode signals readiness for plan approval
}

/**
 * Request types for the permission system
 */
export type PermissionRequestType = 'permission' | 'ask_user_question' | 'plan_approval';

/**
 * Pending permission request (tracked while waiting for user response)
 */
export interface PendingPermissionRequest {
  id: string;
  requestType: PermissionRequestType;
  toolName: string;
  toolInput: any;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  createdAt: Date;
  sessionId?: string;
  projectName: string;
  suggestions?: PermissionUpdate[];  // From canUseTool options
}

/**
 * Response from frontend for permission requests
 */
export interface PermissionResponse {
  id: string;
  action: 'allow' | 'deny' | 'cancel';
  updatedInput?: any;
  updatedPermissions?: PermissionUpdate[];
  message?: string;  // Denial reason
  interrupt?: boolean;  // Whether to halt session
}

/**
 * SSE event data for permission request
 */
export interface PermissionRequestEvent {
  id: string;
  toolName: string;
  toolInput: any;
  suggestions?: PermissionUpdate[];
}

/**
 * SSE event data for AskUserQuestion
 */
export interface AskUserQuestionEvent {
  id: string;
  questions: AskUserQuestionInput['questions'];
}

/**
 * SSE event data for plan approval
 */
export interface PlanApprovalEvent {
  id: string;
  planFilePath: string;  // Path to the plan file for the frontend to read
}

/**
 * canUseTool callback signature (from Claude Agent SDK)
 */
export type CanUseTool = (
  toolName: string,
  input: any,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
  }
) => Promise<PermissionResult>;
