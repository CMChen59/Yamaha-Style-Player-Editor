import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { StyLoader } from '../src/creator/sty-loader';

describe('LoveSong.T547.sty SFF2 & Tempo 驗證', () => {
  const loveSongPath = path.resolve(__dirname, '../samples/LoveSong.T547.sty');

  it('能正確載入 LoveSong.T547.sty：起始 BPM 保留為 70，且 SFF2 軌道排除 SFF1 重複半音衝撞', () => {
    if (!fs.existsSync(loveSongPath)) return;

    const buf = fs.readFileSync(loveSongPath);
    const result = StyLoader.loadFromBytes(new Uint8Array(buf), 'LoveSong.T547.sty');

    // 1. 速度驗證：雖然 Ending 段落有 ritardando 降到 50 BPM，但樣式起始 BPM 必須精準為 70
    expect(result.bpm).toBe(70);

    // 2. Intro B 段落驗證
    const introB = result.sections.get('Intro B');
    expect(introB).toBeDefined();

    // 3. 音符衝突驗證：Intro B 總音符數應乾淨過濾 SFF1 (Ch 0~7)，僅保留標準 SFF2 (Ch 8~15)
    expect(introB!.bassPattern.size).toBe(8); // SFF2 Ch 10: 8 顆音 (非 SFF1+SFF2 的 15 顆音)

    let chord1Count = 0;
    introB!.chordPattern.forEach(s => chord1Count += s.size);
    expect(chord1Count).toBe(70); // SFF2 Ch 11: 70 顆音 (非 SFF1+SFF2 的 131 顆音)

    let chord2Count = 0;
    introB!.dynamicPatterns?.Chord2?.forEach(s => chord2Count += s.size);
    expect(chord2Count).toBe(40); // SFF2 Ch 12: 40 顆音 (非 SFF1+SFF2 的 77 顆音)

    let padCount = 0;
    introB!.dynamicPatterns?.Pad?.forEach(s => padCount += s.size);
    expect(padCount).toBe(15); // SFF2 Ch 13: 15 顆音 (非 SFF1+SFF2 的 29 顆音)
  });
});
