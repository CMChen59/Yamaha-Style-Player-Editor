# Yamaha Style Player & Editor 工作成果與待排查問題紀錄

**紀錄日期**：2026-11-01  
**適用琴型**：Yamaha PSR-SX920 / PSR-SX900 / Genos / Tyros 系列伴奏檔（SFF1 / SFF2）

---

## 一、 今日已完成核心里程碑總覽（實體驗證 OK）

今日我們深入攻克了 Yamaha 伴奏核心中最深奧的 **SFF-GE 吉他專利轉譯** 與 **CASM NTT 來源和弦音階調和引擎**：

1. **🎸 SFF-GE (Guitar Edition, NTR = 2) 吉他指法轉調引擎實裝**：
   - 解決了 `LoveSong.STY` 中 Chord 2（A.Guitar）音符不對的問題。
   - 建立了 `GuitarVoicing` 模型與全 12 調開放/封閉和弦指法表（`GUITAR_VOICING_PRESETS`）與 CAGED 備援機制。
   - 實作了吉他虛擬觸發音碼轉換（48=根音、50=第6弦、52=第5弦、53=第4弦、55=第3弦、57=第2弦、59=第1弦），保留 MegaVoice 琴體打擊噪音（>= 90）。
   - 成功將吉他音符正確解碼為清脆自然的 Travis Picking 分解和弦指法（C3, E3, G3, C4, E4）。

2. **🎹 CASM 來源音軌仲裁與多音伴奏恢復**：
   - 解決了 `LoveSong.STY` Main A 的 Chord 1（鋼琴）在軟體上只有單一顆音符（Note 60）的問題。
   - 在 `getActiveSourceChannel` 中加入原生同名伴奏軌優先權（`srcCh === destCh`），自動過濾僅具單音根音導引的輔助軌（`Piano rt`，`... rt`），讓含有 50 顆音符的鋼琴主柱狀和弦軌道正確發聲。
   - 解除原先誤將 7th 聲部完全靜音的邏輯，讓 Strings1（Ch 13）底層弦樂正常放行。

3. **🎼 Yamaha CASM NTT 來源和弦音階動態調和引擎（NTT Harmonization）**：
   - **問題排查**：使用者反饋「單按 C 調按鍵是 C 調，但按播放全曲時聽起來不確定是什麼調、產生怪音跑調」。
   - **根本原因**：
     - `LoveSong.STY` 的 Main A 鋼琴（Ch 11）與弦樂（Ch 13）原始錄音是用 **C7 (屬七和弦，chordType = 14)** 錄製，原始音符包含 `Bb3(58), Eb4(63), F4(65)`。
     - 引擎在播放 C 大調時直通原音，導致吉他的「還原 E（大三度）」與鋼琴/弦樂的「降 E（小三度）」、「降 B（小七度）」劇烈碰撞，產生混亂調性怪音。
   - **解決方案**：
     - 在 `ChordTransposer.transposeSingleNote` 中實作來源和弦音階調和：
       - 當來源為屬七和弦且目標為大調時，自動將 `Bb (+2) -> C`（根音）、`Eb (+1) -> E`（大三度）、`F (+2) -> G`（五度音）。
       - 鋼琴軌發聲立即調和為純淨的 `[C4(60), E4(64), G4(67)]`（純 C 大調三和弦原位），弦樂調和為 `[G3(55), C4(60), E4(64)]`。
       - 徹底消除半音打架衝突，全樂團純淨齊奏！
     - 同時加入來源為小調（`chordType = 8`，如 4006 Intro A）的保護，小調環境下 100% 保持原始 Cm 錄音。
   - **驗收結果**：**使用者實測反饋 LoveSong.STY 的 Main A 目前播放完全正常**！

---

## 二、 待排查與接續處理問題（Pending Issues）

使用者在驗證時記錄下後續待排查的重點：

1. **4006_SX900.T547.sty 的 Main A 播放感覺還是不太對**：
   - **待查方向**：
     - 檢查 4006 Main A 各聲部（CH 8 ~ 15）在 CASM 中的 `srcCh` 映射、`chordType`、`ntr`、`ntt` 設定。
     - 檢查是否有類似的輔助軌搶佔、或小調/大調混用、或 SFF2 吉他聲部的轉調設定需要適配。
2. **容易受傷的女人.sty 的 Main A 播放感覺還是不太對**：
   - **待查方向**：
     - 檢查《容易受傷的女人.sty》Main A 的 CASM 結構。
     - 檢查各軌道的來源和弦類型、吉他軌道與鋼琴軌道的和弦轉換設定。

---

## 三、 測試與雲端備份狀態

- **單元與整合測試**：全系統 **99 組測試檔案、481 項測試 100% 通過（全綠燈）**。
- **TypeScript 型別檢查**：`tsc` 0 錯誤、0 警告。
- **生產環境構建**：`vite build` 成功完成。
- **GitHub 雲端備份**：
  - Commit ID：`fed1b63`
  - Commit Message：`fix(transposer): implement Yamaha NTT source chord harmonization for 7th and minor tracks`
  - 遠端倉庫：`https://github.com/CMChen59/Yamaha-Style-Player-Editor.git` 已同步最新進度。

---

## 四、 下次啟動接續指南（How to Resume）

下次繼續對話時，只需輸入以下指令即可快速接續：
- 「**繼續排查 4006 與容易受傷的女人的 Main A 播放問題**」
- 開發環境常用指令：
  - 啟動本機開發伺服器：`npm run dev`
  - 執行全套自動化測試：`node ./node_modules/vitest/vitest.mjs run`
  - 執行生產打包檢查：`node ./node_modules/vite/bin/vite.js build`
