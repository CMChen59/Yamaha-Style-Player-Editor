/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 16 格打擊樂步進網格元件 (Drum Step Grid)
 * 支援彈性更換樂器、自由新增樂器行、拍號 (4/4, 3/4, 6/8) 與網格精度 (1/16, 1/8) 切換。
 */

import { drumSynth } from './drum-synth';
import { YAMAHA_SX920_DRUM_KITS } from './drum-kits';

export interface DrumVoiceOption {
  note: number;
  name: string;
  subName: string;
  noteName: string;
  icon: string;
  color: string;
}

export const YAMAHA_DRUM_VOICES: DrumVoiceOption[] = [
  { note: 35, name: '大鼓 2 (Acoustic Kick)', subName: 'Acoustic Bass Drum', noteName: 'B0', icon: '🔊', color: '#38bdf8' },
  { note: 36, name: '大鼓 (Kick)', subName: 'Bass Drum', noteName: 'C1', icon: '🔊', color: '#38bdf8' },
  { note: 37, name: '敲框音 (Side Stick)', subName: 'Rimshot', noteName: 'C#1', icon: '🥢', color: '#eab308' },
  { note: 38, name: '小鼓 (Snare)', subName: 'Snare Drum', noteName: 'D1', icon: '🥁', color: '#f59e0b' },
  { note: 39, name: '拍手 (Clap)', subName: 'Hand Clap', noteName: 'D#1', icon: '👏', color: '#ec4899' },
  { note: 40, name: '電子小鼓 (Elec Snare)', subName: 'Electric Snare', noteName: 'E1', icon: '🥁', color: '#f59e0b' },
  { note: 41, name: '低音落地中鼓 (Low Floor Tom)', subName: 'Low Floor Tom', noteName: 'F1', icon: '🪘', color: '#a855f7' },
  { note: 42, name: '閉鈸 (Closed Hat)', subName: 'Closed Hi-Hat', noteName: 'F#1', icon: '💿', color: '#10b981' },
  { note: 43, name: '高音落地中鼓 (High Floor Tom)', subName: 'High Floor Tom', noteName: 'G1', icon: '🪘', color: '#a855f7' },
  { note: 44, name: '踩鈸踏板 (Pedal Hat)', subName: 'Pedal Hi-Hat', noteName: 'G#1', icon: '💿', color: '#10b981' },
  { note: 45, name: '低音中鼓 (Low Tom)', subName: 'Low Tom', noteName: 'A1', icon: '🪘', color: '#a855f7' },
  { note: 46, name: '開鈸 (Open Hat)', subName: 'Open Hi-Hat', noteName: 'A#1', icon: '📀', color: '#06b6d4' },
  { note: 47, name: '中音中鼓 (Mid Tom)', subName: 'Mid Tom', noteName: 'B1', icon: '🪘', color: '#d946ef' },
  { note: 48, name: '中音中鼓 2 (Hi-Mid Tom)', subName: 'Hi-Mid Tom', noteName: 'C2', icon: '🪘', color: '#d946ef' },
  { note: 49, name: '碎音鈸 (Crash)', subName: 'Crash Cymbal', noteName: 'C#2', icon: '🔔', color: '#f43f5e' },
  { note: 50, name: '高音中鼓 (High Tom)', subName: 'High Tom', noteName: 'D2', icon: '🪘', color: '#fb7185' },
  { note: 51, name: '叮叮鈸 (Ride)', subName: 'Ride Cymbal', noteName: 'D#2', icon: '🛎️', color: '#8b5cf6' },
  { note: 52, name: '中國鈸 (Chinese Cymbal)', subName: 'Chinese Cymbal', noteName: 'E2', icon: '🔔', color: '#f43f5e' },
  { note: 53, name: '叮叮鈸鐘音 (Ride Bell)', subName: 'Ride Bell', noteName: 'F2', icon: '🛎️', color: '#8b5cf6' },
  { note: 54, name: '鈴鼓 (Tambourine)', subName: 'Tambourine', noteName: 'F#2', icon: '🪇', color: '#e11d48' },
  { note: 55, name: '重音鈸 (Splash Cymbal)', subName: 'Splash Cymbal', noteName: 'G2', icon: '🔔', color: '#f43f5e' },
  { note: 56, name: '牛鈴 (Cowbell)', subName: 'Cowbell', noteName: 'G#2', icon: '🔔', color: '#fb923c' },
  { note: 69, name: '卡巴沙 (Cabasa)', subName: 'Cabasa', noteName: 'A3', icon: '🪇', color: '#10b981' },
  { note: 70, name: '沙錘 (Maracas)', subName: 'Maracas', noteName: 'A#3', icon: '🪇', color: '#10b981' },
];

