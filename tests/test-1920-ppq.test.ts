import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Generate 1920 PPQ Style exactly matching SX900 specification', () => {
  it('creates native 1920 PPQ style with Main A first', () => {
    const division = 1920;
    const timeSig = { numerator: 4, denominator: 4 };
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4; // 7680
    const stepsPerBar = 16;
    const ticksPerStep = Math.round(ticksPerBar / stepsPerBar); // 480

    // Standard note pattern for 4 bars
    const mainANotes: any[] = [];
    for (let b = 0; b < 4; b++) {
      const base = b * 16;
      // Kick (36)
      [0, 8].forEach(s => mainANotes.push({ partId: 'Rhythm2', channel: 9, note: 36, startTick: (base + s) * ticksPerStep, durationTick: 240, velocity: 100 }));
      // Snare (38)
      [4, 12].forEach(s => mainANotes.push({ partId: 'Rhythm2', channel: 9, note: 38, startTick: (base + s) * ticksPerStep, durationTick: 240, velocity: 100 }));
      // Hi-hat (42)
      [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => mainANotes.push({ partId: 'Rhythm2', channel: 9, note: 42, startTick: (base + s) * ticksPerStep, durationTick: 120, velocity: 90 }));
      // Bass (36)
      mainANotes.push({ partId: 'Bass', channel: 10, note: 36, startTick: base * ticksPerStep, durationTick: 960, velocity: 100 });
      // Chord (60, 64, 67)
      [60, 64, 67].forEach(n => mainANotes.push({ partId: 'Chord1', channel: 11, note: n, startTick: base * ticksPerStep, durationTick: 960, velocity: 100 }));
    }

    // 1-bar notes for Fill In / Intro
    const oneBarNotes = mainANotes.filter(n => n.startTick < ticksPerBar);
    // 2-bar notes for Ending
    const twoBarNotes = mainANotes.filter(n => n.startTick < 2 * ticksPerBar);

    // Section sequence: Main A is FIRST (at Bar 2), exactly like Yamaha factory styles!
    const sections = [
      { name: 'Main A', bars: 4, notes: mainANotes },
      { name: 'Main B', bars: 4, notes: mainANotes },
      { name: 'Main C', bars: 4, notes: mainANotes },
      { name: 'Main D', bars: 4, notes: mainANotes },
      { name: 'Fill In AA', bars: 1, notes: oneBarNotes },
      { name: 'Fill In BB', bars: 1, notes: oneBarNotes },
      { name: 'Fill In CC', bars: 1, notes: oneBarNotes },
      { name: 'Fill In DD', bars: 1, notes: oneBarNotes },
      { name: 'Intro A', bars: 1, notes: oneBarNotes },
      { name: 'Ending A', bars: 2, notes: twoBarNotes },
    ];

    const parts = {
      Rhythm1: { msb: 127, lsb: 0, pc: 0 },
      Rhythm2: { msb: 127, lsb: 0, pc: 0 },
      Bass: { msb: 0, lsb: 0, pc: 33 },
      Chord1: { msb: 0, lsb: 0, pc: 0 },
      Chord2: { msb: 0, lsb: 0, pc: 24 },
      Pad: { msb: 0, lsb: 0, pc: 48 },
      Phrase1: { msb: 0, lsb: 0, pc: 73 },
      Phrase2: { msb: 0, lsb: 0, pc: 65 },
    };

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'SX920_standard-kit-1',
      bpm: 120,
      timeSignature: timeSig,
      division,
      sections,
      parts,
      injectCasm: true,
    });

    const bytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(bytes.length).toBeGreaterThan(2000);

    const re = YamahaParser.parse(bytes, 'STY');
    expect(re.division).toBe(1920);

    // Verify Main A is at tick 7680 (Bar 2)
    const mainA = re.sections.find(s => s.name === 'Main A')!;
    expect(mainA.startTick).toBe(7680);
    console.log('Main A startTick:', mainA.startTick, 'division:', re.division);

    fs.writeFileSync('public/samples/SX920_standard-kit-1.sty', bytes);
    console.log('Successfully written public/samples/SX920_standard-kit-1.sty, size:', bytes.length);
  });
});
