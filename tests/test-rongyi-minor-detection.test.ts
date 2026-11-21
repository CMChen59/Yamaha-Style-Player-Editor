import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('《容易受傷的女人》C 大調主歌與段落和弦基準模式實戰驗證', () => {
  const filePath = './容易受伤的女人.mid';

  it('1. 全曲主調分析應尊重內嵌標記為 C Major (大調主歌，微弱差距不誤判小調)', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');

    expect(analysis.isMinorKey).toBe(false);
    expect(analysis.detectedTonic).toBe('C');
    expect(analysis.keySignatureLabel).toContain('C Major');
  });

  it('2. 切片起始第 1 小節應標記為弱起引導音 (isPickupOrSparse)，第 6 小節主歌起點應精準偵測為 C 大調', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const srcPpq = parsed.division || 480;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };
    const beats = timeSig.numerator * (4 / timeSig.denominator);
    const ticksPerBar = Math.round(srcPpq * beats);

    // 第 1 小節前奏弱起
    const bar1Chord = MidiSliceAssembler.detectBarChord(parsed, 1, ticksPerBar);
    expect(bar1Chord.isPickupOrSparse).toBe(true);

    // 第 6 小節主歌起點 (人兒用情深)
    const bar6Chord = MidiSliceAssembler.detectBarChord(parsed, 6, ticksPerBar, 1);
    expect(bar6Chord.chordName).toBe('C');
    expect(bar6Chord.isMinor).toBe(false);
    expect(bar6Chord.rootName).toBe('C');
    expect(bar6Chord.shiftToC).toBe(0);
  });

  it('3. 切片裝配 Intro A (第 1 ~ 5 小節) 預設原曲直通 (ORIGINAL_PASS_THROUGH)，CASM 配置 NTT = Bypass 且 0 移調', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: parsed,
      startBar: 1,
      endBar: 5,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 1,
      endBar: 5,
      targetSection: 'Intro A',
      mappingPlan: plan,
      chordMode: 'ORIGINAL_PASS_THROUGH',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('ORIGINAL_PASS_THROUGH');

    // 檢查 CASM 規則為 Bypass
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Intro A');
    const bassRule = rules.find(r => r.channel === 10);
    const chord1Rule = rules.find(r => r.channel === 11);

    expect(bassRule?.ntt).toBe('Bypass');
    expect(chord1Rule?.ntt).toBe('Bypass');
  });

  it('4. 切片裝配 Main A (第 6 ~ 13 小節) 採用 CM7_MAJOR 模式，第 6 小節 C 大調音符位移 0，CASM 配置 CM7 大調母體', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: parsed,
      startBar: 6,
      endBar: 13,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 6,
      endBar: 13,
      targetSection: 'Main A',
      mappingPlan: plan,
      chordMode: 'CM7_MAJOR',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('CM7_MAJOR');

    // 檢查 CASM 規則為 CM7 大調 (root=0, type=2)
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Main A');
    const bassRule = rules.find(r => r.channel === 10);
    const phraseRule = rules.find(r => r.channel === 15);

    expect(bassRule?.sourceChordRoot).toBe(0); // C
    expect(bassRule?.sourceChordType).toBe(2); // Maj7 / Maj
    expect(phraseRule?.sourceChordRoot).toBe(0); // C
    expect(phraseRule?.sourceChordType).toBe(2); // Maj7 / Maj
  });
});
