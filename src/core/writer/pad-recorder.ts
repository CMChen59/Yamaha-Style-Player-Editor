/**
 * Yamaha PSR-SX920 Pad 實時錄音與智慧量化核心 (Live Pad Recorder & Quantizer)
 * 負責計時時鐘、預備拍節拍器排程、時間戳轉 Tick、音符緩衝與多精度網格量化對齊。
 */

import type { NoteEvent } from '../audio/audio-engine';

export interface RecordedNote {
  pitch: number;
  velocity: number;
  startTick: number;
  durationTick: number;
}

export type QuantizeGrid =
  | 'off'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'
  | '1/8T'
  | '1/16T'
  | '1/16-swing-54'
  | '1/16-swing-60'
  | '1/16-swing-66'
  | '1/8-swing-60';

export type PadRecorderState = 'idle' | 'countingIn' | 'recording' | 'finished';

export interface PadRecorderOptions {
  bpm: number;
  bars: number;            // 錄製小節數 (1, 2, 4, 8)
  timeSignature?: { numerator: number; denominator: number }; // 預設 4/4
  ppq?: number;            // 預設 480
  countInBars?: number;    // 預備拍小節數 (預設 1 小節)
  quantizeGrid?: QuantizeGrid;
  isAutoQuantize?: boolean; // 是否自動量化 (預設 true)
  onTick?: (info: {
    beat: number;
    bar: number;
    isDownbeat: boolean;
    isCountIn: boolean;
    progress: number;
  }) => void;
  onStateChange?: (state: PadRecorderState) => void;
  onFinish?: (notes: RecordedNote[]) => void;
}

export class PadRecorder {
  private state: PadRecorderState = 'idle';
  private options: Required<PadRecorderOptions> = {
    bpm: 120,
    bars: 2,
    timeSignature: { numerator: 4, denominator: 4 },
    ppq: 480,
    countInBars: 1,
    quantizeGrid: '1/16',
    isAutoQuantize: true,
    onTick: () => {},
    onStateChange: () => {},
    onFinish: () => {},
  };

  private timerId: any = null;
  private animFrameId: any = null;
  private startTime: number = 0;          // performance.now() 開始時間
  private countInDurationMs: number = 0;   // 預備拍總時長 (ms)
  private recordDurationMs: number = 0;    // 錄音總時長 (ms)
  private totalDurationMs: number = 0;     // 總時長 (ms)
  private msPerBeat: number = 500;
  private msPerBar: number = 2000;
  private lastTriggeredBeat: number = -1;

  // 錄製音符緩衝
  private activeNotes: Map<number, { startTick: number; velocity: number }> = new Map();
  private recordedNotes: RecordedNote[] = [];

  public getState(): PadRecorderState {
    return this.state;
  }

  public getRecordedNotes(): RecordedNote[] {
    return [...this.recordedNotes];
  }

  /**
   * 啟動錄音流程 (含預備拍節拍器)
   */
  public start(opts: Partial<PadRecorderOptions>): void {
    this.stop(); // 確保重置

    this.options = {
      bpm: Math.max(20, Math.min(300, opts.bpm ?? 120)),
      bars: Math.max(1, Math.min(16, opts.bars ?? 2)),
      timeSignature: opts.timeSignature ?? { numerator: 4, denominator: 4 },
      ppq: opts.ppq ?? 480,
      countInBars: opts.countInBars !== undefined ? opts.countInBars : 1,
      quantizeGrid: opts.quantizeGrid ?? '1/16',
      isAutoQuantize: opts.isAutoQuantize !== undefined ? opts.isAutoQuantize : true,
      onTick: opts.onTick ?? (() => {}),
      onStateChange: opts.onStateChange ?? (() => {}),
      onFinish: opts.onFinish ?? (() => {}),
    };

    const beatsPerBar = this.options.timeSignature.numerator;
    this.msPerBeat = (60 / this.options.bpm) * 1000;
    this.msPerBar = this.msPerBeat * beatsPerBar;
    this.countInDurationMs = this.msPerBar * this.options.countInBars;
    this.recordDurationMs = this.msPerBar * this.options.bars;
    this.totalDurationMs = this.countInDurationMs + this.recordDurationMs;

    this.activeNotes.clear();
    this.recordedNotes = [];
    this.lastTriggeredBeat = -1;
    this.startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (this.options.countInBars > 0) {
      this.setState('countingIn');
    } else {
      this.setState('recording');
    }

    this.runLoop();
  }

