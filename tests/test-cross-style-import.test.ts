import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';

describe('【階段二】跨檔案 STY 段落移植核心引擎 (Cross-Style Section Remix Engine) 測試', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  // 輔助函式：建立一個乾淨的 SFF2 1920 PPQ 目標風格
  function createBlankTargetStyle(): any {
    return YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TargetBlankStyle',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 1920,
      sections: [
        { name: 'Main A', bars: 4 },
        { name: 'Fill In AA', bars: 1 },
        { name: 'Main B', bars: 4 },
        { name: 'Ending A', bars: 2 },
      ],
    });
  }

  it('1. 基礎跨檔案段落移植：能將外部 STY 的 Main A 完整移植至目標風格', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const targetParsed = createBlankTargetStyle();

    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Main A'
    );

    expect(result.success).toBe(true);
    expect(result.sourceSection).toBe('Main A');
    expect(result.targetSection).toBe('Main A');
    expect(result.copiedNotesCount).toBeGreaterThan(0);
    expect(result.copiedChannels.length).toBeGreaterThan(0);

    // 驗證目標風格 Main A 範圍內音符數 > 0
    const targetRange = StyleRemixer.getSectionTickRange(targetParsed, 'Main A');
    expect(targetRange).not.toBeNull();
    const drumNotes = StyleRemixer.countNotesInChannel(targetParsed, targetRange!.startTick, targetRange!.endTick, 9);
    expect(drumNotes).toBeGreaterThan(0);
  });

  it('2. PPQ 解析度等比例時間縮放：480 PPQ 來源能精確縮放至 1920 PPQ 目標', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    // 確認來源為 480 或自定義
    const sourcePpq = sourceParsed.division || 480;
    const targetParsed = createBlankTargetStyle(); // division = 1920
    const expectedRatio = 1920 / sourcePpq;

    // 取得來源 Main A 第一顆鼓組音符的原始相對 Tick
    const srcRange = StyleRemixer.getSectionTickRange(sourceParsed, 'Main A')!;
    const srcDrumNotes = StyleRemixer.extractSectionChannelNotes(sourceParsed, srcRange.startTick, srcRange.endTick, 9);
    expect(srcDrumNotes.length).toBeGreaterThan(0);
    const firstSrcNote = srcDrumNotes[0];

    // 執行移植
    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Main A'
    );

    expect(result.success).toBe(true);
    expect(result.ppqScaled).toBe(sourcePpq !== 1920);
    expect(result.sourcePpq).toBe(sourcePpq);
    expect(result.targetPpq).toBe(1920);

    // 檢查目標中第一顆音符的相對 Tick 是否符合等比例縮放
    const targetRange = StyleRemixer.getSectionTickRange(targetParsed, 'Main A')!;
    const targetDrumNotes = StyleRemixer.extractSectionChannelNotes(targetParsed, targetRange.startTick, targetRange.endTick, 9);
    expect(targetDrumNotes.length).toBeGreaterThan(0);

    const firstTargetNote = targetDrumNotes[0];
    const expectedTick = Math.round(firstSrcNote.startTick * expectedRatio);
    expect(firstTargetNote.startTick).toBe(expectedTick);
  });

  it('3. 聲部通道歸一化：所有外部音符均強制寫入標準 Arranger 通道 (CH 9~16 / 8~15)', () => {
    // 建立一個類比舊型 SFF1 格式的來源物件 (音符在 Channel 1 即 Bass)
    const mockSff1Source: any = {
      division: 480,
      timeSignature: { numerator: 4, denominator: 4 },
      sections: [{ name: 'Main A', startTick: 0, endTick: 1920 * 4, measureCount: 4 }],
      casmMappings: {
        'main a': { '1': 10 }, // 來源 Channel 1 映射到 Arranger Bass (Channel 10)
      },
      tracks: [
        {
          events: [
            // Track 0 標記
            { delta: 0, type: 'meta', metaType: 6, text: 'Main A' },
            // Channel 1 的 Bass 音符
            { delta: 0, type: 'noteOn', channel: 1, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 36, velocity: 0 },
            { delta: 480, type: 'noteOn', channel: 1, noteNumber: 43, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 43, velocity: 0 },
            { delta: 480, type: 'meta', metaType: 47 },
          ],
        },
      ],
      customChunks: [],
      parts: [],
    };

    const targetParsed = createBlankTargetStyle();

    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      mockSff1Source,
      'Main A',
      { channels: [10] } // 僅移植 Bass (Channel 10)
    );

    expect(result.success).toBe(true);
    expect(result.copiedChannels).toContain(10);

    // 驗證在目標風格中，音符已被正確歸一化寫入 Channel 10，而絕非 Channel 1！
    const targetRange = StyleRemixer.getSectionTickRange(targetParsed, 'Main A')!;
    const bassNotesCh10 = StyleRemixer.countNotesInChannel(targetParsed, targetRange.startTick, targetRange.endTick, 10);
    const bassNotesCh1 = StyleRemixer.countNotesInChannel(targetParsed, targetRange.startTick, targetRange.endTick, 1);

    expect(bassNotesCh10).toBe(2);
    expect(bassNotesCh1).toBe(0); // 來源 Channel 1 在目標中不存在
  });

  it('4. 目標段落自適應新增：若目標 STY 不存在該段落，自動為目標風格建立新段落', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const targetParsed = createBlankTargetStyle();

    // 目標一開始只有 Main A, Fill In AA, Main B, Ending A，並無 Intro A
    expect(targetParsed.sections.some((s: any) => s.name === 'Intro A')).toBe(false);

    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Intro A',
      { targetSection: 'Intro A' }
    );

    expect(result.success).toBe(true);
    expect(result.targetSection).toBe('Intro A');

    // 驗證目標風格中已成功自動建立 Intro A
    const introRange = StyleRemixer.getSectionTickRange(targetParsed, 'Intro A');
    expect(introRange).not.toBeNull();
    expect(introRange?.measureCount).toBeGreaterThan(0);
    expect(result.copiedNotesCount).toBeGreaterThan(0);
  });

  it('5. 支援音色策略切換：copyVoices = false 僅移植音符樂句，保留目標混音參數', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const targetParsed = createBlankTargetStyle();

    // 先在目標 Main A 的 Channel 10 (Bass) 設定專屬自訂音色 (例如 PC: 33, Volume: 77)
    YamahaStyleModifier.setPartMixing(targetParsed, 10, {
      programChange: 33,
      volume: 77,
      pan: 50,
    }, { targetSection: 'Main A' });

    // 移植時指定 copyVoices: false (notesOnly)
    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Main A',
      { channels: [10], copyVoices: false }
    );

    expect(result.success).toBe(true);

    // 驗證目標 Main A 的 Channel 10 混音參數依然保留為 33 與 77，未被來源覆蓋
    const targetRange = StyleRemixer.getSectionTickRange(targetParsed, 'Main A')!;
    const override = StyleRemixer.getSectionChannelOverride(targetParsed, targetRange.startTick, targetRange.endTick, 10);
    expect(override.pc).toBe(33);
    expect(override.volume).toBe(77);
  });

  it('6. CASM Ctb2 和弦轉調規則移植與同步', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const targetParsed = createBlankTargetStyle();

    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Main A',
      { copyCasm: true }
    );

    expect(result.success).toBe(true);

    // 驗證 targetParsed.casmMappings 中已註冊 Main A
    expect(targetParsed.casmMappings).toBeDefined();
    expect(targetParsed.casmMappings['main a']).toBeDefined();
    expect(targetParsed.casmMappings['main a'][9]).toBe(9);
    expect(targetParsed.casmMappings['main a'][10]).toBe(10);
  });

  it('7. 完整二進位序列化往返 (Round-Trip) 驗證', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const sourceParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const targetParsed = createBlankTargetStyle();

    // 移植來源 Main B 至目標 Main B
    const result = YamahaStyleModifier.importSectionFromExternalStyle(
      targetParsed,
      sourceParsed,
      'Main B'
    );
    expect(result.success).toBe(true);

    // 寫出為真實二進位 STY
    const writtenBytes = YamahaWriter.write(targetParsed, 'STY');
    expect(writtenBytes.length).toBeGreaterThan(100);

    // 重新解析二進位檔
    const reparsed = YamahaParser.parse(writtenBytes, 'STY');
    expect(reparsed.sections.some((s: any) => s.name === 'Main B')).toBe(true);

    const reparsedRange = StyleRemixer.getSectionTickRange(reparsed, 'Main B')!;
    const noteCount = StyleRemixer.countNotesInChannel(reparsed, reparsedRange.startTick, reparsedRange.endTick, 9);
    expect(noteCount).toBeGreaterThan(0);
  });
});
