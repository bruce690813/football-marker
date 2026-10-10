# 足球場邊記錄器 v6.52 — 發版檢查

## 版本同步
- [x] ZIP、HTML 標題與畫面版本一致。
- [x] README 與本版功能說明同步更新。
- [x] 未改變 v6.51 整合版的 JSON schema，保留原本 LocalStorage key。

## 操作與安全
- [x] 既有名稱與背號輸入仍使用清理、長度／區間限制。
- [x] 新增比分的 HTML 片段只使用已限制在 0～99 的數值。
- [x] CSV 仍保留避免公式注入的跳脫邏輯。
- [x] 未加入外部追蹤、CDN、遠端 API、額外第三方 JavaScript。
- [x] 比賽紀錄仍預設留在目前瀏覽器本機；使用者可自行匯出備份。

## UI／流程
- [x] 比賽中／中場／下半場／延長賽共用同一套 CSS 設計。
- [x] Compact/Ultra Compact 賽事欄位高度維持 38px/35px。
- [x] 主內容獨立捲動，固定工具列不蓋住事件按鈕。
- [x] Playwright Chromium 行動尺寸初步測試通過；未代替 iPhone Safari 實機驗收。
