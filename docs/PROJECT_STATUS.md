# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-20 (收工同步)  
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
| **【任務 4-1 基礎】** | **Multi Pad (.PAD) 二進位結構解析與全軌屬性寫入** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`yamaha-writer.ts`](../src/core/writer/yamaha-writer.ts) | ✅ 已完成（完整支援 5 軌 SMF1 結構、`CMxxxx` / `RPxxxx` / `N1~N4` 控制標記） |

---

## 🚧 二、 當前待處理項目 (Active To-Do List)

### 🚨 【重大專案 Issue 追蹤】Multi Pad (.PAD) 和弦跟隨 (Chord Match) 小調旋律與花音走音排查（《空港》2010-1_PAD vs 2011-2_PAD 實錄）

- **Issue 編號**：`ISSUE-20261119-PAD-CHORD-MATCH`
- **問題現象與新事證 (2026-11-20 更新)**：
  1. **《空港》`2010-1_PAD.PAD`**：Pad 2 為 A 小調 9 小節完整主奏，含和聲導音 `G#5` 與旋律大六度 `F#5`，開啟 Chord Match 後因琴端硬套 CM7 母體，NTT 將導音與花音扭曲吸附，換和弦嚴重走音。
  2. **`2011-2_PAD.PAD`**：Pad 1 為 A 小調前奏 2 小節短句，僅 6 音符（`E, D, B` = 5, 4, 2 音級），**完全無三度音與導音**。
     - **實測重大現象**：在 `Chord Match = OFF` 下手彈 Cm，琴端以 Root Transpose 剛體平行平移（+3 半音），精準輸出 `G, F, D`，**轉調完全無誤**！
     - **反向驗證**：若開啟 Chord Match，琴端誤把 E 算成 C 大調大三度降為 Eb、B 算成大七度降為 Bb，輸出變成 `Eb, D, Bb`，旋律立刻崩潰。
- **已確認技術事證 (Confirmed Facts)**：
  1. **無 CASM 預設**：標準 Multi Pad 檔內通常無 CASM 區塊，琴端韌體預設強制作為 C Major (CM7) 解譯。
  2. **小調和聲導音挑戰**：原曲《空港》包含和聲小調導音 `G#4`（琴端標示為 Ab4）與旋律小調大六度 `F#4`，其音程走向為 `G# ➔ F# ➔ G# ➔ A`（全音下跳、全音回升、半音解決）。
  3. **Multi Pad 4 大音樂型態**：
     - 打擊/音效：必須 `Chord Match = OFF`。
     - 開放骨幹音短句（如 `2011-2` Pad 1）：`Chord Match = OFF` 或 `NTT = Bypass` 純根音平移即完美。
     - 伴奏織體/分解和弦：必須 `Chord Match = ON` 且 CM7 正規化。
     - 帶導音長主旋律（如 `2010-1` Pad 2）：必須注入小調專屬 CASM（`Source Chord = Minor`, `NTT = Melody / Bypass`）或維持純旋律平行平移。
- **已排除的無效解法 (Do NOT Repeat)**：
  - ❌ 齊頭式半音平移 (+3 半音至 C minor)：會造成琴端 NTT 雙重降半音。
  - ❌ 粗暴將 F# 算成 Bb4：造成小二度半音摩擦。
- **在家實體琴驗證工作流（先實機驗證，後系統整合）**：
  1. **原則**：琴端即時演算與聽感為唯一標準，待在家搭配 PSR-SX920 完整驗證後，再排程實裝到軟體系統 UI。
  2. **優先待執行項目清單（今晚回家驗收）**：
     - **項目 1（工作流免拔插加速）**：電腦以 USB-to-Host 線接 SX920，測試以 Yamaha 免費官方《Musicsoft Downloader》直接拖曳 `.PAD` 檔至琴端 Flash Memory (User 磁區)，驗證免拔插隨身碟可行性。
     - **項目 2（小調 CASM 直讀實測）**：以 `samples/2010-1_PAD_with_CASM.PAD` 載入琴端 Pad 2，手彈 Am、Cm、Em，聆聽第 8 小節導音（G#）與迴旋花音是否完美轉調不走音。
     - **項目 3（開放動機純平移實測）**：以 `samples/2011-2_PAD.PAD` 載入琴端 Pad 1，在 `Chord Match = OFF` 下手彈其他和弦（Dm、Fm），驗證純根音平移的穩定度。
     - **項目 4（後續 PAD 樣本庫收集）**：準備 1 款伴奏琶音 Pad、1 款大調旋律 Pad、1 款打擊樂 Pad，作為後續自動診斷修復器的訓練素材。

---

### 🔥 伴奏主線：【任務 2-4 進階】MIDI 切片音樂性與智慧段落升級

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
   - **目標**：自動掃描 MIDI 各小節的樂器進退場、Program Change 與音符密度，在切片介面提供一鍵選取建議區間。

---

### 📋 後續階段待辦（依 [`MASTER_ULTIMATE_EXECUTION_PLAN.md`](MASTER_ULTIMATE_EXECUTION_PLAN.md) 排序）

- **【任務 1-1】**：Phrase 1 / Phrase 2 原音直通（Root Fixed）於實體琴彈奏小和弦時之防跳八度微調（Ctb2 大小調對稱表與 HiKey 極值）。
- **【任務 0-1 & 0-2】**：USB-MIDI 官方 SysEx 傳檔協議抓包與一鍵直傳 SX920 User 磁區。
- **【任務 3-1 ~ 3-3】**：單軌編輯器樂句剪貼簿（Copy/Cut/Paste）、多音符批次編輯（Batch Inspector）、SFF-GE 吉他微調。
- **【任務 4-1A】**：Multi Pad CASM 視覺化編輯與智慧和弦轉調修復器。
