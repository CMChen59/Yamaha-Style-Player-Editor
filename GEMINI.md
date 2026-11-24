# Yamaha Style Player & Editor — 專案永久記憶與工程鐵律 (Workspace Rules)

> **本檔案隨 Git 跨電腦自動同步並於每次對話強制載入。**
> 當開始新對話或切換電腦（公司 ↔ 家裡）時，請務必遵守以下「已結案鐵律」，並以 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) 為唯一進度依據，**嚴禁針對已解決問題重複詢問或倒退修改**。

---

## 一、 專案全域硬性禁令 (Strict Constraints)

1. **禁止修改歷史封存檔案**：絕對不可修改專案根目錄下的 `index-00.html` 與 `index - 0902.html`。
2. **語言規範**：所有回覆、UI 介面文字、註解與 Git Commit 訊息均以**繁體中文**呈現。
3. **單一進度來源**：查詢當前進度與待處理事項時，一律讀取 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)。`docs/archive/` 目錄下之歷史每日紀錄僅供備查，切勿將其中的歷史待辦事項當作當前未完成問題。

---

## 二、 已徹底解決並封存之技術鐵律 (Locked & Solved Decisions)

以下問題均已在過去的開發與實機測試中徹底解決並鎖定，**請勿重新推翻或重複向使用者確認**：

### 1. Yamaha PSR-SX920 實體琴 Web MIDI 與音色規範
- **MIDI Port 1 / Port 2 路由鐵律**：
  - PSR-SX920 的 `Digital Workstation 1` (Port 1) 為標準 16 通道發聲主音源埠；Port 2 在未做特殊琴端 Receive 設定時不發聲。系統預設自動優先綁定 Port 1。
- **音色預載與防呆回溯（Voice Lookahead & Effective Voice）**：
  - 部分 STY/MIDI 將初始音色（MSB/LSB/PC）寫在 `SInt` 或首小節微幅偏移處，或於曲中透過 Program Change 動態換樂器。
  - 已實裝 [`MidiSongAnalyzer.getEffectiveVoiceAtBar`](src/core/parser/midi-song-analyzer.ts) 與 `StyPlaybackEngine` 音色回溯機制，確保任意小節切片與播放皆能精準命中當下生效音色。
- **SX920 2,395 種音色與別名零落差**：
  - 已完整校準 [`yamaha-voices.ts`](src/core/data/yamaha-voices.ts)：包含 `0-113-75` 修正為 `PanPipes (排笛, Woodwind)`（非 Pizzicato Strings），並建立 `LEGACY_VOICE_ALIASES` 雙向對照（如 `104-21-1` 與舊碼 `104-1-1`）。
- **測試按鈕 CC11 表情與彎音復原**：
  - 琴端測試按鈕發聲前皆強制送出 `CC7=100, CC11=127, PitchBend=0`，防止前次樂曲殘留靜音或彎音。

### 2. SFF2 / CASM 二進位結構與和弦轉調鐵律
- **1920 PPQ 高解析度與 BinaryWriter VLQ 防護**：
  - 黃金範本與切片裝配統一採用 Yamaha SFF2 標準 `1920 PPQ`。
  - [`BinaryWriter`](src/core/writer/binary-writer.ts) 之 `writeVarInt` 與 [`MidiSliceAssembler.cloneParsed`](src/core/writer/midi-slice-assembler.ts) 已強化 `Uint8Array` 深拷貝保護，杜絕 `JSON.stringify` 破壞 `ArrayBuffer` 造成 `DataView` 或 `RangeError` 崩潰。
- **小調音階調和（Minor Harmonization）与 SFF-GE 吉他 6 弦解碼**：
  - [`chord-transposer.ts`](src/core/writer/chord-transposer.ts) 已實裝小調 B 音（PitchClass 11）轉 Am 時自動降為純淨 G 音（消除刺耳 G# 導音碰撞），並支援全八度 SFF-GE 吉他琶音觸發碼解譯。
- **Style Creator 基準和弦（Source Chord）真理**：
  - Yamaha 原廠預設基準和弦為 **`CM7`（C-E-G-B 四音母體）**，藉此推導所有三和弦、七和弦與變化和弦。
  - **Intro / Ending 段落**：90% 以上為固定編曲樂句（如《容易受傷的女人》1~5 小節 Intro A 薩克斯風、26~33 小節 Intro B 電吉他 7 軌齊奏），在琴上只需單按根音直通播放，**不應強制轉為 C 大調或開啟多小節輪播**。
  - **Main A~D / Fill In 段落**：為循環律動伴奏（如《容易受傷的女人》6~13 小節純木吉他分解），需進行和弦正規化以供左手即時換和弦轉調。
- **Multi Pad 實測經驗反哺 STY（小調轉調音符走味根本成因）**：
  - **病因診斷**：今日在 Multi Pad 實測中徹底證實，Yamaha 琴端若以預設 CM7 母體進行即時轉調運算，當左手彈奏小和弦時，琴端韌體會強制以自然小調（Aeolian）音階吸附，導致小調第 6 度花音與第 7 度導音被強制削平降半音。這正是過去部分 STY 切片在琴端聽覺上「音符怪異、走味」的同源底層原因。
  - **STY 之 CASM 強大解法**：與無 CASM 的 Multi Pad 不同，STY 擁有完整 CASM 結構，支援 `NTT = Melody / Harmonic Minor / Bypass` 以及獨立的 Minor Chord Table (`Ctb2`)。未來重審與優化 STY 切片時，必須運用此大小調音階與導音保護經驗，精確配置 CASM 聲部屬性。
