# 2026-10-29 工作總結與回家接續驗證指南

## 一、 今日重大進展（公司端完成的 4 大 Milestone）

今天專案在公司開發環境迎來了爆發性進展，全面完成了 **Tier 1-4、Tier 2-1、Tier 2-2 與 Tier 2-3**，將 Yamaha Style Player & Editor 提升至專業級伴奏 DAW 水準：

---

### 1. Tier 1-4：Yamaha 2,300+ 原廠音色選擇器 (Voice Picker Modal) 【✅ 100% 完成】
* **官方 2,300+ 完整音色庫資料庫**：
  - 完整收錄 Yamaha PSR-SX920 原廠音色（含 MSB、LSB、Program Change、分類、聲部推薦等）。
* **17 大分類標籤與 7 大音色類型篩選**：
  - 涵蓋鋼琴 (Piano)、電鋼琴 (E.Piano)、木/電吉他 (Guitar)、貝斯 (Bass)、弦樂 (Strings)、管樂 (Brass)、打擊樂 (Drum Kits) 等 17 大官方分類。
  - 支援快速標籤過濾：全部、推薦、S.Art!、MegaVoice、Live/Sweet/Cool、鼓組、警示。
* **即時模糊檢索**：
  - 支援輸入中英文名稱或 MSB-LSB-PC 數字代碼即時檢索。
* **專屬樂句試聽 (Audition Phrase)**：
  - 點擊音色卡時，系統依據樂器屬性自動觸發專屬示範樂句（鼓組打擊節奏、貝斯分解走路低音、鋼琴/吉他和弦分解）。
* **雙向二進位伴奏檔回寫 (Binary Re-voicing)**：
  - 點擊套用後，即時更新當前聲部 `PartVoiceInfo`，並精確寫回 STY 二進位檔頭與 CASM 轉調配置。

---

### 2. Tier 2-1：段落長度動態調整與跨段落克隆精靈 (Section Resize & Clone Studio) 【✅ 100% 完成】
* **段落小節長度調整 (Measure Resize)**：
  - 工具列提供 `[-1 小節]`、`[+1 小節]` 以及快速跳轉按鈕 `[2 小節]`、`[4 小節]`、`[8 小節]`。
  - **延伸模式 (Extend)**：小節數不足時以原段落音符平滑循環填充。
  - **裁切模式 (Truncate)**：縮短小節數時自動裁切並順移後續段落，保持 STY 結構合法。
  - 調整後即時重新計算總 PPQ、更新播放引擎循環週期，並同步重新渲染單軌鋼琴捲軸。
* **跨段落克隆精靈彈窗 (Section Clone Modal)**：
  - 支援將現有段落（如 Main A）一鍵完整複製至目標段落（如 Main B 或 Fill In AA）。
  - **聲部挑選克隆 (Selective Channels)**：提供全部 (All)、節奏與貝斯 (R&B)、和弦與襯底 (Chord) 快速過濾，亦可手動勾選個別聲部。
  - 複製時自動繼承來源段落之 CASM 轉調規則、小節數與音色配置。

---

### 3. Tier 2-2：音符時間量化與搖擺律動 (Note Quantization & Groove Shuffle) 【✅ 100% 完成】
* **多元網格解析度**：
  - 支援 `1/4`、`1/8`、`1/16`、`1/32` 以及三連音 `1/8T`、`1/16T` 精準吸附。
* **量化強度 (Quantize Strength 0% ~ 100%)**：
  - 100% 剛性量化 (Hard Quantize)：完全吸附至格線。
  - 1% ~ 99% 柔性量化 (Soft Quantize)：依比例向格線靠攏，保留手彈演奏之人性化動態。
* **搖擺律動 (Swing & Shuffle 50% ~ 75%)**：
  - 支援 `60% Light Swing`（輕微搖擺）與 `66.7% Triplet Shuffle`（三連音擺動）。
* **音符時值對齊 (Quantize Lengths)**：
  - 選項開啟時同步對齊發聲持續長度。
* **範圍與歷史支援**：
  - 有選取音符時僅量化選取範圍，未選取時量化全軌；完全整合 <kbd>Ctrl + Z</kbd> 復原與 <kbd>Ctrl + Y</kbd> 重做。

---

### 4. Tier 2-3：音高移調與八度升降 (Pitch Transpose & Octave Shift) 【✅ 100% 完成】
* **半音與八度微調**：
  - 提供 `[-1]`、`[+1]` 半音微調按鈕，以及 `[-8va]`、`[+8va]` 八度快速跳轉按鈕。
* **和弦和聲關係嚴格保持 (Chord Harmony Preservation)**：
  - 選取多顆音符或和弦時，集體移動並確保內部音程差 100% 不變形。
