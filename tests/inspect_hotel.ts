import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

const userDownloads = path.join(process.env.USERPROFILE || '', 'Downloads');
const files = fs.readdirSync(userDownloads).filter(f => f.includes('Style.sty') || f.includes('SX920.T547.sty'));
console.log('Found in Downloads:', files);

const sampleFile = path.resolve('public/samples/4006_SX900.T547.sty');

const testFiles = [
  ...files.map(f => path.join(userDownloads, f)),
  sampleFile
];

for (const fullPath of testFiles) {
  const f = path.basename(fullPath);
  console.log(`\n=================== Inspecting ${f} (${fs.statSync(fullPath).size} bytes) ===================`);
  try {
    const buf = fs.readFileSync(fullPath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    console.log('Format:', parsed.format);
    console.log('Division:', parsed.division);
    console.log('BPM:', parsed.bpm);
    console.log('TimeSignature:', parsed.timeSignature);
    console.log('Sections:', parsed.sections.map(s => `${s.name} (tick=${s.startTick})`));
    console.log('Custom Chunks:', parsed.customChunks.map(c => `${c.id} (${c.data.length} bytes)`));
    console.log('Parts count in parsed.parts:', parsed.parts.length);
    for (const p of parsed.parts) {
      console.log(`  Part Ch ${p.channel + 1} (chIdx ${p.channel}): Name="${p.partName}" Vol=${p.volume} Pan=${p.pan} Rev=${p.reverb} Cho=${p.chorus} Bank=${p.bankMsb}-${p.bankLsb} PC=${p.programChange}`);
    }

    const tr0 = parsed.tracks[0];
    if (tr0) {
      console.log(`\nTrack 0 total events: ${tr0.events.length}`);
      let curTick = 0;
      const pcEvents: any[] = [];
      const cc0Events: any[] = [];
      const cc32Events: any[] = [];
      const noteCountPerCh: Record<number, number> = {};

      for (const ev of tr0.events) {
        curTick += ev.delta;
        if (ev.type === 'programChange') {
          pcEvents.push({ tick: curTick, ch: ev.channel, pc: ev.program });
        } else if (ev.type === 'controlChange') {
          if (ev.controller === 0) {
            cc0Events.push({ tick: curTick, ch: ev.channel, val: ev.value });
          } else if (ev.controller === 32) {
            cc32Events.push({ tick: curTick, ch: ev.channel, val: ev.value });
          }
        } else if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          const ch = ev.channel ?? 0;
          noteCountPerCh[ch] = (noteCountPerCh[ch] || 0) + 1;
        }
      }

      console.log('Notes per channel:', noteCountPerCh);
      console.log('CC 0 (Bank MSB) count:', cc0Events.length, JSON.stringify(cc0Events.slice(0, 20)));
      console.log('CC 32 (Bank LSB) count:', cc32Events.length, JSON.stringify(cc32Events.slice(0, 20)));
      console.log('Program Change count:', pcEvents.length, JSON.stringify(pcEvents.slice(0, 20)));
    }
  } catch (err) {
    console.error(`Error parsing ${f}:`, err);
  }
}
