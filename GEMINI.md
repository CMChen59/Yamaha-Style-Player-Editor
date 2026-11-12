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

### 3. MIDI 全景透視與切片 UI 已定案設計
- **Big5 / GBK 雙重編碼自動偵測**：[`yamaha-parser.ts`](src/core/parser/yamaha-parser.ts) 已支援中文軌道名稱與歌詞標記無亂碼解析。
- **伴奏映射呈現規範**：以**樂器名稱為主、原曲 MIDI Ch 為輔**，方便使用者直覺核對。
- **按鈕防跳動與狀態同步**：
  - 頂部橫幅「🎧 獨奏此軌 / ⏹ 解除獨奏」與切片彈窗「🎧 試聽純伴奏 / ⏹ 停止試聽純伴奏」均已鎖定固定最小寬度（`min-width`），且播放結束或停止時會自動復原按鈕狀態與通道靜音。
- **多段落累積工作流**：
  - 切片裝配後不論點擊「▶ 進入伴奏模式試聽」、「✂️ 繼續切片其他段落」或「💾 匯出 STY 檔」，所有段落皆自動累積保存在同一個 `workingStyleParsed` 伴奏專案中；區間內 0 音符之聲部統一標示為 `💤 此區間未進場 (0 音符)`。
