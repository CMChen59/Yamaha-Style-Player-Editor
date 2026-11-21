import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect notes across all measures', () => {
  it('prints all 26 notes', () => {
    const origRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');
    const orig = YamahaParser.parse(origRaw, 'PAD');

    const tmplRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010_Intro_CM_Template.PAD');
    const tmpl = YamahaParser.parse(tmplRaw, 'PAD');

    const ppq = orig.division;

    const origNotes: any[] = [];
    let curTick = 0;
    orig.tracks[2].events.forEach(e => {
      curTick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        origNotes.push({ tick: curTick, bar: (curTick / (ppq * 4) + 1).toFixed(2), note: e.noteNumber, vel: e.velocity });
      }
    });

    const tmplNotes: any[] = [];
    curTick = 0;
    tmpl.tracks[2].events.forEach(e => {
      curTick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        tmplNotes.push({ tick: curTick, bar: (curTick / (ppq * 4) + 1).toFixed(2), note: e.noteNumber, vel: e.velocity });
      }
    });

    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    for (let i = 0; i < origNotes.length; i++) {
      const o = origNotes[i];
      const t = tmplNotes[i];
      const oName = names[o.note % 12] + Math.floor(o.note / 12 - 1);
      const tName = names[t.note % 12] + Math.floor(t.note / 12 - 1);
      console.log(`[${i}] bar=${o.bar} Orig: ${o.note}(${oName}) -> Tmpl: ${t.note}(${tName})`);
    }
  });
});