- **STY 三合一基準和弦與 Cm 小調原廠跟隨鐵律（2026-11-21 逆向 4006 SX900 原廠伴奏定案）**：
  - **Cm 小調基準（`CM_MINOR`）**：小調曲目（如《雲中月圓》、《空港》、《容易受傷的女人》在 Am）切片時，音符純剛體平行平移至 Cm（如 Am ➔ Cm 為 +3 半音），CASM 寫入 `sourceChordRoot = 0 (C), sourceChordType = 8 (Minor)`，NTT 設為 `Minor (0x07)` 或 `Bass (0x81)`。琴端左手彈奏任意小和弦（Am、Dm、Em、Gm）時，琴端執行純半音平行移調，小三度 Eb 與導音 100% 完美呈現，徹底消除走音削平現象。
  - **CM7 大調基準（`CM7_MAJOR`）**：大調曲目之 Main / Fill 律動段落歸一化為純淨 CM7 四音母體，CASM 標記 `sourceChordRoot = 0, sourceChordType = 2 (Maj7)`。
  - **原曲和弦直通（`ORIGINAL_PASS_THROUGH`）**：大樂隊齊奏或複雜前奏/尾奏，音符保持原調（0 移調），CASM 配置 `NTT = Bypass (0x00)`，琴端按單音根音即可原汁原味直通播放。
- **MIDI 調性判定與段落和弦基準分流鐵律（2026-11-21 實機演奏譜定案）**：
  - **切片基準由「切片起始和弦」決定（段落分流原則）**：切片至伴奏段落時，嚴禁以全曲副歌的小調標籤齊頭式覆蓋大調主歌。
    - **Intro / Ending**：90% 以上為固定樂句（如 Sax/吉他 Solo 齊奏），預設一律採用**【原曲和弦直通（ORIGINAL_PASS_THROUGH，NTT = Bypass）】**，保持 0 移調，琴端左手單按根音（如 `Sync Start = C`）即可 100% 還原原汁原味前奏與順暢銜接進歌點。
    - **Main / Fill（循環律動伴奏）**：依切片起始小節代表和弦（`repChord`）分流：
      - 若起始和弦為**大調**（如《容易受傷的女人》第 6 節 C 大調進歌）：自動推薦**【CM7 大調基準（CM7_MAJOR）】**，音符 0 位移（以 C 為母體），琴端左手依譜彈奏 C、Em、Am、Dm、F、G 100% 完美即時移調。
      - 若起始和弦為**小調**（如副歌起點為 Am）：自動推薦**【Cm 小調基準（CM_MINOR）】**，平行平移 $+3$ 半音至 Cm 母體並配置 Minor Table。
  - **Meta 0x59 大調標籤審查**：當 MIDI 內嵌 `Meta 0x59 [sf, 0]`（宣告大調）時，只有在關係小調得分顯著高於大調（差距超過 15%）時才視為誤標而校正；微弱差距（如流行歌大調主歌+小調副歌交織）堅定尊重原作者之大調標記。
  - **弱起前奏向後嗅探（Lookahead Fallback）**：切片起始小節若無貝斯進場且音級過少（無明確三度音之弱起引導音），自動向後探測區間內第一個真正具備和聲進場之小節（如第 2 小節 F）。
- **Main / Fill 半小節和弦反向正規化與插音保留鐵律（2026-11-21 逆向 Yamaha MIDI Song to Style 定案）**：
  - **一小節雙和弦走音根因**：華語流行歌與經典編曲中，一小節內常有兩個和弦（如第 7 節前半 Em、後半 Am）。若以整小節為單位統一移調，後半小節和弦會被當成前半小節的音程誤算（如 Am 被當成 Em 扣 4 半音變成 F 小調），在琴端左手手彈換和弦時引發雙重疊加走音災難。
  - **半小節（2 拍）高解析度正規化（`detectSubBarChords`）**：以 2 拍為單位分別偵測根音並獨立反向平移回 C Major（或 Cm），使整段 8 小節 Main 伴奏與過門插音（Phrase 1/2）每一拍都徹底鎖定在純淨的 CM7 大調母體上。
  - **插音與手彈體驗雙贏**：琴端左手依譜換和弦（C ➔ Em ➔ Am ➔ Dm ➔ F ➔ G）時，全曲 8 小節呼吸感與第 4 節、第 8 節所有過門插音完美保留（`Phrase 1/2` 採用 `NTT = Melody`），手彈轉調 100% 精準無瑕疵！
