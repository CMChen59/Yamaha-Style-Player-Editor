import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Debug 容易受傷的女人.sty', () => {
  it('inspects parts, voices, volumes, and CASM', () => {
    const files = [
      'D:/Downloads/Yamaha/容易受傷的女人.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-A.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-B.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-C.sty',
    ];

    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      console.log(`\n========================================`);
      console.log(`FILE: ${f}`);
      console.log(`========================================`);
      const buf = new Uint8Array(fs.readFileSync(f));
      const parsed = YamahaParser.parse(buf, 'STY');

      console.log(`BPM: ${parsed.bpm}, PPQ: ${parsed.division}, Sections: ${parsed.sections.map(s => s.name).join(', ')}`);
      console.log(`Has CASM: ${parsed.casm !== undefined}`);

      console.log(`\n--- Parsed Parts (raw global parts) ---`);
      for (const p of parsed.parts) {
        console.log(`Part Ch ${p.channel} (${p.name}): Voice=${p.bankMsb}-${p.bankLsb}-${p.programChange + 1} (${p.voiceName}), Vol=${p.volume}, Pan=${p.pan}`);
      }

      console.log(`\n--- CASM Mappings per Section ---`);
      if (parsed.casm) {
        for (const [secName, ctab] of Object.entries(parsed.casm.sections)) {
          console.log(`Section [${secName}]:`);
          for (const [srcCh, entry] of Object.entries(ctab.entries)) {
            console.log(`  Src Ch ${srcCh} -> Dest Ch ${entry.destChannel}`);
          }
        }
      }

      styPlaybackEngine.loadParsed(parsed);
      for (const sec of parsed.sections) {
        styPlaybackEngine.selectSection(sec.name);
        console.log(`\n>>> Selected Section: [${sec.name}] <<<`);
        const voices = styPlaybackEngine.getPartVoices();
        for (let ch = 8; ch <= 15; ch++) {
          const v = voices.get(ch);
          const vol = styPlaybackEngine.getChannelVolume(ch);
          const pan = styPlaybackEngine.getChannelPan(ch);
          console.log(`  Ch ${ch} (CH ${ch + 1}): Voice=${v?.msb}-${v?.lsb}-${(v?.pc ?? 0) + 1} (${v?.voiceName}), Vol=${vol}, Pan=${pan}`);
        }
      }
    }
  });
});
