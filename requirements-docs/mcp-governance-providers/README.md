# MCP Registry Providers

A pluggable provider system for discovering and connecting to Model Context Protocol (MCP) servers across multiple backends. One interface, four implementations, late-bound secrets, and configs you can hand directly to Claude, the OpenAI Responses API, or opencode.

---

## Why this exists

Teams building agentic applications quickly hit the same problem: they need a handful of MCP servers, those servers live in different places, and the rules for who gets to use which one depend on environment. A single JSON file works on day one. By month three you have:

- Internal servers on your own infra (`knowledge-graph`, `project-tools`, a Slack bridge you wrote last week)
- Third-party SaaS servers you don't want to host (Gmail, GitHub, Notion)
- Production servers that require audit trails, rate limits, and rotation
- Developers who want local-only servers that nobody else should see
- Secrets that should never live in git

This library lets you keep all of that behind one service. You ask `registry.toClaudeConfig()` and get a ready-to-use config file with secrets resolved from Azure Key Vault, AWS credentials wired up, tool allowlists applied, and a consistent view across every backend you use.

---

## Which provider should I use?

**Short answer:** start with `json-file`, add the others as you grow.

### `json-file` — the default, and where most projects should start

Use this when:

- You're building locally or on a small team and a file in the repo is good enough
- You run self-hosted MCP servers (a script on localhost, a sidecar container, an internal service)
- You want zero external dependencies — this provider works offline, in air-gapped environments, in CI, and on a plane
- You need a flat list of servers with minimal ceremony

Skip it when:

- Multiple teams need to share servers without a shared repo
- You need an audit trail of who called which tool
- You need per-team or per-environment access control enforced at the gateway
- Your JSON file has started to attract merge conflicts

The JSON file is the source of truth and lives in your repo. Placeholders like `${env:GITHUB_TOKEN}` and `${kv:gmail-client-secret}` stay unresolved in the file so you can commit it safely. **Cost:** free.

### `azure-api-center` — for production on Azure

Use this when:

- Your organization is already on Azure and teams expect governance (Entra ID groups, API Management policies, Azure Monitor)
- You need a spec-compliant MCP registry endpoint that GitHub Copilot, VS Code, and other IDE clients can consume directly
- You want runtime gatekeeping — rate limits, IP filtering, quota enforcement, JWT validation — without modifying MCP server code
- You need lifecycle metadata (dev / staging / prod environments, version pinning, deprecation status) to be part of the registry itself, not a convention
- You want to mix internally-hosted MCP servers with partner MCP servers (Logic Apps, GitHub MCP) in one catalog

Skip it when:

- You don't have an Azure tenant or don't want one
- Your MCP traffic is too small to justify an API Management instance
- You need to mutate the registry frequently from code (API Center is best managed through Azure portal, Bicep, or Terraform)

Expect an APIM Basic tier or higher for the runtime plane; the API Center catalog itself has a free tier. Authentication uses Microsoft Entra ID (formerly Azure AD). **Cost:** APIM Basic starts at a few tens of euros per month; the API Center catalog is free.

### `composio` — for SaaS toolkits you don't want to host yourself

Use this when:

- You need Gmail, GitHub, Slack, Notion, Linear, Stripe, or any of ~1000 third-party integrations, and you don't want to operate OAuth flows, token refresh, or credential storage
- You have end users who each bring their own credentials (multi-tenant), and Composio's per-user instance URLs remove an entire class of credential-isolation bugs
- Your production secret for these integrations should be exactly one API key (the Composio one), not N vendor-specific tokens
- Speed-to-integration matters more than control — you can add a toolkit in minutes

Skip it when:

- You're integrating with systems that aren't in Composio's catalog (your own internal APIs, for example)
- You don't want a vendor in the critical path of every MCP call
- Data residency requirements prevent routing tool calls through a third party
- Your cost model can't absorb per-action pricing at scale

Tool governance is native: every server has an `allowedTools` list that Composio enforces, so you can publish a GitHub server that can only read issues and never create pull requests. **Cost:** per-seat or per-action (check current pricing).

### `aws-bedrock-agentcore` — for production on AWS

Use this when:

