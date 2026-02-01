/**
 * Remote Session interfaces for mapping external messaging platforms to Claude projects
 */

export interface RemoteSessionMapping {
  id: string;
  provider: 'telegram';
  created_at: string;
  updated_at: string;
  project: {
    name: string;
    sessionId: string;
  };
  remoteSession: TelegramSession;
  status: 'active' | 'paused' | 'disconnected';
}

export interface TelegramSession {
  chatId: number;
  userId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface PendingPairing {
  id: string;
  code: string;
  provider: 'telegram';
  remoteSession: TelegramSession;
  created_at: string;
  expires_at: string;
}

export interface RemoteSessionsData {
  'remote-sessions': RemoteSessionMapping[];
  'pending-pairings': PendingPairing[];
}

export interface PairingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface MessageForwardResult {
  success: boolean;
  response?: string;
  error?: string;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ProviderEvent {
  type: 'pairing_approved' | 'pairing_denied' | 'claude_response' | 'error';
  data: any;
  timestamp: string;
}
