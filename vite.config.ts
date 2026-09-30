/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths, so the build works from any sub-path (e.g. GitHub Pages)
  server: { host: true }, // lets you open the dev server from your phone on the same Wi-Fi
  test: { include: ['src/**/*.test.ts'] },
});
