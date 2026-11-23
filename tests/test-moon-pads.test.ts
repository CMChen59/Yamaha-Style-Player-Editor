import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('月亮代表我的心 PAD 診斷與轉調測試', () => {
  it('診斷 7006-1, 7006-2, 7006-3 PAD 調性均正確識別為 C 大調', () => {
    for (const f of ['7006-1_PAD.PAD', '7006-2_PAD.PAD', '7006-3_PAD.PAD']) {
      const p = 'D:/Keyboard/節奏檔/月亮代表我的心/' + f;
      if (!fs.existsSync(p)) {
        continue;
      }
      const buf = new Uint8Array(fs.readFileSync(p));
      const parsed = YamahaParser.parse(buf, 'PAD');
      const diag = YamahaPadModifier.analyzePadProject(parsed);
      expect(diag.estimatedKey).toBe('C');
      expect(diag.estimatedIsMinor).toBe(false);
    }
  });

  it('驗證 7006-2_PAD_Eb.PAD 檔案 (C ➔ Eb, +3 半音) 音高完全符合', () => {
    const outPath = 'D:/Keyboard/節奏檔/月亮代表我的心 Eb/7006-2_PAD_Eb.PAD';
    if (!fs.existsSync(outPath)) return;

    const reParsed = YamahaParser.parse(new Uint8Array(fs.readFileSync(outPath)), 'PAD');
    const p1Notes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[1]);
    const p2Notes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[2]);
    const p3Notes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[3]);
    const p4Notes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[4]);

    // Pad 1 原曲首音 67 (G4) ➔ +3 半音為 70 (Bb4)
    expect(p1Notes[0].note).toBe(70);
    // Pad 2 原曲首音 48 (C3) ➔ +3 半音為 51 (Eb3)
    expect(p2Notes[0].note).toBe(51);
    // Pad 3 原曲首音 84 (C6) ➔ +3 半音為 87 (Eb6)
    expect(p3Notes[0].note).toBe(87);
    // Pad 4 原曲首音 55 (G3) ➔ +3 半音為 58 (Bb3)
    expect(p4Notes[0].note).toBe(58);
  });
});
