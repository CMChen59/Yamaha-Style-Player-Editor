import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Check Channel 8 in 1024', () => {
  it('checks all events on Channel 8', () => {
    const buf = new Uint8Array(fs.readFileSync('public/samples/1024_容易受傷的女人.sty'));
    const parsed = YamahaParser.parse(buf, 'STY');

    console.log('=== All events on Channel 8 in 1024_容易受傷的女人.sty ===');
    let tick = 0;
    let found = 0;
    for (const ev of parsed.tracks[0].events) {
      tick += ev.delta;
      if (ev.channel === 8) {
        found++;
        console.log(`Tick ${tick}:`, ev);
      }
    }
    console.log(`Total events on Channel 8: ${found}`);
  });
});
