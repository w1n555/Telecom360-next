# IIS 部署說明

## 建議架構（與舊站一致）

```text
http://{server}:8888/                          → Editor
http://{server}:8888/site/S/R/D/               → 一鍵部署成果
http://{server}:8888/api/deploy                → 寫入 site\（Node）
```

## 方式 A：Node 直接聽 8888（最簡單）

1. 安裝 Node.js  
2. `npm.cmd install` && `npm.cmd run build`  
3. 設定環境變數（可選）：

```powershell
$env:T360_WEB_ROOT = "D:\Telecom360-Three.js\dist"
$env:PORT = "8888"
npm.cmd start
```

4. 防火牆放行 8888  
5. Editor：`http://165.202.7.33:8888/`

一鍵部署檔案落在 `{T360_WEB_ROOT}\site\...`。

## 方式 B：IIS 靜態 + 反代 API

1. `npm run build`，將 `dist\*` 放到 IIS 站台根  
2. 另開 Node（例如 8890）跑 `npm start`（PORT=8890, T360_WEB_ROOT=IIS 實體路徑）  
3. IIS URL Rewrite / ARR：`/api/*` → `http://127.0.0.1:8890/api/*`  
4. 確保 `site` 資料夾對 Node 行程可寫  

## MIME（若純 IIS 送 KTX2/WASM 時）

| 副檔名 | MIME |
|--------|------|
| .wasm | application/wasm |
| .ktx2 | application/octet-stream |

## 權限

寫入 `site` 的程序（Node 或應用程式池）需要 **Modify** 權限。
