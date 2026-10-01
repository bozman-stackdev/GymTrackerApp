/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version} (${new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'})`) },
  plugins: [
    react(),
    // Installable + works offline: a service worker caches the whole app (it's small and has no server data).
    VitePWA({
      registerType: 'autoUpdate', // new versions install themselves; data is in localStorage, so a reload is safe
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym Tracker',
        description: 'Spend less time tracking your workout and more time doing it.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], navigateFallback: 'index.html' },
    }),
  ],
  base: './', // relative asset paths, so the build works from any sub-path (e.g. GitHub Pages)
  server: { host: true }, // lets you open the dev server from your phone on the same Wi-Fi
  test: { include: ['src/**/*.test.ts'] },
});
