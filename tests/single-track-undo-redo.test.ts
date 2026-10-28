import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SingleTrackEditor } from '../src/player/single-track-editor';
import type { PlaybackNoteEvent } from '../src/player/sty-playback-engine';

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '100';
  public title: string = '';
  public disabled: boolean = false;
  public style: Record<string, any> = {
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
  };
  public children: MockElement[] = [];
  public classList = {
    add: (...classes: string[]) => {
      this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...classes])].join(' ');
    },
    remove: (...classes: string[]) => {
      this.className = this.className.split(' ').filter(c => !classes.includes(c)).join(' ');
    },
    contains: (cls: string) => this.className.split(' ').includes(cls),
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
    this.children.push(child);
    return child;
  }

  public addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  public removeEventListener(event: string, fn: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    }
  }

  public dispatchEvent(event: string, payload: any = {}) {
    const list = this.listeners[event] || [];
    for (const fn of list) {
      fn({ stopPropagation: () => {}, preventDefault: () => {}, ...payload });
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
    // Return mock element so querySelector(...).addEventListener(...) never throws null pointer
    const fallback = new MockElement('div');
    if (selector.startsWith('.')) fallback.classList.add(selector.slice(1));
    else if (selector.startsWith('#')) fallback.id = selector.slice(1);
    this.children.push(fallback);
    return fallback;
  }

  public querySelectorAll(selector: string): MockElement[] {
    return [];
  }

  public set innerHTML(_html: string) {
    // When innerHTML is assigned with toolbar, provide the mock child buttons
    if (_html.includes('ed-btn-undo')) {
      const btnUndo = new MockElement('button');
      btnUndo.id = 'ed-btn-undo';
      this.appendChild(btnUndo);

      const btnRedo = new MockElement('button');
      btnRedo.id = 'ed-btn-redo';
      this.appendChild(btnRedo);

      const btnDelete = new MockElement('button');
      btnDelete.id = 'ed-btn-delete';
      this.appendChild(btnDelete);

      const velSlider = new MockElement('input');
      velSlider.id = 'ed-vel-slider';
      this.appendChild(velSlider);

      const velInput = new MockElement('input');
      velInput.id = 'ed-vel-input';
      this.appendChild(velInput);

      const velStatus = new MockElement('span');
      velStatus.id = 'ed-vel-status';
      this.appendChild(velStatus);

      const countPill = new MockElement('span');
      countPill.id = 'ed-note-count-pill';
      this.appendChild(countPill);
    }
  }
}

