# 足球場邊記錄器 v4.69

## 本版：iPhone Safari 全場底部 Safe Area 最終 QA

### 修正目標
全場結果頁滑到最底時：
- `＋ 新比賽` 必須完整露出
- 不被 Safari 底部工具列遮住
- 按鈕與工具列之間至少保留約 12～16px 的可視安全距離

### 實作方式
1. 保留「文件流中的真實 spacer」，不使用 fixed footer 壓住內容。
2. 以 `--result-bottom-safe-tail` 統一管理全場底部安全距離。
3. 同時參考 `visualViewport` 計算出的 `--browser-bottom-gap`。
4. iOS Safari 未正確回報工具列高度時，仍有固定 fallback：
   - 一般：156px
   - ≤430px：168px
   - ≤390px：176px
   - ≤375px：200px（iPhone SE / 4.7 吋級 Safari 工具列補強）
   - 高度 ≤760px：220px（舊款 Plus / 短 viewport 補強）
5. `＋ 新比賽` 加入相同的 `scroll-margin-bottom`。
6. 全場輸出卡與尾端 spacer 之間固定保留 16px。
7. 賽前 / 比賽中 / 中場 / 下半場不做版面變更。

## QA Viewport
使用 iPhone 級 viewport 進行底部捲動測試：
- 320×568
- 375×667
- 390×844
- 393×852
- 402×874
- 414×896
- 430×932
- 440×956

並另外以 104px 的「Safari 底部工具列模擬遮蔽區」驗證：
滑到最底時 `＋ 新比賽` 仍位於遮蔽區上方至少 16px。

## 檔案
- index.html
- README.md