export type GridResolution = '1/16' | '1/8';
export type TimeSignatureType = '4/4' | '3/4' | '6/8';

/**
 * Yamaha 標準常用預設鼓組 6 大核心樂器 (依鋼琴捲軸音高由高至低自然排列)
 */
export function getStandardDefaultDrumVoices(): DrumVoiceOption[] {
  return [
    YAMAHA_DRUM_VOICES.find(v => v.note === 49)!, // 碎音鈸 Crash (49)
    YAMAHA_DRUM_VOICES.find(v => v.note === 51)!, // 叮叮鈸 Ride (51)
    YAMAHA_DRUM_VOICES.find(v => v.note === 46)!, // 開鈸 Open Hat (46)
    YAMAHA_DRUM_VOICES.find(v => v.note === 42)!, // 閉鈸 Closed Hat (42)
    YAMAHA_DRUM_VOICES.find(v => v.note === 38)!, // 小鼓 Snare (38)
    YAMAHA_DRUM_VOICES.find(v => v.note === 36)!, // 大鼓 Kick (36)
  ].filter(Boolean);
}

export class DrumStepGrid {
  private totalBars: number = 4;
  private timeSignature: TimeSignatureType = '4/4';
  private resolution: GridResolution = '1/16';
  private container: HTMLElement;

  // 緊湊模式旗標：預設為 true (僅顯示該段落有音符之樂器行，徹底隱藏未使用之空白行)
  private isCompactMode: boolean = true;

  // 當前畫面上啟用的打擊樂行
  private activeVoices: DrumVoiceOption[] = getStandardDefaultDrumVoices();

  // 步進狀態記錄：note -> boolean[] (長度 = totalBars * stepsPerBar)
  private pattern: Map<number, boolean[]> = new Map();
  private selectedKitId: string = 'standard-kit-1';
  private onPatternChange?: () => void;
  private onTriggerNote?: (note: number, velocity: number) => void;
  private onResolutionChange?: (res: GridResolution) => void;
  private onTimeSignatureChange?: (sig: TimeSignatureType) => void;
  private onDrumKitChange?: (kitId: string) => void;
  private onSoloPlayToggle?: () => void;

  constructor(
    container: HTMLElement,
    totalBars: number = 4,
    onPatternChange?: () => void,
    onTriggerNote?: (note: number, velocity: number) => void,
    onResolutionChange?: (res: GridResolution) => void,
    onTimeSignatureChange?: (sig: TimeSignatureType) => void,
    onDrumKitChange?: (kitId: string) => void,
    initialKitId: string = 'standard-kit-1',
    onSoloPlayToggle?: () => void
  ) {
    this.container = container;
    this.totalBars = totalBars;
    this.onPatternChange = onPatternChange;
    this.onTriggerNote = onTriggerNote;
    this.onResolutionChange = onResolutionChange;
    this.onTimeSignatureChange = onTimeSignatureChange;
    this.onDrumKitChange = onDrumKitChange;
    this.selectedKitId = initialKitId;
    this.onSoloPlayToggle = onSoloPlayToggle;

    this.initPattern();
    this.render();
  }

  public setSoloPlayState(isPlaying: boolean) {
    const btn = this.container.querySelector('#btn-drum-play') as HTMLButtonElement | null;
    if (btn) {
      if (isPlaying) {
        btn.innerHTML = '<span>⏸</span> 暫停試聽';
        btn.classList.add('playing');
      } else {
        btn.innerHTML = '<span>▶</span> 試聽鼓組';
        btn.classList.remove('playing');
      }
    }
  }

  public setSelectedKitId(kitId: string): void {
    if (this.selectedKitId === kitId) return;
    this.selectedKitId = kitId;
    const selectKit = this.container.querySelector('#select-drum-kit') as HTMLSelectElement | null;
    if (selectKit) {
      selectKit.value = kitId;
    }
  }

  public getSelectedKitId(): string {
    return this.selectedKitId;
  }

  public playSound(note: number, velocity: number = 100) {
    drumSynth.playNote(note, velocity);
    this.onTriggerNote?.(note, velocity);
  }

