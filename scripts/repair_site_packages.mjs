/**
 * Repair / migrate site/{S}/{R}/{D}/ packages to the prebuilt viewer shell.
 *
 * - Keeps project.json + assets/source/*
 * - Overwrites index.html + viewer assets/brand from public/viewer-shell (or dist/viewer-shell)
 * - Removes obsolete per-package vendor/three.* when shell is present
 *
 * Requires: npm run build (so viewer-shell exists)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');

function findShellRoot() {
  const candidates = [
    path.join(ROOT, 'public', 'viewer-shell'),
    path.join(ROOT, 'dist', 'viewer-shell'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'manifest.json')) && fs.existsSync(path.join(c, 'index.html'))) {
      return c;
    }
  }
  return null;
}

function copyTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      if (name === 'assets') {
        // Merge: do not wipe assets/source
        copyTree(from, to);
      } else {
        copyTree(from, to);
      }
    } else if (name === 'manifest.json') {
      // shell meta only — not needed in published tour
      continue;
    } else {
      fs.copyFileSync(from, to);
    }
  }
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
        if (fs.existsSync(path.join(p3, 'project.json')) || fs.existsSync(path.join(p3, 'index.html'))) {
          packs.push(p3);
        }
      }
    }
  }
  return packs;
}

const shell = findShellRoot();
if (!shell) {
  console.error('No viewer-shell found. Run: npm run build');
  process.exit(1);
}

console.log('Using shell:', shell);
let n = 0;
for (const dir of walkPackages()) {
  if (!fs.existsSync(path.join(dir, 'project.json'))) {
    console.log('SKIP (no project.json)', path.relative(ROOT, dir));
    continue;
  }
  // Preserve panorama sources
  const sourceDir = path.join(dir, 'assets', 'source');
  const sourceBackup = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir).map((f) => ({
        name: f,
        data: fs.readFileSync(path.join(sourceDir, f)),
      }))
    : [];

  copyTree(shell, dir);

  if (sourceBackup.length) {
    fs.mkdirSync(sourceDir, { recursive: true });
    for (const f of sourceBackup) {
      fs.writeFileSync(path.join(sourceDir, f.name), f.data);
    }
  }

  // Drop legacy unbundled three vendor if present
  const vendor = path.join(dir, 'vendor');
  if (fs.existsSync(vendor)) {
    fs.rmSync(vendor, { recursive: true, force: true });
  }

  console.log('OK  ', path.relative(ROOT, dir));
  n++;
}
console.log(`Repaired ${n} package(s)`);
