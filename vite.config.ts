import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

function disableHmrClientWebSocketPlugin(): Plugin {
  let hmrDisabled = false;
  return {
    name: 'disable-hmr-client-websocket',
    apply: 'serve',
    enforce: 'post',
    configResolved(config) {
      hmrDisabled = config.server.hmr === false || config.server.ws === false;
    },
    transform(code, id) {
      if (!hmrDisabled) return null;
      const normalizedId = id.replace(/\\/g, '/').split('?')[0];
      if (!normalizedId.endsWith('/vite/dist/client/client.mjs')) return null;

      const updated = code.replace(
        /createConnection:\s*\(\)\s*=>\s*new WebSocket\([^)]*\)/g,
        'createConnection: () => ({ OPEN: 1, readyState: 1, addEventListener() {}, send() {}, close() {} })',
      );

      return updated !== code ? { code: updated, map: null } : null;
    },
  };
}

export default defineConfig({
  plugins: [
    disableHmrClientWebSocketPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: '/',
        name: 'Gassar.AI',
        short_name: 'Gassar.AI',
        description: 'Gassar.AI — مساعد ذكاء اصطناعي عصري للمحادثات والمرفقات والصوت والنماذج السحابية',
        theme_color: '#4285F4',
        background_color: '#F8F9FA',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: false,
    ws: false,
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
