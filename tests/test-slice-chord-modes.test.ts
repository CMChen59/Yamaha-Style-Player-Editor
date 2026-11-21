import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('三合一基準和弦模式 (CM7大調 / Cm小調 / 原曲直通) 整合測試', () => {
  const file4006 = 'D:/Keyboard/節奏檔/雲中月圓/4006_SX900.T547.sty';

  it('測試 1: Cm 小調基準模式 (CM_MINOR) - SFF2 原廠標準', () => {
    if (!fs.existsSync(file4006)) return;
    const buf = new Uint8Array(fs.readFileSync(file4006));
    const parsed = YamahaParser.parse(buf, 'STY');
    const analysis = MidiSongAnalyzer.analyze(parsed, '4006_SX900.T547.sty');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: parsed,
      startBar: 1,
      endBar: 4,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Intro A',
      mappingPlan: plan,
      chordMode: 'CM_MINOR',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('CM_MINOR');
    expect(result.isHarmonicallyNormalized).toBe(true);

    // 檢查 CASM 規則
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Intro A');
    const bassRule = rules.find(r => r.channel === 10);
    const chord1Rule = rules.find(r => r.channel === 11);
    const drumRule = rules.find(r => r.channel === 8 || r.channel === 9);

    expect(bassRule).toBeDefined();
    expect(bassRule?.sourceChordRoot).toBe(0); // C
    expect(bassRule?.sourceChordType).toBe(8); // Minor
    expect(bassRule?.ntt).toBe('Bass');

    expect(chord1Rule).toBeDefined();
    expect(chord1Rule?.sourceChordRoot).toBe(0); // C
    expect(chord1Rule?.sourceChordType).toBe(8); // Minor
    expect(chord1Rule?.ntt).toBe('Minor'); // 0x07 Maj-min Minor Table

    expect(drumRule?.ntt).toBe('Bypass');
  });

  it('測試 2: 原曲和弦直通模式 (ORIGINAL_PASS_THROUGH) - NTT = Bypass', () => {
    if (!fs.existsSync(file4006)) return;
    const buf = new Uint8Array(fs.readFileSync(file4006));
    const parsed = YamahaParser.parse(buf, 'STY');
    const analysis = MidiSongAnalyzer.analyze(parsed, '4006_SX900.T547.sty');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: parsed,
      startBar: 1,
      endBar: 4,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Intro A',
      mappingPlan: plan,
      chordMode: 'ORIGINAL_PASS_THROUGH',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('ORIGINAL_PASS_THROUGH');
    expect(result.isHarmonicallyNormalized).toBe(false);

    // 檢查 CASM 規則
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Intro A');
    const chord1Rule = rules.find(r => r.channel === 11);

    expect(chord1Rule).toBeDefined();
    expect(chord1Rule?.ntt).toBe('Bypass');
  });

  it('測試 3: CM7 大調基準模式 (CM7_MAJOR) - Yamaha 原廠標準', () => {
    if (!fs.existsSync(file4006)) return;
    const buf = new Uint8Array(fs.readFileSync(file4006));
    const parsed = YamahaParser.parse(buf, 'STY');
    const analysis = MidiSongAnalyzer.analyze(parsed, '4006_SX900.T547.sty');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: parsed,
      startBar: 1,
      endBar: 4,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Main A',
      mappingPlan: plan,
      chordMode: 'CM7_MAJOR',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('CM7_MAJOR');
    expect(result.isHarmonicallyNormalized).toBe(true);

    // 檢查 CASM 規則
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Main A');
    const bassRule = rules.find(r => r.channel === 10);
    const chord1Rule = rules.find(r => r.channel === 11);

    expect(bassRule?.sourceChordRoot).toBe(0);
    expect(bassRule?.sourceChordType).toBe(2); // Maj7
    expect(chord1Rule?.sourceChordRoot).toBe(0);
    expect(chord1Rule?.sourceChordType).toBe(2); // Maj7
    expect(chord1Rule?.ntt).toBe('Chord');
  });
});
