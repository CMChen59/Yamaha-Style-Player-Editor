import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Deep inspection of Balloon.S910.pad vs 2010-1_PAD.PAD', () => {
  it('analyzes tracks and notes', () => {
    const bRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/Balloon.S910.pad');
    const b = YamahaParser.parse(bRaw, 'PAD');

    const kRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');
    const k = YamahaParser.parse(kRaw, 'PAD');

    console.log('=== BALLOON S910 PAD DETAILS ===');
    b.tracks.forEach((t, i) => {
      const notes = t.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      const noteNames = Array.from(new Set(notes.map(n => {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        return names[(n.noteNumber ?? 0) % 12] + Math.floor((n.noteNumber ?? 0) / 12 - 1);
      })));
      const pcs = Array.from(new Set(notes.map(n => (n.noteNumber ?? 0) % 12))).sort((a,b)=>a-b);
      console.log(`Track ${i}: totalEvents=${t.events.length}, noteCount=${notes.length}, distinctPCs=${pcs.join(',')}, noteNames=${noteNames.slice(0, 10).join(', ')}`);
      if (i === 3) {
        console.log('--- Balloon Track 3 (CM=ON) first 20 notes ---');
        notes.slice(0, 20).forEach(n => console.log(`  tick=${n.delta} note=${n.noteNumber} vel=${n.velocity}`));
      }
      if (i === 1 || i === 2) {
        console.log(`--- Balloon Track ${i} (CM=OFF) first 10 notes ---`);
        notes.slice(0, 10).forEach(n => console.log(`  tick=${n.delta} note=${n.noteNumber} vel=${n.velocity}`));
      }
    });

    console.log('\n=== 2010-1_PAD.PAD DETAILS ===');
    k.tracks.forEach((t, i) => {
      const notes = t.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      const noteNames = Array.from(new Set(notes.map(n => {
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        return names[(n.noteNumber ?? 0) % 12] + Math.floor((n.noteNumber ?? 0) / 12 - 1);
      })));
      const pcs = Array.from(new Set(notes.map(n => (n.noteNumber ?? 0) % 12))).sort((a,b)=>a-b);
      console.log(`Track ${i}: totalEvents=${t.events.length}, noteCount=${notes.length}, distinctPCs=${pcs.join(',')}, noteNames=${noteNames.slice(0, 10).join(', ')}`);
      if (i === 2) {
        console.log('--- 2010-1 Track 2 (Melody) first 25 notes ---');
        let curTick = 0;
        t.events.forEach(e => {
          curTick += e.delta;
          if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
            const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
            const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
            console.log(`  tick=${curTick} (bar=${(curTick/1920).toFixed(2)}) note=${e.noteNumber}(${name}) vel=${e.velocity}`);
          }
        });
      }
    });
  });
});