  /**
   * 手動停止錄音或強制結束
   */
  public stop(): void {
    if (this.animFrameId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animFrameId);
      }
      this.animFrameId = null;
    }
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.state === 'recording') {
      this.finalizeRecording();
    } else {
      this.setState('idle');
    }
  }

  /**
   * 接收外部 MIDI 或模擬 Note-On 事件
   */
  public handleNoteOn(pitch: number, velocity: number = 100): void {
    if (this.state !== 'recording') return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedRecordMs = now - (this.startTime + this.countInDurationMs);
    const rawTick = Math.max(0, Math.round((elapsedRecordMs / this.msPerBeat) * this.options.ppq));

    // 若同一音符重複按下，先閉合前一個
    if (this.activeNotes.has(pitch)) {
      this.handleNoteOff(pitch);
    }

    this.activeNotes.set(pitch, { startTick: rawTick, velocity });
  }

  /**
   * 接收外部 MIDI 或模擬 Note-Off 事件
   */
  public handleNoteOff(pitch: number): void {
    if (this.state !== 'recording') return;

    const active = this.activeNotes.get(pitch);
    if (!active) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedRecordMs = now - (this.startTime + this.countInDurationMs);
    const endTick = Math.max(active.startTick + 1, Math.round((elapsedRecordMs / this.msPerBeat) * this.options.ppq));
    const durationTick = Math.max(20, endTick - active.startTick);

    this.recordedNotes.push({
      pitch,
      velocity: active.velocity,
      startTick: active.startTick,
      durationTick,
    });

    this.activeNotes.delete(pitch);
  }

  /**
   * 內部時間推進主循環
   */
  private runLoop(): void {
    const update = () => {
      if (this.state === 'idle' || this.state === 'finished') return;

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = now - this.startTime;

      // 1. 狀態切換判定 (預備拍結束 ➔ 進入正式錄音)
      if (this.state === 'countingIn' && elapsed >= this.countInDurationMs) {
        this.setState('recording');
      }

      // 2. 錄音時間到 ➔ 自動停止與收尾
      if (elapsed >= this.totalDurationMs) {
        this.finalizeRecording();
        return;
      }

      // 3. 節拍排程觸發
      const totalBeatIndex = Math.floor(elapsed / this.msPerBeat);
      if (totalBeatIndex !== this.lastTriggeredBeat) {
        this.lastTriggeredBeat = totalBeatIndex;

        const beatsPerBar = this.options.timeSignature.numerator;
        const isCountIn = elapsed < this.countInDurationMs;
        const beatInBar = (totalBeatIndex % beatsPerBar) + 1;
        const currentBar = Math.floor(totalBeatIndex / beatsPerBar) + 1;
        const isDownbeat = beatInBar === 1;

        const progress = isCountIn
          ? elapsed / this.countInDurationMs
          : (elapsed - this.countInDurationMs) / this.recordDurationMs;

        this.options.onTick({
          beat: beatInBar,
          bar: currentBar,
          isDownbeat,
          isCountIn,
          progress: Math.min(1.0, Math.max(0.0, progress)),
        });
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        this.animFrameId = requestAnimationFrame(update);
      } else {
        this.timerId = setTimeout(update, 16);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animFrameId = requestAnimationFrame(update);
    } else {
      this.timerId = setTimeout(update, 16);
    }
  }

  /**
   * 結束錄音處理 (閉合未結束音符、量化與回呼)
   */
  private finalizeRecording(): void {
    const totalTicks = this.options.bars * this.options.timeSignature.numerator * this.options.ppq;

    // 閉合所有仍按住的琴鍵
    for (const [pitch, active] of this.activeNotes.entries()) {
      const durationTick = Math.max(20, totalTicks - active.startTick);
      this.recordedNotes.push({
        pitch,
        velocity: active.velocity,
        startTick: active.startTick,
        durationTick,
      });
    }
    this.activeNotes.clear();

    // 依起始時間排序
    this.recordedNotes.sort((a, b) => a.startTick - b.startTick);

    // 智慧量化
    if (this.options.isAutoQuantize && this.options.quantizeGrid !== 'off') {
      this.recordedNotes = PadRecorder.quantizeNotes(
        this.recordedNotes,
        this.options.quantizeGrid,
        this.options.ppq,
        totalTicks
      );
    }

    this.setState('finished');
    this.options.onFinish(this.getRecordedNotes());
  }

  private setState(newState: PadRecorderState): void {
    this.state = newState;
    this.options.onStateChange(newState);
  }

  /**
   * 2.8-B 將特定 Tick 吸附至量化網格 (支援 Straight 網格與 Swing 搖擺律動)
   */
  public static snapTickToGrid(tick: number, grid: QuantizeGrid, ppq: number = 480): number {
    if (grid === 'off') return Math.max(0, Math.round(tick));

    if (grid.startsWith('1/16-swing-')) {
      const ratio = grid === '1/16-swing-54' ? 0.54 : (grid === '1/16-swing-66' ? (2 / 3) : 0.60);
      const eighth = Math.round(ppq / 2);
      const eighthIndex = Math.floor(tick / eighth);
      const eighthStart = eighthIndex * eighth;
      const swungOffset = Math.round(eighth * ratio);

      const candidates = [
        eighthStart - eighth + swungOffset,
        eighthStart,
        eighthStart + swungOffset,
        eighthStart + eighth,
        eighthStart + eighth + swungOffset,
      ];

      let best = eighthStart;
      let minDiff = Infinity;
      for (const p of candidates) {
        if (p < 0) continue;
        const diff = Math.abs(tick - p);
        if (diff < minDiff) {
          minDiff = diff;
          best = p;
        }
      }
      return best;
    }

    if (grid === '1/8-swing-60') {
      const ratio = 0.60;
      const beatIndex = Math.floor(tick / ppq);
      const beatStart = beatIndex * ppq;
      const swungOffset = Math.round(ppq * ratio);

      const candidates = [
        beatStart - ppq + swungOffset,
        beatStart,
        beatStart + swungOffset,
        beatStart + ppq,
        beatStart + ppq + swungOffset,
      ];

      let best = beatStart;
      let minDiff = Infinity;
      for (const p of candidates) {
        if (p < 0) continue;
        const diff = Math.abs(tick - p);
        if (diff < minDiff) {
          minDiff = diff;
          best = p;
        }
      }
      return best;
    }

    const gridTicks = PadRecorder.getGridTicks(grid, ppq);
    if (gridTicks <= 0) return Math.max(0, Math.round(tick));
    return Math.max(0, Math.round(tick / gridTicks) * gridTicks);
  }

  /**
   * 2.8-B 計算指定網格之最小音符時值
   */
  public static getMinGridDuration(grid: QuantizeGrid, ppq: number = 480): number {
    switch (grid) {
      case '1/4': return ppq;
      case '1/8': return Math.round(ppq / 2);
      case '1/16': return Math.round(ppq / 4);
      case '1/32': return Math.round(ppq / 8);
      case '1/8T': return Math.round(ppq / 3);
      case '1/16T': return Math.round(ppq / 6);
      case '1/16-swing-54':
      case '1/16-swing-60':
      case '1/16-swing-66':
        return Math.round(ppq / 6);
      case '1/8-swing-60':
        return Math.round(ppq / 3);
      default: return Math.round(ppq / 4);
    }
  }

  /**
   * 智慧網格量化演算法 (Smart Quantization with Swing Support)
   */
  public static quantizeNotes(
    notes: RecordedNote[],
    grid: QuantizeGrid,
    ppq: number = 480,
    maxTicks: number = 3840
  ): RecordedNote[] {
    if (grid === 'off' || notes.length === 0) return [...notes];

    const isSwing = grid.includes('swing');
    const gridTicks = PadRecorder.getGridTicks(grid, ppq);
    const minDur = isSwing ? PadRecorder.getMinGridDuration(grid, ppq) : gridTicks;

    return notes.map((note) => {
      // 1. 起始拍吸附至最近網格點
      let qStart = PadRecorder.snapTickToGrid(note.startTick, grid, ppq);
      qStart = Math.max(0, Math.min(maxTicks - minDur, qStart));

      // 2. 音長吸附至最近網格長度 (最短為 minDur)
      let qDur: number;
      if (isSwing) {
        const snappedEnd = PadRecorder.snapTickToGrid(note.startTick + note.durationTick, grid, ppq);
        qDur = Math.max(minDur, snappedEnd - qStart);
      } else {
        qDur = Math.round(note.durationTick / gridTicks) * gridTicks;
        if (qDur < gridTicks) qDur = gridTicks;
      }
      if (qStart + qDur > maxTicks) qDur = Math.max(minDur, maxTicks - qStart);

      return {
        pitch: note.pitch,
        velocity: note.velocity,
        startTick: qStart,
        durationTick: qDur,
      };
    });
  }

  /**
   * 計算網格對應的 Tick 數
   */
  public static getGridTicks(grid: QuantizeGrid, ppq: number = 480): number {
    switch (grid) {
      case '1/4': return ppq;
      case '1/8': return Math.round(ppq / 2);
      case '1/16': return Math.round(ppq / 4);
      case '1/32': return Math.round(ppq / 8);
      case '1/8T': return Math.round(ppq / 3);
      case '1/16T': return Math.round(ppq / 6);
      case '1/16-swing-54':
      case '1/16-swing-60':
      case '1/16-swing-66':
        return Math.round(ppq / 4);
      case '1/8-swing-60':
        return Math.round(ppq / 2);
      default: return 0;
    }
  }

  /**
   * 將錄製之 RecordedNote[] 轉換為標準 NoteEvent[]
   */
  public static toNoteEvents(notes: RecordedNote[]): NoteEvent[] {
    return notes.map((n) => ({
      note: n.pitch,
      velocity: n.velocity,
      startTick: n.startTick,
      durationTick: n.durationTick,
    }));
  }
}
