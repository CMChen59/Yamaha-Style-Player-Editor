/**
 * Yamaha STY 單軌專注編輯器 (Single Track Focused Editor)
 * 專為解決多軌同步渲染卡頓而設計的「單軌聚焦工作台」
 * 每次只載入並渲染 1 個 Channel 的音符、拍子、樂器與時間標尺，徹底消除效能負擔與掉拍問題。
 * 力度 (Velocity) 採用滑動拉桿 + 數值精確輸入框雙向連動，提供極速流暢的微調體驗。
 * 完整支援：
 *  - 矩形框選 (Marquee Selection)
 *  - 按住 Shift 點擊多選 (Multi-select)
 *  - 批次拖曳移位 (Pitch & Time 保持群組相對位置與邊界保護)
 *  - 批次刪除 (Delete / Backspace 鍵、右鍵、工具列按鈕)
 *  - 批次力度調控：
 *      • 📈 相對增減模式 (Relative Delta)：調整時嚴格保持多個音符間原有的強弱動態差
 *      • 🎯 絕對統一模式 (Absolute Mode)：將所有選取音符設為相同數值
 *      • ⚡ 快速階梯微調 ([-10], [-5], [+5], [+10])
 *      • 🎲 人性化隨機律動微調 (Humanize ±8)
 *  - 全選 (Ctrl+A) 與取消選取 (Escape)
 *  - 點擊空白處新增音符、時值伸縮、量化吸附。
 */

import type { PlaybackNoteEvent, PlaybackCCEvent, PartVoiceInfo } from './sty-playback-engine';
import { styPlaybackEngine } from './sty-playback-engine';
import { QuantizeEngine, type QuantizeGridType, type QuantizeOptions } from '../core/writer/quantize-engine';
import { PitchTransposer } from '../core/writer/pitch-transposer';
import { YAMAHA_DRUM_VOICES } from '../creator/drum-step-grid';
import { StepRecorder, type StepResolution, type StepRecordEntry } from '../core/writer/step-recorder';
import { midiManager } from '../core/audio/midi-manager';

export interface HistoryRecord {
  channel: number;
  description: string;
  beforeEvents: PlaybackNoteEvent[];
  afterEvents: PlaybackNoteEvent[];
  controller?: number;
  beforeCCEvents?: PlaybackCCEvent[];
  afterCCEvents?: PlaybackCCEvent[];
}

export interface EditorRowInfo {
  note: number;
  label: string;
  subLabel?: string;
  isBlack?: boolean;
  color?: string;
  icon?: string;
}

export class SingleTrackEditor {
  private container: HTMLElement;
  private channel: number = 8;
  private events: PlaybackNoteEvent[] = [];
  private totalTicks: number = 7680;
  private totalBars: number = 4;
  private division: number = 480;
  private timeSignature = { numerator: 4, denominator: 4 };
  private voiceInfo: PartVoiceInfo | null = null;
  private partAccentColor: string = '#f59e0b';
  private partLabel: string = 'Rhythm 1';

  // 縮放與網格維度
  private pixelsPerBar: number = 240;
  private isUserZoomed: boolean = false;
  private rowHeight: number = 24;
  private rows: EditorRowInfo[] = [];

  // 量化與多選編輯狀態
  public get quantizeResolution(): number {
    switch (this.quantizeGrid) {
      case '1/4': return 4;
      case '1/8': return 8;
      case '1/16': return 16;
      case '1/32': return 32;
      default: return 16;
    }
  }
  private quantizeGrid: QuantizeGridType = '1/16';
  private quantizeStrength: number = 100;
  private quantizeSwing: number = 50;
  private quantizeLengths: boolean = false;
  private isQuantizePanelOpen: boolean = false;
  private selectedEvents: Set<PlaybackNoteEvent> = new Set();
  private defaultVelocity: number = 100;
  private velocityMode: 'relative' | 'absolute' = 'relative';
  private initialVelocities: Map<PlaybackNoteEvent, number> = new Map();
  private baselineAverageVelocity: number = 100;
  private onEventsChanged: ((channel: number, events: PlaybackNoteEvent[]) => void) | null = null;

  // 歷史記錄堆疊 (Undo / Redo)
  private undoStack: HistoryRecord[] = [];
  private redoStack: HistoryRecord[] = [];
  private maxHistorySteps: number = 50;
  private onRequestSwitchChannel: ((channel: number) => void) | null = null;
  private onOpenVoicePicker: ((channel: number) => void) | null = null;
  private onRequestActivate: ((channel: number) => void) | null = null;
  public isChannelActive: boolean = true;
  private velocityDragBeforeSnapshot: PlaybackNoteEvent[] | null = null;

  // 🔴 PSR-SX920 實體琴鍵步進錄音核心 (Web MIDI Step Input)
  private stepRecorder: StepRecorder | null = null;
  private isStepRecording: boolean = false;
  private stepResolution: StepResolution = '1/16';
  private stepVelocityMode: 'as-played' | 'fixed' = 'as-played';
  private stepCursorEl: HTMLElement | null = null;
  private heldPitches: Set<number> = new Set();

  // DOM 參照
  private playheadEl: HTMLElement | null = null;
  private velSlider: HTMLInputElement | null = null;
  private velInput: HTMLInputElement | null = null;
  private velStatus: HTMLElement | null = null;
  private gridScrollEl: HTMLElement | null = null;
  private isHighContrastGrid: boolean = false;

  // 🎛️ 計畫 B: CC 控制器自動化控制線 (Automation Lanes)
  private activeController: number = 11; // 預設 CC 11 Expression (表情動態)
  private isLaneVisible: boolean = true;
  private laneHeight: number = 100;
  private ccEventsMap: Map<number, PlaybackCCEvent[]> = new Map();
  private onCCEventsChanged: ((channel: number, controller: number, events: PlaybackCCEvent[]) => void) | null = null;
  private laneScrollEl: HTMLElement | null = null;
  private lanePlayheadEl: HTMLElement | null = null;
  private laneSvgEl: SVGSVGElement | null = null;
  private laneValReadoutEl: HTMLElement | null = null;

  // 🥁 鼓組 16-Step 步進格子矩陣視圖 (Drum Step Sequencer Grid)
  private viewMode: 'piano-roll' | 'drum-grid' = 'piano-roll';
  private lastPlayheadStep: number = -1;