- **MIDI 起音時間差（Beat Offset）與拍級智慧切片鐵律（2026-11-21 逆向 Yamaha MIDI Song to Style 實證定案）**：
  - **全面性問題成因（Universal Issue）**：全球 60% 以上商業 MIDI 檔，第 1 小節前幾拍為「初始化保留區（Setup Buffer Silence，放置 SysEx/音色重置碼）」或曲目本身為「弱起樂句（Pickup / Anacrusis，如《容易受傷的女人》在第 1 小節第 3 拍起音）」。死板的整小節（Bar）整數切割會導致：開頭 2 拍死寂、結尾 2 拍被硬生生腰斬、循環撕裂、和弦反向移調相位錯位。
  - **Yamaha 原廠真相**：Yamaha 官方「MIDI Song to Style」切片游標為 `Bar : Beat : Tick`（`Intro A` 切於 `001 : 03 : 000 ~ 006 : 03 : 000`，`Main A` 切於 `006 : 03 : 000 ~ 014 : 03 : 000`），自動咬合音樂真實強拍與結尾。
  - **技術鐵律**：切片系統必須升級支援「智慧起音自動偵測（First Note Offset Snapping）＋ 拍級（Beat）精確切片」，徹底根除結尾腰斬與循環雜音問題。
- **全域主旋律優先錨定與弱起進歌音防護鐵律（2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：流行歌曲中，主唱軌（如 Channel 0 Soprano Sax，全曲 396 顆音）在前奏（第 1 ~ 4 小節）通常完全未開口（0 音符），直到前奏最後一拍（第 5 小節第 4 拍）才以弱起前導音（Pickup / Anacrusis，如「有心」G2-A2 簡譜 `˙5 ˙6`）銜接主歌。舊版若僅針對切片選取區間（1~5 節）判斷主旋律，會因該區間前段為 0 音符而誤將主唱軌判定為 `isMelody = false`，導致自動分配引擎將其誤當閒置伴奏抓去填補 `Phrase 1`，在琴端 Style Creator 第 5 小節出現兩顆主唱進歌音。
  - **核心鐵律**：聲部映射矩陣（`MidiPartAssignMatrix`）必須採取**「全曲全域特徵（Global）」＋「局部切片特徵（Local）」雙重聯集校驗（Global Melody Anchor）**。凡在全曲分析中被識別為全曲主唱/主旋律之軌道，**絕對不准因局部切片區間暫無音符就降級為伴奏樂器**！強制鎖定 `isMelody = true` 且 `isExcluded = true`（伴奏預設排除），徹底杜絕主唱弱起進歌音漏進伴奏檔（STY）之任何聲部。
- **CASM 段落獨立隔離鐵律（CSEG Section Isolation Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：Yamaha SFF2 標準範本中，預設將 `Main A~D, Fill In AA~DD, Intro A, Ending A` 多段落歸在同一個 `CSEG 0` 共享區塊中（`Sdec` 包含多個段落名稱）。當切片非 C 大調段落（例如切片 `Ending A` 第 66 節起始和弦為 Dm，配置 `ORIGINAL_PASS_THROUGH` 寫入 `Root = 2, Type = 8, NTT = Bypass`）時，舊版 `injectOrUpdateSectionCasmRule` 因在 CSEG 0 命中 `Ending A` 而直接原地覆寫 CSEG 0，導致 `Main A~D` 與所有循環伴奏之基準和弦全部被竄改為 D minor Bypass！琴端手彈時全曲調性錯亂走調。
  - **核心鐵律**：更新 CASM 轉調規則時，若目標段落處於多段落共享之 CSEG（`names.length > 1`），**鐵律嚴禁直接原地覆寫共享 CSEG**！必須執行**「段落獨立剝離（CSEG Isolation）」**：自動自原共享 CSEG 的 `Sdec` 移除該段落，並在 CASM 末端建立該段落專屬的全新獨立 CSEG，確保 `Main A~D` CM7 與 `Intro/Ending` 直通調性互不干擾、零污染！
- **CASM 原曲直通基準根音全域鎖定 C (PitchClass 0) 鐵律（2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：在 `ORIGINAL_PASS_THROUGH`（NTT = Bypass）模式下，音符在 MIDI 中本即為 0 移調（原音高直通）。舊版誤將 CASM `sourceChordRoot` 設為切片起點和弦（如《容易受傷的女人》間奏 Intro B 與尾奏 Ending A 皆起於第 26/66 節 Dm，誤設為 `Root = 2`）。Yamaha 琴端移調公式為 `Transposition = PressedRoot - SourceRoot`；當演奏者以標準 `Sync Start = C (Root = 0)` 觸發時，琴端計算 `0 - 2 = -2` 半音，導致整段 Intro B 與 Ending A 被硬生生降 2 個半音嚴重走調。
  - **核心鐵律**：直通段落（NTT = Bypass）之 CASM 基準根音**鐵律一律寫入 `sourceChordRoot = 0 (C), sourceChordType = 0 (Major)`**！當使用者按 C 鍵觸發時，移調量 `0 - 0 = 0`，100% 還原原曲真實音高；換調彈奏（如彈 D）時亦能以 C 為 0 基準精準平移 `+2` 半音。