- Your organization runs on AWS and you want an agent platform that integrates with IAM, CloudWatch, and AWS Marketplace
- You're building MCP servers yourself but don't want to operate the hosting (session isolation, scale-to-zero, microVM-per-session)
- You need 15-minute request timeouts and long-running session support (up to 8 hours) — AgentCore Runtime is built for this; most HTTP gateways are not
- You want session affinity (`Mcp-Session-Id` routing to the same microVM) handled for you
- Your MCP servers process multi-modal payloads (up to 100 MB) and you don't want to architect around an API Gateway 10 MB limit

Skip it when:

- You're not on AWS
- You need a polished inventory UI for non-engineers — AgentCore exposes its list through the API and the AWS Console, not a dedicated catalog portal like API Center
- You want something lighter than a containerized deployment per server

AgentCore Runtime is a *hosting* platform; this provider enumerates already-deployed runtimes via the control plane's `ListAgentRuntimes` API and returns connection URLs. It does **not** deploy runtimes for you — use the `agentcore` CLI or AWS SDK for that. Authentication can be AWS SigV4 (IAM) or OAuth 2.0 via your identity provider (Cognito / Okta / Entra ID). **Cost:** consumption-based, charged for active CPU time only.

### Using more than one at once (this is the common case)

You don't have to choose. A realistic production setup stacks providers by priority:

```
json-file                ← local dev overrides, internal servers
azure-api-center         ← governed production servers for your team
aws-bedrock-agentcore    ← your AWS-hosted MCP servers
composio                 ← the SaaS long tail
```

Order matters: later providers override earlier ones on name collisions. That means you can put a local-only `gmail` entry in your JSON file that shadows the Composio Gmail server during development, and production deployments automatically use the Composio one.

### Quick decision table

| I want to…                                                  | Pick                     |
| ----------------------------------------------------------- | ------------------------ |
| Get started in 5 minutes, local dev                         | `json-file`              |
| Add Gmail without writing an OAuth flow                     | `composio`               |
| Enforce JWT auth and rate limits on our internal MCP server | `azure-api-center`       |
| Host a long-running MCP server on a managed AWS platform    | `aws-bedrock-agentcore`  |
| Let non-engineers browse available tools                    | `azure-api-center`       |
| Multi-tenant agent with per-user credentials                | `composio`               |
| Air-gapped or offline development                           | `json-file`              |
| Process 50 MB payloads through an MCP server                | `aws-bedrock-agentcore`  |
| Mix internal and SaaS servers                               | all four together        |

---

## Install

```bash
npm install mcp-registry-providers
# or
pnpm add mcp-registry-providers
```

Peer dependencies are only required for providers you actually use:

| Provider                 | Peer dependencies                                                              |
| ------------------------ | ------------------------------------------------------------------------------ |
| `json-file`              | none                                                                           |
| `azure-api-center`       | `@azure/identity` (bundled)                                                    |
| `composio`               | `@composio/core`                                                               |
| `aws-bedrock-agentcore`  | `@aws-sdk/client-bedrock-agentcore-control` (bundled)                          |

Secrets backends:

| Backend          | Peer dependencies                                        |
| ---------------- | -------------------------------------------------------- |
| `env:` (default) | none                                                     |
| `kv:` (Azure KV) | `@azure/identity`, `@azure/keyvault-secrets` (bundled)   |

---

## Quick start

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { McpRegistryModule } from 'mcp-registry-providers';

@Module({
  imports: [
    McpRegistryModule.forRoot({
      providers: [
        // Order matters — later providers override earlier on name collision.
        { kind: 'json-file' },
        {
          kind: 'azure-api-center',
          options: {
            endpoint: 'https://my-apic.data.westeurope.azure-apicenter.ms',
          },
        },
        {
          kind: 'aws-bedrock-agentcore',
          options: {
            region: 'us-west-2',
            qualifier: 'DEFAULT',
            authMode: 'sigv4',
          },
        },
        {
          kind: 'composio',
          options: {
            apiKey: process.env.COMPOSIO_API_KEY!,
            defaultUserId: 'tenant-42',
          },
        },
      ],
      secrets: {
        keyVaultUrl: 'https://my-vault.vault.azure.net',
      },
    }),
  ],
})
export class AppModule {}
```

```ts
// anywhere you want to generate an MCP config
@Injectable()
export class ClaudeConfigBuilder {
  constructor(private readonly registry: McpRegistryService) {}

