export interface AgentRole {
  id: string;
  name: string;
  description: string;
  content: string; // The full CLAUDE.md content
}

export interface AgentRoleRegistryData {
  roles: AgentRole[];
}
