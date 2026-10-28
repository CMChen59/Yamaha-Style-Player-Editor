import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { midiManager } from '../src/core/audio/midi-manager';

describe('Phase 2.8-C: Chorus (合唱效果 CC93) & 混音深度擴充測試', () => {
  const samplePath = path.resolve(__dirname, '../samples/4006-2_PAD.PAD');

  it('能成功透過 setPadMixing 寫入與更新 Chorus CC 93，並在二進位重構與重新解析後完整保留', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 1. 設定 Pad 1 的合唱效果值為 72，Pad 2 為 36
    YamahaPadModifier.setPadMixing(parsed, 1, {
      chorus: 72,
    });
    YamahaPadModifier.setPadMixing(parsed, 2, {
      chorus: 36,
    });

    // 2. 驗證 Track 1 與 Track 2 的事件中已有 CC 93
    const trk1CC93 = parsed.tracks[1].events.find(
      (e) => e.type === 'controlChange' && e.controller === 93
    );
    expect(trk1CC93).toBeDefined();
    expect(trk1CC93?.value).toBe(72);

    const trk2CC93 = parsed.tracks[2].events.find(
      (e) => e.type === 'controlChange' && e.controller === 93
    );
    expect(trk2CC93).toBeDefined();
    expect(trk2CC93?.value).toBe(36);

    // 3. 再次更新 Pad 1 的合唱值為 90 (驗證更新覆寫機制)
    YamahaPadModifier.setPadMixing(parsed, 1, {
      chorus: 90,
    });
    const trk1CC93Updated = parsed.tracks[1].events.filter(
      (e) => e.type === 'controlChange' && e.controller === 93
    );
    expect(trk1CC93Updated.length).toBe(1);
    expect(trk1CC93Updated[0].value).toBe(90);

    // 4. 重構二進位檔案並重新送回 Parser
    const writtenBytes = YamahaWriter.write(parsed);
    expect(writtenBytes.length).toBeGreaterThan(0);

    const reParsed = YamahaParser.parse(writtenBytes, 'PAD');
    const reTrk1CC93 = reParsed.tracks[1].events.find(
      (e) => e.type === 'controlChange' && e.controller === 93
    );
    expect(reTrk1CC93).toBeDefined();
    expect(reTrk1CC93?.value).toBe(90);

    const reTrk2CC93 = reParsed.tracks[2].events.find(
      (e) => e.type === 'controlChange' && e.controller === 93
    );
    expect(reTrk2CC93).toBeDefined();
    expect(reTrk2CC93?.value).toBe(36);
  });

  it('midiManager.sendMixerControllers 能正確發送 CC 93 (Chorus Send Level) 訊息', () => {
    const mockOutput = {
      id: 'mock-port',
      name: 'Mock Port',
      state: 'connected',
      send: (data: number[] | Uint8Array) => {
        captured.push(Array.from(data));
      },
    };
    const captured: number[][] = [];
    (midiManager as any).selectedOutput = mockOutput;

    // 傳送 Channel 3 (ch=2) 的 CC 93 = 85
    const ok = midiManager.sendMixerControllers(2, { chorus: 85 });
    expect(ok).toBe(true);
    expect(captured.length).toBe(1);
    expect(captured[0]).toEqual([0xB2, 93, 85]);

    // 傳送超出 0~127 範圍應進行數值保護 (clamp)
    captured.length = 0;
    midiManager.sendMixerControllers(0, { chorus: 150 });
    expect(captured[0]).toEqual([0xB0, 93, 127]);

    captured.length = 0;
    midiManager.sendMixerControllers(0, { chorus: -10 });
    expect(captured[0]).toEqual([0xB0, 93, 0]);
  });
});
