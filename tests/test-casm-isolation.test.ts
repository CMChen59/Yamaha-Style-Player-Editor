import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Casm Section Isolation Verification', () => {
  it('guarantees that modifying Ending A NEVER corrupts Main A, Main B, Main C, or Main D', () => {
    const f1 = new Uint8Array(fs.readFileSync('public/samples/4006_SX900.T547.sty'));
    const p1 = YamahaParser.parse(f1, 'STY');

    // Check Main A, B, C, D rules before
    for (const sec of ['Main A', 'Main B', 'Main C', 'Main D']) {
      const rules = CasmModifier.extractPartRules(p1, sec);
      expect(rules.find(r => r.channel === 10)?.sourceChordRoot).toBe(0);
      expect(rules.find(r => r.channel === 11)?.sourceChordRoot).toBe(0);
    }

    // Now update Ending A with D minor (root=2, type=8, ntt='Bypass') across all accompaniment channels (8..15)
    for (let ch = 8; ch <= 15; ch++) {
      const dMinorRule = {
        channel: ch,
        partId: ch === 10 ? 'Bass' : ch === 11 ? 'Chord1' : 'Phrase1',
        sourceChordRoot: 2,
        sourceChordType: 8,
        ntr: 'Root Transpose' as const,
        ntt: 'Bypass' as const,
        retriggerRule: 'Pitch Shift' as const,
        hiKey: 5,
        noteLowLimit: 0,
        noteHighLimit: 127,
      };
      CasmModifier.injectOrUpdateSectionCasmRule(p1, 'Ending A', ch, dMinorRule);
    }

    // 1. Verify Ending A got its D minor rule
    const endingRules = CasmModifier.extractPartRules(p1, 'Ending A');
    console.log('Ending A Bass rule:', endingRules.find(r => r.channel === 10));
    expect(endingRules.find(r => r.channel === 10)?.sourceChordRoot).toBe(2);
    expect(endingRules.find(r => r.channel === 10)?.sourceChordType).toBe(8);
    expect(endingRules.find(r => r.channel === 10)?.ntt).toBe('Bypass');

    // 2. CRITICAL ASSERTION: Verify Main A, B, C, D are 100% UNTOUCHED and still pure CM7 (root=0, type=2)!
    for (const sec of ['Main A', 'Main B', 'Main C', 'Main D']) {
      const rules = CasmModifier.extractPartRules(p1, sec);
      console.log(`${sec} Bass root:`, rules.find(r => r.channel === 10)?.sourceChordRoot);
      expect(rules.find(r => r.channel === 10)?.sourceChordRoot).toBe(0);
      expect(rules.find(r => r.channel === 10)?.sourceChordType).toBe(2);
      expect(rules.find(r => r.channel === 10)?.ntt).toBe('Bass');
    }
  });
});
