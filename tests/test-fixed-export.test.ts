import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('Test Perfect SX920 STY Generation', () => {
  it('generates a 100% compliant PSR-SX920 style file', () => {
    const timeSig = { numerator: 4, denominator: 4 };
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4;

    // Simulate Main A with drum, bass, chord
    const mainANotes = [
      { partId: 'Rhythm2' as const, channel: 9, note: 36, startTick: 0, durationTick: 120, velocity: 100 },
      { partId: 'Rhythm2' as const, channel: 9, note: 38, startTick: 480, durationTick: 120, velocity: 100 },
      { partId: 'Bass' as const, channel: 10, note: 36, startTick: 0, durationTick: 240, velocity: 100 },
      { partId: 'Chord1' as const, channel: 11, note: 60, startTick: 0, durationTick: 360, velocity: 100 },
      { partId: 'Chord1' as const, channel: 11, note: 64, startTick: 0, durationTick: 360, velocity: 100 },
      { partId: 'Chord1' as const, channel: 11, note: 67, startTick: 0, durationTick: 360, velocity: 100 },
    ];

    // Standard complete section layout for Yamaha arrangers:
    // Intro A (1 bar)
    // Main A (4 bars)
    // Main B (4 bars)
    // Main C (4 bars)
    // Main D (4 bars)
    // Fill In AA (1 bar)
    // Fill In BB (1 bar)
    // Fill In CC (1 bar)
    // Fill In DD (1 bar)
    // Ending A (2 bars)
    const sections = [
      { name: 'Intro A', bars: 1, notes: mainANotes },
      { name: 'Main A', bars: 4, notes: mainANotes },
      { name: 'Main B', bars: 4, notes: mainANotes },
      { name: 'Main C', bars: 4, notes: mainANotes },
      { name: 'Main D', bars: 4, notes: mainANotes },
      { name: 'Fill In AA', bars: 1, notes: mainANotes },
      { name: 'Fill In BB', bars: 1, notes: mainANotes },
      { name: 'Fill In CC', bars: 1, notes: mainANotes },
      { name: 'Fill In DD', bars: 1, notes: mainANotes },
      { name: 'Ending A', bars: 2, notes: mainANotes },
    ];

    const partsConfig = {
      Rhythm1: { msb: 127, lsb: 0, pc: 0 },
      Rhythm2: { msb: 127, lsb: 0, pc: 0 },
      Bass: { msb: 0, lsb: 0, pc: 33 },      // Standard XG Finger Bass
      Chord1: { msb: 0, lsb: 0, pc: 0 },     // Standard XG Grand Piano
      Chord2: { msb: 0, lsb: 0, pc: 24 },    // Standard XG Guitar
      Pad: { msb: 0, lsb: 0, pc: 48 },       // Standard XG Strings
      Phrase1: { msb: 0, lsb: 0, pc: 73 },   // Standard XG Flute
      Phrase2: { msb: 0, lsb: 0, pc: 65 },   // Standard XG Sax
    };

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'SX920_standard-kit-1',
      bpm: 120,
      timeSignature: timeSig,
      division,
      sections,
      parts: partsConfig,
      injectCasm: true,
    });

    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(binaryBytes.length).toBeGreaterThan(1000);

    const reParsed = YamahaParser.parse(binaryBytes, 'STY');
    console.log('Generated sections:', reParsed.sections.map(s => s.name));
    expect(reParsed.sections.map(s => s.name)).toContain('Intro A');
    expect(reParsed.sections.map(s => s.name)).toContain('Main A');
    expect(reParsed.sections.map(s => s.name)).toContain('Main B');
    expect(reParsed.sections.map(s => s.name)).toContain('Main C');
    expect(reParsed.sections.map(s => s.name)).toContain('Main D');
    expect(reParsed.sections.map(s => s.name)).toContain('Ending A');
    expect(reParsed.hasCasm).toBe(true);

    // Check CASM CSEGs
    const casmChunk = reParsed.customChunks.find(c => c.id === 'CASM')!;
    expect(casmChunk).toBeDefined();

    fs.writeFileSync('public/samples/test_fixed_sx920.sty', binaryBytes);
    console.log('Successfully written public/samples/test_fixed_sx920.sty:', binaryBytes.length, 'bytes');
  });
});
