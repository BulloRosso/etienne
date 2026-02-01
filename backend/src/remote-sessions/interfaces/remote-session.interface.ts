/**
 * Remote Session interfaces for mapping external messaging platforms to Claude projects
 */

export type RemoteProvider = 'telegram' | 'teams';

export interface RemoteSessionMapping {
  id: string;
  provider: RemoteProvider;
  created_at: string;
  updated_at: string;
  project: {
    name: string;
    sessionId: string;
  };
  remoteSession: RemoteSession;
  status: 'active' | 'paused' | 'disconnected';
}

/**
 * Generic remote session that supports both Telegram (numeric chatId) and Teams (string conversationId)
 */
export interface RemoteSession {
  chatId: number | string;
  userId?: number | string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * @deprecated Use RemoteSession instead. Kept for backwards compatibility.
 */
export type TelegramSession = RemoteSession;

export interface PendingPairing {
  id: string;
  code: string;
  provider: RemoteProvider;
  remoteSession: RemoteSession;
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
  type: 'pairing_approved' | 'pairing_denied' | 'etienne_response' | 'error';
  data: any;
  timestamp: string;
}
