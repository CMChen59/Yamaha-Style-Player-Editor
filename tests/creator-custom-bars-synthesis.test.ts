import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Custom Bars & Yamaha SFF2 Synthesis', () => {
  it('synthesizes non-standard custom measure lengths (Intro A=5 bars, Main A=6 bars, Main B=3 bars, Ending A=3 bars)', () => {
    // 5 bars Intro A (16 steps * 5 = 80 steps)
    const drumIntro = new Map<number, boolean[]>();
    const kickIntro = new Array(80).fill(false);
    kickIntro[0] = true;
    drumIntro.set(36, kickIntro);
    const bassIntro = new Map<number, number>();
    bassIntro.set(0, 36);
    bassIntro.set(78, 47); // B2 leading tone on bar 5
    const chordIntro = new Map<number, Set<number>>();
    chordIntro.set(0, new Set([60, 64, 67]));

    // 6 bars Main A (16 steps * 6 = 96 steps)
    const drumMainA = new Map<number, boolean[]>();
    const kickA = new Array(96).fill(false);
    const snareA = new Array(96).fill(false);
    for (let b = 0; b < 6; b++) {
      kickA[b * 16 + 0] = true;
      kickA[b * 16 + 8] = true;
      snareA[b * 16 + 4] = true;
      if (b === 5) {
        // Bar 6 has fill
        snareA[b * 16 + 12] = true;
        snareA[b * 16 + 14] = true;
        snareA[b * 16 + 15] = true;
      } else {
        snareA[b * 16 + 12] = true;
      }
    }
    drumMainA.set(36, kickA);
    drumMainA.set(38, snareA);
    const bassMainA = new Map<number, number>();
    for (let b = 0; b < 6; b++) {
      bassMainA.set(b * 16 + 0, 36);
    }
    const chordMainA = new Map<number, Set<number>>();
    for (let b = 0; b < 6; b++) {
      chordMainA.set(b * 16 + 0, new Set([60, 64, 67]));
    }

    // 3 bars Main B (16 steps * 3 = 48 steps)
    const drumMainB = new Map<number, boolean[]>();
    const kickB = new Array(48).fill(false);
    kickB[0] = true;
    drumMainB.set(36, kickB);
    const bassMainB = new Map<number, number>();
    bassMainB.set(0, 36);
    const chordMainB = new Map<number, Set<number>>();
    chordMainB.set(0, new Set([60, 64, 67]));

    // 3 bars Ending A (16 steps * 3 = 48 steps)
    const drumEnding = new Map<number, boolean[]>();
    const crashEnd = new Array(48).fill(false);
    crashEnd[0] = true;
    drumEnding.set(49, crashEnd);
    const bassEnding = new Map<number, number>();
    bassEnding.set(0, 36);
    const chordEnding = new Map<number, Set<number>>();
    chordEnding.set(0, new Set([60, 64, 67]));

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'Custom 5-6-3 Bar Test',
      bpm: 110,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      sections: [
        { name: 'Intro A', bars: 5, drumPattern: drumIntro, bassPattern: bassIntro, chordPattern: chordIntro },
        { name: 'Main A', bars: 6, drumPattern: drumMainA, bassPattern: bassMainA, chordPattern: chordMainA },
        { name: 'Main B', bars: 3, drumPattern: drumMainB, bassPattern: bassMainB, chordPattern: chordMainB },
        { name: 'Ending A', bars: 3, drumPattern: drumEnding, bassPattern: bassEnding, chordPattern: chordEnding },
      ],
    });

    expect(bytes).toBeDefined();
    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);

    const secMap = new Map(parsed.sections.map(s => [s.name, s]));
    expect(secMap.get('Main A')?.measureCount).toBe(6);
    expect(secMap.get('Main B')?.measureCount).toBe(3);
    expect(secMap.get('Intro A')?.measureCount).toBe(5);
    expect(secMap.get('Ending A')?.measureCount).toBe(3);
    expect(secMap.get('Fill In AA')?.measureCount).toBe(1);
    expect(secMap.get('Fill In BB')?.measureCount).toBe(1);

    // Verify Main A has notes in all 6 bars
    const ticksPerBar = 1920 * 4;
    const mainA = secMap.get('Main A')!;
    const tr0 = parsed.tracks[0];
    let t = 0;
    const notesInMainABars: number[] = [0, 0, 0, 0, 0, 0];
    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        if (t >= mainA.startTick && t < mainA.endTick!) {
          const barIdx = Math.floor((t - mainA.startTick) / ticksPerBar);
          if (barIdx >= 0 && barIdx < 6) {
            notesInMainABars[barIdx]++;
          }
        }
      }
    }
    console.log('Notes in 6-bar Main A:', notesInMainABars);
    notesInMainABars.forEach((count, i) => {
      expect(count, `Bar ${i + 1} must have notes`).toBeGreaterThan(0);
    });
    // Bar 6 has extra snare fill notes, so it should have more notes than Bar 1
    expect(notesInMainABars[5]).toBeGreaterThan(notesInMainABars[0]);

    // Save test STY for inspection
    fs.writeFileSync('public/samples/SX920_Custom_Bars_5_6_3.sty', Buffer.from(bytes));
  });

  it('generates standard 4-bar style for PSR-SX920 keyboard verification', () => {
    // Generate standard 4-bar Pop Ballad style with Intro A, Main A, Main B, Ending A
    const drumMainA = new Map<number, boolean[]>();
    const kick = new Array(64).fill(false);
    const snare = new Array(64).fill(false);
    const hihat = new Array(64).fill(false);
    for (let b = 0; b < 4; b++) {
      kick[b * 16 + 0] = true;
      kick[b * 16 + 6] = true;
      kick[b * 16 + 8] = true;
      kick[b * 16 + 10] = true;
      snare[b * 16 + 4] = true;
      if (b === 3) {
        // 4th-bar fill
        snare[b * 16 + 12] = true;
        snare[b * 16 + 13] = true;
        snare[b * 16 + 14] = true;
        snare[b * 16 + 15] = true;
      } else {
        snare[b * 16 + 12] = true;
      }
      for (let s = 0; s < 16; s += 2) hihat[b * 16 + s] = true;
    }
    drumMainA.set(36, kick);
    drumMainA.set(38, snare);
    drumMainA.set(42, hihat);

    const bassMainA = new Map<number, number>();
    for (let b = 0; b < 4; b++) {
      bassMainA.set(b * 16 + 0, 36); // C1
      bassMainA.set(b * 16 + 8, 36);
    }

    const chordMainA = new Map<number, Set<number>>();
    for (let b = 0; b < 4; b++) {
      chordMainA.set(b * 16 + 0, new Set([60, 64, 67])); // C maj
      chordMainA.set(b * 16 + 8, new Set([60, 64, 67]));
    }

    // Intro A (4 bars) with drum count-in and chord harmonic progression
    const drumIntro = new Map<number, boolean[]>();
    const kickIntro = new Array(64).fill(false);
    const snareIntro = new Array(64).fill(false);
    const hihatIntro = new Array(64).fill(false);
    for (let s = 0; s < 16; s += 4) hihatIntro[s] = true; // count-in bar 1
    for (let b = 1; b < 4; b++) {
      kickIntro[b * 16 + 0] = true;
      kickIntro[b * 16 + 8] = true;
      snareIntro[b * 16 + 4] = true;
      if (b === 3) {
        snareIntro[b * 16 + 12] = true;
        snareIntro[b * 16 + 13] = true;
        snareIntro[b * 16 + 14] = true;
        snareIntro[b * 16 + 15] = true;
      } else {
        snareIntro[b * 16 + 12] = true;
      }
    }
    drumIntro.set(36, kickIntro);
    drumIntro.set(38, snareIntro);
    drumIntro.set(42, hihatIntro);

    const bassIntro = new Map<number, number>();
    bassIntro.set(16, 36); // Bar 2
    bassIntro.set(32, 41); // Bar 3 (F)
    bassIntro.set(48, 43); // Bar 4 (G)
    bassIntro.set(62, 47); // Bar 4 beat 4.5: B2 leading tone!

    const chordIntro = new Map<number, Set<number>>();
    chordIntro.set(16, new Set([60, 64, 67]));
    chordIntro.set(32, new Set([60, 65, 69]));
    chordIntro.set(48, new Set([59, 62, 67]));

    // Ending A (4 bars)
    const drumEnding = new Map<number, boolean[]>();
    const crashEnd = new Array(64).fill(false);
    crashEnd[0] = true;
    drumEnding.set(49, crashEnd);
    const bassEnding = new Map<number, number>();
    bassEnding.set(0, 36);
    const chordEnding = new Map<number, Set<number>>();
    chordEnding.set(0, new Set([60, 64, 67]));

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'SX920 Official V2',
      bpm: 118,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      sections: [
        { name: 'Intro A', bars: 4, drumPattern: drumIntro, bassPattern: bassIntro, chordPattern: chordIntro },
        { name: 'Main A', bars: 4, drumPattern: drumMainA, bassPattern: bassMainA, chordPattern: chordMainA },
        { name: 'Main B', bars: 4, drumPattern: drumMainA, bassPattern: bassMainA, chordPattern: chordMainA },
        { name: 'Ending A', bars: 4, drumPattern: drumEnding, bassPattern: bassEnding, chordPattern: chordEnding },
      ],
    });

    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);
    expect(parsed.hasCasm).toBe(true);

    // Save official sample for the user to copy directly to USB and test on Yamaha PSR-SX920 keyboard!
    fs.writeFileSync('public/samples/SX920_V2_4Bar_Test.sty', Buffer.from(bytes));
    console.log('Successfully generated public/samples/SX920_V2_4Bar_Test.sty (size:', bytes.length, 'bytes)');
  });
});
