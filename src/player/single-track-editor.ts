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

import type { PlaybackNoteEvent, PartVoiceInfo } from './sty-playback-engine';
import { styPlaybackEngine } from './sty-playback-engine';
import { YAMAHA_DRUM_VOICES } from '../creator/drum-step-grid';

export interface HistoryRecord {
  channel: number;
  description: string;
  beforeEvents: PlaybackNoteEvent[];
  afterEvents: PlaybackNoteEvent[];
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
  private quantizeResolution: number = 16; // 1/16 拍 (480/4 = 120 ticks)
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
  private velocityDragBeforeSnapshot: PlaybackNoteEvent[] | null = null;

  // DOM 參照
  private playheadEl: HTMLElement | null = null;
  private velSlider: HTMLInputElement | null = null;
  private velInput: HTMLInputElement | null = null;
  private velStatus: HTMLElement | null = null;
  private gridScrollEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // 視窗大小改變時自動重新適應 4 小節寬度
    window.addEventListener('resize', () => {
      if (!this.isUserZoomed && this.events.length > 0) {
        this.render();
      }
    });

    // 鍵盤快捷鍵：Delete / Backspace 批次刪除選取音符，Ctrl+A 全選，Escape 取消選取
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

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
   * 取得當前量化單位之 Tick 數值
   */
  private getStepTicks(): number {
    return Math.max(1, Math.round((this.division * 4) / this.quantizeResolution));
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
    voiceInfo: PartVoiceInfo | null
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
    this.selectedEvents.clear();
    this.initialVelocities.clear();

    this.calculateRows();
    this.render();
  }