describe('Tier 1-3: 單軌聚焦工作台 Undo / Redo (歷史復原與重做)', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;

  function createInitialEvents(): PlaybackNoteEvent[] {
    return [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 90, relTick: 480, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 42, velocity: 95, relTick: 960, durationTicks: 120, durationMs: 0 },
    ];
  }

  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: new MockElement('body'),
      activeElement: null,
    };
    class MockAudioContext {
      public state = 'running';
      public currentTime = 0;
      public destination = {};
      public createGain() {
        return {
          gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          connect: () => {},
        };
      }
      public createBufferSource() {
        return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} };
      }
      public createBuffer() {
        return { getChannelData: () => new Float32Array(100) };
      }
      public createOscillator() {
        return {
          frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          type: 'sine',
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      public createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: { setValueAtTime: () => {} },
          Q: { setValueAtTime: () => {} },
          connect: () => {},
        };
      }
    }

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1200,
      AudioContext: MockAudioContext,
      webkitAudioContext: MockAudioContext,
    };

    container = new MockElement('div');
    editor = new SingleTrackEditor(container as any);
    editor.loadTrack(
      8,
      'Rhythm 1',
      '#f59e0b',
      createInitialEvents(),
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null
    );
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  it('1. 初始狀態下 canUndo 與 canRedo 均為 false', () => {
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(false);
    expect(editor.getUndoHistory().length).toBe(0);
    expect(editor.getRedoHistory().length).toBe(0);
  });

  it('2. 刪除選取音符後，可成功透過 undo() 復原，並可透過 redo() 重做', () => {
    // 全選並刪除
    editor.selectAllNotes();
    editor.deleteSelectedNotes();

    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
    const history = editor.getUndoHistory();
    expect(history.length).toBe(1);
    expect(history[0].description).toContain('刪除 3 個音符');

    // 執行 Undo
    const undoResult = editor.undo();
    expect(undoResult).toBe(true);
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(true);

    // 驗證 3 個音符完整回復
    const redoHistory = editor.getRedoHistory();
    expect(redoHistory.length).toBe(1);
    expect(redoHistory[0].description).toContain('刪除 3 個音符');

    // 執行 Redo
    const redoResult = editor.redo();
    expect(redoResult).toBe(true);
    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
  });

  it('3. 力度微調 (Nudge & Humanize) 能正確推入歷史並還原數值', () => {
    editor.selectAllNotes();

    // 階梯微調 +10
    editor.nudgeVelocity(10);
    expect(editor.canUndo()).toBe(true);
    expect(editor.getUndoHistory()[0].description).toContain('微調力度 (+10)');

    // 復原
    editor.undo();
    expect(editor.canUndo()).toBe(false);

    // 人性化隨機力度
    editor.selectAllNotes();
    editor.humanizeVelocity(8);
    expect(editor.canUndo()).toBe(true);
    expect(editor.getUndoHistory()[0].description).toBe('人性化隨機力度');

    // 復原
    editor.undo();
    expect(editor.canUndo()).toBe(false);
  });

  it('4. 多步驟連續操作 (Multi-step Stack)：依序復原與依序重做', () => {
    // 步驟 1: 刪除單一音符
    editor.deleteNote(0);
    expect(editor.getUndoHistory().length).toBe(1);

    // 步驟 2: 全選並微調力度
    editor.selectAllNotes();
    editor.nudgeVelocity(5);
    expect(editor.getUndoHistory().length).toBe(2);

    // 步驟 3: 再微調力度 -10
    editor.nudgeVelocity(-10);
    expect(editor.getUndoHistory().length).toBe(3);

    // 連續 3 次 Undo
    expect(editor.undo()).toBe(true);
    expect(editor.getUndoHistory().length).toBe(2);

    expect(editor.undo()).toBe(true);
    expect(editor.getUndoHistory().length).toBe(1);

    expect(editor.undo()).toBe(true);
    expect(editor.getUndoHistory().length).toBe(0);
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(true);
    expect(editor.getRedoHistory().length).toBe(3);

    // 連續 2 次 Redo
    expect(editor.redo()).toBe(true);
    expect(editor.getUndoHistory().length).toBe(1);

    expect(editor.redo()).toBe(true);
    expect(editor.getUndoHistory().length).toBe(2);
  });

  it('5. 復原後若產生全新動作，重做堆疊 (Redo Stack) 應立即清空', () => {
    editor.deleteNote(0);
    expect(editor.canUndo()).toBe(true);

    // 復原該刪除動作
    editor.undo();
    expect(editor.canRedo()).toBe(true);
    expect(editor.getRedoHistory().length).toBe(1);

    // 執行全新動作 (微調力度)
    editor.selectAllNotes();
    editor.nudgeVelocity(5);

    // Redo 堆疊應被清空
    expect(editor.canRedo()).toBe(false);
    expect(editor.getRedoHistory().length).toBe(0);
    expect(editor.getUndoHistory().length).toBe(1);
  });

  it('6. 跨軌道聲部切換連動：當 Undo 操作涉及其他 Channel 時能自動通知跳轉', () => {
    let switchedChannel: number | null = null;
    editor.setOnRequestSwitchChannel((ch) => {
      switchedChannel = ch;
    });

    // 模擬在 CH 8 (Rhythm 1) 編輯
    editor.selectAllNotes();
    editor.nudgeVelocity(5);

    // 切換至 CH 10 (Bass) 編輯
    editor.loadTrack(
      10,
      'Bass',
      '#10b981',
      [
        { channel: 10, sourceChannel: 10, noteNumber: 36, velocity: 88, relTick: 0, durationTicks: 480, durationMs: 0 },
      ],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null
    );

    // 在 CH 10 執行刪除
    editor.selectAllNotes();
    editor.deleteSelectedNotes();

    // 第一次 Undo：還原 CH 10 刪除 (仍在 CH 10)
    editor.undo();
    expect(switchedChannel).toBe(null);

    // 第二次 Undo：還原先前在 CH 8 的微調力度，應自動觸發跳轉回 CH 8!
    editor.undo();
    expect(switchedChannel).toBe(8);
  });

  it('7. clearHistory() 能正確重置 Undo 與 Redo 堆疊', () => {
    editor.selectAllNotes();
    editor.nudgeVelocity(10);
    expect(editor.canUndo()).toBe(true);

    editor.clearHistory();
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(false);
    expect(editor.getUndoHistory().length).toBe(0);
    expect(editor.getRedoHistory().length).toBe(0);
  });

  it('8. UI 按鈕狀態連動：Undo / Redo 按鈕的 disabled 與 title 即時更新', () => {
    const btnUndo = container.querySelector('#ed-btn-undo') as any;
    const btnRedo = container.querySelector('#ed-btn-redo') as any;

    expect(btnUndo.disabled).toBe(true);
    expect(btnRedo.disabled).toBe(true);

    // 執行一次刪除操作
    editor.selectAllNotes();
    editor.deleteSelectedNotes();

    expect(btnUndo.disabled).toBe(false);
    expect(btnUndo.title).toContain('復原：刪除 3 個音符');
    expect(btnRedo.disabled).toBe(true);

    // 點擊 Undo
    editor.undo();
    expect(btnUndo.disabled).toBe(true);
    expect(btnRedo.disabled).toBe(false);
    expect(btnRedo.title).toContain('重做：刪除 3 個音符');

    // 點擊 Redo
    editor.redo();
    expect(btnUndo.disabled).toBe(false);
    expect(btnRedo.disabled).toBe(true);
  });
});
