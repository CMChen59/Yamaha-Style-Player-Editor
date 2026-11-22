# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-21 (收工同步)  
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
| **【任務 2-4A】** | **基準和弦三合一模式（大調 CM7 / 小調 Cm / 原曲直通）与關係大小調弱起嗅探** | [`casm-modifier.ts`](../src/core/writer/casm-modifier.ts), [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（支援 SFF2 原廠 Cm 小調基準平行位移與 CASM `chordType=8` / Minor Table、CM7 大調、原曲直通 `Bypass`；實裝 K-S 關係大小調校驗打破 Meta 0x59 偽大調盲點，弱起前奏向後嗅探 Lookahead，解決《容易受傷的女人》Am 誤判 C 大調） |
| **【任務 2-4 初版】** | **Main/Fill 段落和弦反向正規化初版 & 原曲 vs STY 實測解密** | [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`inspect-rongyi-user-midi.test.ts`](../tests/inspect-rongyi-user-midi.test.ts) | ✅ 已完成初版（解開《容易受傷的女人》1~5 節 Intro A、6~13 節 Main A、26~33 節 Intro B 7 軌齊奏規律） |
| **【任務 4-1 基礎】** | **Multi Pad (.PAD) 二進位結構解析與全軌屬性寫入** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`yamaha-writer.ts`](../src/core/writer/yamaha-writer.ts) | ✅ 已完成（完整支援 5 軌 SMF1 結構、`CMxxxx` / `RPxxxx` / `N1~N4` 控制標記） |
| **【任務 4-1 終極】** | **Multi Pad 和弦跟隨適用邊界、固定調性鐵律與 STY 插音分工架構實機結案** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`GEMINI.md`](../GEMINI.md), `2010_空港_Intro_Am調.PAD` | ✅ 已完成並實機結案（PSR-SX920 雙向驗收：證實長旋律開 CM 必走音，CM0000 指定調性為 100% 依譜還原唯一解；插音歸 STY Phrase 聲部） |

---

## 🚧 二、 當前待處理項目 (Active To-Do List)

### 🚨 【已結案里程碑存檔】Multi Pad (.PAD) 和弦跟隨 (Chord Match) 與固定調性轉換（《空港》實測定案）

- **Issue 編號**：`ISSUE-20261119-PAD-CHORD-MATCH`
- **狀態**：**✅ 已徹底定案結案並永久封存 (2026-11-21 PSR-SX920 實機驗收通過)**
- **實機驗證結論 (Confirmed via PSR-SX920 & Balloon.S910.pad)**：
  1. **原廠黃金標準證實 (`Balloon.S910.pad`)**：
     - 原廠 Multi Pad 無 CASM 區塊。
     - 僅有第 3 軌（純 1、5 音琶音脈衝，C5 與 G5）開啟 `CM0010`。
     - 第 1、2、4 軌之旋律與切音在原廠琴端手動錄製時一律設為 `CM = OFF`，證實旋律長樂句原廠鐵律設為 OFF。
  2. **Chord Match 適用邊界與指定調性鐵律（實機雙向驗證）**：
     - **邊界確認**：Multi Pad 和弦跟隨（Chord Match）並非所有樂句皆可行。純 1、5 音琶音可開；但凡帶有內在和聲轉折（如第 7 小節前半拍 $7.6$、後半拍 $Am \to E7$ 導音花音）之長前奏/主旋律，若開 Chord Match，琴端自然小調演算法會強行拔除升記號（$G\# \to G, F\# \to F$），且小節內換和弦會撕裂旋律，純靠即時運算物理上無法成立。
     - **唯一正解**：長旋律前奏依譜 100% 原汁原味完美還原的唯一途徑，即為**「指定調性專屬 PAD (CM0000 剛體平移)」**。
  3. **實機驗收定案**：
     - 使用者在 PSR-SX920 實測 `2010_空港_Intro_Am調.PAD` 與 `2010_空港_Intro_Em原調.PAD`，確認在 `CM0000` 下發聲 100% 正確，鄧麗君原曲演歌花音與導音（$D\#5$, $C\#5$）零失真。
     - 結論與規則已正式固化至 `GEMINI.md`，作為後續系統轉調模組之唯一參考依據。

