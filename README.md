# 足球場邊記錄器 v3.22

## 修正：iPhone Safari 底部工具列遮住輸出按鈕

- 保留既有 `env(safe-area-inset-bottom)` 支援。
- 額外增加 Safari 底部工具列的可捲動安全空間。
- 頁面可再向上滑，讓「摘要 / 儲存圖片 / 匯出 CSV」完整移到 Safari 底部工具列上方。
- 不把三顆按鈕改成 fixed / sticky，避免與 Safari 自己的工具列互相覆蓋。
- 加入 `scroll-margin-bottom` 與額外 bottom spacer，提高不同 iPhone / Safari 顯示狀態下的可靠性。
- 上方比賽資訊與事件按鈕尺寸不變。
