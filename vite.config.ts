/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 700 },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
