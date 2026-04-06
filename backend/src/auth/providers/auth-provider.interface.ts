export type AuthProviderType = 'local' | 'azure-entraid' | 'aws-cognito';

export interface OIDCUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  groups?: string[];
}

export interface IAuthProvider {
  /** Build the IdP authorization URL the browser should be redirected to. */
  getAuthorizationUrl(state: string): string;

  /** Exchange an authorization code for user profile information. */
  exchangeCode(code: string, redirectUri: string): Promise<OIDCUser>;
}
