import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('容易受傷的女人 Main A Guitar Arpeggio Loop Verification', () => {
  it('verifies that all 8 bars of Chord 1 in Main A play pure C Major guitar string arpeggios without drifting', () => {
    const f = 'public/samples/1024_容易受傷的女人.sty';
    const buf = fs.readFileSync(f);
    const parsed = YamahaParser.parse(buf);
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
    const sec = parsed.sections.find(s => s.name === 'Main A')!;
    const ticksPerBar = 1920 * 4;
    const events = styPlaybackEngine.getSectionEvents();

    const cChord = ChordTransposer.buildChord('C', 'maj');
    const activeSrc = styPlaybackEngine.getActiveSourceChannel(11, cChord);
    const casm = styPlaybackEngine.getActiveCasmEntry(11, cChord);

    expect(activeSrc).toBe(6);
    expect(casm?.ntr).toBe(2); // SFF-GE Guitar rule

    const chEvents = events.filter(e => e.channel === 11 && e.sourceChannel === activeSrc);
    expect(chEvents.length).toBe(64); // 8 bars * 8 eighth-notes

    const cMajorChordPitches = [43, 48, 52, 55, 60, 64]; // G2, C3, E3, G3, C4, E4

    for (let b = 0; b < 8; b++) {
      const barStart = b * ticksPerBar;
      const barEnd = (b + 1) * ticksPerBar;
      const barEvs = chEvents.filter(e => e.relTick >= barStart && e.relTick < barEnd);
      expect(barEvs.length).toBe(8);

      const playedNotes = barEvs.map(e => ChordTransposer.transposeSingleNote(
        e.noteNumber,
        cChord,
        11,
        false,
        0,
        127,
        casm?.ntr,
        casm?.ntt,
        casm?.chordType
      ));

      console.log(`Bar ${b + 1} played notes:`, playedNotes);
      // Every note in every bar MUST belong to the C Major guitar strings!
      for (const n of playedNotes) {
        expect(cMajorChordPitches).toContain(n);
      }
    }
  });
});
