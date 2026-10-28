import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';

describe('單軌聚焦編輯器與 STY 伴奏檔匯出驗證 (Single Track Editor STY Export)', () => {
  const samplesDir = path.resolve(__dirname, '../samples');

  it('1. 能將單軌編輯器修改後的音符完整回寫至 STY 結構，並通過二進位驗證成功匯出', () => {
    const filePath = path.join(samplesDir, '4006_SX900.T547.sty');
    const originalBuffer = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(originalBuffer, 'STY');

    // 模擬在 Main A 軌道 9 (Rhythm 2 鼓組) 編輯音符
    const editedDrumNotes = [
      { noteNumber: 36, relTick: 0, durationTicks: 120, velocity: 110, sourceChannel: 9 },
      { noteNumber: 38, relTick: 480, durationTicks: 120, velocity: 100, sourceChannel: 9 },
      { noteNumber: 36, relTick: 960, durationTicks: 120, velocity: 115, sourceChannel: 9 },
      { noteNumber: 38, relTick: 1440, durationTicks: 120, velocity: 105, sourceChannel: 9 },
    ];

    const success = YamahaStyleModifier.replaceSectionChannelNotes(
      parsed,
      'Main A',
      9,
      editedDrumNotes
    );
    expect(success).toBe(true);

    // 匯出前巡檢
    const inspection = YamahaWriter.inspectPreExport(parsed);
    expect(inspection.format).toBe('STY');
    expect(inspection.hasCasm).toBe(true);

    // 二進位安全匯出與反向驗證
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.bytes.length).toBeGreaterThan(0);
    expect(exportResult.hasCasm).toBe(true);

    // 反向解析驗證
    const reParsed = YamahaParser.parse(exportResult.bytes, 'STY');
    expect(reParsed.tracks.length).toBe(parsed.tracks.length);
    expect(reParsed.division).toBe(parsed.division);
    expect(reParsed.hasCasm).toBe(true);

    // 驗證 CASM 區塊完整未損
    const origCasm = parsed.customChunks.find(c => c.id.trim() === 'CASM')!;
    const reCasm = reParsed.customChunks.find(c => c.id.trim() === 'CASM')!;
    expect(reCasm.data.length).toBe(origCasm.data.length);
  });
});
