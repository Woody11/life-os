import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Life OS frontend.
//
// WHY the proxy: in dev the React app runs on Vite's own dev server (5173 by
// default) while the Express backend runs on 3030. Proxying /api/* to the
// backend means frontend code can call same-origin relative paths (fetch('/api/status'))
// with zero CORS handling in either dev or production, since in production
// Express serves the built client from the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emit to client/dist — the exact path Express serves statically in prod.
    outDir: 'dist',
  },
});
