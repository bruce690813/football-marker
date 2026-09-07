# 足球場邊記錄器 v4.88 — Security Hardening

本版以 v4.87 為基礎，只進行資安強化與資料驗證收斂，**不調整既有 UI 配色、尺寸、版面與操作流程**。

## 本版資安強化

1. 所有自由文字欄位共用 `validatePlainTextValue()` 驗證器。
2. 動態 HTML Attribute 使用 `escapeAttr()` 進行 context encoding。
3. CSV 加入 Formula Injection 防護。
4. `loadState()` 改為白名單 schema/type/length sanitize，不再直接 merge localStorage。
5. 匯出檔名增加控制字元、路徑字元、Windows 保留名稱處理。
6. 可安全改用 DOM / `textContent` 的簡單 `innerHTML` 已移除；複雜結構保留 template，但所有使用者資料均經 output encoding。
7. localStorage 陣列設合理上限，避免被竄改資料造成前端 DOM / 記憶體 DoS。
8. 新增 `SECURITY_CHECKLIST.md`。

## 相容性

- 舊版 v4.x localStorage 會在載入時自動正規化為 v4.88 schema。
- 不影響既有比賽資料、比分、事件、球員名單、PK、摘要與 CSV 操作。
- 賽事名稱上限統一為 20 字；場地 15 字；隊名 15 字。

## 檔案

- `index.html`
- `README.md`
- `SECURITY_CHECKLIST.md`
