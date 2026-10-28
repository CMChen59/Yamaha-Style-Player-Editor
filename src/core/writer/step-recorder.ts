/**
 * Yamaha PSR-SX920 步進錄音與單步音符/和弦輸入核心 (Step Input Recorder)
 * 負責單步時間軸游標推進、多音和弦聚合 (Chord Collector)、休止符 (Rest)、
 * 延音延長 (Tie)、單步撤銷 (Step Back) 與和弦名稱分析。
 */

import type { NoteEvent } from '../audio/audio-engine';

export type StepResolution = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/8T' | '1/16T';

export interface StepRecordEntry {
  type: 'notes' | 'rest';
  startTick: number;
  durationTick: number;
  notes: NoteEvent[];
  chordName?: string;
}

export interface StepRecorderOptions {
  ppq?: number;               // 預設 480
  timeSignature?: { numerator: number; denominator: number }; // 預設 4/4
  resolution?: StepResolution;// 預設 '1/4' (四分音符 / 1 拍)
  velocityMode?: 'as-played' | 'fixed';
  fixedVelocity?: number;     // 預設 100
  maxBars?: number;           // 最大長度 (預設 8 小節)
  onStepChange?: (entry: StepRecordEntry, currentTick: number) => void;
  onPositionChange?: (pos: { bar: number; beat: number; subBeat: number; tick: number; label: string }) => void;
}

export class StepRecorder {
  private ppq: number = 480;
  private timeSignature = { numerator: 4, denominator: 4 };
  private resolution: StepResolution = '1/4';
  private velocityMode: 'as-played' | 'fixed' = 'as-played';
  private fixedVelocity: number = 100;
  private maxBars: number = 8;

  private currentTick: number = 0;
  private history: StepRecordEntry[] = [];

  // 和弦聚合器狀態
  private heldNotes: Map<number, number> = new Map(); // pitch -> velocity
  private collectedChord: Map<number, number> = new Map(); // 本次步進收集到的所有音符
  private chordCommitTimer: any = null;

  private onStepChange: (entry: StepRecordEntry, currentTick: number) => void = () => {};
  private onPositionChange: (pos: { bar: number; beat: number; subBeat: number; tick: number; label: string }) => void = () => {};

  constructor(opts?: StepRecorderOptions) {
    if (opts) {
      this.configure(opts);
    }
  }

  public configure(opts: StepRecorderOptions): void {
    if (opts.ppq !== undefined) this.ppq = opts.ppq;
    if (opts.timeSignature !== undefined) this.timeSignature = opts.timeSignature;
    if (opts.resolution !== undefined) this.resolution = opts.resolution;
    if (opts.velocityMode !== undefined) this.velocityMode = opts.velocityMode;
    if (opts.fixedVelocity !== undefined) this.fixedVelocity = opts.fixedVelocity;
    if (opts.maxBars !== undefined) this.maxBars = opts.maxBars;
    if (opts.onStepChange !== undefined) this.onStepChange = opts.onStepChange;
    if (opts.onPositionChange !== undefined) this.onPositionChange = opts.onPositionChange;
  }

  public getMaxBars(): number {
    return this.maxBars;
  }

  public setMaxBars(bars: number): void {
    this.maxBars = Math.max(1, bars);
  }

  public getCurrentTick(): number {
    return this.currentTick;
  }

  public getResolution(): StepResolution {
    return this.resolution;
  }

  public setResolution(res: StepResolution): void {
    this.resolution = res;
  }

  public getHistory(): StepRecordEntry[] {
    return [...this.history];
  }

  /**
   * 取得目前步進設定對應的 Tick 數
   */
  public getStepTicks(resolution: StepResolution = this.resolution): number {
    switch (resolution) {
      case '1/1': return this.ppq * this.timeSignature.numerator; // 1 整小節
      case '1/2': return this.ppq * 2;                            // 2 拍 (二分音符)
      case '1/4': return this.ppq;                                // 1 拍 (四分音符)
      case '1/8': return Math.round(this.ppq / 2);                // 半拍 (八分音符)
      case '1/16': return Math.round(this.ppq / 4);               // 1/4 拍 (十六分音符)
      case '1/32': return Math.round(this.ppq / 8);               // 1/8 拍 (三十二分音符)
      case '1/8T': return Math.round(this.ppq / 3);               // 八分三連音
      case '1/16T': return Math.round(this.ppq / 6);              // 十六分三連音
      default: return this.ppq;
    }
  }