  async writeConfig(path: string) {
    const config = await this.registry.toClaudeConfig({ environment: 'prod' });
    await fs.writeFile(path, JSON.stringify(config, null, 2));
  }
}
```

That's enough to produce a working Claude config combining all four sources, with every secret resolved at the moment of materialization — not a moment earlier.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  McpRegistryService                      │
│  (merges providers, materializes Claude/OpenAI configs)  │
└─────────────────────────────────────────────────────────┘
          │                                    │
          │ listServers()                      │ resolveDeep()
          ▼                                    ▼
┌──────────────────────┐           ┌──────────────────────┐
│  IMcpRegistryProvider│           │  SecretResolverChain │
│  (4 implementations) │           │   env:, kv: schemes  │
└──────────────────────┘           └──────────────────────┘
          │
   ┌──────┼──────┬──────────────┬─────────────────┐
   ▼      ▼      ▼              ▼                 ▼
┌──────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐
│ JSON │ │ Azure API  │ │ Composio │ │ AWS Bedrock       │
│ file │ │ Center     │ │          │ │ AgentCore Runtime │
└──────┘ └────────────┘ └──────────┘ └───────────────────┘
```

Every provider returns entries in the same canonical shape, so downstream code never branches on "where did this come from." Secret placeholders stay unresolved until a config is being built for a specific target — this lets you log, cache, and diff registry output without leaking credentials.

---

## Secrets

Strings anywhere in a provider's output — URL, headers, env, args — can contain placeholders:

| Placeholder              | Resolved from                              |
| ------------------------ | ------------------------------------------ |
| `${env:FOO}`             | `process.env.FOO`                          |
| `${FOO}` (legacy)        | `process.env.FOO` (back-compat)            |
| `${kv:my-secret}`        | Azure Key Vault, latest version            |
| `${kv:my-secret@v1}`     | Azure Key Vault, pinned version `v1`       |
| `${aws-sigv4}`           | Sentinel — sign the request at call time   |

Missing secrets leave the placeholder intact so you can spot them in the output. Key Vault results are cached (5-minute default TTL) and the cache is invalidatable.

---

## Provider reference

### `json-file`

```ts
{
  kind: 'json-file',
  options: {
    registryPath: './mcp-server-registry.json', // default: $MCP_REGISTRY or cwd
    writable: false,                             // default: read-only
  },
}
```

File format:

```json
{
  "servers": [
    {
      "name": "knowledge-graph",
      "transport": "http",
      "url": "http://localhost:6060/mcp/knowledge-graph",
      "headers": { "Authorization": "${env:INTERNAL_TOKEN}" },
      "description": "Knowledge graph and vector search"
    }
  ]
}
```

Writes (when `writable: true`) persist back to disk as formatted JSON.

### `azure-api-center`

```ts
{
  kind: 'azure-api-center',
  options: {
    endpoint: 'https://my-apic.data.westeurope.azure-apicenter.ms',
    anonymous: false,    // set true if registry uses anonymous access
    scope: 'https://azure-apicenter.net/.default', // default
  },
}
```

**Important:** pass the base data-plane URL only. Do not include `/v0.1/servers` — that path is appended internally. Azure API Center's URL validation rejects extra segments. Credentials come from `DefaultAzureCredential`, which walks: env vars → workload identity → managed identity → Azure CLI → VS Code. Works the same locally and in Azure.

### `composio`

```ts
{
  kind: 'composio',
  options: {
    apiKey: process.env.COMPOSIO_API_KEY!,
    defaultUserId: 'tenant-42',  // optional — generates per-user URLs
    baseUrl: undefined,          // optional — for Composio SaaS overrides
  },
}
```

If `defaultUserId` is set, `listServers` returns per-user instance URLs (via `composio.mcp.generate`). Otherwise it returns the shared MCP URL.

Since March 2026, newly created Composio organizations require the `x-api-key` header on every MCP request. This provider sets it as a `${kv:composio-api-key}` placeholder so the key can live in Key Vault.

### `aws-bedrock-agentcore`

