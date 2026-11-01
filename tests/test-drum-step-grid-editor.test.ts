import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SingleTrackEditor } from '../src/player/single-track-editor';
import { styPlaybackEngine, type PlaybackNoteEvent } from '../src/player/sty-playback-engine';

// Mock DOM
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '100';
  public title: string = '';
  public disabled: boolean = false;
  public checked: boolean = false;
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
    display: '',
    left: '',
    top: '',
    width: '',
    height: '',
    gridTemplateColumns: '',
  };
  public children: MockElement[] = [];
  public classList = {
    add: (...classes: string[]) => {
      this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...classes])].join(' ');
    },
    remove: (...classes: string[]) => {
      this.className = this.className.split(' ').filter((c) => !classes.includes(c)).join(' ');
    },
    contains: (cls: string) => this.className.split(' ').filter(Boolean).includes(cls),
    toggle: (cls: string, force?: boolean) => {
      if (force === true) this.classList.add(cls);
      else if (force === false) this.classList.remove(cls);
      else if (this.classList.contains(cls)) this.classList.remove(cls);
      else this.classList.add(cls);
    },
  };
  public listeners: Record<string, Function[]> = {};

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  public appendChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    this.children.push(child);
    return child;
  }

  public addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  public removeEventListener(event: string, fn: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    }
  }

  public dispatchEvent(event: string, payload: any = {}) {
    const list = this.listeners[event] || [];
    for (const fn of list) {
      fn({ stopPropagation: () => {}, preventDefault: () => {}, target: this, ...payload });
    }
  }

  public querySelector(selector: string): MockElement | null {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (node: MockElement) => {
      let match = true;
      if (selector.includes('.')) {
        const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
        if (classMatch && !node.classList.contains(classMatch[1])) match = false;
      }
      if (selector.includes('[data-step="')) {
        const stepMatch = selector.match(/\[data-step="([^"]+)"\]/);
        if (stepMatch && node.dataset.step !== stepMatch[1]) match = false;
      }
      if (selector.startsWith('#')) {
        const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
        if (idMatch && node.id !== idMatch[1]) match = false;
      }
      if (match && (selector.includes('.') || selector.includes('#') || selector.includes('['))) {
        results.push(node);
      }
      for (const child of node.children) check(child);
    };
    for (const child of this.children) check(child);
    return results;
  }

  public set innerHTML(html: string) {
    this.children = [];
    if (!html || html.trim() === '') return;

    if (html.includes('note-resize-handle')) {
      const handle = new MockElement('div');
      handle.className = 'note-resize-handle';
      this.appendChild(handle);
    }

    if (html.includes('ed-view-pianoroll')) {
      const btnPiano = new MockElement('button');
      btnPiano.id = 'ed-view-pianoroll';
      btnPiano.className = 'view-toggle-btn active';
      this.appendChild(btnPiano);

      const btnDrum = new MockElement('button');
      btnDrum.id = 'ed-view-drumgrid';
      btnDrum.className = 'view-toggle-btn';
      this.appendChild(btnDrum);
    }

    if (html.includes('ed-btn-fill-bars')) {
      const btnFill = new MockElement('button');
      btnFill.id = 'ed-btn-fill-bars';
      this.appendChild(btnFill);
    }

    if (html.includes('ed-vel-status')) {
      const velStatus = new MockElement('span');
      velStatus.id = 'ed-vel-status';
      this.appendChild(velStatus);
    }
  }
}

