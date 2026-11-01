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
  public style: Record<string, any> = {
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
    display: '',
    left: '',
    top: '',
    width: '',
    height: '',
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
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (node: MockElement) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (node.classList.contains(cls)) results.push(node);
      } else if (selector.startsWith('#')) {
        if (node.id === selector.slice(1)) results.push(node);
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

    if (html.includes('ed-btn-fill-bars')) {
      const btnFill = new MockElement('button');
      btnFill.id = 'ed-btn-fill-bars';
      btnFill.className = 'editor-action-btn btn-fill-bars';
      if (html.includes('id="ed-btn-fill-bars" class="editor-action-btn btn-fill-bars" disabled')) {
        btnFill.disabled = true;
      }
      this.appendChild(btnFill);
    }

    if (html.includes('ed-vel-status')) {
      const velStatus = new MockElement('span');
      velStatus.id = 'ed-vel-status';
      this.appendChild(velStatus);
    }

    if (html.includes('ed-btn-undo')) {
      const btnUndo = new MockElement('button');
      btnUndo.id = 'ed-btn-undo';
      this.appendChild(btnUndo);
    }

    if (html.includes('ed-btn-redo')) {
      const btnRedo = new MockElement('button');
      btnRedo.id = 'ed-btn-redo';
      this.appendChild(btnRedo);
    }
  }
}

