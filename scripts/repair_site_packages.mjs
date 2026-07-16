/**
 * Repair all site/{S}/{R}/{D}/ packages:
 * - ensure vendor/three.module.js + three.core.js
 * - fix duplicate `project` identifier in old index.html
 * - ensure importmap points to local three (no CDN)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const VENDOR_SRC = path.join(ROOT, 'public', 'vendor');

function copyVendor(destDir) {
  const v = path.join(destDir, 'vendor');
  fs.mkdirSync(v, { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) {
    const from = path.join(VENDOR_SRC, f);
    if (!fs.existsSync(from)) throw new Error('Missing ' + from);
    fs.copyFileSync(from, path.join(v, f));
  }
}

function repairIndex(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  let changed = false;
  const before = html;

  // Fix name clash: function project( -> function projectToScreen(
  if (/function\s+project\s*\(/.test(html)) {
    html = html.replace(/function\s+project\s*\(/g, 'function projectToScreen(');
    // only replace call sites that look like project(h.yaw or project(y,p for screen
    html = html.replace(/const scr=project\(/g, 'const scr=projectToScreen(');
    html = html.replace(/const scr = project\(/g, 'const scr = projectToScreen(');
    changed = true;
  }

  // Force local importmap (no unpkg/CDN)
  if (html.includes('unpkg.com') || html.includes('esm.sh') || html.includes('cdn.jsdelivr')) {
    html = html.replace(
      /<script type="importmap">[\s\S]*?<\/script>/,
      '<script type="importmap">\n  {"imports":{"three":"./vendor/three.module.js"}}\n  </script>'
    );
    changed = true;
  }
  if (!html.includes('./vendor/three.module.js')) {
    // inject importmap if missing
    if (!html.includes('importmap')) {
      html = html.replace(
        '</head>',
        '  <script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>\n</head>'
      );
      changed = true;
    }
  }

  if (html !== before) {
    fs.writeFileSync(htmlPath, html);
  }
  return changed;
}

function walkPackages() {
  const packs = [];
  if (!fs.existsSync(SITE)) return packs;
  for (const s of fs.readdirSync(SITE)) {
    const p1 = path.join(SITE, s);
    if (!fs.statSync(p1).isDirectory() || s.startsWith('.')) continue;
    for (const r of fs.readdirSync(p1)) {
      const p2 = path.join(p1, r);
      if (!fs.statSync(p2).isDirectory()) continue;
      for (const d of fs.readdirSync(p2)) {
        const p3 = path.join(p2, d);
        if (!fs.statSync(p3).isDirectory()) continue;
        if (fs.existsSync(path.join(p3, 'index.html'))) packs.push(p3);
      }
    }
  }
  return packs;
}

let n = 0;
for (const dir of walkPackages()) {
  copyVendor(dir);
  const idx = path.join(dir, 'index.html');
  const fixed = repairIndex(idx);
  const sz = fs.statSync(idx).size;
  const hasCore = fs.existsSync(path.join(dir, 'vendor', 'three.core.js'));
  const hasMod = fs.existsSync(path.join(dir, 'vendor', 'three.module.js'));
  console.log(
    (fixed ? 'FIXED' : 'OK   '),
    path.relative(ROOT, dir),
    `html=${sz}`,
    `core=${hasCore}`,
    `mod=${hasMod}`
  );
  n++;
}
console.log(`Repaired ${n} package(s)`);
