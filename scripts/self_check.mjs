/**
 * Self-check for Release / dist contract (no live server required for core checks).
 *
 * 1) Static: dist has Editor + viewer-shell + web.config
 * 2) Optional: if T360_BASE is up (or auto-start dev), smoke-check Editor + brand
 *
 * Exit 0 only if critical checks pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BASE = process.env.T360_BASE || 'http://127.0.0.1:8888';
const SKIP_SERVER = process.env.T360_SKIP_SERVER === '1';

let fails = 0;
function pass(msg) {
  console.log('PASS', msg);
}
function fail(msg) {
  console.log('FAIL', msg);
  fails++;
}

function exists(rel, label) {
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs)) {
    pass(`dist/${rel} (${label})`);
    return true;
  }
  fail(`missing dist/${rel} (${label})`);
  return false;
}

function checkDist() {
  console.log('--- dist contract ---');
  if (!fs.existsSync(DIST)) {
    fail('dist/ missing — run npm run build first');
    return;
  }
  exists('index.html', 'Editor');
  exists('web.config', 'IIS MIME');
  exists(path.join('viewer-shell', 'index.html'), 'viewer shell');
  exists(path.join('viewer-shell', 'manifest.json'), 'shell manifest');
  exists('brand', 'brand assets');
  exists('assets', 'built assets');

  if (fs.existsSync(path.join(DIST, 'web.config'))) {
    const wc = fs.readFileSync(path.join(DIST, 'web.config'), 'utf8');
    if (wc.includes('fileExtension=".json"') && wc.includes('mimeMap')) pass('web.config has .json MIME');
    else fail('web.config missing .json mimeMap');
  }

  if (fs.existsSync(path.join(DIST, 'viewer-shell', 'manifest.json'))) {
    try {
      const man = JSON.parse(fs.readFileSync(path.join(DIST, 'viewer-shell', 'manifest.json'), 'utf8'));
      if (man?.files?.length) pass(`viewer-shell files: ${man.files.length}`);
      else fail('viewer-shell manifest empty');
    } catch (e) {
      fail(`viewer-shell manifest parse: ${e.message}`);
    }
  }

  // Legacy unbundled three must not ship
  if (fs.existsSync(path.join(DIST, 'vendor', 'three.module.js'))) {
    fail('dist still has vendor/three.module.js (remove public/vendor)');
  } else {
    pass('no legacy vendor/three in dist');
  }

  // Sourcemaps should be off for default production build
  const assetsDir = path.join(DIST, 'assets');
  if (fs.existsSync(assetsDir)) {
    const maps = fs.readdirSync(assetsDir).filter((n) => n.endsWith('.map'));
    if (maps.length && process.env.T360_SOURCEMAP !== '1') {
      fail(`unexpected .map files in dist/assets: ${maps.join(', ')}`);
    } else if (!maps.length) {
      pass('no sourcemaps in dist/assets');
    } else {
      pass('sourcemaps present (T360_SOURCEMAP=1)');
    }
  }
}

async function get(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const buf = await res.arrayBuffer();
  return {
    ok: res.ok,
    status: res.status,
    len: buf.byteLength,
    text:
      res.headers.get('content-type')?.includes('json') ||
      url.endsWith('.ts') ||
      url.endsWith('.html') ||
      url.endsWith('/')
        ? new TextDecoder().decode(buf.slice(0, 200000))
        : '',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureServer() {
  try {
    const h = await get(`${BASE}/`);
    if (h.ok) return true;
  } catch {
    /* down */
  }
  console.log('Starting dev server…');
  const child = spawn('npm.cmd', ['run', 'dev'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '8888' },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const h = await get(`${BASE}/`);
      if (h.ok) return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

async function checkServer() {
  console.log('--- live smoke ---');
  if (!(await ensureServer())) {
    fail('server not up');
    return;
  }
  pass('server up');

  for (const u of [`${BASE}/`, `${BASE}/brand/clp-dark.png`, `${BASE}/src/ui/EditorApp.ts`]) {
    try {
      const r = await get(u);
      if (r.ok) pass(`${r.status} ${u} (${r.len})`);
      else fail(`${r.status} ${u}`);
    } catch (e) {
      fail(`${u} ${e.message}`);
    }
  }

  // viewer-shell available for export when served from public after build
  try {
    const man = await get(`${BASE}/viewer-shell/manifest.json`);
    if (man.ok) pass('viewer-shell/manifest.json reachable');
    else fail(`viewer-shell/manifest.json ${man.status} (run build so public/viewer-shell exists)`);
  } catch (e) {
    fail(`viewer-shell ${e.message}`);
  }

  const ed = await get(`${BASE}/src/ui/EditorApp.ts`);
  if (ed.ok) {
    if (ed.text.includes('hint-empty-scenes')) pass('editor has empty hint');
    else fail('editor missing hint-empty-scenes');
    if (ed.text.includes('btn-deploy') || ed.text.includes('oneClickDeploy'))
      fail('editor still has one-click deploy UI');
    else pass('editor has no one-click deploy');
    if (ed.text.includes('window.alert(')) fail('editor still has window.alert(');
    else pass('no window.alert');
  }
}

async function main() {
  checkDist();

  if (!SKIP_SERVER) {
    await checkServer();
  } else {
    console.log('--- live smoke skipped (T360_SKIP_SERVER=1) ---');
  }

  if (fails) {
    console.log(`\n${fails} FAIL(s)`);
    process.exit(1);
  }
  console.log('\nALL PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
