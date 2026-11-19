# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-19 (收工同步)  
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

### 🚨 【重大專案 Issue 追蹤】Multi Pad (.PAD) 和弦跟隨 (Chord Match) 小調旋律與花音走音排查（《空港》2010-1_PAD 實錄）

- **Issue 編號**：`ISSUE-20261119-PAD-CHORD-MATCH`
- **問題現象**：
  1. 載入原始 Multi Pad（如《空港》`2010-1_PAD.PAD`），Pad 2 為 A 小調主奏插音，在 PSR-SX920 開啟 Chord Match 後，原調 Am 正常，但換成 Em 調後旋律完全走音變形。
  2. 若將樂句強行做齊頭式 +3 半音平移，會因產生 `Eb`、`Ab` 而引發琴端 NTT「雙重小調降音（Double Minor Distortion）」，彈 Am 也走音。
  3. 若將音階正規化至 C 大調母體（`G, E, F, G, C, E, D, C, A`），第 8 小節尾奏花音若誤算為 `Bb4` 會造成半音摩擦（已排除）；但即使修正為全音 `B4 ➔ A4 ➔ B4 ➔ C5` 後，使用者實機聆聽**依然覺得聽感不對**。
- **已確認技術事證 (Confirmed Facts)**：
  1. **無 CASM 預設**：標準 Multi Pad 檔內通常無 CASM 區塊，琴端韌體預設強制作為 C Major (CM7) 解譯。
  2. **小調和聲導音挑戰**：原曲《空港》包含和聲小調導音 `G#4`（琴端標示為 Ab4）與旋律小調大六度 `F#4`，其音程走向為 `G# ➔ F# ➔ G# ➔ A`（全音下跳、全音回升、半音解決）。
  3. **NTT 降格現象**：當以 C 大調自然音 `B ➔ A ➔ B ➔ C` 寫入時，琴端在演奏 Am 時，其內部 NTT 極可能將 B 轉為 **G 自然音（小七度）**、將 A 轉為 **F 自然音（小六度）**，導致原本的調式導音被降格為自然小調（`G ➔ F ➔ G ➔ A`），或在轉調時非三和弦音被強制吸附。
- **已排除的無效解法 (Do NOT Repeat)**：
  - ❌ 齊頭式半音平移 (+3 半音至 C minor)：會造成琴端 NTT 雙重降半音。
  - ❌ 粗暴將 F# 算成 Bb4：造成小二度半音摩擦。
- **後續待攻關核心方向**：
  1. **方向一（CASM 區塊實機驗證）**：測試讓 Multi Pad 攜帶標準 SFF2 CASM 區塊（`Source Root = 9 (A)`, `Source Chord Type = 8 (Minor)`, `NTT = Melody`，檔案 `samples/2010-1_PAD_with_CASM.PAD`），測試 PSR-SX920 是否能像讀取 STY 伴奏一樣，直接以 Am 為母體原音平移，徹底擺脫 C 大調約束！
  2. **方向二（琴端 NTT 導音映射逆向工程）**：深入分析 Yamaha 琴端在無 CASM 情況下，NTT 是依據何種對照表將 1~7 度轉至目標和弦（特別是小調的和聲導音處理）。

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