  /**
   * 計算該軌道需要顯示的縱向行 (Rows)
   */
  private calculateRows() {
    const isDrum = this.channel === 8 || this.channel === 9;

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
    this.container.innerHTML = '';
    this.container.style.setProperty('--part-accent', this.partAccentColor);

    // 1. 建立頂部工具列 (含樂器、拍號、力度拉桿與數字輸入框、相對/絕對模式切換、快速微調按鈕、量化、刪除、縮放)
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    toolbar.innerHTML = `
      <div class="editor-toolbar-left">
        <span class="editor-track-badge" style="background: ${this.partAccentColor};">CH ${this.channel + 1} - ${this.partLabel}</span>
        <span class="editor-voice-tag clickable-voice-tag" title="${this.voiceInfo ? this.voiceInfo.voiceName + ' (點擊更換音色)' : '點擊更換音色'}">${this.voiceInfo?.voiceName || '預設音色'} ✏️</span>
        <span class="editor-meta-pill">拍號: ${this.timeSignature.numerator}/${this.timeSignature.denominator} | 總計: ${this.totalBars} 小節 | PPQ: ${this.division}</span>
        <span id="ed-note-count-pill" class="editor-meta-pill">音符總數: ${this.events.length}</span>
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

        <!-- 📐 量化解析度 -->
        <div class="editor-quantize-box">
          <span class="editor-tool-label">量化:</span>
          <select id="ed-quantize-select" class="editor-select" title="網格吸附與新音符時值單位">
            <option value="16" ${this.quantizeResolution === 16 ? 'selected' : ''}>1/16 拍</option>
            <option value="8" ${this.quantizeResolution === 8 ? 'selected' : ''}>1/8 拍</option>
            <option value="4" ${this.quantizeResolution === 4 ? 'selected' : ''}>1/4 拍</option>
            <option value="32" ${this.quantizeResolution === 32 ? 'selected' : ''}>1/32 拍</option>
          </select>
        </div>

        <!-- ↩️ 復原 / ↪️ 重做 -->
        <div class="editor-history-btns">
          <button id="ed-btn-undo" class="editor-action-btn" title="復原上一步操作 (Ctrl+Z)" disabled>↩️ 復原</button>
          <button id="ed-btn-redo" class="editor-action-btn" title="重做上一步操作 (Ctrl+Y 或 Ctrl+Shift+Z)" disabled>↪️ 重做</button>
        </div>

        <!-- 🗑️ 刪除按鈕 (支援批次刪除) -->
        <button id="ed-btn-delete" class="editor-action-btn btn-danger" title="刪除選取的音符 (或按 Delete / Backspace 鍵)">🗑️ 刪除音符</button>

        <div class="editor-zoom-btns">
          <button id="ed-btn-fit-4" class="editor-mini-btn ${!this.isUserZoomed ? 'active' : ''}" title="保證視野內完整呈現 4 個小節">🎯 4 小節</button>
          <button id="ed-btn-fit-all" class="editor-mini-btn" title="縮放至完整段落小節">全曲</button>
          <button id="ed-btn-zoom-out" class="editor-mini-btn" title="縮小時間軸">🔍 -</button>
          <button id="ed-btn-zoom-in" class="editor-mini-btn" title="放大時間軸">🔍 +</button>
        </div>
      </div>
    `;

    this.container.appendChild(toolbar);

    // 操作提示條
    const hintBar = document.createElement('div');
    hintBar.className = 'editor-hint-bar';
    hintBar.innerHTML = `<span>💡 <b>操作指南:</b> 點擊空白新增音符 ｜ 拖曳空白處<b>【框選】</b> ｜ 按住 Shift 點擊<b>【多選】</b> ｜ 拖曳音符<b>【批次移位】</b> ｜ 拖曳右把手調時值 ｜ 按 Delete / 右鍵<b>【批次刪除】</b> ｜ 上方拉桿/微調鈕<b>【批次改力度 / 🎲人性化】</b> ｜ <b>Ctrl+Z 復原 / Ctrl+Y 重做</b></span>`;
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
      const rowLabel = document.createElement('div');
      rowLabel.className = `editor-key-row ${r.isBlack ? 'is-black-key' : 'is-white-key'}`;
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

      // 點擊琴鍵試聽
      rowLabel.addEventListener('click', () => {
        styPlaybackEngine.previewNote(this.channel, r.note, this.defaultVelocity);
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
    timeRuler.className = 'editor-time-ruler';
    timeRuler.style.width = `${totalWidthPx}px`;

    for (let bar = 1; bar <= this.totalBars; bar++) {
      const barCell = document.createElement('div');
      barCell.className = 'ruler-bar-cell';
      barCell.style.width = `${this.pixelsPerBar}px`;

      let beatsHtml = '';
      for (let b = 1; b <= beatsPerBar; b++) {
        beatsHtml += `<span class="ruler-beat-marker">${bar}.${b}</span>`;
      }

      barCell.innerHTML = `
        <div class="ruler-bar-title">第 ${bar} 小節</div>
        <div class="ruler-beats-row">${beatsHtml}</div>
      `;
      timeRuler.appendChild(barCell);
    }
    canvasWrap.appendChild(timeRuler);

    // 網格底層與音符層
    const gridContent = document.createElement('div');
    gridContent.className = 'editor-grid-content';
    gridContent.style.width = `${totalWidthPx}px`;
    gridContent.style.height = `${this.rows.length * this.rowHeight}px`;

    // 繪製背景水平行線
    this.rows.forEach((r, idx) => {
      const line = document.createElement('div');
      line.className = `grid-row-bg ${r.isBlack ? 'row-black' : 'row-white'}`;
      line.style.top = `${idx * this.rowHeight}px`;
      line.style.height = `${this.rowHeight}px`;
      line.style.width = `${totalWidthPx}px`;
      gridContent.appendChild(line);
    });

    // 繪製小節與拍子垂直格線
    for (let bar = 0; bar < this.totalBars; bar++) {
      const barLeft = bar * this.pixelsPerBar;
      const barLine = document.createElement('div');
      barLine.className = 'grid-v-line bar-line';
      barLine.style.left = `${barLeft}px`;
      barLine.style.height = `${this.rows.length * this.rowHeight}px`;
      gridContent.appendChild(barLine);

      for (let b = 1; b < beatsPerBar; b++) {
        const beatLeft = barLeft + (b * (this.pixelsPerBar / beatsPerBar));
        const beatLine = document.createElement('div');
        beatLine.className = 'grid-v-line beat-line';
        beatLine.style.left = `${beatLeft}px`;
        beatLine.style.height = `${this.rows.length * this.rowHeight}px`;
        gridContent.appendChild(beatLine);
      }
    }

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

            // 新增音符
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

    // 播放游標線 (GPU 加速 Translate3d)
    const playhead = document.createElement('div');
    playhead.className = 'editor-playhead';
    playhead.innerHTML = `<div class="playhead-cap"></div>`;
    playhead.style.height = `${this.rows.length * this.rowHeight + 36}px`;
    playhead.style.transform = `translate3d(0px, 0, 0)`;
    this.playheadEl = playhead;
    canvasWrap.appendChild(playhead);

    canvasWrap.appendChild(gridContent);
    scrollWrap.appendChild(canvasWrap);
    this.container.appendChild(scrollWrap);

    // 3. 綁定力度控制項、模式切換、快速微調按鈕、量化、縮放與選取事件
    this.bindControls();

    // 恢復選取高亮與狀態
    this.updateSelectionUI(false);
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
        styPlaybackEngine.previewNote(this.channel, ev.noteNumber, ev.velocity, 220);
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
        const highest = [...this.selectedEvents].sort((a, b) => b.noteNumber - a.noteNumber)[0];
        styPlaybackEngine.previewNote(this.channel, highest.noteNumber, highest.velocity, 220);
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

    // 量化解析度下拉選單
    const quantizeSelect = this.container.querySelector('#ed-quantize-select') as HTMLSelectElement;
    quantizeSelect?.addEventListener('change', () => {
      this.quantizeResolution = parseInt(quantizeSelect.value, 10);
      if (this.velStatus) {
        this.velStatus.textContent = `量化解析度已設為 1/${this.quantizeResolution} 拍`;
      }
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

    // 縮放按鈕
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
    if (!this.playheadEl) return;
    const totalWidthPx = this.totalBars * this.pixelsPerBar;
    const progress = Math.max(0, Math.min(1.0, currentTick / this.totalTicks));
    const xPx = progress * totalWidthPx;

    this.playheadEl.style.transform = `translate3d(${xPx}px, 0, 0)`;

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
}
