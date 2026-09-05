# 足球場邊記錄器 v4.33

此壓縮檔包含：

- `index.html`：足球場邊記錄器 v4.33 主程式
- `README.md`：本說明文件

## 版本
v4.33

## 本版重點
- 再次修正「最近使用場地」選單被比分卡／名單卡遮住的問題。
- 根因為 `matchCard` 的 `isolation` / 玻璃效果形成獨立 stacking context；單純提高選單 z-index 無法跨出父層。
- 開啟場地選單時，現在會把選單 DOM 直接 portal 到 `document.body` 最上層。
- 選單使用 viewport fixed 定位與極高 z-index，避免任何卡片、比分區或 backdrop-filter 壓住。
- 依 visual viewport 可用空間自動決定向下或向上展開，並限制最大高度。
- 點擊／捲動選單本體不會被誤判為點到外部而關閉。
