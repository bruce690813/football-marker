# ⚽ 足球場邊記錄器 v5.80（修正版）

本修正版修正上一個 v5.80 發版包「開啟後停在載入畫面」的問題。

## 問題原因

上一版 v5.80 使用執行時套用更新的方式，但比對的是錯誤的按鈕 HTML 結構，
因此在真正的 v5.79 基底中找不到「主畫面輸出工具」而中止。

v5.79 實際使用的元素包含：

- `#saveImageBtn`
- `#reportCloseBtn`
- `#reportShareBtn`
- `.toolGrid.finalTools`
- `.reportActions.twoReportActions`

本修正版改成依 **穩定的 element id / class** 進行 DOM 調整，
不再依賴整段 HTML Regex，因此不會因為 class 順序、空白或屬性不同而失敗。

## v5.80 UI 調整

- 主畫面移除「🖼 儲存圖片」
- 主畫面保留「📋 摘要」與「📄 匯出 CSV」
- `＋ 新比賽` 維持原本獨立整排
- 摘要底部只留「分享／儲存圖片」
- 原本摘要底部「關閉」改成右上角 `×`
- 快速使用指南同步新的操作流程

## 使用注意

這個修正版仍以 GitHub 上固定的 v5.79 commit 為基底：

`ff440dad7811b0c1b69a493ec0dff9c23ee012e6`

因此：

- 不會追隨 main 分支改變
- 第一次開啟仍需要網路連線
- 本次修正不會改變既有 LocalStorage key 或比賽資料格式

## 發版內容

```text
football_marker_v5_80_fixed.zip
├── index.html
├── README.md
└── SECURITY_CHECKLIST.md
```
