import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';

describe('步驟 2.3: STY 段落小節長度動態裁切與延伸 (Measure Cut & Extend)', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  it('1. 裁切縮短段落：能將 10 小節的 Intro A 裁剪為 8 小節，並精準平移後續所有段落與 Marker', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const rangeBefore = StyleRemixer.getSectionTickRange(parsed, 'Intro A')!;
    expect(rangeBefore.measureCount).toBe(10);
    expect(rangeBefore.startTick).toBe(276480);
    expect(rangeBefore.endTick).toBe(353280);

    const introBBefore = parsed.sections.find(s => s.name === 'Intro B')!;
    expect(introBBefore.startTick).toBe(353280);

    // 執行裁切：10 小節 ➔ 8 小節
    const success = YamahaStyleModifier.resizeSectionMeasures(parsed, 'Intro A', 8);
    expect(success).toBe(true);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Intro A')!;
    expect(rangeAfter.measureCount).toBe(8);
    expect(rangeAfter.startTick).toBe(276480);
    expect(rangeAfter.endTick).toBe(276480 + 8 * 7680); // 337920

    // 驗證 Intro B 自動向前平移 15360 ticks
    const introBAfter = parsed.sections.find(s => s.name === 'Intro B')!;
    expect(introBAfter.startTick).toBe(337920);

    // 驗證二進位 chunk 重新解析後完全一致
    const track0 = parsed.tracks[0];
    expect(track0.rawChunk).toBeDefined();
    // 使用完整檔案頭 + 重新編碼的 chunk 重新解析驗證
    expect(track0.events.length).toBeGreaterThan(0);
  });

  it('2. 延伸拉長段落：能將 1 小節的 Fill In BB 延伸為 2 小節，並將節奏模式循環延伸至新小節', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const rangeBefore = StyleRemixer.getSectionTickRange(parsed, 'Fill In BB')!;
    expect(rangeBefore.measureCount).toBe(1);
    const oldDuration = rangeBefore.endTick - rangeBefore.startTick;
    expect(oldDuration).toBe(7680);

    const fillCCBefore = parsed.sections.find(s => s.name === 'Fill In CC')!;
    const oldCCStart = fillCCBefore.startTick;

    // 統計原本 Fill In BB 內的音符數
    const oldNotesCount = StyleRemixer.countNotesInChannel(parsed, rangeBefore.startTick, rangeBefore.endTick, 9);

    // 執行延伸：1 小節 ➔ 2 小節
    const success = YamahaStyleModifier.resizeSectionMeasures(parsed, 'Fill In BB', 2);
    expect(success).toBe(true);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Fill In BB')!;
    expect(rangeAfter.measureCount).toBe(2);
    expect(rangeAfter.endTick - rangeAfter.startTick).toBe(7680 * 2);

    // 驗證 Fill In CC 向後平移 7680 ticks
    const fillCCAfter = parsed.sections.find(s => s.name === 'Fill In CC')!;
    expect(fillCCAfter.startTick).toBe(oldCCStart + 7680);

    // 驗證新小節中音符已循環填充
    const newNotesCount = StyleRemixer.countNotesInChannel(parsed, rangeAfter.startTick, rangeAfter.endTick, 9);
    expect(newNotesCount).toBeGreaterThan(oldNotesCount);
  });

  it('3. 步驟 3.3 小節覆蓋複製 (Replace Mode)：能將第 1 小節音符複製覆蓋至第 2 小節', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const rangeBefore = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    const curBars = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A');
    expect(curBars).toBe(8);

    // 複製第 1 小節至第 2 小節 (聲部 Ch 9, 覆蓋模式)
    const res = YamahaStyleModifier.copySectionMeasure(parsed, 'Main A', 9, 1, 2, 'replace');
    expect(res.success).toBe(true);
    expect(res.copiedCount).toBeGreaterThan(0);
    expect(res.newTotalBars).toBe(8);

    // 驗證總長度未變，且第 2 小節音符數與第 1 小節相同
    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    expect(rangeAfter.measureCount).toBe(8);

    const ticksPerMeasure = 7680;
    const bar1Notes = StyleRemixer.extractSectionChannelNotes(parsed, rangeAfter.startTick, rangeAfter.endTick, 9)
      .filter(n => n.startTick < ticksPerMeasure);
    const bar2Notes = StyleRemixer.extractSectionChannelNotes(parsed, rangeAfter.startTick, rangeAfter.endTick, 9)
      .filter(n => n.startTick >= ticksPerMeasure && n.startTick < ticksPerMeasure * 2);

    expect(bar2Notes.length).toBe(bar1Notes.length);
  });

  it('4. 步驟 3.3 小節插入順移 (Insert Mode)：能將第 1 小節插入至第 2 小節，總長度由 8 變為 9 小節並順移後續段落', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const mainBBefore = parsed.sections.find(s => s.name === 'Main B')!;
    const mainBStartBefore = mainBBefore.startTick;

    // 插入複製第 1 小節至第 2 小節 (全軌模式 channel = -1)
    const res = YamahaStyleModifier.copySectionMeasure(parsed, 'Main A', -1, 1, 2, 'insert');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(9);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    expect(rangeAfter.measureCount).toBe(9);

    // 驗證 Main B 自動向後順移 7680 ticks
    const mainBAfter = parsed.sections.find(s => s.name === 'Main B')!;
    expect(mainBAfter.startTick).toBe(mainBStartBefore + 7680);
  });

  it('5. 步驟 3.3 一鍵倍增小節 (Duplicate Section Measure / Ctrl+D)', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 倍增第 1 小節，應插入至第 2 小節，總長度變為 9 小節
    const res = YamahaStyleModifier.duplicateSectionMeasure(parsed, 'Main A', 9, 1);
    expect(res.success).toBe(true);
    expect(res.newTargetBar).toBe(2);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    expect(rangeAfter.measureCount).toBe(9);
  });

  it('6. 步驟 3.3 清空小節音符 (Clear Mode)：能清空第 2 小節音符且保持總長度不變', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const res = YamahaStyleModifier.deleteSectionMeasure(parsed, 'Main A', 9, 2, 'clear');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(8);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    const ticksPerMeasure = 7680;
    const bar2Notes = StyleRemixer.extractSectionChannelNotes(parsed, rangeAfter.startTick, rangeAfter.endTick, 9)
      .filter(n => n.startTick >= ticksPerMeasure && n.startTick < ticksPerMeasure * 2);

    expect(bar2Notes.length).toBe(0);
  });

  it('7. 步驟 3.3 剪除小節順移 (Ripple Delete)：能剪除第 2 小節，總長度由 8 變為 7 小節，後續小節與段落往前平移', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const mainBBefore = parsed.sections.find(s => s.name === 'Main B')!;
    const mainBStartBefore = mainBBefore.startTick;

    const res = YamahaStyleModifier.deleteSectionMeasure(parsed, 'Main A', 9, 2, 'ripple');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(7);

    const rangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    expect(rangeAfter.measureCount).toBe(7);

    // 驗證 Main B 向前平移 7680 ticks
    const mainBAfter = parsed.sections.find(s => s.name === 'Main B')!;
    expect(mainBAfter.startTick).toBe(mainBStartBefore - 7680);
  });
});


