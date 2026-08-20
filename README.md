# 足球精彩標記器 v2.4

## 手機端調整
- 主要操作壓縮到一個手機畫面
- 「暫停」改成「比賽結束」
- 比賽流程：開始比賽 → 標記 → 比賽結束 → 匯出
- 新增「分享 CSV」
- 保留「下載 CSV」
- 保留 JSON 備份
- 標記清單改成預設收合，節省畫面高度

## CSV 如何到 Mac
### 方法 1：分享 CSV
iPhone Safari 點「分享 CSV」。
若瀏覽器支援檔案分享，會打開 iOS 分享面板，可選：
- AirDrop 到 Mac
- 儲存到「檔案」
- iCloud Drive
- 寄信給自己等

### 方法 2：下載 CSV
點「下載 CSV」後，通常可在 iPhone：
檔案 App → 下載項目 / Downloads
找到 CSV，再 AirDrop 或 iCloud 同步到 Mac。

## Mac 剪輯程式支援
`marker_clip_tool_v2_4.py` 支援：
- CSV
- JSON

不建議圖片當主要資料交換格式。
圖片若要讀取時間，需要 OCR，準確性與流程都比 CSV/JSON 差。

## Offset
攝影機先錄 30 秒，正式開球時手機才按「開始」：
Offset = +30 秒。

手機標記 05:41 GOAL
→ 對應影片 06:11。
