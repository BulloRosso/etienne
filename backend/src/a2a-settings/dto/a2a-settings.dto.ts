/**
 * DTOs for A2A Settings API
 */

/**
 * Agent Skill definition from the A2A agent card
 */
export interface AgentSkillDto {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

/**
 * Agent Capabilities from the A2A agent card
 */
export interface AgentCapabilitiesDto {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

/**
 * Agent Card - the full agent information from A2A protocol
 */
export interface AgentCardDto {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities?: AgentCapabilitiesDto;
  skills?: AgentSkillDto[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  // Additional metadata we track
  enabled?: boolean;
  lastConnected?: string;
  cardUrl?: string; // URL where we fetched the agent card from
}

/**
 * A2A Settings configuration stored per project
 */
export interface A2ASettingsDto {
  registryUrl: string;
  agents: AgentCardDto[];
  lastUpdated?: string;
}

/**
 * Request to update A2A settings
 */
export interface UpdateA2ASettingsDto {
  registryUrl?: string;
  agents?: AgentCardDto[];
}

/**
 * Request to toggle agent enabled status
 */
export interface ToggleAgentDto {
  agentUrl: string;
  enabled: boolean;
}
