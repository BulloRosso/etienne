/**
 * `AZURE_AI_CONNECTION` — one connection string describing how to reach the
 * Claude models deployed in Azure AI Foundry (Azure AI Services), including
 * which credential to use.
 *
 * Motivation: the backend already has three separate Foundry paths wired
 * through loose env vars (`AZURE_AI_ENDPOINT`, `ANTHROPIC_FOUNDRY_RESOURCE`,
 * `ANTHROPIC_FOUNDRY_API_KEY`, `CLAUDE_CODE_USE_FOUNDRY`,
 * `AZURE_FOUNDRY_AGENT_ID`, `ANTHROPIC_MODELS`). Operators deploying the
 * `requ-tracker` image to Azure App Service should not have to know that
 * matrix — they set one App Setting and everything downstream (the coding
 * agent subprocess AND `LlmService`) follows.
 *
 * This module deliberately does NOT talk to Azure. It is a pure parser plus an
 * `apply()` that projects the parsed connection onto the env vars the existing
 * code already understands, so token acquisition/refresh keeps living in
 * `LlmService.acquireManagedIdentityToken()` (managed identity, refreshed every
 * 45 min, published as `_FOUNDRY_MODEL_TOKEN`).
 *
 * Grammar (Azure-style, semicolon separated, keys case-insensitive, values may
 * contain `=` because only the first `=` splits):
 *
 *   Endpoint=https://<resource>.services.ai.azure.com;Credential=ManagedIdentity;
 *   ClientId=<user-assigned-mi-client-id>;Opus=claude-opus-5;Sonnet=claude-sonnet-5;
 *   Haiku=claude-haiku-4-5
 *
 * A bare URL (`https://foo.services.ai.azure.com`) or bare resource name
 * (`foo`) is also accepted and means "managed identity, default deployments".
 */

export type AzureAiCredentialKind = 'managedidentity' | 'default' | 'apikey';

export interface AzureAiConnection {
  /** Fully-qualified Anthropic-compatible base URL, e.g. `https://x.services.ai.azure.com/anthropic/v1`. */
  baseUrl: string;
  /** Origin only, without the `/anthropic/v1` suffix — handy for logging. */
  endpoint: string;
  credential: AzureAiCredentialKind;
  /** Client id of a user-assigned managed identity, if one is pinned. */
  clientId?: string;
  tenantId?: string;
  /** Only set when `credential === 'apikey'`. */
  apiKey?: string;
  /** Entra scope requested for the model plane. */
  scope: string;
  /** Deployment names as they exist in the Foundry resource. */
  models: { opus: string; sonnet: string; haiku: string };
  /** Which deployment backs each `LlmService` tier. */
  tiers: { small: string; regular: string };
}

/** Azure AI Services exposes the Anthropic wire format under this path. */
const ANTHROPIC_PATH = '/anthropic/v1';
const DEFAULT_SCOPE = 'https://cognitiveservices.azure.com/.default';

/**
 * Default deployment names. These match the Anthropic model ids, which is the
 * convention Foundry uses when a deployment is created with its default name.
 * Note there is no "Haiku 5" — the current small model is Claude Haiku 4.5.
 * Override any of them via `Opus=` / `Sonnet=` / `Haiku=` when the Foundry
 * deployment was given a custom name.
 */
const DEFAULT_MODELS = {
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
} as const;

/** Split `Key=Value;Key=Value` on the FIRST `=` only — secrets contain `=`. */
function parsePairs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out.set(key, value);
  }
  return out;
}

