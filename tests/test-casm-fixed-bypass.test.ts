import { describe, it, expect } from 'vitest';
import { getGoldenStyleTemplateBytes } from '../src/core/data/yamaha-style-template';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { CasmModifier } from '../src/core/writer/casm-modifier';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('【任務 2-4E】STY 單軌固定音高直通鎖定開關 (NTR = Root Fixed + NTT = Bypass) 驗收', () => {
  it('1. 單獨將 Main A 的 Phrase 1 (Ch 14) 鎖定為 FIXED_BYPASS：自動執行 CSEG 段落剝離隔離，不污染 Main B，且左手任意換和弦時右手旋律 C-D-E-F-G-A-B-C 維持原音高零走音', () => {
    const raw = getGoldenStyleTemplateBytes();
    const parsed = YamahaParser.parse(raw);

    // 鎖定 Main A 的 Phrase 1 (Ch 14) 為 FIXED_BYPASS (Root Fixed + Bypass)
    const setRes = CasmModifier.setSectionChannelTranspositionMode(parsed, 'Main A', 14, 'FIXED_BYPASS');
    expect(setRes.success).toBe(true);
    expect(setRes.updatedRule.ntr).toBe('Root Fixed');
    expect(setRes.updatedRule.ntt).toBe('Bypass');

    // 查詢 Main A 的 Ch 14 狀態
    const mainAPhr1 = CasmModifier.getSectionChannelRule(parsed, 'Main A', 14);
    expect(mainAPhr1.isFixedBypass).toBe(true);
    expect(mainAPhr1.mode).toBe('FIXED_BYPASS');
    expect(mainAPhr1.rule.ntr).toBe('Root Fixed');
    expect(mainAPhr1.rule.ntt).toBe('Bypass');

    // 驗證【CSEG 段落獨立隔離鐵律】：Main B 的 Ch 14 絕不可被 Main A 污染，仍應保持 Root Transpose
    const mainBPhr1 = CasmModifier.getSectionChannelRule(parsed, 'Main B', 14);
    expect(mainBPhr1.isFixedBypass).toBe(false);
    expect(mainBPhr1.rule.ntr).toBe('Root Transpose');

    // 驗證播放引擎即時使用的 parsed.casmEntries 已同步更新
    const mainAEntries = parsed.casmEntries?.['main a'] || [];
    const ch14Entry = mainAEntries.find((e) => e.destCh === 14);
    expect(ch14Entry).toBeDefined();
    expect(ch14Entry?.ntr).toBe(1); // 1 = Root Fixed
    expect(ch14Entry?.ntt).toBe(0); // 0 = Bypass

    // 模擬使用者情境：右手固定旋律 C-D-E-F-G-A-B-C (60, 62, 64, 65, 67, 69, 71, 72)，左手每兩個音換一次和弦 (C -> Am -> F -> G)
    const melodyNotes = [60, 62, 64, 65, 67, 69, 71, 72];
    const leftHandChords = [
      ChordTransposer.buildChord('C', 'maj'),
      ChordTransposer.buildChord('A', 'm'),
      ChordTransposer.buildChord('F', 'maj'),
      ChordTransposer.buildChord('G', 'maj'),
    ];

    for (let i = 0; i < melodyNotes.length; i++) {
      const note = melodyNotes[i];
      const chord = leftHandChords[Math.floor(i / 2)];
      const outPitch = ChordTransposer.transposeSingleNote(
        note,
        chord,
        14,
        false,
        0,
        127,
        ch14Entry?.ntr,
        ch14Entry?.ntt,
        ch14Entry?.chordType
      );
      // 不論左手換到 C、Am、F 或 G，右手音高必須 100% 死死釘在原音高！
      expect(outPitch).toBe(note);
    }

    // 二進位 Round-Trip 匯出與重載驗證
    const outBytes = YamahaWriter.write(parsed);
    const reparsed = YamahaParser.parse(outBytes);
    const reparsedRule = CasmModifier.getSectionChannelRule(reparsed, 'Main A', 14);
    expect(reparsedRule.isFixedBypass).toBe(true);
    expect(reparsedRule.rule.ntr).toBe('Root Fixed');
    expect(reparsedRule.rule.ntt).toBe('Bypass');
  });
});
