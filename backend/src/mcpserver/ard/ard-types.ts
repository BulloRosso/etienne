/**
 * Type definitions for ARD (Agentic Resource Discovery).
 *
 * Spec: https://agenticresourcediscovery.org/spec/ (v0.9 Draft)
 *
 * ARD defines how "Agent Finder" endpoints are queried for MCP servers, A2A
 * agents and skills. It deliberately does NOT define the inside of a card —
 * that is left to the respective protocol — which is why endpoint extraction
 * downstream is best-effort.
 */

/**
 * Short name -> IANA media type. Per the spec these types are not formally
 * registered yet and may change, so they are kept in one place.
 */
export const MEDIA_TYPES: Record<string, string> = {
  mcp: 'application/mcp-server-card+json',
  a2a: 'application/a2a-agent-card+json',
  skill: 'application/ai-skill',
  registry: 'application/ai-registry+json',
};

export type ResourceKind = 'any' | 'mcp' | 'a2a' | 'skill' | 'registry';
export type Federation = 'auto' | 'referrals' | 'none';

/** Error codes from Appendix B of the spec. */
export const ERROR_CODES: Record<number, string> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  404: 'NOT_FOUND',
  429: 'RATE_LIMIT_EXCEEDED',
  500: 'INTERNAL_ERROR',
};

/** Failure while querying an Agent Finder. */
export class ArdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArdError';
  }
}

/** No, or an unknown, Agent Finder configured. */
export class ArdConfigError extends ArdError {
  constructor(message: string) {
    super(message);
    this.name = 'ArdConfigError';
  }
}

export interface AgentFinder {
  name: string;
  searchUrl: string;
  token?: string;
}

/**
 * Lightweight trust preview. Explicitly NOT a cryptographic verification —
 * signatures, JWKS resolution and attestation digests are never checked here.
 */
export interface TrustSummary {
  /** Publisher domain parsed out of the urn:air: identifier. */
  publisher: string | null;
  identity: string | null;
  identityType: string | null;
  attestations: string[];
  signed: boolean;
  /**
   * Tri-state: true = domain matches identity, false = it does NOT (possible
   * namespace abuse), null = no trustManifest present to compare against.
   */
  publisherMatchesIdentity: boolean | null;
  /** Always false — nothing here is cryptographically verified. */
  verified: false;
}

/** A catalog entry trimmed down to what a model actually needs. */
export interface ArdSearchResult {
  identifier: string;
  displayName?: string | null;
  description: string;
  type?: string | null;
  url?: string | null;
  capabilities: string[];
  score?: number | null;
  source?: string | null;
  trust: TrustSummary;
}

/** Raw, untrimmed entry as returned by a finder. */
export type ArdRawEntry = Record<string, any>;

/**
 * Everything needed to actually wire a discovered resource into a project.
 *
 * `endpoint`, `transport` and `authSchemes` are best-effort reads of the card:
 * ARD does not standardize the card interior. A null `endpoint` means the card
 * has to be inspected by hand.
 */
export interface PendingRegistration {
  identifier: string;
  displayName: string;
  mediaType: string;
  kind: string;
  cardUrl: string;
  card: Record<string, any>;
  endpoint: string | null;
  transport: string | null;
  authSchemes: string[];
  trust: TrustSummary | Record<string, never>;
  warnings: string[];
}

/** Result of fetching a card. */
export interface ArdCardResult {
  url: string;
  card: Record<string, any>;
  note: string;
}
