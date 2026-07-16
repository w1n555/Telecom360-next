# IIS 部署說明 / IIS deploy notes

**中文** · English below

## 中文

純靜態發佈：**匯出 ZIP → 複製到網站根目錄**。

### 網址

```text
http://{server}:8888/                 → 編輯器（可選，亦可只在本機編）
http://{server}/site/S/R/D/           → 已發佈檢視器
```

### 建議流程

1. 本機編輯並填寫專案名稱、SITE_CODE、ROOM_NAME、PHOTO_DATE  
2. **匯出 ZIP**  
3. 解壓到伺服器 `C:\inetpub\wwwroot`（或對應網站實體路徑）  
4. 開啟 `http://{server}/site/{SITE}/{ROOM}/{DATE}/`

### 本機 IIS（可選）

```powershell
npm.cmd run build
# 系統管理員
.\scripts\install-iis-8888.ps1
```

- 實體路徑：`C:\inetpub\wwwroot`  
- 僅靜態檔與 MIME（見 `web.config`）  
- **不需** Node 後端  

### MIME（建議）

| 副檔名 | MIME |
|--------|------|
| .json | application/json |
| .mjs | application/javascript |
| .wasm | application/wasm |

---

## English

Static-only publish: **export ZIP → copy to web root**.

### URLs

```text
http://{server}:8888/                 → Editor (optional)
http://{server}/site/S/R/D/           → Published viewer
```

### Recommended flow

1. Edit locally; fill project name, SITE_CODE, ROOM_NAME, PHOTO_DATE  
2. **Export ZIP**  
3. Unzip into `C:\inetpub\wwwroot` (or the site physical path)  
4. Open `http://{server}/site/{SITE}/{ROOM}/{DATE}/`

### Optional local IIS

```powershell
npm.cmd run build
# Administrator
.\scripts\install-iis-8888.ps1
```

Server needs **IIS static hosting only** — no Node process required for publishing viewers.
