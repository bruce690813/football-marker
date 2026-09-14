# SECURITY_CHECKLIST.md
# v5.80 修正版驗證範圍：載入流程、DOM 更新、輸出入口整併
# 足球場邊記錄器 — 發版安全與同步檢查清單

## v5.80 修正版

- [x] 已確認 v5.79 真實主畫面按鈕為 `#saveImageBtn`。
- [x] 已確認摘要關閉按鈕為 `#reportCloseBtn`。
- [x] 已確認摘要分享按鈕為 `#reportShareBtn`。
- [x] 已確認主畫面輸出區為 `.toolGrid.finalTools`。
- [x] 已確認摘要底部操作區為 `.reportActions.twoReportActions`。
- [x] 不再使用上一版錯誤的整段 HTML Regex 比對。
- [x] 主畫面「儲存圖片」改由 DOM 移除。
- [x] `#reportCloseBtn` 沿用原 ID，只移動位置並改成右上角 ×，避免既有 click 綁定失效。
- [x] 摘要底部保留 `#reportShareBtn`。
- [x] 主畫面輸出區改為兩欄。
- [x] 快速使用指南同步。
- [x] 錯誤訊息換行已修正，不再顯示文字 `\n`。
- [x] 本次不修改 LocalStorage key、比賽狀態資料結構、事件資料或 CSV 欄位。
- [x] ZIP 包含 `index.html`、`README.md`、`SECURITY_CHECKLIST.md`。
- [ ] 實體 iPhone Safari 分享面板仍需裝置驗收。
- [ ] 完整打一場比賽的實機回歸仍需裝置驗收。

## 固定發版結構

```text
football_marker_vX_XX.zip
├── index.html
├── README.md
└── SECURITY_CHECKLIST.md
```
