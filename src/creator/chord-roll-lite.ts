/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 和弦鋼琴捲軸元件 (Chord Roll Lite - Channel 12)
 * 專為 PSR-SX920 伴奏風格 SFF2 CASM (Chd1Main, NTT = Chord, RTR = Normal) 量身打造
 * 支援多音複音 (Polyphony)、C 大調安全和弦導引 (C 根音、G 五度音、E 三度音高亮)
 * 音域涵蓋 C3 (48) 至 C5 (72) 共 2 個八度 25 個半音
 */

import { ChordSynth } from './chord-synth';
import type { GridResolution, TimeSignatureType } from './drum-step-grid';
import { YAMAHA_SX920_CHORD_VOICES, type YamahaChordPreset } from './chord-voices';

export interface ChordPitchInfo {
  note: number;      // MIDI 音高 (例如 60 = C4)
  name: string;      // 音名 (例如 C4)
  isBlack: boolean;  // 是否為黑鍵
  role?: 'root' | 'fifth' | 'third' | 'seventh';
  roleLabel?: string;
}

export type ChordRollMode = 'safe-c' | 'full-chromatic';

export interface ChordTrackConfig {
  trackId: string;
  partId: 'Chord1' | 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2';
  title: string;
  icon: string;
  channel: number; // 0-indexed MIDI channel (11 for Ch 12, 12 for Ch 13, 13 for Ch 14, 14 for Ch 15, 15 for Ch 16)
  panelCh: number; // 1-based display channel (12, 13, 14, 15, 16)
  defaultVoiceId: string;
  badgeText?: string;
  canRemove?: boolean;
  onRemoveTrack?: () => void;
}

export const DEFAULT_CHORD1_CONFIG: ChordTrackConfig = {
  trackId: 'chord1',
  partId: 'Chord1',
  title: '和弦音軌 (Chord 1 - Ch 12)',
  icon: '🎹',
  channel: 11,
  panelCh: 12,
  defaultVoiceId: 'concert-grand',
  badgeText: '🛡️ C 大調安全防呆啟用',
  canRemove: false,
};

export const AVAILABLE_CHORD_TRACK_CONFIGS: Record<string, Omit<ChordTrackConfig, 'onRemoveTrack'>> = {
  Chord2: {
    trackId: 'chord2',
    partId: 'Chord2',
    title: '和弦音軌 2 (Chord 2 - Ch 13)',
    icon: '🎹',
    channel: 12,
    panelCh: 13,
    defaultVoiceId: 'steel-guitar',
    badgeText: '🛡️ SFF2 和弦轉調 (NTT=Chord)',
    canRemove: true,
  },
  Pad: {
    trackId: 'pad',
    partId: 'Pad',
    title: '氛圍墊音 (Pad - Ch 14)',
    icon: '🌌',
    channel: 13,
    panelCh: 14,
    defaultVoiceId: 'warm-pad',
    badgeText: '🛡️ SFF2 長音轉調 (NTT=Chord)',
    canRemove: true,
  },
  Phrase1: {
    trackId: 'phrase1',
    partId: 'Phrase1',
    title: '裝飾短句 1 (Phrase 1 - Ch 15)',
    icon: '✨',
    channel: 14,
    panelCh: 15,
    defaultVoiceId: 'pop-brass',
    badgeText: '🛡️ SFF2 旋律轉調 (NTT=Melody)',
    canRemove: true,
  },
  Phrase2: {
    trackId: 'phrase2',
    partId: 'Phrase2',
    title: '裝飾短句 2 (Phrase 2 - Ch 16)',
    icon: '✨',
    channel: 15,
    panelCh: 16,
    defaultVoiceId: 'tenor-sax',
    badgeText: '🛡️ SFF2 旋律轉調 (NTT=Melody)',
    canRemove: true,
  },
};

export class ChordRollLite {
  private container: HTMLElement;
  private totalBars: number = 4;
  private timeSignature: TimeSignatureType = '4/4';
  private resolution: GridResolution = '1/16';
  private mode: ChordRollMode = 'safe-c';
  private config: ChordTrackConfig;
  private synth: ChordSynth = new ChordSynth();

  public getMode(): ChordRollMode {
    return this.mode;
  }

  public setMode(m: ChordRollMode) {
    this.mode = m;
    this.render();
  }

  public getSynth(): ChordSynth {
    return this.synth;
  }

