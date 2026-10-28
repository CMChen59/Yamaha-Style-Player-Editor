/**
 * Yamaha PSR-SX920 專注創作台 (V2) 多段落伴奏風格匯出驗證測試 (Multi-Section STY)
 */

import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { StyleNoteEvent, StyleSectionConfig } from '../src/core/models/style-types';

describe('V2 Creator: 多段落 (Main A, Main B, Fill In) STY 匯出與 PSR-SX920 相容性驗證', () => {
  it('能將 Main A (4小節)、Main B (4小節) 與 Fill In AA (1小節) 打包為合法多段落 SFF2 STY 檔案', () => {
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4; // 1920
    const ticksPerStep = Math.round(ticksPerBar / 16); // 120

    // Main A: 溫和鼓點 + C1 貝斯
    const mainANotes: StyleNoteEvent[] = [
      { partId: 'Rhythm2', channel: 9, note: 36, startTick: 0, durationTick: 96, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 38, startTick: 4 * ticksPerStep, durationTick: 96, velocity: 100 },
      { partId: 'Bass', channel: 10, note: 36, startTick: 0, durationTick: 140, velocity: 100 },
      { partId: 'Bass', channel: 10, note: 43, startTick: 8 * ticksPerStep, durationTick: 140, velocity: 100 },
    ];

    // Main B: 激烈鼓點 + 碎音鈸 Crash (49) + 貝斯
    const mainBNotes: StyleNoteEvent[] = [
      { partId: 'Rhythm2', channel: 9, note: 49, startTick: 0, durationTick: 96, velocity: 100 }, // Crash
      { partId: 'Rhythm2', channel: 9, note: 36, startTick: 0, durationTick: 96, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 38, startTick: 4 * ticksPerStep, durationTick: 96, velocity: 100 },
      { partId: 'Bass', channel: 10, note: 36, startTick: 0, durationTick: 140, velocity: 100 },
    ];

    // Fill In AA: 1 小節過門，小鼓與中鼓滾奏
    const fillNotes: StyleNoteEvent[] = [
      { partId: 'Rhythm2', channel: 9, note: 38, startTick: 0, durationTick: 48, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 38, startTick: 2 * ticksPerStep, durationTick: 48, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 50, startTick: 4 * ticksPerStep, durationTick: 48, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 47, startTick: 8 * ticksPerStep, durationTick: 48, velocity: 100 },
    ];

    const sections: StyleSectionConfig[] = [
      { name: 'Main A', bars: 4, notes: mainANotes },
      { name: 'Main B', bars: 4, notes: mainBNotes },
      { name: 'Fill In AA', bars: 1, notes: fillNotes },
    ];

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TEST_MULTI_SECTION',
      bpm: 125,
      timeSignature: { numerator: 4, denominator: 4 },
      division,
      sections,
      parts: {
        Rhythm2: { msb: 127, lsb: 0, pc: 0 },
        Bass: { msb: 0, lsb: 112, pc: 33 },
      },
      injectCasm: true,
    });

    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(binaryBytes.length).toBeGreaterThan(1500);

    // 二進位解析回驗
    const reParsed = YamahaParser.parse(binaryBytes);
    expect(reParsed.format).toBe('STY');
    expect(reParsed.hasCasm).toBe(true);

    // 驗證解析出來的段落名稱完整包含 Main A, Main B, Fill In AA
    const sectionNames = reParsed.sections.map(s => s.name);
    expect(sectionNames).toContain('Main A');
    expect(sectionNames).toContain('Main B');
    expect(sectionNames).toContain('Fill In AA');

    // 驗證 CASM 中包含所有三個段落的 Sdec 宣告
    const casmChunk = reParsed.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    const casmText = new TextDecoder('latin1').decode(casmChunk!.data);
    expect(casmText).toContain('Main A');
    expect(casmText).toContain('Main B');
    expect(casmText).toContain('Fill In AA');
    expect(casmText).toContain('Drum4cc');
    expect(casmText).toContain('BassMain');
  });
});
