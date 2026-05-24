const DEFAULT_LIMIT = 200_000;

export function getContextLimit(model?: string): number {
  if (!model) return DEFAULT_LIMIT;
  const m = model.toLowerCase();

  if (m.includes('[1m]') || m.includes('-1m')) return 1_000_000;

  if (m.includes('opus-4-7') || m.includes('opus-4-6')) return 200_000;
  if (m.includes('sonnet-4')) return 200_000;
  if (m.includes('haiku-4')) return 200_000;

  if (m.includes('opus')) return 200_000;
  if (m.includes('sonnet')) return 200_000;
  if (m.includes('haiku')) return 200_000;

  return DEFAULT_LIMIT;
}
