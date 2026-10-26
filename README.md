# 足球場邊記錄器 v6.132

## 版本基底
直接由 v6.131 修改，承接正式 v6.51 版本以來既有功能與 UI。

## 本次修改（僅桌面版）
- 修正 `liveViewportBottomSpacer` 在比賽中因後續高優先序 CSS 規則重新顯示，導致下方額外約 176px 安全留白的問題。
- 使用 `body #appContent #liveViewportBottomSpacer` 等更精確的桌面專用選擇器停用兩種手機安全佔位元件。
- 將桌面手機外框外距由上 92px／下 40px 調為上 64px／下 10px，減少不必要的頁面捲動。
- 保留桌面手機外框寬度 430px、Dynamic Island、所有記錄器控制項與功能；手機版媒體查詢完全不變。
- 此修改不會在內容超出實際可視高度時強制裁切，因此較矮視窗或大量事件仍可正常捲動。

## 測試說明
- 完成 v6.131/v6.132 原始碼差異檢查，程式 JavaScript 內容未變。
- Chromium 靜態頁面測試中，模擬桌面比賽中狀態的安全 spacer 已從顯示 176px 改為 display:none。
- 上述測試環境無法完整初始化正式比賽資料，因此不代表 Mac Firefox、iPhone Safari 或全流程實機驗證完成。
