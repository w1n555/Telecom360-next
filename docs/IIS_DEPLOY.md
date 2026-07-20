# IIS 安裝與發佈說明

**中文** · [English](#iis-install--publish)

給 **一般使用者／IT**：**IIS + 複製檔案**。伺服器不必安裝 Node.js。

---

## 中文

### 1. 安裝編輯器到 IIS

1. 開啟 **IIS 管理員**，選取網站。
2. 查看 **實體路徑**（常見：`C:\inetpub\wwwroot`）。
3. 將 **編輯器網站檔案** 全部複製進該路徑（由團隊提供的發佈包／建置結果）：
   - `index.html`
   - `assets\`
   - `brand\`
   - `viewer-shell\`（**匯出 ZIP 必須**；預建 Viewer 模板）
   - （可選）`viewer\`、`vendor\`、`favicon.png` 等
4. 瀏覽器開啟網站首頁（例如 `http://localhost/`；實際 port 視 IIS 繫結而定）。

### 2. 建議的 `web.config`（MIME）

放到 **IIS 網站根**（與 `index.html` 同一層）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".json" />
      <remove fileExtension=".mjs" />
      <remove fileExtension=".wasm" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
      <mimeMap fileExtension=".wasm" mimeType="application/wasm" />
    </staticContent>
  </system.webServer>
</configuration>
```

### 3. 發佈一條全景導覽

1. 編輯器按 **匯出 ZIP**。
2. 解壓到 **同一個 IIS 根目錄**，使出現：

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

### 4. 注意

- 伺服器 **不需要** Node.js 才能使用靜態編輯器與已發佈檢視器。
- 舊版 Marzipano ZIP **不能**用於本版。
- 瀏覽器需支援 **WebGL 2**。
- 編輯器目錄必須包含 **`viewer-shell\`**，否則「匯出 ZIP」會失敗。

---

## IIS install & publish

For **end users / IT**: **IIS + copy files**. **Node.js is not required** on the server.

### 1. Install the Editor on IIS

1. Open **IIS Manager** and select the website.
2. Note the **physical path** (often `C:\inetpub\wwwroot`).
3. **Copy** the Editor web package into that folder (`index.html`, `assets\`, `brand\`, **`viewer-shell\`** (required for ZIP export), …).
4. Browse the site home page (e.g. `http://localhost/`; port depends on bindings).

### 2. Suggested `web.config` (MIME)

Place at the **IIS site root** (same folder as `index.html`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension=".json" />
      <remove fileExtension=".mjs" />
      <remove fileExtension=".wasm" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".mjs" mimeType="application/javascript" />
      <mimeMap fileExtension=".wasm" mimeType="application/wasm" />
    </staticContent>
  </system.webServer>
</configuration>
```

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

### 4. Notes

- **No Node.js** required on the server for static Editor + published viewers.
- Legacy Marzipano ZIP is **not** supported.
- Browsers need **WebGL 2**.
- Editor deploy **must include `viewer-shell\`**, or **Export ZIP** will fail.