* **打擊樂軌道安全保護 (Drum Protection)**：
  - 當聚焦於 CH 9 (Rhythm 1) 或 CH 10 (Rhythm 2) 時，自動防呆鎖定移調按鈕並提示警示，避免誤將鼓組鍵位移調導致打擊樂器錯亂。
* **邊界極限保護**：
  - 嚴格受限於 MIDI 0 ~ 127 音高範圍，觸碰邊界時安全煞車。
* **完整整合 Undo / Redo**：
  - 移調操作完整推入歷史堆疊，可隨時一鍵還原。

---

## 二、 核心驗證項目 Checklist（今晚回家驗證）

### ✅ 項目 1：一鍵啟動與介面視覺確認
1. 滑鼠雙擊 `start.bat`。
2. 確認瀏覽器自動開啟 `http://localhost:5173/`。
3. 檢查介面新元件：
   - 混音台小卡：樂器名稱帶有專屬標籤，點擊可喚起音色選單。
   - 段落列右側：新增小節長度調整按鈕組（`-1`、`+1`、`2`、`4`、`8`）與 `[📋 克隆/衍生段落]` 按鈕。
   - 鋼琴捲軸上方：新增「量化」與「移調」工具列。

---

### ✅ 項目 2：Tier 1-4 原廠音色選擇器驗證
1. 點擊任一伴奏小卡（例如 CH 11 Bass 或 CH 12 Chord 1）的樂器標籤。
2. 確認彈出 **Yamaha 2,300+ Voice Picker** 視窗。
3. 點選不同分類（Piano, Guitar, Bass, Strings），確認清單即時切換。
4. 點選不同標籤（如 `MegaVoice` 或 `S.Art!`），確認篩選正確。
5. 在搜尋框輸入關鍵字（如 `CFX` 或 `DX` 或 `104-1-1`），確認即時過濾。
6. 點擊清單項目，確認聽見該音色之專屬試聽樂句（Audition Phrase）。
7. 點擊「確認套用」，確認小卡樂器名稱即時更新，並即刻以新音色發聲。

---

### ✅ 項目 3：Tier 2-1 段落長度調整與克隆驗證
1. **小節增減**：
   - 在 Main A 點擊 `+1` 或 `8`，確認頂部狀態列小節總數變更，鋼琴捲軸網格寬度即時等比擴展。
   - 播放該段落，確認游標能平滑跑滿完整小節數並循環。
2. **段落克隆**：
   - 點擊 `[📋 克隆/衍生段落]` 按鈕。
   - 來源選擇 `Main A`，目標選擇 `Main B`（或其他段落）。
   - 測試聲部快速篩選（全部 / 僅節奏與貝斯 / 僅和弦）。
   - 點擊「開始克隆」，確認目標段落按鈕高亮，並能立即播放剛複製過去的內容。

---

### ✅ 項目 4：Tier 2-2 音符量化與搖擺律動驗證
1. 在單軌編輯器隨意新增幾顆不對齊拍子的音符。
2. 點擊量化工具列的 `[⚡ 執行量化]`（預設 1/16 拍），確認音符自動吸附至最近的格線。
3. 切換為 `1/8T`（三連音），再次執行量化，確認音符吸附至三連音位置。
4. 調整 Swing 下拉選單為 `66.7% (Triplet Shuffle)`，確認後半拍音符適度推延，產生搖擺律動。
5. 按下鍵盤 <kbd>Ctrl + Z</kbd>，確認量化效果完整復原。

---

### ✅ 項目 5：Tier 2-3 音高移調與八度升降驗證
1. 選取一段旋律或分解和弦，點擊 `[+1]` 或 `[-1]`，確認音高即時升降且和弦音程保持一致。
2. 點擊 `[+8va]` 或 `[-8va]`，確認八度跳躍無誤。
3. 切換焦點至 CH 9 (Rhythm 1) 鼓組軌道，確認移調按鈕自動反灰禁用並提示打擊樂防護。
4. 按下 <kbd>Ctrl + Z</kbd>，確認移調操作完整復原。

---

### ✅ 項目 6：PSR-SX920 實體琴連線驗證（Web MIDI）
1. 將電腦以 USB-B 連接至 PSR-SX920 琴身的 USB-TO-HOST 插孔。
2. 網頁右上角切換 MIDI 輸出至實體琴。
3. 播放 `4006_SX900.T547.sty` Intro A：
   - 確認 Chord 1 鋼琴拉向右側 (`R32`)、Chord 2 雙木吉他拉向左側 (`L40`) 的開闊立體音場。
   - 確認全域總音量滑桿（Master Volume 0%~150%）拉動順手，琴端聲音飽滿不縮減。
