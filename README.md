# Telecom360-next

**English** · [中文](#telecom360-next-中文)

360° panorama **editor** and **offline viewer** for site / room walkthroughs.  
Publish by **exporting a ZIP** and **copying files into the IIS website root** (same approach as legacy Telecom360).

| What | URL (example) |
|------|----------------|
| Editor | `http://{server}:{port}/` (local dev: **http://127.0.0.1:8888/**) |
| Published tour | `http://{server}:{port}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

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
| Build (by development team) | **Vite 6** → `dist/` + **`viewer-shell/`** (export template) |
| Browser export | **JSZip** assembles shell + `project.json` + images (**no runtime HTML generation**) |
| Hosting | **IIS static files** |

---

## For end users — how to use

### A. Install / update the Editor (IIS)

You need **IIS** and a website physical path (commonly `C:\inetpub\wwwroot`).

1. Obtain the **Editor website package** from your team / release  
   (a ready-to-copy folder with at least: `index.html`, `assets\`, `brand\`, `viewer-shell\`, …).  
   *Developers build this package once; end users only copy it. `viewer-shell` is required for ZIP export.*
2. **Copy all files** into the **IIS site root**, e.g. `C:\inetpub\wwwroot\`.
3. Optionally add / keep `web.config` for `.json` and `.mjs` MIME types  
   (see [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)).
4. Open the site in a browser. **Local machine (this repo):** use **http://127.0.0.1:8888/** only (not port 80).

**Node.js is not required** on the server for normal Editor + viewer use.

**Local IIS one-shot (admin):** `npm run iis:setup` → site `Telecom360-next` on **port 8888**, Default Web Site (:80) stopped.

### B. Create a tour (Editor)

1. Open the Editor in the browser.
2. Fill **專案名稱** (project name, required), e.g. `FOS ControlRoom`.
3. Fill **SITE_CODE**, **ROOM_NAME**, **PHOTO_DATE** (required; used in the publish path).
4. Click **新增全景圖片** and add equirectangular **JPG/PNG** (about **2:1** aspect).
5. Optional: **注解**, **場景連結**, **設置初始視角**, drag scenes to reorder.
6. Click **匯出 ZIP**.

### C. Publish a tour (manual copy)

1. Unzip the file **into the IIS website root** (not only a random desktop folder), so you get:

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

## Export package layout

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

### For developers

```bash
npm install
npm run build          # typecheck + Vite (editor + viewer) + prepare viewer-shell
npm run dev            # Editor on :8888 via server/dev.mjs; export needs viewer-shell
npm run iis:stage      # build + copy dist → C:\inetpub\wwwroot (files only)
npm run iis:setup      # build + stage + IIS site on :8888 only (admin / elevated)
```

Local browser: **http://127.0.0.1:8888/** (Editor) · **http://127.0.0.1:8888/site/.../** (tours)

- **Viewer source:** `src/viewer-main.ts` + `viewer/index.html` (uses `PanoramaEngine`).
- **Export template:** `public/viewer-shell/` and `dist/viewer-shell/` (generated; do not hand-edit).
- Editor **must be deployed with `viewer-shell/`** so browser export can fetch it.
- Tour data is **only** in `project.json` (not inlined into HTML).

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
| 編輯器 | `http://{伺服器}:{port}/`（本機：**http://127.0.0.1:8888/**） |
| 已發佈導覽 | `http://{伺服器}:{port}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

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
| 建置（由開發團隊） | **Vite 6** → `dist/` + **`viewer-shell/`**（匯出模板） |
| 瀏覽器匯出 | **JSZip** 組裝 shell + `project.json` + 圖片（**不再 runtime 砌 HTML**） |
| 上線 | **IIS 靜態網站** |

---

## 使用說明（給一般使用者）

### 甲、安裝／更新編輯器（IIS）

需要 **IIS** 與網站實體路徑（多數是 `C:\inetpub\wwwroot`）。

1. 向團隊／發佈包取得 **編輯器網站檔案**  
   （可直接複製的資料夾，至少含：`index.html`、`assets\`、`brand\`、`viewer-shell\` …）。  
   *由開發端建置一次；使用者只需複製。匯出 ZIP 需要 `viewer-shell`。*
2. **全部複製** 到 IIS 網站根目錄，例如 `C:\inetpub\wwwroot\`。
3. 可選：放入／保留 `web.config`（`.json`、`.mjs` MIME，見 [docs/IIS_DEPLOY.md](docs/IIS_DEPLOY.md)）。
4. 瀏覽器開啟。**本機（此 repo）：只用 http://127.0.0.1:8888/**（唔用 port 80）。

伺服器日常使用 **不必安裝 Node.js**。

**本機 IIS 一鍵（要系統管理員）：** `npm run iis:setup` → 站台 `Telecom360-next` 只開 **8888**，並停用 Default Web Site (:80)。

### 乙、製作導覽（編輯器）

1. 瀏覽器開啟編輯器。
2. 填 **專案名稱**（必填），例如 `FOS ControlRoom`。
3. 填 **SITE_CODE**、**ROOM_NAME**、**PHOTO_DATE**（必填；決定發佈路徑）。
4. 按 **新增全景圖片**，加入約 **2:1** 的 equirectangular **JPG/PNG**。
5. 可選：**注解**、**場景連結**、**設置初始視角**、拖曳調整場景順序。
6. 按 **匯出 ZIP**。

### 丙、發佈導覽（人手複製）

1. 將 ZIP **解壓到 IIS 網站根目錄**，使出現：

   ```text
   {IIS 根目錄}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
     index.html              ← 預建 Viewer
     project.json            ← 導覽資料（Viewer 以 fetch 載入）
     brand\
     assets\
       viewer-*.js / *.css   ← Viewer 應用（含 three.js）
       source\*.jpg          ← 全景圖
   ```

   ZIP **根層**另有 `README.txt`（與 `site\` 同一層，不是在 DATE 資料夾內）。

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

## 匯出套件結構

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

### 開發者

```bash
npm install
npm run build          # typecheck + Vite + 產生 viewer-shell
npm run dev
npm run iis:stage      # build 後複製 dist → C:\inetpub\wwwroot
npm run iis:setup      # build + 只綁 IIS :8888（要 admin）
```

本機瀏覽器：**http://127.0.0.1:8888/**

- Viewer 源碼：`src/viewer-main.ts` + `viewer/index.html`
- 匯出模板：`viewer-shell/`（build 產物，勿手改）
- 編輯器部署必須包含 `viewer-shell/`，瀏覽器匯出先 fetch 殼層再打包
- 導覽資料只在 `project.json`，**不再** inline 進 HTML

---

## 其他

- **瀏覽器：** 建議新版 Chrome / Edge（需 **WebGL 2**；本版 three.js **不支援 WebGL 1**）。
- **內部使用。** CLP LOGO 與品牌資產屬公司所有。