  /**
   * 計算當前 Tick 對應之小節、拍數與可讀標籤
   */
  public getPosition(tick: number = this.currentTick): {
    bar: number;
    beat: number;
    subBeat: number;
    tick: number;
    label: string;
  } {
    const ticksPerBeat = this.ppq;
    const ticksPerBar = ticksPerBeat * this.timeSignature.numerator;

    const bar = Math.floor(tick / ticksPerBar) + 1;
    const tickInBar = tick % ticksPerBar;
    const beat = Math.floor(tickInBar / ticksPerBeat) + 1;
    const tickInBeat = tickInBar % ticksPerBeat;
    const subBeat = Math.floor((tickInBeat / ticksPerBeat) * 4) + 1;

    const label = `第 ${bar} 小節 第 ${beat}.${subBeat} 拍`;
    return { bar, beat, subBeat, tick, label };
  }

  /**
   * 接收即時 Note-On 事件 (支援物理琴鍵與虛擬鍵盤)
   */
  public handleNoteOn(pitch: number, velocity: number = 100): void {
    const vel = this.velocityMode === 'fixed' ? this.fixedVelocity : Math.max(1, Math.min(127, velocity));
    this.heldNotes.set(pitch, vel);
    this.collectedChord.set(pitch, vel);

    // 重設和弦提交計時器 (若琴鍵連續按下，延遲提交等待所有音符到位)
    if (this.chordCommitTimer) {
      clearTimeout(this.chordCommitTimer);
      this.chordCommitTimer = null;
    }
  }

  /**
   * 接收即時 Note-Off 事件 (當所有琴鍵均放開時，提交本次步進和弦)
   */
  public handleNoteOff(pitch: number): void {
    this.heldNotes.delete(pitch);

    // 當手指全部放開琴鍵時，稍作 40ms 防抖緩衝後寫入本次步進和弦
    if (this.heldNotes.size === 0 && this.collectedChord.size > 0) {
      if (this.chordCommitTimer) {
        clearTimeout(this.chordCommitTimer);
      }
      this.chordCommitTimer = setTimeout(() => {
        this.commitCurrentChord();
      }, 35);
    }
  }

  /**
   * 強制或定時提交當前聚合之和弦
   */
  public commitCurrentChord(): StepRecordEntry | null {
    if (this.collectedChord.size === 0) return null;

    const stepTicks = this.getStepTicks();
    const pitches = Array.from(this.collectedChord.keys()).sort((a, b) => a - b);
    const chordName = StepRecorder.detectChordName(pitches);

    const notes: NoteEvent[] = pitches.map((pitch) => ({
      note: pitch,
      velocity: this.collectedChord.get(pitch) ?? 100,
      startTick: this.currentTick,
      durationTick: stepTicks,
    }));

    const entry: StepRecordEntry = {
      type: 'notes',
      startTick: this.currentTick,
      durationTick: stepTicks,
      notes,
      chordName,
    };

    this.history.push(entry);
    this.currentTick += stepTicks;
    this.collectedChord.clear();

    this.onStepChange(entry, this.currentTick);
    this.notifyPosition();

    return entry;
  }

  /**
   * 插入休止符 (Rest)：游標向前推進 1 步時值，不填入音符
   */
  public insertRest(): StepRecordEntry {
    const stepTicks = this.getStepTicks();
    const entry: StepRecordEntry = {
      type: 'rest',
      startTick: this.currentTick,
      durationTick: stepTicks,
      notes: [],
      chordName: '休止符 (Rest)',
    };

    this.history.push(entry);
    this.currentTick += stepTicks;

    this.onStepChange(entry, this.currentTick);
    this.notifyPosition();

    return entry;
  }