4. 於網頁即時更換音色，確認琴身螢幕與喇叭發聲同步切換。

---

## 三、 目前測試覆蓋與代碼品質

* **Vitest 單元測試**：**68 個測試套件、342 項測試全數通過（100% Pass）**。
* **TypeScript 編譯檢查**：`tsc --noEmit` 零型別錯誤。
* **Vite Production Build**：打包最佳化成功。
* **Git 狀態**：本地與遠端 `origin/main`（Commit: `59d9f0a`）完全同步，工作區乾淨。


---

## 四、 今日夜間深度調試與重大架構修復全紀錄（容易受傷的女人.sty 與 Voice Picker 換音色）

在今晚進行實機 STY 檔案（`d:\Keyboard\節奏檔\容易受傷的女人\容易受傷的女人.sty`）比對測試時，深度挖掘並徹底修復了三項長期潛藏的關鍵底層機制問題：

### 1. 伴奏聲部混音與音量跨段落污染修復（Phase 1 & Phase 2）
* **問題現象**：載入琴端 `容易受傷的女人.sty` 後，Rh1 音色與音量錯亂（軟體顯示 0-0-104 聲音 80，琴上是 127-0-73 聲音 52；Rh2 與 Bass 音量未完全對齊；出現 Fill In BA 段落）。
* **根本原因**：
  1. `parsed.parts` 過去採全曲平鋪掃描，Ending A 的西塔琴（Sitar 0-0-104）與音量覆蓋了全曲初始設定。
  2. SFF1 傳統通道反推誤將 `8: 0` 映射，導致 Channel 8（Rh1）誤抓到 Channel 0 的西塔琴。
  3. 段落切換時缺乏起始小節控制器快照（Initial Controllers），無法動態響應段落專屬音量與音色。
* **修復方案**：
  1. **段落首音符控制器快照**：在 `YamahaSection` 擴充 `initialControllers`，解析各段落起始 Tick 的 CC 7/10/91/93 與 PC。
  2. **4 級階梯式動態混音**：`setupSectionMixing` 依序查核：段落控制器快照 ➔ 全域聲部 ➔ Yamaha SX920 原廠基準線（Volume 100, Pan 64, Reverb 40, Chorus 0）。
  3. **鼓組保護與解除 8:0 誤對應**：Dest 8（Rh1）移除 `8: 0` 回退，未映射時自動保持 Drums 分類，Ending A 西塔琴完全隔離於 Ending A。
  4. **Break 與 Fill In BA 雙向映射**：面板按鈕呈現 `Break (Fill In BA)`，紫色高亮標記。

---

### 2. 音色庫三聯號 1-based 索引與前綴聯想匹配（Voice Picker Search Engine）
* **問題現象**：Intro A 的 Phrase 1 是 `0-0-12`，在彈窗搜尋 `0-119-89`（另一個 STY 中的 `BellHeaven`）時顯示「查無相符音色（找不到）」，且輸入 `0-119-8` 中途時畫面直接變空白。
* **根本原因**：
  1. **分類鎖定陷阱**：Phrase 1 原音色為顫音琴（`Vibraphone`），分類屬 `Percussion (世界打擊)`。彈窗開啟時鎖定在世界打擊分類，導致 `Pad` 分類的 `BellHeaven` 被過濾隱藏。
  2. **琴端 1-based vs 底層 0-based PC 索引差異**：Yamaha 琴端螢幕顯示 Program 為 1~128（1-based），底層 MIDI 為 0~127（0-based）。琴端看到的 `0-119-89` 在底層其實是 `PC: 88`（`BellHeaven`）。原索引僅建置底層數值，未收錄琴端別名。
  3. **三聯號嚴格完全比對**：舊比對要求第三個數字必須完全等於樂器號碼，在 Bank 0-119 中沒有樂器編號剛好是 8，因此鍵入 `0-119-8` 還來不及打完 9 時瞬間變空白。
* **修復方案**：
  1. **雙軌雙向索引**：在 `yamaha-voices.ts` 同時建立琴端 1-based（`voice.pc + 1`）與底層 0-based（`voice.pc`）三聯號與 PC 標記。
  2. **全庫穿透檢索**：只要輸入三聯號，自動跨越 16 大分類全庫檢索，不受當前分類限制。
  3. **漸進前綴聯想匹配 (Typeahead Prefix Matching)**：
     - 輸入 `0-119` 或 `0-119-`：即時展開該 Bank 全部 28 款原廠音色。
     - 輸入 `0-119-8`：即時預測列出所有 8 開頭的音色（包含 `BellHeaven` PC:89、`SuperDarkPad` PC:90）。
     - 輸入 `0-119-89`：`BellHeaven`（琴端顯示 PC 89）置頂第一位。
  4. **伴奏旋律聲部預設全部音色**：Ch 11~15 彈窗預設為「全部音色 (ALL)」，並於查無結果時提供「🌐 在全部音色分類中搜尋」按鈕。

