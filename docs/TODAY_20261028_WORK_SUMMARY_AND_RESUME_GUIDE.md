# 2026-10-28 工作總結與回家接續操作指南

## 一、 今日重要進展與決策

1. **獨立新專案建立（方案 A 落地）**：
   - 專案名稱：`Yamaha-Style-Player-Editor`
   - 本地路徑：`D:\Vibe Coding\Yamaha-Style-Player-Editor`
   - GitHub 儲存庫：`https://github.com/CMChen59/Yamaha-Style-Player-Editor.git`
   - 徹底告別舊專案的雙模 DOM 與舊版技術包袱，將單軌聚焦播放器提升為唯一首頁入口（`index.html`）。

2. **全套測試與構建 100% 通過**：
   - **TypeScript 編譯檢查**：`tsc --noEmit` 零錯誤。
   - **Vitest 自動化測試**：56 個測試套件、261 項單元與迴歸測試全數通過（100% Pass）。
   - **Vite Production Build**：最佳化產出成功。
   - **Git 版本庫**：本地與 GitHub 遠端 `main` 分支完全同步。

---

## 二、 今晚回家後的接續步驟（在家中電腦操作）

回到家後，請打開終端機（PowerShell 或 CMD），依序執行以下 4 步：

### 步驟 1：下載新專案
```bash
cd "您存放專案的目錄"  # 例如：cd "D:\Vibe Coding"
git clone https://github.com/CMChen59/Yamaha-Style-Player-Editor.git
cd Yamaha-Style-Player-Editor
```

### 步驟 2：安裝相依套件
```bash
npm install
```

### 步驟 3：啟動開發伺服器
```bash
npm run dev
```

### 步驟 4：開啟瀏覽器
在瀏覽器打開：
👉 **http://localhost:5173/**
即可看到純淨的單軌聚焦播放與編輯器！

---

## 三、 PSR-SX920 琴上實機驗證（若今晚有空測試）

昨天下載的驗證檔案（如 `LoveSong.T547.sty` 或導出的 STY）：
1. 將 STY 檔案放進 USB 隨身碟，插入 PSR-SX920。
2. 在琴上按 `[STYLE]` 選擇按鈕，切換至 `User` -> `USB1`。
3. 點選載入該 STY：
   - **檢查 1**：琴上螢幕是否正確顯示節奏名稱與 8 個伴奏聲部圖示。
   - **檢查 2**：按下 `[SYNCHRO START]` 彈奏左手和弦（如 C 和弦），確認 Main A~D、Fill-in、Intro 能正常觸發並跟隨和弦轉位。
   - **檢查 3**：按 `[OTS LINK]` 切換 OTS 1~4，確認右手主奏音色是否有正確切換。

---

## 四、 後續待執行計畫（Tier 1 功能清單）

回家或明天接續開發時，我們將依序實現以下核心編輯能力：
1. **多選與框選功能（Multi-select & Marquee Selection）**：
   - 支援滑鼠拉框選取多個音符、Shift+Click 連選、批次移動與刪除。
2. **批次力度調整（Batch Velocity Adjustment）**：
   - 配合頂部的滑桿與數值輸入框，等量調整所有選取音符的 Velocity。
3. **復原 / 重做（Undo / Redo, Ctrl+Z / Ctrl+Y）**：
   - 建立歷史動作堆疊，隨時可還原音符編輯操作。
4. **Yamaha 2,300+ 音色選擇器（Voice Picker）**：
   - 點選混音器卡片即可彈窗搜尋 SX920 內建音色，自動填入 MSB/LSB/PC。
