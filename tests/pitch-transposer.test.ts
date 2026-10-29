import { describe, it, expect } from 'vitest';
import { PitchTransposer, type TransposableNote } from '../src/core/writer/pitch-transposer';

describe('Tier 2-3 Step 1: 音符移調與八度升降核心 (PitchTransposer) 測試', () => {
  describe('1. 單音與半音微調 (Semitone Nudge)', () => {
    it('升半音 (+1) 與降半音 (-1)', () => {
      const note: TransposableNote = {
        noteNumber: 60, // C4
        startTick: 0,
        durationTicks: 120,
        velocity: 100,
      };

      const up = PitchTransposer.transposeNotes([note], 1);
      expect(up.success).toBe(true);
      expect(up.notes[0].noteNumber).toBe(61); // C#4
      expect(up.actualShift).toBe(1);

      const down = PitchTransposer.transposeNotes([note], -1);
      expect(down.success).toBe(true);
      expect(down.notes[0].noteNumber).toBe(59); // B3
      expect(down.actualShift).toBe(-1);
    });

    it('八度跳躍 (+8va / -8va)', () => {
      const note: TransposableNote = {
        noteNumber: 48, // C3
        startTick: 0,
        durationTicks: 120,
        velocity: 90,
      };

      const up8va = PitchTransposer.shiftOctave([note], 1);
      expect(up8va.success).toBe(true);
      expect(up8va.notes[0].noteNumber).toBe(60); // C4 (+12)
      expect(up8va.actualShift).toBe(12);

      const down8va = PitchTransposer.shiftOctave([note], -1);
      expect(down8va.success).toBe(true);
      expect(down8va.notes[0].noteNumber).toBe(36); // C2 (-12)
      expect(down8va.actualShift).toBe(-12);
    });
  });

  describe('2. 和弦音程完整性保持 (Chord Harmony Preservation)', () => {
    it('大三和弦 (C4-E4-G4) 集體移調時，內部音程差 100% 維持不變', () => {
      const chord: TransposableNote[] = [
        { noteNumber: 60, startTick: 0, durationTicks: 480, velocity: 100 }, // C4
        { noteNumber: 64, startTick: 0, durationTicks: 480, velocity: 95 },  // E4 (差 4)
        { noteNumber: 67, startTick: 0, durationTicks: 480, velocity: 90 },  // G4 (差 7)
      ];

      // 移調 +5 半音 (C4 -> F4)
      const res = PitchTransposer.transposeNotes(chord, 5);
      expect(res.success).toBe(true);
      expect(res.notes.map(n => n.noteNumber)).toEqual([65, 69, 72]); // F4, A4, C5

      // 檢查各音程差
      const intervals = [
        res.notes[1].noteNumber - res.notes[0].noteNumber,
        res.notes[2].noteNumber - res.notes[0].noteNumber,
      ];
      expect(intervals).toEqual([4, 7]); // 依然是大三和弦
    });
  });

  describe('3. 音高極限邊界保護 (Pitch Range Protection 0 ~ 127)', () => {
    it('群組中最高音觸碰 127 上限時，限制整體位移量以保護和弦', () => {
      const notes: TransposableNote[] = [
        { noteNumber: 110, startTick: 0, durationTicks: 120, velocity: 80 },
        { noteNumber: 123, startTick: 0, durationTicks: 120, velocity: 80 }, // 距 127 僅剩 4 個半音
      ];

      // 試圖移調 +10
      const res = PitchTransposer.transposeNotes(notes, 10);
      expect(res.success).toBe(true);
      expect(res.isLimited).toBe(true);
      expect(res.actualShift).toBe(4); // 受限於最高音，只能移 +4
      expect(res.notes[1].noteNumber).toBe(127);
      expect(res.notes[0].noteNumber).toBe(114); // 兩者間距 (127 - 114 = 13) 依然嚴格保持
    });

    it('群組中最低音觸碰 0 下限時，限制整體位移量', () => {
      const notes: TransposableNote[] = [
        { noteNumber: 3, startTick: 0, durationTicks: 120, velocity: 80 },  // 距 0 僅剩 3 個半音
        { noteNumber: 15, startTick: 0, durationTicks: 120, velocity: 80 },
      ];

      // 試圖移調 -12
      const res = PitchTransposer.transposeNotes(notes, -12);
      expect(res.success).toBe(true);
      expect(res.isLimited).toBe(true);
      expect(res.actualShift).toBe(-3); // 只能移 -3
      expect(res.notes[0].noteNumber).toBe(0);
      expect(res.notes[1].noteNumber).toBe(12);
    });

    it('音符已在邊界上時，拒絕移調並提示無法再移動', () => {
      const note: TransposableNote = { noteNumber: 127, startTick: 0, durationTicks: 120, velocity: 80 };
      const res = PitchTransposer.transposeNotes([note], 1);
      expect(res.success).toBe(false);
      expect(res.actualShift).toBe(0);
      expect(res.isLimited).toBe(true);
    });
  });

  describe('4. 鼓組聲部安全保護 (Drum Channel Protection)', () => {
    it('在 CH 9 (channel=8) 或 CH 10 (channel=9) 預設停用移調並發出警告', () => {
      const drumNote: TransposableNote = { noteNumber: 36, startTick: 0, durationTicks: 120, velocity: 100 };
      const res = PitchTransposer.transposeNotes([drumNote], 2, { channel: 8 });

      expect(res.success).toBe(false);
      expect(res.isDrumWarning).toBe(true);
      expect(res.notes[0].noteNumber).toBe(36); // 音高完全不變
    });

    it('當明確傳入 allowDrumTranspose: true 時允許鼓組移調', () => {
      const drumNote: TransposableNote = { noteNumber: 36, startTick: 0, durationTicks: 120, velocity: 100 };
      const res = PitchTransposer.transposeNotes([drumNote], 2, { channel: 8, allowDrumTranspose: true });

      expect(res.success).toBe(true);
      expect(res.notes[0].noteNumber).toBe(38);
    });
  });
});
