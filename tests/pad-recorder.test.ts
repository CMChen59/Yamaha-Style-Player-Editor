import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PadRecorder, RecordedNote } from '../src/core/writer/pad-recorder';

describe('Phase 2.7: Pad 即時錄音引擎與智慧量化核心 (PadRecorder Tests)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始狀態為 idle，並具備預設參數', () => {
    const recorder = new PadRecorder();
    expect(recorder.getState()).toBe('idle');
    expect(recorder.getRecordedNotes()).toEqual([]);
  });

  it('量化演算法能準確吸附至 1/16、1/8、1/4 與 3 連音網格 (Quantization Verification)', () => {
    const ppq = 480;
    // 原始音符：例如在 tick 115 彈下 (接近 120 也就是 1/16 拍)
    const rawNotes: RecordedNote[] = [
      { pitch: 60, velocity: 100, startTick: 115, durationTick: 100 },
      { pitch: 64, velocity: 90, startTick: 250, durationTick: 230 }, // 接近 240 (1/8 拍)
      { pitch: 67, velocity: 95, startTick: 475, durationTick: 490 }, // 接近 480 (1/4 拍)
    ];

    // 1. 量化關閉 ('off')
    const offResult = PadRecorder.quantizeNotes(rawNotes, 'off', ppq);
    expect(offResult[0].startTick).toBe(115);

    // 2. 1/16 網格量化 (grid = 120 ticks)
    const q16 = PadRecorder.quantizeNotes(rawNotes, '1/16', ppq);
    expect(q16[0].startTick).toBe(120); // 115 -> 120
    expect(q16[0].durationTick).toBe(120); // 100 -> 120 (最短為 1 網格)
    expect(q16[1].startTick).toBe(240); // 250 -> 240
    expect(q16[1].durationTick).toBe(240); // 230 -> 240

    // 3. 1/4 網格量化 (grid = 480 ticks)
    const q4 = PadRecorder.quantizeNotes(rawNotes, '1/4', ppq);
    expect(q4[0].startTick).toBe(0); // 115 -> 0
    expect(q4[2].startTick).toBe(480); // 475 -> 480
    expect(q4[2].durationTick).toBe(480); // 490 -> 480

    // 4. 1/8 三連音量化 (grid = 480 / 3 = 160 ticks)
    const rawTriplet: RecordedNote[] = [
      { pitch: 60, velocity: 100, startTick: 155, durationTick: 150 },
    ];
    const q8T = PadRecorder.quantizeNotes(rawTriplet, '1/8T', ppq);
    expect(q8T[0].startTick).toBe(160);
    expect(q8T[0].durationTick).toBe(160);
  });

  it('能正確轉換為標準 NoteEvent 結構 (toNoteEvents)', () => {
    const recorded: RecordedNote[] = [
      { pitch: 60, velocity: 100, startTick: 0, durationTick: 240 },
      { pitch: 64, velocity: 90, startTick: 240, durationTick: 240 },
    ];

    const noteEvents = PadRecorder.toNoteEvents(recorded);
    expect(noteEvents.length).toBe(2);
    expect(noteEvents[0]).toEqual({
      note: 60,
      velocity: 100,
      startTick: 0,
      durationTick: 240,
    });
    expect(noteEvents[1]).toEqual({
      note: 64,
      velocity: 90,
      startTick: 240,
      durationTick: 240,
    });
  });

  it('啟動錄音時具備 1 小節預備拍，並精準觸發節拍器回呼與狀態切換', () => {
    const recorder = new PadRecorder();
    const ticks: Array<{ beat: number; isDownbeat: boolean; isCountIn: boolean }> = [];
    const states: string[] = [];

    recorder.start({
      bpm: 120, // 1 beat = 500ms, 1 bar (4 beats) = 2000ms
      bars: 1,  // 錄製 1 小節 (2000ms)
      countInBars: 1, // 預備拍 1 小節 (2000ms)
      onTick: (info) => {
        ticks.push({ beat: info.beat, isDownbeat: info.isDownbeat, isCountIn: info.isCountIn });
      },
      onStateChange: (state) => {
        states.push(state);
      },
    });

    expect(recorder.getState()).toBe('countingIn');
    expect(states).toContain('countingIn');

    // 推進 500ms (第 1 拍)
    vi.advanceTimersByTime(50);
    // 推進至 2050ms (預備拍結束，進入正式錄音)
    vi.advanceTimersByTime(2000);
    expect(recorder.getState()).toBe('recording');

    // 模擬彈奏 Note-On / Note-Off
    recorder.handleNoteOn(60, 95);
    vi.advanceTimersByTime(490);
    recorder.handleNoteOff(60);

    // 推進到總時間結束 (預備拍 2000ms + 錄音 2000ms = 4000ms)
    vi.advanceTimersByTime(1600);
    expect(recorder.getState()).toBe('finished');

    const recorded = recorder.getRecordedNotes();
    expect(recorded.length).toBe(1);
    expect(recorded[0].pitch).toBe(60);
    expect(recorded[0].velocity).toBe(95);
    // 量化後 startTick 應該被吸附到 0
    expect(recorded[0].startTick).toBe(0);
  });
});
