import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local dev, `vercel dev` serves the /api serverless functions.
// If you run plain `vite`, set VITE_API_PROXY to your `vercel dev` URL
// (default http://localhost:3000) so /api calls are proxied.
const API_PROXY = process.env.VITE_API_PROXY || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_PROXY,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