  /**
   * 計算每小節的步進格數
   * - 4/4 拍: 1/16 模式為 16 格 (4 拍 * 4 格)；1/8 模式為 8 格 (4 拍 * 2 格)
   * - 3/4 拍: 1/16 模式為 12 格 (3 拍 * 4 格)；1/8 模式為 6 格 (3 拍 * 2 格)
   * - 6/8 拍: 固定 6 格 (6 個 8 分音符)
   */
  public getStepsPerBar(): number {
    if (this.timeSignature === '6/8') {
      return 6;
    }
    const beats = this.timeSignature === '3/4' ? 3 : 4;
    return this.resolution === '1/16' ? beats * 4 : beats * 2;
  }

  public getStepsPerBeat(): number {
    if (this.timeSignature === '6/8') return 3; // 2 大拍，每拍 3 個 8 分音符
    return this.resolution === '1/16' ? 4 : 2;
  }

  public getBeatsPerBar(): number {
    if (this.timeSignature === '6/8') return 2;
    return this.timeSignature === '3/4' ? 3 : 4;
  }

  public getTimeSignatureObject(): { numerator: number; denominator: number } {
    if (this.timeSignature === '3/4') return { numerator: 3, denominator: 4 };
    if (this.timeSignature === '6/8') return { numerator: 6, denominator: 8 };
    return { numerator: 4, denominator: 4 };
  }

  public getResolution(): GridResolution {
    return this.resolution;
  }

  public getTimeSignatureType(): TimeSignatureType {
    return this.timeSignature;
  }

  private initPattern() {
    const totalSteps = this.totalBars * this.getStepsPerBar();
    for (const inst of this.activeVoices) {
      if (!this.pattern.has(inst.note)) {
        this.pattern.set(inst.note, new Array(totalSteps).fill(false));
      } else {
        const current = this.pattern.get(inst.note)!;
        if (current.length < totalSteps) {
          this.pattern.set(inst.note, [...current, ...new Array(totalSteps - current.length).fill(false)]);
        } else if (current.length > totalSteps) {
          this.pattern.set(inst.note, current.slice(0, totalSteps));
        }
      }
    }
  }

  public setTotalBars(bars: number) {
    if (this.totalBars === bars) return;
    this.totalBars = bars;
    this.initPattern();
    this.render();
  }

  public setResolution(res: GridResolution) {
    if (this.resolution === res) return;
    const oldRes = this.resolution;
    this.resolution = res;

    // 智能轉換音符位置 (1/16 <-> 1/8)，不遺失已編好的鼓點
    const newTotalSteps = this.totalBars * this.getStepsPerBar();
    const newPattern = new Map<number, boolean[]>();

    this.pattern.forEach((arr, note) => {
      const newArr = new Array(newTotalSteps).fill(false);
      for (let s = 0; s < arr.length; s++) {
        if (arr[s]) {
          if (oldRes === '1/16' && res === '1/8') {
            const mappedStep = Math.round(s / 2);
            if (mappedStep < newTotalSteps) newArr[mappedStep] = true;
          } else if (oldRes === '1/8' && res === '1/16') {
            const mappedStep = s * 2;
            if (mappedStep < newTotalSteps) newArr[mappedStep] = true;
          }
        }
      }
      newPattern.set(note, newArr);
    });

    this.pattern = newPattern;
    this.initPattern();
    this.render();
  }

  public setTimeSignature(sig: TimeSignatureType) {
    if (this.timeSignature === sig) return;
    this.timeSignature = sig;
    this.initPattern();
    this.render();
  }

  /**
   * 取得當前完整的鼓點 Pattern 狀態副本 (供段落切換儲存)
   */
  public getPatternData(): Map<number, boolean[]> {
    const copy = new Map<number, boolean[]>();
    this.pattern.forEach((arr, note) => copy.set(note, [...arr]));
    return copy;
  }

  /**
   * 切換選擇的鼓組 ID
   */
  public setSelectedDrumKit(kitId: string) {
    this.selectedKitId = kitId;
    const select = this.container.querySelector('#select-drum-kit') as HTMLSelectElement | null;
    if (select) select.value = kitId;
  }

