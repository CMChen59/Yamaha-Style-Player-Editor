# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-24 (完成 Multi Pad 工作台全四階段開發與全生命週期 E2E 驗收：第一階段調性剛體平移、第二階段單軌屬性工具、第三階段 CC 自動化曲線寫回與單軌編輯器網格連動、第四階段端到端 E2E 測試與 Round-Trip 零數據損失雙向驗證；全部 7 項測試 100% 通過，生產打包成功；Multi Pad 工作台全數結案封存)  
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
| **【任務 4-1A 全四階段】** | **Multi Pad 調性平移工作台全功能 (剛體平移 / 單軌屬性 / CC 控制曲線 / 鋼琴捲軸網格 / 4 軌齊奏 / 全生命週期 E2E 驗收通過封存)** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`player-app.ts`](../src/player/player-app.ts), [`index.html`](../index.html), [`test-pad-key-transposition.test.ts`](../tests/test-pad-key-transposition.test.ts), [`test-pad-full-lifecycle-e2e.test.ts`](../tests/test-pad-full-lifecycle-e2e.test.ts) | ✅ 全四階段全數完工並通過端到端測試與實機驗收封存：<br>1. **第一階段（轉調核心）**：支援 24 大小調定義、4 大型態診斷、首拍強拍主音+半終止屬音雙重調性加權、原曲基準調自動估算+手動覆寫即時重算、原始音高基準快照、匯出強制校驗 UI 設定防呆；使用者於 PSR-SX920 實測大調《月亮代表我的心》C ➔ Eb 與小調樂曲皆 100% 準確發聲。<br>2. **第二階段（單軌屬性與排版）**：單軌獨立勾選移調、複製/清空軌道、獨立小節長度調整、Vol/Pan/Rev/Cho 單欄垂直自適應排版（解決破版）、Icon 修改、新建空白 `.PAD` 與匯出。<br>3. **第三階段（CC 與編輯器連動）**：實裝 `replacePadCCEvents` 支援 CC 11/1/64/74 等自動化曲線即時寫回二進位 rawChunk、單軌鋼琴捲軸小節網格依選中 Pad 自身 `barLength` 精確適配、頂部橫幅專屬色/名稱/屬性連動同步、新增「▶ 4 軌齊奏試聽 / ⏹ 停止齊奏」按鈕。<br>4. **第四階段（端到端 E2E 測試與 Round-Trip 驗收）**：從 0 建立空白專案 ➔ 4 軌音符與不同小節 ➔ CC 11/1 動態曲線 ➔ 音色混音 ➔ 剛體轉調 ➔ 匯出二進位 ➔ 反解析雙向驗證零數據損失（Track 0 控制標籤、音色、混音、音符、CC、小節長度 100% 吻合）；實體琴現成樣本 2010-1 與 2011-2 Round-Trip 轉調無損驗收全數通過（全套測試 7/7 通過，生產打包成功）。 |

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

14. **[✅ 已完成 任務 2-4E] STY 單軌固定音高直通鎖定開關（`Root Fixed + Bypass`）**
   - **完成成果**：
     - `CasmModifier` 新增 `getSectionChannelRule` 與 `setSectionChannelTranspositionMode`，支援單一聲部在特定伴奏段落一鍵切換 5 大轉調模式（`FIXED_BYPASS`、`TRANSPOSE_MELODY`、`TRANSPOSE_CHORD`、`TRANSPOSE_BASS`、`TRANSPOSE_BYPASS`），自動遵守 CSEG 段落獨立剝離鐵律並即時同步更新 `parsed.casmEntries`。
     - 在 STY 編輯焦點橫幅新增 **`[🔒 已鎖定固定音高直通 / 🔓 點擊鎖定固定音高]`** 一鍵按鈕與模式下拉選單，並在 MIDI 切片裝配對話框的各聲部卡片頂部加入 **`[🔒固定音高直通]`** 核取方塊（勾選後音符保持原音高 0 移調不改成 CM7，且 CASM 寫入 `Root Fixed + Bypass`）。
     - 單元測試 `tests/test-casm-fixed-bypass.test.ts` (1/1) 通過：驗證左手頻繁換和弦（C ➔ Am ➔ F ➔ G）時，右手固定旋律 `C-D-E-F-G-A-B-C` 100% 死死釘在原音高零走音，且不污染其他段落。

---

### 🎹 Multi Pad 主線：[✅ 已完成]【任務 4-1B】MIDI 選段單軌快速塞入 Multi Pad (`Pad 1~4`) 與雙向無縫往返工作流

