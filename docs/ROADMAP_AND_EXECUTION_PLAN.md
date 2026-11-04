# Yamaha Style Player & Editor 全階段執行藍圖與需求追蹤手冊 (Master Roadmap)

本手冊為 **Yamaha Style Player & Editor** 專案的唯一核心執行進度總表與動態需求追蹤庫。

所有經過討論確立之開發階段、功能任務、原廠規格校準項目，以及後續新增之優化需求，皆統整於此，作為後續執行的最高依據與歷史對照，以確保功能不遺漏、進度有脈絡、架構清晰嚴謹。

---

## 🚦 總覽看板（Status Dashboard）

```mermaid
flowchart LR
    P1["🎯 階段一：原廠規格校準<br/>(4 項，待啟動)"] --> P2["🎹 階段二：編輯手感大躍進<br/>(3 項，待啟動)"]
    P2 --> P3["🚀 階段三：真實演奏跳段<br/>(2 項，規劃中)"]
    P3 --> P4["🏆 階段四：旗艦樣式工廠<br/>(3 項，長期目標)"]

    classDef pending fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;
    classDef inprogress fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#60a5fa;
    classDef done fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#34d399;

    class P1,P2,P3,P4 inprogress;
```

- **目前版本**：V2.4 (Focus Editor with Plan D Progression & SFF-GE Full-Octave Engine)
- **最新測試通過率**：102 個測試套件、487 項測試 100% 綠燈通過 (ALL PASS)
- **參考規範文檔**：[`docs/references/README.md`](file:///D:/Vibe%20Coding/Yamaha-Style-Player-Editor/docs/references/README.md)（含《MIDI Song to Style》官方手冊與 PSR-SX920 官方 Data List）

---

## 📋 四階段詳細執行任務清單

### 🎯 階段一：原廠規格校準與體驗防呆（Phase 1: Factory Spec Alignment）
> **定位**：花費最少開發時間，將剛剛獲得的原廠手冊黑科技注入現有系統，徹底杜絕怪音與段落操作痛點。

- [x] **【任務 1-1】Intro / Ending 輪播智慧掛起防呆 (Smart Progression Suspend)** (✅ 已完成)
  - **背景與依據**：手冊第 16、26、32 頁指出，Intro 與 Ending 具有獨立 `Section Key`，是以原曲旋律為導向的單次播放段落，不應隨意套用伴奏轉調。
  - **具體實作**：
    - 切換至 `Intro A~C` 或 `Ending A~C` 時，自動掛起「多小節自動輪播」，維持單一原調（C）。
    - 畫面上方提示：「🎵 目前為前奏/尾奏段落，已自動維持原調以保護原曲旋律」。
    - 切回 `Main A~D` 時，自動無縫恢復使用者設定的多小節和弦輪播。
  - **工時預估**：0.5 天 ｜ **優先級**：⭐⭐⭐⭐⭐ (極高)

- [x] **【任務 1-2】MegaVoice C6 (Pitch ≥ 96) 全音軌雜音直通防護** (✅ 已完成)
  - **背景與依據**：手冊第 31 頁載明 `Hi Zone Mega Voice (C6 or higher will not be converted)`。C6 以上映射吉他滑弦、琴弦摩擦、敲琴板音效，嚴禁轉調。
  - **具體實作**：
    - 在 `ChordTransposer.transposeSingleNote` 開頭加入通用防護：凡是屬於 MegaVoice 且音高 ≥ 96（C6）之音符，一律直通回傳原音。
  - **工時預估**：0.5 天 ｜ **優先級**：⭐⭐⭐⭐⭐ (極高)

- [x] **【任務 1-3】動態 CASM HiKey 轉調八度折返決策** (✅ 已完成)
  - **背景與依據**：手冊第 30~31 頁指出各軌 CASM 擁有獨立的 `hiKey (0~11)`，決定目標和弦根音大於該鍵時強制向下翻八度（-12）。
  - **具體實作**：
    - 將目前固定的 F#(6) 分界，改為優先讀取 CASM 該軌的 `hiKey` 參數（若無則 fallback 至 6，Bass 預設為 5 即 F）。
    - 確保 Bass 聲部永遠維持在渾厚低音區，避免低音大跳。
    - 完整支援二進位 CASM Ctb2 解析、寫入與播放引擎實時調和。
  - **工時預估**：1 天 ｜ **優先級**：⭐⭐⭐⭐

- [ ] **【任務 1-4】官方 2,478 行音色資料庫一致性校驗 (Voice DB Diff Check)**
  - **背景與依據**：利用新獲得的官方 `docs/references/psr-sx920/Yamaha_PSR-SX920_VoiceList.txt`。
  - **具體實作**：
    - 撰寫測試腳本自動比對 `yamaha-sx920-datalist.json`，核對全數 MSB / LSB / PC 與官方前綴（`S.Art`, `Live!`, `Cool!` 等）。
  - **工時預估**：0.5 天 ｜ **優先級**：⭐⭐⭐⭐

---

### 🎹 階段二：單軌編輯器交互大躍進（Phase 2: Editor UX & Production Power）
> **定位**：將單軌聚焦編輯器推升至專業 DAW（如 Cubase、Logic Pro）級別的編輯手感與生產力。

- [ ] **【任務 2-1】Tier 2-4：樂句剪貼簿 (Clipboard: Copy / Cut / Paste)**
  - **具體實作**：
    - 快捷鍵支援：<kbd>Ctrl + C</kbd> 複製選取音符、<kbd>Ctrl + X</kbd> 剪下、<kbd>Ctrl + V</kbd> 貼上。
    - 支援游標位置貼上、小節線對齊貼上、跨小節與跨音軌複製。
    - 保持選取音符之相對 Tick 差距與力度。
    - 完整整合 Undo/Redo 歷史堆疊 (<kbd>Ctrl + Z</kbd> / <kbd>Ctrl + Y</kbd>)。
    - 建立 `tests/single-track-clipboard.test.ts` 自動化測試。
  - **工時預估**：1.5 ~ 2 天 ｜ **優先級**：⭐⭐⭐⭐⭐ (核心里程碑)

- [ ] **【任務 2-2】Tier 2-5：多音符批次編輯面板 (Batch Inspector)**
  - **具體實作**：
    - 框選多顆音符後，展開批次微調面板：
      - **力度縮放 (Velocity Scale)**：80% ~ 120% 比例縮放、±Offset 平移。
      - **時值伸縮 (Gate Time / Duration)**：50% ~ 150% 比例伸縮（批次拉長/縮短延音）。
      - **音高批次移調 (Transpose)**：±半音、±八度。
  - **工時預估**：1.5 ~ 2 天 ｜ **優先級**：⭐⭐⭐⭐⭐ (高度實用)

- [ ] **【任務 2-3】SFF-GE 吉他琶音與掃弦動態進階微調**
  - **具體實作**：
    - 依使用者回報之琶音精緻度，調校吉他高低把位（Capo Position）。
    - 加入掃弦力度微延遲（Strum Velocity Gradient），模擬吉他彈片掃過 6 根琴弦的細膩時間差。
  - **工時預估**：1 天 ｜ **優先級**：⭐⭐⭐

---

### 🚀 階段三：真實電子琴演奏流暢度（Phase 3: Live Performance & Song Flow）
> **定位**：突破目前「單一段落無限循環」的侷限，在電腦端排練整首流行歌曲結構。

- [ ] **【任務 3-1】段落單次播放與自動接段 (Auto Transition / Loop Toggle)**
  - **背景與依據**：手冊第 16 頁之 `🔁 Loop On/Off` 機制。
  - **具體實作**：
    - Intro / Fill In / Ending 提供「單次播放」模式。
    - 按 Intro 播完自動切入 Main A；按 Fill In 播完 1 小節過門自動無縫切入 Main B。
  - **工時預估**：1.5 天 ｜ **優先級**：⭐⭐⭐⭐

- [ ] **【任務 3-2】實體琴 Web MIDI 狀態同步增強**
  - **具體實作**：
    - 實體琴踩下 Sustain 踏板（CC 64）或轉輪動態時，軟體端控制線與狀態即時聯動高亮顯示。
  - **工時預估**：1 天 ｜ **優先級**：⭐⭐⭐

---

### 🏆 階段四：旗艦級樣式工廠（Phase 4: Style Assembler & OTS Workshop）
> **定位**：超越單一 STY 編輯，打造屬於自己的風格生產線與經典曲庫工坊。

- [ ] **【任務 4-1】Tier 3-1：樣式組合器 (Style Assembler / Part Stager)**
  - **具體實作**：
    - 跨檔案聲部混搭：抽取 A 風格的鼓組 ＋ B 風格的吉他 ＋ C 風格的弦樂，自由組合成全新 `.sty` 檔。
    - 嚴格保留 SFF2 二進位 CASM 轉調與 Track 0 SMF0 結構。
  - **工時預估**：3 ~ 4 天 ｜ **優先級**：⭐⭐⭐⭐⭐ (長期旗艦目標)

- [ ] **【任務 4-2】Tier 3-2：OTS 單鍵音色編輯器 (One Touch Setting Editor)**
  - **具體實作**：
    - 利用 `BonusPlaylist` 與官方音色庫，直接在軟體內編輯伴奏內附的 4 組 OTS 右手音色與效果器配器。
  - **工時預估**：2 ~ 3 天 ｜ **優先級**：⭐⭐⭐⭐

- [ ] **【任務 4-3】Tier 3-3：風格資料庫分類管理 (Style Library Browser)**
  - **具體實作**：
    - 依據官方 Data List 的 16 大曲風分類，打造本機幾百個 STY 檔案的集中預覽與搜尋台。
  - **工時預估**：2 天 ｜ **優先級**：⭐⭐⭐

---

## 📥 後續新需求與優化提案追加區 (Backlog)

> 💡 **維護規範**：日後若在討論中有任何新靈感、使用痛點或新功能需求，確認後請直接依下方格式追加至本區，並在排定階段後移入對應清單中。

```markdown
### 📝 [待排程] 需求範本：
- **提案日期**：YYYY-MM-DD
- **需求描述**：
- **預期效果**：
- **技術考量與模組**：
- **建議排入階段**：階段 X
```

---

## 📜 已完成歷史里程碑存檔 (Completed Milestones Archive)

- [x] **Plan A：單軌聚焦編輯視圖 (Focus Track Piano Roll & Drum Grid)** 【✅ 2026-10-27】
  - 徹底解決 8 軌同時滾動之主執行緒卡頓，負載降低 85%，滿版 4 小節自適應。
- [x] **Plan B：CC 控制線自動化編輯 (Automation Lanes)** 【✅ 2026-10-28】
  - 支援 CC 11 表情、CC 7 音量、CC 10 聲相、CC 64 踏板、CC 91 殘響曲線繪製。
- [x] **Plan C：8 軌卡牌混音台空間效果器 (Mixer Console)** 【✅ 2026-10-29】
  - 支援 CC 91 Reverb、CC 93 Chorus 推桿，連按兩下雙擊快速重設為原廠值（40/0）。
- [x] **Plan D：多小節和弦進行自動輪播 (Auto-Advance Chord Progression)** 【✅ 2026-11-01】
  - 8 種流行/卡農和弦預設，依小節自動推進轉調，全彩和弦膠囊即時高亮。
- [x] **小調刺耳 G# 導音衝突消除 (Minor Harmonization)** 【✅ 2026-11-02】
  - C 轉 Am 時大七度 B 音自動調和為純淨自然小七度 G（$11-3-1=7$），徹底杜絕尖銳雜音。
- [x] **NTT = 2 / 130 和弦音智慧吸附矩陣 (Chord Tone Snapping)** 【✅ 2026-11-02】
  - 純大三和弦大七度外音自動吸附至根音；小調強制攔截至五度或小七度。
- [x] **SFF-GE 全八度模數吉他弦位解碼矩陣** 【✅ 2026-11-02】
  - 解決《容易受傷的女人》Chord 1 播放 8 小節走音，64 顆音符 100% 收斂至吉他 6 弦琶音。
- [x] **使用者常見問答知識庫手冊建立 (docs/USER_QA_KNOWLEDGE_BASE.md)** 【✅ 2026-11-03】
  - 收錄 Q1~Q9 全套音色、延音、轉調、二進位安全指南。
- [x] **Yamaha 官方參考資料庫完整歸檔備份 (docs/references/)** 【✅ 2026-11-04】
  - 收錄《MIDI Song to Style》官方手冊、PSR-SX920 2,478 行全音色表、Data List 與 Bonus Playlist。
