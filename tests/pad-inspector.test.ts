import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('PAD 內部細節探測', () => {
  it('印出 PAD 檔案內的詳細音軌與 Marker 關係', () => {
    const pad1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const buf = fs.readFileSync(pad1Path);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'PAD');

    console.log('Division (PPQ):', parsed.division, 'TimeSignature:', parsed.timeSignature);
    console.log('--- 段落 Marker 詳細清單 ---');
    parsed.sections.forEach((s) => {
      console.log(`段落: ${s.name}, 起始 Tick: ${s.startTick}, 結束 Tick: ${s.endTick}, 小節數: ${s.measureCount}`);
    });

    console.log('--- 軌道與音符統計 ---');
    parsed.tracks.forEach((t, i) => {
      let curTick = 0;
      const noteTicks: number[] = [];
      const channels = new Set<number>();
      for (const e of t.events) {
        curTick += e.delta;
        if (e.channel !== undefined) channels.add(e.channel);
        if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
          noteTicks.push(curTick);
        }
      }
      const minTick = noteTicks.length > 0 ? Math.min(...noteTicks) : 0;
      const maxTick = noteTicks.length > 0 ? Math.max(...noteTicks) : 0;
      if (i === 1) {
        console.log('--- Track 1 音符詳細事件 ---');
        let tick = 0;
        const active = new Map<number, number>();
        t.events.forEach((e) => {
          tick += e.delta;
          if (e.type === 'noteOn' && e.velocity && e.velocity > 0 && e.noteNumber !== undefined) {
            active.set(e.noteNumber, tick);
          } else if ((e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) && e.noteNumber !== undefined) {
            const st = active.get(e.noteNumber);
            if (st !== undefined) {
              const dur = tick - st;
              console.log(`Note ${e.noteNumber}: StartTick=${st}, Dur=${dur}, RelTo4608=${st - 4608}, Bar=${Math.floor((st - 4608) / 384) + 1}, Beat=${((st - 4608) % 384) / 96 + 1}`);
              active.delete(e.noteNumber);
            }
          }
        });
      }
      console.log(`Track ${i}: 名稱=${t.name ?? '(無)'}, Channel=[${Array.from(channels).join(',')}], NoteOn數量=${noteTicks.length}, Tick範圍=[${minTick} ~ ${maxTick}]`);
    });
  });
});
