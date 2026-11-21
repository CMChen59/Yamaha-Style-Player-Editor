import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Map 2010-1 tracks to C template', () => {
  it('inspects notes across all 4 tracks', () => {
    const raw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');
    const p = YamahaParser.parse(raw, 'PAD');

    for (let trk = 1; trk <= 4; trk++) {
      const track = p.tracks[trk];
      const notes = track.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      console.log(`\n=== TRACK ${trk} (Pad ${trk}) === total notes: ${notes.length}`);
      const pcs = new Set(notes.map(n => (n.noteNumber ?? 0) % 12));
      console.log(`Pitch classes present:`, Array.from(pcs).sort((a,b)=>a-b));
      for (let i = 0; i < Math.min(10, notes.length); i++) {
        const n = notes[i];
        const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const name = names[(n.noteNumber ?? 0) % 12] + Math.floor((n.noteNumber ?? 0) / 12 - 1);
        console.log(`  [${i}] tick=${n.delta} note=${n.noteNumber}(${name}) vel=${n.velocity}`);
      }
    }
  });
});
