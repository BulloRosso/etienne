export type UserRole = 'guest' | 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
  enabled: boolean;
}

export interface UserConfig {
  users: User[];
  settings: {
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    jwtSecret: string;
  };
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
  displayName: string;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    role: UserRole;
    displayName: string;
  };
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface UserInfo {
  id: string;
  username: string;
  role: UserRole;
  displayName: string;
}
