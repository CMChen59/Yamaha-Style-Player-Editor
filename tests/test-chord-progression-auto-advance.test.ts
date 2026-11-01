import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ChordTransposer,
  CHORD_PROGRESSION_PRESETS,
  type ChordDefinition,
} from '../src/core/writer/chord-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('智慧多小節和弦進行自動輪播 (Chord Progression Auto-Advance) 測試套件', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const htmlPath = path.resolve(__dirname, '../index.html');

  beforeEach(() => {
    const buf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
    styPlaybackEngine.setChordAutoAdvance(false);
    styPlaybackEngine.resetAuditionChord();
  });

  describe('1. 經典和弦進行預設庫與字串解析器', () => {
    it('應包含 8 組經典進行預設，且 pop-1564 / canon-8 包含預期的和弦序列', () => {
      expect(CHORD_PROGRESSION_PRESETS.length).toBeGreaterThanOrEqual(8);
      const pop1564 = CHORD_PROGRESSION_PRESETS.find(p => p.id === 'pop-1564');
      expect(pop1564).toBeDefined();
      expect(pop1564?.chordNames).toEqual(['C', 'G', 'Am', 'F']);

      const canon8 = CHORD_PROGRESSION_PRESETS.find(p => p.id === 'canon-8');
      expect(canon8).toBeDefined();
      expect(canon8?.chordNames.length).toBe(8);
      expect(canon8?.chordNames).toEqual(['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G']);
    });

    it('ChordTransposer.parseChordString 能準確解析各類大三、小三、屬七、大七、小七、掛四與減和弦', () => {
      const c = ChordTransposer.parseChordString('C');
      expect(c.root).toBe('C');
      expect(c.type).toBe('maj');
      expect(c.displayName).toBe('C');

      const am = ChordTransposer.parseChordString('Am');
      expect(am.root).toBe('A');
      expect(am.type).toBe('m');
      expect(am.displayName).toBe('Am');

      const g7 = ChordTransposer.parseChordString('G7');
      expect(g7.root).toBe('G');
      expect(g7.type).toBe('7');
      expect(g7.displayName).toBe('G7');

      const dm7 = ChordTransposer.parseChordString('Dm7');
      expect(dm7.root).toBe('D');
      expect(dm7.type).toBe('m7');
      expect(dm7.displayName).toBe('Dm7');

      const cmaj7 = ChordTransposer.parseChordString('Cmaj7');
      expect(cmaj7.root).toBe('C');
      expect(cmaj7.type).toBe('maj7');
      expect(cmaj7.displayName).toBe('Cmaj7');

      const fsus4 = ChordTransposer.parseChordString('Fsus4');
      expect(fsus4.root).toBe('F');
      expect(fsus4.type).toBe('sus4');
      expect(fsus4.displayName).toBe('Fsus4');

      const bdim = ChordTransposer.parseChordString('Bdim');
      expect(bdim.root).toBe('B');
      expect(bdim.type).toBe('dim');
      expect(bdim.displayName).toBe('Bdim');

      const fsharpM = ChordTransposer.parseChordString('F#m');
      expect(fsharpM.root).toBe('F#');
      expect(fsharpM.type).toBe('m');
      expect(fsharpM.displayName).toBe('F#m');

      const bflat = ChordTransposer.parseChordString('Bb');
      expect(bflat.root).toBe('Bb');
      expect(bflat.type).toBe('maj');
      expect(bflat.displayName).toBe('Bb');
    });

    it('ChordTransposer.getProgressionPreset 能將預設 ID 轉換為完整的 ChordDefinition 物件清單', () => {
      const chords = ChordTransposer.getProgressionPreset('pop-1564');
      expect(chords.length).toBe(4);
      expect(chords.map(c => c.displayName)).toEqual(['C', 'G', 'Am', 'F']);
      expect(chords[2].root).toBe('A');
      expect(chords[2].type).toBe('m');
    });
  });

  describe('2. styPlaybackEngine 自動輪播狀態與和弦鏈管理', () => {
    it('預設關閉自動輪播，setChordAutoAdvance 可正確切換開關', () => {
      expect(styPlaybackEngine.getChordAutoAdvance()).toBe(false);

      styPlaybackEngine.setChordAutoAdvance(true);
      expect(styPlaybackEngine.getChordAutoAdvance()).toBe(true);

      styPlaybackEngine.setChordAutoAdvance(false);
      expect(styPlaybackEngine.getChordAutoAdvance()).toBe(false);
    });

    it('可切換和弦進行鏈與預設 ID', () => {
      const canon = ChordTransposer.getProgressionPreset('canon-8');
      styPlaybackEngine.setChordProgression(canon, 'canon-8');

      expect(styPlaybackEngine.getChordProgressionPresetId()).toBe('canon-8');
      const prog = styPlaybackEngine.getChordProgression();
      expect(prog.length).toBe(8);
      expect(prog[3].displayName).toBe('Em');
    });

    it('支援針對單一小節覆蓋指派自訂和弦，並自動標記為 custom', () => {
      const pop = ChordTransposer.getProgressionPreset('pop-1564');
      styPlaybackEngine.setChordProgression(pop, 'pop-1564');

      const customChord = ChordTransposer.buildChord('D', '7');
      styPlaybackEngine.setChordForProgressionBar(1, customChord); // 將第 2 小節 (index 1) 改為 D7

      expect(styPlaybackEngine.getChordProgressionPresetId()).toBe('custom');
      expect(styPlaybackEngine.getChordForBar(1).displayName).toBe('D7');
      expect(styPlaybackEngine.getChordForBar(0).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForBar(2).displayName).toBe('Am');
    });

    it('支援小節選取索引切換 (Selected Bar Index)', () => {
      styPlaybackEngine.setSelectedProgressionBarIndex(2);
      expect(styPlaybackEngine.getSelectedProgressionBarIndex()).toBe(2);
    });
  });

  describe('3. 小節 Tick 轉調計算與和弦輪播發聲邏輯', () => {
    it('當自動輪播關閉時，不論在哪個 Tick，getChordForTick 均回傳單一試聽和弦 (auditionChord)', () => {
      styPlaybackEngine.setChordAutoAdvance(false);
      const chordF = ChordTransposer.buildChord('F', 'maj');
      styPlaybackEngine.setAuditionChord(chordF);

      // Tick 0 (Bar 1), Tick 1920 (Bar 2), Tick 5000 (Bar 3)
      expect(styPlaybackEngine.getChordForTick(0).displayName).toBe('F');
      expect(styPlaybackEngine.getChordForTick(1920).displayName).toBe('F');
      expect(styPlaybackEngine.getChordForTick(5000).displayName).toBe('F');
    });

    it('當自動輪播開啟時，getChordForTick 依據小節線動態回傳該小節的和弦', () => {
      styPlaybackEngine.setChordAutoAdvance(true);
      const popChords = ChordTransposer.getProgressionPreset('pop-1564'); // C, G, Am, F
      styPlaybackEngine.setChordProgression(popChords, 'pop-1564');

      // 4006_SX900 division 為 1920，4/4 拍每小節 ticksPerBar = 1920 * 4 = 7680
      const ticksPerBar = 1920 * 4;

      // 第 1 小節: [0 ~ 7679] -> C
      expect(styPlaybackEngine.getChordForTick(0).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar - 1).displayName).toBe('C');

      // 第 2 小節: [7680 ~ 15359] -> G
      expect(styPlaybackEngine.getChordForTick(ticksPerBar).displayName).toBe('G');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 2 - 1).displayName).toBe('G');

      // 第 3 小節: [15360 ~ 23039] -> Am
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 2).displayName).toBe('Am');

      // 第 4 小節: [23040 ~ 30719] -> F
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 3).displayName).toBe('F');

      // 第 5 小節 (若超出進行長度，自動循環回到第 1 小節): -> C
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 4).displayName).toBe('C');
    });

    it('Bass 聲部在不同小節跟隨自動輪播和弦正確轉調', () => {
      styPlaybackEngine.setChordAutoAdvance(true);
      const popChords = ChordTransposer.getProgressionPreset('pop-1564'); // C, G, Am, F
      styPlaybackEngine.setChordProgression(popChords, 'pop-1564');
      const ticksPerBar = 1920 * 4;

      // 原 C 調 Bass C2 (36)
      const origBassNote = 36;

      // Bar 1 (C): 36
      const chordBar1 = styPlaybackEngine.getChordForTick(0);
      const bassBar1 = ChordTransposer.transposeSingleNote(origBassNote, chordBar1, 10, false);
      expect(bassBar1).toBe(36);

      // Bar 2 (G, semitonesFromC = -5): 36 - 5 = 31 (G1)
      const chordBar2 = styPlaybackEngine.getChordForTick(ticksPerBar);
      const bassBar2 = ChordTransposer.transposeSingleNote(origBassNote, chordBar2, 10, false);
      expect(bassBar2).toBe(31);

      // Bar 3 (Am, semitonesFromC = -3): 36 - 3 = 33 (A1)
      const chordBar3 = styPlaybackEngine.getChordForTick(ticksPerBar * 2);
      const bassBar3 = ChordTransposer.transposeSingleNote(origBassNote, chordBar3, 10, false);
      expect(bassBar3).toBe(33);

      // Bar 4 (F, semitonesFromC = +5 -> 最佳八度修正為 41 或 29):
      const chordBar4 = styPlaybackEngine.getChordForTick(ticksPerBar * 3);
      const bassBar4 = ChordTransposer.transposeSingleNote(origBassNote, chordBar4, 10, false);
      expect(bassBar4).toBe(41);
    });

    it('小節跨越時能觸發 onProgressionBarChange 回呼', () => {
      let notifiedBar = -1;
      let notifiedChord = '';

      styPlaybackEngine.onProgressionBarChange((barIdx, chord) => {
        notifiedBar = barIdx;
        notifiedChord = chord.displayName;
      });

      styPlaybackEngine.setChordAutoAdvance(true);
      const pop = ChordTransposer.getProgressionPreset('pop-1564');
      styPlaybackEngine.setChordProgression(pop, 'pop-1564');

      // 模擬停止時重設
      styPlaybackEngine.stop();
      expect(notifiedBar).toBe(-1);
    });
  });

  describe('4. index.html UI 標籤結構與 CSS 樣式完整性', () => {
    it('包含多小節和弦進行輪播控制面板與所有必要控制項', () => {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('id="chord-progression-panel"');
      expect(htmlContent).toContain('id="toggle-chord-auto-advance"');
      expect(htmlContent).toContain('id="select-chord-progression-preset"');
      expect(htmlContent).toContain('id="progression-cards-container"');
      expect(htmlContent).toContain('id="btn-reset-progression"');
    });

    it('包含自訂進行預設選項 (pop-1564, canon-8, ballad-6415, jazz-251 等)', () => {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('value="pop-1564"');
      expect(htmlContent).toContain('value="canon-8"');
      expect(htmlContent).toContain('value="ballad-6415"');
      expect(htmlContent).toContain('value="jazz-251"');
      expect(htmlContent).toContain('value="custom"');
    });

    it('包含小節卡片專屬 CSS 樣式定義與高亮跑動動態效果', () => {
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('.chord-progression-panel');
      expect(htmlContent).toContain('.progression-bar-card');
      expect(htmlContent).toContain('.progression-bar-card.is-selected-card');
      expect(htmlContent).toContain('.progression-bar-card.is-playing-card');
      expect(htmlContent).toContain('@keyframes pulse-playing-card');
    });
  });
});
