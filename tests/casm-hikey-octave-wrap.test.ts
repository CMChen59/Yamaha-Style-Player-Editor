import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('任務 1-3: Yamaha CASM HiKey 動態轉調八度折返決策測試', () => {
  describe('1. ChordTransposer.calculateHiKeyShift 演算法驗證', () => {
    it('在預設 HiKey = 6 (F#) 時，音高 C~F# 向上移調，G~B 向下八度折返', () => {
      // 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=Bb, 11=B
      expect(ChordTransposer.calculateHiKeyShift(0, 6)).toBe(0);    // C -> 0
      expect(ChordTransposer.calculateHiKeyShift(2, 6)).toBe(2);    // D -> +2
      expect(ChordTransposer.calculateHiKeyShift(4, 6)).toBe(4);    // E -> +4
      expect(ChordTransposer.calculateHiKeyShift(5, 6)).toBe(5);    // F -> +5
      expect(ChordTransposer.calculateHiKeyShift(6, 6)).toBe(6);    // F# -> +6 (<= 6)
      expect(ChordTransposer.calculateHiKeyShift(7, 6)).toBe(-5);   // G -> -5 (7 - 12)
      expect(ChordTransposer.calculateHiKeyShift(9, 6)).toBe(-3);   // A -> -3 (9 - 12)
      expect(ChordTransposer.calculateHiKeyShift(11, 6)).toBe(-1);  // B -> -1 (11 - 12)
    });

    it('在 Yamaha 官方 Bass 推薦 HiKey = 5 (F) 時，F# 即刻向下折返，防範低音跳八度', () => {
      // 依據 Yamaha SFF 原廠手冊 P.30~31，Bass HiKey 常設為 5 (F)
      expect(ChordTransposer.calculateHiKeyShift(0, 5)).toBe(0);    // C -> 0
      expect(ChordTransposer.calculateHiKeyShift(5, 5)).toBe(5);    // F -> +5 (<= 5)
      // 當目標和弦為 F# (6) 時，6 > 5，強制向下折返 6 - 12 = -6！
      expect(ChordTransposer.calculateHiKeyShift(6, 5)).toBe(-6);
      expect(ChordTransposer.calculateHiKeyShift(7, 5)).toBe(-5);   // G -> -5
      expect(ChordTransposer.calculateHiKeyShift(11, 5)).toBe(-1);  // B -> -1
    });

    it('在 HiKey = 7 (G) 時，G (7) 向上移調 (+7)，Ab (8) 才向下折返 (-4)', () => {
      expect(ChordTransposer.calculateHiKeyShift(7, 7)).toBe(7);    // G -> +7 (<= 7)
      expect(ChordTransposer.calculateHiKeyShift(8, 7)).toBe(-4);   // Ab -> 8 - 12 = -4
    });

    it('對無效或超出範圍之 HiKey 參數具備自動邊界防護 (Clamping & Modulo)', () => {
      // 支援 rootPitchClass 帶有八度溢位
      expect(ChordTransposer.calculateHiKeyShift(12, 6)).toBe(0);   // 12 % 12 = 0
      expect(ChordTransposer.calculateHiKeyShift(14, 6)).toBe(2);   // 14 % 12 = 2
      // HiKey 小於 0 限制為 0
      expect(ChordTransposer.calculateHiKeyShift(2, -1)).toBe(-10); // clamped to 0 -> 2 > 0 -> 2 - 12 = -10
      // 預設參數 fallback 為 6
      expect(ChordTransposer.calculateHiKeyShift(6)).toBe(6);
      expect(ChordTransposer.calculateHiKeyShift(7)).toBe(-5);
    });
  });

  describe('2. ChordTransposer.transposeSingleNote 動態 HiKey 轉調行為', () => {
    it('Bass 聲部在 HiKey = 5 vs HiKey = 6 時對 F# 和弦之八度折返差異', () => {
      // 假設來源音為 C2 (36)，目標和弦為 F# Major (rootPitchClass = 6)
      const chordFSharp = ChordTransposer.buildChord('F#', 'maj');

      // (1) 使用預設 HiKey = 6：F# <= 6 -> 向上移調 6 個半音 -> 36 + 6 = 42
      const noteWithHk6 = ChordTransposer.transposeSingleNote(
        36,
        chordFSharp,
        10, // Bass
        false,
        28,
        55,
        'Root Transpose',
        'Bass',
        0,
        false,
        6 // hiKey = 6
      );
      expect(noteWithHk6).toBe(42);

      // (2) 使用 Bass 原廠推薦 HiKey = 5：F# > 5 -> 向下翻八度移調 -6 個半音 -> 36 - 6 = 30
      // 30 在 Bass 音域 (28 ~ 55) 內，完美沉穩扎根低音區！
      const noteWithHk5 = ChordTransposer.transposeSingleNote(
        36,
        chordFSharp,
        10, // Bass
        false,
        28,
        55,
        'Root Transpose',
        'Bass',
        0,
        false,
        5 // hiKey = 5
      );
      expect(noteWithHk5).toBe(30);
    });

    it('transposeNotes 批次轉換正確轉發 hiKey 參數', () => {
      const chordFSharp = ChordTransposer.buildChord('F#', 'maj');
      const notes = [
        { note: 36, velocity: 90, tick: 0, duration: 480 },
      ];

      const resHk5 = ChordTransposer.transposeNotes(
        notes,
        chordFSharp,
        10,
        false,
        28,
        55,
        'Root Transpose',
        'Bass',
        0,
        false,
        5
      );
      expect(resHk5[0].note).toBe(30);

      const resHk6 = ChordTransposer.transposeNotes(
        notes,
        chordFSharp,
        10,
        false,
        28,
        55,
        'Root Transpose',
        'Bass',
        0,
        false,
        6
      );
      expect(resHk6[0].note).toBe(42);
    });
  });

  describe('3. YamahaParser.parseCasmEntries 解析原廠真實檔案之 HiKey 與 Limits', () => {
    it('應從 4006_SX900.T547.sty 提取各聲部專屬之 HiKey 與音域邊界', () => {
      const styPath = path.resolve(__dirname, '../public/4006_SX900.T547.sty');
      if (!fs.existsSync(styPath)) return;

      const buffer = fs.readFileSync(styPath);
      const parsed = YamahaParser.parse(buffer);
      expect(parsed.hasCasm).toBe(true);

      const casmEntries = YamahaParser.parseCasmEntries(parsed);
      expect(casmEntries.length).toBeGreaterThan(0);

      // 檢驗是否有解析出 hiKey、lowLimit、highLimit
      const bassEntries = casmEntries.filter((e) => e.targetChannel === 10);
      expect(bassEntries.length).toBeGreaterThan(0);
      for (const entry of bassEntries) {
        expect(entry.hiKey).toBeDefined();
        expect(entry.hiKey).toBeGreaterThanOrEqual(0);
        expect(entry.hiKey).toBeLessThanOrEqual(11);
        expect(entry.lowLimit).toBeDefined();
        expect(entry.highLimit).toBeDefined();
      }
    });

    it('應從 1024_容易受傷的女人.sty 正確解析 CASM 條目', () => {
      const styPath = path.resolve(__dirname, '../public/1024_容易受傷的女人.sty');
      if (!fs.existsSync(styPath)) return;

      const buffer = fs.readFileSync(styPath);
      const parsed = YamahaParser.parse(buffer);
      expect(parsed.hasCasm).toBe(true);

      const casmEntries = YamahaParser.parseCasmEntries(parsed);
      expect(casmEntries.length).toBeGreaterThan(0);

      const ch10Entry = casmEntries.find((e) => e.targetChannel === 10);
      if (ch10Entry) {
        expect(ch10Entry.hiKey).toBeDefined();
        expect(ch10Entry.lowLimit).toBeDefined();
        expect(ch10Entry.highLimit).toBeDefined();
      }
    });
  });

  describe('4. CasmModifier 聲部規則與二進位 Ctb2 建構/提取測試', () => {
    it('getDefaultPartRules 預設 Bass 為 HiKey 5，其餘聲部預設為 6', () => {
      const rules = CasmModifier.getDefaultPartRules();
      const bassRule = rules.find((r) => r.partId === 'Bass');
      expect(bassRule).toBeDefined();
      expect(bassRule?.hiKey).toBe(5);

      const chord1Rule = rules.find((r) => r.partId === 'Chord1');
      expect(chord1Rule).toBeDefined();
      expect(chord1Rule?.hiKey).toBe(6);
    });

    it('buildCtb2Data 正確將 HiKey 寫入二進位第 30 與 36 位元組', () => {
      const defaultRules = CasmModifier.getDefaultPartRules();
      const bassRule = defaultRules.find((r) => r.partId === 'Bass')!;
      
      const ctbData = CasmModifier.buildCtb2Data(bassRule);
      // Byte 30: HiKey Major
      expect(ctbData[30]).toBe(5);
      // Byte 36: HiKey Minor
      expect(ctbData[36]).toBe(5);
      // Byte 31/32: Low/High Limits
      expect(ctbData[31]).toBe(bassRule.noteLowLimit);
      expect(ctbData[32]).toBe(bassRule.noteHighLimit);
    });

    it('extractPartRules 能夠從二進位資料中還原 HiKey 數值', () => {
      const styPath = path.resolve(__dirname, '../public/4006_SX900.T547.sty');
      if (!fs.existsSync(styPath)) return;

      const buffer = fs.readFileSync(styPath);
      const parsed = YamahaParser.parse(buffer);
      const extracted = CasmModifier.extractPartRules(parsed, 'Main A');

      expect(extracted.length).toBe(8);
      for (const rule of extracted) {
        expect(rule.hiKey).toBeDefined();
        expect(rule.hiKey).toBeGreaterThanOrEqual(0);
        expect(rule.hiKey).toBeLessThanOrEqual(11);
      }
    });
  });
});
