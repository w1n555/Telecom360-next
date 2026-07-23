/**
 * Self-check for Release / dist contract (no live server required for core checks).
 *
 * 1) Static: dist has Editor + viewer-shell + web.config + shell integrity
 * 2) Optional: if T360_BASE is up (or auto-start dev), smoke-check Editor + brand
 *
 * Exit 0 only if critical checks pass.
 * Release packaging runs this with T360_SKIP_SERVER=1.
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
    let mimeOk = true;
    for (const ext of ['.json', '.mjs', '.wasm']) {
      if (!wc.includes(`fileExtension="${ext}"`)) {
        fail(`web.config missing MIME for ${ext}`);
        mimeOk = false;
      }
    }
    if (mimeOk && wc.includes('mimeMap')) pass('web.config has .json / .mjs / .wasm MIME');
    else if (mimeOk) fail('web.config missing mimeMap');
  }

  if (fs.existsSync(path.join(DIST, 'viewer-shell', 'manifest.json'))) {
    try {
      const man = JSON.parse(
        fs.readFileSync(path.join(DIST, 'viewer-shell', 'manifest.json'), 'utf8')
      );
      if (!man?.files?.length) {
        fail('viewer-shell manifest empty');
      } else {
        pass(`viewer-shell files: ${man.files.length}`);
        let shellOk = true;
        for (const entry of man.files) {
          const rel = String(entry.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
          const abs = path.join(DIST, 'viewer-shell', rel);
          if (!rel || !fs.existsSync(abs) || !fs.statSync(abs).isFile() || fs.statSync(abs).size <= 0) {
            fail(`viewer-shell missing/empty: ${rel || entry.path}`);
            shellOk = false;
          }
        }
        if (shellOk) pass('viewer-shell manifest files all present');
      }
    } catch (e) {
      fail(`viewer-shell manifest parse: ${e.message}`);
    }
  }

  const assetsDir = path.join(DIST, 'assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    if (files.some((n) => n.startsWith('main-') && n.endsWith('.js'))) {
      pass('editor main-*.js present');
    } else {
      fail('no main-*.js Editor bundle in dist/assets');
    }
    const maps = files.filter((n) => n.endsWith('.map'));
    if (maps.length && process.env.T360_SOURCEMAP !== '1') {
      fail(`unexpected .map files in dist/assets: ${maps.join(', ')}`);
    } else if (!maps.length) {
      pass('no sourcemaps in dist/assets');
    } else {
      pass('sourcemaps present (T360_SOURCEMAP=1)');
    }
  }

  // Legacy unbundled three must not ship
  if (fs.existsSync(path.join(DIST, 'vendor', 'three.module.js'))) {
    fail('dist still has vendor/three.module.js (remove public/vendor)');
  } else {
    pass('no legacy vendor/three in dist');
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
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '8888' },
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
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

  try {
    const man = await get(`${BASE}/viewer-shell/manifest.json`);
    if (man.ok) pass('viewer-shell/manifest.json reachable');
    else fail(`viewer-shell/manifest.json ${man.status} (run build so public/viewer-shell exists)`);
  } catch (e) {
    fail(`viewer-shell ${e.message}`);
  }

  const ed = await get(`${BASE}/src/ui/EditorApp.ts`);
  if (ed.ok) {
    if (ed.text.includes('hint-empty-scenes') || ed.text.includes('renderShell'))
      pass('editor module loads');
    else fail('editor module unexpected content');
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
