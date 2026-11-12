# Yamaha Style Player & Editor 工作成果與後續推進計畫

**紀錄日期**：2026-10-31  
**適用琴型**：Yamaha PSR-SX920 / Genos / Tyros 系列伴奏檔（SFF1 / SFF2）

---

## 一、 今日已完成核心里程碑總覽（實體驗證 100% OK）

今日我們完成了兩大突破性關鍵功能（**計畫 A** 與 **計畫 B**），並於實體 **Yamaha PSR-SX920 數位工作站電子琴** 上雙向實機驗收通過！

1. **🎹 Web MIDI 實體琴鍵步進錄音（Step Recording）**
   - 與 PSR-SX920 連線，在單軌編輯器點擊 `[🔴 步進錄音]` 展開專屬工作列。
   - 支援以琴鍵彈奏音符與和弦即時寫入、自動量化（1/16、1/8、1/4 拍等）。
   - 支援全鍵盤快捷鍵：
     - `空白鍵 (Space)`：插入休止符。
     - `T 鍵`：延音（`⁀ 延音 Tie (T)`，高對比天藍色按鈕，延長前一音符時值 1 步）。
     - `Backspace`：退回上一步。
     - `Home`：游標回到段落起點。

2. **🎼 虛擬和弦即時轉調測試條（Chord Audition Bar）**
   - 支援 12 個調性根音與 6 種和弦類型（Maj, Min, 7, m7, maj7, dim）。
   - 播放中點擊即可即時轉調，隨時驗證伴奏在不同調性下的聽覺效果。

3. **🎯 智慧樂器屬性識別轉調（Instrument-Aware Transposition）**
   - 擺脫傳統「以 Channel 編號硬性分類」的限制，改以「真實樂器屬性（Bank MSB & Voice Category）」判定。
   - 旋律樂器隨和弦轉調，打擊樂器自動啟用 Bypass 保護鼓點不走音。

4. **🚀【計畫 A 實作完成】：空白未啟用軌道「一鍵啟用新聲部」與增量 CASM 注入**
   - **問題排查**：分析《容易受傷的女人.sty》在啟用 Intro A 的 CH 13 時，全部 CH 被啟用且 CH 15 內容跑位之問題。
   - **根本原因**：舊版啟用邏輯呼叫了重置全域 CASM 的函式，導致既有 4,025 bytes 的段落專屬 CSEG 與 Ctb2 被全數清空覆蓋。
   - **解決方案（增量注入 Incremental CASM Injection）**：
     - 在 `casm-modifier.ts` 實作 `injectOrUpdateSectionCasmRule` 與 `buildCtb2Subchunk`。
     - 精確保留原檔既有的所有 CSEG、Sdec 與其他軌道的 Ctb2，僅對目標段落（如 Intro A）之目標通道（如 CH 13）增量追加 47 bytes 的 Ctb2 伴奏規則。
     - 智慧判斷樂器類別自動賦予 SFF2 轉調演算法（Chord / Melody / Bass / Bypass）。
   - **驗收結果**：實體 PSR-SX920 琴端載入驗證，原本各軌音色 100% 保持不動，新增之 CH 13 完美發聲。

5. **🎛️【計畫 B 實作完成】：CC 控制器自動化控制線（Automation Lanes）**
   - **多控制器支援**：支援 CC 11 表情（Expression）、CC 7 音量（Volume）、CC 10 聲像（Pan）、CC 1 顫音（Modulation）、CC 64 延音（Sustain）。
   - **可視化 SVG 畫布**：
     - 具備 127/96/64/32/0 水平刻度線、小節拍子垂直格線、半透明局部漸層面積填充。
     - 支援滑鼠點選加點（自動網格吸附）、拖曳平滑調整、右鍵刪除節點。
   - **快捷曲線預設**：提供 📈 漸強（40→127）、📉 漸弱（127→35）、〰️ 平滑（三點移動平均）、🔄 重設。
   - **捲動與游標互鎖**：單軌鋼琴捲軸與自動化控制線 100% 雙向水平捲動互鎖，播放游標 60FPS 平滑同步。
   - **全系統連動與即時監聽**：
     - 拖曳調值時，即時透過 Web MIDI 發送 CC 至 PSR-SX920，音箱即刻發出強弱變化。
     - 完整納入 `Ctrl+Z` 復原與 `Ctrl+Y` 重做歷史堆疊。
     - 即時呼叫 `replaceSectionChannelCCEvents` 寫入 SMF Track 0 並重算 Delta-times。
   - **驗收結果**：實體 PSR-SX920 琴端拉聲音大小/表情動態已實機確認 100% 正常。

---

## 二、 測試與建置狀態

- **單元與整合測試**：`86 passed (86)` 測試檔案，`396 passed (396)` 測試全數通過（含新增之 `test-automation-lanes.test.ts` 與 `test-incremental-casm-activation.test.ts`）。
- **TypeScript 型別檢查**：`npx tsc --noEmit` 0 錯誤。
- **生產環境打包**：`npm run build` 成功建置。

---

## 三、 目前 Roadmap 推進狀態與後續推進計畫

| 編號 | 計畫名稱 | 核心內容 | 狀態 |
| :--- | :--- | :--- | :---: |
| **計畫 A** | **空白軌道一鍵啟用（Add Track & Auto CASM）** | 為原本未使用的 CH 自動補齊音色、混音與 CASM 轉調規則（增量注入 Ctb2 且不覆蓋現存區塊），自由填滿 8 個伴奏聲部。 | ✅ **已完成，實體 PSR-SX920 驗證 OK** |
| **計畫 B** | **動態表情曲線與 CC 編輯（Automation Lanes）** | 在單軌鋼琴捲軸下方新增專業 CC 自動化控制線（CC 11 Expression、CC 7 Volume、CC 10 Pan、CC 1 Mod、CC 64 Sustain），支援可視化加點/拖曳、漸強/漸弱預設曲線、雙向捲動同步、Undo/Redo 與即時監聽。 | ✅ **已完成，實體 PSR-SX920 驗證 OK** |
| **計畫 C** | **混音台進階空間效果器（Reverb & Chorus）** | 擴充 8 軌混音小卡的 CC 91（殘響深度）與 CC 93（合唱深度）即時調控與 STY 回寫。 | ⭐⭐ 待推進 |
| **計畫 D** | **智慧和弦進行推進器（Chord Progression）** | 排定 4~8 小節和弦進行（如 `| C | G | Am | F |`），播放時自動隨小節推進和弦。 | ⭐⭐ 待推進 |

---

## 四、 下次接續指南（How to Resume）

下次啟動對話時，只需輸入以下指令或直接說明：
- 「**繼續執行計畫 C**」（為 8 聲部混音盤加入 Reverb & Chorus 空間效果調控）
- 或「**繼續執行計畫 D**」（實作多小節和弦進行自動輪播功能）
- 開發環境指令：
  - 啟動開發伺服器：`npm run dev`
  - 執行全套測試：`npx vitest run`
  - 專案打包建置：`npm run build`
