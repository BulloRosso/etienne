# Project Structure Documentation

This document explains the workspace organization and project management features in Etienne.

## Overview

Etienne organizes work into projects, where each project is a separate folder in the workspace directory. This structure allows for:
- Isolated agent configurations per project
- Custom skills and tools for each project
- Centralized management of approved resources

## Creating a New Project

When creating a new project through the wizard, you can configure:

1. **Project Name** - A unique identifier for your project (lowercase letters, numbers, hyphens)
2. **Mission Brief** - A detailed description of the project goals (required)
3. **Agent Role** - Select a predefined role or create a custom one
4. **Skills** - Standard skills are included automatically; optional skills can be added
5. **Tools** - Configure MCP servers for external integrations
6. **External Agents** - Enable A2A agents for collaboration
7. **Customize UI** - Copy UI settings from an existing project

## Project Directory Structure

Each project in the workspace follows this structure:

```
workspace/<project-name>/
├── .claude/
│   ├── CLAUDE.md           # Mission brief and agent role definition
│   ├── settings.json       # Project-specific settings and hooks
│   └── skills/             # Project skills
│       └── <skill-name>/
│           └── SKILL.md    # Skill definition
├── .etienne/
│   └── a2a-settings.json   # A2A agent configuration
├── .mcp.json               # MCP server configuration
├── .attachments/           # User uploaded files
├── data/
│   ├── permissions.json    # Tool permissions
│   └── session.id          # Current session identifier
└── out/                    # Output files
```

## Skills

Skills are reusable capabilities that can be assigned to projects. They are stored in the skill repository and can be:

### Standard Skills
- Automatically included in every new project
- Located in the `skill-repository/standard/` directory
- Cannot be removed during project creation

### Optional Skills
- Available for selection during project creation
- Located in the `skill-repository/standard/optional/` directory
- Can be added based on project needs

### Skill Structure
Each skill is a directory containing a `SKILL.md` file that defines the skill's behavior and instructions.

## MCP Tools

MCP (Model Context Protocol) tools extend the agent's capabilities by connecting to external services. Projects can use:

### Pre-approved MCP Servers
- Listed in the MCP registry (`mcp-server-registry.json`)
- Configured by administrators
- Automatically available for selection

### Custom MCP Servers
- Added manually with URL and authentication
- Configured per project

## External Agents (A2A)

A2A (Agent-to-Agent) protocol enables collaboration with external agents. Projects can:

### Use Registry Agents
- Pre-configured agents from the A2A registry
- Approved by administrators

### Agent Configuration
Agents are stored in `.etienne/a2a-settings.json` with their connection details and enabled status.

## Agent Roles

Agent roles define the AI assistant's personality, expertise, and working style. They are:

### Predefined Roles
- Listed in the agent role registry (`agent-role-registry.json`)
- Include: Data Engineer, Researcher, Web Designer, General Assistant
- Selected during project creation

### Custom Roles
- Created during project creation
- Written in markdown format
- Stored in `.claude/CLAUDE.md`

## Configuration Files for Administrators

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SKILL_REPOSITORY` | Path to skill repository directory | `/app/skill-repository` |
| `MCP_REGISTRY` | Path to MCP server registry JSON | `/app/backend/mcp-server-registry.json` |
| `A2A_REGISTRY` | Path to A2A agent registry JSON | `/app/backend/a2a-registry.json` |
| `AGENT_ROLE_REGISTRY` | Path to agent role registry JSON | `/app/backend/agent-role-registry.json` |

### Registry File Formats

#### MCP Server Registry (`mcp-server-registry.json`)
```json
{
  "servers": [
    {
      "name": "example-server",
      "transport": "http",
      "url": "https://mcp.example.com",
      "description": "Example MCP server",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  ]
}
```

#### A2A Agent Registry (`a2a-registry.json`)
```json
{
  "agents": [
    {
      "name": "Example Agent",
      "url": "https://agent.example.com",
      "description": "Example A2A agent",
      "skills": [
        { "name": "web-search", "description": "Search the web" }
      ]
    }
  ]
}
```

#### Agent Role Registry (`agent-role-registry.json`)
```json
{
  "roles": [
    {
      "id": "data-engineer",
      "name": "Data Engineer",
      "description": "Specialized in data analysis and processing",
      "content": "# Data Engineer\n\nYou are a data engineering assistant..."
    }
  ]
}
```

#### Skill Repository Structure
```
skill-repository/
├── standard/
│   ├── skill-name-1/
│   │   └── SKILL.md
│   ├── skill-name-2/
│   │   └── SKILL.md
│   └── optional/
│       ├── optional-skill-1/
│       │   └── SKILL.md
│       └── optional-skill-2/
│           └── SKILL.md
```

## UI Indicators

For non-admin users, the following indicators appear in the preview pane:

- **MCP Tools** (black badge) - Shows number of active MCP tools; click to see list
- **Skills** (orange badge) - Shows number of active skills; click to manage
- **External Agents** (navy blue badge) - Shows number of available agents; click to see list

These indicators help users understand what capabilities are available in their project.
