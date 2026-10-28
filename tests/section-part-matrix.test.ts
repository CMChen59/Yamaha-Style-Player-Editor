import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import type { SectionPartMuteMap } from '../src/core/models/style-types';

describe('方案 A: Yamaha 段落聲部開口矩陣 (Section Part On/Off Matrix)', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const buffer = fs.readFileSync(sampleStyPath);
  const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

  it('1. 能正確解析真實 STY 生成完整的 2D 段落聲部開口矩陣 (Matrix Data Structure)', () => {
    const muteState: SectionPartMuteMap = {};
    const matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);

    expect(matrix.length).toBeGreaterThan(0);
    // 驗證包含主要段落 (Main A, Main B, Intro A, Ending B 等)
    const sectionNames = matrix.map(r => r.sectionName);
    expect(sectionNames).toContain('Main A');
    expect(sectionNames).toContain('Main B');
    expect(sectionNames).toContain('Intro A');

    // 檢查 Main A 列
    const mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    expect(mainARow).toBeDefined();
    expect(mainARow.measureCount).toBe(8);
    expect(mainARow.cells.length).toBe(parsed.parts.length);

    // 檢查各單元格的通道與音符統計
    const bassCell = mainARow.cells.find(c => c.channel === 1 || c.partId === 'Bass')!;
    expect(bassCell).toBeDefined();
    expect(bassCell.noteCount).toBe(34);
    expect(bassCell.isMuted).toBe(false);
    expect(bassCell.canToggle).toBe(true);

    // 在 Main A 中未演奏的聲部 (0 音符)
    const padCell = mainARow.cells.find(c => c.channel === 4 || c.partId === 'Pad')!;
    expect(padCell).toBeDefined();
    expect(padCell.noteCount).toBe(0);
    expect(padCell.canToggle).toBe(false);
  });

  it('2. 能精確切換單元格發聲與靜音狀態 (Toggle Mute)', () => {
    const muteState: SectionPartMuteMap = {};

    // 將 Main A 的 Bass (Ch 1) 設為靜音
    const next1 = YamahaStyleModifier.toggleSectionPartMute(muteState, 'Main A', 1);
    expect(next1).toBe(true);
    expect(muteState['Main A'][1]).toBe(true);

    // 重新取得矩陣，確認 isMuted 反映正確
    let matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    let mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    let bassCell = mainARow.cells.find(c => c.channel === 1)!;
    expect(bassCell.isMuted).toBe(true);
    expect(mainARow.mutedCount).toBe(1);

    // 再次點擊切換，恢復發聲
    const next2 = YamahaStyleModifier.toggleSectionPartMute(muteState, 'Main A', 1);
    expect(next2).toBe(false);
    expect(muteState['Main A']?.[1]).toBeUndefined();

    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    bassCell = mainARow.cells.find(c => c.channel === 1)!;
    expect(bassCell.isMuted).toBe(false);
    expect(mainARow.mutedCount).toBe(0);
  });

  it('3. 段落單列快捷控制 (All On / All Off / Rhythm Only / Non-Drum / Rhythm+Bass)', () => {
    const muteState: SectionPartMuteMap = {};

    // A. 批次全關 (All Off)
    YamahaStyleModifier.setSectionAllMute(parsed, muteState, 'Main A', true);
    let matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    let mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    expect(mainARow.mutedCount).toBeGreaterThan(0);
    expect(mainARow.activeCount).toBe(0);

    // B. 批次全開 (All On)
    YamahaStyleModifier.setSectionAllMute(parsed, muteState, 'Main A', false);
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    expect(mainARow.mutedCount).toBe(0);
    expect(mainARow.activeCount).toBeGreaterThan(0);

    // C. 僅節奏 (Rhythm Only)
    YamahaStyleModifier.setSectionRhythmOnly(parsed, muteState, 'Main A');
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    // 檢查非鼓組聲部 (如 Bass Ch 1, Chord 1 Ch 2) 是否已靜音
    const bassCell = mainARow.cells.find(c => c.channel === 1)!;
    expect(bassCell.isMuted).toBe(true);
    // 檢查鼓組聲部 (Ch 9) 是否未靜音
    const drumCell = mainARow.cells.find(c => c.channel === 9)!;
    expect(drumCell.isMuted).toBe(false);

    // D. 無打擊 (Non-Drum Only)
    YamahaStyleModifier.setSectionNonDrumOnly(parsed, muteState, 'Main A');
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    const bassCellAfter = mainARow.cells.find(c => c.channel === 1)!;
    expect(bassCellAfter.isMuted).toBe(false);
    const drumCellAfter = mainARow.cells.find(c => c.channel === 9)!;
    expect(drumCellAfter.isMuted).toBe(true);

    // E. 節奏+貝斯 (Rhythm & Bass Only)
    YamahaStyleModifier.setSectionRhythmAndBassOnly(parsed, muteState, 'Main A');
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    mainARow = matrix.find(r => r.sectionName === 'Main A')!;
    const chord1Cell = mainARow.cells.find(c => c.channel === 2)!;
    expect(chord1Cell.isMuted).toBe(true);
    expect(mainARow.cells.find(c => c.channel === 1)!.isMuted).toBe(false); // Bass
    expect(mainARow.cells.find(c => c.channel === 9)!.isMuted).toBe(false); // Drums
  });

  it('4. 全域配器風格樣板 (Progressive A~D / Rhythm Groove / Acoustic / Reset All)', () => {
    const muteState: SectionPartMuteMap = {};

    // A. 套用經典漸進式配器 (Progressive A~D)
    YamahaStyleModifier.applyProgressiveOrchestrationPreset(parsed, muteState);
    let matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);

    const rowMainA = matrix.find(r => r.sectionName === 'Main A')!;
    const rowMainB = matrix.find(r => r.sectionName === 'Main B')!;
    const rowMainD = matrix.find(r => r.sectionName === 'Main D')!;

    // Main A 僅留節奏與低音，和弦靜音
    expect(rowMainA.cells.find(c => c.channel === 2)!.isMuted).toBe(true); // Chord 1 靜音
    expect(rowMainA.cells.find(c => c.channel === 1)!.isMuted).toBe(false); // Bass 發聲

    // Main B 加入 Chord 1，其餘副和弦/Pad/裝飾句靜音
    expect(rowMainB.cells.find(c => c.channel === 2)!.isMuted).toBe(false); // Chord 1 發聲

    // Main D 全開 (0 聲部靜音)
    expect(rowMainD.mutedCount).toBe(0);

    // B. 全部重設全開 (Reset All)
    YamahaStyleModifier.resetAllSectionMutes(muteState);
    expect(Object.keys(muteState).length).toBe(0);
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    expect(matrix.every(r => r.mutedCount === 0)).toBe(true);

    // C. 原聲不插電樣板 (Acoustic)
    YamahaStyleModifier.applyAcousticPreset(parsed, muteState);
    matrix = YamahaStyleModifier.getSectionPartMatrix(parsed, muteState);
    const mainARowAcoustic = matrix.find(r => r.sectionName === 'Main A')!;
    const drumCellAcoustic = mainARowAcoustic.cells.find(c => c.channel === 9)!;
    expect(drumCellAcoustic.isMuted).toBe(true); // 爵士鼓被靜音
    const bassCellAcoustic = mainARowAcoustic.cells.find(c => c.channel === 1)!;
    expect(bassCellAcoustic.isMuted).toBe(false); // 貝斯保留發聲
  });

  it('5. 試聽伴奏發聲連動：段落靜音之聲部在該段落完全靜音無延遲，且不影響其他段落', () => {
    const muteState: SectionPartMuteMap = {
      'Main A': { 1: true }, // Main A 的 Bass 靜音
    };

    const rangeMainA = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;
    const rangeMainB = StyleRemixer.getSectionTickRange(parsed, 'Main B')!;

    // 模擬試聽走帶提取發聲聲部 (如同 toggleStySectionAudition)
    const getAuditionChannels = (secName: string, range: { startTick: number; endTick: number }) => {
      const activeChannels: number[] = [];
      for (const part of parsed.parts) {
        if (muteState[secName]?.[part.channel]) continue; // 靜音過濾
        const notes = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, part.channel);
        if (notes.length > 0) activeChannels.push(part.channel);
      }
      return activeChannels;
    };

    const activeInMainA = getAuditionChannels('Main A', rangeMainA);
    const activeInMainB = getAuditionChannels('Main B', rangeMainB);

    // 在 Main A 中，Channel 1 (Bass) 被靜音排除
    expect(activeInMainA).not.toContain(1);

    // 在 Main B 中，Channel 1 (Bass) 依然正常發聲，未受隔離污染
    expect(activeInMainB).toContain(1);
  });

  it('6. 匯出巡檢能正確探測段落開口矩陣配置，非破壞性匯出 100% 保持二進位完整性與 CASM', () => {
    const muteState: SectionPartMuteMap = {
      'Main A': { 1: true, 2: true },
      'Intro A': { 4: true },
    };

    // A. 匯出前巡檢
    const inspection = YamahaWriter.inspectPreExport(parsed, muteState);
    expect(inspection.customMuteSectionsCount).toBe(2);
    expect(inspection.customMutePartsCount).toBe(3);

    // B. 執行二進位安全匯出
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.hasCasm).toBe(true);
    expect(exportResult.casmSize).toBe(4025);

    // C. 反向驗證解析結果
    const reParsed = YamahaParser.parse(exportResult.bytes, 'STY');
    expect(reParsed.sections.length).toBe(parsed.sections.length);
    expect(reParsed.tracks.length).toBe(parsed.tracks.length);
    expect(reParsed.customChunks.find(c => c.id.trim() === 'CASM')!.data.length).toBe(4025);
  });

  it('7. (進階功能) 實體寫入靜音音符 (Bake Section Part Mutes) 能安全移除靜音音符且維持合法格式', () => {
    // 複製解析結構
    const clonedParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const range = StyleRemixer.getSectionTickRange(clonedParsed, 'Main A')!;
    const originalBassNotes = StyleRemixer.countNotesInChannel(clonedParsed, range.startTick, range.endTick, 1);
    expect(originalBassNotes).toBe(34);

    const muteState: SectionPartMuteMap = {
      'Main A': { 1: true }, // 靜音 Main A 的 Bass
    };

    // 執行實體寫入
    const deletedCount = YamahaStyleModifier.bakeSectionPartMutes(clonedParsed, muteState);
    expect(deletedCount).toBe(34);

    // 驗證 Main A 的 Bass 音符已被清除為 0
    const afterBassNotes = StyleRemixer.countNotesInChannel(clonedParsed, range.startTick, range.endTick, 1);
    expect(afterBassNotes).toBe(0);

    // 驗證其他段落 (如 Main B) 的 Bass 音符完全未受影響
    const rangeMainB = StyleRemixer.getSectionTickRange(clonedParsed, 'Main B')!;
    const mainBBassNotes = StyleRemixer.countNotesInChannel(clonedParsed, rangeMainB.startTick, rangeMainB.endTick, 1);
    expect(mainBBassNotes).toBeGreaterThan(0);

    // 驗證寫入後的檔案可安全通過二進位匯出與 CASM 驗證
    const bakedExport = YamahaWriter.validateAndWrite(clonedParsed);
    expect(bakedExport.success).toBe(true);
    expect(bakedExport.hasCasm).toBe(true);
  });
});
