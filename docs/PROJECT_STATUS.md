# 📊 Yamaha Style Player & Editor — 專案進度與待辦總表 (Single Source of Truth)

> **最後更新**：2026-11-27 (全面完成並封存【任務 2-4B 收尾】前奏/間奏雙樂器分段接力 Solo 自動入座 Phrase 1/2、【任務 2-4F】切片彈窗未上座通道遺珠清單與一鍵替換/轉存 Pad、以及《月亮代表我的心》實戰驗收四大底層修復：Track 0 Meta 0x51 速度同步、SInt 初始音量同步、範本冗餘段落 Intro C/Ending B/C 自動清除、低音域吉他自動識別為 Bass 與 Rhythm 1 防誤塞弦樂；全套自動化測試通過並同步雲端)  
> **使用說明**：本檔案為跨電腦（公司 ↔ 家裡）的**唯一進度基準**。凡已列入「✅ 已完成並封存」之項目，均已通過測試與實機驗證，請勿重複確認或重做；新對話開始時請直接聚焦於「🚧 當前待處理項目」。

---

## ✅ 一、 已完成並封存項目 (Completed & Locked)

| 階段 / 任務編號 | 功能與問題描述 | 核心實作檔案 | 狀態與備註 |
| :--- | :--- | :--- | :--- |
| **【任務 0-3】** | **Web MIDI 琴端真實發聲引擎 & Port 1/2 路由修復** | [`midi-manager.ts`](../src/core/audio/midi-manager.ts), [`sty-playback-engine.ts`](../src/player/sty-playback-engine.ts) | ✅ 已完成（預設鎖定 Port 1、音色回溯、CC11=127 防無聲、預排視窗 0 掛音） |
| **【任務 1-1】** | **Phrase 1/2 與全段落走音根因徹底解決（CSEG 段落隔離 + 直通 Root 鎖定 C + 半小節正規化）** | [`casm-modifier.ts`](../src/core/writer/casm-modifier.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts) | ✅ 已完成並實機結案（取代早期 `Root Fixed / HiKey` 舊假設；以 CSEG 獨立剝離、直通 Root=0 鎖定 C、三和弦鋪底 `NTT=Chord` 與半小節正規化徹底根除走音） |
| **【任務 1-2】** | **PSR-SX920 2,395 音色庫校準與別名雙向映射** | [`yamaha-voices.ts`](../src/core/data/yamaha-voices.ts) | ✅ 已完成（含 `0-113-75` 排笛修正、`104-21-1` 新舊碼對照、GM 中文譯名） |
| **【任務 2-1】** | **MIDI 音樂檔全景透視儀表板與 16 通道檢測器** | [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`yamaha-parser.ts`](../src/core/parser/yamaha-parser.ts) | ✅ 已完成（含曲中變速積分、Big5/GBK 解碼、16 通道獨立 Solo/Mute/混音） |
| **【任務 2-1B】** | **MIDI 首小節音色重複發送去重與假性換樂器消除** | [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`test-midi-program-change-dedup.test.ts`](../tests/test-midi-program-change-dedup.test.ts) | ✅ 已完成（實裝 `distinctTimeline` 實質音色去重，排除曲首初始化重複發送相同 MSB/LSB/PC 造成的假性曲中換樂器標籤，測試 4/4 通過） |
| **【任務 2-2】** | **MIDI 小節區間循環試聽定位器** | [`player-app.ts`](../src/player/player-app.ts) | ✅ 已完成（支援自訂起訖小節、1~4/8/16 快速鍵、停止重設指針、防跳動獨奏鈕） |
| **【任務 2-3】** | **智慧聲部映射、主旋律排除與小節切片裝配引擎** | [`midi-part-assign-matrix.ts`](../src/core/writer/midi-part-assign-matrix.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（含純伴奏試聽自動復原、曲中生效音色回溯 `getEffectiveVoiceAtBar`、多段落累積整合至同一 STY） |
| **【任務 2-4A】** | **基準和弦三合一模式（大調 CM7 / 小調 Cm / 原曲直通）与關係大小調弱起嗅探** | [`casm-modifier.ts`](../src/core/writer/casm-modifier.ts), [`midi-song-analyzer.ts`](../src/core/parser/midi-song-analyzer.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（支援 SFF2 原廠 Cm 小調基準平行位移與 CASM `chordType=8` / Minor Table、CM7 大調、原曲直通 `Bypass`；實裝 K-S 關係大小調校驗打破 Meta 0x59 偽大調盲點，弱起前奏向後嗅探 Lookahead，解決《容易受傷的女人》Am 誤判 C 大調） |
| **【任務 2-4 初版】** | **Main/Fill 段落和弦反向正規化初版 & 原曲 vs STY 實測解密** | [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`inspect-rongyi-user-midi.test.ts`](../tests/inspect-rongyi-user-midi.test.ts) | ✅ 已完成初版（解開《容易受傷的女人》1~5 節 Intro A、6~13 節 Main A、26~33 節 Intro B 7 軌齊奏規律） |
| **【任務 2-4C 終極】** | **全自動切片深層淨化管線、標準事件優先級與過門聲部鏡像 (實機驗收通過)** | [`style-modifier.ts`](../src/core/writer/style-modifier.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`GEMINI.md`](../GEMINI.md) | ✅ 已完成並實機驗收（邊界音過濾、副歌鈸音/Pad NTT 修正、消除 819 幽靈 CC11、事件標準優先級重整、Fill In 鏡像與 Auto Fill In 無縫切換，琴端表現與原廠一致） |
| **【任務 2-4B 收尾 & 2-4F】** | **前奏/間奏雙樂器分段接力 Solo 自動入座 Phrase 1/2、未上座遺珠清單與《月亮代表我的心》實戰切片六大修復** | [`midi-part-assign-matrix.ts`](../src/core/writer/midi-part-assign-matrix.ts), [`midi-slice-assembler.ts`](../src/core/writer/midi-slice-assembler.ts), [`style-modifier.ts`](../src/core/writer/style-modifier.ts), [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) | ✅ 已完成（支援前/後半段接力 Solo 含 `startBeat` 偏移自動入座 Phrase 1/2、未上座遺珠一鍵替換或轉存 Pad、Track 0 `Meta 0x51` 速度同步、`SInt` 初始音量同步、自動移除 `Intro C/Ending B/C` 範本別首歌殘留、低音域吉他識別為 Bass） |
| **【任務 4-1 基礎】** | **Multi Pad (.PAD) 二進位結構解析與全軌屬性寫入** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`yamaha-writer.ts`](../src/core/writer/yamaha-writer.ts) | ✅ 已完成（完整支援 5 軌 SMF1 結構、`CMxxxx` / `RPxxxx` / `N1~N4` 控制標記） |
| **【任務 4-1 終極】** | **Multi Pad 和弦跟隨適用邊界、固定調性鐵律與 STY 插音分工架構實機結案** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`GEMINI.md`](../GEMINI.md), `2010_空港_Intro_Am調.PAD` | ✅ 已完成並實機結案（PSR-SX920 雙向驗收：證實長旋律開 CM 必走音，CM0000 指定調性為 100% 依譜還原唯一解；插音歸 STY Phrase 聲部） |
| **【任務 4-1A 全四階段】** | **Multi Pad 調性平移工作台全功能 (剛體平移 / 單軌屬性 / CC 控制曲線 / 鋼琴捲軸網格 / 4 軌齊奏 / 全生命週期 E2E 驗收通過封存)** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`player-app.ts`](../src/player/player-app.ts), [`index.html`](../index.html), [`test-pad-key-transposition.test.ts`](../tests/test-pad-key-transposition.test.ts), [`test-pad-full-lifecycle-e2e.test.ts`](../tests/test-pad-full-lifecycle-e2e.test.ts) | ✅ 全四階段全數完工並通過端到端測試與實機驗收封存：<br>1. **第一階段（轉調核心）**：支援 24 大小調定義、4 大型態診斷、首拍強拍主音+半終止屬音雙重調性加權、原曲基準調自動估算+手動覆寫即時重算、原始音高基準快照、匯出強制校驗 UI 設定防呆；使用者於 PSR-SX920 實測大調《月亮代表我的心》C ➔ Eb 與小調樂曲皆 100% 準確發聲。<br>2. **第二階段（單軌屬性與排版）**：單軌獨立勾選移調、複製/清空軌道、獨立小節長度調整、Vol/Pan/Rev/Cho 單欄垂直自適應排版（解決破版）、Icon 修改、新建空白 `.PAD` 與匯出。<br>3. **第三階段（CC 與編輯器連動）**：實裝 `replacePadCCEvents` 支援 CC 11/1/64/74 等自動化曲線即時寫回二進位 rawChunk、單軌鋼琴捲軸小節網格依選中 Pad 自身 `barLength` 精確適配、頂部橫幅專屬色/名稱/屬性連動同步、新增「▶ 4 軌齊奏試聽 / ⏹ 停止齊奏」按鈕。<br>4. **第四階段（端到端 E2E 測試與 Round-Trip 驗收）**：從 0 建立空白專案 ➔ 4 軌音符與不同小節 ➔ CC 11/1 動態曲線 ➔ 音色混音 ➔ 剛體轉調 ➔ 匯出二進位 ➔ 反解析雙向驗證零數據損失（Track 0 控制標籤、音色、混音、音符、CC、小節長度 100% 吻合）；實體琴現成樣本 2010-1 與 2011-2 Round-Trip 轉調無損驗收全數通過（全套測試 7/7 通過，生產打包成功）。 |
| **【任務 4-1B】** | **MIDI 選段單軌快速塞入 Multi Pad (`Pad 1~4`) 與雙向無縫往返工作流** | [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`player-app.ts`](../src/player/player-app.ts), [`test-midi-to-pad-slice.test.ts`](../tests/test-midi-to-pad-slice.test.ts) | ✅ 已完成（1920➔480 PPQ 縮放、跨界音過濾、生效音色回溯、懸浮 4 格快選選單與工作台無縫切換） |
| **【任務 4-1C 全四模組】** | **Multi Pad 樂器黃金音域智慧守護、全體同進退八度連動、小卡發聲小節定位與白話型態、鋼琴捲軸甜區底色與 MIDI 抽入適配** | [`instrument-sweet-spot.ts`](../src/core/data/instrument-sweet-spot.ts), [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts), [`single-track-editor.ts`](../src/player/single-track-editor.ts), [`player-app.ts`](../src/player/player-app.ts) | ✅ 全四模組全數完成（16 大樂器甜區資料庫、一人超標全體同進退八度連動、`📍第 X~Y 節` 實際發聲小節定位、直白白話音樂型態標籤、鋼琴捲軸 `🟢甜區 / 🟠超標 / 🟡CM預留` 視覺底色、MIDI 抽入音量飽滿化與 `CM=1` 自動歸一化回 C 大調中音母體，26/26 測試通過） |
| **【任務 5-3】** | **全域 UI 緊湊化重大優化（檔案資訊橫幅與控制列單行化、全域垂直間隙收斂為 8px）** | [`index.html`](../index.html) | ✅ 已完成（檔案資訊橫幅高 75px ➔ 42px 單行流式排版、播放控制列 85px ➔ 42px 單行整合、全域模組間隙從 20~32px 統一縮小為 8px、消除 switcher margin，釋放 60~80px 垂直視野） |

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