---

### 3. 自訂音色持久性保護與 CASM 雙向同步（Custom Voice Overrides & Playback Engine）
* **問題現象**：音色可以選取套用了，但實際發出的聲音或試聽依然是原本的顫音琴。
* **根本原因**：
  1. **CASM 來源通道回彈覆蓋**：SFF1 伴奏檔中 Intro A 的音符實際記錄在來源通道 Channel 2（CASM 映射至 Dest 14）。播放或段落循環時，`setupPartVoices` 會讀取 CASM 來源通道的原始初值（`0-0-12`），把使用者剛套用的新音色洗掉。
  2. **試聽示範 (Audition) 未切換合成器聲音模型**：彈窗點擊試聽時，未通知軟體合成器更新 `setVoice`。
* **修復方案**：
  1. **`customVoiceOverrides` 最高優先權機制**：在 `StyPlaybackEngine` 新增使用者自訂音色保護層。使用者手動換音色後，無論段落如何循環、切換，**強制以自訂音色為最高優先準則**，不允許被 CASM 覆蓋。
  2. **CASM 雙向逆向反查更新**：更換 Dest Ch 14 時，自動反查 CASM（`Src 2 -> Dest 14`），同步更新底層 SFF1 來源通道 2 在記憶體與 Track 0 中的音色，確保實體琴 MIDI 與軟體合成器 100% 同步。
  3. **試聽聲音模型即時響應**：點擊「▶ 試聽」時立即呼叫 `synth.setVoice` 切換物理模型，試聽聲音即時變更為 `Pad` 鋪底長音。

---

## 五、 全系統驗證成果

* **Vitest 單元測試**：**75 個測試套件、358 項測試全數通過（100% Pass）**。
  - 新增專屬測試 [`tests/voice-picker-search-triplet.test.ts`](file:///d:/Vibe%20Coding/MIDI/Yamaha-Style-Player-Editor/tests/voice-picker-search-triplet.test.ts)（8 項測試 100% 通過）。
  - 新增專屬測試 [`tests/test-voice-change-runtime.test.ts`](file:///d:/Vibe%20Coding/MIDI/Yamaha-Style-Player-Editor/tests/test-voice-change-runtime.test.ts)（運行期自訂音色持久性 100% 通過）。
  - 通過 [`tests/phase1-verification.test.ts`](file:///d:/Vibe%20Coding/MIDI/Yamaha-Style-Player-Editor/tests/phase1-verification.test.ts) 與 [`tests/phase2-verification.test.ts`](file:///d:/Vibe%20Coding/MIDI/Yamaha-Style-Player-Editor/tests/phase2-verification.test.ts)。
* **TypeScript 編譯檢查**：`tsc --noEmit` **0 型別錯誤**。
* **Vite 生產構建**：`dist/` 打包編譯成功無警示。

---

## 六、 明日接續測試事項 Checklist

明天開機繼續測試時，請依下列清單進行驗證與探索：

- [ ] **1. 多聲部更換音色實測**：
  - 測試為其他聲部（如 CH 10 Bass、CH 11 Chord 1、CH 12 Chord 2、CH 13 Pad、CH 15 Phrase 2）更換不同樂器家族（吉他、電鋼琴、弦樂、管樂等），確認各軌發聲完全獨立且互不干擾。
- [ ] **2. 伴奏檔匯出與 PSR-SX920 琴端載入實測**：
  - 點擊「匯出 STY 伴奏檔」，將產生的 `_edited.sty` 存入 USB 隨身碟。
  - 插上 PSR-SX920 琴端載入，確認琴上螢幕顯示的音色名稱、號碼（如 `0-119-89`）與實體喇叭發聲是否 100% 完全符合。
- [ ] **3. 跨 STY 伴奏相容性驗證**：
  - 載入其他 STY 伴奏檔（包含其他官方與自製 SFF1、SFF2 伴奏），確認本次的 4 級動態混音與自訂音色保護層在不同風格檔案下皆穩定運作。
- [ ] **4. 伴奏小節縮放與克隆再驗證**：
  - 測試在容易受傷的女人伴奏中，針對 Main A / Main B 進行小節數擴展（4 小節擴至 8 小節）或段落克隆，確認 CASM 轉調與音色持續保持正確。