  /**
   * 載入指定的鼓點 Pattern 狀態 (供段落切換恢復)
   * 支援智慧緊湊模式：自動僅顯示有音符的樂器行，徹底隱藏未使用之空白行
   */
  public setPatternData(data: Map<number, boolean[]>): void {
    this.pattern = new Map();

    // 找出該 Pattern 中真正有音符 (至少一步進為 true) 的打擊樂器
    const activeNotes: number[] = [];
    data.forEach((arr, note) => {
      if (arr && arr.some(Boolean)) {
        activeNotes.push(note);
      }
    });

    if (this.isCompactMode) {
      if (activeNotes.length > 0) {
        // 緊湊模式且有音符：僅保留有使用到的打擊樂器，依音高由高至低自然排列 (鈸在上、大鼓在下)
        const voices: DrumVoiceOption[] = [];
        for (const note of activeNotes) {
          const found = YAMAHA_DRUM_VOICES.find(v => v.note === note) || {
            note,
            name: `打擊音 (${note})`,
            subName: `Percussion ${note}`,
            noteName: `N${note}`,
            icon: '🥁',
            color: '#94a3b8'
          };
          voices.push(found);
        }
        voices.sort((a, b) => b.note - a.note);
        this.activeVoices = voices;
      } else {
        // 完全無音符的全新空段落：顯示乾淨的 4 個核心常用樂器 (Crash, Closed Hat, Snare, Kick)
        this.activeVoices = [
          YAMAHA_DRUM_VOICES.find(v => v.note === 49)!,
          YAMAHA_DRUM_VOICES.find(v => v.note === 42)!,
          YAMAHA_DRUM_VOICES.find(v => v.note === 38)!,
          YAMAHA_DRUM_VOICES.find(v => v.note === 36)!,
        ].filter(Boolean);
      }
    } else {
      // 展開模式：標準鼓組 + 額外有打點的樂器
      const defaultVoices = getStandardDefaultDrumVoices();
      const combinedNotes = new Set<number>([
        ...defaultVoices.map(v => v.note),
        ...activeNotes
      ]);
      const voices: DrumVoiceOption[] = [];
      combinedNotes.forEach(note => {
        const found = YAMAHA_DRUM_VOICES.find(v => v.note === note) || {
          note,
          name: `打擊音 (${note})`,
          subName: `Percussion ${note}`,
          noteName: `N${note}`,
          icon: '🥁',
          color: '#94a3b8'
        };
        voices.push(found);
      });
      voices.sort((a, b) => b.note - a.note);
      this.activeVoices = voices;
    }

    // 將傳入資料拷貝至 pattern
    data.forEach((arr, note) => {
      this.pattern.set(note, [...arr]);
    });

    this.initPattern();
    this.render();
    this.onPatternChange?.();
  }

  /**
   * 重置為預設的常用核心打擊樂器
   */
  public resetToDefaultVoices(): void {
    this.activeVoices = getStandardDefaultDrumVoices();
    this.pattern.clear();
    this.initPattern();
    this.render();
    this.onPatternChange?.();
  }

  /**
   * 一鍵清理移除當前所有無打點的空白樂器行
   */
  public pruneEmptyRows(): void {
    const hasNotesVoices = this.activeVoices.filter(v => {
      const steps = this.pattern.get(v.note);
      return steps && steps.some(Boolean);
    });

    if (hasNotesVoices.length > 0) {
      this.activeVoices = hasNotesVoices;
      const activeSet = new Set(hasNotesVoices.map(v => v.note));
      for (const note of Array.from(this.pattern.keys())) {
        if (!activeSet.has(note) && !this.pattern.get(note)?.some(Boolean)) {
          this.pattern.delete(note);
        }
      }
    } else {
      this.activeVoices = [
        YAMAHA_DRUM_VOICES.find(v => v.note === 49)!,
        YAMAHA_DRUM_VOICES.find(v => v.note === 42)!,
        YAMAHA_DRUM_VOICES.find(v => v.note === 38)!,
        YAMAHA_DRUM_VOICES.find(v => v.note === 36)!,
      ].filter(Boolean);
    }

    this.render();
    this.onPatternChange?.();
  }

  /**
   * 切換緊湊模式 (僅顯示使用中) 與標準完整鼓組模式
   */
  public toggleCompactMode(): void {
    this.isCompactMode = !this.isCompactMode;
    if (this.isCompactMode) {
      this.pruneEmptyRows();
    } else {
      const defaultVoices = getStandardDefaultDrumVoices();
      for (const v of defaultVoices) {
        if (!this.activeVoices.some(av => av.note === v.note)) {
          this.activeVoices.push(v);
        }
      }
      this.activeVoices.sort((a, b) => b.note - a.note);
      this.initPattern();
      this.render();
      this.onPatternChange?.();
    }
  }

  public getIsCompactMode(): boolean {
    return this.isCompactMode;
  }

  /**
   * 更換指定行的打擊樂器
   */
  public changeRowVoice(rowIndex: number, newNote: number) {
    const newVoice = YAMAHA_DRUM_VOICES.find(v => v.note === newNote);
    if (!newVoice || rowIndex < 0 || rowIndex >= this.activeVoices.length) return;

    const oldNote = this.activeVoices[rowIndex].note;
    this.activeVoices[rowIndex] = newVoice;

    // 搬移已點的音符到新 note 上
    if (oldNote !== newNote) {
      const oldSteps = this.pattern.get(oldNote);
      if (oldSteps) {
        this.pattern.set(newNote, oldSteps);
        this.pattern.delete(oldNote);
      }
    }

    this.render();
    this.onPatternChange?.();
  }