  constructor(container: HTMLElement) {
    this.container = container;

    // 視窗大小改變時自動重新適應 4 小節寬度
    window.addEventListener('resize', () => {
      if (!this.isUserZoomed && this.events.length > 0) {
        this.render();
      }
    });

    // 綁定 Web MIDI 實體琴鍵音符輸入監聽器
    midiManager.onNoteInput((type, pitch, velocity, ch) => {
      this.handleMidiNoteInput(type, pitch, velocity, ch);
    });

    // 鍵盤快捷鍵：Delete / Backspace 批次刪除選取音符，Ctrl+A 全選，Escape 取消選取
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // 🔴 步進錄音快捷鍵：Space = 休止, T = 延音, Backspace = 退步, Home = 回起點
      if (this.isStepRecording) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.insertRest();
          return;
        } else if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.tiePreviousNote();
          return;
        } else if (e.key === 'Home') {
          e.preventDefault();
          this.rewindStepCursor();
          return;
        } else if (e.key === 'Backspace' && this.selectedEvents.size === 0) {
          e.preventDefault();
          this.stepBack();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedEvents.size > 0) {
          e.preventDefault();
          this.deleteSelectedNotes();
        }
      } else if (e.key === 'Escape') {
        this.clearSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        this.selectAllNotes();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        this.fillRemainingBarsFromBar1();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.redo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        this.executeQuantize();
      } else if (e.key === 'ArrowUp' && (e.altKey || this.selectedEvents.size > 0)) {
        e.preventDefault();
        const semitones = (e.shiftKey || e.ctrlKey) ? 12 : 1;
        this.transposeCurrent(semitones);
      } else if (e.key === 'ArrowDown' && (e.altKey || this.selectedEvents.size > 0)) {
        e.preventDefault();
        const semitones = (e.shiftKey || e.ctrlKey) ? -12 : -1;
        this.transposeCurrent(semitones);
      }
    });
  }

  /**
   * 設定事件變更回呼 (同步更新外層橫幅計數等)
   */
  public setOnEventsChanged(cb: (channel: number, events: PlaybackNoteEvent[]) => void) {
    this.onEventsChanged = cb;
  }

  /**
   * 設定跨軌道切換請求回呼 (當 Undo/Redo 涉及其他聲部時自動跳轉並高亮焦點)
   */
  public setOnRequestSwitchChannel(cb: (channel: number) => void) {
    this.onRequestSwitchChannel = cb;
  }

  /**
   * 設定開啟 Yamaha 原廠音色庫選擇器回呼
   */
  public setOnOpenVoicePicker(cb: (channel: number) => void) {
    this.onOpenVoicePicker = cb;
  }

  /**
   * 設定聲部啟用請求回呼 (當使用者在未啟用聲部輸入音符或錄音時自動觸發)
   */
  public setOnRequestActivate(cb: (channel: number) => void) {
    this.onRequestActivate = cb;
  }

  /**
   * 即時更新頂部工具列音色資訊
   */
  public updateVoiceInfo(voiceInfo: PartVoiceInfo | null) {
    this.voiceInfo = voiceInfo;
    const voiceTag = this.container.querySelector('.editor-voice-tag');
    if (voiceTag) {
      voiceTag.textContent = voiceInfo ? `${voiceInfo.voiceName} ✏️` : '預設音色 ✏️';
      voiceTag.setAttribute('title', voiceInfo ? `${voiceInfo.voiceName} (點擊更換音色)` : '點擊更換音色');
    }
  }

  /**
   * 清空歷史記錄 (在載入新 STY 伴奏檔或切換不同 Section 段落時調用)
   */
  public clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoHistory(): { description: string; channel: number }[] {
    return this.undoStack.map(h => ({ description: h.description, channel: h.channel }));
  }

  public getRedoHistory(): { description: string; channel: number }[] {
    return this.redoStack.map(h => ({ description: h.description, channel: h.channel }));
  }

  /**
   * 推入歷史記錄
   */
  public pushHistory(
    description: string,
    beforeEvents: PlaybackNoteEvent[],
    afterEvents: PlaybackNoteEvent[]
  ) {
    this.undoStack.push({
      channel: this.channel,
      description,
      beforeEvents: beforeEvents.map(e => ({ ...e })),
      afterEvents: afterEvents.map(e => ({ ...e })),
    });
    if (this.undoStack.length > this.maxHistorySteps) {
      this.undoStack.shift();
    }
    this.redoStack = []; // 清空重做堆疊
    this.updateHistoryButtons();
  }

  /**
   * 推入 CC 控制器歷史記錄 (Undo / Redo)
   */
  public pushCCHistory(
    description: string,
    controller: number,
    beforeCC: PlaybackCCEvent[],
    afterCC: PlaybackCCEvent[]
  ) {
    this.undoStack.push({
      channel: this.channel,
      description,
      beforeEvents: this.events.map(e => ({ ...e })),
      afterEvents: this.events.map(e => ({ ...e })),
      controller,
      beforeCCEvents: beforeCC.map(c => ({ ...c })),
      afterCCEvents: afterCC.map(c => ({ ...c })),
    });
    if (this.undoStack.length > this.maxHistorySteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  /**
   * 復原上一步操作 (Ctrl+Z)
   */
  public undo(): boolean {
    const record = this.undoStack.pop();
    if (!record) return false;

    this.redoStack.push(record);

    if (record.channel !== this.channel && this.onRequestSwitchChannel) {
      this.onRequestSwitchChannel(record.channel);
    }

    this.channel = record.channel;
    this.events = record.beforeEvents.map(e => ({ ...e }));
    this.events.sort((a, b) => a.relTick - b.relTick);
    this.selectedEvents.clear();
    this.initialVelocities.clear();

    if (record.controller !== undefined && record.beforeCCEvents) {
      this.ccEventsMap.set(record.controller, record.beforeCCEvents.map(c => ({ ...c })));
      this.notifyCCEventsChanged(record.controller);
    }

    this.notifyEventsChanged();
    this.render();
    this.updateHistoryButtons();

    if (this.velStatus) {
      this.velStatus.textContent = `↩️ 已復原：${record.description}`;
    }
    return true;
  }

  /**
   * 重做上一步操作 (Ctrl+Y 或 Ctrl+Shift+Z)
   */
  public redo(): boolean {
    const record = this.redoStack.pop();
    if (!record) return false;

    this.undoStack.push(record);

    if (record.channel !== this.channel && this.onRequestSwitchChannel) {
      this.onRequestSwitchChannel(record.channel);
    }

    this.channel = record.channel;
    this.events = record.afterEvents.map(e => ({ ...e }));
    this.events.sort((a, b) => a.relTick - b.relTick);
    this.selectedEvents.clear();
    this.initialVelocities.clear();

    if (record.controller !== undefined && record.afterCCEvents) {
      this.ccEventsMap.set(record.controller, record.afterCCEvents.map(c => ({ ...c })));
      this.notifyCCEventsChanged(record.controller);
    }

    this.notifyEventsChanged();
    this.render();
    this.updateHistoryButtons();

    if (this.velStatus) {
      this.velStatus.textContent = `↪️ 已重做：${record.description}`;
    }
    return true;
  }

  /**
   * 更新復原 / 重做按鈕的啟用狀態與提示文字
   */
  public updateHistoryButtons() {
    const btnUndo = this.container.querySelector('#ed-btn-undo') as HTMLButtonElement | null;
    const btnRedo = this.container.querySelector('#ed-btn-redo') as HTMLButtonElement | null;

    if (btnUndo) {
      btnUndo.disabled = this.undoStack.length === 0;
      const last = this.undoStack[this.undoStack.length - 1];
      btnUndo.title = last ? `復原：${last.description} (Ctrl+Z)` : '復原 (Ctrl+Z)';
    }
    if (btnRedo) {
      btnRedo.disabled = this.redoStack.length === 0;
      const next = this.redoStack[this.redoStack.length - 1];
      btnRedo.title = next ? `重做：${next.description} (Ctrl+Y 或 Ctrl+Shift+Z)` : '重做 (Ctrl+Y 或 Ctrl+Shift+Z)';
    }
  }

  /**
   * 通知資料已變更，即時同步至播放引擎 (零延遲即刻生效)
   */
  private notifyEventsChanged() {
    styPlaybackEngine.setChannelEvents(this.channel, this.events);
    if (this.onEventsChanged) {
      this.onEventsChanged(this.channel, this.events);
    }
    const countPill = this.container.querySelector('#ed-note-count-pill');
    if (countPill) {
      countPill.textContent = `音符總數: ${this.events.length}`;
    }
  }

  /**
   * 設定 CC 控制器自動化變更回呼 (同步寫入 parsed SMF Track 0)
   */
  public setOnCCEventsChanged(cb: (channel: number, controller: number, events: PlaybackCCEvent[]) => void) {
    this.onCCEventsChanged = cb;
  }

  /**
   * 通知特定 CC 控制器資料已變更，零延遲同步至播放引擎與宿主 STY 結構
   */
  private notifyCCEventsChanged(controller: number) {
    const list = this.ccEventsMap.get(controller) || [];
    list.sort((a, b) => a.relTick - b.relTick);
    styPlaybackEngine.setChannelCCEvents(this.channel, controller, list);
    if (this.onCCEventsChanged) {
      this.onCCEventsChanged(this.channel, controller, list);
    }
  }

  /**
   * 初始化 CC 控制器資料並補齊友善預設點 (Tick 0)
   */
  private initCCEvents(incomingCC: PlaybackCCEvent[]) {
    this.ccEventsMap.clear();
    incomingCC.forEach((ev) => {
      const list = this.ccEventsMap.get(ev.controller) || [];
      list.push({ ...ev });
      this.ccEventsMap.set(ev.controller, list);
    });

    this.ccEventsMap.forEach((list) => {
      list.sort((a, b) => a.relTick - b.relTick);
    });

    // 補齊常見控制器基準節點，防止完全空白
    this.ensureDefaultCCPoint(11, 127); // Expression
    this.ensureDefaultCCPoint(7, 100);  // Volume
    this.ensureDefaultCCPoint(10, 64);  // Pan
    this.ensureDefaultCCPoint(91, 40);  // Reverb (預設 40)
    this.ensureDefaultCCPoint(93, 0);   // Chorus (預設 0)
    this.ensureDefaultCCPoint(1, 0);    // Modulation
    this.ensureDefaultCCPoint(64, 0);   // Sustain
  }

  private ensureDefaultCCPoint(controller: number, defaultVal: number) {
    let list = this.ccEventsMap.get(controller);
    if (!list || list.length === 0) {
      list = [
        {
          channel: this.channel,
          controller,
          value: defaultVal,
          relTick: 0,
        },
      ];
      this.ccEventsMap.set(controller, list);
    }
  }

  /**
   * 取得當前量化單位之 Tick 數值
   */
  public getStepTicks(): number {
    return QuantizeEngine.getGridStepTicks(this.quantizeGrid, this.division);
  }

  /**
   * 載入並切換至特定聲部資料
   */
  public loadTrack(
    channel: number,
    partLabel: string,
    accentColor: string,
    events: PlaybackNoteEvent[],
    totalTicks: number,
    totalBars: number,
    division: number,
    timeSignature: { numerator: number; denominator: number },
    voiceInfo: PartVoiceInfo | null,
    isActive: boolean = true,
    ccEvents: PlaybackCCEvent[] = []
  ) {
    this.channel = channel;
    this.partLabel = partLabel;
    this.partAccentColor = accentColor;
    this.events = events;
    this.totalTicks = Math.max(1, totalTicks);
    this.totalBars = Math.max(1, totalBars);
    this.division = division || 480;
    this.timeSignature = timeSignature || { numerator: 4, denominator: 4 };
    this.voiceInfo = voiceInfo;
    this.isChannelActive = isActive;
    const isDrum = styPlaybackEngine.isChannelDrum(this.channel);
    if (!isDrum && this.viewMode === 'drum-grid') {
      this.viewMode = 'piano-roll';
    }
    this.selectedEvents.clear();
    this.initialVelocities.clear();

    // 🎛️ 載入 CC 控制器事件
    this.initCCEvents(ccEvents);

    if (!this.stepRecorder) {
      this.initStepRecorder();
    } else {
      this.stepRecorder.configure({
        ppq: this.division,
        timeSignature: this.timeSignature,
        resolution: this.stepResolution,
        maxBars: this.totalBars,
        velocityMode: this.stepVelocityMode,
        fixedVelocity: this.defaultVelocity,
      });
      this.stepRecorder.reset();
    }

    this.calculateRows();
    this.render();
  }

  /**
   * 計算該軌道需要顯示的縱向行 (Rows)
   */
  private calculateRows() {
    const isDrum = styPlaybackEngine.isChannelDrum(this.channel);

    if (isDrum) {
      // 鼓組軌道：彙整事件中的音高，並補齊常用的核心打擊樂器
      const eventNotes = new Set(this.events.map(e => e.noteNumber));
      const stapleNotes = [49, 51, 46, 42, 44, 50, 48, 47, 45, 41, 39, 40, 38, 37, 36, 35];
      stapleNotes.forEach(n => eventNotes.add(n));

      const sortedNotes = Array.from(eventNotes).sort((a, b) => b - a); // 由高音到低音
      this.rows = sortedNotes.map(n => {
        const found = YAMAHA_DRUM_VOICES.find(v => v.note === n);
        return {
          note: n,
          label: found ? found.name.split(' (')[0] : `Note ${n}`,
          subLabel: found ? found.noteName : `${n}`,
          icon: found ? found.icon : '🥁',
          color: found ? found.color : '#38bdf8',
        };
      });
    } else {
      // 樂器音軌（Bass, Chord, Pad, Phrase）
      let minMidi = 36;
      let maxMidi = 60;

      if (this.events.length > 0) {
        const notes = this.events.map(e => e.noteNumber);
        const actualMin = Math.min(...notes);
        const actualMax = Math.max(...notes);
        // 提供上下舒適的擴展操作空間 (至少涵蓋 2 個八度)
        const pad = Math.max(3, Math.floor((24 - (actualMax - actualMin)) / 2));
        minMidi = Math.max(12, actualMin - pad);
        maxMidi = Math.min(108, actualMax + pad);
      } else {
        if (this.channel === 10) {
          // Bass 預設音域 E1 (28) ~ G3 (55)
          minMidi = 28;
          maxMidi = 55;
        } else {
          // 和弦 / 樂句預設音域 C3 (48) ~ C5 (72)
          minMidi = 48;
          maxMidi = 72;
        }
      }

      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const blackIndices = [1, 3, 6, 8, 10];

      this.rows = [];
      for (let midi = maxMidi; midi >= minMidi; midi--) {
        const pitchClass = midi % 12;
        const octave = Math.floor(midi / 12) - 1;
        const name = `${noteNames[pitchClass]}${octave}`;
        const isBlack = blackIndices.includes(pitchClass);
        this.rows.push({
          note: midi,
          label: name,
          isBlack,
          subLabel: pitchClass === 0 ? 'Root' : undefined,
        });
      }
    }
  }

  /**
   * 拍照快照當前選取音符的基礎力度 (作為相對增減 Delta 之基準)
   */
  private snapshotInitialVelocities() {
    this.initialVelocities.clear();
    if (this.selectedEvents.size === 0) {
      this.baselineAverageVelocity = this.defaultVelocity;
      return;
    }
    let sum = 0;
    this.selectedEvents.forEach(ev => {
      this.initialVelocities.set(ev, ev.velocity);
      sum += ev.velocity;
    });
    this.baselineAverageVelocity = Math.round(sum / this.selectedEvents.size);
  }

  /**
   * 繪製完整編輯器 UI
   */
  private render() {
    const prevScrollLeft = this.gridScrollEl ? this.gridScrollEl.scrollLeft : 0;
    const prevScrollTop = this.gridScrollEl ? this.gridScrollEl.scrollTop : 0;
    const isDrum = styPlaybackEngine.isChannelDrum(this.channel);

    this.container.innerHTML = '';
    this.container.style.setProperty('--part-accent', this.partAccentColor);

    // 1. 建立頂部工具列 (含樂器、拍號、力度拉桿與數字輸入框、相對/絕對模式切換、快速微調按鈕、量化、刪除、縮放)
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    toolbar.innerHTML = `
      <div class="editor-toolbar-left">
        <span class="editor-track-badge" style="background: ${this.partAccentColor};">CH ${this.channel + 1} - ${this.partLabel}</span>
        ${!this.isChannelActive ? '<span class="editor-status-pill pill-inactive" id="ed-pill-activate" title="此聲部尚未啟用，點擊挑選樂器音色並自動建立 CASM 伴奏規則">➕ 點此啟用聲部</span>' : ''}
        <span class="editor-voice-tag clickable-voice-tag" title="${this.voiceInfo ? this.voiceInfo.voiceName + ' (點擊更換音色)' : '點擊更換音色'}">${this.voiceInfo?.voiceName || (this.isChannelActive ? '預設音色' : '未配置音色')} ✏️</span>
        <span class="editor-meta-pill">拍號: ${this.timeSignature.numerator}/${this.timeSignature.denominator} | 總計: ${this.totalBars} 小節 | PPQ: ${this.division}</span>
        <span id="ed-note-count-pill" class="editor-meta-pill">音符總數: ${this.events.length}</span>

        ${isDrum ? `
          <div class="editor-view-toggle">
            <button id="ed-view-pianoroll" class="view-toggle-btn ${this.viewMode === 'piano-roll' ? 'active' : ''}" title="切換至標準鋼琴卷軸視圖">🎹 鋼琴卷軸</button>
            <button id="ed-view-drumgrid" class="view-toggle-btn ${this.viewMode === 'drum-grid' ? 'active' : ''}" title="切換至專業 16-Step 鼓機步進矩陣">🥁 16-Step 矩陣</button>
          </div>
        ` : ''}
      </div>

      <div class="editor-toolbar-right">
        <!-- 🎛️ 力度 (Velocity) 調控模組：滑動拉桿 + 精確數字框 + 模式切換 + ⚡ 微調階梯 -->
        <div class="editor-vel-box">
          <span class="editor-vel-label">力度:</span>
          <input type="range" id="ed-vel-slider" class="editor-vel-slider" min="1" max="127" value="${this.defaultVelocity}">
          <input type="number" id="ed-vel-input" class="editor-vel-input" min="1" max="127" value="${this.defaultVelocity}">
          
          <!-- 模式切換：📈 相對增減 vs 🎯 絕對統一 -->
          <div id="ed-vel-mode-group" class="editor-vel-mode-group" title="多選力度調整模式">
            <button id="ed-vel-mode-rel" class="vel-mode-btn ${this.velocityMode === 'relative' ? 'active' : ''}" title="相對增減：微調時嚴格保持選取音符間原有的強弱動態差">📈 相對</button>
            <button id="ed-vel-mode-abs" class="vel-mode-btn ${this.velocityMode === 'absolute' ? 'active' : ''}" title="絕對統一：將所有選取音符統一設為此數值">🎯 統一</button>
          </div>

          <!-- ⚡ 快速階梯微調群組 -->
          <div id="ed-vel-nudge-group" class="editor-vel-nudge-group">
            <button id="ed-vel-nudge-m10" class="vel-nudge-btn" title="選取音符力度全部 -10">-10</button>
            <button id="ed-vel-nudge-m5" class="vel-nudge-btn" title="選取音符力度全部 -5">-5</button>
            <button id="ed-vel-nudge-p5" class="vel-nudge-btn" title="選取音符力度全部 +5">+5</button>
            <button id="ed-vel-nudge-p10" class="vel-nudge-btn" title="選取音符力度全部 +10">+10</button>
            <button id="ed-vel-humanize" class="vel-nudge-btn btn-humanize" title="🎲 人性化隨機微調：為選取音符加入 ±8 隨機動態，使律動演奏更自然">🎲 人性化</button>
          </div>

          <span id="ed-vel-status" class="editor-vel-status">預設寫入力度: ${this.defaultVelocity}</span>
        </div>

        <!-- 🎹 移調與八度升降模組 (Tier 2-3) -->
        <div class="editor-transpose-box">
          <span class="editor-tool-label">移調:</span>
          <div class="editor-transpose-btns">
            <button id="ed-btn-octave-down" class="transpose-btn" title="降八度 (-8va / -12 半音) (快速鍵: Shift+Alt+Down 或 Shift+Down)">-8va</button>
            <button id="ed-btn-semi-down" class="transpose-btn" title="降半音 (-1 半音) (快速鍵: Alt+Down 或 Down)">-1</button>
            <button id="ed-btn-semi-up" class="transpose-btn" title="升半音 (+1 半音) (快速鍵: Alt+Up 或 Up)">+1</button>
            <button id="ed-btn-octave-up" class="transpose-btn" title="升八度 (+8va / +12 半音) (快速鍵: Shift+Alt+Up 或 Shift+Up)">+8va</button>
          </div>
        </div>

        <!-- 📐 量化與律動控制模組 (Tier 2-2) -->
        <div class="editor-quantize-box">
          <span class="editor-tool-label">網格:</span>
          <select id="ed-quantize-select" class="editor-select" title="網格吸附與量化解析度 (含三連音)">
            <option value="1/16" ${this.quantizeGrid === '1/16' ? 'selected' : ''}>1/16 拍</option>
            <option value="1/8" ${this.quantizeGrid === '1/8' ? 'selected' : ''}>1/8 拍</option>
            <option value="1/4" ${this.quantizeGrid === '1/4' ? 'selected' : ''}>1/4 拍</option>
            <option value="1/32" ${this.quantizeGrid === '1/32' ? 'selected' : ''}>1/32 拍</option>
            <option value="1/16T" ${this.quantizeGrid === '1/16T' ? 'selected' : ''}>1/16 三連音</option>
            <option value="1/8T" ${this.quantizeGrid === '1/8T' ? 'selected' : ''}>1/8 三連音</option>
            <option value="1/4T" ${this.quantizeGrid === '1/4T' ? 'selected' : ''}>1/4 三連音</option>
          </select>
          <button id="ed-btn-quantize-now" class="editor-action-btn btn-quantize" title="立即將音符吸附對齊網格 (快速鍵: Q，有選取時量化選取，未選取時全軌量化)">⚡ 量化 (Q)</button>
          <button id="ed-btn-quantize-settings" class="editor-mini-btn ${this.isQuantizePanelOpen ? 'active' : ''}" title="展開/收合量化強度與搖擺律動面板">⚙️ 律動</button>
        </div>

        <!-- 🔁 複製第 1 小節填滿全段 -->
        <button id="ed-btn-fill-bars" class="editor-action-btn btn-fill-bars" ${this.totalBars <= 1 ? 'disabled' : ''} title="將第 1 小節的所有音符複製並平移填滿至後續所有小節 (清空覆蓋後續小節，快速鍵: Ctrl+D，支援 Ctrl+Z 復原)">
          🔁 填滿後續小節
        </button>

        <!-- ↩️ 復原 / ↪️ 重做 -->
        <div class="editor-history-btns">
          <button id="ed-btn-undo" class="editor-action-btn" title="復原上一步操作 (Ctrl+Z)" disabled>↩️ 復原</button>
          <button id="ed-btn-redo" class="editor-action-btn" title="重做上一步操作 (Ctrl+Y 或 Ctrl+Shift+Z)" disabled>↪️ 重做</button>
        </div>

        <!-- 🔴 PSR-SX920 實體琴鍵步進錄音工作台切換按鈕 -->
        <button id="ed-btn-step-rec" class="step-rec-toggle-btn ${this.isStepRecording ? 'recording' : ''}" title="切換 PSR-SX920 實體琴鍵步進錄音模式 (實體琴鍵/虛擬鍵盤彈奏即時寫入)">
          <span class="rec-dot"></span> 步進錄音
        </button>

        <!-- 🗑️ 刪除按鈕 (支援批次刪除) -->
        <button id="ed-btn-delete" class="editor-action-btn btn-danger" title="刪除選取的音符 (或按 Delete / Backspace 鍵)">🗑️ 刪除音符</button>

        <!-- 🎛️ 計畫 B: CC 控制線切換按鈕 -->
        <button id="ed-btn-toggle-lane" class="editor-action-btn ${this.isLaneVisible ? 'active' : ''}" title="顯示 / 隱藏 CC 控制器自動化控制線 (Expression / Volume / Pan)">🎛️ CC 控制線</button>

        <div class="editor-zoom-btns">
          <button id="ed-btn-grid-contrast" class="editor-mini-btn ${this.isHighContrastGrid ? 'active' : ''}" title="切換高對比度格線模式 (更明亮清晰的小節線與拍線)">👁️ ${this.isHighContrastGrid ? '高對比' : '標準格線'}</button>
          <button id="ed-btn-fit-4" class="editor-mini-btn ${!this.isUserZoomed ? 'active' : ''}" title="保證視野內完整呈現 4 個小節">🎯 4 小節</button>
          <button id="ed-btn-fit-all" class="editor-mini-btn" title="縮放至完整段落小節">全曲</button>
          <button id="ed-btn-zoom-out" class="editor-mini-btn" title="縮小時間軸">🔍 -</button>
          <button id="ed-btn-zoom-in" class="editor-mini-btn" title="放大時間軸">🔍 +</button>
        </div>

        <!-- 🎛️ 量化律動參數設定抽屜 (Tier 2-2) -->
        <div id="ed-quantize-panel" class="editor-quantize-panel" style="display: ${this.isQuantizePanelOpen ? 'flex' : 'none'};">
          <div class="q-setting-item">
            <span class="q-label">強度:</span>
            <input type="range" id="ed-q-strength-slider" min="0" max="100" value="${this.quantizeStrength}" class="q-slider" title="量化吸附強度 (0% ~ 100%)">
            <span id="ed-q-strength-val" class="q-val-badge">${this.quantizeStrength}%</span>
          </div>
          <div class="q-setting-item">
            <span class="q-label">搖擺 (Swing):</span>
            <input type="range" id="ed-q-swing-slider" min="50" max="75" value="${this.quantizeSwing}" class="q-slider" title="後半拍延遲搖擺 (50% 直音 ~ 66.7% Shuffle ~ 75% 點奏)">
            <span id="ed-q-swing-val" class="q-val-badge">${this.quantizeSwing === 50 ? '50% (直音)' : (this.quantizeSwing === 67 ? '67% (Shuffle)' : `${this.quantizeSwing}%`)}</span>
          </div>
          <label class="q-checkbox-label" title="同時將音符長度整定為網格倍數">
            <input type="checkbox" id="ed-q-chk-lengths" ${this.quantizeLengths ? 'checked' : ''}>
            <span>同步量化時值</span>
          </label>
        </div>
      </div>
    `;

    this.container.appendChild(toolbar);

    // 🔴 PSR-SX920 步進錄音專屬工作條 (Step Recording Action Bar)
    const stepBar = document.createElement('div');
    stepBar.id = 'ed-step-bar';
    stepBar.className = 'editor-step-bar';
    stepBar.style.display = this.isStepRecording ? 'flex' : 'none';
    stepBar.innerHTML = `
      <div class="step-bar-left">
        <span style="font-size: 0.75rem; font-weight: 800; color: #f43f5e; display: flex; align-items: center; gap: 4px;">
          <span class="rec-dot" style="background:#f43f5e;"></span> 琴鍵步進錄音:
        </span>

        <select id="ed-step-res-select" class="editor-select" title="選擇單步錄入時值">
          <option value="1/16" ${this.stepResolution === '1/16' ? 'selected' : ''}>1/16 音符 (1/4 拍)</option>
          <option value="1/8" ${this.stepResolution === '1/8' ? 'selected' : ''}>1/8 音符 (半拍)</option>
          <option value="1/4" ${this.stepResolution === '1/4' ? 'selected' : ''}>1/4 音符 (1 拍)</option>
          <option value="1/2" ${this.stepResolution === '1/2' ? 'selected' : ''}>1/2 音符 (2 拍)</option>
          <option value="1/1" ${this.stepResolution === '1/1' ? 'selected' : ''}>全音符 (1 小節)</option>
          <option value="1/32" ${this.stepResolution === '1/32' ? 'selected' : ''}>1/32 音符</option>
          <option value="1/8T" ${this.stepResolution === '1/8T' ? 'selected' : ''}>1/8 三連音</option>
          <option value="1/16T" ${this.stepResolution === '1/16T' ? 'selected' : ''}>1/16 三連音</option>
        </select>

        <select id="ed-step-vel-mode" class="editor-select" title="錄入力度模式">
          <option value="as-played" ${this.stepVelocityMode === 'as-played' ? 'selected' : ''}>🎹 琴鍵真實力度</option>
          <option value="fixed" ${this.stepVelocityMode === 'fixed' ? 'selected' : ''}>🎯 固定力度 (依滑桿)</option>
        </select>

        <button id="ed-btn-step-rest" class="step-action-btn step-btn-rest" title="插入休止符並前進 1 步 (快速鍵: 空白鍵 Space)">⏭ 休止 (Space)</button>
        <button id="ed-btn-step-tie" class="step-action-btn step-btn-tie" title="延音 (Tie)：延長前一個音符 1 步時值 (快速鍵: T 鍵)">⁀ 延音 Tie (T)</button>
        <button id="ed-btn-step-back" class="step-action-btn step-btn-back" title="退回上一步 (快速鍵: Backspace)">⏮ 退步 (Bksp)</button>
        <button id="ed-btn-step-rewind" class="step-action-btn step-btn-rewind" title="游標回小節起點 (Tick 0)">⏪ 回起點</button>
      </div>

      <div class="step-bar-right">
        <span id="ed-step-pos-badge" class="step-pos-badge">📍 第 1 小節 1.1 拍 (Tick 0)</span>
        <span id="ed-step-chord-badge" class="step-chord-badge">🎹 等待琴鍵輸入...</span>
      </div>
    `;
    this.container.appendChild(stepBar);

    // 操作提示條
    const hintBar = document.createElement('div');
    hintBar.className = 'editor-hint-bar';
    if (this.isStepRecording) {
      hintBar.innerHTML = `<span>🔴 <b>步進錄音進行中:</b> 在 PSR-SX920 彈奏和弦或旋律，放開琴鍵即寫入 ｜ <b>空白鍵 (Space)</b> 插入休止 ｜ <b>T 鍵</b> 延音 ｜ <b>Backspace</b> 退步 ｜ 點擊標尺直接跳轉游標</span>`;
    } else if (this.viewMode === 'drum-grid' && isDrum) {
      hintBar.innerHTML = `<span>🥁 <b>16-Step 鼓機步進矩陣:</b> 點擊格子即時<b>【開燈打點 / 關燈清除】</b> ｜ 點擊左側樂器試聽 ｜ 上方拉桿控制寫入力度 ｜ <b>🔁 填滿後續小節 (Ctrl+D)</b> 一鍵複製全段 ｜ <b>Ctrl+Z 復原 / Ctrl+Y 重做</b></span>`;
    } else {
      hintBar.innerHTML = `<span>💡 <b>操作指南:</b> 點擊空白新增音符 ｜ 拖曳空白處<b>【框選】</b> ｜ 按住 Shift 點擊<b>【多選】</b> ｜ 拖曳音符<b>【批次移位】</b> ｜ 拖曳右把手調時值 ｜ 按 Delete / 右鍵<b>【批次刪除】</b> ｜ 上方拉桿/微調鈕<b>【批次改力度 / 🎲人性化】</b> ｜ <b>🔁 填滿後續小節 (Ctrl+D)</b> ｜ <b>Ctrl+Z 復原 / Ctrl+Y 重做</b> ｜ <b>Q 鍵量化</b> ｜ <b>Alt+↑/↓ 移調 (Shift+Alt+↑/↓ 八度)</b></span>`;
    }
    this.container.appendChild(hintBar);

    // 2. 建立主編輯捲動工作區並先掛載至 DOM，以便取得真實精確的 viewport clientWidth
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'editor-viewport-wrap';
    this.container.appendChild(scrollWrap);
    this.gridScrollEl = scrollWrap;

    // 在 DOM 掛載後直接測量 scrollWrap 實際 clientWidth (已精確扣除右側垂直捲軸)
    const keyColWidth = 135;
    const safetyMargin = 12;
    if (!this.isUserZoomed && scrollWrap.clientWidth > 0) {
      const availableCanvasWidth = Math.max(480, scrollWrap.clientWidth - keyColWidth - safetyMargin);
      this.pixelsPerBar = Math.floor(availableCanvasWidth / 4);
    }

    const totalWidthPx = this.totalBars * this.pixelsPerBar;
    const beatsPerBar = this.timeSignature.numerator || 4;

    if (this.viewMode === 'drum-grid' && isDrum) {
      this.renderDrumStepGrid(scrollWrap);
    } else {
      this.renderPianoRoll(scrollWrap, totalWidthPx, beatsPerBar, isDrum);
    }

    // 恢復捲動位置 (避免點擊時畫面跳動)
    if (prevScrollLeft > 0) scrollWrap.scrollLeft = prevScrollLeft;
    if (prevScrollTop > 0) scrollWrap.scrollTop = prevScrollTop;

    // 3. 建立 CC 控制器自動化控制線 (Automation Lane)
    this.renderAutomationLane(totalWidthPx);

    // 4. 綁定力度控制項、模式切換、快速微調按鈕、量化、縮放與選取事件
    this.bindControls();

    // 恢復選取高亮與狀態
    this.updateSelectionUI(false);
  }

  /**
   * 🎹 渲染標準鋼琴卷軸視圖 (Piano Roll View)
   */
  private renderPianoRoll(
    scrollWrap: HTMLElement,
    totalWidthPx: number,
    beatsPerBar: number,
    isDrum: boolean
  ) {
    // 左側固定琴鍵 / 打擊樂名稱欄
    const keyCol = document.createElement('div');
    keyCol.className = 'editor-key-column';

    // 左上角空白角落 (對齊時間標尺)
    const corner = document.createElement('div');
    corner.className = 'editor-corner-cell';
    corner.textContent = '音高 / 樂器';
    keyCol.appendChild(corner);

    // 渲染各行琴鍵 / 樂器名稱
    this.rows.forEach(r => {
      const isC = !isDrum && (r.note % 12 === 0);
      const rowLabel = document.createElement('div');
      rowLabel.className = `editor-key-row ${r.isBlack ? 'is-black-key' : 'is-white-key'}${isC ? ' is-c-key' : ''}`;
      rowLabel.style.height = `${this.rowHeight}px`;

      if (r.icon) {
        rowLabel.innerHTML = `
          <span class="key-icon">${r.icon}</span>
          <span class="key-name" title="${r.label}">${r.label}</span>
          <span class="key-sub">${r.subLabel || ''}</span>
        `;
      } else {
        rowLabel.innerHTML = `
          <span class="key-name ${r.subLabel ? 'is-root' : ''}">${r.label}</span>
          ${r.subLabel ? '<span class="key-badge">根音</span>' : ''}
        `;
      }

      // 點擊琴鍵試聽 (若步進錄音開啟，亦可觸發單步錄入)
      rowLabel.addEventListener('click', () => {
        styPlaybackEngine.previewNote(this.channel, r.note, this.defaultVelocity);
        if (this.isStepRecording && this.stepRecorder) {
          this.stepRecorder.handleNoteOn(r.note, this.defaultVelocity);
          setTimeout(() => {
            this.stepRecorder?.handleNoteOff(r.note);
          }, 35);
        }
      });

      keyCol.appendChild(rowLabel);
    });

    scrollWrap.appendChild(keyCol);

    // 右側時間標尺與音符畫布容器
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'editor-canvas-wrap';
    canvasWrap.style.width = `${totalWidthPx}px`;

    // 頂部時間標尺 (Time Ruler)
    const timeRuler = document.createElement('div');
    timeRuler.className = `editor-time-ruler${this.isHighContrastGrid ? ' high-contrast-ruler' : ''}`;
    timeRuler.style.width = `${totalWidthPx}px`;

    for (let bar = 1; bar <= this.totalBars; bar++) {
      const barCell = document.createElement('div');
      barCell.className = `ruler-bar-cell ${bar % 2 === 0 ? 'is-even-bar' : ''}`;
      barCell.style.width = `${this.pixelsPerBar}px`;

      let beatsHtml = '';
      for (let b = 1; b <= beatsPerBar; b++) {
        beatsHtml += `<span class="ruler-beat-marker">${bar}.${b}</span>`;
      }

      barCell.innerHTML = `
        <div class="ruler-bar-title">第 ${bar} 小節</div>
        <div class="ruler-beats-row" style="grid-template-columns: repeat(${beatsPerBar}, 1fr);">${beatsHtml}</div>
      `;
      timeRuler.appendChild(barCell);
    }

    // 點擊時間標尺移動步進錄音游標
    timeRuler.addEventListener('click', (e) => {
      if (!this.isStepRecording || !this.stepRecorder) return;
      const rect = timeRuler.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1.0, clickX / totalWidthPx));
      const rawTick = Math.round(progress * this.totalTicks);
      const stepTicks = this.stepRecorder.getStepTicks();
      const snapTick = Math.min(this.totalTicks, Math.round(rawTick / stepTicks) * stepTicks);
      this.stepRecorder.seekToTick(snapTick);
      this.updateStepCursor();
    });

    canvasWrap.appendChild(timeRuler);

    // 網格底層與音符層
    const gridContent = document.createElement('div');
    gridContent.className = `editor-grid-content${this.isHighContrastGrid ? ' high-contrast-grid' : ''}`;
    gridContent.style.width = `${totalWidthPx}px`;
    gridContent.style.height = `${this.rows.length * this.rowHeight}px`;

    // 1. 繪製偶數小節斑馬紋條紋 (Zebra Stripes for alternating bars)
    for (let bar = 0; bar < this.totalBars; bar++) {
      if (bar % 2 === 1) {
        const barLeft = bar * this.pixelsPerBar;
        const stripe = document.createElement('div');
        stripe.className = 'grid-bar-stripe';
        stripe.style.left = `${barLeft}px`;
        stripe.style.width = `${this.pixelsPerBar}px`;
        stripe.style.height = `${this.rows.length * this.rowHeight}px`;
        gridContent.appendChild(stripe);
      }
    }

    // 2. 繪製背景水平行線 (含中央 C 與八度專屬導引光條)
    this.rows.forEach((r, idx) => {
      const isC = !isDrum && (r.note % 12 === 0);
      const line = document.createElement('div');
      line.className = `grid-row-bg ${r.isBlack ? 'row-black' : 'row-white'}${isC ? ' row-root-c' : ''}`;
      line.style.top = `${idx * this.rowHeight}px`;
      line.style.height = `${this.rowHeight}px`;
      line.style.width = `${totalWidthPx}px`;
      gridContent.appendChild(line);
    });

    // 3. 繪製多階層垂直格線 (小節線 + 正拍線 + 細分量化線)
    const ticksPerBar = Math.round(this.totalTicks / this.totalBars);
    const ticksPerBeat = Math.round(ticksPerBar / beatsPerBar);
    const stepTicks = QuantizeEngine.getGridStepTicks(this.quantizeGrid, this.division);
    const pxPerTick = totalWidthPx / this.totalTicks;

    for (let bar = 0; bar < this.totalBars; bar++) {
      const barStartTick = bar * ticksPerBar;
      const barLeft = barStartTick * pxPerTick;

      // 小節線 (Bar Line)
      const barLine = document.createElement('div');
      barLine.className = 'grid-v-line bar-line';
      barLine.style.left = `${barLeft}px`;
      barLine.style.height = `${this.rows.length * this.rowHeight}px`;
      gridContent.appendChild(barLine);

      // 小節內部拍線與細分線
      for (let b = 0; b < beatsPerBar; b++) {
        const beatStartTick = barStartTick + b * ticksPerBeat;
        const beatEndTick = beatStartTick + ticksPerBeat;

        // 若不是第 0 拍，繪製正拍線 (Beat line)
        if (b > 0) {
          const beatLeft = beatStartTick * pxPerTick;
          const beatLine = document.createElement('div');
          beatLine.className = 'grid-v-line beat-line';
          beatLine.style.left = `${beatLeft}px`;
          beatLine.style.height = `${this.rows.length * this.rowHeight}px`;
          gridContent.appendChild(beatLine);
        }

        // 繪製拍內細分量化線 (Sub-division lines)
        if (stepTicks < ticksPerBeat) {
          for (let subTick = beatStartTick + stepTicks; subTick < beatEndTick - 1; subTick += stepTicks) {
            const subLeft = subTick * pxPerTick;
            const subLine = document.createElement('div');
            subLine.className = 'grid-v-line sub-line';
            subLine.style.left = `${subLeft}px`;
            subLine.style.height = `${this.rows.length * this.rowHeight}px`;
            gridContent.appendChild(subLine);
          }
        }
      }
    }

    // 結尾小節線
    const endBarLine = document.createElement('div');
    endBarLine.className = 'grid-v-line bar-line end-bar-line';
    endBarLine.style.left = `${totalWidthPx - 2}px`;
    endBarLine.style.height = `${this.rows.length * this.rowHeight}px`;
    gridContent.appendChild(endBarLine);

    // 4. 十字游標即時導引線 (Crosshair Alignment Guides)
    const crosshairV = document.createElement('div');
    crosshairV.className = 'editor-crosshair-v';
    crosshairV.style.display = 'none';
    gridContent.appendChild(crosshairV);

    const crosshairH = document.createElement('div');
    crosshairH.className = 'editor-crosshair-h';
    crosshairH.style.display = 'none';
    gridContent.appendChild(crosshairH);

    // 繪製音符事件 (Notes)
    this.events.forEach((ev, idx) => {
      const rowIndex = this.rows.findIndex(r => r.note === ev.noteNumber);
      if (rowIndex === -1) return;

      const leftPx = (ev.relTick / this.totalTicks) * totalWidthPx;
      const widthPx = Math.max(12, (ev.durationTicks / this.totalTicks) * totalWidthPx);
      const topPx = rowIndex * this.rowHeight + 2;
      const heightPx = this.rowHeight - 4;

      const noteEl = document.createElement('div');
      noteEl.className = 'editor-note-block';
      noteEl.id = `ed-note-${idx}`;
      noteEl.style.left = `${leftPx}px`;
      noteEl.style.width = `${widthPx}px`;
      noteEl.style.top = `${topPx}px`;
      noteEl.style.height = `${heightPx}px`;
      noteEl.style.backgroundColor = this.partAccentColor;

      if (this.selectedEvents.has(ev)) {
        noteEl.classList.add('is-selected');
      }

      // 力度透明度對比 (亮度/飽和度)
      const velRatio = Math.max(0.3, Math.min(1.0, ev.velocity / 127));
      noteEl.style.opacity = `${0.5 + 0.5 * velRatio}`;

      const row = this.rows[rowIndex];
      noteEl.innerHTML = `
        <span class="note-block-text">${row.label} (${ev.velocity})</span>
        <div class="note-resize-handle" title="拖曳調整音符長度"></div>
      `;

      // 拖曳移位 (Pitch & Time) - 支援單選與多選批次移動
      noteEl.addEventListener('mousedown', (e) => {
        this.handleNoteMouseDown(e, ev, idx);
      });

      // 右鍵點擊直接刪除音符 (若在多選群組中則批次刪除)
      noteEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.selectedEvents.has(ev) && this.selectedEvents.size > 1) {
          this.deleteSelectedNotes();
        } else {
          this.deleteSingleEvent(ev);
        }
      });

      // 拖曳把手調整時值
      const resizeHandle = noteEl.querySelector('.note-resize-handle') as HTMLElement;
      resizeHandle.addEventListener('mousedown', (e) => {
        this.handleResizeMouseDown(e, ev, idx);
      });

      gridContent.appendChild(noteEl);
    });

    // 滑鼠於網格空白處：支援點擊新增音符，以及拖曳矩形框選 (Marquee Selection)
    let gridMouseDownX = 0;
    let gridMouseDownY = 0;
    let isMarquee = false;
    let marqueeEl: HTMLElement | null = null;
    let initialSelected = new Set<PlaybackNoteEvent>();

    gridContent.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.editor-note-block')) return;

      gridMouseDownX = e.clientX;
      gridMouseDownY = e.clientY;
      isMarquee = false;

      const rect = gridContent.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;

      if (!e.shiftKey) {
        this.selectedEvents.clear();
        this.updateSelectionUI(false);
      }
      initialSelected = new Set(this.selectedEvents);

      marqueeEl = document.createElement('div');
      marqueeEl.className = 'editor-marquee-box';
      marqueeEl.style.display = 'none';
      gridContent.appendChild(marqueeEl);

      const onGridMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - gridMouseDownX;
        const deltaY = moveEvent.clientY - gridMouseDownY;
        const dist = Math.hypot(deltaX, deltaY);

        if (!isMarquee && dist > 4) {
          isMarquee = true;
          if (marqueeEl) marqueeEl.style.display = 'block';
        }
        if (!isMarquee || !marqueeEl) return;

        const currentX = moveEvent.clientX - rect.left;
        const currentY = moveEvent.clientY - rect.top;

        const minX = Math.max(0, Math.min(startX, currentX));
        const maxX = Math.min(totalWidthPx, Math.max(startX, currentX));
        const minY = Math.max(0, Math.min(startY, currentY));
        const maxY = Math.min(this.rows.length * this.rowHeight, Math.max(startY, currentY));

        marqueeEl.style.left = `${minX}px`;
        marqueeEl.style.top = `${minY}px`;
        marqueeEl.style.width = `${maxX - minX}px`;
        marqueeEl.style.height = `${maxY - minY}px`;

        // 碰撞偵測 (AABB 矩形交集)
        const newlyIntersects = new Set<PlaybackNoteEvent>();
        this.events.forEach(ev => {
          const rowIndex = this.rows.findIndex(r => r.note === ev.noteNumber);
          if (rowIndex === -1) return;
          const noteLeft = (ev.relTick / this.totalTicks) * totalWidthPx;
          const noteWidth = Math.max(12, (ev.durationTicks / this.totalTicks) * totalWidthPx);
          const noteTop = rowIndex * this.rowHeight + 2;
          const noteHeight = this.rowHeight - 4;

          const collides = (
            minX <= noteLeft + noteWidth &&
            maxX >= noteLeft &&
            minY <= noteTop + noteHeight &&
            maxY >= noteTop
          );

          if (collides) {
            newlyIntersects.add(ev);
          }
        });

        if (e.shiftKey) {
          this.selectedEvents = new Set([...initialSelected, ...newlyIntersects]);
        } else {
          this.selectedEvents = newlyIntersects;
        }

        this.updateSelectionUI(false);
      };

      const onGridMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener('mousemove', onGridMouseMove);
        window.removeEventListener('mouseup', onGridMouseUp);

        if (marqueeEl) {
          marqueeEl.remove();
          marqueeEl = null;
        }

        if (isMarquee) {
          // 框選結束，更新最終 UI 與選取狀態並試聽
          this.updateSelectionUI(true);
          return;
        }

        // 非框選 (純點擊空白處) -> 新增音符
        const dist = Math.hypot(upEvent.clientX - gridMouseDownX, upEvent.clientY - gridMouseDownY);
        if (dist > 4) return;

        const clickX = upEvent.clientX - rect.left;
        const clickY = upEvent.clientY - rect.top;

        if (clickX >= 0 && clickX <= totalWidthPx && clickY >= 0 && clickY <= this.rows.length * this.rowHeight) {
          const rowIndex = Math.floor(clickY / this.rowHeight);
          if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const targetRow = this.rows[rowIndex];
            const stepTicks = this.getStepTicks();
            const rawTick = (clickX / totalWidthPx) * this.totalTicks;
            const quantizedTick = Math.floor(rawTick / stepTicks) * stepTicks;
            const clampedTick = Math.max(0, Math.min(this.totalTicks - stepTicks, quantizedTick));

            // 檢查該位置是否已有相同音高音符，若有則直接選取
            const existingEv = this.events.find(
              ev => ev.noteNumber === targetRow.note && Math.abs(ev.relTick - clampedTick) < stepTicks / 2
            );
            if (existingEv) {
              if (e.shiftKey) {
                if (this.selectedEvents.has(existingEv)) {
                  this.selectedEvents.delete(existingEv);
                } else {
                  this.selectedEvents.add(existingEv);
                }
              } else {
                this.selectedEvents.clear();
                this.selectedEvents.add(existingEv);
              }
              this.updateSelectionUI(true);
              return;
            }

            // 新增音符 (若該聲部未啟用，自動觸發啟用引導)
            if (!this.isChannelActive) {
              this.isChannelActive = true;
              this.onRequestActivate?.(this.channel);
            }

            const beforeSnapshot = this.events.map(e => ({ ...e }));
            const newNote: PlaybackNoteEvent = {
              channel: this.channel,
              sourceChannel: this.channel,
              noteNumber: targetRow.note,
              velocity: this.defaultVelocity,
              relTick: clampedTick,
              durationTicks: stepTicks,
              durationMs: 0,
            };

            this.events.push(newNote);
            this.events.sort((a, b) => a.relTick - b.relTick);
            this.notifyEventsChanged();
            this.pushHistory('新增音符', beforeSnapshot, this.events);
            this.selectedEvents.clear();
            this.selectedEvents.add(newNote);
            this.render();
            this.updateSelectionUI(true);
          }
        }
      };

      window.addEventListener('mousemove', onGridMouseMove);
      window.addEventListener('mouseup', onGridMouseUp);
    });

    // 滑鼠懸停十字對齊導引線 (Crosshair Guidelines)
    gridContent.addEventListener('mousemove', (e) => {
      if (isMarquee) {
        crosshairV.style.display = 'none';
        crosshairH.style.display = 'none';
        return;
      }
      const rect = gridContent.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mouseX < 0 || mouseX > totalWidthPx || mouseY < 0 || mouseY > this.rows.length * this.rowHeight) {
        crosshairV.style.display = 'none';
        crosshairH.style.display = 'none';
        return;
      }

      const rawProgress = Math.max(0, Math.min(1.0, mouseX / totalWidthPx));
      const rawTick = Math.round(rawProgress * this.totalTicks);
      const snappedTick = Math.min(this.totalTicks, Math.round(rawTick / stepTicks) * stepTicks);
      const snappedX = snappedTick * pxPerTick;

      crosshairV.style.left = `${snappedX}px`;
      crosshairV.style.height = `${this.rows.length * this.rowHeight}px`;
      crosshairV.style.display = 'block';

      const rowIndex = Math.floor(mouseY / this.rowHeight);
      if (rowIndex >= 0 && rowIndex < this.rows.length) {
        crosshairH.style.top = `${rowIndex * this.rowHeight}px`;
        crosshairH.style.height = `${this.rowHeight}px`;
        crosshairH.style.width = `${totalWidthPx}px`;
        crosshairH.style.display = 'block';
      }
    });

    gridContent.addEventListener('mouseleave', () => {
      crosshairV.style.display = 'none';
      crosshairH.style.display = 'none';
    });

    // 播放游標線 (GPU 加速 Translate3d)
    const playhead = document.createElement('div');
    playhead.className = 'editor-playhead';
    playhead.innerHTML = `<div class="playhead-cap"></div>`;
    playhead.style.height = `${this.rows.length * this.rowHeight + 36}px`;
    playhead.style.transform = `translate3d(0px, 0, 0)`;
    this.playheadEl = playhead;
    canvasWrap.appendChild(playhead);

    // 步進錄音游標線 (GPU 加速)
    const stepCursor = document.createElement('div');
    stepCursor.className = 'editor-step-cursor';
    stepCursor.innerHTML = `<div class="step-cursor-cap">📍 REC</div>`;
    stepCursor.style.height = `${this.rows.length * this.rowHeight + 36}px`;
    stepCursor.style.transform = `translate3d(0px, 0, 0)`;
    stepCursor.style.display = this.isStepRecording ? 'block' : 'none';
    this.stepCursorEl = stepCursor;
    canvasWrap.appendChild(stepCursor);

    canvasWrap.appendChild(gridContent);
    scrollWrap.appendChild(canvasWrap);
  }

  /**
   * 🥁 渲染 16-Step 鼓機步進矩陣視圖 (Drum Step Sequencer Grid)
   */
  private renderDrumStepGrid(scrollWrap: HTMLElement) {
    this.playheadEl = null;
    this.stepCursorEl = null;

    const beatsPerBar = this.timeSignature.numerator || 4;
    const stepsPerBar = beatsPerBar * 4;
    const totalSteps = this.totalBars * stepsPerBar;
    const ticksPerStep = Math.round(this.totalTicks / Math.max(1, totalSteps));

    // 1. 左側固定打擊樂名稱欄
    const keyCol = document.createElement('div');
    keyCol.className = 'editor-key-column drum-grid-key-col';

    const corner = document.createElement('div');
    corner.className = 'editor-corner-cell drum-grid-corner';
    corner.textContent = '打擊樂器 (點擊試聽)';
    keyCol.appendChild(corner);

    this.rows.forEach(r => {
      const rowLabel = document.createElement('div');
      rowLabel.className = 'editor-key-row drum-key-row';
      rowLabel.style.height = `${this.rowHeight}px`;
      rowLabel.innerHTML = `
        <span class="key-icon">${r.icon || '🥁'}</span>
        <span class="key-name" title="${r.label}">${r.label}</span>
        <span class="key-sub">${r.subLabel || ''}</span>
      `;
      // 點擊樂器名稱試聽
      rowLabel.addEventListener('click', () => {
        styPlaybackEngine.previewNote(this.channel, r.note, this.defaultVelocity);
      });
      keyCol.appendChild(rowLabel);
    });

    scrollWrap.appendChild(keyCol);

    // 2. 右側矩陣容器
    const matrixWrap = document.createElement('div');
    matrixWrap.className = 'drum-step-matrix-wrap';

    // 2.1 標尺頭部
    const header = document.createElement('div');
    header.className = 'drum-step-header';
    header.style.gridTemplateColumns = `repeat(${totalSteps}, minmax(30px, 1fr))`;

    for (let s = 0; s < totalSteps; s++) {
      const barIdx = Math.floor(s / stepsPerBar);
      const stepInBar = s % stepsPerBar;
      const beatInBar = Math.floor(stepInBar / 4) + 1;
      const subInBeat = (stepInBar % 4) + 1;

      const headerCell = document.createElement('div');
      headerCell.className = 'drum-header-step';
      headerCell.dataset.step = `${s}`;

      if (stepInBar === 0) {
        headerCell.classList.add('is-bar-start');
        headerCell.innerHTML = `<span class="step-bar-label">${barIdx + 1}</span>`;
      } else if (subInBeat === 1) {
        headerCell.classList.add('is-beat-start');
        headerCell.innerHTML = `<span class="step-beat-label">${barIdx + 1}.${beatInBar}</span>`;
      } else {
        headerCell.innerHTML = `<span class="step-sub-dot">·</span>`;
      }

      header.appendChild(headerCell);
    }
    matrixWrap.appendChild(header);

    // 2.2 矩陣本體 (各打擊樂行)
    const body = document.createElement('div');
    body.className = 'drum-step-body';

    this.rows.forEach(r => {
      const rowEl = document.createElement('div');
      rowEl.className = 'drum-step-row';
      rowEl.style.height = `${this.rowHeight}px`;
      rowEl.style.gridTemplateColumns = `repeat(${totalSteps}, minmax(30px, 1fr))`;

      for (let s = 0; s < totalSteps; s++) {
        const barIdx = Math.floor(s / stepsPerBar);
        const stepInBar = s % stepsPerBar;
        const beatInBar = Math.floor(stepInBar / 4) + 1;
        const subInBeat = (stepInBar % 4) + 1;

        // 檢查此步進位置是否有已存在音符
        const existingNote = this.events.find(
          e => e.noteNumber === r.note && Math.round(e.relTick / ticksPerStep) === s
        );

        const pad = document.createElement('div');
        pad.className = 'drum-step-pad';
        pad.dataset.note = `${r.note}`;
        pad.dataset.step = `${s}`;

        if (stepInBar === 0) {
          pad.classList.add('is-bar-start');
        } else if (subInBeat === 1) {
          pad.classList.add('is-beat-start');
        }

        const beatGroup = Math.floor(s / 4);
        if (beatGroup % 2 === 1) {
          pad.classList.add('is-alt-beat');
        }

        if (existingNote) {
          pad.classList.add('is-active');
          pad.style.setProperty('--pad-color', r.color || '#38bdf8');
          pad.innerHTML = `
            <span class="pad-led"></span>
            <span class="pad-vel-text">${existingNote.velocity}</span>
          `;
          pad.title = `${r.label} - 第 ${barIdx + 1} 小節 ${barIdx + 1}.${beatInBar}.${subInBeat} (力度: ${existingNote.velocity})，點擊清除`;
        } else {
          pad.title = `${r.label} - 第 ${barIdx + 1} 小節 ${barIdx + 1}.${beatInBar}.${subInBeat}，點擊點亮`;
        }

        pad.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDrumStep(r.note, s);
        });

        rowEl.appendChild(pad);
      }

      body.appendChild(rowEl);
    });

    matrixWrap.appendChild(body);
    scrollWrap.appendChild(matrixWrap);
  }

  /**
   * 🥁 切換 16-Step 鼓機步進格子開關 (點擊點亮 / 熄滅)
   * 支援即時試聽、歷史紀錄 (Ctrl+Z) 與播放器排程同步
   */
  public toggleDrumStep(noteNumber: number, stepIndex: number): boolean {
    const beatsPerBar = this.timeSignature.numerator || 4;
    const stepsPerBar = beatsPerBar * 4;
    const totalSteps = this.totalBars * stepsPerBar;
    const ticksPerStep = Math.round(this.totalTicks / Math.max(1, totalSteps));
    const stepTick = stepIndex * ticksPerStep;

    const existingIdx = this.events.findIndex(
      e => e.noteNumber === noteNumber && Math.round(e.relTick / ticksPerStep) === stepIndex
    );

    const row = this.rows.find(r => r.note === noteNumber) || { label: `Note ${noteNumber}` };
    const barNum = Math.floor(stepIndex / stepsPerBar) + 1;
    const beatInBar = Math.floor((stepIndex % stepsPerBar) / 4) + 1;
    const subInBeat = ((stepIndex % stepsPerBar) % 4) + 1;
    const beforeSnapshot = this.events.map(e => ({ ...e }));

    if (existingIdx !== -1) {
      // 亮燈 -> 熄滅 (刪除音符)
      this.events.splice(existingIdx, 1);
      this.notifyEventsChanged();
      this.pushHistory(`刪除鼓點: ${row.label} (第 ${barNum} 小節 ${barNum}.${beatInBar}.${subInBeat})`, beforeSnapshot, this.events);
      this.render();
      if (this.velStatus) {
        this.velStatus.textContent = `🗑️ 已清除 ${row.label} (第 ${barNum} 小節 ${barNum}.${beatInBar}.${subInBeat})`;
      }
      return false;
    } else {
      // 暗燈 -> 點亮 (新增音符)
      const newNote: PlaybackNoteEvent = {
        channel: this.channel,
        sourceChannel: this.channel,
        noteNumber,
        velocity: this.defaultVelocity,
        relTick: stepTick,
        durationTicks: ticksPerStep,
        durationMs: 0,
      };

      this.events.push(newNote);
      this.events.sort((a, b) => a.relTick - b.relTick || a.noteNumber - b.noteNumber);
      this.notifyEventsChanged();
      this.pushHistory(`新增鼓點: ${row.label} (第 ${barNum} 小節 ${barNum}.${beatInBar}.${subInBeat})`, beforeSnapshot, this.events);
      this.render();

      try {
        styPlaybackEngine.previewNote(this.channel, noteNumber, this.defaultVelocity, 180);
      } catch {
        // 略過無音訊輸出環境
      }

      if (this.velStatus) {
        this.velStatus.textContent = `🥁 已加入 ${row.label} (第 ${barNum} 小節 ${barNum}.${beatInBar}.${subInBeat}，力度: ${this.defaultVelocity})`;
      }
      return true;
    }
  }

  /**
   * 取得當前視圖模式
   */
  public getViewMode(): 'piano-roll' | 'drum-grid' {
    return this.viewMode;
  }

  /**
   * 切換視圖模式 (僅在鼓組/打擊樂聲部支援 drum-grid)
   */
  public setViewMode(mode: 'piano-roll' | 'drum-grid') {
    const isDrum = styPlaybackEngine.isChannelDrum(this.channel);
    if (mode === 'drum-grid' && !isDrum) {
      if (this.velStatus) {
        this.velStatus.textContent = '⚠️ 僅打擊樂 / 鼓組聲部支援 16-Step 步進矩陣模式';
      }
      return;
    }
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.render();
  }

  /**
   * 處理音符選取與拖曳移位 (Pitch & Time) - 支援單顆與多選批次移動
   */
  private handleNoteMouseDown(e: MouseEvent, targetEvent: PlaybackNoteEvent, _noteIdx?: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).classList.contains('note-resize-handle')) return;
    e.stopPropagation();
    e.preventDefault();

    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const wasAlreadySelected = this.selectedEvents.has(targetEvent);

    if (e.shiftKey) {
      if (wasAlreadySelected) {
        this.selectedEvents.delete(targetEvent);
        this.updateSelectionUI(false);
        return; // 取消選取後不執行拖曳
      } else {
        this.selectedEvents.add(targetEvent);
        this.updateSelectionUI(true);
      }
    } else {
      if (!wasAlreadySelected) {
        this.selectedEvents.clear();
        this.selectedEvents.add(targetEvent);
        this.updateSelectionUI(true);
      }
    }

    const beforeDragSnapshot = this.events.map(e => ({ ...e }));
    // 收集所有要一起拖曳的音符群組
    const dragNotes = Array.from(this.selectedEvents).map(ev => {
      const startRowIndex = this.rows.findIndex(r => r.note === ev.noteNumber);
      const evIdx = this.events.indexOf(ev);
      const el = this.container.querySelector(`#ed-note-${evIdx}`) as HTMLElement | null;
      return {
        event: ev,
        startRelTick: ev.relTick,
        startNoteNumber: ev.noteNumber,
        startRowIndex,
        durationTicks: ev.durationTicks,
        el,
      };
    });

    const stepTicks = this.getStepTicks();
    const totalWidthPx = this.totalBars * this.pixelsPerBar;
    let hasMoved = false;

    let appliedDeltaTicks = 0;
    let appliedDeltaRow = 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      if (!hasMoved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        hasMoved = true;
        dragNotes.forEach(n => n.el?.classList.add('is-dragging'));
      }
      if (!hasMoved) return;

      // 計算時間差量 (量化吸附)
      const deltaTicks = (deltaX / totalWidthPx) * this.totalTicks;
      const quantizedDeltaTicks = Math.round(deltaTicks / stepTicks) * stepTicks;

      // 縱向音高差量
      const deltaRow = Math.round(deltaY / this.rowHeight);

      // 極限邊界約束 (保證群組中沒有任何一顆音符超出 0~totalTicks 或音高上下界)
      const minStartTick = Math.min(...dragNotes.map(n => n.startRelTick));
      const maxEndTick = Math.max(...dragNotes.map(n => n.startRelTick + n.durationTicks));
      const clampedDeltaTicks = (Math.max(
        -minStartTick,
        Math.min(this.totalTicks - maxEndTick, quantizedDeltaTicks)
      ) || 0);

      const validRows = dragNotes.filter(n => n.startRowIndex >= 0);
      const minRow = validRows.length > 0 ? Math.min(...validRows.map(n => n.startRowIndex)) : 0;
      const maxRow = validRows.length > 0 ? Math.max(...validRows.map(n => n.startRowIndex)) : 0;
      const clampedDeltaRow = (Math.max(
        -minRow,
        Math.min(this.rows.length - 1 - maxRow, deltaRow)
      ) || 0);

      appliedDeltaTicks = clampedDeltaTicks;
      appliedDeltaRow = clampedDeltaRow;

      // 即時更新所有被拖曳音符的 DOM 位置
      dragNotes.forEach(n => {
        if (!n.el) return;
        const curTick = n.startRelTick + clampedDeltaTicks;
        const curRow = n.startRowIndex + clampedDeltaRow;
        const newLeftPx = (curTick / this.totalTicks) * totalWidthPx;
        const newTopPx = curRow * this.rowHeight + 2;
        n.el.style.left = `${newLeftPx}px`;
        n.el.style.top = `${newTopPx}px`;

        const row = this.rows[curRow];
        const textEl = n.el.querySelector('.note-block-text');
        if (textEl && row) {
          textEl.textContent = `${row.label} (${n.event.velocity})`;
        }
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      dragNotes.forEach(n => n.el?.classList.remove('is-dragging'));

      if (hasMoved) {
        const didChange = appliedDeltaTicks !== 0 || appliedDeltaRow !== 0;
        if (didChange) {
          dragNotes.forEach(n => {
            n.event.relTick = n.startRelTick + appliedDeltaTicks;
            if (n.startRowIndex >= 0) {
              const newRow = n.startRowIndex + appliedDeltaRow;
              n.event.noteNumber = this.rows[newRow]?.note ?? n.startNoteNumber;
            }
          });

          this.events.sort((a, b) => a.relTick - b.relTick);
          this.notifyEventsChanged();
          this.pushHistory(`移動 ${dragNotes.length} 個音符`, beforeDragSnapshot, this.events);
          this.render();
          this.updateSelectionUI(true);
          return;
        }
      }

      // 未發生實質拖曳：若是點擊原先多選群組中的一顆且未按 Shift，則將選取收縮至僅該音符
      if (!e.shiftKey && wasAlreadySelected && this.selectedEvents.size > 1) {
        this.selectedEvents.clear();
        this.selectedEvents.add(targetEvent);
        this.updateSelectionUI(true);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /**
   * 處理音符時值拉長/縮短 (Resize Duration)
   */
  private handleResizeMouseDown(e: MouseEvent, targetEvent: PlaybackNoteEvent, noteIdx: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startRelTick = targetEvent.relTick;
    const startDurationTicks = targetEvent.durationTicks;
    const stepTicks = this.getStepTicks();
    const minDuration = Math.max(20, Math.floor(stepTicks / 2));
    const totalWidthPx = this.totalBars * this.pixelsPerBar;

    let hasResized = false;
    let currentDuration = startDurationTicks;
    const beforeResizeSnapshot = this.events.map(e => ({ ...e }));

    const noteEl = this.container.querySelector(`#ed-note-${noteIdx}`) as HTMLElement;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (!hasResized && Math.abs(deltaX) > 4) {
        hasResized = true;
        if (noteEl) noteEl.classList.add('is-dragging');
      }
      if (!hasResized) return;

      const deltaTicks = (deltaX / totalWidthPx) * this.totalTicks;
      const rawNewDuration = startDurationTicks + deltaTicks;
      const quantizedDuration = Math.round(rawNewDuration / stepTicks) * stepTicks;
      const maxDuration = this.totalTicks - startRelTick;
      currentDuration = Math.max(minDuration, Math.min(maxDuration, quantizedDuration));

      if (noteEl) {
        const newWidthPx = Math.max(12, (currentDuration / this.totalTicks) * totalWidthPx);
        noteEl.style.width = `${newWidthPx}px`;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (noteEl) noteEl.classList.remove('is-dragging');

      if (hasResized && currentDuration !== startDurationTicks) {
        targetEvent.durationTicks = currentDuration;
        this.notifyEventsChanged();
        this.pushHistory('調整音符時值', beforeResizeSnapshot, this.events);
        this.render();
        this.selectedEvents.clear();
        this.selectedEvents.add(targetEvent);
        this.updateSelectionUI(true);
      } else {
        this.selectedEvents.clear();
        this.selectedEvents.add(targetEvent);
        this.updateSelectionUI(true);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /**
   * 批次刪除所有選取的音符
   */
  public deleteSelectedNotes() {
    if (this.selectedEvents.size === 0) return;
    const count = this.selectedEvents.size;
    const beforeSnapshot = this.events.map(e => ({ ...e }));
    this.events = this.events.filter(e => !this.selectedEvents.has(e));
    this.selectedEvents.clear();
    this.initialVelocities.clear();
    this.notifyEventsChanged();
    this.pushHistory(`刪除 ${count} 個音符`, beforeSnapshot, this.events);
    this.render();
    if (this.velStatus) {
      this.velStatus.textContent = `已刪除 ${count} 個選取音符`;
    }
  }

  /**
   * 刪除特定單一音符
   */
  public deleteSingleEvent(ev: PlaybackNoteEvent) {
    const idx = this.events.indexOf(ev);
    if (idx === -1) return;
    const beforeSnapshot = this.events.map(e => ({ ...e }));
    this.events.splice(idx, 1);
    this.selectedEvents.delete(ev);
    this.initialVelocities.delete(ev);
    this.notifyEventsChanged();
    this.pushHistory('刪除音符', beforeSnapshot, this.events);
    this.render();
    if (this.velStatus) {
      const row = this.rows.find(r => r.note === ev.noteNumber);
      this.velStatus.textContent = `已刪除音符: ${row?.label || ev.noteNumber}`;
    }
  }

  /**
   * 兼顧舊 API (刪除特定索引之音符)
   */
  public deleteNote(index: number) {
    if (index < 0 || index >= this.events.length) return;
    const ev = this.events[index];
    if (this.selectedEvents.has(ev) && this.selectedEvents.size > 1) {
      this.deleteSelectedNotes();
    } else {
      this.deleteSingleEvent(ev);
    }
  }

  /**
   * 全選當前軌道所有音符 (Ctrl+A)
   */
  public selectAllNotes() {
    this.selectedEvents = new Set(this.events);
    this.updateSelectionUI(false);
  }

  /**
   * 清除所有選取 (Escape 或點擊空白處)
   */
  public clearSelection() {
    this.selectedEvents.clear();
    this.initialVelocities.clear();
    this.updateSelectionUI(false);
  }

  /**
   * 取得當前所有被選取的音符清單
   */
  public getSelectedEvents(): PlaybackNoteEvent[] {
    return Array.from(this.selectedEvents);
  }

  /**
   * 選中特定音符 (相容單引數 API)
   */
  public selectNote(index: number | null) {
    if (index === null || index < 0 || index >= this.events.length) {
      this.clearSelection();
    } else {
      this.selectedEvents.clear();
      this.selectedEvents.add(this.events[index]);
      this.updateSelectionUI(true);
    }
  }

  /**
   * 設定多選力度調整模式 ('relative' 相對增減 | 'absolute' 絕對統一)
   */
  public setVelocityMode(mode: 'relative' | 'absolute') {
    this.velocityMode = mode;
    const btnRel = this.container.querySelector('#ed-vel-mode-rel');
    const btnAbs = this.container.querySelector('#ed-vel-mode-abs');
    if (mode === 'relative') {
      btnRel?.classList.add('active');
      btnAbs?.classList.remove('active');
    } else {
      btnAbs?.classList.add('active');
      btnRel?.classList.remove('active');
    }
    this.snapshotInitialVelocities();
    if (this.velStatus && this.selectedEvents.size > 1) {
      this.velStatus.textContent = mode === 'relative' 
        ? `模式: 相對增減 (保留 ${this.selectedEvents.size} 顆音符原強弱動態)` 
        : `模式: 絕對統一 (將 ${this.selectedEvents.size} 顆音符設為相同值)`;
    }
  }

  /**
   * ⚡ 快速微調力度階梯 (例如 +10, +5, -5, -10)
   */
  public nudgeVelocity(delta: number) {
    if (this.selectedEvents.size === 0) {
      this.defaultVelocity = Math.max(1, Math.min(127, this.defaultVelocity + delta));
      if (this.velSlider && this.velInput) {
        this.velSlider.value = this.defaultVelocity.toString();
        this.velInput.value = this.defaultVelocity.toString();
      }
      if (this.velStatus) {
        this.velStatus.textContent = `預設寫入力度: ${this.defaultVelocity}`;
      }
      return;
    }

    const beforeNudgeSnapshot = this.events.map(e => ({ ...e }));
    this.selectedEvents.forEach(ev => {
      ev.velocity = Math.max(1, Math.min(127, ev.velocity + delta));
      this.updateNoteBlockVelocityUI(ev, ev.velocity);
    });

    this.notifyEventsChanged();
    this.snapshotInitialVelocities();
    const sign = delta >= 0 ? `+${delta}` : `${delta}`;
    this.pushHistory(`微調力度 (${sign})`, beforeNudgeSnapshot, this.events);

    if (this.velSlider && this.velInput) {
      this.velSlider.value = this.baselineAverageVelocity.toString();
      this.velInput.value = this.baselineAverageVelocity.toString();
    }

    if (this.velStatus) {
      const sign = delta >= 0 ? `+${delta}` : `${delta}`;
      this.velStatus.textContent = `已微調 ${this.selectedEvents.size} 個音符 (力度 ${sign} | 平均: ${this.baselineAverageVelocity})`;
    }

    // 試聽最高音
    const highest = [...this.selectedEvents].sort((a, b) => b.noteNumber - a.noteNumber)[0];
    if (highest) {
      styPlaybackEngine.previewNote(this.channel, highest.noteNumber, highest.velocity, 180);
    }
  }

  /**
   * 🎲 人性化隨機力度微調 (Humanize ±range)
   */
  public humanizeVelocity(range: number = 8) {
    if (this.selectedEvents.size === 0) {
      if (this.velStatus) {
        this.velStatus.textContent = '請先框選欲加入人性化動態的音符群組';
      }
      return;
    }

    const beforeHumanizeSnapshot = this.events.map(e => ({ ...e }));
    this.selectedEvents.forEach(ev => {
      const jitter = Math.floor(Math.random() * (range * 2 + 1)) - range;
      ev.velocity = Math.max(1, Math.min(127, ev.velocity + jitter));
      this.updateNoteBlockVelocityUI(ev, ev.velocity);
    });

    this.notifyEventsChanged();
    this.snapshotInitialVelocities();
    this.pushHistory('人性化隨機力度', beforeHumanizeSnapshot, this.events);

    if (this.velSlider && this.velInput) {
      this.velSlider.value = this.baselineAverageVelocity.toString();
      this.velInput.value = this.baselineAverageVelocity.toString();
    }

    if (this.velStatus) {
      this.velStatus.textContent = `已為 ${this.selectedEvents.size} 個音符加入人性化隨機律動 (±${range})`;
    }

    // 試聽反饋
    const highest = [...this.selectedEvents].sort((a, b) => b.noteNumber - a.noteNumber)[0];
    if (highest) {
      styPlaybackEngine.previewNote(this.channel, highest.noteNumber, highest.velocity, 200);
    }
  }

  /**
   * 即時更新特定音符方塊在 DOM 上的力度數值與透明度
   */
  private updateNoteBlockVelocityUI(ev: PlaybackNoteEvent, vel: number) {
    const idx = this.events.indexOf(ev);
    if (idx === -1) return;
    const noteEl = this.container.querySelector(`#ed-note-${idx}`) as HTMLElement;
    if (noteEl) {
      const velRatio = Math.max(0.3, Math.min(1.0, vel / 127));
      noteEl.style.opacity = `${0.5 + 0.5 * velRatio}`;
      const row = this.rows.find(r => r.note === ev.noteNumber);
      const textEl = noteEl.querySelector('.note-block-text');
      if (textEl && row) {
        textEl.textContent = `${row.label} (${vel})`;
      }
    }
  }

  /**
   * 更新選取相關的 UI 元件樣式、力度拉桿與狀態欄
   */
  public updateSelectionUI(previewSound: boolean = false) {
    // 1. 同步所有音符方塊的 is-selected 樣式
    this.events.forEach((ev, idx) => {
      const el = this.container.querySelector(`#ed-note-${idx}`);
      if (el) {
        if (this.selectedEvents.has(ev)) {
          el.classList.add('is-selected');
        } else {
          el.classList.remove('is-selected');
        }
      }
    });

    const btnDelete = this.container.querySelector('#ed-btn-delete') as HTMLElement | null;
    const count = this.selectedEvents.size;

    if (btnDelete) {
      btnDelete.textContent = count > 1 ? `🗑️ 刪除 (${count})` : `🗑️ 刪除音符`;
    }

    // 拍下快照
    this.snapshotInitialVelocities();

    if (count === 0) {
      if (this.velStatus) {
        this.velStatus.textContent = `預設寫入力度: ${this.defaultVelocity}`;
      }
      if (this.velSlider && this.velInput) {
        this.velSlider.value = this.defaultVelocity.toString();
        this.velInput.value = this.defaultVelocity.toString();
      }
    } else if (count === 1) {
      const ev = Array.from(this.selectedEvents)[0];
      const row = this.rows.find(r => r.note === ev.noteNumber);
      if (this.velStatus) {
        this.velStatus.textContent = `選取音符: ${row?.label || ev.noteNumber} (Tick: ${ev.relTick}) | 力度: ${ev.velocity}`;
      }
      if (this.velSlider && this.velInput) {
        this.velSlider.value = ev.velocity.toString();
        this.velInput.value = ev.velocity.toString();
      }
      if (previewSound) {
        try {
          styPlaybackEngine.previewNote(this.channel, ev.noteNumber, ev.velocity, 220);
        } catch {
          // 略過無音訊硬體環境
        }
      }
    } else {
      // 多選狀態
      const modeLabel = this.velocityMode === 'relative' ? '相對' : '統一';
      if (this.velStatus) {
        this.velStatus.textContent = `已選取 ${count} 個音符 [${modeLabel}] (平均力度: ${this.baselineAverageVelocity})`;
      }
      if (this.velSlider && this.velInput) {
        this.velSlider.value = this.baselineAverageVelocity.toString();
        this.velInput.value = this.baselineAverageVelocity.toString();
      }
      if (previewSound) {
        try {
          const highest = [...this.selectedEvents].sort((a, b) => b.noteNumber - a.noteNumber)[0];
          styPlaybackEngine.previewNote(this.channel, highest.noteNumber, highest.velocity, 220);
        } catch {
          // 略過無音訊硬體環境
        }
      }
    }
  }

  /**
   * 綁定控制項（拉桿 ↔ 數字框雙向連動、量化選單、刪除鈕、縮放按鈕、模式切換鈕、微調鈕）
   */
  private bindControls() {
    this.velSlider = this.container.querySelector('#ed-vel-slider') as HTMLInputElement;
    this.velInput = this.container.querySelector('#ed-vel-input') as HTMLInputElement;
    this.velStatus = this.container.querySelector('#ed-vel-status');

    if (this.velSlider && this.velInput) {
      // 拉桿按下去的一瞬間，先對基準數值與音符拍照快照
      this.velSlider.addEventListener('pointerdown', () => {
        this.snapshotInitialVelocities();
        this.velocityDragBeforeSnapshot = this.events.map(e => ({ ...e }));
      });

      // 拉桿事件
      this.velSlider.addEventListener('input', () => {
        const val = parseInt(this.velSlider!.value, 10);
        this.velInput!.value = val.toString();
        this.applyVelocityChange(val);
      });

      // 拉桿放開後觸發一次試聽並推入歷史紀錄
      this.velSlider.addEventListener('change', () => {
        const val = parseInt(this.velSlider!.value, 10);
        this.snapshotInitialVelocities();
        if (this.velocityDragBeforeSnapshot) {
          const changed = this.velocityDragBeforeSnapshot.some((orig, i) => orig.velocity !== this.events[i]?.velocity);
          if (changed) {
            this.pushHistory('調整力度', this.velocityDragBeforeSnapshot, this.events);
          }
          this.velocityDragBeforeSnapshot = null;
        }
        if (this.selectedEvents.size > 0) {
          const highest = [...this.selectedEvents].sort((a, b) => b.noteNumber - a.noteNumber)[0];
          styPlaybackEngine.previewNote(this.channel, highest.noteNumber, val, 200);
        }
      });

      // 數字框事件
      this.velInput.addEventListener('focus', () => {
        this.velocityDragBeforeSnapshot = this.events.map(e => ({ ...e }));
      });
      this.velInput.addEventListener('change', () => {
        let val = parseInt(this.velInput!.value, 10);
        if (isNaN(val)) val = 100;
        val = Math.max(1, Math.min(127, val));
        this.velInput!.value = val.toString();
        this.velSlider!.value = val.toString();
        const before = this.velocityDragBeforeSnapshot || this.events.map(e => ({ ...e }));
        this.applyVelocityChange(val);
        this.snapshotInitialVelocities();
        const changed = before.some((orig, i) => orig.velocity !== this.events[i]?.velocity);
        if (changed) {
          this.pushHistory('設定力度', before, this.events);
        }
        this.velocityDragBeforeSnapshot = null;
      });
    }

    // 模式切換按鈕
    const btnRel = this.container.querySelector('#ed-vel-mode-rel');
    const btnAbs = this.container.querySelector('#ed-vel-mode-abs');
    btnRel?.addEventListener('click', () => this.setVelocityMode('relative'));
    btnAbs?.addEventListener('click', () => this.setVelocityMode('absolute'));

    // ⚡ 快速微調階梯按鈕
    this.container.querySelector('#ed-vel-nudge-m10')?.addEventListener('click', () => this.nudgeVelocity(-10));
    this.container.querySelector('#ed-vel-nudge-m5')?.addEventListener('click', () => this.nudgeVelocity(-5));
    this.container.querySelector('#ed-vel-nudge-p5')?.addEventListener('click', () => this.nudgeVelocity(5));
    this.container.querySelector('#ed-vel-nudge-p10')?.addEventListener('click', () => this.nudgeVelocity(10));
    this.container.querySelector('#ed-vel-humanize')?.addEventListener('click', () => this.humanizeVelocity(8));

    // 點擊音色標籤開啟音色選擇器
    const voiceTag = this.container.querySelector('.editor-voice-tag');
    voiceTag?.addEventListener('click', () => {
      if (this.onOpenVoicePicker) {
        this.onOpenVoicePicker(this.channel);
      }
    });

    // 點擊「➕ 點此啟用聲部」標籤
    const pillActivate = this.container.querySelector('#ed-pill-activate');
    pillActivate?.addEventListener('click', () => {
      if (this.onOpenVoicePicker) {
        this.onOpenVoicePicker(this.channel);
      }
    });

    // 量化解析度下拉選單 (Tier 2-2)
    const quantizeSelect = this.container.querySelector('#ed-quantize-select') as HTMLSelectElement;
    quantizeSelect?.addEventListener('change', () => {
      const val = quantizeSelect.value;
      if (val === '16' || val === '1/16') { this.quantizeGrid = '1/16'; }
      else if (val === '8' || val === '1/8') { this.quantizeGrid = '1/8'; }
      else if (val === '4' || val === '1/4') { this.quantizeGrid = '1/4'; }
      else if (val === '32' || val === '1/32') { this.quantizeGrid = '1/32'; }
      else {
        this.quantizeGrid = val as QuantizeGridType;
      }
      if (this.velStatus) {
        this.velStatus.textContent = `量化解析度已設為 ${this.quantizeGrid}`;
      }
      this.render();
    });

    // ⚡ 立即量化按鈕 (Q)
    const btnQuantizeNow = this.container.querySelector('#ed-btn-quantize-now');
    btnQuantizeNow?.addEventListener('click', () => {
      this.executeQuantize();
    });

    // ⚙️ 律動設定抽屜按鈕
    const btnQSettings = this.container.querySelector('#ed-btn-quantize-settings');
    const qPanel = this.container.querySelector('#ed-quantize-panel') as HTMLElement;
    btnQSettings?.addEventListener('click', () => {
      this.isQuantizePanelOpen = !this.isQuantizePanelOpen;
      if (qPanel) {
        qPanel.style.display = this.isQuantizePanelOpen ? 'flex' : 'none';
      }
      btnQSettings.classList.toggle('active', this.isQuantizePanelOpen);
    });

    // 強度滑桿
    const sliderQStrength = this.container.querySelector('#ed-q-strength-slider') as HTMLInputElement;
    const badgeQStrength = this.container.querySelector('#ed-q-strength-val');
    sliderQStrength?.addEventListener('input', () => {
      this.quantizeStrength = parseInt(sliderQStrength.value, 10) || 100;
      if (badgeQStrength) badgeQStrength.textContent = `${this.quantizeStrength}%`;
    });

    // 搖擺滑桿
    const sliderQSwing = this.container.querySelector('#ed-q-swing-slider') as HTMLInputElement;
    const badgeQSwing = this.container.querySelector('#ed-q-swing-val');
    sliderQSwing?.addEventListener('input', () => {
      this.quantizeSwing = parseInt(sliderQSwing.value, 10) || 50;
      if (badgeQSwing) {
        badgeQSwing.textContent = this.quantizeSwing === 50
          ? '50% (直音)'
          : (this.quantizeSwing === 67 ? '67% (Shuffle)' : `${this.quantizeSwing}%`);
      }
    });

    // 時值量化勾選
    const chkQLengths = this.container.querySelector('#ed-q-chk-lengths') as HTMLInputElement;
    chkQLengths?.addEventListener('change', () => {
      this.quantizeLengths = chkQLengths.checked;
    });

    // 🔁 複製第 1 小節填滿全段按鈕
    const btnFillBars = this.container.querySelector('#ed-btn-fill-bars');
    btnFillBars?.addEventListener('click', () => {
      this.fillRemainingBarsFromBar1();
    });

    // 🥁 視圖切換 (鋼琴卷軸 vs 16-Step 鼓機矩陣)
    const btnPianoRoll = this.container.querySelector('#ed-view-pianoroll');
    const btnDrumGrid = this.container.querySelector('#ed-view-drumgrid');
    btnPianoRoll?.addEventListener('click', () => {
      this.setViewMode('piano-roll');
    });
    btnDrumGrid?.addEventListener('click', () => {
      this.setViewMode('drum-grid');
    });

    // ↩️ 復原 / ↪️ 重做按鈕
    const btnUndo = this.container.querySelector('#ed-btn-undo');
    const btnRedo = this.container.querySelector('#ed-btn-redo');
    btnUndo?.addEventListener('click', () => this.undo());
    btnRedo?.addEventListener('click', () => this.redo());
    this.updateHistoryButtons();

    // 刪除按鈕
    const btnDelete = this.container.querySelector('#ed-btn-delete');
    btnDelete?.addEventListener('click', () => {
      if (this.selectedEvents.size > 0) {
        this.deleteSelectedNotes();
      } else {
        if (this.velStatus) {
          this.velStatus.textContent = '請先點選或框選欲刪除的音符';
        }
      }
    });

    // 🎛️ CC 控制線展開/隱藏切換
    const btnToggleLane = this.container.querySelector('#ed-btn-toggle-lane');
    btnToggleLane?.addEventListener('click', () => {
      this.isLaneVisible = !this.isLaneVisible;
      btnToggleLane.classList.toggle('active', this.isLaneVisible);
      const laneWrap = this.container.querySelector('#ed-automation-lane-wrap') as HTMLElement | null;
      if (laneWrap) {
        laneWrap.style.display = this.isLaneVisible ? 'flex' : 'none';
      }
      if (this.isLaneVisible) {
        const totalWidthPx = this.totalBars * this.pixelsPerBar;
        this.drawAutomationLaneSVG(totalWidthPx);
        if (this.laneScrollEl && this.gridScrollEl) {
          this.laneScrollEl.scrollLeft = this.gridScrollEl.scrollLeft;
        }
      }
    });

    // 縮放按鈕與高對比格線按鈕
    const btnGridContrast = this.container.querySelector('#ed-btn-grid-contrast');
    btnGridContrast?.addEventListener('click', () => {
      this.isHighContrastGrid = !this.isHighContrastGrid;
      this.render();
    });

    const btnFit4 = this.container.querySelector('#ed-btn-fit-4');
    const btnFitAll = this.container.querySelector('#ed-btn-fit-all');
    const btnZoomIn = this.container.querySelector('#ed-btn-zoom-in');
    const btnZoomOut = this.container.querySelector('#ed-btn-zoom-out');

    btnFit4?.addEventListener('click', () => {
      this.isUserZoomed = false;
      this.render();
    });

    btnFitAll?.addEventListener('click', () => {
      this.isUserZoomed = true;
      if (this.gridScrollEl && this.gridScrollEl.clientWidth > 0) {
        const availableCanvasWidth = Math.max(480, this.gridScrollEl.clientWidth - 135 - 12);
        this.pixelsPerBar = Math.max(80, Math.floor(availableCanvasWidth / Math.max(1, this.totalBars)));
      }
      this.render();
    });

    btnZoomIn?.addEventListener('click', () => {
      this.pixelsPerBar = Math.min(600, this.pixelsPerBar + 30);
      this.isUserZoomed = true;
      this.render();
    });

    btnZoomOut?.addEventListener('click', () => {
      this.pixelsPerBar = Math.max(120, this.pixelsPerBar - 30);
      this.isUserZoomed = true;
      this.render();
    });

    // 🔴 步進錄音控制項綁定
    const btnStepRec = this.container.querySelector('#ed-btn-step-rec');
    btnStepRec?.addEventListener('click', () => {
      this.toggleStepRecording();
    });

    const stepResSelect = this.container.querySelector('#ed-step-res-select') as HTMLSelectElement | null;
    stepResSelect?.addEventListener('change', () => {
      if (stepResSelect.value) {
        this.stepResolution = stepResSelect.value as StepResolution;
        if (this.stepRecorder) {
          this.stepRecorder.setResolution(this.stepResolution);
        }
        if (this.velStatus) {
          this.velStatus.textContent = `步進解析度已設為 ${this.stepResolution}`;
        }
        this.updateStepCursor();
      }
    });

    const stepVelModeSelect = this.container.querySelector('#ed-step-vel-mode') as HTMLSelectElement | null;
    stepVelModeSelect?.addEventListener('change', () => {
      if (stepVelModeSelect.value) {
        this.stepVelocityMode = stepVelModeSelect.value as 'as-played' | 'fixed';
        if (this.stepRecorder) {
          this.stepRecorder.configure({ velocityMode: this.stepVelocityMode });
        }
      }
    });

    this.container.querySelector('#ed-btn-step-rest')?.addEventListener('click', () => {
      this.insertRest();
    });

    this.container.querySelector('#ed-btn-step-tie')?.addEventListener('click', () => {
      this.tiePreviousNote();
    });

    this.container.querySelector('#ed-btn-step-back')?.addEventListener('click', () => {
      this.stepBack();
    });

    this.container.querySelector('#ed-btn-step-rewind')?.addEventListener('click', () => {
      this.rewindStepCursor();
    });

    this.updateStepCursor();
  }

  /**
   * 套用力度的變更 (支援單選、📈 相對增減與 🎯 絕對統一)
   */
  private applyVelocityChange(newVal: number) {
    if (this.selectedEvents.size === 0) {
      this.defaultVelocity = newVal;
      if (this.velStatus) {
        this.velStatus.textContent = `預設寫入力度: ${newVal}`;
      }
      return;
    }

    if (this.selectedEvents.size === 1) {
      const ev = Array.from(this.selectedEvents)[0];
      ev.velocity = newVal;
      this.updateNoteBlockVelocityUI(ev, newVal);

      if (this.velStatus) {
        const row = this.rows.find(r => r.note === ev.noteNumber);
        this.velStatus.textContent = `已修改音符: ${row?.label || ''} | 力度: ${newVal}`;
      }

      this.notifyEventsChanged();
      styPlaybackEngine.previewNote(this.channel, ev.noteNumber, newVal, 180);
      return;
    }

    // 多選狀態
    if (this.velocityMode === 'relative') {
      // 📈 相對增減模式：保持各音符原有的強弱差 (Groove Ratio)
      const delta = newVal - this.baselineAverageVelocity;
      this.selectedEvents.forEach(ev => {
        const baseVel = this.initialVelocities.get(ev) ?? ev.velocity;
        ev.velocity = Math.max(1, Math.min(127, baseVel + delta));
        this.updateNoteBlockVelocityUI(ev, ev.velocity);
      });

      const currentAvg = Math.round(
        Array.from(this.selectedEvents).reduce((s, e) => s + e.velocity, 0) / this.selectedEvents.size
      );
      const sign = delta >= 0 ? `+${delta}` : `${delta}`;

      if (this.velStatus) {
        this.velStatus.textContent = `已相對微調 ${this.selectedEvents.size} 個音符 (Δ: ${sign} | 平均: ${currentAvg})`;
      }
    } else {
      // 🎯 絕對統一模式：所有音符強制設為相同數值
      this.selectedEvents.forEach(ev => {
        ev.velocity = newVal;
        this.updateNoteBlockVelocityUI(ev, newVal);
      });

      if (this.velStatus) {
        this.velStatus.textContent = `已統一設定 ${this.selectedEvents.size} 個音符 | 力度: ${newVal}`;
      }
    }

    this.notifyEventsChanged();
  }

  /**
   * 即時平滑更新播放游標 (GPU 加速，零 Layout Reflow，永不卡頓)
   */
  public updatePlayhead(currentTick: number) {
    if (this.viewMode === 'drum-grid') {
      const beatsPerBar = this.timeSignature.numerator || 4;
      const stepsPerBar = beatsPerBar * 4;
      const totalSteps = this.totalBars * stepsPerBar;
      const currentStep = Math.min(totalSteps - 1, Math.floor((currentTick / this.totalTicks) * totalSteps));

      if (this.lastPlayheadStep !== currentStep) {
        this.lastPlayheadStep = currentStep;
        this.container.querySelectorAll('.drum-step-pad.is-playhead-step, .drum-header-step.is-playhead-step')
          .forEach(el => el.classList.remove('is-playhead-step'));
        if (currentStep >= 0 && currentTick > 0) {
          this.container.querySelectorAll(`[data-step="${currentStep}"]`)
            .forEach(el => el.classList.add('is-playhead-step'));
        }
      }

      // 播放跑燈跟隨水平捲動
      if (this.gridScrollEl && currentTick > 0) {
        const stepPad = this.container.querySelector(`.drum-step-pad[data-step="${currentStep}"]`) as HTMLElement | null;
        if (stepPad) {
          const padLeft = stepPad.offsetLeft;
          const scrollLeft = this.gridScrollEl.scrollLeft;
          const clientWidth = this.gridScrollEl.clientWidth;
          if (padLeft > scrollLeft + clientWidth - 100) {
            this.gridScrollEl.scrollLeft = padLeft - 150;
          } else if (padLeft < scrollLeft) {
            this.gridScrollEl.scrollLeft = Math.max(0, padLeft - 50);
          }
        }
      }
      return;
    }

    if (!this.playheadEl) return;
    const totalWidthPx = this.totalBars * this.pixelsPerBar;
    const progress = Math.max(0, Math.min(1.0, currentTick / this.totalTicks));
    const xPx = progress * totalWidthPx;

    this.playheadEl.style.transform = `translate3d(${xPx}px, 0, 0)`;
    if (this.lanePlayheadEl) {
      this.lanePlayheadEl.style.transform = `translate3d(${xPx}px, 0, 0)`;
    }

    // 播放時游標若超出可視區則自動平滑跟隨捲動
    if (this.gridScrollEl && currentTick > 0) {
      const scrollLeft = this.gridScrollEl.scrollLeft;
      const clientWidth = this.gridScrollEl.clientWidth;
      if (xPx > scrollLeft + clientWidth - 100) {
        this.gridScrollEl.scrollLeft = xPx - 150;
      } else if (xPx < scrollLeft) {
        this.gridScrollEl.scrollLeft = Math.max(0, xPx - 50);
      }
    }
  }
  /**
   * 執行智慧量化與搖擺律動 (支援 Q 鍵快速鍵、選取音符或全軌量化)
   */
  public executeQuantize(): boolean {
    if (!this.events || this.events.length === 0) {
      if (this.velStatus) this.velStatus.textContent = '⚠️ 當前聲部無任何音符可供量化';
      return false;
    }

    const beforeEvents = this.events.map(e => ({ ...e }));
    const hasSelection = this.selectedEvents.size > 0;
    const targetCount = hasSelection ? this.selectedEvents.size : this.events.length;

    const options: QuantizeOptions = {
      grid: this.quantizeGrid,
      strength: this.quantizeStrength,
      swing: this.quantizeSwing,
      quantizeStarts: true,
      quantizeLengths: this.quantizeLengths,
      totalTicks: this.totalTicks,
      division: this.division,
    };

    if (hasSelection) {
      const selectedSet = new Set(this.selectedEvents);
      const newSelectedEvents = new Set<PlaybackNoteEvent>();

      this.events = this.events.map(ev => {
        if (!selectedSet.has(ev)) return ev;
        const qNote = QuantizeEngine.quantizeNote(ev, options);
        newSelectedEvents.add(qNote);
        return qNote;
      });

      this.selectedEvents = newSelectedEvents;
    } else {
      this.events = QuantizeEngine.quantizeNotes(this.events, options);
    }

    this.events.sort((a, b) => a.relTick - b.relTick);

    const desc = hasSelection
      ? `量化選取音符 (${targetCount} 顆, ${this.quantizeGrid}, 強度 ${this.quantizeStrength}%)`
      : `全軌量化 (${targetCount} 顆, ${this.quantizeGrid}, 強度 ${this.quantizeStrength}%)`;

    this.pushHistory(desc, beforeEvents, this.events);
    this.notifyEventsChanged();
    this.render();

    if (this.velStatus) {
      const swingLabel = this.quantizeSwing > 50 ? `, 搖擺 ${this.quantizeSwing}%` : '';
      this.velStatus.textContent = `⚡ 已${desc}${swingLabel}`;
    }

    const firstNote = hasSelection
      ? Array.from(this.selectedEvents)[0]
      : this.events[0];
    if (firstNote) {
      try {
        styPlaybackEngine.previewNote(this.channel, firstNote.noteNumber, firstNote.velocity);
      } catch {
        // 略過無音訊硬體或 headless 環境下的 AudioContext 例外
      }
    }

    return true;
  }

  public getQuantizeGrid(): QuantizeGridType { return this.quantizeGrid; }
  public setQuantizeGrid(g: QuantizeGridType) {
    this.quantizeGrid = g;
  }
  public isHighContrast(): boolean { return this.isHighContrastGrid; }
  public setHighContrast(val: boolean) {
    this.isHighContrastGrid = val;
    this.render();
  }
  public getQuantizeStrength(): number { return this.quantizeStrength; }
  public setQuantizeStrength(s: number) { this.quantizeStrength = s; }
  public getQuantizeSwing(): number { return this.quantizeSwing; }
  public setQuantizeSwing(s: number) { this.quantizeSwing = s; }
  public setQuantizeLengths(l: boolean) { this.quantizeLengths = l; }
  /**
   * 執行移調或八度升降 (支援選取音符或全軌移調，保留和弦音程差與邊界保護)
   * @param semitones 半音數 (+1, -1, +12, -12 或自訂)
   */
  public transposeCurrent(semitones: number): boolean {
    if (!this.events || this.events.length === 0) {
      if (this.velStatus) this.velStatus.textContent = '⚠️ 當前聲部無任何音符可供移調';
      return false;
    }

    if (PitchTransposer.isDrumChannel(this.channel)) {
      if (this.velStatus) {
        this.velStatus.textContent = '⚠️ 打擊樂聲部 (Rhythm) 停用移調以保護鼓點配置';
      }
      return false;
    }

    const beforeEvents = this.events.map(e => ({ ...e }));
    const hasSelection = this.selectedEvents.size > 0;
    const targetNotes = hasSelection
      ? Array.from(this.selectedEvents)
      : [...this.events];

    const result = PitchTransposer.transposeNotes(targetNotes, semitones, {
      channel: this.channel,
      minNote: 0,
      maxNote: 127,
    });

    if (!result.success) {
      if (this.velStatus && result.message) {
        this.velStatus.textContent = result.message;
      }
      return false;
    }

    if (hasSelection) {
      const selectedSet = new Set(this.selectedEvents);
      const newSelectedEvents = new Set<PlaybackNoteEvent>();

      this.events = this.events.map(ev => {
        if (!selectedSet.has(ev)) return ev;
        const shiftedNote: PlaybackNoteEvent = {
          ...ev,
          noteNumber: ev.noteNumber + result.actualShift,
        };
        newSelectedEvents.add(shiftedNote);
        return shiftedNote;
      });

      this.selectedEvents = newSelectedEvents;
    } else {
      this.events = result.notes;
    }

    let shiftDesc = '';
    if (result.actualShift === 12) shiftDesc = '升八度 (+8va)';
    else if (result.actualShift === -12) shiftDesc = '降八度 (-8va)';
    else if (result.actualShift > 0) shiftDesc = `升 ${result.actualShift} 半音`;
    else shiftDesc = `降 ${Math.abs(result.actualShift)} 半音`;

    const desc = hasSelection
      ? `移調選取音符: ${shiftDesc} (${targetNotes.length} 顆)`
      : `全軌移調: ${shiftDesc} (${this.events.length} 顆)`;

    this.pushHistory(desc, beforeEvents, this.events);
    this.calculateRows(); // 重新自適應琴鍵縱向音域範圍
    this.notifyEventsChanged();
    this.render();

    if (this.velStatus) {
      const limitNotice = result.isLimited ? ' (觸碰邊界已受限)' : '';
      this.velStatus.textContent = `🎵 已${desc}${limitNotice}`;
    }

    // 試聽移調後的音符
    const auditionNote = hasSelection
      ? Array.from(this.selectedEvents)[0]
      : this.events[0];
    if (auditionNote) {
      try {
        styPlaybackEngine.previewNote(this.channel, auditionNote.noteNumber, auditionNote.velocity);
      } catch {
        // 略過無音訊輸出環境
      }
    }

    return true;
  }

  /**
   * 🔁 複製第 1 小節音符並填滿後續所有小節 (清空覆蓋策略)
   * 快速鍵: Ctrl+D，支援 Ctrl+Z 完整復原
   */
  public fillRemainingBarsFromBar1(): boolean {
    if (this.totalBars <= 1) {
      if (this.velStatus) {
        this.velStatus.textContent = '⚠️ 當前段落僅有 1 小節，無需填滿後續小節';
      }
      return false;
    }

    const ticksPerBar = Math.round(this.totalTicks / Math.max(1, this.totalBars));
    // 篩選第 1 小節起點範圍內的音符 [0, ticksPerBar)
    const bar1Notes = this.events.filter(e => e.relTick >= 0 && e.relTick < ticksPerBar);

    if (bar1Notes.length === 0) {
      if (this.velStatus) {
        this.velStatus.textContent = '⚠️ 第 1 小節沒有任何音符可供複製填滿';
      }
      return false;
    }

    // 拍下快照以供 Ctrl+Z 完整復原
    const beforeSnapshot = this.events.map(e => ({ ...e }));

    // 生成後續小節的平移音符 (Bar 2 到 Bar totalBars)
    const replicatedNotes: PlaybackNoteEvent[] = [];
    for (let bar = 1; bar < this.totalBars; bar++) {
      const offset = bar * ticksPerBar;
      for (const note of bar1Notes) {
        const newRelTick = note.relTick + offset;
        if (newRelTick < this.totalTicks) {
          // 確保音符時值不超出段落總長度
          const maxDuration = Math.max(10, this.totalTicks - newRelTick);
          const durationTicks = Math.min(note.durationTicks, maxDuration);
          const durationMs = note.durationTicks > 0
            ? Math.round((durationTicks / note.durationTicks) * note.durationMs)
            : note.durationMs;

          replicatedNotes.push({
            ...note,
            relTick: newRelTick,
            durationTicks,
            durationMs,
          });
        }
      }
    }

    // 依使用者偏好的「清空覆蓋策略」：保留第 1 小節原有音符，並填入第 2~N 小節平移音符
    const newEvents = [
      ...bar1Notes.map(e => ({ ...e })),
      ...replicatedNotes,
    ];
    newEvents.sort((a, b) => a.relTick - b.relTick || a.noteNumber - b.noteNumber);

    this.events = newEvents;
    this.selectedEvents.clear();
    this.initialVelocities.clear();
    this.notifyEventsChanged();

    const historyDesc = `複製第 1 小節填滿全段 (${bar1Notes.length} 音符 × ${this.totalBars} 小節)`;
    this.pushHistory(historyDesc, beforeSnapshot, this.events);

    this.calculateRows(); // 自適應音域
    this.render();
    this.updateSelectionUI(false);

    // 試聽回饋：播放第 1 小節第一個音符
    if (bar1Notes.length > 0) {
      try {
        styPlaybackEngine.previewNote(this.channel, bar1Notes[0].noteNumber, bar1Notes[0].velocity, 180);
      } catch {
        // 略過無音訊環境
      }
    }

    if (this.velStatus) {
      this.velStatus.textContent = `🔁 已複製第 1 小節 (${bar1Notes.length} 個音符) 填滿後續 ${this.totalBars - 1} 個小節 (覆蓋原有內容，可按 Ctrl+Z 復原)`;
    }

    return true;
  }

  // ==========================================================================
  // 🔴 PSR-SX920 實體琴鍵連線步進錄音 (Web MIDI Step Input) 核心模組
  // ==========================================================================

  /**
   * 初始化步進錄音核心
   */
  private initStepRecorder() {
    this.stepRecorder = new StepRecorder({
      ppq: this.division,
      timeSignature: this.timeSignature,
      resolution: this.stepResolution,
      maxBars: this.totalBars,
      velocityMode: this.stepVelocityMode,
      fixedVelocity: this.defaultVelocity,
      onStepChange: (entry, currentTick) => this.handleStepRecorded(entry, currentTick),
      onPositionChange: (pos) => this.updateStepPositionUI(pos),
    });
  }

  /**
   * 切換步進錄音工作台啟用狀態
   */
  public toggleStepRecording(force?: boolean) {
    this.isStepRecording = force !== undefined ? force : !this.isStepRecording;
    if (!this.stepRecorder) this.initStepRecorder();

    if (this.isStepRecording && !this.isChannelActive) {
      this.isChannelActive = true;
      this.onRequestActivate?.(this.channel);
    }

    const btn = this.container.querySelector('#ed-btn-step-rec');
    const bar = this.container.querySelector('#ed-step-bar') as HTMLElement | null;

    btn?.classList.toggle('recording', this.isStepRecording);
    if (bar) {
      bar.style.display = this.isStepRecording ? 'flex' : 'none';
    }
    if (this.stepCursorEl) {
      this.stepCursorEl.style.display = this.isStepRecording ? 'block' : 'none';
    }

    const hint = this.container.querySelector('.editor-hint-bar');
    if (hint) {
      if (this.isStepRecording) {
        hint.innerHTML = `<span>🔴 <b>步進錄音進行中:</b> 在 PSR-SX920 彈奏和弦或旋律，放開琴鍵即寫入 ｜ <b>空白鍵 (Space)</b> 插入休止 ｜ <b>T 鍵</b> 延音 ｜ <b>Backspace</b> 退步 ｜ 點擊標尺直接跳轉游標</span>`;
      } else {
        hint.innerHTML = `<span>💡 <b>操作指南:</b> 點擊空白新增音符 ｜ 拖曳空白處<b>【框選】</b> ｜ 按住 Shift 點擊<b>【多選】</b> ｜ 拖曳音符<b>【批次移位】</b> ｜ 拖曳右把手調時值 ｜ 按 Delete / 右鍵<b>【批次刪除】</b> ｜ 上方拉桿/微調鈕<b>【批次改力度 / 🎲人性化】</b> ｜ <b>Ctrl+Z 復原 / Ctrl+Y 重做</b> ｜ <b>Q 鍵量化</b> ｜ <b>Alt+↑/↓ 移調 (Shift+Alt+↑/↓ 八度)</b></span>`;
      }
    }

    this.updateStepCursor();

    if (this.velStatus) {
      this.velStatus.textContent = this.isStepRecording
        ? '🔴 步進錄音已開啟：請在 PSR-SX920 琴鍵上彈奏'
        : '⚪ 步進錄音已關閉';
    }
  }

  public isRecording(): boolean {
    return this.isStepRecording;
  }

  public setStepResolution(res: StepResolution): void {
    this.stepResolution = res;
    if (this.stepRecorder) {
      this.stepRecorder.setResolution(res);
    }
    this.updateStepCursor();
  }

  public getStepResolution(): StepResolution {
    return this.stepResolution;
  }

  public getStepRecorder(): StepRecorder | null {
    return this.stepRecorder;
  }

  /**
   * 插入休止符 (Rest)：游標向前跳躍 1 步時值
   */
  public insertRest(): void {
    if (!this.stepRecorder) this.initStepRecorder();
    this.stepRecorder!.insertRest();
    this.updateStepCursor();
    if (this.velStatus) {
      this.velStatus.textContent = `⏭ 插入休止符 (${this.stepResolution})`;
    }
  }

  /**
   * 延音 (Tie)：延長前一個錄入的音符或和弦時值 1 步
   */
  public tiePreviousNote(): boolean {
    if (!this.stepRecorder) return false;
    const hist = this.stepRecorder.getHistory();
    const lastNoteEntry = [...hist].reverse().find(h => h.type === 'notes' && h.notes.length > 0);
    if (!lastNoteEntry) {
      if (this.velStatus) this.velStatus.textContent = '⚠️ 前方無音符可供延音';
      return false;
    }

    const ok = this.stepRecorder.tiePreviousNote();
    if (!ok) return false;

    if (this.velStatus) {
      this.velStatus.textContent = `🔗 已延長前音時值 (+${this.stepResolution})`;
    }
    return true;
  }

  /**
   * 後退上一步 (Step Back / Undo)：撤銷上一次錄入並倒退游標
   */
  public stepBack(): boolean {
    if (!this.stepRecorder) return false;
    const hist = this.stepRecorder.getHistory();
    if (hist.length === 0) {
      if (this.stepRecorder.getCurrentTick() > 0) {
        const stepTicks = this.stepRecorder.getStepTicks();
        this.stepRecorder.seekToTick(Math.max(0, this.stepRecorder.getCurrentTick() - stepTicks));
        this.updateStepCursor();
        return true;
      }
      return false;
    }

    const last = hist[hist.length - 1];
    const beforeSnapshot = this.events.map(e => ({ ...e }));

    this.stepRecorder.stepBack();

    if (last.type === 'notes') {
      const removedPitches = new Set(last.notes.map(n => n.note));
      this.events = this.events.filter(e => !(e.relTick === last.startTick && removedPitches.has(e.noteNumber)));
      this.notifyEventsChanged();
      this.pushHistory('步進退回 (Step Back)', beforeSnapshot, this.events);
      this.selectedEvents.clear();
      this.render();
      this.updateSelectionUI(false);
    }

    this.updateStepCursor();
    if (this.velStatus) {
      this.velStatus.textContent = `⏮ 已退回上一步 (至 Tick ${this.stepRecorder.getCurrentTick()})`;
    }
    return true;
  }

  /**
   * 游標重設回到小節起點 (Tick 0)
   */
  public rewindStepCursor(): void {
    if (!this.stepRecorder) return;
    this.stepRecorder.seekToTick(0);
    this.updateStepCursor();
    if (this.velStatus) {
      this.velStatus.textContent = '⏮ 步進游標已回起點 (Tick 0)';
    }
  }

  /**
   * 更新步進游標之視覺位置與小節拍數資訊
   */
  public updateStepCursor(): void {
    if (!this.stepRecorder) return;
    const currentTick = this.stepRecorder.getCurrentTick();
    const totalWidthPx = this.totalBars * this.pixelsPerBar;
    const progress = Math.max(0, Math.min(1.0, currentTick / this.totalTicks));
    const xPx = progress * totalWidthPx;

    if (this.stepCursorEl) {
      this.stepCursorEl.style.transform = `translate3d(${xPx}px, 0, 0)`;
    }

    const pos = this.stepRecorder.getPosition(currentTick);
    const posBadge = this.container.querySelector('#ed-step-pos-badge');
    if (posBadge) {
      posBadge.textContent = `📍 ${pos.label} (Tick ${currentTick})`;
    }

    if (this.gridScrollEl && this.isStepRecording) {
      const scrollLeft = this.gridScrollEl.scrollLeft;
      const clientWidth = this.gridScrollEl.clientWidth;
      if (xPx > scrollLeft + clientWidth - 120) {
        this.gridScrollEl.scrollLeft = xPx - 150;
      } else if (xPx < scrollLeft) {
        this.gridScrollEl.scrollLeft = Math.max(0, xPx - 50);
      }
    }
  }

  /**
   * 處理來自 StepRecorder 提交之新音符或休止符
   */
  private handleStepRecorded(entry: StepRecordEntry, _currentTick: number): void {
    if (entry.type === 'notes') {
      if (entry.startTick >= this.totalTicks) {
        if (this.velStatus) {
          this.velStatus.textContent = `⚠️ 已達段落終點 (${this.totalBars} 小節)，請回起點或增加小節數`;
        }
        return;
      }

      const beforeSnapshot = this.events.map(e => ({ ...e }));
      const newPlaybackEvents: PlaybackNoteEvent[] = [];

      for (const n of entry.notes) {
        const dur = Math.min(n.durationTick, this.totalTicks - entry.startTick);
        const pbEvent: PlaybackNoteEvent = {
          channel: this.channel,
          sourceChannel: this.channel,
          relTick: entry.startTick,
          durationTicks: dur,
          noteNumber: n.note,
          velocity: n.velocity,
          durationMs: 0,
        };
        newPlaybackEvents.push(pbEvent);
      }

      // 移除在同一個起始 Tick 上音高重複的舊音符，避免重疊觸發
      const newPitches = new Set(newPlaybackEvents.map(e => e.noteNumber));
      this.events = this.events.filter(e => !(e.relTick === entry.startTick && newPitches.has(e.noteNumber)));

      // 加入新音符並排序
      this.events.push(...newPlaybackEvents);
      this.events.sort((a, b) => a.relTick - b.relTick);

      const chordLabel = entry.chordName || (entry.notes.length > 1 ? '和弦' : '單音');
      this.pushHistory(`步進錄入: ${chordLabel}`, beforeSnapshot, this.events);
      this.notifyEventsChanged();

      // 選取新錄入的音符
      this.selectedEvents.clear();
      newPlaybackEvents.forEach(e => this.selectedEvents.add(e));

      this.render();
      this.updateSelectionUI(true);

      const badge = this.container.querySelector('#ed-step-chord-badge');
      if (badge) {
        badge.textContent = `✅ 已寫入: ${chordLabel}`;
      }
      if (this.velStatus) {
        this.velStatus.textContent = `✅ 步進錄入成功: ${chordLabel}`;
      }
    } else if (entry.type === 'rest') {
      if (this.velStatus) {
        this.velStatus.textContent = `⏭ 插入休止符 (${this.stepResolution})`;
      }
    }

    this.updateStepCursor();
  }

  /**
   * 處理實體鍵盤 (PSR-SX920 Web MIDI) 輸入事件
   */
  private handleMidiNoteInput(type: 'noteon' | 'noteoff', pitch: number, velocity: number, _ch: number): void {
    if (!this.isStepRecording) return;
    if (!this.stepRecorder) this.initStepRecorder();

    if (!this.isChannelActive) {
      this.isChannelActive = true;
      this.onRequestActivate?.(this.channel);
    }

    if (type === 'noteon') {
      // 1. 即時發聲試聽：依當前聲部發出聲音 (WebAudio 或 Web MIDI)
      try {
        if (styPlaybackEngine.getOutputMode() === 'midi') {
          midiManager.sendNoteOn(this.channel, pitch, velocity);
        } else {
          styPlaybackEngine.previewNote(this.channel, pitch, velocity, 300);
        }
      } catch {
        // 略過無 AudioContext / headless 環境
      }

      this.heldPitches.add(pitch);
      this.updateLiveChordDisplay();

      const vel = this.stepVelocityMode === 'fixed' ? this.defaultVelocity : velocity;
      this.stepRecorder!.handleNoteOn(pitch, vel);
    } else {
      try {
        if (styPlaybackEngine.getOutputMode() === 'midi') {
          midiManager.sendNoteOff(this.channel, pitch);
        }
      } catch {
        // 略過 headless 環境
      }

      this.heldPitches.delete(pitch);
      this.updateLiveChordDisplay();

      this.stepRecorder!.handleNoteOff(pitch);
    }
  }

  /**
   * 即時更新琴鍵彈奏中的和弦/單音名稱顯示
   */
  private updateLiveChordDisplay(): void {
    const chordBadge = this.container.querySelector('#ed-step-chord-badge');
    if (!chordBadge) return;

    if (this.heldPitches.size === 0) {
      chordBadge.textContent = '🎹 等待琴鍵輸入...';
      return;
    }

    const pitches = Array.from(this.heldPitches).sort((a, b) => a - b);
    if (pitches.length === 1) {
      const p = pitches[0];
      const row = this.rows.find(r => r.note === p);
      chordBadge.textContent = `🎹 單音: ${row?.label || p}`;
    } else {
      const chordName = StepRecorder.detectChordName(pitches);
      const noteNames = pitches.map(p => this.rows.find(r => r.note === p)?.label || p).join('-');
      chordBadge.textContent = `🎹 和弦: ${chordName} (${noteNames})`;
    }
  }

  /**
   * 步進游標位置變更時回呼
   */
  private updateStepPositionUI(pos: { bar: number; beat: number; subBeat: number; tick: number; label: string }): void {
    const posBadge = this.container.querySelector('#ed-step-pos-badge');
    if (posBadge) {
      posBadge.textContent = `📍 ${pos.label} (Tick ${pos.tick})`;
    }
  }

  // =========================================================================
  // 🎛️ 計畫 B: CC 自動化控制線 (Automation Lanes) 渲染與互動邏輯
  // =========================================================================

  private createSvgElement<T extends SVGElement = SVGElement>(tag: string): T {
    let el: any;
    if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
      el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      el = document.createElement(tag);
    } else {
      el = { tagName: tag };
    }
    if (el && typeof el.setAttribute !== 'function') {
      el.setAttribute = (name: string, val: string) => { el[name] = val; };
      el.getAttribute = (name: string) => el[name];
    }
    return el as T;
  }

  private valToY(val: number): number {
    const clamped = Math.max(0, Math.min(127, val));
    const pad = 10;
    const usableH = this.laneHeight - (pad * 2);
    return (this.laneHeight - pad) - (clamped / 127) * usableH;
  }

  private yToVal(y: number): number {
    const pad = 10;
    const usableH = this.laneHeight - (pad * 2);
    const ratio = ((this.laneHeight - pad) - y) / usableH;
    return Math.max(0, Math.min(127, Math.round(ratio * 127)));
  }

  /**
   * 渲染 CC 控制器自動化控制線 (Automation Lane)
   */
  private renderAutomationLane(totalWidthPx: number): void {
    const laneWrap = document.createElement('div');
    laneWrap.id = 'ed-automation-lane-wrap';
    laneWrap.className = 'editor-automation-lane-wrap';
    laneWrap.style.display = this.isLaneVisible ? 'flex' : 'none';

    // 左側控制欄 (與上方琴鍵列 135px 寬度完全一致)
    const ctrlCol = document.createElement('div');
    ctrlCol.className = 'editor-lane-ctrl-col';
    ctrlCol.innerHTML = `
      <div class="lane-ctrl-top">
        <span class="lane-title">🎛️ CC 控制線</span>
        <span id="ed-lane-val-readout" class="lane-val-badge">--</span>
      </div>
      <select id="ed-lane-cc-select" class="lane-cc-select" title="選擇欲編輯的 CC 控制器">
        <option value="11" ${this.activeController === 11 ? 'selected' : ''}>CC 11 Expression (表情動態)</option>
        <option value="7" ${this.activeController === 7 ? 'selected' : ''}>CC 7 Volume (聲部音量)</option>
        <option value="10" ${this.activeController === 10 ? 'selected' : ''}>CC 10 Pan (聲像平衡)</option>
        <option value="91" ${this.activeController === 91 ? 'selected' : ''}>CC 91 Reverb (殘響深度)</option>
        <option value="93" ${this.activeController === 93 ? 'selected' : ''}>CC 93 Chorus (合唱深度)</option>
        <option value="1" ${this.activeController === 1 ? 'selected' : ''}>CC 1 Modulation (顫音)</option>
        <option value="64" ${this.activeController === 64 ? 'selected' : ''}>CC 64 Sustain (延音踏板)</option>
      </select>
      <div class="lane-quick-tools">
        <button id="ed-lane-btn-crescendo" class="lane-tool-btn" title="📈 建立 40 -> 127 漸強曲線">📈 漸強</button>
        <button id="ed-lane-btn-decrescendo" class="lane-tool-btn" title="📉 建立 127 -> 35 漸弱曲線">📉 漸弱</button>
        <button id="ed-lane-btn-smooth" class="lane-tool-btn" title="〰️ 平滑化當前曲線 (三點移動平均)">〰️ 平滑</button>
        <button id="ed-lane-btn-reset" class="lane-tool-btn" title="🔄 重設為原廠平直數值">🔄 重設</button>
      </div>
      <div class="lane-tip-text">點擊空白加點 ｜ 拖曳調值<br>右鍵刪點 ｜ 零延遲試聽</div>
    `;
    laneWrap.appendChild(ctrlCol);

    // 右側可水平捲動的軌道區域
    const laneScroll = document.createElement('div');
    laneScroll.id = 'ed-lane-scroll';
    laneScroll.className = 'editor-lane-scroll';
    this.laneScrollEl = laneScroll;

    const laneCanvas = document.createElement('div');
    laneCanvas.className = 'editor-lane-canvas';
    laneCanvas.style.width = `${totalWidthPx}px`;
    laneCanvas.style.height = `${this.laneHeight}px`;

    // 播放游標
    const playhead = document.createElement('div');
    playhead.id = 'ed-lane-playhead';
    playhead.className = 'lane-playhead';
    playhead.style.height = `${this.laneHeight}px`;
    playhead.style.transform = this.playheadEl?.style.transform || 'translate3d(0px, 0, 0)';
    this.lanePlayheadEl = playhead;
    laneCanvas.appendChild(playhead);

    // SVG 畫布
    const svg = this.createSvgElement<SVGSVGElement>('svg');
    svg.setAttribute('class', 'lane-svg');
    svg.setAttribute('width', `${totalWidthPx}`);
    svg.setAttribute('height', `${this.laneHeight}`);
    svg.setAttribute('viewBox', `0 0 ${totalWidthPx} ${this.laneHeight}`);
    this.laneSvgEl = svg;
    laneCanvas.appendChild(svg);

    laneScroll.appendChild(laneCanvas);
    laneWrap.appendChild(laneScroll);
    this.container.appendChild(laneWrap);

    this.laneValReadoutEl = ctrlCol.querySelector('#ed-lane-val-readout');

    // 綁定控制項事件與預設曲線按鈕
    this.bindAutomationLaneEvents(totalWidthPx);

    // 繪製 SVG 曲線與控制點
    this.drawAutomationLaneSVG(totalWidthPx);

    // 雙向水平捲動同步
    this.setupScrollSync();
  }

  /**
   * 雙向水平捲動互鎖同步 (確保鋼琴捲軸與自動化控制線 100% 對齊)
   */
  private isSyncingScroll: boolean = false;
  private setupScrollSync(): void {
    if (!this.gridScrollEl || !this.laneScrollEl) return;

    this.gridScrollEl.addEventListener('scroll', () => {
      if (this.isSyncingScroll) return;
      this.isSyncingScroll = true;
      if (this.laneScrollEl) {
        this.laneScrollEl.scrollLeft = this.gridScrollEl!.scrollLeft;
      }
      this.isSyncingScroll = false;
    });

    this.laneScrollEl.addEventListener('scroll', () => {
      if (this.isSyncingScroll) return;
      this.isSyncingScroll = true;
      if (this.gridScrollEl) {
        this.gridScrollEl.scrollLeft = this.laneScrollEl!.scrollLeft;
      }
      this.isSyncingScroll = false;
    });
  }

  /**
   * 綁定自動化控制線左側下拉選單與曲線快捷預設按鈕
   */
  private bindAutomationLaneEvents(totalWidthPx: number): void {
    // CC 下拉選單切換
    const ccSelect = this.container.querySelector('#ed-lane-cc-select') as HTMLSelectElement | null;
    ccSelect?.addEventListener('change', () => {
      this.activeController = parseInt(ccSelect.value, 10);
      let events = this.ccEventsMap.get(this.activeController);
      if (!events || events.length === 0) {
        const defVal = this.activeController === 11 ? 127 : (this.activeController === 10 ? 64 : (this.activeController === 7 ? 100 : (this.activeController === 91 ? 40 : 0)));
        this.ensureDefaultCCPoint(this.activeController, defVal);
      }
      this.drawAutomationLaneSVG(totalWidthPx);
    });

    // 📈 漸強快捷預設 (40 -> 127)
    this.container.querySelector('#ed-lane-btn-crescendo')?.addEventListener('click', () => {
      const before = (this.ccEventsMap.get(this.activeController) || []).map(c => ({ ...c }));
      const steps = Math.min(16, Math.max(4, this.totalBars * 4));
      const newEvents: PlaybackCCEvent[] = [];
      for (let i = 0; i <= steps; i++) {
        const relTick = Math.round((i / steps) * this.totalTicks);
        const val = Math.round(40 + (i / steps) * 87);
        newEvents.push({ channel: this.channel, controller: this.activeController, value: val, relTick });
      }
      this.ccEventsMap.set(this.activeController, newEvents);
      this.pushCCHistory(`CC ${this.activeController} 漸強曲線`, this.activeController, before, newEvents);
      this.notifyCCEventsChanged(this.activeController);
      this.drawAutomationLaneSVG(totalWidthPx);
    });

    // 📉 漸弱快捷預設 (127 -> 35)
    this.container.querySelector('#ed-lane-btn-decrescendo')?.addEventListener('click', () => {
      const before = (this.ccEventsMap.get(this.activeController) || []).map(c => ({ ...c }));
      const steps = Math.min(16, Math.max(4, this.totalBars * 4));
      const newEvents: PlaybackCCEvent[] = [];
      for (let i = 0; i <= steps; i++) {
        const relTick = Math.round((i / steps) * this.totalTicks);
        const val = Math.round(127 - (i / steps) * 92);
        newEvents.push({ channel: this.channel, controller: this.activeController, value: val, relTick });
      }
      this.ccEventsMap.set(this.activeController, newEvents);
      this.pushCCHistory(`CC ${this.activeController} 漸弱曲線`, this.activeController, before, newEvents);
      this.notifyCCEventsChanged(this.activeController);
      this.drawAutomationLaneSVG(totalWidthPx);
    });

    // 〰️ 平滑快捷預設 (三點移動平均)
    this.container.querySelector('#ed-lane-btn-smooth')?.addEventListener('click', () => {
      const list = this.ccEventsMap.get(this.activeController) || [];
      if (list.length >= 3) {
        const before = list.map(c => ({ ...c }));
        const smoothed = list.map((item, idx) => {
          if (idx === 0 || idx === list.length - 1) return { ...item };
          const avg = Math.round((list[idx - 1].value + item.value + list[idx + 1].value) / 3);
          return { ...item, value: avg };
        });
        this.ccEventsMap.set(this.activeController, smoothed);
        this.pushCCHistory(`CC ${this.activeController} 平滑曲線`, this.activeController, before, smoothed);
        this.notifyCCEventsChanged(this.activeController);
        this.drawAutomationLaneSVG(totalWidthPx);
      }
    });

    // 🔄 重設快捷預設 (原廠平直基準值)
    this.container.querySelector('#ed-lane-btn-reset')?.addEventListener('click', () => {
      const before = (this.ccEventsMap.get(this.activeController) || []).map(c => ({ ...c }));
      const defaultVal = this.activeController === 11 ? 127 : (this.activeController === 10 ? 64 : (this.activeController === 7 ? 100 : (this.activeController === 91 ? 40 : 0)));
      const newEvents: PlaybackCCEvent[] = [
        {
          channel: this.channel,
          controller: this.activeController,
          value: defaultVal,
          relTick: 0,
        },
      ];
      this.ccEventsMap.set(this.activeController, newEvents);
      this.pushCCHistory(`重設 CC ${this.activeController}`, this.activeController, before, newEvents);
      this.notifyCCEventsChanged(this.activeController);
      this.drawAutomationLaneSVG(totalWidthPx);
    });
  }

  /**
   * 繪製自動化控制線 SVG 元素 (底層格線、漸層填充、霓虹折線、互動節點)
   */
  private drawAutomationLaneSVG(totalWidthPx: number): void {
    const svg = this.laneSvgEl;
    if (!svg) return;
    svg.innerHTML = '';

    // 1. 定義局部漸層色
    const gradId = `lane-grad-${this.activeController}`;
    const defs = this.createSvgElement('defs');
    defs.innerHTML = `
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${this.partAccentColor}" stop-opacity="0.35" />
        <stop offset="100%" stop-color="${this.partAccentColor}" stop-opacity="0.03" />
      </linearGradient>
    `;
    svg.appendChild(defs);

    // 2. 水平數值基準線 (127, 96, 64, 32, 0)
    const guidelines = [127, 96, 64, 32, 0];
    guidelines.forEach((gVal) => {
      const y = this.valToY(gVal);
      const line = this.createSvgElement('line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', `${y}`);
      line.setAttribute('x2', `${totalWidthPx}`);
      line.setAttribute('y2', `${y}`);
      line.setAttribute('stroke', gVal === 64 || gVal === 127 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.05)');
      if (gVal === 64) {
        line.setAttribute('stroke-dasharray', '4,4');
      }
      svg.appendChild(line);

      const label = this.createSvgElement('text');
      label.setAttribute('x', '6');
      label.setAttribute('y', `${y - 2}`);
      label.setAttribute('fill', 'rgba(255, 255, 255, 0.35)');
      label.setAttribute('font-size', '8');
      label.setAttribute('font-family', 'monospace');
      label.textContent = `${gVal}`;
      svg.appendChild(label);
    });

    // 3. 垂直小節線與拍子格線
    const beatsPerBar = this.timeSignature.numerator || 4;
    for (let bar = 0; bar < this.totalBars; bar++) {
      const barX = bar * this.pixelsPerBar;
      const bLine = this.createSvgElement('line');
      bLine.setAttribute('x1', `${barX}`);
      bLine.setAttribute('y1', '0');
      bLine.setAttribute('x2', `${barX}`);
      bLine.setAttribute('y2', `${this.laneHeight}`);
      bLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.12)');
      svg.appendChild(bLine);

      for (let b = 1; b < beatsPerBar; b++) {
        const beatX = barX + (b * (this.pixelsPerBar / beatsPerBar));
        const beatLine = this.createSvgElement('line');
        beatLine.setAttribute('x1', `${beatX}`);
        beatLine.setAttribute('y1', '0');
        beatLine.setAttribute('x2', `${beatX}`);
        beatLine.setAttribute('y2', `${this.laneHeight}`);
        beatLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.04)');
        svg.appendChild(beatLine);
      }
    }

    // 4. 取得當前 CC 事件列表並計算座標
    let currentEvents = this.ccEventsMap.get(this.activeController) || [];
    currentEvents.sort((a, b) => a.relTick - b.relTick);
    if (currentEvents.length === 0) {
      const defVal = this.activeController === 11 ? 127 : (this.activeController === 10 ? 64 : (this.activeController === 7 ? 100 : (this.activeController === 91 ? 40 : 0)));
      this.ensureDefaultCCPoint(this.activeController, defVal);
      currentEvents = this.ccEventsMap.get(this.activeController) || [];
    }

    const pts = currentEvents.map((ev, i) => ({
      x: (ev.relTick / this.totalTicks) * totalWidthPx,
      y: this.valToY(ev.value),
      ev,
      index: i,
    }));

    // 5. 繪製曲線與漸層封閉填色區域
    if (pts.length > 0) {
      const firstY = pts[0].y;
      const lastY = pts[pts.length - 1].y;

      let lineD = `M 0,${firstY}`;
      if (pts[0].x > 0) {
        lineD += ` L ${pts[0].x},${pts[0].y}`;
      }
      for (let i = 0; i < pts.length; i++) {
        lineD += ` L ${pts[i].x},${pts[i].y}`;
      }
      if (pts[pts.length - 1].x < totalWidthPx) {
        lineD += ` L ${totalWidthPx},${lastY}`;
      }

      // 漸層填充路徑 (閉合至底部)
      const fillD = `${lineD} L ${totalWidthPx},${this.laneHeight} L 0,${this.laneHeight} Z`;

      const fillPath = this.createSvgElement('path');
      fillPath.setAttribute('d', fillD);
      fillPath.setAttribute('fill', `url(#${gradId})`);
      svg.appendChild(fillPath);

      // 控制線本體
      const linePath = this.createSvgElement('path');
      linePath.setAttribute('d', lineD);
      linePath.setAttribute('stroke', this.partAccentColor);
      linePath.setAttribute('stroke-width', '2.5');
      linePath.setAttribute('fill', 'none');
      linePath.setAttribute('stroke-linecap', 'round');
      linePath.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(linePath);
    }

    // 6. 繪製互動圓形節點 (Draggable Circles)
    pts.forEach((p) => {
      const circle = this.createSvgElement('circle');
      circle.setAttribute('cx', `${p.x}`);
      circle.setAttribute('cy', `${p.y}`);
      circle.setAttribute('r', '5');
      circle.setAttribute('class', 'lane-node');
      circle.setAttribute('fill', '#ffffff');
      circle.setAttribute('stroke', this.partAccentColor);
      circle.setAttribute('stroke-width', '2.5');
      circle.setAttribute('data-index', `${p.index}`);

      const title = this.createSvgElement('title');
      title.textContent = `CC ${this.activeController} | Tick: ${p.ev.relTick} | 數值: ${p.ev.value}`;
      circle.appendChild(title);

      circle.addEventListener('mouseenter', () => {
        if (this.laneValReadoutEl) {
          this.laneValReadoutEl.textContent = `${p.ev.value}`;
        }
      });

      // 右鍵刪除節點
      circle.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const list = this.ccEventsMap.get(this.activeController) || [];
        if (list.length <= 1) return; // 至少保留 1 個基準節點
        const before = list.map((c) => ({ ...c }));
        list.splice(p.index, 1);
        this.pushCCHistory(`刪除 CC ${this.activeController} 節點`, this.activeController, before, list);
        this.notifyCCEventsChanged(this.activeController);
        this.drawAutomationLaneSVG(totalWidthPx);
      });

      // 拖曳調整數值與位置
      circle.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const list = this.ccEventsMap.get(this.activeController) || [];
        const before = list.map((c) => ({ ...c }));
        const targetEv = list[p.index];
        const svgRect = svg.getBoundingClientRect();
        circle.classList.add('is-dragging');

        const onMouseMove = (moveEvent: MouseEvent) => {
          const curX = moveEvent.clientX - svgRect.left;
          const curY = moveEvent.clientY - svgRect.top;

          const rawTick = (curX / totalWidthPx) * this.totalTicks;
          const newTick = Math.min(this.totalTicks, Math.max(0, Math.round(rawTick)));
          const newVal = this.yToVal(curY);

          targetEv.relTick = newTick;
          targetEv.value = newVal;

          if (this.laneValReadoutEl) {
            this.laneValReadoutEl.textContent = `${newVal}`;
          }

          styPlaybackEngine.applyLiveControlChange(this.channel, this.activeController, newVal);
          this.drawAutomationLaneSVG(totalWidthPx);
        };

        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          circle.classList.remove('is-dragging');

          list.sort((a, b) => a.relTick - b.relTick);
          this.pushCCHistory(`移動 CC ${this.activeController} 節點`, this.activeController, before, list);
          this.notifyCCEventsChanged(this.activeController);
          this.drawAutomationLaneSVG(totalWidthPx);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      svg.appendChild(circle);
    });

    // 7. 點擊空白處新增/覆寫節點
    svg.onmousedown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as Element).tagName.toLowerCase() === 'circle') return;

      const rect = svg.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const rawTick = (clickX / totalWidthPx) * this.totalTicks;
      const stepTicks = this.getStepTicks();
      const snapTick = Math.min(this.totalTicks, Math.max(0, Math.round(rawTick / stepTicks) * stepTicks));
      const snapVal = this.yToVal(clickY);

      const list = this.ccEventsMap.get(this.activeController) || [];
      const before = list.map((c) => ({ ...c }));

      const existingIdx = list.findIndex((c) => Math.abs(c.relTick - snapTick) < (stepTicks / 2));
      if (existingIdx !== -1) {
        list[existingIdx].value = snapVal;
      } else {
        list.push({
          channel: this.channel,
          controller: this.activeController,
          value: snapVal,
          relTick: snapTick,
        });
      }
      list.sort((a, b) => a.relTick - b.relTick);

      if (this.laneValReadoutEl) {
        this.laneValReadoutEl.textContent = `${snapVal}`;
      }

      styPlaybackEngine.applyLiveControlChange(this.channel, this.activeController, snapVal);
      this.pushCCHistory(`新增 CC ${this.activeController} 節点`, this.activeController, before, list);
      this.notifyCCEventsChanged(this.activeController);
      this.drawAutomationLaneSVG(totalWidthPx);
    };

    if (this.laneValReadoutEl && pts.length > 0) {
      this.laneValReadoutEl.textContent = `${pts[0].ev.value}`;
    }
  }

}
