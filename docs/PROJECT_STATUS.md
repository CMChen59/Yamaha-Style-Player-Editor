# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-12  
> **使用說明**：本檔案為跨電腦（公司 ↔ 家裡）的**唯一進度基準**。凡已列入「✅ 已完成並封存」之項目，均已通過測試與實機驗證，請勿重複確認或重做；新對話開始時請直接聚焦於「🚧 當前待處理項目」。

---

## ✅ 一、 已完成並封存項目 (Completed & Locked)

| 階段 / 任務編號 | 功能與問題描述 | 核心實作檔案 | 狀態與備註 |
| :--- | :--- | :--- | :--- |
| **【任務 0-3】** | **Web MIDI 琴端真實發聲引擎 & Port 1/2 路由修復** | [`midi-manager.ts`](../src/core/audio/midi-manager.ts), [`sty-playback-engine.ts`](../src/player/sty-playback-engine.ts) | ✅ 已完成（預設鎖定 Port 1、音色回溯、CC11=127 防無聲、預排視窗 0 掛音） |
| **【任務 1-2】** | **PSR-SX920 2,395 音色庫校準與別名雙向映射** | [`yamaha-voices.ts`](../src/core/data/yamaha-voices.ts) | ✅ 已完成（含 `0-113-75` 排笛修正、`104-21-1` 新舊碼對照、GM 中文譯名） |
| **【任務 2-1】** | **MIDI 音樂檔全景透視儀表板與 16 通道檢測器** | [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`yamaha-parser.ts`](../src/core/parser/yamaha-parser.ts) | ✅ 已完成（含曲中變速積分、Big5/GBK 解碼、16 通道獨立 Solo/Mute/混音） |
| **【任務 2-2】** | **MIDI 小節區間循環試聽定位器** | [`player-app.ts`](../src/player/player-app.ts) | ✅ 已完成（支援自訂起訖小節、1~4/8/16 快速鍵、停止重設指針、防跳動獨奏鈕） |
| **【任務 2-3】** | **智慧聲部映射、主旋律排除與小節切片裝配引擎** | [`midi-part-assign-matrix.ts`](../src/core/writer/midi-part-assign-matrix.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（含純伴奏試聽自動復原、曲中生效音色回溯 `getEffectiveVoiceAtBar`、多段落累積整合至同一 STY） |
| **【任務 2-4 初版】** | **Main/Fill 段落和弦反向正規化初版 & 原曲 vs STY 實測解密** | [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`inspect-rongyi-user-midi.test.ts`](../tests/inspect-rongyi-user-midi.test.ts) | ✅ 已完成初版（解開《容易受傷的女人》1~5 節 Intro A、6~13 節 Main A、26~33 節 Intro B 7 軌齊奏規律） |

---

## 🚧 二、 當前待處理項目 (Active To-Do List)

### 🔥 優先推進：【任務 2-4 進階】MIDI 切片音樂性與智慧段落升級

1. **[待處理 A] 基準和弦模式選擇器（`CM7` 大調基準 / `Cm7` 小調基準 / 原曲直通）与樂句導音保護**
   - **背景**：目前將小調歌曲（如 Am）強制轉為 C 大調會把小三度升為大三度，失去小調哀傷靈魂；且逐小節各自平移容易切斷 8 小節連貫樂句。
   - **目標**：
     - 在切片彈窗提供三種基準模式：`CM7 大調基準`、`Cm7 小調基準（保留小三度/小七度，CASM 標記小調 Source Chord）`、`原曲進行直通（不移調）`。
     - 優化跨小節樂句的整體平移與導音連續性（Voice Leading）。

2. **[待處理 B] 段落分流智慧裝配策略（Intro/Ending 全軌齊奏 vs Main/Fill 純律動伴奏）**
   - **背景**：如《容易受傷的女人》第 26~33 小節切為 `Intro B` 時，需要連同前奏/間奏 Solo 電吉他與弦樂鋪底共 7 軌齊開；而切為 `Main A`（第 6~13 小節）時則應維持純伴奏律動，排除斷續 Solo。
   - **目標**：
     - 當目標段落選為 `Intro A~D` 或 `Ending` 時，自動切換為「全軌道大樂隊直通模式」（納入副奏/前奏 Solo 樂器，預設原曲和弦直通）。
     - 當目標段落選為 `Main A~D` 或 `Fill In` 時，維持「純伴奏律動模式」（排除主旋律與單次 Solo，開啟和弦正規化）。

3. **[待處理 C] 藉由小節樂器出入場與密度變化自動推薦段落（Auto Section Detection）**
   - **目標**：自動掃描 MIDI 各小節的樂器進退場、Program Change 與音符密度（例如自動標記出 `1~5 小節: 推薦 Intro A`、`6~13 小節: 推薦 Main A`、`26~33 小節: 推薦 Intro B`），在切片介面提供一鍵選取建議區間。

---

### 📋 後續階段待辦（依 [`MASTER_ULTIMATE_EXECUTION_PLAN.md`](MASTER_ULTIMATE_EXECUTION_PLAN.md) 排序）

- **【任務 1-1】**：Phrase 1 / Phrase 2 原音直通（Root Fixed）於實體琴彈奏小和弦時之防跳八度微調（Ctb2 大小調對稱表與 HiKey 極值）。
- **【任務 0-1 & 0-2】**：USB-MIDI 官方 SysEx 傳檔協議抓包與一鍵直傳 SX920 User 磁區。
- **【任務 3-1 ~ 3-3】**：單軌編輯器樂句剪貼簿（Copy/Cut/Paste）、多音符批次編輯（Batch Inspector）、SFF-GE 吉他微調。
- **【任務 4-1 ~ 4-3】**：Multi Pad (`.pad`) 一鍵抽取製作器、跨伴奏混搭組合器、OTS 編輯器。
