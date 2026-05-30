const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'node_modules', '.vite');
const staleClientCache = path.join(__dirname, '..', 'client', 'node_modules');

for (const dir of [cacheDir, staleClientCache]) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