/** `foo` → `https://foo.services.ai.azure.com`; a URL is passed through. */
function normalizeEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}.services.ai.azure.com`;
  // Tolerate operators pasting the full messages URL out of the portal.
  return withScheme
    .replace(/\/messages$/i, '')
    .replace(new RegExp(`${ANTHROPIC_PATH}$`, 'i'), '')
    .replace(/\/+$/, '');
}

function normalizeCredential(value: string | undefined): AzureAiCredentialKind {
  const v = (value || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  if (v === 'apikey' || v === 'key') return 'apikey';
  if (v === 'default' || v === 'defaultazurecredential') return 'default';
  // Managed identity is the documented deployment mode for this image.
  return 'managedidentity';
}

/**
 * Parse `AZURE_AI_CONNECTION`. Returns `null` when the variable is unset or
 * blank (the caller then leaves the existing env-var wiring untouched).
 * Throws on a malformed value — failing loud beats silently falling back to
 * the public Anthropic API with no key.
 */
export function parseAzureAiConnection(raw: string | undefined): AzureAiConnection | null {
  if (!raw || !raw.trim()) return null;
  const value = raw.trim();

  // Shorthand: the whole value is just an endpoint (no `key=value` pairs).
  const looksLikePairs = /(^|;)\s*[A-Za-z][A-Za-z0-9]*\s*=/.test(value);
  const pairs = looksLikePairs ? parsePairs(value) : new Map<string, string>();
  const endpointRaw = looksLikePairs ? pairs.get('endpoint') || pairs.get('resource') : value;

  if (!endpointRaw) {
    throw new Error(
      'AZURE_AI_CONNECTION is set but has no Endpoint= (or Resource=) segment. ' +
        'Expected e.g. "Endpoint=https://<resource>.services.ai.azure.com;Credential=ManagedIdentity".',
    );
  }

  const endpoint = normalizeEndpoint(endpointRaw);
  try {
    // eslint-disable-next-line no-new
    new URL(endpoint);
  } catch {
    throw new Error(`AZURE_AI_CONNECTION Endpoint is not a valid URL: "${endpointRaw}"`);
  }

  const credential = normalizeCredential(pairs.get('credential'));
  const apiKey = pairs.get('apikey') || pairs.get('key');
  if (credential === 'apikey' && !apiKey) {
    throw new Error('AZURE_AI_CONNECTION uses Credential=ApiKey but no ApiKey= segment was given.');
  }

  const models = {
    opus: pairs.get('opus') || DEFAULT_MODELS.opus,
    sonnet: pairs.get('sonnet') || DEFAULT_MODELS.sonnet,
    haiku: pairs.get('haiku') || DEFAULT_MODELS.haiku,
  };

  // `LlmService` only knows two tiers. Background work (titles, summaries,
  // extraction) runs on `small`; anything user-visible runs on `regular`.
  const tierAlias = (name: string | undefined, fallback: string): string => {
    if (!name) return fallback;
    const key = name.trim().toLowerCase();
    if (key === 'opus') return models.opus;
    if (key === 'sonnet') return models.sonnet;
    if (key === 'haiku') return models.haiku;
    return name.trim(); // an explicit deployment name
  };

  return {
    endpoint,
    baseUrl: `${endpoint}${ANTHROPIC_PATH}`,
    credential,
    clientId: pairs.get('clientid') || undefined,
    tenantId: pairs.get('tenantid') || undefined,
    apiKey: credential === 'apikey' ? apiKey : undefined,
    scope: pairs.get('scope') || DEFAULT_SCOPE,
    models,
    tiers: {
      small: tierAlias(pairs.get('smallmodel') || pairs.get('small'), models.haiku),
      regular: tierAlias(pairs.get('regularmodel') || pairs.get('regular'), models.sonnet),
    },
  };
}

export interface AzureAiApplyResult {
  connection: AzureAiConnection;
  /** Human-readable, secret-free description for the startup log. */
  summary: string;
}

/**
 * Project the connection onto the env vars the rest of the backend reads.
 *
 * Must run BEFORE `NestFactory.create()`: `LlmService` resolves its provider in
 * its constructor, so the vars have to be in `process.env` by then.
 *
 * Nothing here overwrites a value an operator set explicitly — the connection
 * string is a convenience layer, not an override.
 */
export function applyAzureAiConnection(
  env: NodeJS.ProcessEnv = process.env,
): AzureAiApplyResult | null {
  const connection = parseAzureAiConnection(env.AZURE_AI_CONNECTION);
  if (!connection) return null;

  const setIfAbsent = (key: string, value: string | undefined) => {
    if (value && !env[key]) env[key] = value;
  };

  // Endpoint — both names are read in different code paths.
  setIfAbsent('AZURE_AI_ENDPOINT', connection.baseUrl);
  setIfAbsent('ANTHROPIC_FOUNDRY_RESOURCE', connection.baseUrl);

  if (connection.credential === 'apikey') {
    // Static-key path (LlmService "Path 2"). Useful for a local smoke test
    // where no managed identity exists.
    setIfAbsent('CLAUDE_CODE_USE_FOUNDRY', '1');
    setIfAbsent('ANTHROPIC_FOUNDRY_API_KEY', connection.apiKey);
  } else {
    // Managed-identity path (LlmService "Path 1"). `AZURE_FOUNDRY_AGENT_ID` is
    // the flag that activates it; when the platform hasn't supplied a real
    // agent id we set a marker so the branch still engages.
    setIfAbsent('AZURE_FOUNDRY_AGENT_ID', 'azure-ai-connection');
    // DefaultAzureCredential picks a user-assigned identity via AZURE_CLIENT_ID.
    setIfAbsent('AZURE_CLIENT_ID', connection.clientId);
    setIfAbsent('AZURE_TENANT_ID', connection.tenantId);
  }

  setIfAbsent('AZURE_AI_SCOPE', connection.scope);

  // LlmService tiers: "small,regular".
  setIfAbsent('ANTHROPIC_MODELS', `${connection.tiers.small},${connection.tiers.regular}`);

  // Coding-agent subprocess aliases. Without these the Claude Code CLI asks the
  // Foundry endpoint for public Anthropic model ids, which are not deployments.
  setIfAbsent('ANTHROPIC_DEFAULT_OPUS_MODEL', connection.models.opus);
  setIfAbsent('ANTHROPIC_DEFAULT_SONNET_MODEL', connection.models.sonnet);
  setIfAbsent('ANTHROPIC_DEFAULT_HAIKU_MODEL', connection.models.haiku);
  setIfAbsent('CLAUDE_CODE_SUBAGENT_MODEL', connection.models.sonnet);

  const credentialLabel =
    connection.credential === 'apikey'
      ? 'api key'
      : connection.clientId
        ? `managed identity (client ${connection.clientId})`
        : 'managed identity (system-assigned)';

  return {
    connection,
    summary:
      `Azure AI connection: ${connection.baseUrl} via ${credentialLabel}; ` +
      `opus=${connection.models.opus} sonnet=${connection.models.sonnet} haiku=${connection.models.haiku}`,
  };
}
