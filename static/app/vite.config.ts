import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.tsx'] },
} as never);
