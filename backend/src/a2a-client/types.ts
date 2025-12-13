/**
 * A2A Client Type Definitions
 */

// Part types for messages
export interface TextPart {
  kind: 'text';
  text: string;
}

export interface FilePart {
  kind: 'file';
  file: {
    bytes?: string; // base64 encoded
    uri?: string;
    name?: string;
    mimeType?: string;
  };
}

export type Part = TextPart | FilePart;

// Message structure
export interface Message {
  messageId: string;
  role: 'user' | 'agent';
  kind: 'message';
  parts: Part[];
}

// Task states
export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  parts: Part[];
}

export interface Task {
  kind: 'task';
  id: string;
  status: TaskStatus;
  artifacts?: Artifact[];
}

// Request parameters
export interface MessageSendParams {
  message: Message;
  configuration?: {
    blocking?: boolean;
    acceptedOutputModes?: string[];
  };
}

// Response types
export interface SendMessageSuccessResponse {
  result: Task | Message;
}

export interface SendMessageErrorResponse {
  error: {
    code: number;
    message: string;
  };
}

export type SendMessageResponse = SendMessageSuccessResponse | SendMessageErrorResponse;

// Agent Card types
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities?: AgentCapabilities;
  skills?: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
}

// Client options
export interface A2AClientOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

// Result extraction helpers
export interface ExtractedResult {
  text?: string;
  files?: Array<{
    name: string;
    mimeType?: string;
    content: Buffer;
  }>;
  taskId?: string;
  status: TaskState;
}
