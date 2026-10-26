# 足球場邊記錄器 v6.131

## 修改紀錄
- 以 v6.130 為基礎。
- 僅桌面（min-width:1024px）取消比賽進行中原先保留給 iOS Safari 的 `.wrap` 底部 150px 以上安全內距，統一為 12px。
- 保留 v6.129 已停用的桌面版 `liveViewportBottomSpacer`／`fullTimeBottomSpacer`，避免兩種留白相加。
- 不強制固定外框高度，事件增加時仍可正常向下延伸。
- 手機版、事件按鈕、紀錄、摘要、分享圖片、CSV 及原有 JavaScript 均不更動。

## 注意
本次執行了原始碼差異、語法及封裝檢查；桌面瀏覽器和手機 Safari 實機的畫面與互動尚未驗證。