describe('單軌編輯器 🔁 複製第 1 小節填滿全段功能 (fillRemainingBarsFromBar1) 測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;
  let windowListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    vi.spyOn(styPlaybackEngine, 'previewNote').mockImplementation(() => {});
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(false);
    vi.spyOn(styPlaybackEngine, 'setChannelEvents').mockImplementation(() => {});

    windowListeners = {};
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
    };
    (globalThis as any).window = {
      addEventListener: (event: string, fn: Function) => {
        if (!windowListeners[event]) windowListeners[event] = [];
        windowListeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: Function) => {
        if (windowListeners[event]) {
          windowListeners[event] = windowListeners[event].filter(f => f !== fn);
        }
      },
    };

    container = new MockElement('div');
    editor = new SingleTrackEditor(container as any);
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
    vi.restoreAllMocks();
  });

  it('1. 成功將第 1 小節音符複製並平移填滿至後續所有小節 (4 小節段落，覆蓋策略)', () => {
    // 4/4 拍, PPQ 480, 每小節 1920 ticks, 4 小節 = 7680 ticks
    // 第 1 小節有 4 個音符: 0, 480, 960, 1440
    // 第 2 小節有 2 個殘留髒音符: 2000, 2400 (應被覆蓋清空)
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 0, durationTicks: 400, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 64, velocity: 95, relTick: 480, durationTicks: 400, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 67, velocity: 98, relTick: 960, durationTicks: 400, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 72, velocity: 102, relTick: 1440, durationTicks: 400, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 50, velocity: 80, relTick: 2000, durationTicks: 200, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 52, velocity: 80, relTick: 2400, durationTicks: 200, durationMs: 0 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const success = editor.fillRemainingBarsFromBar1();
    expect(success).toBe(true);

    const currentNotes = (editor as any).events as PlaybackNoteEvent[];
    // 應產生 4 音符 * 4 小節 = 16 顆音符
    expect(currentNotes.length).toBe(16);

    // 原 Bar 2 的髒音符 50, 52 已被覆蓋清空
    const dirtyNote = currentNotes.find(n => n.noteNumber === 50 && n.relTick === 2000);
    expect(dirtyNote).toBeUndefined();

    // 驗證第 1 小節
    const bar1 = currentNotes.filter(n => n.relTick >= 0 && n.relTick < 1920);
    expect(bar1.length).toBe(4);
    expect(bar1.map(n => n.relTick)).toEqual([0, 480, 960, 1440]);
    expect(bar1.map(n => n.noteNumber)).toEqual([60, 64, 67, 72]);

    // 驗證第 2 小節 (平移 1920 ticks)
    const bar2 = currentNotes.filter(n => n.relTick >= 1920 && n.relTick < 3840);
    expect(bar2.length).toBe(4);
    expect(bar2.map(n => n.relTick)).toEqual([1920, 2400, 2880, 3360]);
    expect(bar2.map(n => n.noteNumber)).toEqual([60, 64, 67, 72]);
    expect(bar2.map(n => n.velocity)).toEqual([100, 95, 98, 102]);

    // 驗證第 3 小節 (平移 3840 ticks)
    const bar3 = currentNotes.filter(n => n.relTick >= 3840 && n.relTick < 5760);
    expect(bar3.length).toBe(4);
    expect(bar3.map(n => n.relTick)).toEqual([3840, 4320, 4800, 5280]);
    expect(bar3.map(n => n.noteNumber)).toEqual([60, 64, 67, 72]);

    // 驗證第 4 小節 (平移 5760 ticks)
    const bar4 = currentNotes.filter(n => n.relTick >= 5760 && n.relTick < 7680);
    expect(bar4.length).toBe(4);
    expect(bar4.map(n => n.relTick)).toEqual([5760, 6240, 6720, 7200]);
    expect(bar4.map(n => n.noteNumber)).toEqual([60, 64, 67, 72]);

    // 驗證試聽音訊有播放第 1 小節第一個音符 (note 60, vel 100)
    expect(styPlaybackEngine.previewNote).toHaveBeenCalledWith(10, 60, 100, 180);
  });

  it('2. 支援 Ctrl+Z 完整復原與 Ctrl+Y 重做', () => {
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 0, durationTicks: 400, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 50, velocity: 80, relTick: 2000, durationTicks: 200, durationMs: 0 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    editor.fillRemainingBarsFromBar1();
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(4); // 1 音符 * 4 小節

    // 執行 Undo
    const undoResult = editor.undo();
    expect(undoResult).toBe(true);
    const restoredNotes = (editor as any).events as PlaybackNoteEvent[];
    expect(restoredNotes.length).toBe(2);
    expect(restoredNotes[0].relTick).toBe(0);
    expect(restoredNotes[1].relTick).toBe(2000);

    // 執行 Redo
    const redoResult = editor.redo();
    expect(redoResult).toBe(true);
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(4);
  });

  it('3. 當段落僅有 1 小節時 (totalBars <= 1)，安全防呆並提示無需填滿', () => {
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 9, sourceChannel: 9, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 120, durationMs: 0 },
    ];

    editor.loadTrack(
      9,
      'Rhythm Main',
      '#f59e0b',
      initialEvents,
      1920,
      1,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const success = editor.fillRemainingBarsFromBar1();
    expect(success).toBe(false);
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(1);

    const statusEl = (editor as any).velStatus as MockElement;
    expect(statusEl?.textContent).toContain('當前段落僅有 1 小節');
  });

  it('4. 當第 1 小節沒有任何音符時，安全防呆並提示無法複製', () => {
    // 音符只存在於第 2 小節 (relTick >= 1920)
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 2000, durationTicks: 400, durationMs: 0 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const success = editor.fillRemainingBarsFromBar1();
    expect(success).toBe(false);
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(1);

    const statusEl = (editor as any).velStatus as MockElement;
    expect(statusEl?.textContent).toContain('第 1 小節沒有任何音符');
  });

  it('5. 邊界保護：最後小節複製音符的時值不會溢出 totalTicks', () => {
    // 假定第 1 小節最後一個音符起始於 1800 tick，長度 300 tick (超出 1920 小節線到 2100)
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 1800, durationTicks: 300, durationMs: 300 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const success = editor.fillRemainingBarsFromBar1();
    expect(success).toBe(true);

    const currentNotes = (editor as any).events as PlaybackNoteEvent[];
    expect(currentNotes.length).toBe(4);

    // 第 4 小節音符: relTick = 1800 + 3 * 1920 = 7560
    // totalTicks = 7680, 剩餘最大長度 = 7680 - 7560 = 120 ticks
    const lastNote = currentNotes[3];
    expect(lastNote.relTick).toBe(7560);
    expect(lastNote.durationTicks).toBe(120);
    expect(lastNote.relTick + lastNote.durationTicks).toBeLessThanOrEqual(7680);
  });

  it('6. 鍵盤快捷鍵 Ctrl+D / Cmd+D 正確觸發填滿後續小節', () => {
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 0, durationTicks: 400, durationMs: 0 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    // 模擬按下 Ctrl+D
    const keydownListeners = windowListeners['keydown'] || [];
    expect(keydownListeners.length).toBeGreaterThan(0);

    let prevented = false;
    for (const fn of keydownListeners) {
      fn({
        key: 'd',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => { prevented = true; },
      });
    }

    expect(prevented).toBe(true);
    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(4);
  });

  it('7. 點擊頂部工具列按鈕 #ed-btn-fill-bars 正確觸發填滿後續小節', () => {
    const initialEvents: PlaybackNoteEvent[] = [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 0, durationTicks: 400, durationMs: 0 },
    ];

    editor.loadTrack(
      10,
      'Chord 1',
      '#10b981',
      initialEvents,
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true
    );

    const btn = container.querySelector('#ed-btn-fill-bars');
    expect(btn).not.toBeNull();
    btn?.dispatchEvent('click');

    expect(((editor as any).events as PlaybackNoteEvent[]).length).toBe(4);
  });
});