  public getConfig(): ChordTrackConfig {
    return this.config;
  }

  // 和弦音域：預設 C5 (72) 至 C3 (48)，支援依據音符自適應擴展 (例如高音短句/旋律 C7 或低音 C2)
  private minPitch: number = 48;
  private maxPitch: number = 72;
  private baseMinPitch: number = 48;
  private baseMaxPitch: number = 72;
  private pitches: ChordPitchInfo[] = [];

  // 音符狀態：stepIndex -> Set<number> (多音複音)
  private pattern: Map<number, Set<number>> = new Map();
  private selectedVoiceId: string = 'concert-grand';

  private onPatternChange?: () => void;
  private onTriggerNote?: (note: number, velocity: number) => void;
  private onChordVoiceChange?: (voiceId: string) => void;
  private onSoloPlayToggle?: () => void;
  private onOpenVoiceSearch?: () => void;

  constructor(
    container: HTMLElement,
    totalBars: number = 4,
    onPatternChange?: () => void,
    onTriggerNote?: (note: number, velocity: number) => void,
    onChordVoiceChange?: (voiceId: string) => void,
    initialVoiceId?: string,
    onSoloPlayToggle?: () => void,
    onOpenVoiceSearch?: () => void,
    config?: Partial<ChordTrackConfig>
  ) {
    this.container = container;
    this.totalBars = totalBars;
    this.onPatternChange = onPatternChange;
    this.onTriggerNote = onTriggerNote;
    this.onChordVoiceChange = onChordVoiceChange;
    this.config = { ...DEFAULT_CHORD1_CONFIG, ...(config || {}) };
    this.selectedVoiceId = initialVoiceId || this.config.defaultVoiceId;
    const initVoice = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === this.selectedVoiceId);
    if (initVoice) {
      this.synth.setVoice(initVoice);
    }
    this.onSoloPlayToggle = onSoloPlayToggle;
    this.onOpenVoiceSearch = onOpenVoiceSearch;

    // 依據音軌類型設定基礎預設音域
    if (this.config.partId === 'Phrase1' || this.config.partId === 'Phrase2') {
      this.baseMaxPitch = 84; // 預設提供 C3 ~ C6 (3 個八度) 充足旋律空間
      this.maxPitch = 84;
    } else if (this.config.partId === 'Pad') {
      this.baseMaxPitch = 84; // 預設提供 C3 ~ C6
      this.maxPitch = 84;
    }