```ts
{
  kind: 'aws-bedrock-agentcore',
  options: {
    region: 'us-west-2',
    qualifier: 'DEFAULT',          // default
    authMode: 'sigv4',             // or 'bearer'
    bearerPlaceholder: '${kv:agentcore-bearer-token}', // used when authMode=bearer
    allowedStatuses: ['READY'],    // default; use ['*'] for all
    dataPlaneEndpoint: undefined,  // override for sovereign regions / PrivateLink
  },
}
```

This provider enumerates runtimes via `ListAgentRuntimes` and filters to those with `serverProtocol: MCP`. The invocation URL is constructed deterministically as `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encoded-arn}/invocations?qualifier={qualifier}`.

**A note on SigV4.** AWS IAM auth requires a signature over the outgoing request, which can't be precomputed at registry time. This provider sets `Authorization: ${aws-sigv4}` as a sentinel — your runtime must detect this value and sign the request using `@aws-sdk/signature-v4` (or equivalent) before sending. For OAuth-based setups (Cognito / Okta / Entra ID), use `authMode: 'bearer'` and a Key Vault placeholder, which flows through the normal resolver.

Credentials come from the AWS default credential provider chain — works with IAM roles, SSO, env vars, and profiles.

### `custom`

Implement `IMcpRegistryProvider` and pass it through:

```ts
{ kind: 'custom', instance: new MyConsulProvider(...) }
```

---

## Governance comparison

| Feature                            | JSON file | API Center       | Composio        | AgentCore             |
| ---------------------------------- | --------- | ---------------- | --------------- | --------------------- |
| Per-environment filtering          | Manual    | Native           | N/A             | Via qualifier         |
| Tool-level allowlist               | No        | Via APIM policy  | `allowedTools`  | At server level       |
| Audit trail                        | No        | Azure Monitor    | Composio dash   | CloudWatch            |
| Auth enforcement at gateway        | No        | Entra ID / keys  | `x-api-key`     | SigV4 / OAuth         |
| Rotation without code changes      | No        | Yes (APIM)       | Yes (Composio)  | Yes (IAM / IdP)       |
| Works offline / air-gapped         | Yes       | No               | No              | No                    |
| Multi-tenant per-user URLs         | No        | Possible via APIM| Native          | Possible via Identity |
| Long-running sessions (&gt; 5 min) | N/A       | APIM-dependent   | N/A             | 15 min → 8 hours      |

---

## API

### `McpRegistryService`

```ts
listServers(options?): Promise<McpServerEntry[]>       // placeholders intact
getServer(name): Promise<McpServerEntry | null>

listServersResolved(options?): Promise<McpServerEntry[]> // secrets expanded
getServerResolved(name): Promise<McpServerEntry | null>

toClaudeConfig(options?): Promise<ClaudeConfig>         // { mcpServers: { ... } }
toOpenAiTools(options?): Promise<OpenAiMcpTool[]>       // for Responses API
```

`options` accepts `{ environment, query }` for filtering.

### `IMcpRegistryProvider`

```ts
readonly id: string;
isAvailable(): Promise<boolean>;
listServers(options?): Promise<McpServerEntry[]>;
getServer(name): Promise<McpServerEntry | null>;
```

Providers that support mutation additionally implement `IMutableMcpRegistryProvider` with `registerServer`, `updateServer`, `deleteServer`. Today that's `json-file` (when `writable: true`) and `composio`.

---

## FAQ

**Is this production-ready?** The code is small and typechecks; tests for the provider contract are a good next step. The JSON file provider is drop-in compatible with the existing `mcp-server-registry.json` format.

**Can I use it outside NestJS?** Yes — the providers and `McpRegistryService` are plain classes. The NestJS module is a convenience wrapper. Instantiate them directly if you prefer.

**How do I handle multiple Key Vaults?** Register multiple resolvers under different schemes (e.g. `kv-prod:` and `kv-staging:`). The `SecretResolverChain.register()` method takes any `ISecretResolver` instance.

**What if a provider is down?** `McpRegistryService.listServers()` calls `isAvailable()` first and silently skips unavailable providers with a warning log. Your config generation keeps working with whatever sources are reachable.

**Can I cache the output?** Yes, but cache the *unresolved* output (from `listServers`, not `listServersResolved`). Then resolve secrets at the moment of materialization. This keeps caches free of credentials.
