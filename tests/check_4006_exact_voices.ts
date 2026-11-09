import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { findYamahaVoice, YAMAHA_SX920_VOICES } from '../src/core/data/yamaha-voices';

const filePath = path.resolve('public/samples/4006_SX900.T547.sty');
const buf = new Uint8Array(fs.readFileSync(filePath));
const parsed = YamahaParser.parse(buf, 'STY');

console.log('=== Checking all parts in 4006 against SX920 Voice DB ===');
for (const p of parsed.parts) {
  const msb = p.bankMsb ?? 0;
  const lsb = p.bankLsb ?? 0;
  const pc = p.programChange ?? 0;
  
  const exact = YAMAHA_SX920_VOICES.find(v => v.msb === msb && v.lsb === lsb && v.pc === pc);
  const found = findYamahaVoice(msb, lsb, pc);
  console.log(`Part Ch ${p.channel} (${msb}-${lsb}-${pc}):`);
  console.log(`  Exact in SX920 DB:`, exact ? `YES: ${exact.name} (${exact.chineseName}) [${exact.type}]` : 'NO! NOT FOUND!');
  if (!exact) {
    console.log(`  findYamahaVoice resolved to: ${found?.name} (${found?.msb}-${found?.lsb}-${found?.pc})`);
  }
}
