import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('步驟 1.2: Yamaha 核心解析器真實樣品驗收 (Parser Verification)', () => {
  const samplesDir = path.resolve(__dirname, '../samples');

  it('能正確解析真實 STY 伴奏檔案 (4006_SX900.T547.sty)', () => {
    const filePath = path.join(samplesDir, '4006_SX900.T547.sty');
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 驗證基本屬性
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBeGreaterThan(0);
    expect(parsed.bpm).toBeGreaterThan(0);
    expect(parsed.tracks.length).toBeGreaterThan(0);

    // 驗證段落標記 (Sections)
    expect(parsed.sections.length).toBeGreaterThan(0);
    const sectionNames = parsed.sections.map((s) => s.name);
    console.log('STY 解析到的段落清單:', sectionNames);

    // 驗證伴奏聲部資訊 (Parts / Tracks)
    expect(parsed.parts.length).toBeGreaterThan(0);
    console.log('STY 解析到的聲部清單:', parsed.parts.map((p) => `${p.partName} (Ch ${p.channel + 1}): Vol=${p.volume}, Bank=${p.bankMsb}-${p.bankLsb}, PC=${p.programChange}`));

    // 驗證專屬區塊 (CASM / OTS)
    console.log('STY 解析到的專屬區塊:', parsed.customChunks.map((c) => `${c.id} (size: ${c.data.length})`));
    expect(parsed.hasCasm).toBe(true);
  });

  it('能正確解析真實 PAD 檔案 (4006-1_PAD.PAD)', () => {
    const filePath = path.join(samplesDir, '4006-1_PAD.PAD');
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'PAD');

    expect(parsed.format).toBe('PAD');
    expect(parsed.division).toBeGreaterThan(0);
    console.log('PAD-1 解析到的段落:', parsed.sections.map((s) => s.name));
    console.log('PAD-1 解析到的聲部:', parsed.parts.map((p) => `${p.partName}: Ch=${p.channel + 1}, PC=${p.programChange}`));
    console.log('PAD-1 專屬區塊:', parsed.customChunks.map((c) => `${c.id} (size: ${c.data.length})`));
  });

  it('能正確解析真實 PAD 檔案 (4006-2_PAD.PAD) 並分離控制旗標', () => {
    const filePath = path.join(samplesDir, '4006-2_PAD.PAD');
    expect(fs.existsSync(filePath)).toBe(true);

    const buffer = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'PAD');

    expect(parsed.format).toBe('PAD');
    expect(parsed.padConfig).toBeDefined();
    console.log('PAD-2 控制配置:', parsed.padConfig);

    // 驗證標籤分離：sections 不應包含 RP、CM、N1~N4、I1~I4 等雜訊
    const hasControlTags = parsed.sections.some(s =>
      s.name.startsWith('RP') || s.name.startsWith('CM') || /^N[1-4]/.test(s.name) || /^I[1-4]/.test(s.name)
    );
    expect(hasControlTags).toBe(false);
  });
});
