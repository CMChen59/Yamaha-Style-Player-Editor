import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('YamahaTemplateStyleSynthesizer', () => {
  it('synthesizes a perfect SX920 style file from golden template', () => {
    // 1. Prepare dummy drum, bass, and chord patterns (4 bars)
    const drumPattern = new Map<number, boolean[]>();
    const kick = new Array(64).fill(false);
    const snare = new Array(64).fill(false);
    const hihat = new Array(64).fill(false);

    for (let b = 0; b < 4; b++) {
      kick[b * 16 + 0] = true;
      kick[b * 16 + 8] = true;
      snare[b * 16 + 4] = true;
      snare[b * 16 + 12] = true;
      for (let s = 0; s < 16; s += 2) {
        hihat[b * 16 + s] = true;
      }
    }
    drumPattern.set(36, kick);
    drumPattern.set(38, snare);
    drumPattern.set(42, hihat);

    const bassPattern = new Map<number, number>();
    for (let b = 0; b < 4; b++) {
      bassPattern.set(b * 16 + 0, 36);
      bassPattern.set(b * 16 + 8, 36);
    }

    const chordPattern = new Map<number, Set<number>>();
    for (let b = 0; b < 4; b++) {
      chordPattern.set(b * 16 + 0, new Set([60, 64, 67]));
      chordPattern.set(b * 16 + 8, new Set([60, 64, 67]));
    }

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'Pop Rock 2026',
      bpm: 128,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      sections: [
        {
          name: 'Main A',
          bars: 4,
          drumPattern,
          bassPattern,
          chordPattern,
        },
        {
          name: 'Main B',
          bars: 4,
          drumPattern,
          bassPattern,
          chordPattern,
        },
      ],
    });

    expect(bytes).toBeDefined();
    expect(bytes.length).toBeGreaterThan(10000);

    // Parse back
    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);
    expect(parsed.hasCasm).toBe(true);

    const casmChunk = parsed.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    expect(casmChunk?.data.length).toBe(2104); // Official 1920 PPQ CASM intact!

    // Verify track name
    const tr0 = parsed.tracks[0];
    const nameEv = tr0.events.find(e => e.type === 'meta' && e.metaType === 0x03);
    expect(nameEv?.text).toBe('Pop Rock 2026');

    // Check where notes exist
    let t = 0;
    const notesBySection = new Map<string, number>();
    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        const sec = parsed.sections.find(s => s.startTick <= t && (s.endTick === undefined || t < s.endTick));
        const sName = sec?.name || 'Unknown';
        notesBySection.set(sName, (notesBySection.get(sName) || 0) + 1);
      }
    }

    // Verify sections have notes
    expect(notesBySection.get('Main A')).toBeGreaterThan(0);
    expect(notesBySection.get('Main B')).toBeGreaterThan(0);
    expect(notesBySection.get('Fill In AA')).toBeGreaterThan(0);
    expect(notesBySection.get('Fill In BB')).toBeGreaterThan(0);

    const totalNotes = tr0.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0).length;
    console.log('Total notes in synthesized file:', totalNotes);
    expect(totalNotes).toBeGreaterThan(100);

    // Save sample to disk
    fs.writeFileSync('public/samples/SX920_Golden_Template.sty', Buffer.from(bytes));
  });

  it('correctly handles 8-step (1/8 note) resolution without 2x compression or blank bars across all 4 bars', () => {
    // 4 bars with 8 steps per bar = 32 steps total
    const drumPattern = new Map<number, boolean[]>();
    const kick = new Array(32).fill(false);
    const snare = new Array(32).fill(false);
    // Put kick on step 0 and 4 of each bar (beat 1 and 3)
    for (let b = 0; b < 4; b++) {
      kick[b * 8 + 0] = true;
      kick[b * 8 + 4] = true;
      snare[b * 8 + 2] = true;
      snare[b * 8 + 6] = true;
    }
    drumPattern.set(36, kick);
    drumPattern.set(38, snare);

    const bassPattern = new Map<number, number>();
    for (let b = 0; b < 4; b++) {
      bassPattern.set(b * 8 + 0, 36);
      bassPattern.set(b * 8 + 4, 36);
    }

    const chordPattern = new Map<number, Set<number>>();
    for (let b = 0; b < 4; b++) {
      chordPattern.set(b * 8 + 0, new Set([60, 64, 67]));
    }

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: '8Beat Folk',
      bpm: 100,
      stepsPerBar: 8,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 24 }, // Guitar
      sections: [
        {
          name: 'Main A',
          bars: 4,
          stepsPerBar: 8,
          drumPattern,
          bassPattern,
          chordPattern,
        },
      ],
    });

    const parsed = YamahaParser.parse(bytes, 'STY');
    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    expect(mainA).toBeDefined();
    expect(mainA.measureCount).toBe(4);

    // Main A in template is now dynamically 4 bars (4 * 7680 = 30720 ticks)
    const ticksPerBar = 1920 * 4;
    const tr0 = parsed.tracks[0];
    let t = 0;
    const notesInMainABars: number[] = [0, 0, 0, 0]; // count per bar (Bar 1 ~ 4)
    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        if (t >= mainA.startTick && t < mainA.startTick + 4 * ticksPerBar) {
          const barIdx = Math.floor((t - mainA.startTick) / ticksPerBar);
          if (barIdx >= 0 && barIdx < 4) {
            notesInMainABars[barIdx]++;
          }
        }
      }
    }

    console.log('Notes in 8-beat Main A bars (all 4 bars):', notesInMainABars);
    // All 4 bars MUST have notes! No bar should be 0!
    expect(notesInMainABars[0]).toBeGreaterThan(0);
    expect(notesInMainABars[1]).toBeGreaterThan(0);
    expect(notesInMainABars[2]).toBeGreaterThan(0);
    expect(notesInMainABars[3]).toBeGreaterThan(0);
    // All 4 bars should have equal notes because each bar has same kick/snare/chord pattern
    expect(notesInMainABars[0]).toBe(notesInMainABars[1]);
    expect(notesInMainABars[1]).toBe(notesInMainABars[2]);
    expect(notesInMainABars[2]).toBe(notesInMainABars[3]);
  });
});
