const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const sqlitePkg = path.join(repoRoot, 'node_modules', 'better-sqlite3');
const nativePath = path.join(sqlitePkg, 'build', 'Release', 'better_sqlite3.node');

const envWithNode = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
};

function sqliteLoads() {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

function removeNative() {
  try {
    fs.rmSync(nativePath, { force: true });
  } catch {
    /* ignore */
  }
}

function tryPrebuild() {
  console.log('Downloading prebuilt better-sqlite3 for', process.version, '…');
  execSync('npx --yes prebuild-install', {
    cwd: sqlitePkg,
    stdio: 'inherit',
    env: envWithNode,
  });
}

function tryBuild() {
  console.log('Building better-sqlite3 from source for', process.version, '…');
  execSync('npm run build-release', {
    cwd: sqlitePkg,
    stdio: 'inherit',
    env: envWithNode,
  });
}

function recommendedNode() {
  const nodeVersionFile = path.join(repoRoot, '.node-version');
  if (fs.existsSync(nodeVersionFile)) {
    return fs.readFileSync(nodeVersionFile, 'utf8').trim();
  }
  return '22';
}

function fail() {
  const rec = recommendedNode();
  console.error(
    `\nbetter-sqlite3 is not available for Node ${process.version.slice(1)}.\n` +
    `Switch to Node ${rec} (see .node-version), then run:\n` +
    `  npm rebuild better-sqlite3\n` +
    `  npm run dev\n`
  );
  process.exit(1);
}

if (sqliteLoads()) {
  process.exit(0);
}

removeNative();

try {
  tryPrebuild();
} catch {
  /* fall through to source build */
}

if (!sqliteLoads()) {
  try {
    tryBuild();
  } catch {
    /* fail() below */
  }
}

if (!sqliteLoads()) {
  fail();
}