### 3. MIDI 全景透視與切片 UI 已定案設計
- **Yamaha Style `fn:` 全名標籤防呆隔離鐵律**：
  - Yamaha 原廠琴（SX900/SX920/Genos）與 Style Creator 產出之 `.STY` 伴奏檔，在 Track 0 每個段落起始處皆同時寫入 `Meta 0x06 (Marker，如 "Main A")` 與 `Meta 0x01 (Text Event，如 "fn:Main A")`。
  - 解析器若將 `0x01` 誤判為獨立音樂段落，會因兩者時間軸完全重疊（同 Tick）導致所有正式段落小節長度被腰斬為 0，引發全檔完全無法發聲。
  - 已在 [`yamaha-parser.ts`](src/core/parser/yamaha-parser.ts) 將 `fn:` 識別為 Section Full Name 屬性並予以過濾隔離，正式段落僅接受 `Meta 0x06/0x07`，徹底杜絕 0 小節段落產生。
- **Big5 / GBK 雙重編碼自動偵測**：[`yamaha-parser.ts`](src/core/parser/yamaha-parser.ts) 已支援中文軌道名稱與歌詞標記無亂碼解析。
- **伴奏映射呈現規範**：以**樂器名稱為主、原曲 MIDI Ch 為輔**，方便使用者直覺核對。
- **按鈕防跳動與狀態同步**：
  - 頂部橫幅「🎧 獨奏此軌 / ⏹ 解除獨奏」與切片彈窗「🎧 試聽純伴奏 / ⏹ 停止試聽純伴奏」均已鎖定固定最小寬度（`min-width`），且播放結束或停止時會自動復原按鈕狀態與通道靜音。
- **多段落累積工作流**：
  - 切片裝配後不論點擊「▶ 進入伴奏模式試聽」、「✂️ 繼續切片其他段落」或「💾 匯出 STY 檔」，所有段落皆自動累積保存在同一個 `workingStyleParsed` 伴奏專案中；區間內 0 音符之聲部統一標示為 `💤 此區間未進場 (0 音符)`。

### 4. Yamaha Multi Pad (.PAD) 與 Chord Match 樂理與二進位規範
- **Multi Pad 二進位結構**：標準 Yamaha Multi Pad (`.PAD`) 為 SMF Format 1 (5 軌)，Track 0 透過 `CMxxxx` (Chord Match 0/1) 與 `RPxxxx` (Repeat 0/1) 控制 Pad 1~4。原廠標準 PAD 通常無 CASM 區塊。
- **琴端 Chord Match 鐵律與轉調陷阱**：
  - 琴端在無 CASM 時強制假定來源為 C 大調母體 (CM7)。
  - **為什麼開啟 Chord Match 會走音**：若原曲為 A minor（如 `2011-2` 的 E-D-B 或 `2010-1`《空港》），一旦開啟 Chord Match，琴端誤認 E 為 C 大調的大三度、B 為大七度；手彈 Cm 時琴端不僅不做 +3 半音根音位移，反而透過 NTT 把 E 降為 Eb、B 降為 Bb，徹底破壞旋律。
  - **為什麼關閉 Chord Match 反而轉調無誤**：當 `Chord Match = OFF`（或 Intro 段落為 `NTR = Root Transpose, NTT = Bypass`），琴端不進行大小調音階吸附，而是直接依據目標根音做「純剛體平行平移（+3 半音）」，E-D-B 直接精準命中 Cm 的 G-F-D！
  - **嚴禁齊頭式半音平移至 C minor**：對小調樂句直接 +3 半音平移會產生 `Eb`、`Ab`，導致琴端 NTT「雙重小調降音（Double Minor Distortion）」，彈奏 Am 也會嚴重走調。
  - **小調和聲/旋律導音保護**：小調樂句常有導音（如 A 小調之 `G#`，琴端顯示為 Ab）與旋律小調大六度 `F#`（全音下跳），在轉換時嚴禁縮水為半音（如誤算為 `Bb`）。
- **Multi Pad 4 大音樂型態與工程處置準則**：
  1. **打擊節奏 / 罐頭音效 (Drums / Percussion / SFX)**：鐵律必須 `Chord Match = OFF`，防止鼓點音高被移調破壞。
  2. **開放骨幹音短動機 (如 `2011-2` Pad 1，無 3 度與導音)**：設定 `Chord Match = OFF` 或 `NTT = Bypass`，純根音平移容錯率極高。
  3. **和聲織體 / 分解和弦 / 刷弦 (Arpeggio / Strumming)**：鐵律必須 `Chord Match = ON` 並做 `CM7` 正規化，確保左手彈小和弦時自動出小三度（如 `Balloon.S910.pad` 第 3 軌純 1、5 音模式）。
  4. **帶導音與變化音之長主旋律 (如 `2010-1`《空港》)**：嚴禁套用 CM7 伴奏 NTT，必須採用「固定調性專屬 PAD (CM0000)」或注入小調專用 CASM。
