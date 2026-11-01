import { describe, it, expect } from 'vitest';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('NTT Source Chord Harmonization', () => {
  const cMaj = ChordTransposer.buildChord('C', 'maj');
  const cMin = ChordTransposer.buildChord('C', 'm');
  const c7 = ChordTransposer.buildChord('C', '7');
  const gMaj = ChordTransposer.buildChord('G', 'maj');
  const aMin = ChordTransposer.buildChord('A', 'm');
  const fMaj = ChordTransposer.buildChord('F', 'maj');

  describe('When sourceChordType is 14 (C7, e.g. LoveSong Piano & Strings)', () => {
    // Raw recorded notes for Piano in LoveSong: 58 (Bb3), 63 (Eb4), 65 (F4)
    it('harmonizes C7 notes (Bb, Eb, F) to pure C Major triad (C, E, G)', () => {
      const n58 = ChordTransposer.transposeSingleNote(58, cMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n63 = ChordTransposer.transposeSingleNote(63, cMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n65 = ChordTransposer.transposeSingleNote(65, cMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);

      expect(n58).toBe(60); // C4
      expect(n63).toBe(64); // E4
      expect(n65).toBe(67); // G4
    });

    it('harmonizes C7 notes to pure G Major triad (G, B, D)', () => {
      const n58 = ChordTransposer.transposeSingleNote(58, gMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n63 = ChordTransposer.transposeSingleNote(63, gMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n65 = ChordTransposer.transposeSingleNote(65, gMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);

      // Root G (semitonesFromC = -5 for close voicing)
      // Bb3(58)-5+2 = G3(55), Eb4(63)-5+1 = B3(59), F4(65)-5+2 = D4(62)
      expect(n58).toBe(55); // G3
      expect(n63).toBe(59); // B3
      expect(n65).toBe(62); // D4
    });

    it('harmonizes C7 notes to pure A Minor triad (A, C, E)', () => {
      const n58 = ChordTransposer.transposeSingleNote(58, aMin, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n63 = ChordTransposer.transposeSingleNote(63, aMin, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      const n65 = ChordTransposer.transposeSingleNote(65, aMin, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);

      // A Minor (semitonesFromC = -3 for close voicing):
      // Bb3(58)-3+2 = A3(57), Eb4(63)-3+0 = C4(60), F4(65)-3+2 = E4(64)
      expect(n58).toBe(57); // A3
      expect(n63).toBe(60); // C4
      expect(n65).toBe(64); // E4
    });

    it('preserves native 7th voicing when target chord is 7th (C7)', () => {
      const n58 = ChordTransposer.transposeSingleNote(58, c7, 11, false, 0, 127, 'Root Fixed', 'Chord', 14);
      expect(n58).toBe(58); // Bb3
    });
  });

  describe('When sourceChordType is 8 (Minor, e.g. 4006 Intro A)', () => {
    // 4006 Intro A has Eb (pitchClass = 3)
    it('preserves authentic minor 3rd (Eb) when playing C Minor', () => {
      const n63 = ChordTransposer.transposeSingleNote(63, cMin, 11, false, 0, 127, 'Root Transpose', 'Chord', 8);
      expect(n63).toBe(63); // Eb4 remains Eb4
    });

    it('converts minor 3rd (Eb) to major 3rd (E) when playing C Major', () => {
      const n63 = ChordTransposer.transposeSingleNote(63, cMaj, 11, false, 0, 127, 'Root Transpose', 'Chord', 8);
      expect(n63).toBe(64); // Eb4 -> E4
    });
  });

  describe('When sourceChordType is 0 or 2 (Major, standard)', () => {
    // Standard Major has E (pitchClass = 4)
    it('preserves major 3rd (E) when playing C Major', () => {
      const n64 = ChordTransposer.transposeSingleNote(64, cMaj, 11, false, 0, 127, 'Root Fixed', 'Chord', 2);
      expect(n64).toBe(64); // E4 remains E4
    });

    it('converts major 3rd (E) to minor 3rd (Eb) when playing C Minor', () => {
      const n64 = ChordTransposer.transposeSingleNote(64, cMin, 11, false, 0, 127, 'Root Fixed', 'Chord', 2);
      expect(n64).toBe(63); // E4 -> Eb4
    });
  });
});
