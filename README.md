# Telecom360-next

**English** · [中文](#telecom360-next-中文)

360° panorama **editor** and **offline viewer** for site / room walkthroughs.  
Publish by **exporting a ZIP** and **copying files into the IIS website root** (same approach as legacy Telecom360).

| What | URL (example) |
|------|----------------|
| Editor | `http://{server}/` |
| Published tour | `http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## What this product does

- Build multi-scene **equirectangular** tours (including high-res images such as **11904×5952**).
- Add **info annotations** and **links between scenes**.
- Set each scene’s **initial view**.
- Walk slightly in 3D with **WASD / QE** (**always on**, no toggle).
- **Export a self-contained package** (prebuilt Viewer bundle + images; **no CDN**).
- Deploy by **manual copy** to the IIS site root (often `C:\inetpub\wwwroot`).

UI language: **Traditional Chinese**. Branding: **CLP** logo.

---

## Deploy (IIS) — copy only

### 1. Install / update the Editor

1. Download the official Release package: **`Telecom360-next-vX.Y.Z-iis.zip`**.
2. Unzip it.
3. **Copy all files** into the IIS website physical path (e.g. `C:\inetpub\wwwroot`).

   You must have at least:

   | Path | Role |
   |------|------|
   | `index.html` | Editor |
   | `assets\` | Editor JS / CSS |
   | `brand\` | Logos / favicon |
   | `viewer-shell\` | Prebuilt Viewer template (**required for Export ZIP**) |
   | `web.config` | MIME for `.json` / `.mjs` / `.wasm` — **already configured** |

4. Open the site in a browser. The Editor is ready.

**No Node.js** on the server. **No scripts** (no PowerShell, no npm).  
`web.config` is **included in the Release ZIP** — you do not need to configure MIME types yourself.

See also [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md).

### 2. Create a tour (Editor)

1. Open the Editor in the browser.
2. Fill **專案名稱** (project name, required), e.g. `FOS ControlRoom`.
3. Fill **SITE_CODE**, **ROOM_NAME**, **PHOTO_DATE** (required; used in the publish path).
4. Click **新增全景圖片** and add equirectangular **JPG/PNG** (about **2:1** aspect).
5. Optional: **注解**, **場景連結**, **設置初始視角**, drag scenes to reorder.
6. Click **匯出 ZIP**.

### 3. Publish a tour (manual copy)

1. Unzip the tour ZIP **into the same IIS website root**, so you get:

   ```text
   {IIS root}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
     index.html              ← prebuilt Viewer
     project.json            ← tour data (fetched by Viewer)
     brand\                  ← logos / favicon
     assets\
       viewer-*.js / *.css   ← Viewer app + three.js bundle
       source\*.jpg          ← panorama images
   ```

   The ZIP also contains `README.txt` at the **ZIP root** (next to the `site\` folder).

2. Open:

   ```text
   http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
   ```

3. To edit later: Editor → **開啟專案套件** → select the same ZIP.

### Viewer controls (published page)

| Control | Behaviour |
|---------|-----------|
| Drag | Rotate |
| Mouse wheel | Zoom |
| WASD / QE | 3D move (**always on**) |
| 自動旋轉 | Button on page, **default OFF** |
| 全螢幕 | Button on page |

---

## Old Telecom360 → this version

| | Legacy (Marzipano) | Telecom360-next |
|--|--------------------|---------------------|
| Engine | Marzipano | **three.js (WebGL 2)** |
| Implementation | Older stack | **TypeScript** + modern editor UI |
| Package format | Old ZIP **not compatible** | New package format only |
| Offline 3D library | Often relied on external/CDN patterns | **Viewer JS bundle** (three.js inside; **no CDN**) |
| Server publish | Copy into IIS `wwwroot` | **Same: copy files only** (no Node app on the server) |
| Viewer source | Coupled / duplicated | **Independent `viewer/` entry** + shared `PanoramaEngine` |

### Removed (by design)

- Opening **legacy Marzipano ZIPs**
- **External URL** hotspots (v1)
- **Real-world mm measurement** on a single 360° image (no depth data)
- **Server-side one-click deploy** / production Node deploy API

### Added / improved

| Area | What improved |
|------|----------------|
| Editor | Multi-scene list, **drag reorder**, rename / delete |
| Hotspots | Info pins + scene jump; **draggable** on the panorama |
| Transitions | Scene change with aim / fade-style transition |
| 3D move | **Always-on** WASD/QE (limited range); no 3D button |
| Viewer | Fully offline; **Fullscreen** button; **Auto-rotate** button (**default OFF**) |
| Required fields | **Project name**, **SITE_CODE**, **ROOM_NAME**, **PHOTO_DATE** |
| Export path | Matches IIS: `site/{SITE}/{ROOM}/{DATE}/` |
| Operations | **Copy to IIS only** — no long-running backend process |

### Technology used (summary)

| Layer | Technology |
|-------|------------|
| 3D / panorama | **three.js r172** via **WebGL 2** (`PanoramaEngine`, shared) |
| Language | **TypeScript** |
| Apps | **Editor** (`index.html`) + **Viewer** (`viewer/index.html`) — two Vite entries |
| Build (by development team) | **Vite 6** → `dist/` + **`viewer-shell/`** + Release ZIP |
| Browser export | **JSZip** assembles shell + `project.json` + images (**no runtime HTML generation**) |
| Hosting | **IIS static files** |

---

## Export package layout (tour ZIP from Editor)

```text
README.txt                          ← at ZIP root
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html                        ← prebuilt Viewer (from viewer-shell)
  project.json                      ← single source of tour data
  brand/
  assets/
    viewer-*.js / PanoramaEngine-*.js / *.css
    source/*.jpg
```

---

## For developers

End users only need the **Release IIS ZIP**. Developers build it once:

```bash
npm install
npm run dev        # local Editor (default http://127.0.0.1:8888/)
npm run build      # typecheck + Vite (editor + viewer) + prepare viewer-shell
npm run release    # build + validate dist + zip → release/Telecom360-next-v{version}-iis.zip
```

Upload `release/Telecom360-next-v{version}-iis.zip` as a **GitHub Release** asset. That ZIP is the only install package for IT.

- **Viewer source:** `src/viewer/` (`main.ts`, `ViewerApp.ts`) + `viewer/index.html` (uses `PanoramaEngine`).
- **Shared:** `src/shared/` (icons, escapeHtml), `src/panorama/PanoramaEngine.ts`.
- **Export template:** `viewer-shell/` (generated by build; do not hand-edit).
- Editor **must be deployed with `viewer-shell/`** so browser export can fetch it.
- Tour data is **only** in `project.json` (not inlined into HTML).
- **Autorotate:** toggle on → drag/wheel pauses → resumes after **5 seconds** idle (no need to re-toggle).
- `web.config` lives in `public/` and is copied into `dist/` / the Release ZIP automatically.

---

## Notes

- **Browser:** recent **Chrome / Edge** recommended (**WebGL 2** required; WebGL 1 not supported by this three.js version).
- **Private / internal** use. CLP logo and brand assets remain company property.

---

# Telecom360-next（中文）

360° 全景 **編輯器** 與 **離線檢視器**，用於站點／機房導覽。  
發佈：**匯出 ZIP** → **複製到 IIS 網站根目錄**（與舊版 Telecom360 一樣靠 copy）。

| 項目 | 網址（例子） |
|------|----------------|
| 編輯器 | `http://{伺服器}/` |
| 已發佈導覽 | `http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## 產品能做什麼

- 建立 **多場景** equirectangular 全景（可含高解像如 **11904×5952**）
- 加入 **注解標示**、**場景之間跳轉**
- 設定每場景 **初始視角**
- 以 **WASD / QE** 輕微 3D 移動（**預設開、無開關掣**）
- **匯出完整離線套件**（預建 Viewer bundle + 圖片，**不需 CDN**）
- **人手複製** 到 IIS 網站根（常見 `C:\inetpub\wwwroot`）發佈

介面：**繁體中文**；品牌：**CLP** LOGO。

---

## 部署（IIS）— 只需 copy

### 1. 安裝／更新編輯器

1. 下載官方 Release：`Telecom360-next-vX.Y.Z-iis.zip`。
2. 解壓。
3. 將**全部檔案**複製到 IIS 網站實體路徑（例如 `C:\inetpub\wwwroot`）。

   必須看到：

   | 路徑 | 用途 |
   |------|------|
   | `index.html` | 編輯器 |
   | `assets\` | 編輯器 JS / CSS |
   | `brand\` | LOGO / favicon |
   | `viewer-shell\` | 預建 Viewer 模板（**匯出 ZIP 必須**，勿刪） |
   | `web.config` | 已設定 `.json` / `.mjs` / `.wasm` MIME，**無需再改 IIS** |

4. 瀏覽器開啟網站首頁 → 即可使用。

伺服器**不需要** Node.js，也**不需要**執行任何腳本。  
`web.config` **已包含在 Release ZIP 內**，一般不用再手動設定 MIME。

詳見 [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)。

### 2. 製作導覽（編輯器）

1. 瀏覽器開啟編輯器。
2. 填 **專案名稱**（必填），例如 `FOS ControlRoom`。
3. 填 **SITE_CODE**、**ROOM_NAME**、**PHOTO_DATE**（必填；決定發佈路徑）。
4. 按 **新增全景圖片**，加入約 **2:1** 的 equirectangular **JPG/PNG**。
5. 可選：**注解**、**場景連結**、**設置初始視角**、拖曳調整場景順序。
6. 按 **匯出 ZIP**。

### 3. 發佈導覽（人手複製）

1. 將導覽 ZIP **解壓到同一個 IIS 網站根目錄**，使出現：

   ```text
   {IIS 根目錄}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
     index.html              ← 預建 Viewer
     project.json            ← 導覽資料（Viewer 以 fetch 載入）
     brand\
     assets\
       viewer-*.js / *.css   ← Viewer 應用（含 three.js）
       source\*.jpg          ← 全景圖
   ```

   ZIP **根層**另有 `README.txt`（與 `site\` 同一層）。

2. 瀏覽器開啟：

   ```text
   http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
   ```

3. 之後要再改：編輯器 → **開啟專案套件** → 選同一個 ZIP。

### 檢視器操作（發佈後頁面）

| 操作 | 說明 |
|------|------|
| 拖曳 | 旋轉 |
| 滾輪 | 縮放 |
| WASD / QE | 3D 移動（**預設開**） |
| 自動旋轉 | 頁面有掣，**預設關** |
| 全螢幕 | 頁面有掣 |

---

## 舊版 → 新版

| | 舊版（Marzipano） | 本版 Telecom360-next |
|--|-------------------|---------------------------|
| 引擎 | Marzipano | **three.js（WebGL 2）** |
| 實作 | 舊技術棧 | **TypeScript** + 新編輯介面 |
| 套件格式 | 舊 ZIP **不相容** | 僅新格式 |
| 離線 3D 庫 | 常依賴外網／CDN 模式 | **Viewer JS bundle**（內含 three.js，**無 CDN**） |
| 上線 | Copy 到 IIS `wwwroot` | **同樣只 copy**（伺服器不必跑 Node） |
| Viewer 源碼 | 與匯出重複／分叉 | **獨立 `viewer/` entry** + 共用 `PanoramaEngine` |

### 刪除了什麼（刻意）

- 開啟舊 **Marzipano ZIP**
- **外部網址** 熱點（v1）
- 單張 360 的 **真實 mm 量測**（無深度）
- 正式環境 **一鍵部署後端／Node 部署 API**

### 新增多了／更好了什麼

| 範圍 | 說明 |
|------|------|
| 編輯器 | 多場景、**拖曳排序**、重新命名／刪除 |
| 熱點 | 注解 + 跳場景，可拖位置 |
| 轉場 | 對準／淡入式場景切換 |
| 3D 移動 | WASD/QE **預設開**（無 3D 掣） |
| 檢視器 | 全離線；**全螢幕**掣；**自動旋轉**掣（**預設關**） |
| 必填欄位 | **專案名稱**、SITE、ROOM、DATE |
| 匯出路徑 | 對齊 IIS：`site/{SITE}/{ROOM}/{DATE}/` |
| 維運 | **只需 copy 到 IIS**，不用長期開後台程式 |

### 用了什麼技術（摘要）

| 層級 | 技術 |
|------|------|
| 全景 / 3D | **three.js r172**（**WebGL 2**；共用 `PanoramaEngine`） |
| 語言 | **TypeScript** |
| 應用 | **編輯器** + **檢視器**（兩個 Vite entry） |
| 建置（由開發團隊） | **Vite 6** → `dist/` + **`viewer-shell/`** + Release ZIP |
| 瀏覽器匯出 | **JSZip** 組裝 shell + `project.json` + 圖片（**不再 runtime 砌 HTML**） |
| 上線 | **IIS 靜態網站** |

---

## 匯出套件結構（編輯器「匯出 ZIP」）

```text
README.txt                          ← ZIP 根目錄
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html                        ← 預建 Viewer（來自 viewer-shell）
  project.json                      ← 導覽資料唯一來源
  brand/
  assets/
    viewer-*.js / PanoramaEngine-*.js / *.css
    source/*.jpg
```

---

## 開發者

一般使用者**只需**官方 **Release IIS ZIP**。開發端建置一次後發佈：

```bash
npm install
npm run dev        # 本機編輯器（預設 http://127.0.0.1:8888/）
npm run build      # typecheck + Vite + 產生 viewer-shell
npm run release    # build + 校驗 dist + 打包 → release/Telecom360-next-v{version}-iis.zip
```

將 `release/Telecom360-next-v{version}-iis.zip` 上傳為 **GitHub Release** 附件，即為 IT 唯一安裝包。

- Viewer 源碼：`src/viewer/` + `viewer/index.html`
- 共用：`src/shared/`、`PanoramaEngine`
- 匯出模板：`viewer-shell/`（build 產物，勿手改）
- 編輯器部署必須包含 `viewer-shell/`
- 導覽資料只在 `project.json`，**不再** inline 進 HTML
- `web.config` 放在 `public/`，會自動進入 `dist/` 與 Release ZIP
- **自動旋轉：** 開啟後拖拉／滾輪會暫停，約 5 秒無操作後自動再轉

---

## 其他

- **瀏覽器：** 建議新版 Chrome / Edge（需 **WebGL 2**；本版 three.js **不支援 WebGL 1**）。
- **內部使用。** CLP LOGO 與品牌資產屬公司所有。