12. **[✅ 已完成 任務 2-4B 收尾] 段落分流智慧聲部自動納入（Intro/Ending 多軌接力副奏 Solo 自動入座 Phrase 1/2 vs Main/Fill 純律動伴奏）**
   - **完成成果**：
     - 在 [`midi-part-assign-matrix.ts`](../src/core/writer/midi-part-assign-matrix.ts) 實裝「全曲唯一核心人聲主唱（`isPrimaryVocal`）」與「局部前奏/間奏/尾奏樂器 Solo（`isIntroEndingSolo`）」智慧分流（含末尾弱起進歌音檢測 `sliceHasNoteBeforeLastBarMap` 與首音時間排序 `firstNoteTickInSlice`）。
     - 當目標段落選為 `Intro A~D` 或 `Ending A~D` 時：僅排除真正貫穿全曲的人聲主唱，自動將前奏/間奏局部樂器 Solo（支援「前 3 節排笛 + 後 2 節薩克斯風」之雙樂器接力前奏！）解除排除並依出場先後自動排入 `Phrase 1` 與 `Phrase 2` 形成大樂隊齊奏。
     - 當目標段落切回 `Main A~D` 或 `Fill In` 時：自動切回「純伴奏律動模式」（排除局部 Solo 軌）。
     - 單元測試 `tests/midi-part-assign-matrix.test.ts` (4/4) 全數通過驗證。