- **固定調性 PAD 轉換鐵律 (Pure Fixed-Key Transposition Rule — 2026-11-21 實機驗收鎖定)**：
  - **適用邊界核心認知（實機終極結論）**：Multi Pad 和弦跟隨（Chord Match）並非對所有樂句皆可行，必須依 PAD 音樂內容分流：
    1. **可開 Chord Match**：僅限於純 1、5 音脈衝（如 `Balloon.S910.pad` 第 3 軌）、和弦刷弦等伴奏織體。
    2. **嚴禁開 Chord Match，必須使用指定調性**：凡帶有內在和聲轉折（如第 7 小節 $Am \to E7$）、演歌和聲導音（$G\#$）或旋律花音（$F\#$）之完整前奏/長主旋律，純靠琴端即時運算在物理上無法成立（琴端自然小調強行降音且換和弦會撕裂前半拍旋律）。唯一且 100% 依譜完美還原的途徑，就是採用「指定調性專屬 PAD (CM0000)」。
  - **音符位移**：全軌純剛體半音平移（Pure Semitone Pitch Shift），直接依基準調與目標調之半音差（如 Am ➔ Em 為 +7 半音）等距平移，100% 完整保留小調演歌導音（G# ➔ D#）、大六度花音（F# ➔ C#）與所有音程裝飾，零破壞零失真。必要時實施超過 C7 (96) 之八度折返保護。
  - **控制標記強制鎖定 `CM0000`**：Track 0 開頭第 1 個事件必須寫入 `CM0000`（全數 Chord Match = OFF），完全關閉琴端自然小調吸附。
  - **命名標籤規範**：Track 0 `N1~N4` 自動加上目標調性後綴（如 `Lead 1 (Em原調)`），提供琴端清晰識別。
  - **實機驗證結論**：此規則已在 Yamaha PSR-SX920 實體琴上針對《空港》Intro Pad（Am 調 vs Em 原調）進行完整發聲驗收，聲音 100% 準確無誤，作為後續系統轉調模組之唯一參考依據。
- **Multi Pad 建立、修改、匯入與轉調三位一體鐵律 (Enforced PAD Engineering Rules)**：
  - 未來系統在進行任何 Multi Pad 建立、編輯修改、匯入處理或調性轉換時，**必須強制遵守以下三大分類準則，嚴禁混淆倒退**：
    1. **長旋律 / 完整前奏（Intro / Solo / 跨小節帶和聲轉折）**：
       - **鐵律強制關閉 Chord Match（`CM = 0`）**。
       - 多調性需求一律透過「指定調性包（Pure Semitone Pitch Shift 剛體平移）」匯出，確保 100% 依譜發聲、演歌花音與導音零失真。
    2. **和弦跟隨模式（Chord Match = ON）適用邊界唯二合法場景**：
       - **場景 A（純和弦織體）**：純 1、5 音脈衝（如 `Balloon.S910.pad` 第 3 軌）、吉他琶音、刷弦、弦樂長音鋪底。
       - **場景 B（單和小節短插音）**：僅限於單一小節（或 1~2 小節）且「單一固定和弦中途不換和弦」的短動機/過門。
    3. **隨和弦連續變化的跨小節插音 / 副奏對位**：
       - **鐵律嚴禁做在 Multi Pad 內**，必須回歸節奏檔（`.STY`）的 `Phrase 1 (Ch 15)` 或 `Phrase 2 (Ch 16)` 聲部，借助 STY 專屬之 CASM `NTT = Melody` 與大小調雙軌分流來實現。
- **範本幽靈表演控制器與淡出曲線隔離清除鐵律（Ghost CC11 Expression Fadeout Elimination Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：切片裝配時若以現成 STY（如 `CHINA Ballad.T547.sty`）為範本，舊範本之 Intro/Ending 常寫入專屬該曲的**結尾漸弱淡出曲線**（如 Intro B 第 5 小節起，CC11 表情一路暴跌至 41，整段殘留多達 850 個幽靈 CC11 事件）。舊版僅清除舊音符（`NoteOn/NoteOff`），未清除舊控制器與舊彎音，導致新切入之電吉他（Phrase 2）在第 5 小節（第 30~33 節）被幽靈 CC11 扼殺音量，音量暴跌至不足三分之一，造成聽感上「吉他在後半段嚴重變小聲」。
  - **核心鐵律**：
    1. 切片覆寫聲部時，必須同步查核段落專屬 CASM 路由與 SFF1/SFF2 雙向鏡像通道表，徹底清除該聲部在該段落內部的所有舊表演控制器（`CC11` 表情、`CC1` 顫音、`CC64` 延音等）與舊彎音（`pitchBend`）。
    2. 在段落起始點（`absTick = range.startTick`）強制重設 `CC11 = 127`，確保 100% 飽滿表情進場，杜絕前段殘留。
    3. 來源 MIDI 之真實表演動態（如電吉他的真實 CC1 搖桿顫音 Modulation 152 顆）在切片時應予以提取並縮放時間軸同步注入伴奏軌，使琴端發聲忠實還原原廠生動音質！
- **切片起點跨小節邊界殘留音過濾鐵律（Boundary Bleed Note Elimination Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：切片裝配時，若來源音符在切片起點前就已發音（`startAbsTick < startTickSrc`，如前一小節最後一拍的弱起或分解和弦尾音），舊版將其起訖點截斷後強制塞入新段落的第 1 拍（`rel = 0`），導致新段落第 1 拍出現非本小節音符重新觸發（如 Main A 第 1 拍吉他重疊撞出兩顆音 Note 60 + Note 64；Main C 第 1 拍撞出前段殘留的 F 和弦；Main D 第 1 拍撞出高音怪音）。
  - **核心鐵律**：切片組裝提取音符時（`pushExtractedNote`），凡在切片起點之前即已發音之音符（`startAbsTick < startTickSrc`），鐵律一律直接排除，絕不人為重新觸發 NoteOn，確保每個段落第 1 拍 100% 乾淨純粹，徹底根除段落開頭的雙重音、爆音與雜音！
