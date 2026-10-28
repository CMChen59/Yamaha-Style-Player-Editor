import { describe, it, expect } from 'vitest';
import { CasmModifier, CASM_STANDARD_PRESETS } from '../src/core/writer/casm-modifier';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';

describe('CasmModifier CASM 轉調規則編輯引擎測試', () => {
  it('1. 能取得完整的 8 聲部預設 CASM 規則清單', () => {
    const rules = CasmModifier.getDefaultPartRules();
    expect(rules).toHaveLength(8);

    const bass = rules.find((r) => r.partId === 'Bass');
    expect(bass).toBeDefined();
    expect(bass?.ntr).toBe('Root Transpose');
    expect(bass?.ntt).toBe('Bass');

    const rhy1 = rules.find((r) => r.partId === 'Rhythm1');
    expect(rhy1?.ntr).toBe('Root Fixed');
    expect(rhy1?.ntt).toBe('Bypass');
  });

  it('2. 能自合成空白 Style 中提取 CASM 規則並驗證結構', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TestStyle',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 480,
      sections: [{ name: 'Main A', bars: 4 }],
    });

    expect(style.hasCasm).toBe(true);
    const extracted = CasmModifier.extractPartRules(style);
    expect(extracted).toHaveLength(8);

    const chord1 = extracted.find((r) => r.partId === 'Chord1');
    expect(chord1?.ntr).toBe('Root Transpose');
    expect(chord1?.ntt).toBe('Chord');
  });

  it('3. 能修改聲部 NTR/NTT 與音域極限並成功回寫二進位 CASM', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TestStyle',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 480,
      sections: [{ name: 'Main A', bars: 4 }],
    });

    const rules = CasmModifier.extractPartRules(style);
    // 將 Phrase 1 修改為 Root Fixed + Bypass (自訂不轉調)
    const phr1 = rules.find((r) => r.partId === 'Phrase1');
    if (phr1) {
      phr1.ntr = 'Root Fixed';
      phr1.ntt = 'Bypass';
      phr1.noteLowLimit = 40;
      phr1.noteHighLimit = 80;
    }

    const res = CasmModifier.updateParsedCasm(style, rules);
    expect(res.success).toBe(true);

    // 重新提取驗證
    const reExtracted = CasmModifier.extractPartRules(style);
    const rePhr1 = reExtracted.find((r) => r.partId === 'Phrase1');
    expect(rePhr1?.ntr).toBe('Root Fixed');
    expect(rePhr1?.ntt).toBe('Bypass');
    expect(rePhr1?.noteLowLimit).toBe(40);
    expect(rePhr1?.noteHighLimit).toBe(80);
  });

  it('4. 設定 Root Fixed + Bypass 時，大和小和弦轉調表 (Major & Minor) 皆被設為 0x01/0x00 防止跳八度', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TestStyle',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 480,
      sections: [{ name: 'Main A', bars: 4 }],
    });

    const rules = CasmModifier.extractPartRules(style);
    const phr1 = rules.find((r) => r.partId === 'Phrase1');
    if (phr1) {
      phr1.ntr = 'Root Fixed';
      phr1.ntt = 'Bypass';
    }

    CasmModifier.updateParsedCasm(style, rules);

    const casmChunk = style.customChunks.find((c) => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    const data = casmChunk!.data;

    // 尋找 Phrase 1 Ctb2 (channel 14 = 0x0e)
    let foundPhr1Ctb: Uint8Array | null = null;
    let offset = 0;
    while (offset + 8 <= data.length) {
      const chunkId = String.fromCharCode(...data.slice(offset, offset + 4));
      const chunkSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];
      if (chunkId === 'CSEG') {
        let sub = offset + 8;
        const end = sub + chunkSize;
        while (sub + 8 <= end) {
          const subId = String.fromCharCode(...data.slice(sub, sub + 4));
          const subSize = (data[sub + 4] << 24) | (data[sub + 5] << 16) | (data[sub + 6] << 8) | data[sub + 7];
          if (subId === 'Ctb2') {
            const payload = data.slice(sub + 8, sub + 8 + subSize);
            if (payload[0] === 14) {
              foundPhr1Ctb = payload;
              break;
            }
          }
          sub += 8 + subSize;
        }
      }
      offset += 8 + chunkSize;
    }

    expect(foundPhr1Ctb).not.toBeNull();
    // Byte 28: Major NTR = 1 (Root Fixed)
    expect(foundPhr1Ctb![28]).toBe(1);
    // Byte 29: Major NTT = 0 (Bypass)
    expect(foundPhr1Ctb![29]).toBe(0);
    // Byte 34: Minor NTR = 1 (Root Fixed) - 保證小和弦不跳八度
    expect(foundPhr1Ctb![34]).toBe(1);
    // Byte 35: Minor NTT = 0 (Bypass) - 保證小和弦不變形
    expect(foundPhr1Ctb![35]).toBe(0);
  });
});
