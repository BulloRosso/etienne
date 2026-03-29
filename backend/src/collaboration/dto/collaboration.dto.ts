import { AgentCardDto } from '../../a2a-settings/dto/a2a-settings.dto';

/**
 * Metadata about a counterpart agent and the diplomatic channel
 */
export interface CounterpartMetadata {
  counterpartName: string;
  counterpartSlug: string;
  counterpartUrl: string;
  agentCard: AgentCardDto;
  channelCreated: string;
  lastActivity: string;
  trustLevel: 'standard' | 'elevated' | 'restricted';
  conversationCount: number;
  filesExchanged: {
    sent: number;
    received: number;
  };
}

/**
 * A single file exchange record
 */
export interface FileExchangeRecord {
  name: string;
  path: string;
  mimeType?: string;
  sizeBytes?: number;
}

/**
 * An entry in the file manifest
 */
export interface FileManifestEntry {
  timestamp: string;
  direction: 'outbound' | 'inbound';
  files: FileExchangeRecord[];
  messageId?: string;
  taskId?: string;
}

/**
 * The full file manifest
 */
export interface FileManifest {
  exchanges: FileManifestEntry[];
}

/**
 * A conversation log entry for audit purposes
 */
export interface ConversationLogEntry {
  timestamp: string;
  direction: 'outbound' | 'inbound';
  topic?: string;
  message: string;
  files?: string[];
  status?: string;
  taskId?: string;
}

/**
 * Summary of a counterpart project
 */
export interface CounterpartProjectSummary {
  projectName: string;
  counterpartName: string;
  counterpartUrl: string;
  lastActivity: string;
  conversationCount: number;
  filesExchanged: {
    sent: number;
    received: number;
  };
}

/**
 * A pending pairing request (receiver side)
 */
export interface PendingPairingRequest {
  id: string;
  pin: string;
  initiatorUrl: string;
  initiatorAgentCard?: AgentCardDto;
  createdAt: string;
  expiresAt: string;
}

/**
 * Request to initiate pairing (from initiator frontend)
 */
export interface InitiatePairingDto {
  agentUrl: string;
}

/**
 * Request from initiator backend to receiver backend
 */
export interface PairingRequestDto {
  initiatorUrl: string;
  initiatorAgentCard: AgentCardDto;
}

/**
 * Response from receiver backend with the agent info (PIN is communicated out-of-band)
 */
export interface PairingRequestResponseDto {
  success: boolean;
  pairingId: string;
  receiverAgentCard: AgentCardDto;
  message?: string;
}

/**
 * Request to verify PIN and complete pairing
 */
export interface VerifyPairingDto {
  agentUrl: string;
  pin: string;
}

/**
 * Verification request from initiator backend to receiver backend
 */
export interface PairingVerifyRequestDto {
  pairingId: string;
  pin: string;
  initiatorAgentCard: AgentCardDto;
}

/**
 * Response from verification
 */
export interface PairingVerifyResponseDto {
  success: boolean;
  message?: string;
  receiverAgentCard?: AgentCardDto;
}
