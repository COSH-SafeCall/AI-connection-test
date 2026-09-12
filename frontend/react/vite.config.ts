import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // Same-origin development proxy; browser origins are checked in production.
        configure(proxy) { proxy.on('proxyReq', (request) => request.removeHeader('origin')); },
      },
    },
  },
});
