import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin: serves sandbox_proxy.html at /sandbox-proxy.
 * The MCP-UI AppRenderer needs a sandbox proxy for secure iframe rendering.
 * Served on the same origin — no extra port needed (Docker-compatible).
 */
function mcpSandboxProxyPlugin() {
  let html;
  return {
    name: 'mcp-sandbox-proxy',
    configureServer(server) {
      html = readFileSync(join(__dirname, 'public', 'sandbox_proxy.html'), 'utf-8');
      server.middlewares.use('/sandbox-proxy', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mcpSandboxProxyPlugin()],
  publicDir: 'public',
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
        '/api': { target: 'http://localhost:6060', changeOrigin: true, ws: true },
        '/mcp': { target: 'http://localhost:6060', changeOrigin: true },
        '/web': { target: 'http://localhost:4000', changeOrigin: true },
        '/auth': { target: 'http://localhost:5950', changeOrigin: true }
    }
  },
  optimizeDeps: {
    include: [
      '@mcp-ui/client',
      '@modelcontextprotocol/sdk/client/index.js',
      '@modelcontextprotocol/sdk/client/streamableHttp.js',
    ],
  },
});
