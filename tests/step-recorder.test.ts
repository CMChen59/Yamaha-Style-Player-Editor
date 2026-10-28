import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StepRecorder } from '../src/core/writer/step-recorder';

describe('Phase 2.7 Mode B: 步進錄音與單步和弦輸入核心 (StepRecorder Tests)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始化時游標處於 Tick 0 (第 1 小節 第 1.1 拍)，且歷史為空', () => {
    const recorder = new StepRecorder();
    expect(recorder.getCurrentTick()).toBe(0);
    const pos = recorder.getPosition();
    expect(pos.bar).toBe(1);
    expect(pos.beat).toBe(1);
    expect(pos.subBeat).toBe(1);
    expect(recorder.getHistory()).toEqual([]);
  });

  it('能精確換算各步進時值之 Tick 數 (getStepTicks)', () => {
    const recorder = new StepRecorder({ ppq: 480 });
    expect(recorder.getStepTicks('1/1')).toBe(1920); // 4 拍全小節
    expect(recorder.getStepTicks('1/2')).toBe(960);  // 2 拍二分音符
    expect(recorder.getStepTicks('1/4')).toBe(480);  // 1 拍四分音符
    expect(recorder.getStepTicks('1/8')).toBe(240);  // 半拍八分音符
    expect(recorder.getStepTicks('1/16')).toBe(120); // 十六分音符
    expect(recorder.getStepTicks('1/32')).toBe(60);  // 三十二分音符
    expect(recorder.getStepTicks('1/8T')).toBe(160); // 八分三連音
    expect(recorder.getStepTicks('1/16T')).toBe(80); // 十六分三連音
  });

  it('能正確聚合并寫入多音和弦 (Chord Capture) 並自動推進游標', () => {
    const recorder = new StepRecorder({ ppq: 480, resolution: '1/4' });

    // 模擬彈奏 C 大三和弦 (C4, E4, G4)
    recorder.handleNoteOn(60, 95);
    recorder.handleNoteOn(64, 90);
    recorder.handleNoteOn(67, 100);

    // 手指放開琴鍵
    recorder.handleNoteOff(60);
    recorder.handleNoteOff(64);
    recorder.handleNoteOff(67);

    // 推進防抖計時器
    vi.advanceTimersByTime(50);

    // 驗證已成功寫入 1 筆步進
    const history = recorder.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].type).toBe('notes');
    expect(history[0].chordName).toBe('C');
    expect(history[0].startTick).toBe(0);
    expect(history[0].durationTick).toBe(480);
    expect(history[0].notes.length).toBe(3);

    // 驗證游標自動推進至 Tick 480 (第 1 小節 第 2.1 拍)
    expect(recorder.getCurrentTick()).toBe(480);
    const pos = recorder.getPosition();
    expect(pos.bar).toBe(1);
    expect(pos.beat).toBe(2);
  });

  it('能正確插入休止符 (insertRest) 並推進游標', () => {
    const recorder = new StepRecorder({ ppq: 480, resolution: '1/4' });

    const restEntry = recorder.insertRest();
    expect(restEntry.type).toBe('rest');
    expect(restEntry.startTick).toBe(0);
    expect(restEntry.durationTick).toBe(480);
    expect(recorder.getCurrentTick()).toBe(480);
    expect(recorder.getHistory().length).toBe(1);
  });

  it('能正確延長前音時值 (tiePreviousNote)', () => {
    const recorder = new StepRecorder({ ppq: 480, resolution: '1/4' });

    // 彈入一個 C4 單音 (1 拍)
    recorder.handleNoteOn(60, 100);
    recorder.handleNoteOff(60);
    vi.advanceTimersByTime(50);

    expect(recorder.getCurrentTick()).toBe(480);
    expect(recorder.getHistory()[0].durationTick).toBe(480);

    // 按下延長前音 (Tie)
    const tieOk = recorder.tiePreviousNote();
    expect(tieOk).toBe(true);

    // 驗證前音時值被擴展為 960 (2 拍)，游標前進至 960
    expect(recorder.getHistory()[0].durationTick).toBe(960);
    expect(recorder.getHistory()[0].notes[0].durationTick).toBe(960);
    expect(recorder.getCurrentTick()).toBe(960);
  });

  it('支援單步後退與復原 (stepBack)', () => {
    const recorder = new StepRecorder({ ppq: 480, resolution: '1/4' });

    recorder.insertRest(); // Step 1
    recorder.insertRest(); // Step 2
    expect(recorder.getCurrentTick()).toBe(960);
    expect(recorder.getHistory().length).toBe(2);

    const backOk = recorder.stepBack();
    expect(backOk).toBe(true);
    expect(recorder.getCurrentTick()).toBe(480);
    expect(recorder.getHistory().length).toBe(1);
  });

  it('能準確辨識各類常見和弦名稱 (Chord Recognition)', () => {
    expect(StepRecorder.detectChordName([60])).toBe('C4');
    expect(StepRecorder.detectChordName([60, 64, 67])).toBe('C');      // C Major
    expect(StepRecorder.detectChordName([57, 60, 64])).toBe('Am');     // A Minor
    expect(StepRecorder.detectChordName([55, 59, 62, 65])).toBe('G7'); // G7
    expect(StepRecorder.detectChordName([60, 64, 67, 71])).toBe('Cmaj7'); // Cmaj7
    expect(StepRecorder.detectChordName([60, 65, 67])).toBe('Csus4');  // Csus4
  });
});
