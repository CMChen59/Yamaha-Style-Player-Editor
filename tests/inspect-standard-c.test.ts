import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect previously generated files', () => {
  it('checks notes in 2010-1_PAD_Standard_C.PAD', () => {
    const raw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD_Standard_C.PAD');
    const p = YamahaParser.parse(raw, 'PAD');
    console.log('track 0:', p.tracks[0].events.map(e => ({ delta: e.delta, text: e.text, metaType: e.metaType })));
    console.log('track 2 notes:');
    let tick = 0;
    p.tracks[2].events.forEach(e => {
      tick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
        console.log(`  tick=${tick} note=${e.noteNumber}(${name}) vel=${e.velocity}`);
      }
    });
  });
});
