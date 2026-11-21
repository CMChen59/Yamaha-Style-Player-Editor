import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect Am and Em pads', () => {
  it('compares notes between Am and Em pads', () => {
    const amRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010_空港_Intro_Am調.PAD');
    const emRaw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010_空港_Intro_Em原調.PAD');
    const am = YamahaParser.parse(amRaw, 'PAD');
    const em = YamahaParser.parse(emRaw, 'PAD');

    console.log('Am Track 0:', am.tracks[0].events.map(e => e.text).filter(Boolean));
    console.log('Em Track 0:', em.tracks[0].events.map(e => e.text).filter(Boolean));

    const amNotes = am.tracks[2].events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    const emNotes = em.tracks[2].events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);

    console.log(`Track 2 note counts: Am=${amNotes.length}, Em=${emNotes.length}`);
    for (let i = 0; i < Math.min(10, amNotes.length); i++) {
      const a = amNotes[i];
      const e = emNotes[i];
      console.log(`[${i}] Am: note=${a.noteNumber} tick=${a.delta} | Em: note=${e.noteNumber} tick=${e.delta} | diff=${(e.noteNumber ?? 0) - (a.noteNumber ?? 0)}`);
    }
  });
});