    this.initPitches();
    this.render();
  }

  public setSoloPlayState(isPlaying: boolean) {
    const btn = this.container.querySelector('#btn-chord-play') as HTMLButtonElement | null;
    if (btn) {
      const partName = this.config.partId === 'Chord1' ? '和弦' : this.config.partId === 'Chord2' ? '和弦 2' : this.config.partId;
      if (isPlaying) {
        btn.innerHTML = '<span>⏸</span> 暫停試聽';
        btn.classList.add('playing');
      } else {
        btn.innerHTML = `<span>▶</span> 試聽${partName}`;
        btn.classList.remove('playing');
      }
    }
  }

  public setVoice(voice: YamahaChordPreset): void {
    this.selectedVoiceId = voice.id;
    this.synth.setVoice(voice);
    const selectChord = this.container.querySelector('#select-chord-voice') as HTMLSelectElement | null;
    if (selectChord) {
      let opt = selectChord.querySelector(`option[value="${voice.id}"]`) as HTMLOptionElement | null;
      if (!opt) {
        opt = document.createElement('option');
        opt.value = voice.id;
        opt.textContent = `${voice.icon} ${voice.name} (PC ${voice.panelPc} / Bank ${voice.msb}-${voice.lsb})`;
        selectChord.appendChild(opt);
      }
      selectChord.value = voice.id;
    }
  }

  public setSelectedVoiceId(voiceId: string): void {
    if (this.selectedVoiceId === voiceId) return;
    this.selectedVoiceId = voiceId;
    const found = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === voiceId);
    if (found) {
      this.synth.setVoice(found);
    }
    const selectChord = this.container.querySelector('#select-chord-voice') as HTMLSelectElement | null;
    if (selectChord) {
      selectChord.value = voiceId;
    }
  }

  public getSelectedVoiceId(): string {
    return this.selectedVoiceId;
  }

  public getMinPitch(): number {
    return this.minPitch;
  }

  public getMaxPitch(): number {
    return this.maxPitch;
  }

  public getPitchesCount(): number {
    return this.pitches.length;
  }

  /**
   * 初始化和弦/旋律音高清單 (涵蓋 minPitch 至 maxPitch，由高至低排列)
   */
  private initPitches() {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const blackIndices = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
    this.pitches = [];

    for (let note = this.maxPitch; note >= this.minPitch; note--) {
      const octave = Math.floor(note / 12) - 1;
      const semitone = note % 12;
      const name = `${noteNames[semitone]}${octave}`;
      const isBlack = blackIndices.includes(semitone);

      let role: ChordPitchInfo['role'] = undefined;
      let roleLabel: string | undefined = undefined;

      // Yamaha C 大調基準轉調防呆角色 (全音域通用)
      if (semitone === 0) {
        role = 'root';
        roleLabel = '根音 (1)';
      } else if (semitone === 7) {
        role = 'fifth';
        roleLabel = '五度 (5)';
      } else if (semitone === 4) {
        role = 'third';
        roleLabel = '大三度 (3)';
      } else if (semitone === 10 || semitone === 11) {
        role = 'seventh';
        roleLabel = semitone === 10 ? '小七 (b7)' : '大七 (7)';
      }

      this.pitches.push({
        note,
        name,
        isBlack,
        role,
        roleLabel,
      });
    }
  }

  public setTotalBars(bars: number) {
    if (this.totalBars === bars) return;
    this.totalBars = bars;
    this.initNotes();
    this.render();
  }

  public setResolution(res: GridResolution) {
    if (this.resolution === res) return;
    const oldRes = this.resolution;
    this.resolution = res;

    // 智能轉換音符位置 (1/16 <-> 1/8)
    const newTotalSteps = this.getTotalSteps();
    const newPattern = new Map<number, Set<number>>();

    this.pattern.forEach((notes, s) => {
      let mappedStep = s;
      if (oldRes === '1/16' && res === '1/8') {
        mappedStep = Math.round(s / 2);
      } else if (oldRes === '1/8' && res === '1/16') {
        mappedStep = s * 2;
      }
      if (mappedStep < newTotalSteps) {
        if (!newPattern.has(mappedStep)) {
          newPattern.set(mappedStep, new Set());
        }
        notes.forEach(n => newPattern.get(mappedStep)!.add(n));
      }
    });

    this.pattern = newPattern;
    this.render();
  }

  public setTimeSignature(sig: TimeSignatureType) {
    if (this.timeSignature === sig) return;
    this.timeSignature = sig;
    this.initNotes();
    this.render();
  }

  private initNotes() {
    const totalSteps = this.getTotalSteps();
    const toDelete: number[] = [];
    this.pattern.forEach((_, step) => {
      if (step >= totalSteps) toDelete.push(step);
    });
    toDelete.forEach((s) => this.pattern.delete(s));
  }

  public getStepsPerBar(): number {
    if (this.timeSignature === '6/8') return 6;
    const beats = this.timeSignature === '3/4' ? 3 : 4;
    return this.resolution === '1/16' ? beats * 4 : beats * 2;
  }

  public getBeatsPerBar(): number {
    if (this.timeSignature === '3/4') return 3;
    if (this.timeSignature === '6/8') return 2;
    return 4;
  }

  public getStepsPerBeat(): number {
    if (this.timeSignature === '6/8') return 3;
    return this.resolution === '1/16' ? 4 : 2;
  }

  public getTotalSteps(): number {
    return this.totalBars * this.getStepsPerBar();
  }

  public getPatternData(): Map<number, Set<number>> {
    const copy = new Map<number, Set<number>>();
    this.pattern.forEach((set, step) => {
      copy.set(step, new Set(set));
    });
    return copy;
  }

  public setPatternData(data: Map<number, Set<number>>) {
    this.pattern = new Map();
    let minNote = Infinity;
    let maxNote = -Infinity;

    data.forEach((set, step) => {
      const copySet = new Set<number>();
      set.forEach((note) => {
        copySet.add(note);
        if (note < minNote) minNote = note;
        if (note > maxNote) maxNote = note;
      });
      if (copySet.size > 0) {
        this.pattern.set(step, copySet);
      }
    });

    // 智能自適應音域擴展：若導入之音符超出預設範圍，自動向上/向下擴展至八度 C 邊界
    let targetMin = this.baseMinPitch;
    let targetMax = this.baseMaxPitch;

    if (minNote < Infinity && maxNote > -Infinity) {
      const noteMinC = Math.max(24, Math.floor(minNote / 12) * 12);
      if (noteMinC < targetMin) {
        targetMin = noteMinC;
      }
      const noteMaxC = Math.min(108, Math.ceil((maxNote + 1) / 12) * 12);
      if (noteMaxC > targetMax) {
        targetMax = noteMaxC;
      }
    }

    if (targetMin !== this.minPitch || targetMax !== this.maxPitch) {
      this.minPitch = targetMin;
      this.maxPitch = targetMax;
      this.initPitches();
    }

    this.render();
  }

  public toggleNote(stepIndex: number, note: number) {
    if (!this.pattern.has(stepIndex)) {
      this.pattern.set(stepIndex, new Set());
    }
    const set = this.pattern.get(stepIndex)!;
    if (set.has(note)) {
      set.delete(note);
      if (set.size === 0) {
        this.pattern.delete(stepIndex);
      }
    } else {
      set.add(note);
      this.playNoteSound(note);
    }
    this.render();
    this.onPatternChange?.();
  }

  private playNoteSound(note: number, velocity: number = 100) {
    this.synth.playNote(note, velocity, 400);
    this.onTriggerNote?.(note, velocity);
  }

  /**
   * 範本 1：一鍵填入經典流行鋼琴四拍柱狀和弦 (C Major: C4-E4-G4)
   */
  public insertClassicPianoPattern() {
    this.pattern.clear();
    const stepsPerBeat = this.getStepsPerBeat();
    const beatsPerBar = this.getBeatsPerBar();

    // 在第 1 小節的每一個正拍點上填入 C4 (60) + E4 (64) + G4 (67)
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const step = beat * stepsPerBeat;
      this.pattern.set(step, new Set([60, 64, 67]));
    }

    // 鋪滿至所有小節
    this.cloneFirstBar();

    // 智能連動：自動切換為音樂會大鋼琴音色
    this.setSelectedVoiceId('concert-grand');
    this.onChordVoiceChange?.('concert-grand');

    this.render();
    this.onPatternChange?.();
  }

  /**
   * 範本 2：一鍵填入民謠吉他 8 分刷弦律動 (Down-Up Strum)
   */
  public insertGuitarStrumPattern() {
    this.pattern.clear();
    const stepsPerBeat = this.getStepsPerBeat();
    const beatsPerBar = this.getBeatsPerBar();
    const is16th = this.resolution === '1/16';

    // 8分律動：正拍彈低音根音 (C3:48+G3:55)，反拍刷高音和弦 (E4:64+G4:67+C5:72)
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const onBeatStep = beat * stepsPerBeat;
      const offBeatStep = is16th ? onBeatStep + 2 : onBeatStep + 1;

      // 正拍 (On-beat)
      this.pattern.set(onBeatStep, new Set([48, 55, 60]));
      // 反拍 (Off-beat)
      this.pattern.set(offBeatStep, new Set([64, 67, 72]));
    }

    // 鋪滿至所有小節
    this.cloneFirstBar();

    // 智能連動：自動切換為民謠鋼弦木吉他音色
    this.setSelectedVoiceId('steel-guitar');
    this.onChordVoiceChange?.('steel-guitar');

    this.render();
    this.onPatternChange?.();
  }

  /**
   * 一鍵將第 1 小節的和弦配置鋪滿至全部小節 (徹底覆蓋式複製)
   */
  public cloneFirstBar() {
    const stepsPerBar = this.getStepsPerBar();
    const totalSteps = this.getTotalSteps();

    // 1. 取得第 1 小節配置
    const bar1Map = new Map<number, Set<number>>();
    for (let s = 0; s < stepsPerBar; s++) {
      const set = this.pattern.get(s);
      if (set && set.size > 0) {
        bar1Map.set(s, new Set(set));
      }
    }

    // 2. 徹底清空第 2 小節起的所有殘留
    for (let s = stepsPerBar; s < totalSteps; s++) {
      this.pattern.delete(s);
    }

    // 3. 複製到後續小節
    if (bar1Map.size > 0) {
      for (let bar = 1; bar < this.totalBars; bar++) {
        const offset = bar * stepsPerBar;
        bar1Map.forEach((notes, stepInBar) => {
          this.pattern.set(offset + stepInBar, new Set(notes));
        });
      }
    }

    this.render();
    this.onPatternChange?.();
  }

  public clear() {
    this.pattern.clear();
    this.render();
    this.onPatternChange?.();
  }

  public hasNotes(): boolean {
    for (const set of this.pattern.values()) {
      if (set && set.size > 0) return true;
    }
    return false;
  }

  public getActiveNotesAtStep(stepIndex: number): number[] {
    const set = this.pattern.get(stepIndex);
    return set ? Array.from(set) : [];
  }

  public setPlayheadStep(stepIndex: number | null): void {
    const prev = this.container.querySelectorAll('.chord-cell.active-playhead, .chord-header-cell.active-playhead');
    prev.forEach((el) => el.classList.remove('active-playhead'));

    if (stepIndex !== null && stepIndex >= 0) {
      const current = this.container.querySelectorAll(`[data-chord-step="${stepIndex}"]`);
      current.forEach((el) => el.classList.add('active-playhead'));
    }
  }

  public getMidiEvents(ticksPerBar: number = 1920): Array<{ note: number; startTick: number; durationTick: number; velocity: number }> {
    const events: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
    const stepsPerBar = this.getStepsPerBar();
    const ticksPerStep = Math.round(ticksPerBar / stepsPerBar);

    this.pattern.forEach((notes, step) => {
      notes.forEach((note) => {
        events.push({
          note,
          startTick: step * ticksPerStep,
          durationTick: Math.max(24, Math.round(ticksPerStep * 1.5)),
          velocity: 100,
        });
      });
    });

    events.sort((a, b) => a.startTick - b.startTick);
    return events;
  }

  public render(): void {
    this.container.innerHTML = '';

    const stepsPerBar = this.getStepsPerBar();
    const beatsPerBar = this.getBeatsPerBar();
    const stepsPerBeat = this.getStepsPerBeat();

    // 依分類建立 <optgroup>
    const categories: string[] = [];
    YAMAHA_SX920_CHORD_VOICES.forEach(v => {
      const cat = v.categoryLabel || v.category;
      if (!categories.includes(cat)) categories.push(cat);
    });

    const optgroupsHtml = categories.map(cat => {
      const list = YAMAHA_SX920_CHORD_VOICES.filter(v => (v.categoryLabel || v.category) === cat);
      return `
        <optgroup label="${cat}">
          ${list.map(c => `
            <option value="${c.id}" ${c.id === this.selectedVoiceId ? 'selected' : ''}>
              ${c.icon} ${c.name} (PC ${c.panelPc} / Bank ${c.msb}-${c.lsb})
            </option>
          `).join('')}
        </optgroup>
      `;
    }).join('');

    // 1. 頂部工具列 (Toolbar)
    const toolbar = document.createElement('div');
    toolbar.className = 'grid-toolbar';
    const soloLabel = this.config.partId === 'Chord1' ? '和弦 1' : this.config.partId === 'Chord2' ? '和弦 2' : this.config.partId;
    toolbar.innerHTML = `
      <div class="grid-toolbar-left">
        <span style="font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
          ${this.config.icon} ${this.config.title}
        </span>
        <div class="drum-kit-selector-wrap" style="margin-left: 4px; display: flex; align-items: center; gap: 6px;">
          <label for="select-chord-voice" class="control-label">${this.config.icon} 琴端音色:</label>
          <select id="select-chord-voice" class="kit-select-input" title="選擇匯出與琴端監聽使用的 Yamaha 原廠和弦伴奏音色 (Channel ${this.config.panelCh})">
            ${optgroupsHtml}
          </select>
          <button id="btn-search-chord-voice" class="btn-grid-tool" style="padding: 2px 8px; font-size: 0.75rem;" title="搜尋 Yamaha PSR-SX920 原廠 2,300+ 完整音色資料庫">
            🔍 更多音色
          </button>
        </div>
        <span class="c-chord-guardrail-badge" title="Yamaha SFF2 CASM 轉調規則以 C 大調為基準。標有金色、青色、綠色之音符在彈奏左手和弦時保證 100% 正確轉調！" style="margin-left: 4px;">
          ${this.config.badgeText || '🛡️ C 大調安全防呆啟用'}
        </span>
      </div>

      <div class="grid-toolbar-right">
        <span class="pitch-range-badge" style="font-size: 0.72rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); display: inline-flex; align-items: center; gap: 4px;" title="當前可編輯音域範圍">
          🎼 音域: C${Math.floor(this.minPitch / 12) - 1} ~ C${Math.floor(this.maxPitch / 12) - 1}
        </span>
        <button id="btn-oct-high" class="btn-grid-tool" style="padding: 2px 6px; font-size: 0.72rem;" title="向上擴展 1 個高音八度 (最高至 C8)">
          🔼 +高音
        </button>
        <button id="btn-oct-low" class="btn-grid-tool" style="padding: 2px 6px; font-size: 0.72rem;" title="向下擴展 1 個低音八度 (最低至 C1)">
          🔽 +低音
        </button>
        <button id="btn-chord-play" class="btn-grid-tool btn-track-play" title="單獨循環試聽此軌 (Solo)">
          <span>▶</span> 試聽${soloLabel}
        </button>
        <button id="btn-chord-piano" class="btn-grid-tool" title="一鍵自動填入流行鋼琴四拍柱狀和弦並自動切換為大鋼琴音色">
          ✨ 填入流行鋼琴
        </button>
        <button id="btn-chord-guitar" class="btn-grid-tool" title="一鍵自動填入民謠吉他 8 分刷弦律動並自動切換為鋼弦吉他音色">
          🎸 填入民謠吉他
        </button>
        <button id="btn-chord-clone" class="btn-grid-tool" title="將第 1 小節和弦一鍵鋪滿至全部小節">
          ⚡ 一鍵鋪滿 ${this.totalBars} 小節
        </button>
        <button id="btn-chord-clear" class="btn-grid-tool btn-grid-clear" title="清除所有和弦音符">
          🗑️ 清空
        </button>
        ${this.config.canRemove ? `
          <button id="btn-chord-remove" class="btn-grid-tool btn-grid-clear" title="從伴奏風格中移除此音軌" style="border-color: #ef4444; color: #f87171; background: rgba(239, 68, 68, 0.1);">
            ❌ 移除此軌
          </button>
        ` : ''}
      </div>
    `;
    this.container.appendChild(toolbar);

    // 綁定事件
    const selectChord = toolbar.querySelector('#select-chord-voice') as HTMLSelectElement | null;
    selectChord?.addEventListener('change', () => {
      this.selectedVoiceId = selectChord.value;
      const found = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === selectChord.value);
      if (found) {
        this.synth.setVoice(found);
      }
      this.onChordVoiceChange?.(selectChord.value);
    });

    toolbar.querySelector('#btn-search-chord-voice')?.addEventListener('click', () => {
      this.onOpenVoiceSearch?.();
    });

    toolbar.querySelector('#btn-oct-high')?.addEventListener('click', () => {
      if (this.maxPitch < 108) {
        this.maxPitch = Math.min(108, this.maxPitch + 12);
        this.initPitches();
        this.render();
      }
    });

    toolbar.querySelector('#btn-oct-low')?.addEventListener('click', () => {
      if (this.minPitch > 24) {
        this.minPitch = Math.max(24, this.minPitch - 12);
        this.initPitches();
        this.render();
      }
    });

    toolbar.querySelector('#btn-chord-play')?.addEventListener('click', () => this.onSoloPlayToggle?.());
    toolbar.querySelector('#btn-chord-piano')?.addEventListener('click', () => this.insertClassicPianoPattern());
    toolbar.querySelector('#btn-chord-guitar')?.addEventListener('click', () => this.insertGuitarStrumPattern());
    toolbar.querySelector('#btn-chord-clone')?.addEventListener('click', () => this.cloneFirstBar());
    toolbar.querySelector('#btn-chord-clear')?.addEventListener('click', () => this.clear());
    toolbar.querySelector('#btn-chord-remove')?.addEventListener('click', () => this.config.onRemoveTrack?.());

    // 2. 外層捲軸容器
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'grid-scroll-wrapper piano-roll-scroll-wrapper';

    // 3. 拍子標題列 (Header Row)
    const headerRow = document.createElement('div');
    headerRow.className = 'grid-row grid-header-row';

    const headerCorner = document.createElement('div');
    headerCorner.className = 'row-header-label';
    headerCorner.innerHTML = `
      <span style="font-size: 0.82rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
        🎹 和弦音高 / 拍子
      </span>
    `;
    headerRow.appendChild(headerCorner);

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
          stepHeader.className = `step-header-cell chord-header-cell ${subClass}`;
          stepHeader.dataset.chordStep = `${stepIdx}`;

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
    scrollWrap.appendChild(headerRow);

    // 4. 琴鍵與音符行主體
    const rollBody = document.createElement('div');
    rollBody.className = 'piano-roll-body';

    for (const pitch of this.pitches) {
      const pitchRow = document.createElement('div');
      let rowRoleClass = '';
      if (pitch.role === 'root') rowRoleClass = 'pitch-row-root';
      else if (pitch.role === 'fifth') rowRoleClass = 'pitch-row-fifth';
      else if (pitch.role === 'third') rowRoleClass = 'pitch-row-third';
      else if (pitch.isBlack) rowRoleClass = 'pitch-row-black';

      pitchRow.className = `grid-row piano-pitch-row ${rowRoleClass}`;

      // 左側鋼琴琴鍵
      const keyLabel = document.createElement('div');
      keyLabel.className = `row-header-label piano-key-label ${pitch.isBlack ? 'piano-black-key' : 'piano-white-key'}`;
      keyLabel.setAttribute('title', `點擊試聽 ${pitch.name} (MIDI ${pitch.note})`);

      let badgeHtml = '';
      if (pitch.roleLabel) {
        let badgeColor = '#94a3b8';
        if (pitch.role === 'root') badgeColor = '#fbbf24';
        else if (pitch.role === 'fifth') badgeColor = '#38bdf8';
        else if (pitch.role === 'third') badgeColor = '#34d399';
        else if (pitch.role === 'seventh') badgeColor = '#c084fc';

        badgeHtml = `<span class="pitch-badge" style="background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}66;">${pitch.roleLabel}</span>`;
      }

      keyLabel.innerHTML = `
        <div class="piano-key-content">
          <span class="pitch-name ${pitch.role === 'root' ? 'root-text' : ''}">🎹 ${pitch.name}</span>
          ${badgeHtml}
        </div>
      `;

      keyLabel.addEventListener('click', () => {
        this.playNoteSound(pitch.note, 100);
      });

      pitchRow.appendChild(keyLabel);

      // 右側步進格子容器
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'steps-container';

      for (let bar = 0; bar < this.totalBars; bar++) {
        const barGroup = document.createElement('div');
        barGroup.className = 'bar-group';

        for (let beat = 0; beat < beatsPerBar; beat++) {
          const beatGroup = document.createElement('div');
          beatGroup.className = `beat-group ${beat % 2 === 0 ? 'beat-even' : 'beat-odd'}`;

          for (let sub = 0; sub < stepsPerBeat; sub++) {
            const stepIdx = bar * stepsPerBar + beat * stepsPerBeat + sub;
            const subClass = sub === 0 ? 'beat-start eighth-cell' : (sub === 2 && stepsPerBeat === 4 ? 'eighth-offbeat eighth-cell' : (stepsPerBeat === 4 ? 'sixteenth-cell' : ''));

            const cell = document.createElement('div');
            cell.className = `step-cell chord-cell ${subClass}`;
            cell.dataset.chordStep = `${stepIdx}`;

            const activeSet = this.pattern.get(stepIdx);
            const isActive = activeSet ? activeSet.has(pitch.note) : false;

            if (isActive) {
              cell.classList.add('active');
              if (pitch.role === 'root') cell.classList.add('note-root');
              else if (pitch.role === 'fifth') cell.classList.add('note-fifth');
              else if (pitch.role === 'third') cell.classList.add('note-third');
              else cell.classList.add('note-general');

              cell.innerHTML = `<span class="cell-dot">●</span>`;
            }

            cell.addEventListener('click', () => {
              this.toggleNote(stepIdx, pitch.note);
            });

            beatGroup.appendChild(cell);
          }
          barGroup.appendChild(beatGroup);
        }
        stepsContainer.appendChild(barGroup);
      }

      pitchRow.appendChild(stepsContainer);
      rollBody.appendChild(pitchRow);
    }

    scrollWrap.appendChild(rollBody);
    this.container.appendChild(scrollWrap);

    // 自動垂直捲動至音符所在視野 (若有音符)
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const activeCell = rollBody.querySelector('.step-cell.active');
        if (activeCell) {
          const activeRow = activeCell.closest('.piano-pitch-row') as HTMLElement | null;
          if (activeRow && typeof activeRow.scrollIntoView === 'function') {
            activeRow.scrollIntoView({ block: 'center' });
          }
        }
      });
    }
  }
}
