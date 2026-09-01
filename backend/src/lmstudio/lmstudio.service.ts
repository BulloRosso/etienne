import { Injectable, Logger } from '@nestjs/common';

export interface LmStudioProbeResult {
  reachable: boolean;
  baseUrl?: string;
  models?: string[];
  authRequired?: boolean;
}

const DEFAULT_PORT = 1234;
const PROBE_TIMEOUT_MS = 1500;

/**
 * Probes for a local LM Studio server (Anthropic-compatible since 0.4.1).
 * Used by the first-run diagnostics and the on-demand /api/lmstudio/models
 * endpoint to detect the server and enumerate loaded models.
 */
@Injectable()
export class LmStudioService {
  private readonly logger = new Logger(LmStudioService.name);

  /**
   * Candidate origins to probe, most likely first. When the backend runs in
   * a container, LM Studio on the host is reachable via host.docker.internal.
   */
  private candidateBaseUrls(): string[] {
    const candidates: string[] = [];
    if (process.env.LMSTUDIO_BASE_URL) {
      candidates.push(process.env.LMSTUDIO_BASE_URL.replace(/\/+$/, ''));
    }
    const hostUrls = [`http://localhost:${DEFAULT_PORT}`, `http://host.docker.internal:${DEFAULT_PORT}`];
    if (process.env.DEVCONTAINER === 'true') hostUrls.reverse();
    candidates.push(...hostUrls);
    return [...new Set(candidates)];
  }

  /**
   * Probe all candidates in parallel; the first reachable one wins.
   * 401/403 counts as reachable (auth enabled) with an empty model list.
   * tokenOverride lets the first-run wizard test a token before it is saved.
   */
  async probe(tokenOverride?: string): Promise<LmStudioProbeResult> {
    const results = await Promise.all(
      this.candidateBaseUrls().map((baseUrl) => this.probeOne(baseUrl, tokenOverride)),
    );
    const reachable = results.filter((r) => r.reachable);
    // Prefer a candidate that actually lists models over an auth-blocked one
    return reachable.find((r) => (r.models?.length ?? 0) > 0)
      ?? reachable[0]
      ?? { reachable: false };
  }

  private async probeOne(baseUrl: string, tokenOverride?: string): Promise<LmStudioProbeResult> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${tokenOverride || process.env.LMSTUDIO_AUTH_TOKEN || 'lmstudio'}`,
        },
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return { reachable: true, baseUrl, models: [], authRequired: true };
      }
      if (!res.ok) return { reachable: false };
      const body: any = await res.json();
      const models = Array.isArray(body?.data)
        ? body.data.map((m: any) => m?.id).filter((id: any) => typeof id === 'string')
        : [];
      return { reachable: true, baseUrl, models };
    } catch {
      return { reachable: false };
    } finally {
      clearTimeout(t);
    }
  }
}