---

### 🔥 伴奏主線：【任務 2-4 進階】MIDI 切片音樂性與智慧段落升級

1. **[✅ 已完成] 基準和弦三合一模式（`CM7` 大調基準 / `Cm` 小調基準 / 原曲直通）与半小節高解析度正規化（完整保留 8 節插音）**
   - **完成成果**：
     - 已實裝 `SliceChordMode` 三大模式：`'CM_MINOR'`、`'CM7_MAJOR'`、`'ORIGINAL_PASS_THROUGH'`。
     - `CasmModifier` 支援動態配置 CASM `sourceChordRoot`、`sourceChordType` (8=Minor) 與 `NTT = Minor / Bypass / Chord / Bass`。
     - **段落起始和弦智慧分流（結合實機演奏譜驗證定案）**：
       - **Intro / Ending**：預設一律推薦**【原曲和弦直通（NTT = Bypass）】**，保持 0 移調，琴端左手單按根音（`Sync Start = C`）即可 100% 還原原汁原味前奏編曲，第 5 節木吉他自然落在 C 和弦完美銜接主歌進歌點。
       - **Main / Fill（循環律動伴奏）**：依切片起始小節代表和弦（`repChord`）分流：起點為大調（如《容易受傷的女人》第 6 節 C）自動推薦**【CM7 大調基準】**，音符 0 位移；起點為小調（如副歌 Am）自動推薦**【Cm 小調基準】**。
     - **半小節（2 拍）高解析度和弦反向正規化（`detectSubBarChords`，徹底保留 8 節呼吸感與插音）**：
       - 攻克一小節雙和弦（如第 7 節 Em-Am、第 8 節 Em-Dm）整小節統一移調導致後半節走音的痛點，以 2 拍為單位獨立分析根音與移調量。
       - 整段 8 小節 Main 伴奏與第 4 節、第 8 節之過門插音（Phrase 1/2）每一拍徹底鎖定在 CM7 大調母體上（`NTT = Melody`），琴端手彈 C ➔ Em ➔ Am ➔ Dm 轉調 100% 精準無瑕疵！
     - **Meta 0x59 大調標籤審查**：當 MIDI 宣告大調時，微弱差距堅定尊重 C Major，避免全曲副歌小調音符比重高導致大調主歌被誤套用小調移調。
     - 單元測試 `tests/test-slice-chord-modes.test.ts` 與 `tests/test-rongyi-minor-detection.test.ts` (5/5) 全數通過驗證。

2. **[✅ 已完成] 智慧起音自動偵測（First Note Offset Snapping）與拍級（Beat）精確切片升級**
   - **完成成果**：
     - `MidiSongAnalyzer` 實裝全域首音時間嗅探（`firstNoteTick`, `firstNoteBar`, `firstNoteBeat`, `leadInOffsetBeats`, `leadInOffsetTicks`）。
     - `MidiSliceAssembler` 全面升級支援拍級切片（`startBeat`, `endBeat`），切片取樣範圍以 Beat 精確咬合（如從 `Bar 1 Beat 3` 切至 `Bar 6 Beat 3`、`Bar 6 Beat 3` 切至 `Bar 14 Beat 3`）。
     - 半小節和弦反向正規化（`detectTickRangeChord`）改採切片起始時間軸（`startTickSrc`）逐小節動態對齊，半小節和弦完全對齊簡譜（`C-Em`, `Am-Em`, `Dm-Am`, `F-G`），徹底消除雙和弦走音與半小節相位差。
     - `MidiSliceAssignModal` UI 增加「起始拍（Beat）」選單與智慧弱起吸附提示徽章，自動偵測到 2 拍空拍時自動吸附至第 3 拍，亦允許手動自訂。
     - 單元與 E2E 測試 `tests/test-beat-slice-e2e.test.ts` (3/3) 全數通過驗證。

