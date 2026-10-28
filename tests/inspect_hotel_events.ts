import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

const filePath = path.resolve('public/samples/4006_SX900.T547.sty');

const buf = fs.readFileSync(filePath);
const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');


console.log('Sections:', parsed.sections);
console.log('Parts:', parsed.parts);

const tr0 = parsed.tracks[0];
let curTick = 0;
let firstNoteTick: number | null = null;
let firstNoteChannel: number | null = null;
for (const ev of tr0.events) {
  curTick += ev.delta;
  if (ev.type === 'noteOn' && (ev.velocity || 0) > 0 && firstNoteTick === null) {
    firstNoteTick = curTick;
    firstNoteChannel = ev.channel ?? null;
  }
}
console.log('First note at tick:', firstNoteTick, 'ch:', firstNoteChannel);
console.log('Division:', parsed.division);

