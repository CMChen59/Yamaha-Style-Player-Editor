import { describe, it, expect } from 'vitest';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Test synthesis logic with 4-bar sections', () => {
  it('correctly creates 4-bar Intro A, Main A, Main B, Ending A without leaking to Intro B/C', () => {
    // 4 bars of 16 steps = 64 steps
    const drumMainA = new Map<number, boolean[]>();
    const kickA = new Array(64).fill(false);
    const snareA = new Array(64).fill(false);
    for (let b = 0; b < 4; b++) {
      kickA[b * 16 + 0] = true;
      kickA[b * 16 + 8] = true;
      snareA[b * 16 + 4] = true;
      // 4th bar fill in Main A
      if (b === 3) {
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
    for (let b = 0; b < 4; b++) {
      bassMainA.set(b * 16 + 0, 36);
      bassMainA.set(b * 16 + 8, 36);
    }

    const chordMainA = new Map<number, Set<number>>();
    for (let b = 0; b < 4; b++) {
      chordMainA.set(b * 16 + 0, new Set([60, 64, 67]));
    }

    // Intro A (4 bars)
    const drumIntroA = new Map<number, boolean[]>();
    const kickIntro = new Array(64).fill(false);
    kickIntro[0] = true;
    drumIntroA.set(36, kickIntro);
    const bassIntroA = new Map<number, number>();
    bassIntroA.set(0, 36);
    bassIntroA.set(62, 47); // Leading tone
    const chordIntroA = new Map<number, Set<number>>();
    chordIntroA.set(0, new Set([60, 64, 67]));

    // Ending A (2 bars = 32 steps)
    const drumEndingA = new Map<number, boolean[]>();
    const kickEnd = new Array(32).fill(false);
    kickEnd[0] = true;
    drumEndingA.set(36, kickEnd);
    const bassEndingA = new Map<number, number>();
    bassEndingA.set(0, 36);
    const chordEndingA = new Map<number, Set<number>>();
    chordEndingA.set(0, new Set([60, 64, 67]));

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'SX920 Test Style',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      sections: [
        {
          name: 'Intro A',
          bars: 4,
          drumPattern: drumIntroA,
          bassPattern: bassIntroA,
          chordPattern: chordIntroA,
        },
        {
          name: 'Main A',
          bars: 4,
          drumPattern: drumMainA,
          bassPattern: bassMainA,
          chordPattern: chordMainA,
        },
        {
          name: 'Main B',
          bars: 4,
          drumPattern: drumMainA,
          bassPattern: bassMainA,
          chordPattern: chordMainA,
        },
        {
          name: 'Ending A',
          bars: 2,
          drumPattern: drumEndingA,
          bassPattern: bassEndingA,
          chordPattern: chordEndingA,
        },
      ],
    });

    expect(bytes).toBeDefined();
    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);

    const secMap = new Map(parsed.sections.map(s => [s.name, s]));
    console.log('Parsed sections:');
    parsed.sections.forEach(s => console.log(`  ${s.name}: start=${s.startTick}, end=${s.endTick}, bars=${s.measureCount}`));

    expect(secMap.get('Main A')?.measureCount).toBe(4);
    expect(secMap.get('Main B')?.measureCount).toBe(4);
    expect(secMap.get('Intro A')?.measureCount).toBe(4);
    expect(secMap.get('Ending A')?.measureCount).toBe(2);
    expect(secMap.get('Fill In AA')?.measureCount).toBe(1);
    expect(secMap.get('Fill In BB')?.measureCount).toBe(1);

    // Verify notes in sections
    const tr0 = parsed.tracks[0];
    let tick = 0;
    const notesBySection: Record<string, number> = {};
    for (const ev of tr0.events) {
      tick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        const sec = parsed.sections.find(s => s.startTick <= tick && (s.endTick === undefined || tick < s.endTick));
        const name = sec?.name || 'Unknown';
        notesBySection[name] = (notesBySection[name] || 0) + 1;
      }
    }
    console.log('Notes by section:', notesBySection);

    // Intro A, Main A, Main B, Ending A, Fill In AA, Fill In BB MUST have notes
    expect(notesBySection['Intro A']).toBeGreaterThan(0);
    expect(notesBySection['Main A']).toBeGreaterThan(0);
    expect(notesBySection['Main B']).toBeGreaterThan(0);
    expect(notesBySection['Ending A']).toBeGreaterThan(0);
    expect(notesBySection['Fill In AA']).toBeGreaterThan(0);
    expect(notesBySection['Fill In BB']).toBeGreaterThan(0);

    // Unedited sections (Intro B, Intro C, Ending B, Ending C, Main C, Main D) MUST have 0 notes!
    expect(notesBySection['Intro B'] || 0).toBe(0);
    expect(notesBySection['Intro C'] || 0).toBe(0);
    expect(notesBySection['Ending B'] || 0).toBe(0);
    expect(notesBySection['Ending C'] || 0).toBe(0);
    expect(notesBySection['Main C'] || 0).toBe(0);
    expect(notesBySection['Main D'] || 0).toBe(0);
  });
});
