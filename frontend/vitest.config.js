import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dedicated test config — intentionally does NOT pull in the dev server's
// sandbox-proxy plugin or API proxy from vite.config.js (irrelevant under test).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
