import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

const filePath = path.resolve('public/samples/4006_SX900.T547.sty');
const buf = new Uint8Array(fs.readFileSync(filePath));
const parsed = YamahaParser.parse(buf, 'STY');

console.log('=== PARTS IN 4006_SX900.T547.sty ===');
for (const p of parsed.parts) {
  console.log(`Part channel ${p.channel}: name="${p.name}", MSB=${p.bankMsb}, LSB=${p.bankLsb}, PC=${p.programChange}, Vol=${p.volume}, Pan=${p.pan}, Rev=${p.reverb}, Cho=${p.chorus}`);
}

console.log('\n=== ALL PROGRAM CHANGES IN ALL TRACKS ===');
for (const [trkIdx, trk] of parsed.tracks.entries()) {
  let tick = 0;
  for (const ev of trk.events) {
    tick += ev.delta;
    if (ev.type === 'programChange') {
      console.log(`Trk ${trkIdx} at tick ${tick}: Ch ${ev.channel} ProgramChange ${ev.program}`);
    } else if (ev.type === 'controlChange' && (ev.controller === 0 || ev.controller === 32)) {
      console.log(`Trk ${trkIdx} at tick ${tick}: Ch ${ev.channel} CC ${ev.controller} = ${ev.value}`);
    }
  }
}
