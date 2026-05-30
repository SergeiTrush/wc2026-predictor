import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(clientRoot, '..');

export default defineConfig({
  root: clientRoot,
  // Single node_modules at repo root; Vite cache lives there too
  cacheDir: path.join(repoRoot, 'node_modules/.vite'),
  plugins: [react()],
  resolve: {
    // Do NOT alias react/react-dom — that bypasses optimizeDeps and loads a 2nd copy
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    modules: [path.join(repoRoot, 'node_modules'), 'node_modules'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: path.join(clientRoot, 'dist'),
    emptyOutDir: true,
  },
});
