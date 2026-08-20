# 足球場邊記錄器 v2.37

## 本版修正
- 修正 iPhone Safari 摘要視窗底部「關閉 / 分享圖片 / 儲存圖片」按鈕看得到但點擊無反應的問題。
- 移除摘要 footer 的 `position: sticky`，改為獨立固定在 modal flex 底部的 footer，避免 Safari hit-test 被捲動內容遮住。
- footer 與按鈕增加 z-index / pointer-events / touch-action。
- 三個按鈕增加明確的 DOM event listener，避免 iOS Safari 對 inline onclick 的偶發觸控問題。
- 圖片產生流程由非同步 `canvas.toBlob()` 改為同步 `canvas.toDataURL()` → Blob/File。
- 因此可在使用者點擊當下立即呼叫 `navigator.share()`，避免 iOS Safari 遺失 user activation。
- 「儲存圖片」仍會叫出 iPhone 分享面板，可選「儲存影像 / 儲存到照片」；完成或取消後留在原頁。
