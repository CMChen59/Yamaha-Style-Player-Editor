import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('4006-2_PAD.PAD 深度剖析', () => {
  it('印出 4006-2 所有軌道、通道與 Marker 資訊', () => {
    const pad2Path = path.resolve(__dirname, '../samples/4006-2_PAD.PAD');
    const buf = fs.readFileSync(pad2Path);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'PAD');

    console.log('--- 4006-2 Section 清單 ---');
    parsed.sections.forEach((s, idx) => {
      console.log(`[${idx}] 名稱: ${s.name}, 起始 Tick: ${s.startTick}, 結束 Tick: ${s.endTick}, 小節數: ${s.measureCount}`);
    });

    console.log('--- 4006-2 Parts 清單 ---');
    parsed.parts.forEach((p) => {
      console.log(`聲部: ${p.partName}, Ch: ${p.channel + 1}, Track: ${p.trackIndex}, PC: ${p.programChange}, Bank: ${p.bankMsb}-${p.bankLsb}`);
    });

    console.log('--- 4006-2 軌道事件清單 ---');
    parsed.tracks.forEach((t, i) => {
      const markers = t.events.filter(e => e.type === 'meta' && (e.metaType === 6 || e.metaType === 7)).map(e => e.text);
      const channels = [...new Set(t.events.filter(e => e.channel !== undefined).map(e => (e.channel ?? 0) + 1))];
      const noteCount = t.events.filter(e => e.type === 'noteOn').length;
      console.log(`Track ${i}: 名稱=${t.name ?? '(無)'}, 包含通道=${channels.join(',')}, Markers=[${markers.join(', ')}], NoteOn數量=${noteCount}`);
    });
  });
});
