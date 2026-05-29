const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nativePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

if (fs.existsSync(nativePath)) {
  process.exit(0);
}

console.log('Building better-sqlite3 for', process.version, '…');
const sqlitePkg = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
execSync('npm run build-release', {
  cwd: sqlitePkg,
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
  },
});

if (!fs.existsSync(nativePath)) {
  console.error(
    '\nbetter-sqlite3 failed to build. Use Node 22+ (see .node-version), then run:\n  npm rebuild better-sqlite3\n'
  );
  process.exit(1);
}