- **完成成果**：
  1. **[✅ 已完成] 第一階段：底層 MIDI 單軌區間擷取至 Pad 引擎（`YamahaPadModifier.importMidiChannelRangeToPad`）**
     - **時間軸與 PPQ 智慧縮放**：自來源 `YamahaFileParsed`（MIDI Song）提取指定 `channel` 在 `startBar ~ endBar` 的音符與真實動態控制器（`CC 11` 表情、`CC 1` 顫音、`CC 64` 延音踏板 + 結尾踏板歸零），自動依比率縮放至目標 Multi Pad 的 PPQ（`480`）並歸零對齊至第 1 拍（`relTick = 0`）。
     - **跨界殘留音過濾（Boundary Bleed Elimination）**：自動排除在 `startTick` 之前即已按下的前一小節殘留尾音，確保 Pad 觸發第 1 拍 100% 乾淨無爆音。
     - **當下生效音色與混音回溯（Effective Voice Lookahead）**：結合 `MidiSongAnalyzer.getEffectiveVoiceAtBar`，自動將該通道在該小節當下生效的 SX920 音色（`MSB / LSB / PC`）、音量（`CC7`）、相位（`CC10`）、殘響（`CC91`）、合唱（`CC93`）寫入目標 `Pad 1~4`。
     - **智慧型態診斷與 `CM / Repeat / Icon / Name` 自動配置**：寫入後自動執行 `analyzePadProject`，依 4 大型態鐵律配置 `CM / Repeat` 與圖示代碼，並自動命名（如 `PanPipes B2-5`）。
  2. **[✅ 已完成] 第二階段：MIDI 通道卡片極簡「`[📥 存入 Pad ▾]` + 懸浮 4 格快選選單」與三大工作台雙向往返（結合 UI 建議 1 & 2）**
     - 在每一張 MIDI 通道卡片底部並排配置單一 `[📥 存入 Pad ▾]` 按鈕（不增加卡片高度），點擊浮出懸浮快選清單（支援在選單內直接微調擷取小節範圍，並即時顯示 `Pad 1~4` 空軌或覆寫狀態）。
     - 點選槽位後即時寫入 `savedPadParsed`，同步更新 `originalPadTrackNotes` 快照與頂部工作台切換列徽章（`1/4 軌`、`2/4 軌`），並提供 `[🎹 前往 Pad 工作台 ➔]` 一鍵跳轉試聽與轉調匯出。
  3. **[✅ 已完成] 第三階段：自動化單元與 E2E 整合測試驗收**
     - `tests/test-midi-to-pad-slice.test.ts` (2/2) 全數通過：驗證 `1920 PPQ` 轉 `480 PPQ` 縮放、跨界音過濾、音色回溯、固定調性平移（Am ➔ Em）與二進位 `.PAD` Round-Trip 100% 零誤差。

---

### 🎨 UI/UX 減法與視覺清爽化主線：[✅ 已全部完成]【任務 5-1】全域工作台導航整合與次要控制項分層收合

- **功能定位**：在不刪減任何專業功能的前提下，透過「頂部工作台導航整合」、「低頻設定列濃縮收合」與「卡片內次要參數摺疊（Progressive Disclosure）」，大幅釋放垂直與水平畫面空間，消除視覺擁擠感。
- **執行進度現況（階段 0 ~ 4 全數完成）**：
  1. **[✅ 已完成] 階段 0：面板顯示收斂為單一 `setWorkspace` 入口**
     - 統一集中管理 `MIDI`、`STY`、`PAD` 三大面板之顯隱，杜絕零散 `style.display` 衝突。
  2. **[✅ 已完成] 階段 1（UI 建議 1）：頂部「三大工作台快速切換膠囊（Workspace Switcher Pills）」**
     - 頂部固定列實裝 `[🎼 MIDI 原曲選段]`、`[🎵 STY 伴奏工作台]`、`[🎹 Multi Pad 工作台]`。
     - 動態徽章即時呈現狀態（如 MIDI `66 節`、STY `已切 3 段` / `15 段`、PAD `4/4 軌`）。
     - 跨工作台無痛平滑切換：隨時在 MIDI 原曲選段與已切片伴奏或 Pad 之間無損來回切換，並移除原先重複笨重的 `[🔙 返回 MIDI 原曲繼續切片]` 按鈕。
  3. **[✅ 已完成] 階段 2（UI 建議 3）：「聲音發聲來源（Web Audio / PSR-SX920 實體琴）」濃縮為一行頂部狀態列 + 可收合抽屜**
     - 將原本佔用約 250px 垂直高度的三大張發聲來源卡片與 4 行教學提示，濃縮為頂部一行精緻狀態列：`🔊 發聲模式：[🎹 PSR-SX920 實體琴 ▲] ｜ Port 1 已連線 ｜ [📡 同步音色] [🛑 Panic 消音] [⚙️ 展開 MIDI 設定與測試 ▾]`。
     - 點擊 `[⚙️ 展開]` 時才滑出 MIDI Port 選擇、測試按鈕與教學說明，一進畫面立即省下 1/3 垂直空間。
  4. **[✅ 已完成] 播放列與橫幅「重複獨奏按鈕」清爽化**
     - 經使用者確認，已將頂部播放列與當前編輯焦點橫幅上的「僅播此軌 (Solo)」/「獨奏此軌 (Solo)」按鈕移除，全介面僅保留最下方單軌編輯器內之一處「僅播此軌 (Solo)」，視覺大幅降噪。
  5. **[✅ 已完成] 階段 3（UI 建議 4）：Multi Pad 卡片與 STY 和弦測試條之「次要控制項分層摺疊」**
     - **Pad 1~4 卡片瘦身**：卡片正面常駐核心控制（名稱、參與移調、音色、CM/Repeat、獨奏/發聲、音量 VOL 滑桿、小節數）；將較低頻調整的「相位 Pan / 殘響 Rev / 合唱 Cho 滑桿、圖示代碼、軌道複製、清空」收合於卡片底部 `[🎛️ 空間效果與進階工具 ▾]` 摺疊抽屜（並記憶展開狀態，重繪不跳回）。
     - **STY 和弦轉調測試條瘦身**：預設僅常駐顯示第一排「常用和弦快捷鍵 + 當前和弦」與進行設定列；下方的「🔄 多小節和弦進行輪播（小節卡片）」改為點擊 `[🔄 展開和弦進行卡片 ▾]` 或開啟自動輪播時才展開。
  6. **[✅ 已完成] 階段 4（UI 建議 2）：MIDI 16 通道卡片「單一按鈕 + 懸浮 Popover 快選」瘦身設計**
     - 與【任務 4-1B】同步實裝，以單一 `[📥 存入 Pad ▾]` 按鈕搭配浮動 4 格選單取代常駐下拉選單。

