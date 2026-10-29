import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('Tier 2-1 Step 1: 伴奏風格跨段落克隆引擎 (Section Clone & Transfer)', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  it('1. 能將 Main A 的全聲部音符與結構完整克隆至 Main B，並覆蓋原有舊內容', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const srcRange = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    expect(srcRange).toBeDefined();

    // 統計 Main A 各通道原本的音符數
    const mainANotesTotal = [8, 9, 10, 11, 12, 13, 14, 15].reduce((sum, ch) => {
      return sum + StyleRemixer.countNotesInChannel(parsed, srcRange.startTick, srcRange.endTick, ch);
    }, 0);
    expect(mainANotesTotal).toBeGreaterThan(0);

    // 執行克隆：Main A ➔ Main B (全聲部覆蓋)
    const result = YamahaStyleModifier.cloneSection(parsed, 'Main A', 'Main B', {
      overwrite: true,
      matchMeasures: true,
      copyMixing: true,
      copyCasm: true,
    });

    expect(result.success).toBe(true);
    expect(result.copiedNotesCount).toBe(mainANotesTotal);
    expect(result.targetMeasureCount).toBe(srcRange.measureCount);

    // 驗證 Main B 的音符總數現在與 Main A 完全一致
    const targetRange = StyleRemixer.getSectionTickRange(parsed, 'Main B')!;
    const mainBNotesTotal = [8, 9, 10, 11, 12, 13, 14, 15].reduce((sum, ch) => {
      return sum + StyleRemixer.countNotesInChannel(parsed, targetRange.startTick, targetRange.endTick, ch);
    }, 0);
    expect(mainBNotesTotal).toBe(mainANotesTotal);

    // 驗證二進位匯出無損且 CASM 轉調結構完整保留
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.hasCasm).toBe(true);
  });

  it('2. 支援聲部挑選克隆 (Selective Channels)：僅複製節奏與貝斯，保留目標段落其他和弦', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const srcRange = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    const targetRangeBefore = StyleRemixer.getSectionTickRange(parsed, 'Main C')!;

    // 統計 Main A 的鼓組 (Ch 9) 與貝斯 (Ch 10)
    const srcRhyCount = StyleRemixer.countNotesInChannel(parsed, srcRange.startTick, srcRange.endTick, 9);
    const srcBassCount = StyleRemixer.countNotesInChannel(parsed, srcRange.startTick, srcRange.endTick, 10);
    expect(srcRhyCount).toBeGreaterThan(0);

    // 統計 Main C 原有的 Chord 1 (Ch 12)
    const oldChord1Count = StyleRemixer.countNotesInChannel(parsed, targetRangeBefore.startTick, targetRangeBefore.endTick, 12);

    // 執行局部克隆：僅複製 Channels [9, 10]
    const result = YamahaStyleModifier.cloneSection(parsed, 'Main A', 'Main C', {
      channels: [9, 10],
      overwrite: true,
      matchMeasures: true,
    });

    expect(result.success).toBe(true);
    expect(result.copiedChannels).toContain(9);

    const targetRangeAfter = StyleRemixer.getSectionTickRange(parsed, 'Main C')!;
    // 驗證 Main C 的鼓組已變成 Main A 的鼓組數量
    const newRhyCount = StyleRemixer.countNotesInChannel(parsed, targetRangeAfter.startTick, targetRangeAfter.endTick, 9);
    expect(newRhyCount).toBe(srcRhyCount);

    // 驗證 Main C 原有的 Chord 1 (Ch 12) 未被清空抹除
    const newChord1Count = StyleRemixer.countNotesInChannel(parsed, targetRangeAfter.startTick, targetRangeAfter.endTick, 12);
    expect(newChord1Count).toBe(oldChord1Count);
  });

  it('3. 支援目標段落不存在時自動建立 (Auto Section Creation)', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 確保原本沒有 'Main E'
    const nonExistent = parsed.sections.find(s => s.name.toLowerCase() === 'main e');
    expect(nonExistent).toBeUndefined();

    // 執行克隆至全新段落 'Main E'
    const result = YamahaStyleModifier.cloneSection(parsed, 'Main A', 'Main E');

    expect(result.success).toBe(true);
    expect(result.copiedNotesCount).toBeGreaterThan(0);

    // 驗證 'Main E' 已成功建立於 parsed.sections
    const createdSec = parsed.sections.find(s => s.name === 'Main E');
    expect(createdSec).toBeDefined();

    // 驗證二進位安全匯出
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
  });

  it('4. 邊界與防呆檢查：來源段落不存在或來源與目標相同時安全返回錯誤訊息', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 相同段落防呆
    const resSame = YamahaStyleModifier.cloneSection(parsed, 'Main A', 'Main A');
    expect(resSame.success).toBe(false);
    expect(resSame.message).toContain('不能相同');

    // 不存在之來源段落防呆
    const resNotFound = YamahaStyleModifier.cloneSection(parsed, 'Ghost Section', 'Main B');
    expect(resNotFound.success).toBe(false);
    expect(resNotFound.message).toContain('不存在');
  });
});
