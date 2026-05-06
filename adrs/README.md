# Architecture Decision Records (ADRs)

Architecture Decision Records for the **Etienne** multi-tenant AI agent platform.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](001-project-isolation-and-multi-tenancy.md) | Project Isolation and Multi-Tenancy | Accepted |
| [ADR-002](002-inner-harness-design.md) | Inner Harness Design: Exchangeable Coding Agent Orchestrators | Accepted |
| [ADR-003](003-sse-communication-protocol.md) | SSE Communication Protocol | Accepted |
| [ADR-004](004-service-connectivity.md) | Service Connectivity: Agent Bus, MCP Registry, and A2A | Accepted |
| [ADR-005](005-security-architecture.md) | Security Architecture | Accepted |
| [ADR-006](006-event-driven-architecture.md) | Event-Driven Architecture: CMS/DSS/SWE Triad | Accepted |
| [ADR-007](007-agentic-behaviour.md) | Agentic Behaviour: Skills, Subagents, Personas, and A2A | Accepted |
| [ADR-008](008-ux-components-and-customization.md) | UX Components and Customization | Accepted |
| [ADR-009](009-messenger-integration.md) | Messenger Integration: Teams and Telegram | Accepted |
| [ADR-010](010-external-webserver.md) | External Webserver for Public Sites and Dynamic APIs | Accepted |
| [ADR-011](011-cloud-service-integration.md) | Cloud Service Integration | Accepted |

## Base Values

All ADRs are validated against these five base values:

1. **Data Isolation** -- Project directories and local data; no information spillover via remote systems
2. **Exchangeable Inner Harness** -- Unified interface for multiple coding agent orchestrators
3. **Rich Configuration** -- MCP tools, agent skills, UI components, filesystem integration
4. **Composable Services** -- Start small (frontend + backend + auth), extend with use-case-specific servers
5. **Agentic Engineering** -- Extended with AI agents (e.g. Claude Code), not manual coding
