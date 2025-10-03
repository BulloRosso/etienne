import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
        '/api': { target: 'http://localhost:6060', changeOrigin: true, ws: true }
    }
  }
});
