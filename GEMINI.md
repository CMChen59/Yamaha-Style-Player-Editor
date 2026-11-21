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
