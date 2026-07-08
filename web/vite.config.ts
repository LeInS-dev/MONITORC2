import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El dashboard se sirve desde el mismo origen que el server en producción.
// En dev, proxyamos /api y /ws al server relay (puerto 4600).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': { target: 'http://localhost:4600', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4600', ws: true },
    },
  },
  build: { outDir: 'dist' },
});
