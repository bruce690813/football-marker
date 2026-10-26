# SECURITY CHECKLIST — v6.132

- [x] 以 v6.131 ZIP 為直接基底，僅新增桌面專用 CSS 和版本字樣。
- [x] 無 JavaScript 行為修改；未增加外部程式碼與資料傳輸。
- [x] 僅在 `min-width:1024px` 下覆蓋手機專用安全尾端佔位元件。
- [x] 保留手機版 CSS、HTML 結構、比分、事件、延長賽、PK、摘要、分享圖片、CSV 等既有程式。
- [x] ZIP 僅包含 index.html、README.md、SECURITY_CHECKLIST.md。
- [ ] 真實 Mac Firefox 桌面畫面與操作回歸：尚未實測。
- [ ] iPhone Safari 實機：尚未實測。
- [ ] 賽前、上半場、中場、下半場、延長賽、PK、全場全流程：尚未實測。

## 注意
正常事件內容高度超過瀏覽器可視高度時仍會保留捲動，不裁切事件或操作按鈕。
