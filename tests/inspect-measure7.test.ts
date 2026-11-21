import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect Measure 7 in 2010-1_PAD and Fixed PAD', () => {
  it('prints exact notes in Measure 7', () => {
    const rawOrig = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');
    const orig = YamahaParser.parse(rawOrig, 'PAD');

    const rawFixed = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010_Intro_CM_Minor_Fixed.PAD');
    const fixed = YamahaParser.parse(rawFixed, 'PAD');

    const ppq = 480;
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    console.log('=== ORIGINAL 2010-1 Measure 7 & 8 ===');
    let tick = 0;
    orig.tracks[2].events.forEach(e => {
      tick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        const bar = (tick / (ppq * 4) + 1).toFixed(2);
        if (parseFloat(bar) >= 7.0) {
          const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
          console.log(`  bar=${bar} note=${e.noteNumber}(${name}) vel=${e.velocity}`);
        }
      }
    });

    console.log('\n=== FIXED PAD Measure 7 & 8 ===');
    tick = 0;
    fixed.tracks[2].events.forEach(e => {
      tick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        const bar = (tick / (ppq * 4) + 1).toFixed(2);
        if (parseFloat(bar) >= 7.0) {
          const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
          console.log(`  bar=${bar} note=${e.noteNumber}(${name}) vel=${e.velocity}`);
        }
      }
    });
  });
});
