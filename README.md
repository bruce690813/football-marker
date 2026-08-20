# 足球場邊記錄器 v2.38

## iPhone Safari 摘要按鈕修正
本版針對「關閉 / 分享圖片 / 儲存圖片」三個按鈕在 iPhone Safari 看得到但無法操作的問題重新處理。

### 修正內容
- 不再使用 CSS `vh` 推算摘要視窗高度。
- 改用 Safari `visualViewport.height / offsetTop` 取得真正可視區域。
- Safari 工具列展開或收合時，摘要視窗高度會即時重新計算。
- 摘要 footer 永遠保留 64px 獨立高度，不再落入瀏覽器底部工具列後方。
- 開啟摘要時鎖住首頁捲動，只允許摘要內容區捲動。
- 三個 footer 按鈕同時支援 `touchend` 與 `click`，避免 iOS Safari hit-test / click 延遲問題。
- 「分享圖片」呼叫 iOS 系統分享面板。
- 「儲存圖片」同樣呼叫 iOS 系統分享面板，請選「儲存影像 / 儲存到照片」；Safari 網頁本身無法直接繞過系統權限寫入 Photos。
