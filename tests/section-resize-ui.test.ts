import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('Tier 2-1 Step 2: 段落小節長度調整 (Measure Resize) 與 UI 連動測試', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  it('1. getSectionMeasureCount 能正確讀取段落初始小節數', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const barsMainA = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A');
    expect(barsMainA).toBe(8);

    const barsFillBB = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Fill In BB');
    expect(barsFillBB).toBe(1);
  });

  it('2. 擴展延伸小節長度 (Extend): 1 小節過門延伸為 4 小節，音符自動平滑循環', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const oldRange = StyleRemixer.getSectionTickRange(parsed, 'Fill In BB')!;
    const oldNotes = StyleRemixer.extractSectionChannelNotes(parsed, oldRange.startTick, oldRange.endTick, 9);
    expect(oldNotes.length).toBeGreaterThan(0);

    // 延伸至 4 小節
    const ok = YamahaStyleModifier.resizeSectionMeasures(parsed, 'Fill In BB', 4);
    expect(ok).toBe(true);

    const newBars = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Fill In BB');
    expect(newBars).toBe(4);

    const newRange = StyleRemixer.getSectionTickRange(parsed, 'Fill In BB')!;
    expect(newRange.measureCount).toBe(4);

    // 驗證音符數量因循環擴展而倍增
    const newNotes = StyleRemixer.extractSectionChannelNotes(parsed, newRange.startTick, newRange.endTick, 9);
    expect(newNotes.length).toBeGreaterThanOrEqual(oldNotes.length * 2);

    // 驗證二進位安全匯出
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.hasCasm).toBe(true);
  });

  it('3. 安全裁切小節長度 (Truncate): 8 小節 Main A 裁切為 2 小節，後續段落精準順移', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const mainBBefore = parsed.sections.find(s => s.name === 'Main B')!;
    const oldMainBStart = mainBBefore.startTick;

    // 裁切 Main A：8 小節 ➔ 2 小節 (減少 6 小節)
    const division = parsed.division || 1920;
    const ticksPerBar = division * 4; // 7680
    const deltaExpected = 6 * ticksPerBar;

    const ok = YamahaStyleModifier.resizeSectionMeasures(parsed, 'Main A', 2);
    expect(ok).toBe(true);

    const newBars = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A');
    expect(newBars).toBe(2);

    // 驗證後續 Main B 起始 Tick 精準向前順移
    const mainBAfter = parsed.sections.find(s => s.name === 'Main B')!;
    expect(mainBAfter.startTick).toBe(oldMainBStart - deltaExpected);

    // 驗證二進位安全匯出
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
  });

  it('4. 多次反覆縮放 (Repeat Resize Roundtrip): 8 ➔ 4 ➔ 16 ➔ 8 小節，結構依然堅固合法', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    YamahaStyleModifier.resizeSectionMeasures(parsed, 'Main A', 4);
    expect(YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A')).toBe(4);

    YamahaStyleModifier.resizeSectionMeasures(parsed, 'Main A', 16);
    expect(YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A')).toBe(16);

    YamahaStyleModifier.resizeSectionMeasures(parsed, 'Main A', 8);
    expect(YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A')).toBe(8);

    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.hasCasm).toBe(true);
  });
});