3. **[✅ 已完成] 全域主旋律優先錨定與弱起進歌音防護（Global Melody Anchor）**
   - **完成成果**：
     - 排查解決使用者於 PSR-SX920 實測《容易受傷的女人》Intro A 時，第 5 小節末端出現 2 顆主唱進歌音（G2, A2 簡譜 `˙5 ˙6`，誤入 Phrase 1）問題。
     - 根因：主唱軌（Ch 0 Soprano Sax）在 Intro 前 4 小節為 0 音符，切片區域分析誤將其降級為伴奏並分配給 Phrase 1。
     - 升級 `MidiPartAssignMatrix.createAutoMappingPlan`：實裝「全曲全域特徵」＋「切片區間特徵」雙重聯集判定。全曲識別為主唱之軌道永久保留 `isMelody = true` 且預設排除（`isExcluded = true, targetPart = null`）。
     - E2E 測試驗證 Intro A 裝配後 Phrase 1 音符為原曲伴奏（Vibraphone），主唱弱起進歌音 0 音符殘留。

4. **[✅ 已完成] CASM 段落獨立隔離機制（CSEG Section Isolation，徹底杜絕跨段落和弦污染走音）**
   - **完成成果**：
     - 排查解決使用者實測 `1122-02.sty` 時，琴端全曲調性走音錯亂問題。
     - 根因：SFF2 範本中 `Main A~D` 與 `Intro A`, `Ending A` 預設共享同一個 `CSEG 0`。當使用者切片帶有非 C 和弦之段落（例如 Ending A 起始於第 66 節 Dm，配置原曲直通 `Root = 2, Type = 8`）時，舊版 `CasmModifier` 原地覆寫 CSEG 0，將 `Main A~D` 全部的基準和弦與 NTT 竄改為 D minor Bypass，引發左手彈奏時全曲雙重移調大走音。
     - 升級 `CasmModifier.injectOrUpdateSectionCasmRule`：實裝「段落獨立剝離（CSEG Isolation）」。當更新處於多段落共享之 CSEG 時，自動將目標段落自原共享 CSEG 的 Sdec 移除，並於 CASM 末端建立該段落專屬的全新獨立 CSEG。
     - 徹底杜絕跨段落規則污染，確保 `Main A~D` 100% 保持純淨 CM7 大調，而 `Intro / Ending` 亦能獨立擁有自身直通調性。
     - 單元測試 `tests/test-casm-isolation.test.ts` (1/1) 全數通過。

5. **[當前第一優先 🚧 任務 2-4B] 段落分流智慧裝配策略（Intro/Ending 全軌齊奏 vs Main/Fill 純律動伴奏）**
   - **背景**：如《容易受傷的女人》第 26~33 小節切為 `Intro B` 時，需要連同前奏/間奏 Solo 電吉他與弦樂鋪底共 7 軌齊開；而切為 `Main A`（第 6~13 小節）時則應維持純伴奏律動，排除斷續 Solo。
   - **目標**：
     - 當目標段落選為 `Intro A~D` 或 `Ending` 時，自動切換為「全軌道大樂隊直通模式」（納入副奏/前奏 Solo 樂器，預設原曲和弦直通）。
     - 當目標段落選為 `Main A~D` 或 `Fill In` 時，維持「純伴奏律動模式」（排除主旋律與單次 Solo，開啟和弦正規化）。

4. **[後續待處理 📋 任務 2-4D] 藉由小節樂器出入場與密度變化自動推薦段落（Auto Section Detection）**
   - **目標**：自動掃描 MIDI 各小節的樂器進退場、Program Change 與音符密度，在切片介面提供一鍵選取建議區間。

---

### 📋 後續階段待辦（依 [`MASTER_ULTIMATE_EXECUTION_PLAN.md`](MASTER_ULTIMATE_EXECUTION_PLAN.md) 排序）

- **【任務 1-1】**：Phrase 1 / Phrase 2 原音直通（Root Fixed）於實體琴彈奏小和弦時之防跳八度微調（Ctb2 大小調對稱表與 HiKey 極值）。
- **【任務 0-1 & 0-2】**：USB-MIDI 官方 SysEx 傳檔協議抓包與一鍵直傳 SX920 User 磁區。
- **【任務 3-1 ~ 3-3】**：單軌編輯器樂句剪貼簿（Copy/Cut/Paste）、多音符批次編輯（Batch Inspector）、SFF-GE 吉他微調。
- **【任務 4-1A】**：Multi Pad CASM 視覺化編輯與智慧和弦轉調修復器。
