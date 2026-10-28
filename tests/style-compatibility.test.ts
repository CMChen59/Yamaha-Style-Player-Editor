import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { StyleCompatibilityChecker } from '../src/core/writer/style-compatibility';

describe('整合包 1: StyleCompatibilityChecker 跨風格相容性檢測器', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const buffer = fs.readFileSync(sampleStyPath);
  const realSty = YamahaParser.parse(new Uint8Array(buffer), 'STY');

  it('1. 能正確判定拍號與速度相同之風格為相容', () => {
    // 複製一個同結構的 Style
    const clonedSty = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    const report = StyleCompatibilityChecker.checkCompatibility(clonedSty, realSty, 'Main A', 'Main A');

    expect(report.isCompatible).toBe(true);
    expect(report.isTimeSignatureCompatible).toBe(true);
    expect(report.isBpmCompatible).toBe(true);
    expect(report.warnings.length).toBe(0);
    expect(report.summaryMessage).toContain('相容');
  });

  it('2. 能精準檢測拍號不相容 (例如 3/4 拍 vs 4/4 拍) 並發出警示', () => {
    const sty34 = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    sty34.timeSignature = { numerator: 3, denominator: 4 };

    const report = StyleCompatibilityChecker.checkCompatibility(sty34, realSty, 'Main A', 'Main A');

    expect(report.isTimeSignatureCompatible).toBe(false);
    expect(report.isCompatible).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toContain('拍號不相符');
    expect(report.warnings[0]).toContain('3/4');
    expect(report.warnings[0]).toContain('4/4');
    expect(report.summaryMessage).toContain('拍號不符');
  });

  it('3. 能正確檢測速度差異 (BPM 差距過大警示與小幅差距提示)', () => {
    const fastSty = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    fastSty.bpm = (realSty.bpm || 120) + 40; // 差 40 BPM

    const reportBigDiff = StyleCompatibilityChecker.checkCompatibility(fastSty, realSty);
    expect(reportBigDiff.isBpmCompatible).toBe(false);
    expect(reportBigDiff.bpmDiff).toBe(40);
    expect(reportBigDiff.warnings.some((w) => w.includes('速度差異過大'))).toBe(true);

    const mildSty = YamahaParser.parse(new Uint8Array(buffer), 'STY');
    mildSty.bpm = (realSty.bpm || 120) + 20; // 差 20 BPM
    const reportMild = StyleCompatibilityChecker.checkCompatibility(mildSty, realSty);
    expect(reportMild.advisories.some((a) => a.includes('速度差異提示'))).toBe(true);
  });

  it('4. 能檢測段落小節長度差異並提供循環填滿提示', () => {
    // Fill In BB (1 小節) vs Main A (8 小節)
    const report = StyleCompatibilityChecker.checkCompatibility(realSty, realSty, 'Fill In BB', 'Main A');
    expect(report.advisories.some((a) => a.includes('循環填滿'))).toBe(true);
  });
});