- **副歌 Main C / Main D 鈸音幽靈殘留與和弦聲部 NTT 修正鐵律（Chorus Crash Cymbal Bleed & Pad NTT Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：
    1. 來源 MIDI 於副歌進場前（第 33 小節第 4.5 拍與第 41 小節第 4.5 拍）有進入副歌之強烈過門鈸音（`Ch 9 Note 49 Crash Cymbal 1 vel=112`）與雙重掛留音（`Ch 11 Note 60 C4 vel=85`）。切片跨界音符截斷時將其強壓至 `rel = 0`（第 1 拍），導致琴端按下 Main C / Main D 觸發或每逢 8 小節循環起點時，第 1 拍皆爆發極大聲刺耳且突兀的 Crash 鈸音與雙重音碰撞。
    2. Main C / Main D 之弦樂長音/鋪底和弦（Pad，包含 C3-E3-G3 三和弦）被分配至 Phrase 1（Ch 14），其 CASM 預設被配置為單音旋律規則 `NTT = Melody`。當使用者在琴端換和弦（如彈 Am）時，NTT Melody 依旋律音程扭曲三和弦音高，導致副歌起拍伴奏產生嚴重走味與不諧和感。
  - **核心鐵律**：
    1. 伴奏循環段落（Main A~D）之第 1 拍（`rel = 0`），除樂曲正常 Bass/鼓點外，鐵律必須清除跨小節殘留之過門鈸音（`Crash Cymbal Note 49`）與重疊音，Yamaha 原廠伴奏於循環起拍亦絕不配置 Note 49 爆音。
    2. 凡承載多音和弦織體之聲部（如 Ch 14 / Ch 15 的三和弦鋪底），其 CASM 規則必須配置為 `NTT = Chord`，確保換和弦時音階導引與和聲轉調 100% 自然平滑。
- **全自動切片淨化管線與舊範本控制器深層淨化鐵律（Automatic Slicing Purge & Deep Controller Cleanse — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：
    1. Intro B（間奏）開頭鍵盤聲部（Ch 11）除正常 Dm 音符外，殘留前一段 Am 之 3 顆音（`Note 69, 72, 76`），造成起拍 Dm+Am 瞬間和聲碰撞；鼓組（Ch 9）起拍爆出 Note 49 Crash Cymbal（vel 110）。
    2. Ending A（尾奏）Ch 14 殘留 40 ticks（10ms）短音 `Note 69` 點擊雜音；且內部殘留舊範本（`CHINA Ballad.T547.sty`）多達 819 顆幽靈 CC11 表情淡出事件（開頭即被壓低至 125/97），扼殺伴奏聲部音量。
  - **核心鐵律（底層自動化固化，無原廠 STY 亦自動免疫）**：
    1. **起拍 Crash Cymbal 淨化**：伴奏循環（Main A~D）與前奏（Intro）第 1 拍（`rel = 0`），自動排除鼓組（targetChannel 9）的 Note 49/57 Crash Cymbal，保持大鼓與閉鈸乾淨進場。
    2. **微短切片毛邊過濾**：第 1 拍長度小於 60 ticks（約 15ms）之非音樂性切片毛邊一律自動排除。
    3. **全段落控制器深層淨化（Deep Purge）**：`YamahaStyleModifier.clearSectionNotes` 升級為清除音符、彎音與舊範本殘留之所有幽靈表演控制器（CC11、CC1、CC64），覆寫時在第 1 拍自動確保注入 `CC11 = 127` 滿表情。
    4. **實測驗證**：已實裝並通過 `tests/verify-direct-midi-slice-identical.test.ts`，確認未來直接載入 MIDI 重新切片產出之 STY 100% 具備相同乾淨品質。
