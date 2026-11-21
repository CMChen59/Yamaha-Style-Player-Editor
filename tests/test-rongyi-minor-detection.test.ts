import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('《容易受傷的女人》A Minor 關係小調校正與弱起前奏嗅探測試', () => {
  const filePath = 'C:/Users/CM/.gemini/antigravity/brain/efa7139d-39ef-488e-b2d4-677174e8485e/.user_uploaded/media_1795267226707_f0b6a50c.mid';

  it('1. 全曲主調分析應正確識別為 A Minor (關係小調智慧校正)', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');

    expect(analysis.isMinorKey).toBe(true);
    expect(analysis.detectedTonic).toBe('A');
    expect(analysis.keySignatureLabel).toContain('A Minor');
  });

  it('2. 切片起始第 1 小節應標記為弱起引導音 (isPickupOrSparse)，並向後嗅探第 2 小節 F 和弦', () => {
    if (!fs.existsSync(filePath)) return;
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'MIDI');
    const srcPpq = parsed.division || 480;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };
    const beats = timeSig.numerator * (4 / timeSig.denominator);
    const ticksPerBar = Math.round(srcPpq * beats);

    // 第 1 小節
    const bar1Chord = MidiSliceAssembler.detectBarChord(parsed, 1, ticksPerBar);
    expect(bar1Chord.isPickupOrSparse).toBe(true);

    // 代表性和弦嗅探 (第 1 ~ 5 小節)
    const repChord = MidiSliceAssembler.detectRepresentativeChord(parsed, 1, 5, ticksPerBar);
    expect(repChord.effectiveBar).toBe(2);
    expect(repChord.chordName).toBe('F');
  });

  it('3. 切片裝配 Intro A (第 1 ~ 5 小節) 採用 CM_MINOR 時，應依據 A Minor 主調剛體平移 +3 半音至 Cm', () => {
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
      chordMode: 'CM_MINOR',
    });

    expect(result.success).toBe(true);
    expect(result.chordMode).toBe('CM_MINOR');

    // 檢查 CASM 規則
    const rules = CasmModifier.extractPartRules(result.styleParsed, 'Intro A');
    const bassRule = rules.find(r => r.channel === 10);
    const chord1Rule = rules.find(r => r.channel === 11);

    expect(bassRule?.sourceChordRoot).toBe(0); // C
    expect(bassRule?.sourceChordType).toBe(8); // Minor
    expect(chord1Rule?.sourceChordRoot).toBe(0); // C
    expect(chord1Rule?.sourceChordType).toBe(8); // Minor
  });
});
