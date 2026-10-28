import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

describe('步驟 3.5: STY / PAD 匯出二進位完整性與防呆驗證 (Export & Binary Integrity)', () => {
  const samplesDir = path.resolve(__dirname, '../samples');

  it('1. 真實 STY 伴奏檔經編輯 (混音/音符/小節) 後，能安全通過二進位反向驗證並完整保留 CASM', () => {
    const filePath = path.join(samplesDir, '4006_SX900.T547.sty');
    const originalBuffer = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(originalBuffer, 'STY');

    // A. 模擬混音調整
    YamahaStyleModifier.setPartMixing(parsed, 9, { volume: 110, pan: 50, reverb: 65, chorus: 20 });

    // B. 在 Main A 的鼓組 (Ch 10, channel index 9) 新增一顆音符
    const addSuccess = YamahaStyleModifier.addSectionNote(parsed, 'Main A', 9, {
      note: 36, // 大鼓 (Bass Drum)
      startTick: 0,
      durationTick: 48,
      velocity: 115,
    });
    expect(addSuccess).toBe(true);

    // C. 擴展 Main A 小節長度 (由原長度 +1 小節)
    const oldBars = YamahaStyleModifier.getSectionMeasureCount(parsed, 'Main A');
    YamahaStyleModifier.resizeSectionMeasures(parsed, 'Main A', oldBars + 1);

    // D. 執行匯出前巡檢
    const inspection = YamahaWriter.inspectPreExport(parsed);
    expect(inspection.format).toBe('STY');
    expect(inspection.hasCasm).toBe(true);
    expect(inspection.casmSize).toBe(4025);
    expect(inspection.totalNotes).toBeGreaterThan(0);
    expect(inspection.sectionNames).toContain('Main A');

    // E. 執行二進位安全匯出與反向驗證
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.fileSize).toBeGreaterThan(0);
    expect(exportResult.hasCasm).toBe(true);
    expect(exportResult.casmSize).toBe(4025);

    // F. 深度檢查反向解析結果
    const reParsed = YamahaParser.parse(exportResult.bytes, 'STY');
    expect(reParsed.tracks.length).toBe(parsed.tracks.length);
    expect(reParsed.division).toBe(parsed.division);
    expect(reParsed.hasCasm).toBe(true);

    // 驗證 CASM 區塊與原始檔案 byte-level 相同
    const origCasm = parsed.customChunks.find(c => c.id.trim() === 'CASM')!;
    const reCasm = reParsed.customChunks.find(c => c.id.trim() === 'CASM')!;
    expect(reCasm.data.length).toBe(origCasm.data.length);
    for (let i = 0; i < origCasm.data.length; i++) {
      expect(reCasm.data[i]).toBe(origCasm.data[i]);
    }

    // 驗證 Main A 小節數正確擴展
    expect(YamahaStyleModifier.getSectionMeasureCount(reParsed, 'Main A')).toBe(oldBars + 1);
  });

  it('2. 真實 Multi Pad 檔經音符新增與量化後，匯出能 100% 保留所有控制標記 (RP0000, CM0000, Names, Icons)', () => {
    const filePath = path.join(samplesDir, '4006-2_PAD.PAD');
    const originalBuffer = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(originalBuffer, 'PAD');

    // A. 在 Pad 1 新增音符
    const addSuccess = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 60, // C4
      startTick: 96,
      durationTick: 96,
      velocity: 100,
    });
    expect(addSuccess).toBe(true);

    // B. 執行匯出前巡檢
    const inspection = YamahaWriter.inspectPreExport(parsed);
    expect(inspection.format).toBe('PAD');
    expect(inspection.trackCount).toBe(5); // Track 0 + Pad 1..4
    expect(inspection.totalNotes).toBeGreaterThan(0);

    // C. 執行二進位安全匯出
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);

    // D. 反向解析並驗證 Multi Pad 原廠配置
    const reParsed = YamahaParser.parse(exportResult.bytes, 'PAD');
    expect(reParsed.padConfig).toBeDefined();
    expect(reParsed.padConfig?.names).toEqual(['Pad1', 'Pad2', 'Pad3', 'Pad4']);
    expect(reParsed.padConfig?.icons).toEqual(['S809', 'S809', 'S809', 'S809']);
    expect(reParsed.padConfig?.repeatFlags).toEqual([false, false, false, false]);
    expect(reParsed.padConfig?.chordMatchFlags).toEqual([false, false, false, false]);

    // 驗證 Pad 1 的音符已成功寫入二進位並可被重新解析讀出
    const pad1Notes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[1]);
    const addedNote = pad1Notes.find(n => n.note === 60 && n.startTick === 96);
    expect(addedNote).toBeDefined();
  });

  it('3. 匯出巡檢能敏銳探測空段落 (Empty Section) 並發出防呆警示', () => {
    const filePath = path.join(samplesDir, '4006_SX900.T547.sty');
    const originalBuffer = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(originalBuffer, 'STY');

    // 清空 Ending B 的所有音符
    YamahaStyleModifier.clearSectionNotes(parsed, 'Ending B', -1);

    const inspection = YamahaWriter.inspectPreExport(parsed);
    expect(inspection.emptySections).toContain('Ending B');
    expect(inspection.warnings.some(w => w.includes('Ending B') && w.includes('0'))).toBe(true);

    // 即使有警告，validateAndWrite 仍能產生合法二進位檔
    const res = YamahaWriter.validateAndWrite(parsed);
    expect(res.success).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('4. 若音軌遺失 EndOfTrack (0xFF 0x2F)，prepareTracks 能自動修復補齊二進位標記', () => {
    const filePath = path.join(samplesDir, '4006-1_PAD.PAD');
    const originalBuffer = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(originalBuffer, 'PAD');

    // 刻意移除 Track 1 的 EndOfTrack 事件
    const track1 = parsed.tracks[1];
    track1.events = track1.events.filter(ev => !(ev.type === 'meta' && ev.metaType === 0x2f));
    track1.rawChunk = new Uint8Array(0); // 清空 rawChunk

    // 執行準備與重構
    YamahaWriter.prepareTracks(parsed);

    const lastEv = track1.events[track1.events.length - 1];
    expect(lastEv.type).toBe('meta');
    expect(lastEv.metaType).toBe(0x2f);
    expect(track1.rawChunk.length).toBeGreaterThan(0);

    // 執行反向驗證
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
  });
});