  /**
   * 延長前音 (Tie)：將前一個步進音符之時值延長 1 步，游標同步推進
   */
  public tiePreviousNote(): boolean {
    if (this.history.length === 0) return false;

    // 尋找最近一組有音符的步進
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item.type === 'notes' && item.notes.length > 0) {
        const stepTicks = this.getStepTicks();
        item.durationTick += stepTicks;
        for (const n of item.notes) {
          n.durationTick += stepTicks;
        }

        this.currentTick += stepTicks;
        this.onStepChange(item, this.currentTick);
        this.notifyPosition();
        return true;
      }
    }

    return false;
  }

  /**
   * 後退 1 步 (Step Back / Undo)：撤銷上一次操作，並將游標倒退回前一個拍位
   */
  public stepBack(): boolean {
    if (this.history.length === 0) {
      if (this.currentTick > 0) {
        const stepTicks = this.getStepTicks();
        this.currentTick = Math.max(0, this.currentTick - stepTicks);
        this.notifyPosition();
        return true;
      }
      return false;
    }

    const last = this.history.pop()!;
    this.currentTick = last.startTick;

    this.onStepChange(last, this.currentTick);
    this.notifyPosition();
    return true;
  }

  /**
   * 重設步進錄音器回初始狀態
   */
  public reset(): void {
    if (this.chordCommitTimer) {
      clearTimeout(this.chordCommitTimer);
      this.chordCommitTimer = null;
    }
    this.heldNotes.clear();
    this.collectedChord.clear();
    this.history = [];
    this.currentTick = 0;
    this.notifyPosition();
  }

  /**
   * 移動游標至指定 Tick 位置
   */
  public seekToTick(tick: number): void {
    this.currentTick = Math.max(0, Math.round(tick));
    this.notifyPosition();
  }

  /**
   * 提取所有已錄入的音符事件清單 (合規 NoteEvent[])
   */
  public getAllNoteEvents(): NoteEvent[] {
    const allNotes: NoteEvent[] = [];
    for (const entry of this.history) {
      if (entry.type === 'notes') {
        for (const n of entry.notes) {
          allNotes.push({ ...n });
        }
      }
    }
    return allNotes.sort((a, b) => a.startTick - b.startTick || a.note - b.note);
  }

  private notifyPosition(): void {
    const pos = this.getPosition();
    this.onPositionChange(pos);
  }

  /**
   * 音符轉音名輔助函式 (例如 60 ➔ 'C4', 64 ➔ 'E4')
   */
  public static noteNumberToName(note: number): string {
    const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(note / 12) - 1;
    const name = NAMES[note % 12];
    return `${name}${octave}`;
  }

  /**
   * 和弦名稱辨識核心 (Chord Recognition Engine)
   */
  public static detectChordName(pitches: number[]): string {
    if (pitches.length === 0) return '';
    if (pitches.length === 1) return StepRecorder.noteNumberToName(pitches[0]);

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const sorted = [...new Set(pitches.map((p) => p % 12))].sort((a, b) => a - b);
    const rootPitch = pitches[0];
    const rootName = NOTE_NAMES[rootPitch % 12];

    if (sorted.length === 2) {
      const interval = (pitches[1] - pitches[0] + 12) % 12;
      if (interval === 7) return `${rootName}5 (Power)`;
      if (interval === 4) return `${rootName} (大三度)`;
      if (interval === 3) return `${rootName}m (小三度)`;
      if (interval === 5) return `${rootName} (四度)`;
      return `${rootName} (${interval}度)`;
    }

    // 將半音相對音程正規化 (相對於根音)
    const intervals = pitches
      .map((p) => (p - rootPitch + 120) % 12)
      .sort((a, b) => a - b);
    const pattern = [...new Set(intervals)].join(',');

    const CHORD_PATTERNS: Record<string, string> = {
      '0,4,7': '',               // 大三和弦 (Major)
      '0,3,7': 'm',              // 小三和弦 (Minor)
      '0,4,8': 'aug',            // 增三和弦 (Augmented)
      '0,3,6': 'dim',            // 減三和弦 (Diminished)
      '0,2,7': 'sus2',           // 掛二和弦 (Suspended 2)
      '0,5,7': 'sus4',           // 掛四和弦 (Suspended 4)
      '0,4,7,10': '7',           // 屬七和弦 (Dominant 7)
      '0,4,7,11': 'maj7',        // 大七和弦 (Major 7)
      '0,3,7,10': 'm7',          // 小七和弦 (Minor 7)
      '0,3,6,9': 'dim7',         // 減七和弦 (Diminished 7)
      '0,3,6,10': 'm7b5',        // 半減七和弦 (Half-Diminished)
      '0,4,7,9': '6',            // 大六和弦 (Major 6)
      '0,3,7,9': 'm6',           // 小六和弦 (Minor 6)
      '0,4,7,14': 'add9',        // 加九和弦
    };

    const suffix = CHORD_PATTERNS[pattern];
    if (suffix !== undefined) {
      return `${rootName}${suffix}`;
    }

    // 兜合未列出之複音組合
    return `${rootName} 和弦 (${pitches.map(StepRecorder.noteNumberToName).join('/')})`;
  }
}
