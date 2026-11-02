import { describe, it, expect } from 'vitest';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('Test Chord Harmonization Improvements', () => {
  it('verifies that Am does NOT produce G# for major source tracks (Pitch 59 B3 -> 55 G3)', () => {
    const amChord = ChordTransposer.buildChord('A', 'm');

    // Pitch 59 (B3) under Root Transpose (ntr=0) and Chord (ntt=2)
    // Old behavior: 59 + (-3) = 56 (G#3) -> Clashing augmented 5th / leading tone!
    // New behavior: 59 + (-3) + (-1) = 55 (G3) -> Pure minor 7th, completely harmonized!
    const resultAm = ChordTransposer.transposeSingleNote(59, amChord, 11, false, 0, 127, 0, 2, 2);
    expect(resultAm).toBe(55); // G3
    expect(resultAm % 12).not.toBe(8); // 8 is G#
  });

  it('verifies that full C Major 7th chord (C, E, G, B) turns into pure Am7 (A, C, E, G) under A minor', () => {
    const amChord = ChordTransposer.buildChord('A', 'm');
    const c4 = ChordTransposer.transposeSingleNote(48, amChord, 11, false, 0, 127, 0, 2, 2);
    const e4 = ChordTransposer.transposeSingleNote(52, amChord, 11, false, 0, 127, 0, 2, 2);
    const g4 = ChordTransposer.transposeSingleNote(55, amChord, 11, false, 0, 127, 0, 2, 2);
    const b4 = ChordTransposer.transposeSingleNote(59, amChord, 11, false, 0, 127, 0, 2, 2);

    expect(c4).toBe(45); // A2
    expect(e4).toBe(48); // C3
    expect(g4).toBe(52); // E3
    expect(b4).toBe(55); // G3 (Am7)

    const pitchClasses = [c4, e4, g4, b4].map(p => p % 12);
    expect(pitchClasses).not.toContain(8); // No G#!
    expect(pitchClasses).toEqual([9, 0, 4, 7]); // A, C, E, G (100% pure Am7!)
  });

  it('verifies that NTT=2 (Chord) snaps relPc 11 (major 7th) to root under pure Major triad', () => {
    const cMaj = ChordTransposer.buildChord('C', 'maj');
    // Pitch 59 (B3) under pure C major: snapped to C4 (60)
    const result = ChordTransposer.transposeSingleNote(59, cMaj, 11, false, 0, 127, 0, 2, 0);
    expect(result).toBe(60); // Snapped to root C4
  });
});
