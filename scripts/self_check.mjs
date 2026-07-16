/**
 * Self-check: server up, editor assets, site packages.
 * Exit 0 only if all critical checks pass.
 * (No /api/deploy — product is export ZIP + manual copy.)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.T360_BASE || 'http://127.0.0.1:8888';

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
  console.log('Starting server...');
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

function packages() {
  const site = path.join(ROOT, 'site');
  const out = [];
  if (!fs.existsSync(site)) return out;
  for (const s of fs.readdirSync(site)) {
    const p1 = path.join(site, s);
    if (!fs.statSync(p1).isDirectory() || s.startsWith('.')) continue;
    for (const r of fs.readdirSync(p1)) {
      const p2 = path.join(p1, r);
      if (!fs.statSync(p2).isDirectory()) continue;
      for (const d of fs.readdirSync(p2)) {
        const p3 = path.join(p2, d);
        if (!fs.statSync(p3).isDirectory()) continue;
        if (fs.existsSync(path.join(p3, 'index.html'))) out.push({ s, r, d, dir: p3 });
      }
    }
  }
  return out;
}

let fails = 0;
function pass(msg) {
  console.log('PASS', msg);
}
function fail(msg) {
  console.log('FAIL', msg);
  fails++;
}

async function main() {
  await import('./repair_site_packages.mjs');

  if (!(await ensureServer())) {
    fail('server not up');
    process.exit(1);
  }
  pass('server up');

  const core = [
    `${BASE}/`,
    `${BASE}/src/ui/EditorApp.ts`,
    `${BASE}/vendor/three.module.js`,
    `${BASE}/vendor/three.core.js`,
    `${BASE}/brand/clp-dark.png`,
  ];
  for (const u of core) {
    try {
      const r = await get(u);
      if (r.ok) pass(`${r.status} ${u} (${r.len})`);
      else fail(`${r.status} ${u}`);
    } catch (e) {
      fail(`${u} ${e.message}`);
    }
  }

  const ed = await get(`${BASE}/src/ui/EditorApp.ts`);
  if (ed.ok) {
    if (ed.text.includes('hint-empty-scenes')) pass('editor has empty hint');
    else fail('editor missing hint-empty-scenes');
    if (ed.text.includes('clp-dark')) pass('editor uses clp-dark logo');
    else fail('editor logo');
    if (ed.text.includes('btn-deploy') || ed.text.includes('oneClickDeploy'))
      fail('editor still has one-click deploy UI');
    else pass('editor has no one-click deploy');
    if (ed.text.includes('window.alert(')) fail('editor still has window.alert(');
    else pass('no window.alert');
  }

  for (const p of packages()) {
    const base = `${BASE}/site/${encodeURIComponent(p.s)}/${encodeURIComponent(p.r)}/${encodeURIComponent(p.d)}`;
    for (const rel of ['/', '/index.html', '/project.json', '/vendor/three.module.js', '/vendor/three.core.js']) {
      try {
        const r = await get(base + rel);
        if (r.ok) pass(`${r.status} ${base}${rel}`);
        else fail(`${r.status} ${base}${rel}`);
      } catch (e) {
        fail(`${base}${rel} ${e.message}`);
      }
    }
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
