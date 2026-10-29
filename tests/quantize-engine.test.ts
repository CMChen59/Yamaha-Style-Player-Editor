import { describe, it, expect } from 'vitest';
import { QuantizeEngine, type QuantizableNote } from '../src/core/writer/quantize-engine';

describe('Tier 2-2 Step 1: 音符網格量化與搖擺律動核心 (QuantizeEngine) 測試', () => {
  describe('1. 網格步長計算 (getGridStepTicks)', () => {
    it('在標準 480 PPQ 下正確計算各網格解析度之 Ticks', () => {
      expect(QuantizeEngine.getGridStepTicks('1/4', 480)).toBe(480);
      expect(QuantizeEngine.getGridStepTicks('1/8', 480)).toBe(240);
      expect(QuantizeEngine.getGridStepTicks('1/16', 480)).toBe(120);
      expect(QuantizeEngine.getGridStepTicks('1/32', 480)).toBe(60);
      expect(QuantizeEngine.getGridStepTicks('1/4T', 480)).toBe(320);
      expect(QuantizeEngine.getGridStepTicks('1/8T', 480)).toBe(160);
      expect(QuantizeEngine.getGridStepTicks('1/16T', 480)).toBe(80);
    });

    it('在 Yamaha 原廠高精度 1920 PPQ 下精確計算', () => {
      expect(QuantizeEngine.getGridStepTicks('1/4', 1920)).toBe(1920);
      expect(QuantizeEngine.getGridStepTicks('1/8', 1920)).toBe(960);
      expect(QuantizeEngine.getGridStepTicks('1/16', 1920)).toBe(480);
      expect(QuantizeEngine.getGridStepTicks('1/32', 1920)).toBe(240);
      expect(QuantizeEngine.getGridStepTicks('1/8T', 1920)).toBe(640);
      expect(QuantizeEngine.getGridStepTicks('1/16T', 1920)).toBe(320);
    });
  });

  describe('2. 標準網格磁吸吸附 (Straight Snapping)', () => {
    it('1/16 拍標準網格能將微偏音符吸附至最近的 120 倍數', () => {
      // 115 -> 120
      expect(QuantizeEngine.snapTick(115, '1/16', 480, 50)).toBe(120);
      // 126 -> 120
      expect(QuantizeEngine.snapTick(126, '1/16', 480, 50)).toBe(120);
      // 248 -> 240
      expect(QuantizeEngine.snapTick(248, '1/16', 480, 50)).toBe(240);
    });

    it('1/8 拍標準網格能將音符吸附至最近的 240 倍數', () => {
      expect(QuantizeEngine.snapTick(235, '1/8', 480, 50)).toBe(240);
      expect(QuantizeEngine.snapTick(470, '1/8', 480, 50)).toBe(480);
    });

    it('三連音 1/8T 網格能精準對齊至 160 倍數', () => {
      // 155 -> 160
      expect(QuantizeEngine.snapTick(155, '1/8T', 480, 50)).toBe(160);
      // 310 -> 320
      expect(QuantizeEngine.snapTick(310, '1/8T', 480, 50)).toBe(320);
    });
  });

  describe('3. 搖擺律動 (Swing & Shuffle Snapping)', () => {
    it('1/16 拍在 60% Light Swing 下將後半拍音符適度推延', () => {
      // 在 480 PPQ 下，半拍 pair = 240 ticks
      // 正拍 (downbeat) 0 -> 0
      expect(QuantizeEngine.snapTick(5, '1/16', 480, 60)).toBe(0);
      // 後半拍 (upbeat) 原本在 120，60% swing 下應被吸附至 240 * 0.60 = 144 ticks
      expect(QuantizeEngine.snapTick(125, '1/16', 480, 60)).toBe(144);
    });

    it('1/16 拍在 66.7% Triplet Shuffle 下精確對齊至三連音擺動位置', () => {
      // 240 * (2/3) = 160 ticks
      expect(QuantizeEngine.snapTick(125, '1/16', 480, 66.66667)).toBe(160);
    });

    it('1/8 拍在 66.7% Shuffle 下將後半拍吸附至 320 ticks (480 * 2/3)', () => {
      // 1 拍 pair = 480 ticks
      // 後半拍原本在 240，66.7% swing 下吸附至 320
      expect(QuantizeEngine.snapTick(250, '1/8', 480, 66.66667)).toBe(320);
    });
  });

  describe('4. 量化強度 (Quantize Strength 0% ~ 100%)', () => {
    const testNote: QuantizableNote = {
      noteNumber: 36,
      startTick: 110, // 距 120 差 10 ticks
      durationTicks: 100,
      velocity: 100,
    };

    it('Strength 100% (Hard Quantize) 完全吸附至 120', () => {
      const q = QuantizeEngine.quantizeNote(testNote, {
        grid: '1/16',
        strength: 100,
        division: 480,
      });
      expect(q.startTick).toBe(120);
      expect(q.durationTicks).toBe(100); // 預設不量化時值
    });

    it('Strength 50% (Soft Quantize) 僅往格線移動一半距離 (110 -> 115)', () => {
      const q = QuantizeEngine.quantizeNote(testNote, {
        grid: '1/16',
        strength: 50,
        division: 480,
      });
      expect(q.startTick).toBe(115);
    });

    it('Strength 0% 保持原始位置完全不變', () => {
      const q = QuantizeEngine.quantizeNote(testNote, {
        grid: '1/16',
        strength: 0,
        division: 480,
      });
      expect(q.startTick).toBe(110);
    });
  });

  describe('5. 音符時值量化 (Quantize Lengths)', () => {
    it('quantizeLengths: true 時，將音符時值對齊至網格倍數', () => {
      const note: QuantizableNote = {
        noteNumber: 60,
        startTick: 120,
        durationTicks: 105, // 接近 120
        velocity: 90,
      };

      const q = QuantizeEngine.quantizeNote(note, {
        grid: '1/16',
        strength: 100,
        quantizeLengths: true,
        division: 480,
      });

      expect(q.durationTicks).toBe(120);
    });
  });

  describe('6. 邊界保護 (Boundary & TotalTicks Protection)', () => {
    it('音符量化後不超過 totalTicks', () => {
      const note: QuantizableNote = {
        noteNumber: 60,
        startTick: 1850,
        durationTicks: 100,
        velocity: 80,
      };

      const q = QuantizeEngine.quantizeNote(note, {
        grid: '1/4',
        strength: 100,
        totalTicks: 1920,
        division: 480,
      });

      expect(q.startTick).toBeLessThan(1920);
      expect(q.startTick + q.durationTicks).toBeLessThanOrEqual(1920);
    });
  });

  describe('7. 批次量化 (quantizeNotes)', () => {
    it('能正確處理多顆音符並按時間重新排序', () => {
      const notes: QuantizableNote[] = [
        { noteNumber: 38, startTick: 235, durationTicks: 90, velocity: 95 },
        { noteNumber: 36, startTick: 5, durationTicks: 100, velocity: 105 },
        { noteNumber: 42, startTick: 115, durationTicks: 80, velocity: 85 },
      ];

      const res = QuantizeEngine.quantizeNotes(notes, {
        grid: '1/16',
        strength: 100,
        division: 480,
      });

      expect(res.length).toBe(3);
      // 排序應為 0 -> 120 -> 240
      expect(res[0].startTick).toBe(0);
      expect(res[0].noteNumber).toBe(36);
      expect(res[1].startTick).toBe(120);
      expect(res[1].noteNumber).toBe(42);
      expect(res[2].startTick).toBe(240);
      expect(res[2].noteNumber).toBe(38);
    });

    it('能直接支援 SingleTrackNoteEvent 的 relTick 欄位格式', () => {
      const notes = [
        { noteNumber: 38, relTick: 112, durationTicks: 90, velocity: 95 },
        { noteNumber: 36, relTick: 245, durationTicks: 100, velocity: 105 },
      ];

      const res = QuantizeEngine.quantizeNotes(notes, {
        grid: '1/16',
        strength: 100,
        division: 480,
      });

      expect(res[0].relTick).toBe(120);
      expect(res[1].relTick).toBe(240);
    });
  });
});
