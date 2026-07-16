# Telecom360-Three.js

**English** · [中文](#telecom360-threejs-中文)

360° panorama **editor** and **offline viewer** for site / room walkthroughs.  
Publish by **exporting a ZIP** and **copying files into the IIS website root** (same idea as legacy Telecom360).

| What | URL (example) |
|------|----------------|
| Editor | `http://{server}/` or `http://{server}:8888/` |
| Published tour | `http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## What this product does

- Build multi-scene **equirectangular** tours (including high-res images such as 11904×5952).
- Add **info annotations** and **links between scenes**.
- Set each scene’s **initial view**.
- Walk slightly in 3D with **WASD / QE** (always on).
- **Export a self-contained package** (no internet CDN required).
- Deploy by **manual copy** to `C:\inetpub\wwwroot` (or your IIS site root).

---

## Old Telecom360 → this version

| | Legacy (Marzipano era) | Telecom360-Three.js |
|--|------------------------|---------------------|
| Engine | Marzipano | **three.js (WebGL 2)** |
| Language / structure | Older stack | **TypeScript**, modern editor UI |
| Package format | Old ZIP **not compatible** | New ZIP / folder layout only |
| Offline 3D library | Often CDN-dependent patterns | **Ships `vendor/` Three.js files offline** |
| Server publish | Copy to IIS `wwwroot` | **Same: copy only** (no server Node app) |
| One-click server deploy API | — | **Not used** (removed on purpose for simple ops) |

### Removed (by design)

- Compatibility with **old Marzipano ZIPs**
- **External URL** hotspots (v1)
- **Real-world mm measurement** on a single 360° photo (no depth data)
- **Server-side one-click deploy** / Node backend on production IIS

### Added / improved

| Area | Improvement |
|------|-------------|
| Editor | Multi-scene list, drag reorder, rename/delete |
| Hotspots | Info pins + scene jump, draggable on the sphere |
| Transitions | Scene change with aim / fade style transition |
| 3D move | Always-on WASD/QE walk (limited range) |
| Viewer | Offline package; **Fullscreen** button; **Auto-rotate** button (default off) |
| Metadata | Required **project name**, **SITE_CODE**, **ROOM_NAME**, **PHOTO_DATE** |
| Export | ZIP path matches IIS: `site/{SITE}/{ROOM}/{DATE}/` |
| Ops | **Only copy files to IIS** — no app server to keep running |

### New technology (summary)

| Layer | Technology |
|-------|------------|
| 3D / panorama | **three.js** (WebGL 2) |
| App language | **TypeScript** |
| Build | **Vite** |
| Export package | **JSZip** (in browser) |
| Hosting | **IIS static files** under website root |

---

## For end users — how to use

### A. Install / update the Editor on a PC or server (IIS)

You only need **IIS** and a website pointing at a folder (often `C:\inetpub\wwwroot`).

1. Get the **built website files** for the Editor  
   (the `dist` output, or a prepared folder that already contains `index.html`, `assets\`, `brand\`, `vendor\`, etc.).
2. **Copy** those files into the **IIS site root**, for example:
   - `C:\inetpub\wwwroot\`
3. Keep or add a simple `web.config` if your site needs MIME types for `.json` / `.mjs` (sample is in the release package / `docs`).
4. Open the site in a browser, e.g. `http://localhost/` or `http://{server}/`.

No Node.js install is required on the server for normal use.

> Details: [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)

### B. Create a tour (Editor)

1. Open the Editor in the browser.
2. Enter **Project name** (required), e.g. `FOS ControlRoom`.
3. Enter **SITE_CODE**, **ROOM_NAME**, **PHOTO_DATE** (required; used in the publish path).
4. **Add panorama images** (equirectangular JPG/PNG, roughly 2:1).
5. Optional: add **annotations**, **scene links**, set **initial view**, reorder scenes.
6. Click **Export ZIP**.

### C. Publish a tour (manual copy)

1. Unzip the exported file **into the IIS website root**  
   (or copy the folder so you get):

   ```text
   {IIS root}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
     index.html
     project.json
     vendor\
     assets\source\
   ```

2. Open:

   ```text
   http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
   ```

3. To edit again later: in the Editor use **Open package** and select the same ZIP.

### Viewer controls (published page)

| Control | Behaviour |
|---------|-----------|
| Drag | Rotate view |
| Mouse wheel | Zoom |
| WASD / QE | 3D move (always on) |
| Auto-rotate | Button on page, **default off** |
| Fullscreen | Button on page |

---

## Export package layout

```text
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html
  project.json
  vendor/          ← offline three.js
  assets/source/   ← panorama images
README.txt
```

---

## Notes

- **Browser:** modern Chrome / Edge recommended (**WebGL 2**).
- **Private / internal** use. CLP logo and brand assets remain company property.

---

# Telecom360-Three.js（中文）

360° 全景 **編輯器** 與 **離線檢視器**，用於站點／機房導覽。  
發佈方式：**匯出 ZIP**，再 **複製到 IIS 網站根目錄**（與舊版 Telecom360 一樣靠 copy）。

| 項目 | 網址（例子） |
|------|----------------|
| 編輯器 | `http://{伺服器}/` 或 `http://{伺服器}:8888/` |
| 已發佈導覽 | `http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## 產品能做什麼

- 建立 **多場景** equirectangular 全景（可含高解像如 11904×5952）
- 加入 **注解標示**、**場景之間跳轉**
- 設定每場景 **初始視角**
- 以 **WASD / QE** 輕微 3D 移動（預設開啟）
- **匯出完整離線套件**（不需外網 CDN）
- 以 **人手複製** 到 `C:\inetpub\wwwroot`（或你的 IIS 網站根）發佈

---

## 舊版 → 新版

| | 舊版（Marzipano 時期） | 本版 Telecom360-Three.js |
|--|------------------------|---------------------------|
| 引擎 | Marzipano | **three.js（WebGL 2）** |
| 結構 | 舊技術棧 | **TypeScript**、新編輯介面 |
| 套件格式 | 舊 ZIP **不相容** | 僅新格式 |
| 離線 3D 庫 | 常依賴外網／CDN 模式 | **套件內附 `vendor/`** |
| 上線方式 | Copy 到 IIS `wwwroot` | **同樣只 copy**（伺服器不必跑 Node） |
| 伺服器一鍵部署 API | — | **不做**（簡化維運） |

### 刪除了什麼（刻意）

- 舊 **Marzipano ZIP** 相容
- **外部網址** 熱點（v1）
- 單張 360 的 **真實尺寸量測**（無深度資料）
- 正式環境的 **一鍵部署後端／Node 服務**

### 新增多了／更好了什麼

| 範圍 | 說明 |
|------|------|
| 編輯器 | 多場景、拖曳排序、重新命名／刪除 |
| 熱點 | 注解 + 跳場景，可拖位置 |
| 轉場 | 場景切換有對準／淡入效果 |
| 3D 移動 | WASD/QE 預設開（無開關掣） |
| 檢視器 | 全離線；**全螢幕**掣；**自動旋轉**掣（預設關） |
| 欄位 | 必填：專案名稱、SITE、ROOM、DATE |
| 匯出 | 路徑對齊 IIS：`site/{SITE}/{ROOM}/{DATE}/` |
| 維運 | **只需 copy 到 IIS**，不用長期開後台程式 |

### 用了什麼新技術（摘要）

| 層級 | 技術 |
|------|------|
| 全景 / 3D | **three.js**（WebGL 2） |
| 開發語言 | **TypeScript** |
| 建置 | **Vite** |
| 匯出 | **JSZip**（瀏覽器內打包） |
| 上線 | **IIS 靜態網站** |

---

## 使用說明（給一般使用者）

### 甲、安裝／更新編輯器（IIS）

只需 **IIS**，以及網站實體路徑（多數是 `C:\inetpub\wwwroot`）。

1. 取得編輯器的 **網站檔案**  
   （內含 `index.html`、`assets\`、`brand\`、`vendor\` 等）。
2. **全部複製** 到 IIS 網站根目錄，例如：
   - `C:\inetpub\wwwroot\`
3. 如需要，保留／放入 `web.config`（`.json` / `.mjs` 的 MIME；見發佈包或 `docs`）。
4. 用瀏覽器開啟，例如 `http://localhost/` 或 `http://{伺服器}/`。

伺服器 **不必安裝 Node.js** 才能日常使用。

> 較細說明：[docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)

### 乙、製作導覽（編輯器）

1. 瀏覽器開啟編輯器。
2. 填 **專案名稱**（必填），例如 `FOS ControlRoom`。
3. 填 **SITE_CODE**、**ROOM_NAME**、**PHOTO_DATE**（必填；決定發佈路徑）。
4. **新增全景圖片**（約 2:1 的 equirectangular JPG/PNG）。
5. 可選：注解、場景連結、初始視角、調整場景順序。
6. 按 **匯出 ZIP**。

### 丙、發佈導覽（人手複製）

1. 將 ZIP **解壓到 IIS 網站根目錄**（或複製資料夾），使出現：

   ```text
   {IIS 根目錄}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
     index.html
     project.json
     vendor\
     assets\source\
   ```

2. 瀏覽器開啟：

   ```text
   http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
   ```

3. 之後要再改：編輯器選 **開啟專案套件**，載入同一個 ZIP。

### 檢視器操作（發佈後頁面）

| 操作 | 說明 |
|------|------|
| 拖曳 | 旋轉視角 |
| 滾輪 | 縮放 |
| WASD / QE | 3D 移動（預設開） |
| 自動旋轉 | 頁面有按鈕，**預設關** |
| 全螢幕 | 頁面有按鈕 |

---

## 匯出套件結構

```text
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html
  project.json
  vendor/          ← 離線 three.js
  assets/source/   ← 全景圖
README.txt
```

---

## 其他

- **瀏覽器：** 建議新版 Chrome / Edge（需 **WebGL 2**）。
- **內部使用。** CLP LOGO 與品牌資產屬公司所有。
