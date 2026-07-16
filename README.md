# Telecom360-Three.js

用 **three.js + TypeScript** 重構的 360° 全景 **編輯器 + 靜態檢視器**。  
進化專案：**不相容**舊 Marzipano ZIP；**無 CDN**（Three.js 隨包 `vendor/`）。

| 角色 | URL |
|------|-----|
| **Editor** | `http://{host}:8888/` |
| **已部署 Viewer** | `http://{host}:8888/site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/` |

---

## 功能現況（v1）

| 功能 | 狀態 |
|------|------|
| 多場景上傳 equirect（含 11904×5952） | ✅ |
| 場景拖曳排序、重新命名、刪除 | ✅ |
| Hotspot info / scene（跳場景）+ 拖曳 | ✅ |
| 初始視角 | ✅ |
| 場景轉場（對準 icon zoom 30% → fade） | ✅ |
| 大 Sphere + 3D 移動 WASD/QE（可開關，範圍 ±120） | ✅ |
| 匯出 ZIP（結構 = 部署路徑，圖片只一份） | ✅ |
| 開啟套件 re-import | ✅ |
| 一鍵部署 → `site/S/R/D/` + 進度 % + 成功連結卡片 | ✅ |
| Viewer：旋轉／縮放／熱點／3D 移動／自動旋轉／全螢幕 | ✅ |
| 繁中 UI + CLP LOGO | ✅ |
| Offline three（module + core） | ✅ |
| 測量 | ❌ 已移除（單張 360 無深度無法真 mm） |
| 外部 URL hotspot / 舊 ZIP | ❌ 不做（v1） |
| KTX2 / WebGPU | ⏳ 之後 |

---

## 快速開始

```powershell
cd C:\Users\W1NGGG\Documents\Telecom360-Three.js
npm.cmd install
npm.cmd run dev
```

- Editor：http://127.0.0.1:8888/  
- 部署寫入：`.\site\{SITE}\{ROOM}\{DATE}\`  
- 健康檢查：http://127.0.0.1:8888/api/health  
- 已部署列表：http://127.0.0.1:8888/api/sites  

### 建置 + 正式跑

```powershell
npm.cmd run build
$env:PORT = "8888"
# 可選：寫入 IIS 站台根
# $env:T360_WEB_ROOT = "C:\inetpub\wwwroot\Telecom360"
npm.cmd start
```

### 離線 Viewer POC（開發用）

```powershell
node scripts/poc_viewer_package.mjs
# 然後開 http://127.0.0.1:8888/site/POC/POC/verify/
```

---

## Export ZIP 結構（= 一鍵部署路徑）

```text
site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
  index.html              ← 小檔（無 base64 圖）
  project.json            ← 無 dataUrl
  vendor/
    three.module.js
    three.core.js         ← 必須，無 CDN
  assets/source/*.jpg     ← 圖片只一份
README.txt
```

解壓到 Web 根目錄後 URL 與一鍵部署相同。

---

## 操作摘要

1. 新增全景（或拖放 JPG）  
2. 編輯注解／場景連結／初始視角  
3. 填 **SITE_CODE · ROOM_NAME · PHOTO_DATE**（匯出／部署必填）  
4. **一鍵部署** 或 **匯出 ZIP**  

---

## 技術

- TypeScript + Vite + three.js r172  
- Express：`/api/deploy`（ZIP 解壓）、`/api/sites`、`/site` 靜態  
- Vite `watch.ignored`：`site/**`（避免部署觸發整頁 reload）  

Private / 內部使用。LOGO 與品牌資產屬公司所有。
