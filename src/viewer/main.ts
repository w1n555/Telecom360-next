import { t } from '../core/i18n/zh-Hant';
import { escapeHtml } from '../shared/escapeHtml';
import { loadPackage } from './loadProject';
import { ViewerApp } from './ViewerApp';
import './styles/viewer.css';

async function main() {
  const root = document.getElementById('viewer-app');
  if (!root) return;
  document.title = t('viewerTitle');

  let project;
  try {
    project = await loadPackage();
  } catch (e) {
    const msg = escapeHtml((e as Error).message || String(e));
    root.innerHTML = `<div style="padding:24px;color:#fff;background:#0b1220;min-height:100%;box-sizing:border-box;font-family:system-ui,sans-serif"><strong>無法載入導覽</strong><p style="margin:12px 0 0;line-height:1.5">${msg}</p></div>`;
    return;
  }

  document.title = `${project.name} · Telecom360-next`;
  const app = new ViewerApp(root, project);
  await app.start();
}

main().catch(console.error);
