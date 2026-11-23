# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-22 (今日全部重大關鍵修復圓滿結案：起拍邊界音過濾、副歌鈸音/Pad NTT 修正、Intro B/Ending A 殘留與 819 幽靈 CC11 淨化、起拍標準事件優先級、Fill In 過門聲部鏡像與 Auto Fill In 機制實機大驗收通過)  
> **使用說明**：本檔案為跨電腦（公司 ↔ 家裡）的**唯一進度基準**。凡已列入「✅ 已完成並封存」之項目，均已通過測試與實機驗證，請勿重複確認或重做；新對話開始時請直接聚焦於「🚧 當前待處理項目」。

---

## ✅ 一、 已完成並封存項目 (Completed & Locked)

| 階段 / 任務編號 | 功能與問題描述 | 核心實作檔案 | 狀態與備註 |
| :--- | :--- | :--- | :--- |
| **【任務 0-3】** | **Web MIDI 琴端真實發聲引擎 & Port 1/2 路由修復** | [`midi-manager.ts`](../src/core/audio/midi-manager.ts), [`sty-playback-engine.ts`](../src/player/sty-playback-engine.ts) | ✅ 已完成（預設鎖定 Port 1、音色回溯、CC11=127 防無聲、預排視窗 0 掛音） |
| **【任務 1-1】** | **Phrase 1/2 與全段落走音根因徹底解決（CSEG 段落隔離 + 直通 Root 鎖定 C + 半小節正規化）** | [`casm-modifier.ts`](../src/core/writer/casm-modifier.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts) | ✅ 已完成並實機結案（取代早期 `Root Fixed / HiKey` 舊假設；以 CSEG 獨立剝離、直通 Root=0 鎖定 C、三和弦鋪底 `NTT=Chord` 與半小節正規化徹底根除走音） |
| **【任務 1-2】** | **PSR-SX920 2,395 音色庫校準與別名雙向映射** | [`yamaha-voices.ts`](../src/core/data/yamaha-voices.ts) | ✅ 已完成（含 `0-113-75` 排笛修正、`104-21-1` 新舊碼對照、GM 中文譯名） |
| **【任務 2-1】** | **MIDI 音樂檔全景透視儀表板與 16 通道檢測器** | [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`yamaha-parser.ts`](../src/core/parser/yamaha-parser.ts) | ✅ 已完成（含曲中變速積分、Big5/GBK 解碼、16 通道獨立 Solo/Mute/混音） |
| **【任務 2-2】** | **MIDI 小節區間循環試聽定位器** | [`player-app.ts`](../src/player/player-app.ts) | ✅ 已完成（支援自訂起訖小節、1~4/8/16 快速鍵、停止重設指針、防跳動獨奏鈕） |
| **【任務 2-3】** | **智慧聲部映射、主旋律排除與小節切片裝配引擎** | [`midi-part-assign-matrix.ts`](../src/core/writer/midi-part-assign-matrix.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（含純伴奏試聽自動復原、曲中生效音色回溯 `getEffectiveVoiceAtBar`、多段落累積整合至同一 STY） |
| **【任務 2-4A】** | **基準和弦三合一模式（大調 CM7 / 小調 Cm / 原曲直通）与關係大小調弱起嗅探** | [`casm-modifier.ts`](../src/core/writer/casm-modifier.ts), [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（支援 SFF2 原廠 Cm 小調基準平行位移與 CASM `chordType=8` / Minor Table、CM7 大調、原曲直通 `Bypass`；實裝 K-S 關係大小調校驗打破 Meta 0x59 偽大調盲點，弱起前奏向後嗅探 Lookahead，解決《容易受傷的女人》Am 誤判 C 大調） |
| **【任務 2-4 初版】** | **Main/Fill 段落和弦反向正規化初版 & 原曲 vs STY 實測解密** | [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`inspect-rongyi-user-midi.test.ts`](../tests/inspect-rongyi-user-midi.test.ts) | ✅ 已完成初版（解開《容易受傷的女人》1~5 節 Intro A、6~13 節 Main A、26~33 節 Intro B 7 軌齊奏規律） |
| **【任務 2-4C 終極】** | **全自動切片深層淨化管線、標準事件優先級與過門聲部鏡像 (實機驗收通過)** | [`style-modifier.ts`](../src/core/writer/style-modifier.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`GEMINI.md`](../GEMINI.md) | ✅ 已完成並實機驗收（邊界音過濾、副歌鈸音/Pad NTT 修正、消除 819 幽靈 CC11、事件標準優先級重整、Fill In 鏡像與 Auto Fill In 無縫切換，琴端表現與原廠一致） |
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

5. **[✅ 已完成] CASM 原曲直通段落基準根音全域鎖定 C (PitchClass 0) 機制**
   - **完成成果**：
     - 排查解決使用者實測 `1122-03.sty` 時，`Intro B`（間奏電吉他）與 `Ending A`（尾奏）調性跑掉走音問題。
     - 根因：原曲直通模式（`ORIGINAL_PASS_THROUGH` / NTT = Bypass）下，音符在 MIDI 中本就是原汁原味零移調。舊版誤將 CASM `sourceChordRoot` 設為切片起點和弦（如 Intro B 與 Ending A 起點皆為 Dm，設為 `Root = 2`）。當演奏者左手以 `Sync Start = C (Root = 0)` 觸發時，琴端計算 `0 - 2 = -2` 半音，硬生生將全段音高降低 2 半音導致嚴重偏音。
     - 升級 `MidiSliceAssembler`：所有直通段落 CASM 基準根音鐵律一律寫入 `sourceChordRoot = 0 (C), sourceChordType = 0 (Major)`。琴端以 C 觸發時移調量 `0 - 0 = 0`，100% 還原原曲真實音高！已手動修正產出 `1122-03-fixed.sty` 提供使用者實測驗證通過。

6. **[✅ 已完成] 範本幽靈表演控制器與淡出曲線隔離清除 ＆ 來源 MIDI 真實表情動態繼承**
   - **完成成果**：
     - 排查解決使用者實測 `Intro B`（間奏電吉他）到了後半段聲音嚴重變小聲的問題。
     - 比對 Yamaha 官方切片檔案（`容易受傷的女人.sty`）：官方切片中吉他音量始終飽滿且具有濃烈搖滾顫音，無任何淡出。
     - 根因定位：舊版切片覆寫音軌時僅刪除舊音符（`NoteOn/NoteOff`），未清除舊範本（`CHINA Ballad.T547.sty`）中內嵌的結尾漸弱淡出曲線（整段殘留高達 **850 個幽靈 CC11 表情淡出事件**，吉他自第 5 小節起被強行暴跌至 41 音量）與舊彎音。
     - 升級架構：
       1. `YamahaStyleModifier.replaceSectionChannelNotes`：結合段落專屬 CASM 路由與 SFF1/SFF2 雙向鏡像通道表，徹底清除該聲部在該段落內部的所有舊表演控制器（`CC11`、`CC1`、`CC64` 等）與舊彎音；段落開頭強制發送 `CC11 = 127` 保證表情全開。
       2. `MidiSliceAssembler`：提取來源 MIDI 之真實表演動態（如電吉他的真實 CC1 搖桿顫音 Modulation 152 顆與彎音），依時間軸縮放後同步注入伴奏軌。
     - 單元測試 `tests/e2e-slice-intro-b-fixed.test.ts` (1/1) 全數通過；已產出全新無損檔案 `1122-04.sty` 供琴端驗收。

7. **[✅ 已完成] 切片起點跨小節邊界殘留音過濾（Boundary Bleed Note Elimination）**
   - **完成成果**：
     - 排查解決使用者實測 `Main A`（以及各 Main 段落）在開頭前 1~2 小節聽感怪異問題。
     - 二進位比對定位：舊版切片時，前一小節（或前一段落）尾端尚未閉合之殘留音（`startAbsTick < startTickSrc`），被截斷起訖點後強制塞入新段落第 1 拍（`rel = 0`）。導致 Main A 第 1 拍吉他重疊撞出兩顆音（Note 60 vel 103 + Note 64 vel 85 雙重爆音）、Main C 第 1 拍撞出前段殘留的 F 和弦（Note 65, 69）、Main D 第 1 拍撞出高音怪音（D6, E6）。
     - 升級架構：`MidiSliceAssembler.pushExtractedNote` 實裝「切片起點邊界殘留音過濾鐵律」：凡在切片起點前即已發音之音符，一律直接排除，絕不人為重新觸發 NoteOn。
     - 單元測試 `tests/test-main-a-bleed.test.ts` (1/1) 通過（Main A 開頭吉他精準只留 1 顆純正 C4 音符）；`tests/generate-1122-05.test.ts` (1/1) 通過；產出 `1122-05.sty` 交付驗收。

8. **[✅ 已完成] 副歌 Main C / Main D 鈸音幽靈殘留與和弦聲部 NTT 修正（Chorus Crash Cymbal Bleed & Pad NTT Rule）**
   - **完成成果**：
     - 排查解決使用者實測 `1122-05.sty` 時反應「Main A 的起拍問題有改善，但 Main C 的起拍仍然沒改善」之問題。
     - 比對 Yamaha 官方切片檔案（`容易受傷的女人.sty`）與來源 MIDI 深入定位：
       1. **起拍爆音根因（Crash Cymbal Bleed）**：來源 MIDI 於第 33 小節第 4.5 拍（即副歌起點前半拍）有進入副歌之過門鈸音（`Ch 9 Note 49 Crash Cymbal 1 vel=112`）與雙重掛留音（`Ch 11 Note 60 C4 vel=85`）。因跨界音符截斷時強壓至 `rel = 0`，且前版 `1122-05` 僅過濾了 Note 65/69，遺漏了 `Note 49 (Crash Cymbal)` 與 `Ch 11 Note 60`。導致 Main C 起拍每當觸發或循環重播時，第 1 拍必有刺耳突兀的 Crash 爆音；Main D 亦有相同之 `Ch 9 Note 49 vel=110` 殘留。Yamaha 原廠伴奏在 Main C / Main D 的 `rel = 0` 處 100% 無 Note 49！
       2. **副歌伴奏走音根因（Pad NTT Melody 誤配）**：Main C 與 Main D 之弦樂長音/鋪底和弦（Pad，包含 C3-E3-G3 三和弦）被分配至 Phrase 1（Ch 14），其 CASM 預設被配置為單音旋律規則 `NTT = Melody`。當使用者在琴端換和弦（如彈 Am）時，NTT Melody 依旋律音程扭曲三和弦音高，導致副歌伴奏起拍出現嚴重走味。
     - **修復成果**：
       1. 徹底清除 Main C 與 Main D 在 `rel = 0` 的 Note 49 Crash Cymbal（vel 112 / vel 110）及其對應之 NoteOff，並清除 Main C 重疊之 Ch 11 Note 60，使 Main C/D 起拍純淨度與 Yamaha 原廠 100% 一致。
       2. 透過 `CasmModifier.injectOrUpdateSectionCasmRule` 將 Main C / Main D 之 Ch 14（Phrase 1）與 Main B 之 Ch 15 的 CASM NTT 修正為 `Chord`（三和弦鋪底正確跟隨和弦轉調）。
       3. 單元測試 `tests/generate-1122-06.test.ts` (1/1) 全數通過；產出 `tests/1122-06-clean.sty` 並同步複製至 `C:\Users\CM\Downloads\1122-06.sty` 交付琴端驗收！

9. **[✅ 已完成] Intro B / Ending A 起拍殘留撞音、起拍大鈸爆音與舊範本 819 顆幽靈 CC11 深層淨化（產出 1122-07.sty 並固化至底層切片引擎）**
   - **完成成果**：
     - 排查解決使用者實測 `1122-06.sty` 時反應「Intro B 開頭感覺怪怪的」與「Ending A 是否也有相同現象」之問題。
     - 逐 Tick 微觀數據比對定位：
       1. **Intro B 開頭撞音與爆音**：
          - Ch 11（Chord 1 鍵盤）在第 1 拍（`rel = 0`）除正常 Dm 音符外，同時殘留了 3 顆來自前一段（Am）的切片截斷音（`Note 69 A4, Note 72 C5, Note 76 E5`，長度 80~160 ticks）。琴端按下時第 1 拍同時敲響 Dm＋Am 產生瞬間和聲二度撞音！
          - Ch 9（鼓組）在第 1 拍爆出高達 110 力度之 `Note 49 (Crash Cymbal 1)` 碎音鈸，破壞前奏開場層次感（Yamaha 原廠在此處只有大鼓＋閉鈸）。
       2. **Ending A 開頭雜音與幽靈淡出**：
          - Ch 14 在第 1 拍殘留 1 顆 40-Tick（10ms）短音 `Note 69 A4` 點擊雜音。
          - 段落內部殘留了 **多達 819 顆** 來自舊範本（`CHINA Ballad.T547.sty`）的幽靈 CC11 表情淡出曲線，開頭即被壓在 125/97。Yamaha 原廠伴奏之 CC11 數量為 0！
     - **底層核心引擎固化（無需原廠 STY 亦能自動免疫）**：
       1. `YamahaStyleModifier.clearSectionNotes`：升級為「全段落控制器深層淨化（Deep Purge）」，段落初始化時徹底清除舊範本殘留之音符、彎音與所有幽靈表演控制器（CC11、CC1、CC64）。
       2. `MidiSliceAssembler.pushExtractedNote`：
          - 實裝「起拍 Crash Cymbal 淨化規則」：伴奏循環（Main A~D）與前奏第 1 拍自動排除 Note 49/57 大碎音鈸。
          - 實裝「微短切片毛邊過濾規則」：第 1 拍長度小於 60 ticks（15ms）之非音樂性切片毛邊一律自動排除。
     - 單元測試 `tests/generate-1122-07.test.ts` (1/1) 通過；`tests/verify-direct-midi-slice-identical.test.ts` (1/1) 驗證全新從 MIDI 切片產出結果 100% 相同；產出 `tests/1122-07-clean.sty` 並同步複製至 `C:\Users\CM\Downloads\1122-07.sty` 交付驗收！

10. **[✅ 已完成] 段落起拍標準事件優先級與舊範本幽靈表情清除（解決 Main A/B/C/D 第 1 小節第 1 拍起拍怪異，交付 1122-08.sty 並固化至底層切片引擎）**
    - **完成成果**：
      - 排查解決使用者實測 `1122-07.sty` 時反應「Main A/B/C/D 的第一拍的第一小節還是很奇怪，第二拍、第三拍完全正常」之問題。
      - 逐拍數據比對（第 1 小節第 1 拍 vs 第 2、3 拍，以及比對 Yamaha 原廠伴奏）：
        1. **致命事件順序顛倒（Event Inversion Bug）**：在各 Main 段落起拍（`rel = 0`），`NoteOn` 早於 `Bank MSB/LSB (CC0/CC32)`、`Program Change (PC)` 與 `音量 (CC7)` 發送！Yamaha PSR-SX920 琴端音源晶片在 NoteOn 剛發聲瞬間立刻收到換樂器與跳音量指令，造成 DSP 重新初始化該通道聲音，引發起音瞬間窒息卡頓、雜音與相位錯位。而第 2、3 拍沒有 PC/Bank 事件，故完全自然發聲！
        2. **舊範本伴奏聲部殘留幽靈 CC11 曲線**：Ch 13 與 Ch 15 在第 1 拍被壓制在半音量（53~69），隨後在第 2、3 拍暴衝，造成呼吸感錯亂。
      - **底層核心架構升級**：
        1. `YamahaStyleModifier.getMidiEventPriority`：定義同 Tick 標準 MIDI 事件優先級（`Meta` ➔ `NoteOff` ➔ `SysEx` ➔ `CC0/32` ➔ `PC` ➔ `CC7/10/11` ➔ `其他 CC/PitchBend` ➔ `NoteOn`）。
        2. `YamahaStyleModifier.sanitizeAllSectionsEventOrderAndControllers`：全面清除伴奏軌中的舊範本幽靈 CC11/CC1/CC64 曲線，並依優先級重新排序所有同 Tick 事件。
        3. 單元測試 `tests/test-event-priority-and-cleanse.test.ts` (1/1) 通過（全段落違規事件與幽靈 CC11 均歸零）；產出 `tests/1122-08-clean.sty` 並同步複製至 `C:\Users\CM\Downloads\1122-08.sty` 交付驗收！

11. **[✅ 已完成] Fill In 過門聲部鏡像與琴端 Auto Fill In 無縫切換實機驗收定案**
    - **完成成果**：
      - 排查解決使用者實測 `1122-08.sty` 時反應「在 Main A 結束進 Main B 前按下 Main B，有時過門會被中斷，Main C/D 亦同」之問題。
      - 深度定位：
        1. 伴奏檔中舊範本之 `Fill In` 聲部殘缺（缺少鋼琴 Ch 11），且琴端開啟 `[AUTO FILL IN]` 時按下 Main B 會強制跳進 `Fill In BB`，導致原曲 Main A 第 8 小節鋼琴過門被掐斷。
        2. Yamaha 琴端韌體在第 4 拍後半拍（> 4.5 拍）按下時會觸發超時靜音截斷保護（Time Window Expired）。
      - 鐵律定案：所有 Fill In 段落必須與 Main 聲部完全鏡像對齊；使用者在 PSR-SX920 實測將 `Fill In AA / BB / CC / DD / BA` 補齊原曲過門後，回報「**確實補齊 Fill In 後幾乎和原廠的一模一樣了**」，圓滿完成實機演奏大驗收！

12. **[當前第一優先 🚧 任務 2-4B 收尾] 段落分流智慧聲部自動納入（Intro/Ending 副奏 Solo 自動勾選 vs Main/Fill 純律動伴奏）**
   - **已完成部分**：在 [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) 中，切換 `Intro / Ending` 已自動推薦 `ORIGINAL_PASS_THROUGH (原曲和弦直通，NTT = Bypass)`；切換 `Main / Fill` 已自動依切片起點和弦分流 `CM7_MAJOR` 或 `CM_MINOR`。
   - **剩餘待收尾目標**：
     - 當目標段落選為 `Intro A~D` 或 `Ending A~D` 時，除了全曲人聲主唱（Global Vocal Melody）維持排除外，若該切片區間內有高活躍度的前奏/間奏 Solo 副奏樂軌（如《容易受傷的女人》第 26~33 節的間奏電吉他 Solo），自動將其納入 `Phrase 1 / Phrase 2` 形成大樂隊齊奏。
     - 當目標段落切回 `Main A~D` 或 `Fill In` 時，維持「純伴奏律動模式」（排除單次 Solo）。

13. **[後續待處理 📋 任務 2-4D] 藉由小節樂器出入場與密度變化自動推薦段落（Auto Section Detection）**
   - **目標**：自動掃描 MIDI 各小節的樂器進退場、Program Change 與音符密度，在切片介面提供一鍵選取建議區間。

---

### 📋 後續階段待辦（依 [`MASTER_ULTIMATE_EXECUTION_PLAN.md`](MASTER_ULTIMATE_EXECUTION_PLAN.md) 與 `GEMINI.md` 最新鐵律對齊排序）

- **【任務 0-1 & 0-2】**：USB-MIDI 官方 SysEx 傳檔協議抓包與一鍵直傳 SX920 User 磁區。
- **【任務 3-1 ~ 3-3】**：STY 單軌編輯器樂句剪貼簿（Copy/Cut/Paste）、多音符批次編輯（Batch Inspector，註：PAD 底層 `batchUpdateNotes`/`copyPadMeasure`/`quantizePadTrack` 已於 `pad-modifier.ts` 實裝完成）、SFF-GE 吉他微調。
- **【任務 4-1 & 4-1A】**：Multi Pad 三位一體工作坊與「指定調性包（Fixed-Key `CM0000` 剛體半音平移）」一鍵轉調匯出器（嚴格遵循 `GEMINI.md` 三位一體鐵律：長旋律/前奏強制鎖定 `CM0000` 並提供 12 調性一鍵剛體平移匯出；`Chord Match = ON` 僅限純和弦織體或單一小節不換和弦短動機；跨小節隨和弦變化之插音引導歸入 `.STY` 的 `Phrase 1/2`）。