  /**
   * 新增一行打擊樂器
   */
  public addVoiceRow(note: number) {
    if (this.activeVoices.some(v => v.note === note)) return;
    const voice = YAMAHA_DRUM_VOICES.find(v => v.note === note) || {
      note,
      name: `打擊音 (${note})`,
      subName: `Percussion ${note}`,
      noteName: `N${note}`,
      icon: '🥁',
      color: '#94a3b8'
    };

    this.activeVoices.push(voice);
    this.activeVoices.sort((a, b) => b.note - a.note); // 維持由高音至低音整齊排列
    const totalSteps = this.totalBars * this.getStepsPerBar();
    if (!this.pattern.has(note)) {
      this.pattern.set(note, new Array(totalSteps).fill(false));
    }

    this.render();
    this.onPatternChange?.();
  }

  /**
   * 移除指定行打擊樂器
   */
  public removeVoiceRow(rowIndex: number) {
    if (this.activeVoices.length <= 1) {
      alert('請至少保留一行打擊樂器！');
      return;
    }
    const removed = this.activeVoices.splice(rowIndex, 1)[0];
    this.pattern.delete(removed.note);
    this.render();
    this.onPatternChange?.();
  }

  /**
   * 核心功能：將第 1 小節一鍵鋪滿至後續所有小節
   * 嚴格覆蓋式複製，確保後續小節與第 1 小節 100% 完全一致
   */
  public cloneFirstBar(): void {
    const stepsPerBar = this.getStepsPerBar();
    this.pattern.forEach((steps) => {
      const bar1 = steps.slice(0, stepsPerBar);
      for (let bar = 1; bar < this.totalBars; bar++) {
        for (let s = 0; s < stepsPerBar; s++) {
          steps[bar * stepsPerBar + s] = bar1[s];
        }
      }
    });
    this.render();
    this.onPatternChange?.();
  }

  /**
   * 清除全部格子
   */
  public clear(): void {
    const totalSteps = this.totalBars * this.getStepsPerBar();
    for (const inst of this.activeVoices) {
      this.pattern.set(inst.note, new Array(totalSteps).fill(false));
    }
    this.render();
    this.onPatternChange?.();
  }

  /**
   * 取得用於匯出 STY 的音符清單
   */
  public getMidiEvents(ticksPerBar: number = 1920): Array<{ note: number; startTick: number; durationTick: number; velocity: number }> {
    const events: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
    const stepsPerBar = this.getStepsPerBar();
    const ticksPerStep = Math.round(ticksPerBar / stepsPerBar);

    for (const inst of this.activeVoices) {
      const steps = this.pattern.get(inst.note) || [];
      for (let s = 0; s < steps.length; s++) {
        if (steps[s]) {
          events.push({
            note: inst.note,
            startTick: s * ticksPerStep,
            durationTick: Math.max(1, Math.round(ticksPerStep * 0.8)),
            velocity: 100,
          });
        }
      }
    }

    events.sort((a, b) => a.startTick - b.startTick);
    return events;
  }

  public hasNotes(): boolean {
    for (const steps of this.pattern.values()) {
      if (steps.some(Boolean)) return true;
    }
    return false;
  }

  public getActiveNotesAtStep(stepIndex: number): number[] {
    const active: number[] = [];
    for (const inst of this.activeVoices) {
      const steps = this.pattern.get(inst.note);
      if (steps && steps[stepIndex]) {
        active.push(inst.note);
      }
    }
    return active;
  }

  public setPlayheadStep(stepIndex: number | null): void {
    const prev = this.container.querySelectorAll('.step-cell.active-playhead, .step-header-cell.active-playhead');
    prev.forEach(el => el.classList.remove('active-playhead'));

    if (stepIndex !== null && stepIndex >= 0) {
      const current = this.container.querySelectorAll(`[data-step="${stepIndex}"]`);
      current.forEach(el => el.classList.add('active-playhead'));
    }
  }

