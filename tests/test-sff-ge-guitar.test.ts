import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Yamaha SFF-GE Guitar Edition (NTR = 2) Transposition & Decoding Verification', () => {
  it('correctly maps virtual guitar string triggers for C, G, Am, F chords', () => {
    // 1. C Major (Travis Picking open voicing)
    const cMaj = ChordTransposer.buildChord('C', 'maj');
    expect(ChordTransposer.transposeGuitarNote(48, cMaj)).toBe(48); // Root (5th string 3rd fret: C3)
    expect(ChordTransposer.transposeGuitarNote(53, cMaj)).toBe(52); // String 4 (2nd fret: E3)
    expect(ChordTransposer.transposeGuitarNote(57, cMaj)).toBe(60); // String 2 (1st fret: C4)
    expect(ChordTransposer.transposeGuitarNote(55, cMaj)).toBe(55); // String 3 (open: G3)
    expect(ChordTransposer.transposeGuitarNote(59, cMaj)).toBe(64); // String 1 (open: E4)

    // MegaVoice noise (> 88) passes through unchanged
    expect(ChordTransposer.transposeGuitarNote(104, cMaj)).toBe(104);
    expect(ChordTransposer.transposeGuitarNote(106, cMaj)).toBe(106);

    // 2. G Major
    const gMaj = ChordTransposer.buildChord('G', 'maj');
    expect(ChordTransposer.transposeGuitarNote(48, gMaj)).toBe(43); // Root (6th string 3rd fret: G2)
    expect(ChordTransposer.transposeGuitarNote(53, gMaj)).toBe(50); // String 4 (open: D3)
    expect(ChordTransposer.transposeGuitarNote(57, gMaj)).toBe(59); // String 2 (open: B3)
    expect(ChordTransposer.transposeGuitarNote(55, gMaj)).toBe(55); // String 3 (open: G3)
    expect(ChordTransposer.transposeGuitarNote(59, gMaj)).toBe(67); // String 1 (3rd fret: G4)

    // 3. A Minor (Am)
    const aMin = ChordTransposer.buildChord('A', 'm');
    expect(ChordTransposer.transposeGuitarNote(48, aMin)).toBe(45); // Root (5th string open: A2)
    expect(ChordTransposer.transposeGuitarNote(53, aMin)).toBe(52); // String 4 (2nd fret: E3)
    expect(ChordTransposer.transposeGuitarNote(57, aMin)).toBe(60); // String 2 (1st fret: C4)
    expect(ChordTransposer.transposeGuitarNote(55, aMin)).toBe(57); // String 3 (2nd fret: A3)
    expect(ChordTransposer.transposeGuitarNote(59, aMin)).toBe(64); // String 1 (open: E4)

    // 4. F Major
    const fMaj = ChordTransposer.buildChord('F', 'maj');
    expect(ChordTransposer.transposeGuitarNote(48, fMaj)).toBe(41); // Root (6th string 1st fret: F2)
    expect(ChordTransposer.transposeGuitarNote(53, fMaj)).toBe(53); // String 4 (3rd fret: F3)
    expect(ChordTransposer.transposeGuitarNote(57, fMaj)).toBe(60); // String 2 (1st fret: C4)
    expect(ChordTransposer.transposeGuitarNote(55, fMaj)).toBe(57); // String 3 (2nd fret: A3)
    expect(ChordTransposer.transposeGuitarNote(59, fMaj)).toBe(65); // String 1 (1st fret: F4)
  });

  it('transposeSingleNote automatically delegates to transposeGuitarNote when ntr=2 or Guitar', () => {
    const cMaj = ChordTransposer.buildChord('C', 'maj');
    // Using numeric ntr=2
    expect(ChordTransposer.transposeSingleNote(53, cMaj, 12, false, 0, 127, 2)).toBe(52);
    // Using string ntr='Guitar'
    expect(ChordTransposer.transposeSingleNote(57, cMaj, 12, false, 0, 127, 'Guitar')).toBe(60);
  });

  it('verifies LoveSong.T547.sty Main A Channel 12 CASM entry and playback engine integration', () => {
    const p = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');
    const buf = fs.readFileSync(p);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');

    const cMaj = ChordTransposer.buildChord('C', 'maj');
    const activeCasm = styPlaybackEngine.getActiveCasmEntry(12, cMaj);

    expect(activeCasm).toBeDefined();
    expect(activeCasm!.destCh).toBe(12);
    expect(activeCasm!.srcCh).toBe(12);
    expect(activeCasm!.ntr).toBe(2);
    expect(activeCasm!.ntt).toBe(130);
  });
});
