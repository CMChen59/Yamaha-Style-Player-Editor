# Yamaha 原廠官方規格與參考資料庫 (Official Reference Library)

本目錄彙整並備份了 Yamaha 原廠發布的旗艦琴（**PSR-SX920 / Genos2**）專屬技術手冊、資料清單、音色定義腳本與官方曲庫設定，作為本專案開發伴奏播放、編輯器、轉調演算法與音色庫對齊的核心權威規範。

---

## 📁 目錄結構索引

```text
docs/references/
├── manuals/                                       # 官方工具軟體與技術手冊
│   ├── MIDI_song_to_style_OM_En_A0.pdf            # 《MIDI Song to Style》官方使用手冊 (V1.1.0, 34 頁)
│   └── MIDI_song_to_style_v120_SM_En_A0.pdf       # 《MIDI Song to Style》V1.20 補充手冊 (2026/01 最新版)
│
├── psr-sx920/                                     # Yamaha PSR-SX920 旗艦琴硬體專屬資料
│   ├── Yamaha_PSR-SX920_VoiceList.txt             # 官方全音色腳本 (2,478 行，含所有 MSB/LSB/PC 三聯號身分證)
│   ├── psrsx920_sx720_dl_zh_a0.xlsx               # 官方中文 Data List 總表 (音色表、內建伴奏型列表、效果器清單)
│   ├── psrsx920_sx720_additional_dl_zh_a0.xlsx    # 官方補充數據清單 (包含追加音色與更新資訊)
│   ├── BonusPlaylistForPSR-SX920.zip              # 官方紅利演奏清單 (16 大曲風數百首名曲 .rgt 註冊記憶檔)
│   ├── BonusPlaylist_ReadMe.txt                   # 官方紅利演奏清單使用說明
│   └── psr_sx920_voice_guide_menu_ids.txt         # 官方面板按鍵與觸控螢幕功能 ID 對照清單
│
└── README.md                                      # 本說明索引文件
```

---

## 🔍 各項參考資料之核心用途與系統對應

### 1. 《MIDI Song to Style》官方手冊（`manuals/`）
- **核心價值**：
  Yamaha 官方於手冊 **第 29 ～ 33 頁** 正式公開了其原廠伴奏風格（SFF / SFF GE）的底層轉調與 CASM 核心規則：
  - **MegaVoice 音色保護（P.31）**：高於 C6（Pitch ≥ 72）的音符為雜音與特效觸發區，一律禁止轉調（Will not be converted）。
  - **吉他專屬參數（P.32）**：明定 `Guitar Stroke`（掃弦）與 `Guitar Arpeggio`（琶音）之處理邏輯。
  - **轉調限制邊界（P.30）**：`HiKey`（高音鍵）、`LoLim / HiLim`（最低/最高音折疊限制）與轉調模式（`Root only`、`Root & 5th`、`Semi-active Bass`、`Stable for Main`、`Active for Main`）。
  - **段落調號（Section Key, P.26）**：指出 Intro 與 Ending 係以原曲 Section Key 原汁原味呈現旋律，不應在中間任意強加多小節和弦進行轉調。
- **對應程式碼模組**：
  - [`src/core/writer/chord-transposer.ts`](file:///D:/Vibe%20Coding/Yamaha-Style-Player-Editor/src/core/writer/chord-transposer.ts)
  - [`src/player/sty-playback-engine.ts`](file:///D:/Vibe%20Coding/Yamaha-Style-Player-Editor/src/player/sty-playback-engine.ts)

---

### 2. PSR-SX920 官方全音色定義表（`Yamaha_PSR-SX920_VoiceList.txt`）
- **核心價值**：
  收錄 PSR-SX920 全部 1,500+ 款原廠樂器、鼓組之標準定義。
  格式為：`[p2, ProgramChange, BankMSB, BankLSB] VoiceName`。
  範例：
  - `[p2,0,104,21] S.Art CFX ConcertGrand`
  - `[p2,25,104,13] Live! SteelGuitarTwin2`
  - `[p2,32,104,26] S.Art VintageRoundBass`
  - `[p2,0,127,0] Pop Drum Kit`
- **對應程式碼模組**：
  - [`src/core/data/yamaha-voices.ts`](file:///D:/Vibe%20Coding/Yamaha-Style-Player-Editor/src/core/data/yamaha-voices.ts)
  - [`src/player/voice-picker-modal.ts`](file:///D:/Vibe%20Coding/Yamaha-Style-Player-Editor/src/player/voice-picker-modal.ts)

---

### 3. PSR-SX920 官方 Data List 總表（`psrsx920_sx720_dl_zh_a0.xlsx`）
- **核心價值**：
  包含「伴奏型列表（Style List）」，列出 PSR-SX920 原廠預載的數百種風格（8Beat, 16Beat, Pop, Rock, Jazz, Latin, Movie...）之標準 Tempo、拍號與段落編排；以及全機效果器（Reverb, Chorus, DSP）預設參數。
- **對應程式碼模組**：
  - 未來伴奏分類庫（Style Browser）與 Tier 3 樣式組合器（Style Assembler）

---

### 4. 官方紅利演奏清單（`BonusPlaylistForPSR-SX920.zip`）
- **核心價值**：
  由 Yamaha 原廠頂尖調音工程師調配的數百首世界名曲（*All My Loving, Autumn Leaves, Can't Help Falling In Love* 等）實機設定檔（`.rgt`）。
- **研發價值**：
  作為分析 Yamaha 原廠 OTS（One Touch Setting）單鍵音色配置、面板平衡（Mixer）、Reverb/Chorus 發送量比例的權威實機樣本。
