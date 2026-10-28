import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

const userDownloads = path.join(process.env.USERPROFILE || '', 'Downloads');
const hotelPath = path.join(userDownloads, 'edited_伤心酒店 Style.sty');
const sx900Path = path.resolve('public/samples/4006_SX900.T547.sty');

function dumpFile(filePath: string) {
  const buf = fs.readFileSync(filePath);
  const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
  console.log(`\n=== File: ${path.basename(filePath)} ===`);
  console.log('Size:', buf.length);
  console.log('Sections:');
  for (const s of parsed.sections) {
    console.log(`  ${s.name.padEnd(12)} startTick=${s.startTick} endTick=${s.endTick} bars=${s.measureCount}`);
  }
  console.log('Custom Chunks:', parsed.customChunks.map(c => ({ id: c.id, size: c.data.length })));
  
  // Check CASM chunk content
  const casm = parsed.customChunks.find(c => c.id.trim() === 'CASM');
  if (casm) {
    console.log(`CASM chunk size: ${casm.data.length}`);
    // Check if CASM has subchunks
    const str = Buffer.from(casm.data).toString('ascii');
    // Find ASCII 4-char chunk IDs in CASM
    const matches = str.match(/[A-Za-z0-9_ ]{4}/g) || [];
    console.log('CASM internal tags:', Array.from(new Set(matches.filter(m => ['CSET', 'Ctbl', 'Cntt', 'CASM', 'MH  ', 'Cseg'].includes(m)))));
  }

  // Check SysEx events in Track 0
  const tr0 = parsed.tracks[0];
  const sysexEvents = tr0.events.filter(e => e.type === 'sysex');
  console.log(`\nSysEx events count in ${path.basename(filePath)}:`, sysexEvents.length);
  for (const se of sysexEvents) {
    const raw = (se as any).rawBytes ? Buffer.from((se as any).rawBytes).toString('hex') : '';
    console.log(`  delta=${se.delta} SysEx:`, raw);
  }



  // Check controller / program events at tick 0 ~ 1000
  let t = 0;
  console.log('Setup events at beginning:');
  for (const ev of tr0.events) {
    t += ev.delta;
    if (t > (parsed.division * 8)) break; // first 2 bars
    if (ev.type === 'controlChange' || ev.type === 'programChange') {
      console.log(`  tick=${t} ch=${ev.channel} type=${ev.type} cc=${ev.controller} val=${ev.value} pc=${ev.program}`);
    }
  }
}

dumpFile(hotelPath);
dumpFile(sx900Path);
