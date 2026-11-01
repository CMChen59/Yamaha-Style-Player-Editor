import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('LoveSong Main A Playback Harmonization Verification', () => {
  it('harmonizes Piano and Strings into pure C Major, completely eliminating Eb/Bb clashes with Guitar', () => {
    const filePath = path.resolve(__dirname, '../samples/LoveSong.T547.sty');
    const buffer = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(buffer);
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
    const events = styPlaybackEngine.getSectionEvents();

    const cChord = ChordTransposer.buildChord('C', 'maj');
    const byCh = new Map<number, number[]>();

    for (const ev of events) {
      const activeSrc = styPlaybackEngine.getActiveSourceChannel(ev.channel, cChord);
      if (ev.sourceChannel !== activeSrc) continue;
      const casm = styPlaybackEngine.getActiveCasmEntry(ev.channel, cChord);
      const isDrum = styPlaybackEngine.isChannelDrum(ev.channel);
      const note = isDrum ? ev.noteNumber : ChordTransposer.transposeSingleNote(
        ev.noteNumber,
        cChord,
        ev.channel,
        isDrum,
        0,
        127,
        casm?.ntr,
        casm?.ntt,
        casm?.chordType
      );
      if (!byCh.has(ev.channel)) byCh.set(ev.channel, []);
      byCh.get(ev.channel)!.push(note);
    }

    // 1. Piano (Ch 11): 50 notes, originally had 58(Bb), 63(Eb), 65(F)
    const pianoNotes = [...new Set(byCh.get(11))].sort((a,b)=>a-b);
    console.log('Harmonized Piano notes:', pianoNotes);
    expect(pianoNotes).toEqual([60, 64, 67]); // C4, E4, G4 -> Pure C Major triad! No Eb, no Bb!

    // 2. Strings1 (Ch 13): originally had 53(F), 58(Bb), 63(Eb)
    const stringsNotes = [...new Set(byCh.get(13))].sort((a,b)=>a-b);
    console.log('Harmonized Strings notes:', stringsNotes);
    expect(stringsNotes).toEqual([55, 60, 64]); // G3, C4, E4 -> Pure C Major second inversion triad! No Eb, no Bb!

    // 3. A.Guitar (Ch 12): SFF-GE guitar chord
    const guitarNotes = [...new Set(byCh.get(12))].sort((a,b)=>a-b);
    console.log('Guitar notes:', guitarNotes);
    expect(guitarNotes).toEqual([48, 52, 55, 60, 64]); // C3, E3, G3, C4, E4 -> Pure C Major guitar voicing!

    // 4. Bass (Ch 10)
    const bassNotes = [...new Set(byCh.get(10))].sort((a,b)=>a-b);
    expect(bassNotes).toEqual([24]); // C1 -> Root C
  });

  it('preserves authentic Minor tonality in 4006 Intro A without clashing or mis-transposing', () => {
    const filePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const buffer = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(buffer);
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');
    const events = styPlaybackEngine.getSectionEvents();

    const cmChord = ChordTransposer.buildChord('C', 'm');
    const byCh = new Map<number, number[]>();

    for (const ev of events) {
      const activeSrc = styPlaybackEngine.getActiveSourceChannel(ev.channel, cmChord);
      if (ev.sourceChannel !== activeSrc) continue;
      const casm = styPlaybackEngine.getActiveCasmEntry(ev.channel, cmChord);
      const isDrum = styPlaybackEngine.isChannelDrum(ev.channel);
      const note = isDrum ? ev.noteNumber : ChordTransposer.transposeSingleNote(
        ev.noteNumber,
        cmChord,
        ev.channel,
        isDrum,
        0,
        127,
        casm?.ntr,
        casm?.ntt,
        casm?.chordType
      );
      if (!byCh.has(ev.channel)) byCh.set(ev.channel, []);
      byCh.get(ev.channel)!.push(note);
    }

    // Under Cm, Piano (Ch 11) has authentic Eb notes preserved
    const pianoNotes = byCh.get(11) || [];
    const hasEb = pianoNotes.some(n => n % 12 === 3); // 3 is Eb
    const hasENatural = pianoNotes.some(n => n % 12 === 4); // 4 is E natural
    expect(hasEb).toBe(true);
    expect(hasENatural).toBe(false); // No E natural clashing with Eb in Cm!
  });
});
