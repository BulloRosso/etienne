/**
 * Shared types for observability provider selection.
 */

export type ObservabilityProviderName = 'phoenix' | 'azure' | 'aws';

export const DEFAULT_OBSERVABILITY_PROVIDER: ObservabilityProviderName = 'phoenix';

export function parseProviderName(value: string | undefined): ObservabilityProviderName {
  const v = (value || '').toLowerCase();
  if (v === 'azure' || v === 'aws' || v === 'phoenix') return v;
  return DEFAULT_OBSERVABILITY_PROVIDER;
}
