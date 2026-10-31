import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer, POPULAR_AUDITION_CHORDS } from '../src/core/writer/chord-transposer';

describe('虛擬和弦即時轉調測試條 (Virtual Chord Audition)', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  beforeEach(() => {
    const buf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    styPlaybackEngine.loadParsed(parsed);
  });

  it('1. 載入伴奏檔時，預設試聽和弦自動初始化為 C (原調)', () => {
    const currentChord = styPlaybackEngine.getAuditionChord();
    expect(currentChord.root).toBe('C');
    expect(currentChord.type).toBe('maj');
    expect(currentChord.displayName).toContain('C');
  });

  it('2. 切換試聽和弦至 Am，觸發回呼並更新狀態', () => {
    let notifiedChordName = '';
    styPlaybackEngine.onChordChange((chord) => {
      notifiedChordName = chord.displayName;
    });

    const chordAm = ChordTransposer.buildChord('A', 'm');
    styPlaybackEngine.setAuditionChord(chordAm);

    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('Am');
    expect(notifiedChordName).toBe('Am');
  });

  it('3. 單音轉調：鼓組 (Ch 8 / Ch 9) 絕對保持原音不變 (Bypass)', () => {
    const chordG = ChordTransposer.buildChord('G', 'maj');
    // 大鼓 Note 36 (C1)
    const kickCh9 = ChordTransposer.transposeSingleNote(36, chordG, 9, true);
    expect(kickCh9).toBe(36);

    const snareCh8 = ChordTransposer.transposeSingleNote(38, chordG, 8, true);
    expect(snareCh8).toBe(38);
  });

  it('4. 單音轉調：Bass (Ch 10) 根音位移且維持在低音最佳音域 (28~55)', () => {
    // 假設原 C 基準 Bass 為 C2 (36)
    // 轉調為 G (semitonesFromC = -5): 36 - 5 = 31 (G1)
    const chordG = ChordTransposer.buildChord('G', 'maj');
    const bassG = ChordTransposer.transposeSingleNote(36, chordG, 10, false);
    expect(bassG).toBe(31);
    expect(bassG).toBeGreaterThanOrEqual(28);
    expect(bassG).toBeLessThanOrEqual(55);

    // 轉調為 A (semitonesFromC = -3): 36 - 3 = 33 (A1)
    const chordAm = ChordTransposer.buildChord('A', 'm');
    const bassAm = ChordTransposer.transposeSingleNote(36, chordAm, 10, false);
    expect(bassAm).toBe(33);
  });

  it('5. 單音轉調：和弦三度音在小和弦時自動降半音 (E -> Eb / 64 -> 63)', () => {
    // 原 C 調吉他/鋼琴和弦音 E4 (64, pitchClass = 4)
    // 轉為 Cm (C 小三和弦，semitonesFromC = 0, type = 'm'):
    // 三度音 E (64) 降半音變 Eb (63)
    const chordCm = ChordTransposer.buildChord('C', 'm');
    const chordPartNote = ChordTransposer.transposeSingleNote(64, chordCm, 11, false);
    expect(chordPartNote).toBe(63);
  });

  it('6. 一鍵重設回 C 原調', () => {
    const chordF = ChordTransposer.buildChord('F', 'maj');
    styPlaybackEngine.setAuditionChord(chordF);
    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('F');

    styPlaybackEngine.resetAuditionChord();
    expect(styPlaybackEngine.getAuditionChord().root).toBe('C');
    expect(styPlaybackEngine.getAuditionChord().type).toBe('maj');
  });

  it('7. 試聽轉調絕對不污染底層 parsed STY 二進位音軌事件 (100% 原始無損)', () => {
    // 先取出原始 Main A Ch 10 (Bass) 第一顆音符
    const parsed = styPlaybackEngine.getParsed()!;
    const secMainA = parsed.sections.find(s => s.name === 'Main A')!;
    let firstOriginalNote: number | null = null;

    for (const t of parsed.tracks) {
      let curTick = 0;
      for (const ev of t.events) {
        curTick += ev.delta;
        if (curTick >= secMainA.startTick && curTick < secMainA.endTick) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel === 1) { // SFF1 Bass
            firstOriginalNote = ev.noteNumber!;
            break;
          }
        }
      }
      if (firstOriginalNote !== null) break;
    }

    expect(firstOriginalNote).not.toBeNull();

    // 在播放引擎切換到不同和弦並進行多次轉調
    styPlaybackEngine.setAuditionChord(ChordTransposer.buildChord('F#', 'maj'));
    styPlaybackEngine.setAuditionChord(ChordTransposer.buildChord('Bb', 'm7'));
    styPlaybackEngine.setAuditionChord(ChordTransposer.buildChord('G', '7'));

    // 重新檢查 parsed.tracks[0]，確認底層音符完全未被修改
    let recheckedNote: number | null = null;
    for (const t of parsed.tracks) {
      let curTick = 0;
      for (const ev of t.events) {
        curTick += ev.delta;
        if (curTick >= secMainA.startTick && curTick < secMainA.endTick) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel === 1) {
            recheckedNote = ev.noteNumber!;
            break;
          }
        }
      }
      if (recheckedNote !== null) break;
    }

    expect(recheckedNote).toBe(firstOriginalNote);
  });
});