describe('單軌編輯器 🥁 16-Step 鼓機步進矩陣 (Drum Step Sequencer Grid) 測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;

  beforeEach(() => {
    vi.spyOn(styPlaybackEngine, 'previewNote').mockImplementation(() => {});
    vi.spyOn(styPlaybackEngine, 'setChannelEvents').mockImplementation(() => {});

    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
    };
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    container = new MockElement('div');
    editor = new SingleTrackEditor(container as any);
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
    vi.restoreAllMocks();
  });

  it('1. 智慧識別鼓組聲部：鼓組軌道顯示雙重視圖切換按鈕，非鼓組軌道不顯示', () => {
    // 鼓組軌道 (CH 9 / index 8)
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockImplementation((ch) => ch === 8);

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const btnDrum = container.querySelector('#ed-view-drumgrid');
    expect(btnDrum).not.toBeNull();

    // 切換至非鼓組軌道 (CH 11 / index 10 Bass)
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockImplementation((ch) => false);
    editor.loadTrack(
      10,
      'Bass',
      '#eab308',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const btnDrumOnBass = container.querySelector('#ed-view-drumgrid');
    expect(btnDrumOnBass).toBeNull();
    expect(editor.getViewMode()).toBe('piano-roll');
  });

  it('2. 自由切換視圖：鋼琴卷軸與 16-Step 矩陣雙向切換', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    expect(editor.getViewMode()).toBe('piano-roll');

    // 切換至鼓機矩陣
    editor.setViewMode('drum-grid');
    expect(editor.getViewMode()).toBe('drum-grid');

    const matrixWrap = container.querySelector('.drum-step-matrix-wrap');
    expect(matrixWrap).not.toBeNull();

    // 切換回鋼琴卷軸
    editor.setViewMode('piano-roll');
    expect(editor.getViewMode()).toBe('piano-roll');
    const canvasWrap = container.querySelector('.editor-canvas-wrap');
    expect(canvasWrap).not.toBeNull();
  });

  it('3. 非鼓組軌道切換至鼓機矩陣時安全防呆並提示', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(false);

    editor.loadTrack(
      10,
      'Bass',
      '#eab308',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    editor.setViewMode('drum-grid');
    expect(editor.getViewMode()).toBe('piano-roll'); // 拒絕切換

    const statusEl = (editor as any).velStatus as MockElement;
    expect(statusEl?.textContent).toContain('僅打擊樂 / 鼓組聲部支援');
  });

  it('4. 既有音符正確點亮對應之 Step 格子 (大鼓 Kick 36 於 Tick 0 點亮 Step 0)', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    // 4/4 拍, PPQ 480, 4 小節 = 64 步, 每步 120 ticks
    const initialNotes: PlaybackNoteEvent[] = [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 110, relTick: 0, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 95, relTick: 480, durationTicks: 120, durationMs: 0 }, // 第 2 拍 (step 4)
    ];

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      initialNotes,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    editor.setViewMode('drum-grid');

    const pads = container.querySelectorAll('.drum-step-pad');
    expect(pads.length).toBeGreaterThan(0);

    const kickPad0 = pads.find(p => p.dataset.note === '36' && p.dataset.step === '0');
    expect(kickPad0).toBeDefined();
    expect(kickPad0?.classList.contains('is-active')).toBe(true);

    const snarePad4 = pads.find(p => p.dataset.note === '38' && p.dataset.step === '4');
    expect(snarePad4).toBeDefined();
    expect(snarePad4?.classList.contains('is-active')).toBe(true);
  });

  it('5. 點擊暗燈格子即時點亮 (新增鼓點)、觸發試聽發聲並記錄歷史', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );
    editor.setViewMode('drum-grid');

    // 在大鼓 (36) 的第 3 拍 (step 8, relTick = 960) 點一下
    const added = editor.toggleDrumStep(36, 8);
    expect(added).toBe(true);

    const currentNotes = (editor as any).events as PlaybackNoteEvent[];
    expect(currentNotes.length).toBe(1);
    expect(currentNotes[0].noteNumber).toBe(36);
    expect(currentNotes[0].relTick).toBe(960);
    expect(currentNotes[0].durationTicks).toBe(120);

    // 驗證觸發試聽
    expect(styPlaybackEngine.previewNote).toHaveBeenCalledWith(8, 36, 100, 180);

    // 驗證可 Undo
    expect(editor.canUndo()).toBe(true);
    editor.undo();
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(0);
  });

  it('6. 點擊亮燈格子即時熄滅 (刪除鼓點) 並支援 Undo / Redo', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    const initialNotes: PlaybackNoteEvent[] = [
      { channel: 8, sourceChannel: 8, noteNumber: 42, velocity: 100, relTick: 240, durationTicks: 120, durationMs: 0 }, // 閉鈸 step 2
    ];

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      initialNotes,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );
    editor.setViewMode('drum-grid');

    // 點擊已存在的閉鈸 (42, step 2) 進行熄滅
    const toggled = editor.toggleDrumStep(42, 2);
    expect(toggled).toBe(false); // 刪除

    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(0);

    // 復原 Undo
    editor.undo();
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(1);
    expect(((editor as any).events as PlaybackNoteEvent[])[0].noteNumber).toBe(42);

    // 重做 Redo
    editor.redo();
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(0);
  });

  it('7. 鼓機矩陣與「填滿後續小節 (Ctrl+D)」完美聯動', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    // 僅在第 1 小節編排鼓點 (大鼓在 step 0, 小鼓在 step 4)
    const initialNotes: PlaybackNoteEvent[] = [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 100, relTick: 480, durationTicks: 120, durationMs: 0 },
    ];

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      initialNotes,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );
    editor.setViewMode('drum-grid');

    // 執行填滿全段
    const success = editor.fillRemainingBarsFromBar1();
    expect(success).toBe(true);

    const notes = (editor as any).events as PlaybackNoteEvent[];
    // 2 顆鼓點 * 4 小節 = 8 顆
    expect(notes.length).toBe(8);

    // 驗證第 2 小節 (平移 1920 ticks) 的大鼓與小鼓
    const bar2Kick = notes.find(n => n.noteNumber === 36 && n.relTick === 1920);
    const bar2Snare = notes.find(n => n.noteNumber === 38 && n.relTick === 2400);
    expect(bar2Kick).toBeDefined();
    expect(bar2Snare).toBeDefined();
  });

  it('8. 播放跑燈 (Chase Light) 在鼓機矩陣模式下正確高亮對應 Step 欄位', () => {
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(true);

    editor.loadTrack(
      8,
      'Rhythm Main',
      '#38bdf8',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );
    editor.setViewMode('drum-grid');

    // 模擬播放到 Tick 480 (即 Step 4，第 2 拍)
    editor.updatePlayhead(480);

    const step4Pads = container.querySelectorAll('.drum-step-pad[data-step="4"]');
    expect(step4Pads.length).toBeGreaterThan(0);
    expect(step4Pads[0].classList.contains('is-playhead-step')).toBe(true);
  });
});
