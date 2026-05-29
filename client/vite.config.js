import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(clientRoot, '..');

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      react: path.join(repoRoot, 'node_modules/react'),
      'react-dom': path.join(repoRoot, 'node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: path.join(clientRoot, 'dist'),
    emptyOutDir: true,
  },
});
