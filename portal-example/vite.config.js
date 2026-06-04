import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the portal under /app/ so asset URLs match the Etienne proxy mapping
// (http://localhost:5000/app/* -> http://localhost:5001/app/*). The trailing
// slash matters — Vite redirects /app to /app/ at startup, and Etienne's
// post-login redirect must use /app/ (configured in the project's
// .etienne/user-interface.json appDirectory field).
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    port: 5001,
    strictPort: true,
  },
});
