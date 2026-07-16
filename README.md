# Telecom360-Three.js

用 **three.js + TypeScript** 重構的 360° 全景 **編輯器 + 靜態檢視器**，對齊舊 Telecom360 工作流，進化專案（**不相容**舊 Marzipano ZIP）。

| 角色 | URL（範例） |
|------|-------------|
| **Editor** | `http://165.202.7.33:8888/` |
| **已部署 Viewer** | `http://165.202.7.33:8888/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

## 功能（v1）

- 多場景管理（典型 5–20 張 equirect，支援約 **11904×5952** JPG）
- Hotspot：**info**（注解）／**scene**（跳場景，等同舊 link）
- 拖曳編輯、設置初始視角
- 測量（相對單位）
- 大 Sphere + **有限 3D 移動**（預設關，±約 10）
- 場景切換平滑轉場
- **匯出 ZIP**（standalone viewer + 可再 import 編輯）
- **一鍵部署**：寫入 `site/{SITE}/{ROOM}/{DATE}/`，IIS 即開即睇
- 繁體中文 UI、公司 LOGO
- 外部 URL hotspot → 之後；舊 ZIP import → 不做

## 快速開始（本機）

```powershell
cd C:\Users\W1NGGG\Documents\Telecom360-Three.js
npm.cmd install
npm.cmd run dev
```

預設：**http://127.0.0.1:8888/**  
一鍵部署寫入專案目錄：`.\site\{SITE}\{ROOM}\{DATE}\`

## 建置靜態檔

```powershell
npm.cmd run build
npm.cmd start
```

- `dist/` = Editor 靜態資源  
- `npm start` = 以 Node 提供 `dist` + `/api/deploy` + `/site`（port 8888）

### 指定 IIS 實體根目錄（真·寫入 IIS 站台）

```powershell
$env:T360_WEB_ROOT = "C:\inetpub\wwwroot\Telecom360"   # 你的 8888 站台實體路徑
$env:PORT = "8888"
npm.cmd start
```

一鍵部署會寫入：

```text
{T360_WEB_ROOT}\site\{SITE_CODE}\{ROOM_NAME}\{PHOTO_DATE}\
```

瀏覽：

```text
http://{host}:8888/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
```

> 純 IIS 靜態站**無法**讓瀏覽器直接寫碟。一鍵部署依賴同站 **`POST /api/deploy`**（本 repo 的 Node 服務）。可把 Node 當後端、IIS 反代，或直接用 `npm start` 聽 8888。

## 使用流程

1. 開啟 Editor  
2. **新增全景圖片**（或拖放 JPG）  
3. 編輯注解／場景連結／初始視角／測量  
4. 填 **SITE_CODE · ROOM_NAME · PHOTO_DATE**  
5. **一鍵部署** → 自動進入 `site/...`  
6. 或 **匯出 ZIP** 備份／搬運／再「開啟專案套件」

## 專案結構（摘要）

```text
src/           Editor + Viewer 原始碼（TypeScript）
server/        dev / preview + deploy API
public/brand/  LOGO
site/          本機部署輸出（gitignore）
dist/          build 輸出
viewer/        Viewer 入口（build 一併打包）
```

## 套件格式

- `format`: `telecom360-threejs-package`
- `version`: `1`
- 僅支援本格式 import（無 legacy adapter）

## 授權與品牌

Private / 內部使用。LOGO 與品牌資產屬公司所有。third-party：three.js（MIT）等。