---

### 📖 系統內建知識庫主線：[✅ 已完成]【任務 5-2】內建互動式樂理與技術參考手冊（Web UI Reference Center）

- **完成成果**：
  1. **[✅ 已完成] 頂部全域參考手冊（`[📖 樂理與 NTR/NTT 參考手冊]` 4 大分類頁籤彈窗）**：
     - **頁籤 1：CASM 轉調秘笈（NTR / NTT）**：電梯（NTR）＋磁鐵（NTT）二階段架構、四大經典組合與琴端實際聽感矩陣（含 `Root Fixed + Bypass` 固定旋律 `C-D-E-F-G-A-B-C` 實例、坐電梯與原地結巴解析）、Intro 左手解鎖混搭防呆神技。
     - **頁籤 2：Multi Pad 4 大型態與調性指南**：4 大音樂型態判定標準與 Chord Match 鐵律（為什麼長旋律需 `CM0000` 剛體平移、為什麼純琶音可開 CM）。
     - **頁籤 3：STY 切片與和弦基準三模式**：`原曲和弦直通`、`CM7 大調基準`、`Cm 小調基準` 與半小節和弦正規化說明。
     - **頁籤 4：PSR-SX920 音色三聯號與相容舊碼速查**：常用經典音色面板 1-based 三聯號與舊碼雙向對照表。
  2. **[✅ 已完成] 情境式即時說明按鈕（`[ℹ️ NTR/NTT 說明]`）**：
     - 在 STY 單軌 CASM 轉調控制組旁直接配置 `[ℹ️ NTR/NTT 說明]` 按鈕，一鍵呼出 NTR/NTT 對照矩陣，操作當下秒懂。

---

### 📋 待執行任務總覽清單（供後續統一檢視與排定優先順序）

| 建議排序編號 | 任務代號 | 任務名稱 | 核心目標簡述 |
| :--- | :--- | :--- | :--- |
| **候選 A** | **【任務 2-4B 收尾】** | **STY 切片段落分流智慧聲部自動納入** | 切片目標選 `Intro / Ending` 時自動將間奏/前奏高活躍度 Solo 副奏納入 `Phrase 1/2` 齊奏；選 `Main / Fill` 時維持純律動伴奏排除 Solo。 |
| **候選 B** | **【任務 2-4F】** | **切片彈窗未納入通道視覺化清單與一鍵轉存 Pad** | 在切片彈窗底部新增「💤 額外未納入伴奏之通道清單」，清楚顯示因 8 軌上限而落選的通道，並提供一鍵「[📥 轉存 Pad]」或「[⇄ 替換入伴奏]」。 |
| **候選 C** | **【任務 2-4D】** | **MIDI 樂器出入場與密度自動推薦段落** | 自動掃描 MIDI 各小節樂器進退場與密度變化，在切片定位器提供一鍵選取建議段落區間（如自動標出前奏、主歌、副歌、間奏小節）。 |
| **候選 D** | **【任務 3-1 ~ 3-3】** | **STY 單軌編輯器進階剪貼簿與批次工具** | 將已在 Pad 實裝的單軌小節複製、批次音符修改（Batch Inspector）與 SFF-GE 吉他微調完整延伸至 STY 單軌編輯器。 |
| **候選 E** | **【任務 0-1 & 0-2】** | **USB-MIDI SysEx 一鍵直傳 SX920 實體琴** | 破譯 Yamaha 檔案傳輸 SysEx 協議，免隨身碟直接從瀏覽器把 `.STY` / `.PAD` 寫入琴端 User 磁區。 |
