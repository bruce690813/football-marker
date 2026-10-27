# SECURITY_CHECKLIST.md — v6.137

- 直接沿用 v6.136，不更動事件資料、CSV 格式或持久化機制。
- 兩張 PNG 均在瀏覽器本機 Canvas 生成；不新增外部傳輸或依賴。
- 同步轉檔以維持 iOS Web Share 點擊手勢；先檢查 `navigator.canShare({files})`。
- 若不支援多檔分享，提供兩個分開的下載連結；使用者取消不觸發備援下載。
- 需實測：iPhone Safari 分享／儲存兩張、LINE 多檔接收、較長賽事 Canvas 記憶體壓力及完整比賽狀態回歸。
