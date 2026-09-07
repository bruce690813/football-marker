# SECURITY CHECKLIST — football-marker v4.88

## 1. Input validation

- [x] 我方隊名：必填、15 字、非純數字、禁止 `< >` / 控制字元 / 換行
- [x] 對手隊名：選填、15 字、非純數字、禁止 `< >` / 控制字元 / 換行
- [x] 賽事名稱：選填、20 字、禁止 `< >` / 控制字元 / 換行
- [x] 場地：選填、15 字、禁止 `< >` / 控制字元 / 換行
- [x] 背號：1–99 整數
- [x] 比分：0–99 整數
- [x] 規定時間 / 延長賽：1–45 分鐘

## 2. DOM XSS

- [x] 一般文字輸出使用 `textContent`
- [x] 必須使用 HTML template 的文字使用 `escapeHtml()`
- [x] 動態 Attribute 使用 `escapeAttr()`
- [x] PK aria-label 的隊名已做 Attribute Encoding
- [x] 事件紀錄 / 摘要 title 屬性已做 Attribute Encoding
- [x] 不使用 `eval()` / `new Function()` / `document.write()`

## 3. Persisted state / localStorage

- [x] `loadState()` 不直接 merge 任意 JSON
- [x] 僅允許已知 state 欄位
- [x] Boolean / integer / epoch / array / enum 全部重新驗證
- [x] Marker event 僅允許 GOAL / SAVE / SHOT / DEFENSE / YELLOW_CARD / RED_CARD
- [x] Team 僅允許 OUR / OPP
- [x] 背號重新限制 1–99
- [x] 比分 snapshot 只接受 `0:0`～`99:99` 格式
- [x] Marker 最多載入 2000 筆；PK 最多 50 輪；period 最多 10 筆

## 4. CSV / file export

- [x] CSV 對以 `= + - @ TAB CR LF` 開頭的**文字值**加上安全文字前綴，避免 Formula Injection
- [x] 數值欄位仍維持數值，不會因負數 diff 被錯誤轉成文字公式防護
- [x] CSV quote / CR / LF 正確 escape
- [x] 檔名移除 C0/C1 control characters
- [x] 檔名移除 `\ / : * ? " < > |`
- [x] 防 Windows reserved filename (`CON`, `NUL`, `COM1`...)
- [x] `downloadBlob()` 再做一次最終檔名 sanitize

## 5. Architecture / attack surface

- [x] 純 GitHub Pages 前端工具
- [x] 無後端 SQL / OS command execution surface
- [x] 無登入 / Session / Cookie 權限流程
- [x] 無 API key / password / secret
- [x] 無第三方 JavaScript CDN dependency
- [x] 無 `fetch()` / XHR / WebSocket 外傳賽事資料

## 6. Known residual risks

- [ ] CSP 尚未升級為 `script-src 'self'`：目前 HTML 仍有既有 inline `onclick` 等 handler。若下一階段要導入嚴格 CSP，需先將所有 inline handler 搬到 `addEventListener()`。
- [ ] GitHub Pages 同一 hostname 下不同 path 共用同一 Origin / localStorage。若未來同 hostname 放置不可信 JS 專案，建議將 football-marker 部署到獨立子網域。
- [ ] 純前端工具無法保證使用者裝置、瀏覽器擴充套件或同 Origin 其他程式沒有被入侵。

## 7. Release QA

- [x] JavaScript syntax check (`node --check`)
- [x] 所有靜態 input 欄位已盤點
- [x] `innerHTML` / dynamic attribute / localStorage / export sink 已重新盤點
- [x] 惡意文字測試字串：`"><img src=x onerror=alert(1)>`
- [x] Attribute 測試字串：`" autofocus onfocus=alert(1) x="`
- [x] CSV 測試字串：`=1+1`, `+cmd`, `-1+2`, `@SUM(A1:A2)`
- [x] Filename 測試字串：`../AUX\test:<bad>?*.csv`
