import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import auth from './routes/auth.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:5000', 'http://localhost:6060'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Routes
app.route('/auth', auth);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Start server
const port = parseInt(process.env.PORT || '5950', 10);

console.log(`OAuth server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`OAuth server running at http://localhost:${port}`);
