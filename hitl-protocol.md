# HITL Protocol Support

## Why HITL Protocol?

As AI agents move from isolated experiments to production infrastructure, a critical question emerges: **who approves what the agent does?**

Every vendor solves this differently — Oracle has governance flows, AWS Nova Act has human approval APIs, CrewAI has in-platform review, Zapier has approval connectors. Without a shared standard, integrating multiple agent services means building custom approval bridges for each one.

**HITL Protocol v0.8** (February 2026) is an open standard that solves this: *"HITL Protocol is to human decisions what OAuth is to authentication."* It provides a universal interface for **Services**, **Agents**, and **Humans** to coordinate approval flows across platforms and vendors.

### Benefits

| Benefit | Description |
|---------|-------------|
| **Vendor interoperability** | Any HITL-compliant service (Oracle, AWS, CrewAI, n8n, Zapier, Cloudflare Agents, etc.) can request human approval through Etienne using a single API |
| **Multi-platform rendering** | The same approval request renders natively on the web UI, Telegram, Teams, Slack, Discord, or WhatsApp — no per-platform integration code |
| **Proof of Human** | Cryptographically verifiable proof that a real human made a decision, with timestamp, user ID, platform, and decision method |
| **Verification policies** | Declare per-project and per-action whether human review is `optional`, `required`, or `step_up_only` (required only for elevated-risk actions) |
| **Agent detection** | External agents can preflight the verification policy before acting, rendering platform-native approval buttons when needed |
| **Inline submit** | Services provide a callback URL — Etienne delivers the human decision directly back, no polling required |

### How Etienne Connects

Etienne already implements the building blocks that HITL Protocol standardizes. The integration maps the open standard onto existing infrastructure:

| HITL Protocol Concept | Etienne Connection Point |
|----------------------|--------------------------|
| **Verification request** | New `POST /api/hitl/verify` endpoint → routes through the existing `InterceptorsService` SSE pipeline |
| **Human decision UI** | Dedicated `HITLApprovalModal` in the frontend, following the same pattern as the existing permission, plan approval, and elicitation modals |
| **Proof of Human** | Generated from existing auth context (user JWT, session fingerprint) and enriched with decision metadata |
| **Verification policies** | Per-project configuration in `.claude/hitl-config.json` with action-level overrides and step-up criteria |
| **Multi-platform rendering** | Leverages the existing remote sessions system (Telegram, Teams) — HITL requests render as inline keyboards or Adaptive Cards |
| **Inline submit** | After the human responds via any channel, Etienne POSTs the decision to the service's callback URL with a signed submit token |
| **Agent preflight** | `GET /api/hitl/policy/:project` returns the effective verification policy so external agents know what to expect |
| **Pending request management** | Same Promise-based pattern used by `SdkPermissionService` — requests stored in-memory with configurable timeout (default 5 min) |

### Supported Vendors

HITL Protocol v0.8 is supported by a growing ecosystem:

| Vendor | Support Level |
|--------|--------------|
| Oracle Integration | Full |
| AWS Nova Act | Full |
| Microsoft Agent Framework | Full |
| Cloudflare Agents | Full |
| CrewAI Enterprise | Full |
| Botpress | Full |
| n8n | Integration |
| Zapier | Integration |
| Termo | Skill |
| LangGraph + Elastic | Compatible |

Compatible agent frameworks: **OpenClaw**, **Claude Code**, **Codex**.

### Configuration

Per-project HITL configuration is stored in `.claude/hitl-config.json`:

```json
{
  "enabled": true,
  "default_policy": "required",
  "timeout_ms": 300000,
  "action_overrides": [
    { "action_type": "file_delete", "policy": "required" },
    { "action_type": "read_file", "policy": "optional" }
  ],
  "step_up_criteria": [
    { "pattern": ".*production.*", "policy": "required" }
  ],
  "allowed_services": ["oracle-*", "crewai-*"],
  "delivery_channels": ["web", "telegram", "teams"]
}
```

Workspace-wide defaults can be set in `.agent/hitl-config.json` and via environment variables (`HITL_ENABLED`, `HITL_DEFAULT_POLICY`, `HITL_DEFAULT_TIMEOUT_MS`).
