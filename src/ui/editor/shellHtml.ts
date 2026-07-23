import { t } from '../../core/i18n/zh-Hant';

/** Static shell markup for the panorama Editor (bound by EditorApp). */
export function editorShellHtml(): string {
  return `
      <div class="app-shell">
        <header class="header">
          <div class="logo-wrap" title="CLP">
            <img class="logo" src="/brand/clp-dark.png" alt="CLP" />
          </div>
          <div class="brand-text">Telecom360-next</div>
          <div class="spacer"></div>
          <button type="button" class="btn" id="btn-import">${t('openPackage')}</button>
          <button type="button" class="btn primary" id="btn-export">${t('exportZip')}</button>
          <input type="file" id="file-import" class="sr-file" accept=".zip,application/zip" tabindex="-1" />
          <input type="file" id="file-scenes" class="sr-file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple tabindex="-1" />
        </header>
        <div class="main">
          <aside class="sidebar">
            <h2>${t('projectName')} *</h2>
            <div class="project-name-row">
              <input id="project-name" type="text" required placeholder="${t('projectNameHint')}" autocomplete="off" />
            </div>
            <div class="meta-fields">
              <label>${t('siteCode')} *
                <input id="f-site" type="text" required placeholder="e.g. FOS" autocomplete="off" />
              </label>
              <label>${t('roomName')} *
                <input id="f-room" type="text" required placeholder="e.g. Control_Room" autocomplete="off" />
              </label>
              <label>${t('photoDate')} *
                <input id="f-date" type="text" required placeholder="e.g. 20260423" autocomplete="off" />
              </label>
            </div>
            <h2>${t('scenes')}</h2>
            <ul class="scene-list" id="scene-list"></ul>
            <div class="add-files">
              <button type="button" class="btn ghost-dark btn-upload-cta" id="btn-add-scenes" style="width:100%">${t('addScenes')}</button>
            </div>
            <p class="hint" id="hint-empty-scenes">${t('noScenes')}</p>
            <p class="hint" id="hint-drag" hidden>拖曳 ⋮⋮ 可調整列表順序</p>
          </aside>
          <section class="stage-wrap">
            <div class="stage-toolbar">
              <button type="button" class="btn" id="btn-info">${t('addInfo')}</button>
              <button type="button" class="btn" id="btn-scene-hs">${t('addSceneLink')}</button>
              <button type="button" class="btn" id="btn-initial">${t('setInitialView')}</button>
              <span class="toolbar-hint" id="controls-hint">${t('controlsHint')}</span>
            </div>
            <div id="stage">
              <div class="stage-empty" id="stage-empty">${t('noScenes')}</div>
              <div class="hotspot-layer" id="hotspot-layer"></div>
            </div>
          </section>
          <aside class="inspector">
            <h2>${t('inspector')}</h2>
            <div id="inspector-body"><p class="hint">${t('noSelection')}</p></div>
          </aside>
        </div>
        <div class="toast" id="toast" hidden></div>
        <!-- One overlay for loading % AND success message (no browser native dialogs) -->
        <div class="busy" id="busy" hidden>
          <div class="busy-card">
            <div id="busy-mode-progress">
              <div id="busy-text" class="busy-text"></div>
              <div class="busy-bar-track"><div id="busy-bar" class="busy-bar"></div></div>
              <div id="busy-pct" class="busy-pct">0%</div>
            </div>
            <div id="busy-mode-result" class="busy-result" hidden>
              <div id="busy-result-title" class="msg-modal-title"></div>
              <div id="busy-result-body" class="msg-modal-body"></div>
              <div id="busy-result-link" class="msg-modal-link" tabindex="0"></div>
              <button type="button" class="btn primary msg-modal-ok" id="busy-result-ok">${t('ok')}</button>
            </div>
            <div id="busy-mode-prompt" class="busy-prompt" hidden>
              <div id="busy-prompt-title" class="msg-modal-title is-info"></div>
              <div id="busy-prompt-body" class="msg-modal-body"></div>
              <input type="text" id="busy-prompt-input" class="msg-modal-input" autocomplete="off" />
              <div class="msg-modal-actions">
                <button type="button" class="btn ghost-dark" id="busy-prompt-cancel">${t('cancel')}</button>
                <button type="button" class="btn primary" id="busy-prompt-ok">${t('ok')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
}
