import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect Main C/D Transitions', () => {
  it('inspects Main C and D transitions and fill-ins', () => {
    const f08 = new Uint8Array(fs.readFileSync('tests/1122-08-clean.sty'));
    const p08 = YamahaParser.parse(f08, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const pOff = YamahaParser.parse(fOff, 'STY');

    function inspectEndBeats(p: typeof p08, secName: string, label: string) {
      const sec = p.sections.find(s => s.name === secName);
      if (!sec) return;
      const bars = sec.measureCount;
      const endBarStartRel = (bars - 1) * 7680;
      console.log(`\n=== [${label}] ${secName} Bar ${bars} (Beat 3 & 4) ===`);
      let cur = 0;
      p.tracks[0].events.forEach(ev => {
        cur += ev.delta;
        if (cur >= sec.startTick && cur < sec.endTick) {
          const rel = cur - sec.startTick;
          if (rel >= endBarStartRel + 3840 && rel < endBarStartRel + 7680) {
            if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
              const relInBar = rel - endBarStartRel;
              const beat = (relInBar / 1920) + 1;
              console.log(`  Bt ${beat.toFixed(2)}: Ch ${ev.channel?.toString().padStart(2)} Note ${ev.noteNumber} vel=${ev.velocity}`);
            }
          }
        }
      });
    }

    inspectEndBeats(p08, 'Main C', '1122-08');
    inspectEndBeats(p08, 'Main D', '1122-08');
    inspectEndBeats(pOff, 'Main C', 'Official');
    inspectEndBeats(pOff, 'Main D', 'Official');
  });
});
