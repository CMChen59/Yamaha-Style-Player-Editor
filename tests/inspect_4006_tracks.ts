import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

const filePath = path.resolve('public/samples/4006_SX900.T547.sty');
const buf = new Uint8Array(fs.readFileSync(filePath));
const parsed = YamahaParser.parse(buf, 'STY');

console.log('Total tracks:', parsed.tracks.length);
for (const [idx, trk] of parsed.tracks.entries()) {
  const nameEv = trk.events.find(e => e.type === 'meta' && e.metaType === 3);
  const channels = new Set(trk.events.map(e => e.channel).filter(c => c !== undefined));
  const noteOns = trk.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
  console.log(`Track ${idx}: name="${nameEv?.text}", channels=[${Array.from(channels).join(',')}], noteCount=${noteOns.length}`);
}

const mainA = parsed.sections.find(s => s.name.toLowerCase() === 'main a')!;
console.log('\n--- Notes in Main A by Track and Channel ---');
for (const [idx, trk] of parsed.tracks.entries()) {
  let tick = 0;
  const trkNotes: any[] = [];
  for (const ev of trk.events) {
    tick += ev.delta;
    if (tick >= mainA.startTick && tick < mainA.endTick) {
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        trkNotes.push({ tick: tick - mainA.startTick, ch: ev.channel, note: ev.noteNumber, vel: ev.velocity });
      }
    }
  }
  if (trkNotes.length > 0) {
    console.log(`Track ${idx}: ${trkNotes.length} notes in Main A. Channels: ${Array.from(new Set(trkNotes.map(n => n.ch))).join(',')}`);
  }
}
