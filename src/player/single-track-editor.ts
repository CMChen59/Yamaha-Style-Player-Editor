/**
 * Yamaha STY 單軌專注編輯器 (Single Track Focused Editor)
 * 專為解決多軌同步渲染卡頓而設計的「單軌聚焦工作台」
 * 每次只載入並渲染 1 個 Channel 的音符、拍子、樂器與時間標尺，徹底消除效能負擔與掉拍問題。
 * 力度 (Velocity) 採用滑動拉桿 + 數值精確輸入框雙向連動，提供極速流暢的微調體驗。
 * 完整支援：點擊新增音符、選取試聽、拖曳移位 (音高/時間)、拖曳把手調整時值、按鍵/右鍵/按鈕刪除、量化吸附。
 */

import type { PlaybackNoteEvent, PartVoiceInfo } from './sty-playback-engine';
import { styPlaybackEngine } from './sty-playback-engine';
import { YAMAHA_DRUM_VOICES } from '../creator/drum-step-grid';

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

  // 量化與編輯狀態
  private quantizeResolution: number = 16; // 1/16 拍 (480/4 = 120 ticks)
  private selectedEventIndex: number | null = null;
  private defaultVelocity: number = 100;
  private onEventsChanged: ((channel: number, events: PlaybackNoteEvent[]) => void) | null = null;

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

    // 鍵盤快捷鍵：Delete / Backspace 刪除選取音符，Escape 取消選取
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedEventIndex !== null && this.events[this.selectedEventIndex]) {
          e.preventDefault();
          this.deleteNote(this.selectedEventIndex);
        }
      } else if (e.key === 'Escape') {
        this.selectNote(null);
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
    this.selectedEventIndex = null;

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
   * 繪製完整編輯器 UI
   */
  private render() {
    this.container.innerHTML = '';
    this.container.style.setProperty('--part-accent', this.partAccentColor);

    // 1. 建立頂部工具列 (含樂器、拍號、力度拉桿與數字輸入框、量化選擇器、刪除按鈕、縮放按鈕)
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';
    toolbar.innerHTML = `
      <div class="editor-toolbar-left">
        <span class="editor-track-badge" style="background: ${this.partAccentColor};">CH ${this.channel + 1} - ${this.partLabel}</span>
        <span class="editor-voice-tag">${this.voiceInfo?.voiceName || 'Default Voice'}</span>
        <span class="editor-meta-pill">拍號: ${this.timeSignature.numerator}/${this.timeSignature.denominator} | 總計: ${this.totalBars} 小節 | PPQ: ${this.division}</span>
        <span id="ed-note-count-pill" class="editor-meta-pill">音符總數: ${this.events.length}</span>
      </div>

      <div class="editor-toolbar-right">
        <!-- 🎛️ 力度 (Velocity) 調控模組：滑動拉桿 + 精確數字框 (無柱狀圖) -->
        <div class="editor-vel-box">
          <span class="editor-vel-label">力度 (Velocity):</span>
          <input type="range" id="ed-vel-slider" class="editor-vel-slider" min="1" max="127" value="${this.defaultVelocity}">
          <input type="number" id="ed-vel-input" class="editor-vel-input" min="1" max="127" value="${this.defaultVelocity}">
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

        <!-- 🗑️ 刪除按鈕 -->
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
    hintBar.innerHTML = `<span>💡 <b>操作指南:</b> 點擊空白處新增音符 ｜ 拖曳音符可自由移位 (音高/時間) ｜ 拖曳音符右緣白色把手可調整長度 ｜ 點擊選取音符 ｜ 按 <kbd style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;">Delete</kbd> 或點右鍵可刪除 ｜ 調整上方拉桿或數字框可即時微調力度</span>`;
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

      // 力度透明度對比 (亮度/飽和度)
      const velRatio = Math.max(0.3, Math.min(1.0, ev.velocity / 127));
      noteEl.style.opacity = `${0.5 + 0.5 * velRatio}`;

      const row = this.rows[rowIndex];
      noteEl.innerHTML = `
        <span class="note-block-text">${row.label} (${ev.velocity})</span>
        <div class="note-resize-handle" title="拖曳調整音符長度"></div>
      `;

      // 拖曳移位 (Pitch & Time)
      noteEl.addEventListener('mousedown', (e) => {
        this.handleNoteMouseDown(e, idx);
      });

      // 右鍵點擊直接刪除音符
      noteEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.deleteNote(idx);
      });

      // 拖曳把手調整時值
      const resizeHandle = noteEl.querySelector('.note-resize-handle') as HTMLElement;
      resizeHandle.addEventListener('mousedown', (e) => {
        this.handleResizeMouseDown(e, idx);
      });

      gridContent.appendChild(noteEl);
    });

    // 點擊空白處新增音符事件監聽
    let gridMouseDownX = 0;
    let gridMouseDownY = 0;

    gridContent.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.editor-note-block')) return;
      gridMouseDownX = e.clientX;
      gridMouseDownY = e.clientY;
    });

    gridContent.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.editor-note-block')) return;
      const dist = Math.hypot(e.clientX - gridMouseDownX, e.clientY - gridMouseDownY);
      if (dist > 5) return; // 使用者是在滑動或選取，非單純點擊

      const rect = gridContent.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (clickX >= 0 && clickX <= totalWidthPx && clickY >= 0 && clickY <= this.rows.length * this.rowHeight) {
        const rowIndex = Math.floor(clickY / this.rowHeight);
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
          const targetRow = this.rows[rowIndex];
          const stepTicks = this.getStepTicks();
          const rawTick = (clickX / totalWidthPx) * this.totalTicks;
          const quantizedTick = Math.floor(rawTick / stepTicks) * stepTicks;
          const clampedTick = Math.max(0, Math.min(this.totalTicks - stepTicks, quantizedTick));

          // 檢查該位置是否已有相同音高音符，若有則直接選取
          const existingIdx = this.events.findIndex(
            ev => ev.noteNumber === targetRow.note && Math.abs(ev.relTick - clampedTick) < stepTicks / 2
          );
          if (existingIdx !== -1) {
            this.selectNote(existingIdx);
            return;
          }

          // 新增音符
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
          const newIdx = this.events.indexOf(newNote);
          this.render();
          this.selectNote(newIdx);
          styPlaybackEngine.previewNote(this.channel, targetRow.note, this.defaultVelocity, 200);
        }
      }
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

    // 3. 綁定力度控制項、量化、縮放與選取事件
    this.bindControls();

    // 若先前有選取音符，恢復選取高亮
    if (this.selectedEventIndex !== null && this.selectedEventIndex < this.events.length) {
      const selectedEl = this.container.querySelector(`#ed-note-${this.selectedEventIndex}`);
      selectedEl?.classList.add('is-selected');
    }
  }

  /**
   * 處理音符拖曳移位 (Pitch & Time)
   */
  private handleNoteMouseDown(e: MouseEvent, noteIdx: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).classList.contains('note-resize-handle')) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const targetEvent = this.events[noteIdx];
    if (!targetEvent) return;

    const startRelTick = targetEvent.relTick;
    const startNoteNumber = targetEvent.noteNumber;
    const startRowIndex = this.rows.findIndex(r => r.note === startNoteNumber);
    const durationTicks = targetEvent.durationTicks;
    const stepTicks = this.getStepTicks();
    const totalWidthPx = this.totalBars * this.pixelsPerBar;

    let hasMoved = false;
    let currentTick = startRelTick;
    let currentRowIndex = startRowIndex;

    const noteEl = this.container.querySelector(`#ed-note-${noteIdx}`) as HTMLElement;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (!hasMoved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
        hasMoved = true;
        if (noteEl) noteEl.classList.add('is-dragging');
      }
      if (!hasMoved) return;

      const deltaTicks = (deltaX / totalWidthPx) * this.totalTicks;
      const rawNewTick = startRelTick + deltaTicks;
      const quantizedNewTick = Math.round(rawNewTick / stepTicks) * stepTicks;
      currentTick = Math.max(0, Math.min(this.totalTicks - durationTicks, quantizedNewTick));

      const deltaRow = Math.round(deltaY / this.rowHeight);
      currentRowIndex = Math.max(0, Math.min(this.rows.length - 1, startRowIndex + deltaRow));

      if (noteEl) {
        const newLeftPx = (currentTick / this.totalTicks) * totalWidthPx;
        const newTopPx = currentRowIndex * this.rowHeight + 2;
        noteEl.style.left = `${newLeftPx}px`;
        noteEl.style.top = `${newTopPx}px`;
        const row = this.rows[currentRowIndex];
        const textEl = noteEl.querySelector('.note-block-text');
        if (textEl && row) {
          textEl.textContent = `${row.label} (${targetEvent.velocity})`;
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (noteEl) noteEl.classList.remove('is-dragging');

      if (hasMoved) {
        const newNoteNumber = this.rows[currentRowIndex]?.note ?? startNoteNumber;
        const didChange = currentTick !== startRelTick || newNoteNumber !== startNoteNumber;

        if (didChange) {
          targetEvent.relTick = currentTick;
          targetEvent.noteNumber = newNoteNumber;
          this.events.sort((a, b) => a.relTick - b.relTick);
          this.notifyEventsChanged();
          this.render();
          const newIdx = this.events.indexOf(targetEvent);
          this.selectNote(newIdx >= 0 ? newIdx : null);
          styPlaybackEngine.previewNote(this.channel, newNoteNumber, targetEvent.velocity, 220);
          return;
        }
      }

      this.selectNote(noteIdx);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /**
   * 處理音符時值拉長/縮短 (Resize Duration)
   */
  private handleResizeMouseDown(e: MouseEvent, noteIdx: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const targetEvent = this.events[noteIdx];
    if (!targetEvent) return;

    const startRelTick = targetEvent.relTick;
    const startDurationTicks = targetEvent.durationTicks;
    const stepTicks = this.getStepTicks();
    const minDuration = Math.max(20, Math.floor(stepTicks / 2));
    const totalWidthPx = this.totalBars * this.pixelsPerBar;

    let hasResized = false;
    let currentDuration = startDurationTicks;

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
        this.render();
        const newIdx = this.events.indexOf(targetEvent);
        this.selectNote(newIdx >= 0 ? newIdx : null);
        styPlaybackEngine.previewNote(this.channel, targetEvent.noteNumber, targetEvent.velocity, 220);
      } else {
        this.selectNote(noteIdx);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /**
   * 刪除特定索引的音符
   */
  public deleteNote(index: number) {
    if (index < 0 || index >= this.events.length) return;
    const deleted = this.events[index];
    this.events.splice(index, 1);
    this.selectedEventIndex = null;
    this.notifyEventsChanged();
    this.render();
    if (this.velStatus) {
      const row = this.rows.find(r => r.note === deleted.noteNumber);
      this.velStatus.textContent = `已刪除音符: ${row?.label || deleted.noteNumber}`;
    }
  }

  /**
   * 綁定控制項（拉桿 ↔ 數字框雙向連動、量化選單、刪除鈕、縮放按鈕）
   */
  private bindControls() {
    this.velSlider = this.container.querySelector('#ed-vel-slider') as HTMLInputElement;
    this.velInput = this.container.querySelector('#ed-vel-input') as HTMLInputElement;
    this.velStatus = this.container.querySelector('#ed-vel-status');

    if (this.velSlider && this.velInput) {
      // 拉桿事件
      this.velSlider.addEventListener('input', () => {
        const val = parseInt(this.velSlider!.value, 10);
        this.velInput!.value = val.toString();
        this.applyVelocityChange(val);
      });

      // 數字框事件
      this.velInput.addEventListener('change', () => {
        let val = parseInt(this.velInput!.value, 10);
        if (isNaN(val)) val = 100;
        val = Math.max(1, Math.min(127, val));
        this.velInput!.value = val.toString();
        this.velSlider!.value = val.toString();
        this.applyVelocityChange(val);
      });
    }

    // 量化解析度下拉選單
    const quantizeSelect = this.container.querySelector('#ed-quantize-select') as HTMLSelectElement;
    quantizeSelect?.addEventListener('change', () => {
      this.quantizeResolution = parseInt(quantizeSelect.value, 10);
      if (this.velStatus) {
        this.velStatus.textContent = `量化解析度已設為 1/${this.quantizeResolution} 拍`;
      }
    });

    // 刪除按鈕
    const btnDelete = this.container.querySelector('#ed-btn-delete');
    btnDelete?.addEventListener('click', () => {
      if (this.selectedEventIndex !== null && this.events[this.selectedEventIndex]) {
        this.deleteNote(this.selectedEventIndex);
      } else {
        if (this.velStatus) {
          this.velStatus.textContent = '請先點選欲刪除的音符';
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
   * 套用力度的變更
   */
  private applyVelocityChange(newVel: number) {
    if (this.selectedEventIndex !== null && this.events[this.selectedEventIndex]) {
      const ev = this.events[this.selectedEventIndex];
      ev.velocity = newVel;

      // 更新 DOM 音符方塊
      const noteEl = this.container.querySelector(`#ed-note-${this.selectedEventIndex}`) as HTMLElement;
      if (noteEl) {
        const velRatio = Math.max(0.3, Math.min(1.0, newVel / 127));
        noteEl.style.opacity = `${0.5 + 0.5 * velRatio}`;
        const row = this.rows.find(r => r.note === ev.noteNumber);
        const textEl = noteEl.querySelector('.note-block-text');
        if (textEl && row) {
          textEl.textContent = `${row.label} (${newVel})`;
        }
      }

      if (this.velStatus) {
        const row = this.rows.find(r => r.note === ev.noteNumber);
        this.velStatus.textContent = `已修改音符: ${row?.label || ''} | 力度: ${newVel}`;
      }

      this.notifyEventsChanged();

      // 試聽一聲力度反饋
      styPlaybackEngine.previewNote(this.channel, ev.noteNumber, newVel, 200);
    } else {
      this.defaultVelocity = newVel;
      if (this.velStatus) {
        this.velStatus.textContent = `預設寫入力度: ${newVel}`;
      }
    }
  }

  /**
   * 選中特定音符
   */
  public selectNote(index: number | null) {
    this.selectedEventIndex = index;

    // 清除所有音符的選中樣式
    this.container.querySelectorAll('.editor-note-block').forEach(el => {
      el.classList.remove('is-selected');
    });

    if (index !== null && this.events[index]) {
      const ev = this.events[index];
      const noteEl = this.container.querySelector(`#ed-note-${index}`);
      noteEl?.classList.add('is-selected');

      // 同步設定力度拉桿與數字框數值
      if (this.velSlider && this.velInput) {
        this.velSlider.value = ev.velocity.toString();
        this.velInput.value = ev.velocity.toString();
      }

      const row = this.rows.find(r => r.note === ev.noteNumber);
      if (this.velStatus) {
        this.velStatus.textContent = `選取音符: ${row?.label || ''} (Tick: ${ev.relTick}) | 力度: ${ev.velocity}`;
      }

      // 點選音符試聽
      styPlaybackEngine.previewNote(this.channel, ev.noteNumber, ev.velocity, 220);
    } else {
      if (this.velStatus) {
        this.velStatus.textContent = `預設寫入力度: ${this.defaultVelocity}`;
      }
      if (this.velSlider && this.velInput) {
        this.velSlider.value = this.defaultVelocity.toString();
        this.velInput.value = this.defaultVelocity.toString();
      }
    }
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
