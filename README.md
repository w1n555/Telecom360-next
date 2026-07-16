# Telecom360-Three.js

**English** · [中文](#telecom360-threejs-中文)

Modern **360° equirectangular panorama editor & offline viewer**, rebuilt from the legacy Telecom360 (Marzipano) workflow with **three.js + TypeScript**.  
Designed for **intranet / IIS static hosting**: edit locally, **export a ZIP**, and **copy files to the server**.

| Role | URL |
|------|-----|
| **Editor** | `http://{host}:8888/` (local or static IIS) |
| **Published viewer** | `http://{host}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## Product purpose

- Capture and present **site / room / date** panoramic walkthroughs (e.g. telecom / control-room surveys).
- Support **high-resolution** equirectangular images (e.g. **11904×5952**).
- Produce a **self-contained offline package** (no CDN, no cloud dependency).
- Align with existing CLP deployment habit: place content under **`C:\inetpub\wwwroot`**.

---

## Functional overview

### Editor

| Feature | Description |
|---------|-------------|
| Multi-scene project | Upload multiple 2:1 panoramas; rename, delete, **drag to reorder** |
| Project metadata | **Required:** project name, `SITE_CODE`, `ROOM_NAME`, `PHOTO_DATE` |
| Info hotspots | Place annotation pins (title + body); drag to reposition |
| Scene-link hotspots | Jump to another scene with fly-style transition |
| Initial view | Save default yaw / pitch for each scene |
| 3D movement (parallax) | Always on: **WASD / QE** walk within limited radius (no toggle) |
| View controls | Drag to rotate, mouse wheel to zoom (FOV) |
| Export ZIP | Download package layout matching IIS paths |
| Open package | Re-import a previously exported ZIP for further editing |
| UI language / brand | Traditional Chinese UI + CLP logo |

### Viewer (published package)

| Feature | Description |
|---------|-------------|
| Offline three.js | Ships `vendor/three.module.js` + `three.core.js` (no CDN) |
| Hotspots | Info popups + scene navigation |
| Auto-rotate | **Button available**, default **OFF** |
| Fullscreen | **Button always available** |
| 3D movement | **Always ON** (WASD/QE); no 3D toggle button |
| Scene list | Switch scenes from the on-screen list |

### Publishing model (manual copy)

```text
1. Edit in the browser (local Editor)
2. Fill project name + SITE / ROOM / DATE
3. Click「匯出 ZIP」
4. Unzip / copy into web root, e.g. C:\inetpub\wwwroot
5. Open: http://{server}/site/{SITE}/{ROOM}/{DATE}/
```

**Server needs only static web hosting (IIS recommended).** No Node runtime, no reverse proxy, no deploy API on the server.

---

## Export ZIP layout

```text
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html              ← standalone viewer (small; images not base64)
  project.json            ← scene graph (no embedded dataUrls)
  vendor/
    three.module.js
    three.core.js
  assets/source/*.jpg     ← one copy of each panorama
README.txt
```

---

## Technology stack

| Layer | Choice |
|-------|--------|
| Language | **TypeScript** |
| Build | **Vite 6** |
| 3D / panorama | **three.js r172** (WebGL) |
| Packaging | **JSZip** (browser export) |
| Local preview (optional) | **Node.js + Express** (static only; no deploy API) |
| Production host | **IIS** static files under `C:\inetpub\wwwroot` |
| UI | Custom CSS, **zh-Hant** copy, CLP brand assets |

**Not used:** Marzipano, external CDN for Three.js, one-click server-side deploy API (removed by design for simpler ops).

---

## Local development

```powershell
cd path\to\Telecom360-Three.js
npm.cmd install
npm.cmd run dev
```

- Editor: http://127.0.0.1:8888/

```powershell
npm.cmd run build
npm.cmd start          # optional static preview of dist/
```

Optional local IIS (static site on port 8888):

```powershell
npm.cmd run build
# Run as Administrator
.\scripts\install-iis-8888.ps1
```

See [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md).

---

## Compatibility notes

| Item | Status |
|------|--------|
| Legacy Marzipano ZIP | **Not supported** (new package format only) |
| External URL hotspots | Not in v1 |
| Metric measurement on single 360° | Not feasible without depth → not included |
| KTX2 / WebGPU | Future optional enhancement |

---

## Repository layout (high level)

```text
src/                 Editor + viewer source (TS)
public/              Brand + vendor three.js for offline
server/              Optional local static preview (dev/start)
scripts/             IIS stage / install helpers
docs/                IIS deploy notes
```

---

## License / ownership

Private / internal use. CLP logo and brand assets remain company property.

---

# Telecom360-Three.js（中文）

以 **three.js + TypeScript** 重構的 **360° 全景編輯器與離線檢視器**，承接舊版 Telecom360（Marzipano）的使用場景。  
定位為 **內網 / IIS 靜態站**：本機編輯 → **匯出 ZIP** → **人手複製到伺服器**。

| 角色 | 網址 |
|------|------|
| **編輯器** | `http://{主機}:8888/` |
| **已發佈檢視器** | `http://{主機}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## 產品目的

- 以 **站點 / 機房 / 拍攝日期** 管理全景導覽（例如電訊／控制室巡查）。
- 支援 **高解析度** equirectangular 影像（例如 **11904×5952**）。
- 產出 **完全離線** 的套件（不依賴 CDN / 外網）。
- 與現有做法一致：內容放在 **`C:\inetpub\wwwroot`**。

---

## 功能摘要

### 編輯器

| 功能 | 說明 |
|------|------|
| 多場景專案 | 上傳多張約 2:1 全景；重新命名、刪除、**拖曳排序** |
| 專案欄位 | **必填：** 專案名稱、`SITE_CODE`、`ROOM_NAME`、`PHOTO_DATE` |
| 注解標示 | 標題 + 內容；可拖曳位置 |
| 場景連結 | 跳至其他場景（轉場） |
| 初始視角 | 為每場景儲存預設視角 |
| 3D 移動 | **預設開啟**：WASD / QE（無開關掣） |
| 視角操作 | 拖曳旋轉、滾輪縮放 |
| 匯出 ZIP | 下載與 IIS 路徑一致的套件 |
| 開啟套件 | 載入既有 ZIP 繼續編輯 |
| 介面 | 繁體中文 + CLP LOGO |

### 檢視器（發佈後）

| 功能 | 說明 |
|------|------|
| 離線 three.js | 內含 `vendor/`（無 CDN） |
| 熱點 | 注解彈窗 + 場景跳轉 |
| 自動旋轉 | **有按鈕**，預設 **關閉** |
| 全螢幕 | **有按鈕**（固定提供） |
| 3D 移動 | **預設開啟**，無 3D 開關掣 |
| 場景列表 | 可切換場景 |

### 發佈方式（人手複製）

```text
1. 本機編輯
2. 填寫專案名稱 + SITE / ROOM / DATE
3. 按「匯出 ZIP」
4. 解壓／複製到網站根目錄（例如 C:\inetpub\wwwroot）
5. 開啟：http://{伺服器}/site/{SITE}/{ROOM}/{DATE}/
```

**伺服器只需靜態網站（建議 IIS）。** 不需在伺服器安裝 Node、不需反向代理、不需部署 API。

---

## 匯出 ZIP 結構

```text
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html
  project.json
  vendor/three.module.js
  vendor/three.core.js
  assets/source/*.jpg
README.txt
```

---

## 技術架構

| 層級 | 技術 |
|------|------|
| 語言 | **TypeScript** |
| 建置 | **Vite 6** |
| 全景 / 3D | **three.js r172**（WebGL） |
| 打包 | **JSZip**（瀏覽器匯出） |
| 本機預覽（可選） | **Node.js + Express**（只提供靜態，無部署 API） |
| 正式環境 | **IIS** 靜態檔案（`C:\inetpub\wwwroot`） |
| UI | 自訂 CSS、**繁中**、CLP 品牌素材 |

**不採用：** Marzipano、Three.js CDN、伺服器端一鍵部署 API（為簡化維運而移除）。

---

## 本機開發

```powershell
npm.cmd install
npm.cmd run dev
```

詳見 [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)。

---

## 相容性說明

| 項目 | 狀態 |
|------|------|
| 舊 Marzipano ZIP | **不相容**（僅新格式） |
| 外部 URL 熱點 | v1 不做 |
| 單張 360 真實尺寸量測 | 無深度資訊 → 不納入 |
| KTX2 / WebGPU | 預留後續優化 |

---

## 授權

內部／私人使用。CLP LOGO 與品牌資產屬公司所有。
