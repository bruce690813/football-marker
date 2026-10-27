# v6.133 安全與測試檢查清單

- [x] 以 v6.132 ZIP 解壓作為直接基底，且保持 v6.51 開發來源原則。
- [x] 確認僅加入摘要／Canvas 統計、勝方章判定及版本／說明文字。
- [x] 以 BeautifulSoup 驗證摘要統計區及兩個勝方章元素存在。
- [x] Node.js `--check` 驗證 4 個 JavaScript 區塊語法。
- [x] 進球統計依既有比分、射門／撲救／防守依既有 Marker event 計數；未修改事件資料。
- [x] PK 完成時依 PK 進球數判定勝方；一般依全場比分；平手不顯示勝章。
- [x] 正式 ZIP 僅包含 index.html、README.md、SECURITY_CHECKLIST.md。
- [ ] Mac Firefox / Chrome 真實互動與摘要版面測試（未實測）。
- [ ] iPhone Safari 直式長隊名、短螢幕畫面與視窗操作（未實測）。
- [ ] Canvas 分享圖片真實存檔、智慧雙欄長事件回歸（未實測）。
- [ ] 賽前、上半場、中場、下半場、延長賽、PK、全場、CSV 完整功能回歸（未實測）。

未完成項目不得視為已通過。未修改既有 CSV 格式與事件操作流程。