- **段落起拍標準事件優先級與全域時序重整鐵律（Canonical MIDI Event Priority Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：
    1. **事件顛倒（Event Inversion Bug）**：在伴奏各段落起拍（`rel = 0` 即第 1 小節第 1 拍），舊版事件排序中，各通道的 `NoteOn` 早於 `CC0/CC32`（音色庫選取）、`Program Change (PC)`（樂器更換）與 `CC7`（音量）發送！在 Yamaha 實體琴（如 PSR-SX920）之音源晶片中，若音符剛起振（Attack 瞬間）立刻收到 PC 與音量更換指令，硬體音源 DSP 會被強制重新初始化該通道音色，造成第一拍音符瞬間窒息（Choke）、卡頓（Hiccup）或音色突變雜音。這正是為什麼「問題只出現在第 1 小節第 1 拍，而第 2、3 拍完全正常」（因為第 2、3 拍無 PC 與 Bank Select 指令）。
    2. **伴奏織體幽靈 CC11 表情曲線（Ghost CC11 Curves on Ch 13 & 15）**：舊範本在各 Main 段落的 Ch 13 與 Ch 15 殘留了漸弱/淡入淡出曲線（起拍音量被壓低至 53~69，僅半音量），隨後在第 2、3 拍暴衝，造成呼吸感錯亂與起拍無力。
  - **核心鐵律**：
    1. **標準 MIDI 事件優先級（`getMidiEventPriority`）**：在同一 Tick 下，事件派發順序鐵律鎖定為：
       `Meta (0~1)` ➔ `NoteOff (2)` ➔ `SysEx (3)` ➔ `CC0 (10)` ➔ `CC32 (11)` ➔ `Program Change (12)` ➔ `CC7 (20)` ➔ `CC10 (21)` ➔ `CC11 (22)` ➔ `其他 CC / PitchBend (25~30)` ➔ `NoteOn (40)`。
       確保琴端在收到 NoteOn 敲響音符前，音色、音量、表情與全域參數已 100% 準備就緒！
    2. **全域段落時序深層重整（`sanitizeAllSectionsEventOrderAndControllers`）**：全自動切片管線在裝配完成最後一步，強制遍歷所有段落（Main A~D, Intro, Ending, Fill In），清除伴奏軌中的幽靈 CC11/CC1/CC64 曲線，並依據標準事件優先級重新排序，確保產出之 STY 在琴端第 1 拍 100% 乾淨俐落發聲！
- **Fill In 過門聲部鏡像與琴端 Auto Fill In 無縫切換鐵律（Fill In Channel Mirroring & Auto Fill In Rule — 2026-11-22 實機驗收鎖定）**：
  - **病因診斷**：
    1. 琴端開啟 `[AUTO FILL IN]` 時，按 `[MAIN A~D]` 會強制中斷當前 Main 段落轉進對應的 `Fill In`。若伴奏檔中的 Fill In 段落未經切片替換（仍殘留舊範本內容），會因聲部通道不對齊（如舊範本缺少鋼琴 Ch 11、鼓點風格迥異）引發「過門突然被掐斷、樂器暴斃中斷或音色變樣」的聽覺斷層。
    2. Yamaha 琴端韌體對 4/4 拍過門切換內建嚴格的時間觸發窗口（Timing Window）：在第 3 拍或第 4 拍前半拍（4.0~4.2 拍）按下能順暢觸發過門；若拖到第 4 拍後半拍（> 4.5 拍）按下，琴端因剩餘時間不足會直接觸發超時保護（Time Window Expired），強制將當前音符全部掐斷（All Notes Off 靜音等待下拍）。
  - **核心鐵律**：
    1. **Fill In 聲部完全鏡像對齊**：所有 `Fill In AA / BB / CC / DD / BA` 切片裝配時，必須與 `Main A~D` 保持完全一致的聲部通道映射（如 Ch 9 鼓、Ch 10 貝斯、Ch 11 鋼琴、Ch 12 吉他），杜絕樂器突兀消失或風格打架。
    2. **過門段落專屬裝配**：進歌過門必須獨立切入對應的 Fill In 段落（如 Main B 專屬過門進 `Fill In BB`、副歌過門進 `Fill In CC`、高潮滾奏進 `Fill In DD`、留白進 `Fill In BA`）。
    3. **演奏手感鐵律**：實機彈奏開啟 Auto Fill In 時，按鍵最佳時間窗口為第 3 拍或第 4 拍前半拍（4.0~4.2 拍），避免第 4 拍後半拍觸發琴端超時掐斷。關閉 Auto Fill In 時則可完整聽完 8 小節 Main 自帶的結尾過門。
    4. **實機驗收定案**：使用者於 Yamaha PSR-SX920 實測補齊 Fill In 後，「幾乎和原廠的一模一樣了」，正式結案封存！
- **Multi Pad 原曲基準調自動判定與手動覆寫防呆同步鐵律（PAD Auto Key & UI State Invariance Rule — 2026-11-23 實機驗收鎖定）**：
  - **病因診斷**：
    1. **半終止屬音誤判（Half Cadence on Sol）**：以《月亮代表我的心》`7006-2_PAD.PAD`（C 大調）為例，該插音在第 2 小節半終止收束於屬音 G（Sol，音級 7）。舊版調性評估對「尾音收束主音」給予高達 30% 權重，且未區分全終止與半終止，導致將 C 大調誤判為 G 大調。
    2. **UI 手動改調脫節（UI State Desync）**：使用者在 UI 下拉選單中手動將基準調從 G 改為 C，畫面預覽即時顯示 C ➔ Eb (+3 半音)；但因未點擊「套用」或底層記憶體未即刻連動重算，當使用者直接點擊「💾 匯出轉換後 .PAD 檔案」時，匯出引擎直接打包記憶體中先前的 +8 半音舊狀態，產出走音的 `7006-2_PAD_Eb.PAD`。
  - **核心鐵律**：
    1. **調性演算法升級（首拍強拍主音 + 半終止屬音雙權重）**：
       - 首拍強拍（Bar 1 Beat 1 Downbeat）起音於主音給予強力加權；樂句尾音細分「全終止主音（1）」與「半終止屬音（5）」，屬音不越俎代庖判定為屬調。
       - 引入調外音與降七度衝突音扣分（如 G 大調出現大量還原 F 視為衝突扣分），徹底保證《月亮代表我的心》等流行曲目 100% 精準識別為 C 大調。
    2. **UI 手動覆寫即時連動**：
       - 下拉選單手動修改基準調或目標調時，若已套用平移，系統即刻以新調性重新計算音符。
       - 頂部徽章即時切換為 `🎯 手動指定基準調：X ｜ (原始自動估算: Y)`，向使用者清晰反饋手動覆寫生效。
    3. **匯出防呆強校驗（Export Invariance Guard）**：
       - 點擊匯出按鈕時，系統一律在寫入二進位檔案前，自動比對當前 UI 下拉選單（基準調、目標調、平移方向）與記憶體中的實際平移位移量。
       - 若偵測到不一致（如使用者選取後未手動點擊套用），匯出引擎**自動強制重新執行平移後再打包輸出**，徹底根除手動改調後匯出未同步的脫節 Bug！
    4. **跨 PAD 檔案記憶目標調性**：使用者批次轉換同一首歌的多個 PAD 時（如 7006-1 ➔ 7006-2 ➔ 7006-3），目標調（如 Eb）自動跨檔案記憶保留，避免每次重新選取的重複操作。
