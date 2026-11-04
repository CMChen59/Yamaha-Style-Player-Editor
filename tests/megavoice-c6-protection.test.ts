import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { isMegaVoice, findYamahaVoice } from '../src/core/data/yamaha-voices';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { PitchTransposer } from '../src/core/writer/pitch-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('任務 1-2: MegaVoice C6 (Pitch ≥ 96) 全音軌雜音直通防護測試套件', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  beforeEach(() => {
    const buf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
  });

  describe('1. MegaVoice 身分識別器 isMegaVoice', () => {
    it('能依據 Bank/PC 或音色名稱準確識別 MegaVoice', () => {
      // 依據 PSR-SX920 官方 Data List:
      // NylonGuitar: msb=8, lsb=0, pc=0, type='MegaVoice'
      expect(isMegaVoice(8, 0, 0)).toBe(true);

      // SteelGuitar: msb=8, lsb=0, pc=1, type='MegaVoice'
      expect(isMegaVoice(8, 0, 1)).toBe(true);

      // CleanGuitar: msb=8, lsb=0, pc=3, type='MegaVoice'
      expect(isMegaVoice(8, 0, 3)).toBe(true);

      // 音色名稱包含 Mega / 兆級
      expect(isMegaVoice(0, 0, 0, 'Mega Steel Guitar')).toBe(true);
      expect(isMegaVoice(0, 0, 0, '兆級尼龍弦吉他')).toBe(true);
      expect(isMegaVoice(104, 14, 83)).toBe(true); // Regular MegaStack
    });

    it('一般鋼琴、弦樂、管樂與鼓組非 MegaVoice 應回傳 false', () => {
      // Concert Grand: msb=0, lsb=112, pc=0 (Standard)
      expect(isMegaVoice(0, 112, 0)).toBe(false);

      // Strings: msb=0, lsb=112, pc=48
      expect(isMegaVoice(0, 112, 48)).toBe(false);

      // Standard Kit: msb=127, lsb=0, pc=0
      expect(isMegaVoice(127, 0, 0)).toBe(false);

      expect(isMegaVoice(0, 0, 0, 'Grand Piano')).toBe(false);
    });
  });

  describe('2. ChordTransposer.transposeSingleNote C6+ 雜音直通防護', () => {
    const chordG = ChordTransposer.buildChord('G', 'maj');
    const chordF = ChordTransposer.buildChord('F', 'maj');
    const chordAm = ChordTransposer.buildChord('A', 'm');

    it('當 isMegaVoice=true 且音高 ≥ 96 (C6 及以上) 時，無論目標和弦為何一律原音直通，絕不轉調', () => {
      // 96 = C6 (掃弦雜音 strum noise)
      expect(ChordTransposer.transposeSingleNote(96, chordG, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(96);
      expect(ChordTransposer.transposeSingleNote(96, chordF, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(96);
      expect(ChordTransposer.transposeSingleNote(96, chordAm, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(96);

      // 100 = E6
      expect(ChordTransposer.transposeSingleNote(100, chordG, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(100);

      // 108 = C7 (高把位摩擦聲)
      expect(ChordTransposer.transposeSingleNote(108, chordG, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(108);

      // 120 = C8 (換把摩擦聲 fret noise)
      expect(ChordTransposer.transposeSingleNote(120, chordF, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true)).toBe(120);
    });

    it('當 isMegaVoice=true 但音高 < 96 (正常彈奏音樂音域) 時，仍正常進行和弦轉調', () => {
      // 60 = C3 (吉他正常發聲音高)，轉至 G 調依 CASM 八度折返規則變為 G2 (55)
      const transposedG = ChordTransposer.transposeSingleNote(60, chordG, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true);
      expect(transposedG).toBe(55);

      // 64 = E3 (原 C 調大三音)，轉至 Am 調應變為相應和弦內音
      const transposedAm = ChordTransposer.transposeSingleNote(64, chordAm, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, true);
      expect(transposedAm).not.toBe(64); // 正常發生轉調
    });

    it('當 isMegaVoice=false 時，≥ 96 的高音樂器音符正常依 CASM 規則轉調 (不被直通保護)', () => {
      // 96 = C6 在非 MegaVoice 樂器 (isMegaVoice=false) 轉至 G 和弦正常發生轉調 (依音域折返為 79)
      const normalTransposed = ChordTransposer.transposeSingleNote(96, chordG, 12, false, 0, 127, 'Root Transpose', 'Chord', 0, false);
      expect(normalTransposed).toBe(79); // 非直通原音 96
      expect(normalTransposed).not.toBe(96);
    });
  });

  describe('3. ChordTransposer.transposeNotes 批次混成轉調', () => {
    it('能正確將音樂音符轉調，同時保護 C6 以上 MegaVoice 特效雜音', () => {
      const chordG = ChordTransposer.buildChord('G', 'maj');
      const mixedEvents = [
        { note: 60, duration: 480, velocity: 90 }, // 音樂音符 C3
        { note: 64, duration: 480, velocity: 85 }, // 音樂音符 E3
        { note: 96, duration: 240, velocity: 100 }, // C6 掃弦雜音
        { note: 108, duration: 120, velocity: 70 }, // C7 特效
      ];

      const transposed = ChordTransposer.transposeNotes(
        mixedEvents,
        chordG,
        12,
        false,
        0,
        127,
        'Root Transpose',
        'Chord',
        0,
        true // isMegaVoice
      );

      // 音樂音符轉調
      expect(transposed[0].note).toBe(55); // C3 -> G2 (55)
      expect(transposed[1].note).not.toBe(64);

      // 雜音特效原音保護
      expect(transposed[2].note).toBe(96);
      expect(transposed[3].note).toBe(108);
    });
  });

  describe('4. styPlaybackEngine 聲部 MegaVoice 狀態判定', () => {
    it('當聲部載入或覆寫為 MegaVoice 時，isChannelMegaVoice 正確回傳 true', () => {
      // 覆寫 Channel 12 (Guitar) 為 Mega Steel Guitar
      const megaVoice = findYamahaVoice(8, 0, 1); // SteelGuitar (type: MegaVoice)
      expect(megaVoice).toBeDefined();

      styPlaybackEngine.setChannelVoice(12, megaVoice!);
      expect(styPlaybackEngine.isChannelMegaVoice(12)).toBe(true);

      // 切換回標準鋼琴 ConcertGrand
      const grandPiano = findYamahaVoice(0, 112, 0);
      expect(grandPiano).toBeDefined();
      styPlaybackEngine.setChannelVoice(12, grandPiano!);
      expect(styPlaybackEngine.isChannelMegaVoice(12)).toBe(false);
    });
  });

  describe('5. PitchTransposer 手動編輯音高安全保護', () => {
    it('在 MegaVoice 軌道執行移調時，自動保護 C6 以上雜音不受平移影響', () => {
      const notes = [
        { noteNumber: 60, durationTicks: 480, velocity: 90 },  // C3 音樂音符
        { noteNumber: 96, durationTicks: 240, velocity: 100 }, // C6 雜音
        { noteNumber: 110, durationTicks: 120, velocity: 80 }, // 高音摩擦
      ];

      // 平移 +2 個半音
      const result = PitchTransposer.transposeNotes(notes, 2, {
        isMegaVoice: true,
      });

      expect(result.success).toBe(true);
      expect(result.notes[0].noteNumber).toBe(62); // 60 + 2 = 62
      expect(result.notes[1].noteNumber).toBe(96); // 原音保持 96
      expect(result.notes[2].noteNumber).toBe(110); // 原音保持 110
    });

    it('若選取的音符全為 C6 以上雜音，回傳成功並提示原音直通保護', () => {
      const noiseOnly = [
        { noteNumber: 96, durationTicks: 240, velocity: 100 },
        { noteNumber: 108, durationTicks: 120, velocity: 80 },
      ];

      const result = PitchTransposer.transposeNotes(noiseOnly, 2, {
        isMegaVoice: true,
      });

      expect(result.success).toBe(true);
      expect(result.actualShift).toBe(0);
      expect(result.notes[0].noteNumber).toBe(96);
      expect(result.notes[1].noteNumber).toBe(108);
      expect(result.message).toContain('MegaVoice C6+ 特效雜音區');
    });
  });
});
