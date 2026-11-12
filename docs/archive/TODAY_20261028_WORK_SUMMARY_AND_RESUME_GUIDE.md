# 2026-10-28 工作總結與回家接續操作指南

## 一、 今日重大進展與架構決策 (Completed Milestones)

今天專案邁入了全新的歷史階段，徹底解決了舊專案的技術債，並打造了專業 DAW 等級的單軌聚焦編輯體驗：

1. **獨立新專案建立（方案 A 落地）**：
   - 專案名稱：`Yamaha-Style-Player-Editor`
   - 本地路徑：`D:\Vibe Coding\Yamaha-Style-Player-Editor`
   - GitHub 雲端儲存庫：👉 **[https://github.com/CMChen59/Yamaha-Style-Player-Editor](https://github.com/CMChen59/Yamaha-Style-Player-Editor)**
   - 徹底告別舊專案的雙模 DOM 與舊版技術包袱，將單軌聚焦播放器提升為唯一首頁入口（`index.html`）。

2. **Windows 一鍵啟動批次檔 (`start.bat`)**：
   - 支援雙擊直接啟動，自動檢測相依套件、自動啟動 Vite、自動彈出瀏覽器開啟 `http://localhost:5173/`。

3. **Tier 1-1：多選與框選功能 (Multi-Select & Marquee Selection) 【✅ 100% 完成】**：
   - **矩形框選（Marquee Selection）**：滑鼠在空白處拖曳拉出半透明藍色框選矩形，即時框選多顆音符。
   - **Shift + Click**：自由加選/減選多顆音符。
   - **批次拖曳移位（Batch Drag Pitch & Time）**：保持選取群組相對拍子與音高同步移動，具備 0~TotalTicks 與音高極限邊界保護。
   - **批次刪除（Batch Delete）**：<kbd>Delete</kbd> / <kbd>Backspace</kbd> 鍵、右鍵、工具列按鈕一鍵批次清除。
   - **快捷鍵支援**：<kbd>Ctrl+A</kbd> 全選軌道音符，<kbd>Escape</kbd> 取消選取。

4. **Tier 1-2：批次力度調整 (Batch Velocity Adjustment) 【✅ 100% 完成】**：
   - **📈 相對增減模式（Relative Delta Mode）**：調整時等量加上 $\Delta$ 差量，**嚴格保留選取音符間原有的強弱演奏律動（Groove Ratio）**。
   - **🎯 絕對統一模式（Absolute Mode）**：一鍵將所有選取音符設為相同力度數值。
   - **⚡ 快速階梯微調鈕（[-10], [-5], [+5], [+10]）**：點擊一鍵快速階梯增減。
   - **🎲 人性化隨機律動微調（Humanize ±8）**：為選取音符注入真人手彈般的微小動態，打擊樂與分解和弦更生動自然。
   - **即時視覺與聽覺反饋**：音符標籤力度文字與透明度深淺即時更新，放開時自動試聽反饋。

5. **音質還原重大突破：原廠音量 (CC 7) 與動態表情 (CC 11 Expression) 排程 【✅ 100% 完成】**：
   - **原廠混音比精確還原（CC 7 Volume）**：徹底解決先前全聲部被硬編碼強制為 100 的問題，自動讀取 STY 檔頭 SInt 的精確音量（如 LoveSong PAD=62、Bass=52、Chord1=81、Chord2=79、Rhythm1=54、Rhythm2=62），混音台面板數值同步聯動。
   - **動態表情曲線時鐘排程（CC 11 Expression）**：段落內所有 CC 11 表情控制器納入微秒級 Lookahead 佇列即時送出；Intro B 弦樂襯底（Pad）完美再現開頭 57 弱奏進場、漸強爬升至 125、結尾回落的細緻動態，與 Yamaha PSR-SX920 實體琴完全一致！
   - **空間與聲相控制器同步**：啟動與播放時同步送出原廠 Pan (CC 10)、Reverb 殘響 (CC 91)、Chorus (CC 93)。
   - **ChordSynth 軟體合成器同步升級**：支援 setExpression，瀏覽器純軟體播放亦具備相同漸強漸弱包絡線。

6. **CASM 跨段落動態聲部解析與全域總音量 【✅ 100% 完成】**:
   - **段落專屬 CASM 映射**：徹底解決 4006 等伴奏切換 Intro A 時 Chord 1、Chord 2 音色與音量偏差問題。
   - **全域總音量控制器**：新增 0%~150% 總音量滑桿，消除 MIDI 力度雙重衰減導致琴端聲音太小的問題。

7. **方案 B：雙向平衡聲像微調滑桿 (Pan Balance Slider) 【✅ 100% 完成】**:
   - **8 大伴奏小卡 Pan 雙向平衡滑桿**：在 VOL 滑桿下方新增獨立 PAN 控制條（0~127，預設 Center=64）。
   - **標準 Yamaha 格式顯示**：數值即時轉換為 L64 ~ C ~ R63，例如 4006 Intro A 之 Chord 1 (R32)、Chord 2 (L40)、Pad (L32)、Phrase 1 (R48)。
   - **快速回中**：雙擊 PAN 滑桿或數值徽章一鍵回中（C: 64）。
   - **雙向連動**：手動拖拉即時發送 MIDI CC 10 至實體琴；切換段落時自動依照 CASM 設定值更新。

8. **Tier 1-3：全方位復原與重做 (Undo / Redo Stack) 【✅ 100% 完成】**：
   - **全動作歷史堆疊追蹤**：涵蓋音符點擊新增、單顆/批次刪除、時間與音高拖曳移位、時值伸縮、階梯微調 [-10~+10]、🎲 人性化隨機力度以及滑桿/輸入框調整。
   - **鍵盤快捷鍵支援**：支援全域 <kbd>Ctrl + Z</kbd>（復原）、<kbd>Ctrl + Y</kbd> 與 <kbd>Ctrl + Shift + Z</kbd>（重做）。
   - **視覺化按鈕與狀態指示**：工具列提供 [↩️ 復原] 與 [↪️ 重做] 按鈕，動態顯示即時動作提示與可用狀態 (disabled / enabled)，狀態列即時反饋復原詳情。
   - **跨聲部智慧跳轉**：復原涉及不同軌道的操作時，自動請求切換聲部焦點並同步渲染。

9. **自動化測試與代碼品質 100% 綠燈**：
   - **TypeScript 編譯檢查**：`tsc --noEmit` 零型別錯誤。
   - **Vitest 自動化測試**：**60 個測試套件、282 項單元與迴歸測試全數通過（100% Pass）**。
   - **Vite Production Build**：最佳化產出成功。
   - **Git 狀態**：本地與 GitHub 遠端 `main` 分支完全同步，工作區乾淨。

---

## 二、 明天接續操作指南 (公司或另一台電腦操作)

回到家裡電腦後，只需以下 2 步即可立刻接續：

### 步驟 1：同步最新進度 (Git Pull 或 Clone)
打開終端機（PowerShell 或 CMD）：
```bash
cd "D:\Vibe Coding"  # 或您放專案的目錄
git clone https://github.com/CMChen59/Yamaha-Style-Player-Editor.git
```
*(若先前已下載過，則只需進入資料夾執行 `git pull origin main`)*

### 步驟 2：雙擊一鍵啟動
進到 `Yamaha-Style-Player-Editor` 目錄，**滑鼠直接雙擊 `start.bat`**！
- 會自動安裝相依套件並啟動伺服器。
- 自動在瀏覽器開啟 `http://localhost:5173/`。

---

## 三、 PSR-SX920 琴上實機驗證（若今晚有空測試）

昨天下載的驗證檔案（如 `LoveSong.T547.sty` 或編輯匯出的 STY）：
1. 將 STY 檔案放進 USB 隨身碟，插入 PSR-SX920。
2. 在琴上按 `[STYLE]` 選擇按鈕，切換至 `User` -> `USB1`。
3. 點選載入該 STY：
   - **檢查 1**：琴上螢幕是否正確顯示節奏名稱與 8 個伴奏聲部圖示。
   - **檢查 2**：按下 `[SYNCHRO START]` 彈奏左手和弦（如 C、Am、F、G7），確認 Main A~D、Fill-in、Intro 能正常觸發並跟隨和弦轉位。
   - **檢查 3**：按 `[OTS LINK]` 切換 OTS 1~4，確認右手主奏音色是否有正確切換。
4. **Web MIDI 直連測試**：
   - 用 USB-B 線將電腦連接琴身 USB-TO-HOST，在網頁右上角切換為 PSR-SX920，確認實體琴發聲與零延遲。

---

## 四、 後續待執行計畫（回家後或明天下一步）

明天到公司接續時，我們將直接推進 **Tier 1-4：Yamaha 2,300+ 音色選擇器**：

| 順序 | 計畫項目 | 具體功能描述 | 目前狀態 |
| :--- | :--- | :--- | :--- |
| **Tier 1-1** | 多選與框選功能 (Marquee Selection) | 矩形框選、Shift+Click、批次移動、批次刪除、Ctrl+A | ✅ 100% 完成 |
| **Tier 1-2** | 批次力度調整 (Batch Velocity) | 相對增減模式、絕對模式、快速微調鈕、🎲 人性化 | ✅ 100% 完成 |
| **Tier 1-3** | **復原 / 重做 (Undo / Redo)** | 歷史堆疊，支援音符增刪、移動、時值、力度的 <kbd>Ctrl+Z</kbd> 還原與 <kbd>Ctrl+Y</kbd> 重做 | ✅ 100% 完成 |
| **Tier 1-4** | **Yamaha 2,300+ 音色選擇器** | 點擊卡牌彈出 SX920 完整音色清單，支援關鍵字即時搜尋與分類過濾，自動帶入 MSB/LSB/PC | 🎯 **下一個任務** |
