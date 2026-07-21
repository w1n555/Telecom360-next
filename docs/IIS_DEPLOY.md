# IIS 安裝與發佈說明

**中文** · [English](#iis-install--publish)

給 **一般使用者／IT**：**下載 → 解壓 → 複製檔案**。伺服器不必安裝 Node.js，也**不需要**執行任何腳本。

Release ZIP **已包含 `web.config` 與 `viewer-shell/`** — 複製到 IIS 根目錄即可使用，無需額外套 MIME。

---

## 中文

### 1. 安裝編輯器到 IIS

1. 下載官方 Release：`Telecom360-next-vX.Y.Z-iis.zip`（由開發團隊建置並發佈）。
2. 解壓後，將**全部檔案**複製到 IIS 網站**實體路徑**（常見：`C:\inetpub\wwwroot`）。

   複製後應看到至少：

   | 路徑 | 說明 |
   |------|------|
   | `index.html` | 編輯器首頁 |
   | `assets\` | 編輯器 JS / CSS |
   | `brand\` | LOGO / favicon |
   | `viewer-shell\` | 預建 Viewer 模板（**匯出 ZIP 必須**，勿刪） |
   | `web.config` | 已設定 `.json` / `.mjs` / `.wasm` MIME，**無需再改 IIS** |
   | `RELEASE.txt` | （可選）版本與部署摘要 |

3. 瀏覽器開啟網站首頁 → 即可使用編輯器。

**Node.js 不需要。** 無需 PowerShell / npm。

### 2. 關於 `web.config`

Release 包**已包含** `web.config`，與 `index.html` 同一層。內容會為 `.json`、`.mjs`、`.wasm` 設定正確 MIME，讓：

- 編輯器匯出時可載入 `viewer-shell/manifest.json`
- 已發佈導覽可 `fetch project.json`

一般**不必**手動編輯或另建 `web.config`。

**故障排除：** 若 `project.json` 被瀏覽器下載成檔案、或匯出提示找不到 viewer-shell，請確認網站根仍有 `web.config`，且未被其他站點設定覆寫 MIME。

### 3. 發佈一條全景導覽

1. 編輯器按 **匯出 ZIP**。
2. 將導覽 ZIP **解壓到同一個 IIS 根目錄**，使出現：

```text
C:\inetpub\wwwroot\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
  index.html              ← 預建 Viewer
  project.json
  brand\
  assets\
    viewer-*.js / *.css
    source\*.jpg
```

（ZIP 根目錄另有 `README.txt`。）

3. 開啟：

```text
http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
```

### 4. 更新編輯器

用新版 `Telecom360-next-vX.Y.Z-iis.zip` **覆蓋**網站根檔案；保留既有 `site\` 導覽資料夾即可。

### 5. 注意

- 伺服器 **不需要** Node.js。
- 瀏覽器需支援 **WebGL 2**（建議 Chrome / Edge）。
- 編輯器目錄必須包含 **`viewer-shell\`**，否則「匯出 ZIP」會失敗。
- 請勿刪除 **`web.config`**，否則 `.json` 可能無法正確載入。

---

## IIS install & publish

For **end users / IT**: **download → unzip → copy**. **No Node.js** on the server. **No scripts.**

The Release ZIP **includes `web.config` and `viewer-shell/`** — copy into the IIS root and use immediately; no extra MIME setup.

### 1. Install the Editor on IIS

1. Download the official Release: `Telecom360-next-vX.Y.Z-iis.zip`.
2. Unzip and **copy all files** into the IIS website **physical path** (often `C:\inetpub\wwwroot`).

   You should see at least:

   | Path | Purpose |
   |------|---------|
   | `index.html` | Editor |
   | `assets\` | Editor JS / CSS |
   | `brand\` | Logos / favicon |
   | `viewer-shell\` | Prebuilt viewer template (**required for Export ZIP**) |
   | `web.config` | MIME for `.json` / `.mjs` / `.wasm` — **no extra IIS setup** |
   | `RELEASE.txt` | Optional version notes |

3. Open the site home page in a browser.

**Node.js is not required.** No PowerShell / npm on the server.

### 2. About `web.config`

The Release package **includes** `web.config` next to `index.html`. It maps `.json`, `.mjs`, and `.wasm` so:

- Export can load `viewer-shell/manifest.json`
- Published tours can `fetch project.json`

You normally **do not** need to create or edit `web.config` yourself.

**Troubleshooting:** If `project.json` downloads as a file, or export cannot find viewer-shell, confirm `web.config` is still at the site root and MIME types are not overridden elsewhere.

### 3. Publish a tour

1. In the Editor, click **Export ZIP** (匯出 ZIP).
2. Unzip into the **same IIS root** so you get:

```text
C:\inetpub\wwwroot\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
  index.html              ← prebuilt Viewer
  project.json
  brand\
  assets\
    viewer-*.js / *.css
    source\*.jpg
```

(`README.txt` is at the ZIP root.)

3. Open:

```text
http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
```

### 4. Update the Editor

Overwrite the site root with a newer `Telecom360-next-vX.Y.Z-iis.zip`. Keep existing `site\` tour folders.

### 5. Notes

- **No Node.js** required on the server.
- Browsers need **WebGL 2** (Chrome / Edge recommended).
- Editor deploy **must include `viewer-shell\`**, or **Export ZIP** will fail.
- Do not remove **`web.config`**, or `.json` may fail to load correctly.
