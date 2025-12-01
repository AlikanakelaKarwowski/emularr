import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './', // Use relative paths for assets so they work in Electron's file:// protocol
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist/renderer',
    // Use IIFE format instead of ES modules for Electron compatibility
    rollupOptions: {
      output: {
        format: 'iife',
        // Ensure assets use relative paths
        assetFileNames: 'assets/[name].[ext]',
        entryFileNames: 'assets/[name].js',
      },
    },
  },
});
