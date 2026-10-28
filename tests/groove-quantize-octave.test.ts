import { describe, it, expect } from 'vitest';
import { PadRecorder, type RecordedNote } from '../src/core/writer/pad-recorder';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';

describe('Phase 2.8-B: Swing 搖擺律動量化與八度移調核心驗收 (Groove & Octave Shift)', () => {
  const ppq = 480;

  describe('1. Swing 搖擺網格吸附演算法 (snapTickToGrid)', () => {
    it('1/16-swing-60 經典搖擺能正確吸附反拍音符至 60% 延遲位置 (144 Ticks)', () => {
      // 在 480 PPQ 下，1 拍 = 480 Ticks，半拍 (8分音符) = 240 Ticks
      // 直格 1/16 為 120 Ticks (50%)
      // 60% Swing 1/16 為 240 * 0.60 = 144 Ticks
      
      // 接近正拍 (0)
      expect(PadRecorder.snapTickToGrid(20, '1/16-swing-60', ppq)).toBe(0);
      
      // 接近 60% 反拍 (144)
      expect(PadRecorder.snapTickToGrid(120, '1/16-swing-60', ppq)).toBe(144);
      expect(PadRecorder.snapTickToGrid(150, '1/16-swing-60', ppq)).toBe(144);

      // 接近第 3 顆 16分音符 (即第 2 個八分正拍 240)
      expect(PadRecorder.snapTickToGrid(235, '1/16-swing-60', ppq)).toBe(240);

      // 接近第 4 顆 16分音符 (240 + 144 = 384)
      expect(PadRecorder.snapTickToGrid(370, '1/16-swing-60', ppq)).toBe(384);
    });

    it('1/16-swing-66 重度/三連音搖擺能正確對齊 2:1 比例 (160 Ticks)', () => {
      // 240 * (2/3) = 160 Ticks
      expect(PadRecorder.snapTickToGrid(140, '1/16-swing-66', ppq)).toBe(160);
      expect(PadRecorder.snapTickToGrid(170, '1/16-swing-66', ppq)).toBe(160);
      // 第 4 顆 16分音符 = 240 + 160 = 400 Ticks
      expect(PadRecorder.snapTickToGrid(395, '1/16-swing-66', ppq)).toBe(400);
    });

    it('1/16-swing-54 輕微搖擺能正確微延遲 (130 Ticks)', () => {
      // 240 * 0.54 = 129.6 -> 130 Ticks
      expect(PadRecorder.snapTickToGrid(125, '1/16-swing-54', ppq)).toBe(130);
    });

    it('1/8-swing-60 搖擺能正確延遲第 2 個八分音符至 288 Ticks', () => {
      // 480 * 0.60 = 288 Ticks
      expect(PadRecorder.snapTickToGrid(240, '1/8-swing-60', ppq)).toBe(288);
      expect(PadRecorder.snapTickToGrid(300, '1/8-swing-60', ppq)).toBe(288);
    });
  });

  describe('2. 即時錄音音符批次 Swing 量化 (PadRecorder.quantizeNotes)', () => {
    it('能將錄入之連續十六分音符轉換為 Swing 60% 搖擺律動', () => {
      const rawNotes: RecordedNote[] = [
        { pitch: 60, velocity: 100, startTick: 5, durationTick: 120 },    // 正拍 1
        { pitch: 62, velocity: 95, startTick: 125, durationTick: 110 },   // 應吸附至 144
        { pitch: 64, velocity: 90, startTick: 245, durationTick: 120 },   // 應吸附至 240
        { pitch: 65, velocity: 85, startTick: 375, durationTick: 100 },   // 應吸附至 384
      ];

      const swung = PadRecorder.quantizeNotes(rawNotes, '1/16-swing-60', ppq, 1920);
      expect(swung[0].startTick).toBe(0);
      expect(swung[1].startTick).toBe(144);
      expect(swung[2].startTick).toBe(240);
      expect(swung[3].startTick).toBe(384);
    });
  });

  describe('3. YamahaPadModifier: 八度移調 (shiftPadOctave)', () => {
    it('能將 Pad 整軌所有音符一鍵升八度 (+12 半音)', () => {
      const proj = YamahaPadSynthesizer.createBlankProject({
        projectName: 'Octave Test',
        bars: 2,
        division: 480,
      });

      // 在 Pad 1 加入兩顆音符 (C3=48, G3=55)
      YamahaPadModifier.replacePadNotes(proj, 1, [
        { note: 48, startTick: 0, durationTick: 240, velocity: 100 },
        { note: 55, startTick: 240, durationTick: 240, velocity: 90 },
      ]);

      const res = YamahaPadModifier.shiftPadOctave(proj, 1, 1);
      expect(res.success).toBe(true);
      expect(res.shiftedCount).toBe(2);

      // 檢查軌道事件音高已升至 C4(60), G4(67)
      const track = proj.tracks[1];
      const noteOns = track.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      expect(noteOns[0].noteNumber).toBe(60);
      expect(noteOns[1].noteNumber).toBe(67);
    });

    it('能將 Pad 整軌所有音符一鍵降八度 (-12 半音)', () => {
      const proj = YamahaPadSynthesizer.createBlankProject({
        projectName: 'Octave Test 2',
        bars: 2,
        division: 480,
      });

      YamahaPadModifier.replacePadNotes(proj, 1, [
        { note: 60, startTick: 0, durationTick: 240, velocity: 100 },
      ]);

      const res = YamahaPadModifier.shiftPadOctave(proj, 1, -1);
      expect(res.success).toBe(true);

      const track = proj.tracks[1];
      const noteOns = track.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      expect(noteOns[0].noteNumber).toBe(48); // 60 - 12 = 48
    });

    it('支援針對指定單一音符 (targetStartTick, targetNote) 獨立移調', () => {
      const proj = YamahaPadSynthesizer.createBlankProject({
        projectName: 'Single Note Octave',
        bars: 2,
        division: 480,
      });

      YamahaPadModifier.replacePadNotes(proj, 1, [
        { note: 48, startTick: 0, durationTick: 240, velocity: 100 },
        { note: 52, startTick: 240, durationTick: 240, velocity: 100 },
      ]);

      // 僅將第 2 顆音符 (tick 240, E3=52) 升高 1 個八度
      const res = YamahaPadModifier.shiftPadOctave(proj, 1, 1, 240, 52);
      expect(res.success).toBe(true);
      expect(res.shiftedCount).toBe(1);
      expect(res.targetNoteInfo).toEqual({ oldNote: 52, newNote: 64 });

      const track = proj.tracks[1];
      const noteOns = track.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      expect(noteOns[0].noteNumber).toBe(48); // 未受影響
      expect(noteOns[1].noteNumber).toBe(64); // 52 -> 64
    });

    it('邊界防呆：音符達 127 時無法再升八度', () => {
      const proj = YamahaPadSynthesizer.createBlankProject({ projectName: 'Clamp Test', bars: 2 });
      YamahaPadModifier.replacePadNotes(proj, 1, [
        { note: 120, startTick: 0, durationTick: 240, velocity: 100 },
      ]);

      const res = YamahaPadModifier.shiftPadOctave(proj, 1, 1, 0, 120);
      // 120 + 12 = 132 -> clamped to 127
      expect(res.success).toBe(true);
      expect(res.targetNoteInfo?.newNote).toBe(127);
    });
  });

  describe('4. YamahaPadModifier: 畫布後製量化與 Swing 套用 (quantizePadTrack)', () => {
    it('能將 Pad 軌道已存在的音符套用 1/16-swing-60 搖擺律動', () => {
      const proj = YamahaPadSynthesizer.createBlankProject({
        projectName: 'Quantize Track Test',
        bars: 2,
        division: 480,
      });

      YamahaPadModifier.replacePadNotes(proj, 2, [
        { note: 60, startTick: 120, durationTick: 120, velocity: 100 }, // 直格 120
        { note: 64, startTick: 360, durationTick: 120, velocity: 90 },  // 直格 360
      ]);

      const res = YamahaPadModifier.quantizePadTrack(proj, 2, '1/16-swing-60');
      expect(res.success).toBe(true);
      expect(res.quantizedCount).toBe(2);

      const track = proj.tracks[2];
      let cur = 0;
      const onTicks: number[] = [];
      for (const ev of track.events) {
        cur += ev.delta;
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          onTicks.push(cur);
        }
      }

      // 直格 120 應被推移至 144 (60% Swing)
      // 直格 360 應被推移至 384 (60% Swing)
      expect(onTicks[0]).toBe(144);
      expect(onTicks[1]).toBe(384);
    });
  });
});