13. **[✅ 已完成 任務 2-4F] 切片彈窗「未納入伴奏之額外發聲通道清單（遺珠清單）」與一鍵替換 / 轉存 Multi Pad**
   - **完成成果**：
     - 在 [`midi-slice-assign-modal.ts`](../src/player/midi-slice-assign-modal.ts) 新增 `#ms-unassigned-box` 透明遺珠區塊：當切片區間發聲通道超過 Yamaha STY 8 軌座位上限時，自動列出所有未上座的發聲通道（標示音色、軌道與該區段音符數），徹底消除第 9、10 軌在介面憑空消失的盲點。
     - 每軌遺珠與排除旋律均提供 **`[⇄ 替換入伴奏座位...]`** 下拉快選與 **`[📥 轉存 Pad 1~4 ▾]`** 一鍵轉存 Multi Pad 功能（直接串聯 `PlayerApp.executeImportMidiChannelToPad` 並即時顯示 `✅ 已存入 Pad X` 綠標）。

14. **[當前第一優先 🚧 任務 2-4D] 藉由小節樂器出入場與密度變化自動推薦段落（Auto Section Detection）**
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

### 🎹 Multi Pad 主線：[✅ 已全部完成]【任務 4-1C】Multi Pad 樂器黃金音域智慧守護、多軌接力全域同進退八度連動與 MIDI 選段適配系統 (2026-11-26 完工驗收)

