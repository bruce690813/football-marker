# 足球精彩標記器 v2.5

## 新增
- 手機端新增「比賽場地」
- LocalStorage 會保存比賽場地
- CSV 新增 `venue` 欄位
- JSON 新增 `venue`
- 分享 CSV 時會帶入比賽名稱與場地
- Mac 剪輯程式會顯示：
  - 比賽名稱
  - 比賽場地

## CSV 格式
例如：

match_name,venue,time,seconds,event,note,recorded_at
忠義 vs A隊,百齡足球場,05:41.22,341.220,GOAL,,2026-08-20T...

## Mac
執行：

start_mac.command

匯入手機 CSV 或 JSON 後，介面會顯示比賽名稱與場地。
