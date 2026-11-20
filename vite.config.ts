import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Allow opening the dev server from a phone on the same network or via a tunnel.
    host: true,
    allowedHosts: true,
    proxy: {
      // Same-origin API calls are forwarded to the Express backend.
      '/api': 'http://localhost:4000',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