- **核心痛點與病因診斷**：
  1. **真實樂器黃金音域（Sweet Spot）與花栗鼠失真效應**：現有 `calculateSemitoneShift` 在 `auto` 模式下採用全域單一上限 `maxPitchLimit = 96 (C7)`，導致薩克斯風（好聽上限 `D6=86`）、木吉他（`A5=81`）、二胡/弦樂（`E6=88`）、銅管（`C6=84`）在向上移調（如 `+7 ~ +10` 半音）時雖未超過 `C7 (96)`，卻已落入 `85 ~ 95` 的尖銳刺耳拉伸區，失去真實樂器溫潤共鳴。
  2. **多軌接力旋律（Hocket / Call-and-Response）單軌獨立折返斷層漏洞**：實務上常有「Pad 1 負責前 2 拍 ➔ Pad 2 負責後 2 拍 ➔ Pad 1 負責最後 2 拍」之雙軌接力主旋律。現有 `transposePadKey` 在迴圈內逐軌獨立判斷 `oldMax + appliedSemitones > maxPitchLimit`，一旦後 2 拍高潮（Pad 2）超標降八度（`-5`）而前 2 拍（Pad 1）未超標維持高八度（`+7`），兩軌接力處將發生整整一個八度的懸崖斷層！
  3. **從零自建 PAD 與從 MIDI 選段抽入 PAD 的源頭音域盲點**：自建看簡譜點音符時容易誤點高一個八度；從一般電腦 GM MIDI 抽選段落（或抽入後更換 SX920 樂器音色）時，常遇到原 GM 音高虛高、局部小節和弦非 C 大調（開 `CM=1` 會走音破表）、以及降八度後中頻音量被伴奏掩蓋等問題。

