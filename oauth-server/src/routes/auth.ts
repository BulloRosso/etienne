import { Hono } from 'hono';
import { userService } from '../services/user.service.js';
import { tokenService } from '../services/token.service.js';
import type { LoginRequest, RefreshRequest } from '../types/index.js';

const auth = new Hono();

// POST /auth/login - Authenticate and return tokens
auth.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const user = userService.findByUsername(username);
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const isValid = await userService.verifyPassword(user, password);
  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = tokenService.generateRefreshToken(user);

  return c.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
  });
});

// POST /auth/refresh - Refresh access token
auth.post('/refresh', async (c) => {
  const body = await c.req.json<RefreshRequest>();
  const { refreshToken } = body;

  if (!refreshToken) {
    return c.json({ error: 'Refresh token is required' }, 400);
  }

  const payload = tokenService.verifyRefreshToken(refreshToken);
  if (!payload) {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  const user = userService.findById(payload.sub);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  const accessToken = tokenService.generateAccessToken(user);

  return c.json({ accessToken });
});

// GET /auth/me - Get current user info (requires valid access token)
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = tokenService.verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const user = userService.findById(payload.sub);
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  return c.json({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  });
});

// GET /auth/validate - Validate token (used by backend services)
auth.get('/validate', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ valid: false, error: 'Authorization header required' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = tokenService.verifyAccessToken(token);
  if (!payload) {
    return c.json({ valid: false, error: 'Invalid or expired token' }, 401);
  }

  return c.json({
    valid: true,
    user: {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      displayName: payload.displayName,
    },
  });
});

export default auth;
