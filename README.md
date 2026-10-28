# 🎹 Yamaha Style Player & Editor (Yamaha STY 單軌聚焦編輯與播放器)

專為 **Yamaha 自動伴奏風格檔（.STY / .PRS / .SST）** 打造的現代化輕量級 Web 播放與編輯工作台。

針對過往多軌同時渲染卡頓與掉拍的痛點，本專案首創**「單軌聚焦工作台（Focus Track Editing）」**架構，結合雙時鐘超前排程技術，達成全曲合奏 **100% 零延遲、零掉拍**，並完美支援 **Yamaha PSR-SX920** 旗艦電子琴硬體直連與二進位安全匯出。

---

## 🌟 核心特色 (Core Features)

1. **零延遲高精度排程引擎**
   - 雙時鐘微秒級超前佇列（Lookahead Scheduler ＋ Hardware Web Audio Clock），完全消除 JavaScript 計時器漂移與掉拍。
   - 8 大伴奏聲部（Rhythm 1/2, Bass, Chord 1/2, Pad, Phrase 1/2）同步發聲極致流暢。

2. **單軌聚焦工作台 (Focus Track Piano Roll & Drum Step Grid)**
   - 8 軌卡牌混音台一鍵切換焦點聲部，每次僅加載該聲部音符，主執行緒負載降低 85% 以上。
   - 視野保證：DOM clientWidth 動態測量，保證 1.1 ~ 4.4 整整 **4 個小節在任何螢幕解析度下邊對邊滿版呈現、不被裁切**。
   - 鼓組智慧圖示（大鼓、小鼓、腳踏鈸、通通鼓等）與鋼琴黑白鍵高亮根音。

3. **直覺力度調控（捨棄柱狀圖）**
   - 廢棄傳統佔空間且不易點選的底部柱狀圖（Histogram）。
   - 改採**水平滑動拉桿（1~127）＋ 精確數字輸入框（1~127）**雙向連動，支援點選音符即時讀取/試聽、無選取時作為預設寫入力度。

4. **即時互動編修 (Interactive Note Editing)**
   - **點擊空白處新增**：自動吸附網格量化單位（1/16、1/8、1/4、1/32 拍）。
   - **音符選取與試聽**：點選即時發出該樂器音色。
   - **快捷刪除**：鍵盤 <kbd>Delete</kbd> / <kbd>Backspace</kbd>、滑鼠右鍵直接點選刪除、工具列刪除按鈕。
   - **自由移位**：按住音符可左右移動時間軸（量化吸附）或上下調整音高/打擊樂器。
   - **時值伸縮**：音符右緣白色把手拖動即可伸縮發聲持續時間。
   - **邊播邊改**：即時回寫播放排程器，播放中修改音符完全不中斷音樂。

5. **二進位安全匯出 (Lossless STY Binary Export)**
   - 具備 100% 反向重新解析檢驗（Round-trip Self-Check）。
   - **Byte-level 嚴格保留 CASM（Yamaha 和弦轉調控制區塊）與 OTS（右手單鍵設定音色區塊）**，確保在實體電子琴上自動伴奏和弦轉調功能完全正常、永不損壞。
   - 一鍵匯出 `{原檔名}_edited.sty`，存入 USB 隨身碟即可直接插琴演奏。

6. **Yamaha PSR-SX920 Web MIDI 直連支援**
   - 透過 USB-B 線連接電腦與琴端，可一鍵切換為實體琴發聲模式。
   - 聆聽 PSR-SX920 原廠最高音質 AWM2 立體聲音源，打造軟硬一體專業音樂工作站。

---

## 🚀 快速開始 (Quick Start)

### 1. 安裝相依套件
```bash
npm install
```

### 2. 啟動本機開發伺服器
```bash
npm run dev
```
瀏覽器自動或手動開啟：`http://localhost:5173/`

### 3. 執行測試套件
```bash
npm test
```

### 4. 正式打包建置
```bash
npm run build
```

---

## 📁 專案目錄結構

```text
Yamaha-Style-Player-Editor/
├── index.html                    # 唯一旗艦工作台首頁入口 (升格自 player.html)
├── package.json                  # 專案相依配置
├── tsconfig.json                 # TypeScript 編譯規則
├── vite.config.ts                # Vite 建置與測試設定
├── public/                       # 靜態資源與示範伴奏檔
│   └── samples/                  # LoveSong.T547.sty, 4006_SX900.T547.sty 等
├── docs/                         # 規格文檔與 PSR-SX920 真機驗收指南
├── tests/                        # 核心單元測試套件
└── src/
    ├── core/                     # STY/CASM/OTS 二進位解析與回寫核心 (Battle-tested)
    │   ├── parser/               # Yamaha SFF1/SFF2 解析器
    │   ├── writer/               # YamahaWriter, StyleModifier, BinaryWriter
    │   ├── models/               # MIDI 與伴奏資料型別
    │   └── audio/                # Web MIDI 管理器
    └── player/                   # 播放器與單軌編輯器模組
        ├── sty-playback-engine.ts # 微秒級兩時鐘超前排程引擎
        ├── single-track-editor.ts # 單軌鋼琴捲軸與鼓組網格
        └── player-app.ts         # 主控制器
```

---

## 📜 授權協議 (License)

Private & Proprietary. All rights reserved.