- **四大核心執行模組（涵蓋「匯入 PAD 移調」、「自建全新 PAD」、「MIDI 選段轉 PAD」三大場景）**：
  1. **模組一：[✅ 已完成 2026-11-26] 16 大樂器分類專屬黃金音域資料庫（Instrument Sweet-Spot Profile）與重心距離決策**
     - **實作**：新增 [`instrument-sweet-spot.ts`](../src/core/data/instrument-sweet-spot.ts)（分類黃金音域表、`evaluateShiftRoute`、`decideOctaveRoute`）與 `YamahaPadModifier.recommendSemitoneShift`；`PadTrackDiagnosis` 新增 `avgPitch`；`transposePadKey` 新增 `useSweetSpot` 選項（核心預設 `false`，以保護《空港》`+7` 實機驗收黃金範本；UI 套用/預覽/匯出前校驗一律開啟，預覽徽章 tooltip 顯示決策原因）。
     - **決策規則**：目標調性不變，僅在高八度（`+N`）與低八度（`N-12`）擇一；① 總超出甜區半音數較少者勝 ② 違規相同時，重心距離需改善 ≥ 4 半音才改走低八度 ③ 否則優先高八度；整組勾選軌共用同一結果；使用者強制 `up/down` 方向優先。
     - **測試**：`tests/test-instrument-sweet-spot.test.ts` (9/9) 通過，既有 Pad 轉調/E2E/MIDI 抽入測試 (9/9) 無 regression。
     - **注意**：《空港》Am→Em 在 UI 自動模式下，因 Strings 最高音 F6(89)+7 超過 E6(88) 甜區，會推薦 `-5`；欲沿用實機驗收之 `+7` 請將方向改選「向上」。
     - 建立依 `category` 分類之黃金音域表：
       - **Guitar（吉他類）**：`SweetMax = 81 (A5)`, `SweetMin = 40 (E2)`, `IdealCenter = 68 (G#4)`
       - **Saxophone / Brass（薩克斯風 / 銅管）**：`SweetMax = 86 (D6)`, `SweetMin = 46 (Bb2)`, `IdealCenter = 74 (D5)`
       - **Strings / Choir（弦樂 / 二胡 / 人聲）**：`SweetMax = 88 (E6)`, `SweetMin = 43 (G2)`, `IdealCenter = 75 (Eb5)`
       - **Woodwind / Organ（排笛 / 長笛 / 風琴）**：`SweetMax = 91 (G6)`, `SweetMin = 60 (C4)`, `IdealCenter = 79 (G5)`
       - **Piano / Synth / Perc（鋼琴 / 合成器 / 鐘琴）**：`SweetMax = 96 (C7)`, `SweetMin = 36 (C2)`, `IdealCenter = 72 (C5)`
     - **同目標調性之最佳八度路線選擇（`+N` vs `N - 12`）**：在 100% 鎖定使用者指定目標調性（如 `Am ➔ Em`）的前提下，綜合評估「向上走（`+7` 高八度 Em）」與「向下走（`-5` 低八度 Em）」是否超出該樂器 `SweetMax`，以及哪條路線讓整軌平均音高更接近 `IdealCenter`，自動推薦最溫潤動聽的八度路線。
  2. **模組二：[✅ 已完成 2026-11-26] 多軌接力 / 合奏「全域同進退鐵律（Global Coherent Shift）」與時間軸接力偵測**
     - **實作**：
       1. 在 [`instrument-sweet-spot.ts`](../src/core/data/instrument-sweet-spot.ts) 實裝 `detectPadTrackRelations` 智慧分析演算法：依發聲區間與切換點精確判定 `HOCKET`（交錯接力問答主旋律）與 `HARMONY_LAYER`（重疊發聲合奏/雙軌疊音）。
       2. 在 [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts) 徹底重構八度折返邏輯：全域計算 `globalAppliedSemitones`，凡參與移調之所有旋律軌一律採同一位移量（一人超標、全體同降），100% 鎖定各軌相對音高差，徹底杜絕旋律斷層！
       3. 在 [`player-app.ts`](../src/player/player-app.ts) Pad 工作台卡片標頭加入 `🔗 接力主旋律` / `👥 同步合奏疊音` 徽章，並於診斷說明即時提示連動關係。
     - **測試**：新增 [`tests/test-pad-coherent-shift.test.ts`](../tests/test-pad-coherent-shift.test.ts) (3/3 通過)，驗證 Pad 1 (前2拍) 與 Pad 2 (後2拍) 交錯接力時精確同降八度，且相對音程零偏差；全套 Pad 測試集 (21/21) 全數通過！
     - **全域綁定同位移**：修正 `transposePadKey` 逐軌各自折返之漏洞。凡勾選參與移調之所有旋律軌（如 Pad 1 + Pad 2），在決定採高八度（`+N`）或低八度（`N - 12`）及執行八度折返時，一律視為**同一個命運共同體（一人超標、全體同降）**，100% 鎖定各軌間的相對音高差（Relative Pitch Contour），徹底杜絕接力旋律斷層。
     - **智慧接力與同區間連動識別**：自動偵測時間軸交錯接力（如 Pad 1 奏 1~2 拍、Pad 2 奏 3~4 拍）或自 MIDI 同一小節區間抽入之多軌組合，於 UI 標示 `🔗 多軌接力/合奏連動中`。
  3. **模組三：[✅ 已完成 2026-11-26] 全軌同步 / 單軌獨立「一鍵 ±1 八度（±12 半音）」快捷鈕與「音域健康度預警徽章」**
     - **實作**：
       1. 在 [`index.html`](../index.html) 轉調微調區升級為 `[🔽 全軌同步 -1 八度 (-12)]` 與 `[🔼 全軌同步 +1 八度 (+12)]` 快捷按鈕，支援不改調性全軌同升同降。
       2. 在 [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts) 實裝 `shiftPadTrackOctave`：支援單軌與多軌一鍵升降八度（保留非音符事件與混音設定，自動做 0~127 邊界防護並重建 RawChunk）。
       3. 在 [`player-app.ts`](../src/player/player-app.ts) 單軌 Pad 卡片正面實裝：
          - **音域偏高警示徽章与全體同進退八度微調**：當最高音超出該樂器 SweetMax 時自動亮起 `⚠️ 音域偏高 (超標 N st，甜區上限 M)`，並附帶一鍵「降八度 ▾」快速救星；點擊卡片上之 `[降八度 ▾]` 或 `[▼ -8度] / [▲ +8度]` 時，預設推薦將所有勾選 `🔀參與移調` 且不跌破最低音下限之軌道（Pad 1~4）全體同步升降，徹底避免漏調某軌主旋律造成斷層（亦支援選「取消」僅單獨調整單軌）。
          - **白話音樂型態標籤與實際發聲小節定位（`📍第 X~Y 節`）**：將音樂型態統一升級為直覺白話標籤（`🎵 前奏 / 主旋律（含升降音 · 需關 CM）`、`🎶 長旋律 / 副旋律鋪底（需關 CM）`、`✨ 短插音 / 點綴短句`、`🎹 和弦伴奏律動（可開 CM 跟隨）`、`🥁 鼓組 / 打擊節奏（需關 CM）`），並在每張小卡標示實際發聲小節範圍（如 `📍第 3~6 節`、`📍第 1 節`），一眼看穿各軌進退場定位。
     - **測試**：在 [`tests/test-pad-coherent-shift.test.ts`](../tests/test-pad-coherent-shift.test.ts) 新增單軌/多軌八度位移與邊界夾幅測試 (23/23 通過)！
     - **主轉調面板**：新增 **`[🔽 全軌同步 -1 八度 (-12)]`** 與 **`[🔼 全軌同步 +1 八度 (+12)]`** 按鈕，不改變目標調性，一鍵將所有勾選之接力/合奏軌同步升降八度並即時試聽比對。
     - **單軌 Pad 卡片**：正面提供單軌 `[▼ -1八度]` / `[▲ +1八度]` 微調鈕（若偵測為接力軌則貼心連動或提示），並於音高超出該樂器 `SweetMax` 時顯示 **`⚠️ 音域偏高 (最高音超過該樂器甜區，建議降八度)`** 徽章；中途更換樂器音色時亦自動觸發音域適配健檢。
  4. **模組四：[✅ 已完成 2026-11-26] 自建 PAD 鋼琴捲軸「🟢 黃金甜區視覺底色」與 MIDI 選段抽入智慧適配**
     - **實作**：
       1. 在 [`single-track-editor.ts`](../src/player/single-track-editor.ts) 實裝 `getActiveSweetSpotProfile`、`getNoteSweetSpotZone` 與 `setChordMatchContext`：於單軌鋼琴捲軸頂部工具列顯示 `#ed-sweetspot-pill` 甜區膠囊，並在左側琴鍵與水平背景網格即時渲染「🟢 黃金甜區 (`good`)」、「🟠 超出上限警示區 (`overflow-high`)」、「🟡 CM=1 轉調預留區 (`cm-headroom`，上限下方 6 半音）」視覺底色，對超標音符自動標示紅色警示外框。
       2. 在 [`pad-modifier.ts`](../src/core/writer/pad-modifier.ts) 強化 `importMidiChannelRangeToPad` 與 `detectRangeChordRootPc`：
          - **音量自動飽滿化（`autoBoostVolume`）**：強制確保起點 `CC11 = 127`（若原背景軌全程 CC11 < 95 自動等比拉升），原軌 `CC7 < 85` 自動提升至 `100`，若發生降八度則額外補償至 `104` 強化中頻穿透力。
          - **超甜區自動降八度（`autoFitSweetSpot`）**：當抽入之 GM MIDI 音符超出目標樂器 `SweetMax` 時，自動以整軌為單位降八度（`-12` 半音）落入甜區。
          - **`CM=1` 短插音自動歸一化回 C 大調中音母體（`normalizeToCM7`）**：自動偵測原 MIDI 該小節區間和弦根音（優先採低音區 `<=55` Bass 根音，無低音軌則以三和弦/五度骨架匹配），反向平移回 `C 大調（CM7）` 母體並置中於 `C4 (60) ~ E5 (76)` 黃金中音區，預留上方 ≥ 6 半音供左手換和弦。
       3. 在 [`player-app.ts`](../src/player/player-app.ts) 的 `[📥 存入 Pad ▾]` 懸浮選單中提供三大智慧適配核取方塊，並於匯入成功畫面即時呈現適配摘要。
     - **測試**：於 [`tests/test-midi-to-pad-slice.test.ts`](../tests/test-midi-to-pad-slice.test.ts) 新增 3 項單元與整合測試，連同全套 Pad 測試集共 26/26 全數通過！

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

### 🎛️ UI 緊湊化重大優化：[✅ 已完成]【任務 5-3】專業 DAW 級單行流式橫幅、播放控制列與全域間距調諧 (2026-11-25)

- **功能定位**：針對桌面版高階音樂工作站（Cubase / Logic Pro）視野需求，消除冗餘垂直空白，使伴奏 8 聲部矩陣、切片定位器與鋼琴卷軸能夠更早映入眼簾。
- **完成成果**：
  1. **伴奏與 MIDI 資訊橫幅（`.style-banner`）單行化**：
     - 將原本上下兩層卡片改為單行流式排版（`display: flex; align-items: baseline; justify-content: space-between;`）。
     - 檔名與規格（格式、小節數、BPM、拍號、發聲通道數、音符數）排在同一水平線，高度由 75px 驟降至 42px。
  2. **播放主控制列（`.transport-bar`）單行整合**：
     - 播放/停止/循環三顆核心按鍵、小節/拍/Tick 計時器、BPM 滑桿與全域總音量控制器整合為單一行排版，高度由 85px 驟降至 42px。
  3. **全域模組垂直間隔與內距收斂（統一為 `8px`）**：
     - 主容器 `.container` 的 `gap` 由原先的 `20px` 收窄為 **`8px`**，上下邊距由 `20px` 減至 `12px`。
     - 移除 `.workspace-switcher` 原先疊加的 `margin-bottom: 12px`（原先與容器 gap 疊加達到 32px 的過度留白），回歸 8px 緊湊規格。
     - `.output-panel` 內距收斂為 `8px 16px`，在單行精簡狀態下與橫幅、控制列視覺高度完全統一。
     - `.drop-zone` 內距適度微調為 `12px 18px`。
     - **總成果**：頂部 5 處空隙全面收緊，累積釋放 **約 60px ~ 80px 的垂直畫面空間**，大幅強化軟體專業度與操作流暢度。

---

### 🎧 音樂樂理與聲音工程原理解析：MIDI 立體聲環繞與左右耳遊走 (CC 10 Pan & Ping-Pong Delay)

- **現象描述**：使用者詢問在耳機中聽到特定樂句（如合成器琶音、木吉他裝飾音或迴音）聲音由右耳流暢游移至左耳的背後原理與系統實作方式。
- **底層核心原理**：
  1. **MIDI CC 10（Pan 聲像控制器）連續自動化曲線（Automation Curve）**：
     - MIDI 規範中，`CC 10` 控制立體聲全景位置（數值 `0 = 極左 Left`、`64 = 正中 Center`、`127 = 極右 Right`）。
     - 當 MIDI 檔中對特定聲部寫入隨時間變化的 CC 10 數值序列（例如從第 1 拍的 `127` 連續漸變至第 4 拍的 `0`），耳機與立體聲喇叭即會產生平滑由右向左飄移的物理聽感。
     - 系統現已內建 CC 自動化曲線檢視與編輯器（含漸強/漸弱、平滑濾波功能），在下拉選單切換至 `CC 10 Pan` 即可視覺化檢視或即時繪製曲線，並寫回二進位音軌中。
  2. **Yamaha 琴端 DSP 效果器：Ping-Pong Delay（乒乓延遲）與 Auto Pan（自動左右聲像）**：
     - 部分 MIDI 檔案自身 CC 10 數值為固定值，但透過 Yamaha XG SysEx 開啟了內建的乒乓延遲（`Ping-Pong Delay`）效果器：每次 Echo 迴音會自動在左右聲道交替彈跳，產生立體聲空間包圍感。
     - 本系統不論透過 Web Audio 軟音源或 PSR-SX920 實體琴輸出，均 100% 忠實傳輸並支援 CC 10 聲像與立體聲效果。

---

### 📖 系統內建知識庫主線：[✅ 已完成]【任務 5-2】內建互動式樂理與技術參考手冊（Web UI Reference Center）

- **完成成果**：
  1. **[✅ 已完成] 頂部全域參考手冊（`[📖 樂理與 NTR/NTT 參考手冊]` 4 大分類頁籤彈窗）**：
     - **頁籤 1：CASM 轉調秘笈（NTR / NTT）**：電梯（NTR）＋磁鐵（NTT）二階段架構、四大經典組合與琴端實際聽感矩陣（含 `Root Fixed + Bypass` 固定旋律 `C-D-E-F-G-A-B-C` 實例、坐電梯與原地結巴解析）、Intro 左手解鎖混搭防呆神技。
     - **頁籤 2：Multi Pad 4 大型態與調性指南**：4 大音樂型態判定標準與 Chord Match 鐵律（為什麼長旋律需 `CM0000` 剛體平移、為什麼純琶音可開 CM）。
     - **頁籤 3：STY 8 大聲部規格與切片三模式**：完整收錄 Yamaha 原廠 8 大伴奏聲部（Channel 9~16：Rhythm 1/2, Bass, Chord 1/2, Pad, Phrase 1/2）之職責、常見樂器與 CASM 屬性，搭配 `原曲和弦直通`、`CM7 大調基準`、`Cm 小調基準` 與半小節和弦正規化說明。
     - **頁籤 4：PSR-SX920 原廠樂器 Data List 全集速查 (2,395 種音色庫)**：完整收錄 Yamaha 官方 Data List 全套 2,395 種樂器，內建「即時關鍵字搜尋（支援中英文、MSB-LSB-PC 面板三聯號如 104-21-1、相容舊碼）」與「16 大樂器分類膠囊（鋼琴、電鋼琴、風琴、吉他、貝斯、弦樂、銅管、薩克斯風、木管、合成器、鋪底、人聲、鼓組、打擊、GM/XG）」極速過濾器，支援分頁增量渲染。
  2. **[✅ 已完成] 情境式即時說明按鈕（`[ℹ️ NTR/NTT 說明]`）**：
     - 在 STY 單軌 CASM 轉調控制組旁直接配置 `[ℹ️ NTR/NTT 說明]` 按鈕，一鍵呼出 NTR/NTT 對照矩陣，操作當下秒懂。

---

### 📋 待執行任務總覽清單（供後續統一檢視與排定優先順序）

| 建議排序編號 | 任務代號 | 任務名稱 | 核心目標簡述 |
| :--- | :--- | :--- | :--- |
| **✅ 已完成** | **【任務 2-4B 收尾】** | **STY 切片段落分流智慧聲部自動納入** | 切片目標選 `Intro / Ending` 時自動將間奏/前奏高活躍度 Solo 副奏（含雙樂器接力 Solo）納入 `Phrase 1/2` 齊奏；選 `Main / Fill` 時維持純律動伴奏排除 Solo。 |
| **✅ 已完成** | **【任務 2-4F】** | **切片彈窗未納入通道視覺化清單與一鍵轉存 Pad** | 在切片彈窗底部新增「💤 額外未納入伴奏之通道清單」，清楚顯示因 8 軌上限而落選的通道，並提供一鍵「[📥 轉存 Pad]」或「[⇄ 替換入伴奏]」。 |
| **✅ 已完成** | **【任務 4-1C】** | **Multi Pad 樂器黃金音域智慧守護、多軌接力全域同進退八度連動與 MIDI 選段適配** | 建立 16 大樂器黃金音域表取代單一 `C7(96)` 上限、鎖定多軌接力（Pad 1+2 交替）全域同進退不斷層、提供全軌/單軌一鍵 `±1 八度` 快捷鈕與過高預警、鋼琴捲軸甜區高光及 MIDI 抽入音量飽滿化與 `CM=1` 自動歸一化。 |
| **候選 D** | **【任務 2-4D】** | **MIDI 樂器出入場與密度自動推薦段落** | 自動掃描 MIDI 各小節樂器進退場與密度變化，在切片定位器提供一鍵選取建議段落區間（如自動標出前奏、主歌、副歌、間奏小節）。 |
| **候選 E** | **【任務 3-1 ~ 3-3】** | **STY 單軌編輯器進階剪貼簿與批次工具** | 將已在 Pad 實裝的單軌小節複製、批次音符修改（Batch Inspector）與 SFF-GE 吉他微調完整延伸至 STY 單軌編輯器。 |
| **候選 F** | **【任務 0-1 & 0-2】** | **USB-MIDI SysEx 一鍵直傳 SX920 實體琴** | 破譯 Yamaha 檔案傳輸 SysEx 協議，免隨身碟直接從瀏覽器把 `.STY` / `.PAD` 寫入琴端 User 磁區。 |
