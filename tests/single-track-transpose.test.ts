import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SingleTrackEditor } from '../src/player/single-track-editor';
import { styPlaybackEngine, type PlaybackNoteEvent } from '../src/player/sty-playback-engine';

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
    const fallback = new MockElement('div');
    if (selector.startsWith('.')) fallback.classList.add(selector.slice(1));
    else if (selector.startsWith('#')) fallback.id = selector.slice(1);
    this.children.push(fallback);
    return fallback;
  }

  public querySelectorAll(_selector: string): MockElement[] {
    return [];
  }

  public set innerHTML(_html: string) {
    if (_html.includes('ed-btn-semi-up')) {
      const btnSemiUp = new MockElement('button');
      btnSemiUp.id = 'ed-btn-semi-up';
      this.appendChild(btnSemiUp);

      const btnSemiDown = new MockElement('button');
      btnSemiDown.id = 'ed-btn-semi-down';
      this.appendChild(btnSemiDown);

      const btnOctaveUp = new MockElement('button');
      btnOctaveUp.id = 'ed-btn-octave-up';
      this.appendChild(btnOctaveUp);

      const btnOctaveDown = new MockElement('button');
      btnOctaveDown.id = 'ed-btn-octave-down';
      this.appendChild(btnOctaveDown);

      const velStatus = new MockElement('span');
      velStatus.id = 'ed-vel-status';
      this.appendChild(velStatus);
    }
  }
}

describe('Tier 2-3 Step 2: 單軌編輯器移調與八度升降 (SingleTrackEditor Transpose) 測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;
  let previewSpy: any;

  function createBassEvents(): PlaybackNoteEvent[] {
    return [
      { channel: 10, sourceChannel: 10, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 240, durationMs: 0 },   // C2
      { channel: 10, sourceChannel: 10, noteNumber: 43, velocity: 90, relTick: 480, durationTicks: 240, durationMs: 0 },  // G2
      { channel: 10, sourceChannel: 10, noteNumber: 48, velocity: 95, relTick: 960, durationTicks: 240, durationMs: 0 },  // C3
    ];
  }

  function createDrumEvents(): PlaybackNoteEvent[] {
    return [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 120, durationMs: 0 },    // Kick
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 90, relTick: 480, durationTicks: 120, durationMs: 0 },   // Snare
    ];
  }

  beforeEach(() => {
    previewSpy = vi.spyOn(styPlaybackEngine, 'previewNote').mockImplementation(() => {});
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
    previewSpy?.mockRestore();
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  it('1. 全軌移調：升半音 (+1) 與 降半音 (-1)', () => {
    const events = createBassEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

    // 升半音 (+1)
    const okUp = editor.transposeCurrent(1);
    expect(okUp).toBe(true);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([37, 44, 49]); // C#2, G#2, C#3

    // 降半音 (-1)
    const okDown = editor.transposeCurrent(-1);
    expect(okDown).toBe(true);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([36, 43, 48]); // 回到原音高
  });

  it('2. 全軌八度升降：升八度 (+8va) 與 降八度 (-8va)', () => {
    const events = createBassEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

    // 升八度 (+12)
    editor.transposeCurrent(12);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([48, 55, 60]); // C3, G3, C4

    // 降八度 (-12)
    editor.transposeCurrent(-12);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([36, 43, 48]); // 回到原音高
  });

  it('3. 選取特定音符時，僅對選取音符移調，未選取音符保持原音高', () => {
    const events = createBassEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

    // 僅選取第 2 顆音符 (G2: 43)
    (editor as any).selectedEvents.clear();
    (editor as any).selectedEvents.add((editor as any).events[1]);

    // 升 2 個半音 (G2 -> A2: 45)
    editor.transposeCurrent(2);

    const currentNotes = (editor as any).events.map((e: any) => e.noteNumber);
    expect(currentNotes).toEqual([36, 45, 48]); // 只有中間被選取的 43 變成 45
  });

  it('4. 鼓組打擊樂聲部 (CH 9 / CH 10) 移調安全保護', () => {
    const drumEvents = createDrumEvents();
    editor.loadTrack(8, 'Rhythm 1', '#f59e0b', drumEvents, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

    // 嘗試對鼓軌移調
    const ok = editor.transposeCurrent(1);
    expect(ok).toBe(false);

    // 音高應完全未被更改
    const currentNotes = (editor as any).events.map((e: any) => e.noteNumber);
    expect(currentNotes).toEqual([36, 38]);
  });

  it('5. 移調操作完整支援 Undo / Redo (Ctrl+Z 復原)', () => {
    const events = createBassEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

    // 升八度 (+12)
    editor.transposeCurrent(12);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([48, 55, 60]);

    // 復原 Undo (Ctrl+Z)
    const undoOk = editor.undo();
    expect(undoOk).toBe(true);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([36, 43, 48]);

    // 重做 Redo (Ctrl+Y)
    const redoOk = editor.redo();
    expect(redoOk).toBe(true);
    expect((editor as any).events.map((e: any) => e.noteNumber)).toEqual([48, 55, 60]);
  });
});
