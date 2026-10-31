import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Find Ch 0 PC 104 Vol 80', () => {
  it('checks all sections and events', () => {
    const files = [
      'D:/Downloads/Yamaha/容易受傷的女人.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-A.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-B.sty',
      'D:/Downloads/Yamaha/容易受傷的女人-C.sty',
      'public/samples/1024_容易受傷的女人.sty'
    ];

    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const buf = new Uint8Array(fs.readFileSync(f));
      const parsed = YamahaParser.parse(buf, 'STY');

      console.log(`\n========================================`);
      console.log(`FILE: ${f}`);
      console.log(`Sections:`);
      for (const s of parsed.sections) {
        console.log(`  [${s.name}]: start=${s.startTick}, end=${s.endTick}`);
      }
    }
  });
});
