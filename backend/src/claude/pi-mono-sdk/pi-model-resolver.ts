/**
 * Model resolution for the pi-mono harness against pi-ai 0.80.2.
 *
 * pi 0.80.2 resolves built-in models with `getModel(provider, id)` (from
 * `@earendil-works/pi-ai/compat`) returning a `Model` object, and custom
 * providers via `ModelRegistry.registerProvider` / the extension's
 * `pi.registerProvider`. Short names (sonnet/opus/haiku/fable) map to current
 * Claude model ids, kept in sync with the `anthropic` harness's ANTHROPIC_MODELS
 * convention.
 */

/** Short-name → full Claude model id. Includes Opus 4.8 + Fable 5 (pi 0.77/0.79). */
export const SHORT_NAME_TO_MODEL_ID: Record<string, string> = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  fable: 'claude-fable-5',
};

/**
 * Resolve a subagent/frontmatter model value to a full model id.
 * Accepts 'opus' | 'sonnet' | 'haiku' | 'fable' | 'inherit' | '' | a full id.
 */
export function resolveModelId(model?: string, parentModelId?: string): string | undefined {
  if (!model || model === 'inherit' || model === '') return parentModelId;
  return SHORT_NAME_TO_MODEL_ID[model] ?? model ?? parentModelId;
}

export type PiModelConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  token?: string;
  isActive?: boolean;
};

/**
 * Resolve a `Model` object for `createAgentSession`/`setModel`.
 *
 * - Built-in Anthropic (or any provider in pi's catalog): `getModel(provider, id)`.
 * - Custom provider with baseUrl+token (e.g. local Ollama): caller should instead
 *   use `pi.registerProvider(...)` in the extension; this returns undefined so the
 *   session falls back to the registered/default model.
 *
 * @param piAi the dynamically-imported `@earendil-works/pi-ai/compat` module
 */
export function resolveModel(
  piAi: any,
  cfg: PiModelConfig | undefined,
  fallbackModelId?: string,
): any | undefined {
  const getModel = piAi?.getModel;
  if (typeof getModel !== 'function') return undefined;

  const provider = cfg?.provider || 'anthropic';
  const modelId = resolveModelId(cfg?.model, fallbackModelId) || cfg?.model;
  if (!modelId) return undefined;

  // Custom providers with their own baseUrl are wired via registerProvider, not here.
  if (cfg?.baseUrl) return undefined;

  try {
    return getModel(provider, modelId);
  } catch {
    return undefined;
  }
}
