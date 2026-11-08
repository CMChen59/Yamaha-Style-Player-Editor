import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Intro A Bar 5 Ch 14 Pad Snapping Fix Verification', () => {
  it('verifies that Intro A Bar 5 Bb3 notes are NOT snapped to C4 and match physical SX920 screen 100%', () => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty'));
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    const introCasmEntries = parsed.casmEntries?.['intro a'] || [];
    const ctb13 = introCasmEntries.find(c => c.destCh === 13)!; // Ch 14 Pad (NylonGuitar SW)

    expect(ctb13).toBeDefined();
    expect(ctb13.ntt).toBe(7); // NTT = 7 (Maj-min (Intro))
    expect(ctb13.chordType).toBe(8); // Minor

    // Test Bb3 (MIDI 70) under C Major, C Minor, and D Minor
    // 1. Under C (target root == C): should preserve Bb3 (70) exactly as in physical SX920
    const transposedUnderC = ChordTransposer.transposeSingleNote(
      70, // Bb3
      { rootPitchClass: 0, type: 'maj', semitonesFromC: 0 },
      13, // Pad
      false,
      ctb13.lowLimit ?? 0,
      ctb13.highLimit ?? 127,
      ctb13.ntr ?? 0,
      ctb13.ntt ?? 7,
      ctb13.chordType ?? 8,
      false,
      ctb13.hiKey ?? 2
    );
    expect(transposedUnderC).toBe(70); // Must be 70 (Bb3), NOT 72 (C4)!

    // 2. Under C Minor (target root == C): should preserve Bb3 (70)
    const transposedUnderCm = ChordTransposer.transposeSingleNote(
      70, // Bb3
      { rootPitchClass: 0, type: 'm', semitonesFromC: 0 },
      13, // Pad
      false,
      ctb13.lowLimit ?? 0,
      ctb13.highLimit ?? 127,
      ctb13.ntr ?? 0,
      ctb13.ntt ?? 7,
      ctb13.chordType ?? 8,
      false,
      ctb13.hiKey ?? 2
    );
    expect(transposedUnderCm).toBe(70); // Must be 70 (Bb3)!

    // 3. Under D Minor (rootShift = +2): should transpose up by 2 semitones to C4 (72)
    const transposedUnderDm = ChordTransposer.transposeSingleNote(
      70, // Bb3
      { rootPitchClass: 2, type: 'm', semitonesFromC: 2 },
      13, // Pad
      false,
      ctb13.lowLimit ?? 0,
      ctb13.highLimit ?? 127,
      ctb13.ntr ?? 0,
      ctb13.ntt ?? 7,
      ctb13.chordType ?? 8,
      false,
      ctb13.hiKey ?? 2
    );
    expect(transposedUnderDm).toBe(72); // Transposes smoothly to C4!
  });
});