- **Yamaha CASM NTR/NTT 伴奏轉調規則與固定音高直通鐵律（2026-11-24 樂理與架構定案）**：
  - **二階段串聯架構**：Yamaha 琴端轉調為「第一階段 NTR（根音大位移／電梯）」＋「第二階段 NTT（和弦音階吸附／磁鐵）」。
  - **長旋律貫穿對位插音（如 C-D-E-F-G-A-B-C，左手每兩拍換和弦）**：
    - 鐵律：**音符絕對不改成 CM7，直接寫入真實音高**。
    - 唯一正確 CASM 配置：**`NTR = Root Fixed (0x01)` 且 `NTT = Bypass (0x00)`**，兩者缺一不可（停電梯 + 拔磁鐵），達成音高死死釘在原地、左手自由頻繁換和弦時右手絕不走音。
    - 若只有 `NTT = Bypass`（NTR = Transpose）：音程完好但整條旋律隨左手坐電梯忽高忽低。
    - 若只有 `NTR = Root Fixed`（NTT = Chord/Melody）：音符原地結巴，被和弦強烈磁吸變形。
  - **Intro / Ending 混搭防呆神技**：
    - 伴奏軌（Chord 1/2, Bass）配置 `Root Transpose + Chord`（左手彈伴奏時豐富飽滿跟隨）。
    - Solo 樂器軌（Phrase 1/2）配置 `Root Fixed + Bypass`（徹底解鎖樂手左手，前奏播放期間左手可自由按和弦彈奏伴奏，前奏 Solo 絕不受干擾、零走音翻車風險）。
  - 詳細規則完整文檔已整理於 [`docs/yamaha-ntr-ntt-guide.md`](docs/yamaha-ntr-ntt-guide.md)。
- **實機驗證先於系統整合原則**：
  - 所有 Multi Pad 和弦轉調與 CASM 修復演算法，一律在家中搭配 PSR-SX920 實體琴聆聽驗證確認無誤後，再行封裝上線至系統 UI，嚴禁未經實機驗證盲目修改系統主程式。

---

## 三、 上工與收工標準作業程序 (Session Lifecycle & Sync SOP)

為確保跨電腦（公司 ↔ 家裡）無縫接軌並自動固化每次對話解決的經驗，AI 必須嚴格遵守以下作業流程：

### 1. 收工同步程序（End-of-Session Sync & Auto-Learn SOP）
當使用者提出「備份」、「同步到 Git」、「準備收工」、「結束今天任務」或類似意圖時，**AI 必須自動執行以下四步自檢與固化**：
1. **問題解決盤點**：主動檢視本次會話是否排查了新 Bug、確認了新技術規範、或攻克了新樂理架構。
2. **自動固化記憶（Auto-Learn & Update Rules）**：
   - 若有新增已解決的關鍵技術決策，**主動將其寫入本檔案（`GEMINI.md`）之「第二節 已徹底解決並封存之技術鐵律」**，使其永久生效。
   - 若有任務完成，**主動同步更新 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)**，將其移入「✅ 一、 已完成並封存項目」，並清理「🚧 二、 當前待處理項目」。
3. **安全檢查與 Git 提交推送**：
   - 確保 `index-00.html` 與 `index - 0902.html` 未被更動。
   - 執行 `git add`、撰寫規範之繁體中文 Commit 訊息，並 `git push origin main`。
4. **回報同步結果與下次開工指引**：清楚告知使用者本次固化了哪些新記憶、推送了哪些 Commit，以及下次換電腦開工時的第一優先事項。

### 2. 開工接續程序（Start-of-Session SOP）
當使用者在新對話或換電腦說「開始開工」、「幫我同步 Git 資料」、「了解當前進度」時：
1. **主動同步最新資料**：第一時間執行 `git pull origin main`，確保本機程式碼、`GEMINI.md` 與 `PROJECT_STATUS.md` 為最新狀態。
2. **單一進度出發**：直接以 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) 之「當前待處理項目」為唯一指引，主動向使用者彙報目前進度與待辦事項，**絕對不翻出歷史舊問題重複確認**。