  /**
   * 渲染完整步進網格
   */
  public render(): void {
    this.container.innerHTML = '';

    const stepsPerBar = this.getStepsPerBar();
    const beatsPerBar = this.getBeatsPerBar();
    const stepsPerBeat = this.getStepsPerBeat();

    // 建立外層滾動容器
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'grid-scroll-wrapper';

    // 1. 建立頂部控制輔助列 (Toolbar / Add voice / Resolution switch / Drum Kit)
    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';
    toolbar.innerHTML = `
      <div class="grid-toolbar-left">
        <label style="font-size: 0.82rem; color: #94a3b8; font-weight: 600;">拍號:</label>
        <select id="grid-time-sig-select" class="grid-select">
          <option value="4/4" ${this.timeSignature === '4/4' ? 'selected' : ''}>4/4 拍 (標準)</option>
          <option value="3/4" ${this.timeSignature === '3/4' ? 'selected' : ''}>3/4 拍 (華爾滋)</option>
          <option value="6/8" ${this.timeSignature === '6/8' ? 'selected' : ''}>6/8 拍 (三連慢搖)</option>
        </select>

        <label style="font-size: 0.82rem; color: #94a3b8; font-weight: 600;">解析度:</label>
        <select id="grid-res-select" class="grid-select">
          <option value="1/16" ${this.resolution === '1/16' ? 'selected' : ''}>1/16 (細緻)</option>
          <option value="1/8" ${this.resolution === '1/8' ? 'selected' : ''}>1/8 (簡潔)</option>
        </select>

        <div class="drum-kit-selector-wrap" style="margin-left: 4px;">
          <label for="select-drum-kit" class="control-label">🥁 琴端鼓組:</label>
          <select id="select-drum-kit" class="kit-select-input" title="選擇匯出與琴端監聽使用的 Yamaha 原廠鼓組套件">
            ${YAMAHA_SX920_DRUM_KITS.map(k => `
              <option value="${k.id}" ${k.id === this.selectedKitId ? 'selected' : ''}>
                ${k.icon} ${k.name} (PC ${k.panelPc} / Bank ${k.msb}-${k.lsb})
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="grid-toolbar-right">
        <button id="btn-drum-play" class="btn-grid-tool btn-track-play" title="單獨循環試聽鼓組 (Solo)">
          <span>▶</span> 試聽鼓組
        </button>
        <button id="btn-toggle-compact" class="btn-grid-tool ${this.isCompactMode ? 'btn-tool-active' : ''}" title="${this.isCompactMode ? '目前為緊湊模式（僅顯示該段落有音符之樂器）。點擊可切換顯示常用鼓組。' : '目前為展開模式（顯示常用標準鼓組）。點擊切換為緊湊模式。'}">
          <span>${this.isCompactMode ? '👁️' : '📑'}</span> ${this.isCompactMode ? '僅顯示使用中' : '顯示完整鼓組'}
        </button>
        <button id="btn-prune-empty" class="btn-grid-tool" title="一鍵清理移除當前段落所有無打點的空白樂器行">
          <span>🧹</span> 清理空白行
        </button>
        <button id="btn-add-drum-row" class="btn-grid-tool" title="加入新的打擊樂器軌道">
          <span>➕</span> 加入打擊樂器
        </button>
        <button id="btn-drum-clone" class="btn-grid-tool" title="將第 1 小節鼓點一鍵鋪滿至全部小節">
          <span>⚡</span> 一鍵鋪滿 ${this.totalBars} 小節
        </button>
        <button id="btn-clear-grid" class="btn-grid-tool btn-grid-clear" title="清除所有鼓點音符">
          <span>🗑️</span> 清空鼓組
        </button>
      </div>
    `;
    this.container.appendChild(toolbar);

    // 綁定工具列事件
    const selectSig = toolbar.querySelector('#grid-time-sig-select') as HTMLSelectElement | null;
    selectSig?.addEventListener('change', () => {
      const sig = selectSig.value as TimeSignatureType;
      this.setTimeSignature(sig);
      this.onTimeSignatureChange?.(sig);
    });

    const selectRes = toolbar.querySelector('#grid-res-select') as HTMLSelectElement | null;
    selectRes?.addEventListener('change', () => {
      const res = selectRes.value as GridResolution;
      this.setResolution(res);
      this.onResolutionChange?.(res);
    });

    const selectKit = toolbar.querySelector('#select-drum-kit') as HTMLSelectElement | null;
    selectKit?.addEventListener('change', () => {
      this.selectedKitId = selectKit.value;
      this.onDrumKitChange?.(selectKit.value);
    });

    const btnPlay = toolbar.querySelector('#btn-drum-play') as HTMLButtonElement | null;
    btnPlay?.addEventListener('click', () => this.onSoloPlayToggle?.());

    const btnToggleCompact = toolbar.querySelector('#btn-toggle-compact') as HTMLButtonElement | null;
    btnToggleCompact?.addEventListener('click', () => this.toggleCompactMode());

    const btnPruneEmpty = toolbar.querySelector('#btn-prune-empty') as HTMLButtonElement | null;
    btnPruneEmpty?.addEventListener('click', () => this.pruneEmptyRows());

    const btnAdd = toolbar.querySelector('#btn-add-drum-row') as HTMLButtonElement | null;
    btnAdd?.addEventListener('click', () => this.openAddVoiceModal());

    const btnClone = toolbar.querySelector('#btn-drum-clone') as HTMLButtonElement | null;
    btnClone?.addEventListener('click', () => this.cloneFirstBar());

    const btnClear = toolbar.querySelector('#btn-clear-grid') as HTMLButtonElement | null;
    btnClear?.addEventListener('click', () => {
      if (confirm('確定要清空所有已點選的鼓點嗎？')) {
        this.clear();
      }
    });

    // 2. 建立拍子指示列 (Header Row)
    const headerRow = document.createElement('div');
    headerRow.className = 'grid-row grid-header-row';

    const headerLabelCell = document.createElement('div');
    headerLabelCell.className = 'row-header-label';
    headerLabelCell.innerHTML = `<span style="font-size: 0.82rem; color: #38bdf8; font-weight: 700;">🥁 打擊樂器 / 拍子</span>`;
    headerRow.appendChild(headerLabelCell);

    const headerStepsContainer = document.createElement('div');
    headerStepsContainer.className = 'steps-container';

    for (let bar = 0; bar < this.totalBars; bar++) {
      const barGroup = document.createElement('div');
      barGroup.className = 'bar-group';

      for (let beat = 0; beat < beatsPerBar; beat++) {
        const beatGroup = document.createElement('div');
        beatGroup.className = 'beat-group';

        for (let sub = 0; sub < stepsPerBeat; sub++) {
          const stepIdx = bar * stepsPerBar + beat * stepsPerBeat + sub;
          const stepHeader = document.createElement('div');
          const subClass = sub === 0 ? 'beat-start eighth-cell' : (sub === 2 && stepsPerBeat === 4 ? 'eighth-offbeat eighth-cell' : (stepsPerBeat === 4 ? 'sixteenth-cell' : ''));
          stepHeader.className = `step-header-cell ${subClass}`;
          stepHeader.dataset.step = `${stepIdx}`;

          if (sub === 0) {
            stepHeader.innerHTML = `<span class="beat-num">${beat + 1}</span>`;
          } else if (sub === 2 && stepsPerBeat === 4) {
            stepHeader.innerHTML = `<span class="eighth-num">&</span>`;
          } else {
            stepHeader.innerHTML = `<span class="sub-dot">·</span>`;
          }
          beatGroup.appendChild(stepHeader);
        }
        barGroup.appendChild(beatGroup);
      }
      headerStepsContainer.appendChild(barGroup);
    }
    headerRow.appendChild(headerStepsContainer);
    scrollWrapper.appendChild(headerRow);

    // 3. 建立各打擊樂行
    this.activeVoices.forEach((inst, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'grid-row drum-row';
      row.dataset.note = `${inst.note}`;

      // 樂器標籤欄 (左側)
      const labelCol = document.createElement('div');
      labelCol.className = 'row-header-label';

      // 樂器選擇下拉選單
      let voiceOptionsHtml = '';
      for (const v of YAMAHA_DRUM_VOICES) {
        voiceOptionsHtml += `<option value="${v.note}" ${v.note === inst.note ? 'selected' : ''}>${v.icon} ${v.name} (${v.noteName})</option>`;
      }

      labelCol.innerHTML = `
        <div class="inst-info-wrap">
          <div class="inst-name-row">
            <span class="inst-icon">${inst.icon}</span>
            <select class="inst-voice-select" data-row-index="${rowIndex}" title="更換樂器">
              ${voiceOptionsHtml}
            </select>
          </div>
          <div class="inst-sub">
            <div class="inst-sub-left">
              <span class="inst-preview-tag" data-note="${inst.note}" title="點擊試聽發聲">🔊 試聽</span>
              <button class="btn-remove-row" data-row-index="${rowIndex}" title="從工作台移除此打擊樂器">🗑️ 刪除</button>
            </div>
            <span class="inst-note-badge-small" style="color: ${inst.color}; font-weight: 700; font-family: monospace;">${inst.noteName} (MIDI ${inst.note})</span>
          </div>
        </div>
      `;

      // 監聽更換樂器
      const voiceSelect = labelCol.querySelector('.inst-voice-select') as HTMLSelectElement | null;
      voiceSelect?.addEventListener('change', (e) => {
        e.stopPropagation();
        const newNote = parseInt(voiceSelect.value, 10);
        this.changeRowVoice(rowIndex, newNote);
      });

      // 監聽移除行
      const btnRemove = labelCol.querySelector('.btn-remove-row') as HTMLButtonElement | null;
      btnRemove?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeVoiceRow(rowIndex);
      });

      // 監聽試聽按鈕
      const btnPreview = labelCol.querySelector('.inst-preview-tag') as HTMLElement | null;
      btnPreview?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playSound(inst.note);
      });

      row.appendChild(labelCol);

      // 格子區域
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'steps-container';

      const stepsData = this.pattern.get(inst.note) || new Array(this.totalBars * stepsPerBar).fill(false);

      for (let bar = 0; bar < this.totalBars; bar++) {
        const barGroup = document.createElement('div');
        barGroup.className = 'bar-group';
        barGroup.dataset.bar = `${bar + 1}`;

        for (let beat = 0; beat < beatsPerBar; beat++) {
          const beatGroup = document.createElement('div');
          beatGroup.className = `beat-group ${beat % 2 === 0 ? 'beat-even' : 'beat-odd'}`;

          for (let sub = 0; sub < stepsPerBeat; sub++) {
            const stepIdx = bar * stepsPerBar + beat * stepsPerBeat + sub;
            const isFilled = stepsData[stepIdx];

            const cell = document.createElement('div');
            const subClass = sub === 0 ? 'beat-start eighth-cell' : (sub === 2 && stepsPerBeat === 4 ? 'eighth-offbeat eighth-cell' : (stepsPerBeat === 4 ? 'sixteenth-cell' : ''));
            cell.className = `step-cell ${isFilled ? 'step-active' : ''} ${subClass}`;
            cell.dataset.step = `${stepIdx}`;
            cell.dataset.note = `${inst.note}`;

            if (isFilled) {
              cell.style.backgroundColor = inst.color;
              cell.style.boxShadow = `0 0 10px ${inst.color}88`;
            }

            // 點擊事件：切換狀態 + 發聲
            cell.addEventListener('click', () => {
              const nextState = !stepsData[stepIdx];
              stepsData[stepIdx] = nextState;

              if (nextState) {
                cell.classList.add('step-active');
                cell.style.backgroundColor = inst.color;
                cell.style.boxShadow = `0 0 10px ${inst.color}88`;
                this.playSound(inst.note);
              } else {
                cell.classList.remove('step-active');
                cell.style.backgroundColor = '';
                cell.style.boxShadow = '';
              }

              this.onPatternChange?.();
            });

            beatGroup.appendChild(cell);
          }
          barGroup.appendChild(beatGroup);
        }
        stepsContainer.appendChild(barGroup);
      }

      row.appendChild(stepsContainer);
      scrollWrapper.appendChild(row);
    });

    this.container.appendChild(scrollWrapper);
  }

  private openAddVoiceModal() {
    const unadded = YAMAHA_DRUM_VOICES.filter(v => !this.activeVoices.some(av => av.note === v.note));
    if (unadded.length === 0) {
      alert('所有 Yamaha 標準打擊樂器皆已加入至網格中！');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'custom-drum-modal-overlay';
    modal.innerHTML = `
      <div class="custom-drum-modal">
        <h3 style="margin-bottom: 12px; color: #fff;">➕ 加入打擊樂器</h3>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 16px;">選擇要加入排點網格的 Yamaha PSR-SX920 打擊樂器：</p>
        <div class="voice-picker-list">
          ${unadded.map(v => `
            <div class="voice-picker-item" data-note="${v.note}">
              <span style="font-size: 1.3rem;">${v.icon}</span>
              <div>
                <div style="font-weight: 700; color: #fff;">${v.name}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">${v.subName} (${v.noteName} / MIDI ${v.note})</div>
              </div>
              <button class="btn-picker-add" data-note="${v.note}">加入工作台</button>
            </div>
          `).join('')}
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
          <button id="btn-close-modal" style="padding: 6px 16px; background: #475569; color: #fff; border: none; border-radius: 6px; cursor: pointer;">關閉</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-close-modal')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.querySelectorAll('.btn-picker-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const note = parseInt((e.target as HTMLElement).dataset.note || '0', 10);
        if (note > 0) {
          this.addVoiceRow(note);
          document.body.removeChild(modal);
        }
      });
    });
  }
}
