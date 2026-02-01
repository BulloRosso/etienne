export interface TelegramConfig {
  botToken: string;
  backendUrl: string;
  port: number;
}

export interface SessionInfo {
  id: string;
  provider: string;
  project: {
    name: string;
    sessionId: string;
  };
  remoteSession: {
    chatId: number;
    username?: string;
    firstName?: string;
  };
  status: string;
}

export interface PairingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface MessageResult {
  success: boolean;
  response?: string;
  error?: string;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ProjectSelectionResult {
  success: boolean;
  projectName?: string;
  sessionId?: string;
  error?: string;
}

export interface UploadResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ProviderEvent {
  type: 'pairing_approved' | 'pairing_denied' | 'etienne_response' | 'error';
  data: {
    chatId: number;
    response?: string;
    sessionId?: string;
    message?: string;
    error?: string;
    success?: boolean;
    tokenUsage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  timestamp: string;
}
