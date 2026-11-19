import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Yamaha Multi Pad 和弦轉調與修復驗證 (Pad Chord Fix)', () => {
  const origPath = path.resolve(__dirname, '../samples/2010-1_PAD.PAD');
  const cm7NormPath = path.resolve(__dirname, '../samples/2010-1_PAD_CM7_Normalized.PAD');

  it('原始檔案具備 5 軌，Pad 2 為《空港》A 小調旋律且未設定 CM 標記', () => {
    const raw = new Uint8Array(fs.readFileSync(origPath));
    const parsed = YamahaParser.parse(raw, 'PAD');
    expect(parsed.tracks.length).toBe(5);
    expect(parsed.hasCasm).toBe(false);

    // Pad 2 第一顆音符為 E5 (76)
    const trk2Notes = parsed.tracks[2].events.filter((e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(trk2Notes[0].noteNumber).toBe(76);
  });

  it('全 4 軌 CM7 完美正規化版 (2010-1_PAD_CM7_Normalized.PAD) 全調內自然音，尾奏迴旋花音精準無 Bb4', () => {
    const raw = new Uint8Array(fs.readFileSync(cm7NormPath));
    const parsed = YamahaParser.parse(raw, 'PAD');

    expect(parsed.tracks.length).toBe(5);
    // 全部 4 軌皆開啟 Chord Match
    expect(parsed.padConfig?.chordMatchFlags.every((f) => f === true)).toBe(true);

    // Pad 2 第一顆音符應為 G5 (79)
    const trk2Notes = parsed.tracks[2].events.filter((e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(trk2Notes[0].noteNumber).toBe(79);

    // Pad 2 尾奏迴旋花音最後 5 顆音符應為 B5, B5, A5, B5, C6 (琴端顯示 B4, B4, A4, B4, C5，絕無 Bb4)
    const last5 = trk2Notes.slice(-5).map((n) => n.noteNumber);
    expect(last5).toEqual([83, 83, 81, 83, 84]);

    // 驗證全檔 4 軌所有音符皆為純淨 C 大調調內音 (零升降變化音)
    for (let trk = 1; trk <= 4; trk++) {
      for (const e of parsed.tracks[trk].events) {
        if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
          const pc = e.noteNumber! % 12;
          expect([0, 2, 4, 5, 7, 9, 11].includes(pc)).toBe(true);
        }
      }
    }
  });
});
