/**
 * A2A Protocol Type Definitions
 * Based on the Google Agent-to-Agent protocol specification
 */

// Message types
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

export interface Message {
  messageId: string;
  role: 'user' | 'agent';
  kind: 'message';
  parts: Part[];
}

// Task types
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

// Request/Response types
export interface MessageSendParams {
  message: Message;
  configuration?: {
    blocking?: boolean;
    acceptedOutputModes?: string[];
  };
}

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

// Streaming event types
export interface TaskEvent {
  kind: 'task';
  id: string;
  status: TaskStatus;
}

export interface StatusUpdateEvent {
  kind: 'status-update';
  taskId: string;
  status: TaskStatus;
  final?: boolean;
}

export interface ArtifactUpdateEvent {
  kind: 'artifact-update';
  taskId: string;
  artifact: Artifact;
}

export type StreamEvent = TaskEvent | StatusUpdateEvent | ArtifactUpdateEvent;
