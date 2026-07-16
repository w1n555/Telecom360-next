# IIS 安裝與發佈說明

**中文** · [English](#iis-install--publish)

給 **一般使用者／IT**：只靠 **IIS + 複製檔案**，不需本機開發指令。

---

## 中文

### 1. 安裝編輯器到 IIS

1. 開啟 **IIS 管理員**，確認有網站（預設網站或自訂站台）。
2. 查看該站台的 **實體路徑**（常見：`C:\inetpub\wwwroot`）。
3. 把 **編輯器網站檔案** 全部複製進該資料夾：
   - 至少要有 `index.html`、`assets\`、`brand\`、`vendor\` 等
4. 瀏覽器開啟網站首頁（例如 `http://localhost/`）。

可選：站台使用本套件提供的 `web.config`，以便正確提供 `.json`、`.mjs`。

### 2. 發佈一條全景導覽

1. 在編輯器按 **匯出 ZIP**。
2. 解壓（或複製）到 **同一個 IIS 根目錄**，使出現：

```text
C:\inetpub\wwwroot\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
```

3. 開啟：

```text
http://{伺服器}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
```

### 3. 注意

- 伺服器 **不需要** 安裝 Node.js 才能給人睇導覽或用編輯器靜態檔。
- 舊版 Marzipano 的 ZIP **不能**直接用於本版。

---

## IIS install & publish

For **end users / IT**: **IIS + copy files only**. No developer toolchain required on the server.

### 1. Install the Editor on IIS

1. Open **IIS Manager** and select the website.
2. Note the site **physical path** (often `C:\inetpub\wwwroot`).
3. **Copy** all Editor web files into that folder (`index.html`, `assets\`, `brand\`, `vendor\`, …).
4. Browse to the site home page (e.g. `http://localhost/`).

Optional: use the provided `web.config` for `.json` / `.mjs` MIME types.

### 2. Publish a tour

1. In the Editor, **Export ZIP**.
2. Unzip/copy into the **same IIS root** so you get:

```text
C:\inetpub\wwwroot\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
```

3. Open:

```text
http://{server}/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
```

### 3. Notes

- **Node.js is not required** on the server for normal Editor (static) + viewer use.
- Legacy Marzipano ZIP packages are **not** supported.
