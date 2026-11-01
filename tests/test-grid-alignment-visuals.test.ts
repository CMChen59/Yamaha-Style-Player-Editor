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

    if (html.includes('ruler-beats-row')) {
      const beatsRow = new MockElement('div');
      beatsRow.className = 'ruler-beats-row';
      const match = html.match(/grid-template-columns:\s*([^;"]+)/);
      if (match) beatsRow.style.gridTemplateColumns = match[1];
      this.appendChild(beatsRow);
    }

    // Toolbar buttons initialization
    if (html.includes('ed-btn-grid-contrast')) {
      const btnGridContrast = new MockElement('button');
      btnGridContrast.id = 'ed-btn-grid-contrast';
      this.appendChild(btnGridContrast);

      const quantizeSelect = new MockElement('select');
      quantizeSelect.id = 'ed-quantize-select';
      quantizeSelect.value = '1/16';
      this.appendChild(quantizeSelect);
    }
  }
}

describe('單軌編輯器專業級格線與對齊視覺大升級 (Grid Alignment Visuals) 測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;

  function createSampleMelodicEvents(): PlaybackNoteEvent[] {
    return [
      { channel: 10, sourceChannel: 10, noteNumber: 60, velocity: 100, relTick: 0, durationTicks: 480, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 64, velocity: 95, relTick: 480, durationTicks: 480, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 67, velocity: 98, relTick: 960, durationTicks: 480, durationMs: 0 },
      { channel: 10, sourceChannel: 10, noteNumber: 72, velocity: 102, relTick: 1440, durationTicks: 480, durationMs: 0 },
    ];
  }

  beforeEach(() => {
    vi.spyOn(styPlaybackEngine, 'previewNote').mockImplementation(() => {});
    vi.spyOn(styPlaybackEngine, 'isChannelDrum').mockReturnValue(false);

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

  it('1. 偶數小節斑馬紋條紋 (Zebra Bar Striping) 正確渲染', () => {
    const events = createSampleMelodicEvents();
    // 4 個小節 (4 bars * 4 beats * 1920 PPQ = 30720 ticks)
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    // 檢查 grid-bar-stripe 元素 (偶數小節：bar 2 與 bar 4)
    const stripes = container.querySelectorAll('.grid-bar-stripe');
    expect(stripes.length).toBe(2);

    // 檢查時間標尺上的 is-even-bar
    const evenBarCells = container.querySelectorAll('.is-even-bar');
    expect(evenBarCells.length).toBe(2);
  });

  it('2. 中央 C (C 根音與八度) 橫列與琴鍵專屬導航光條高亮', () => {
    const events = createSampleMelodicEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    // 檢查水平行線是否有 .row-root-c
    const rootCRows = container.querySelectorAll('.row-root-c');
    expect(rootCRows.length).toBeGreaterThan(0);

    // 檢查左側琴鍵是否有 .is-c-key
    const cKeys = container.querySelectorAll('.is-c-key');
    expect(cKeys.length).toBeGreaterThan(0);
  });

  it('3. 多階層垂直格線系統：包含小節線 (bar-line)、正拍線 (beat-line) 與細分量化線 (sub-line)', () => {
    const events = createSampleMelodicEvents();
    // 4 小節，4/4 拍，division = 1920 (每拍 1920 ticks, 1/16 網格每步 480 ticks)
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    // 小節線 (4 個小節起始 + 1 個結尾 = 5 條)
    const barLines = container.querySelectorAll('.bar-line');
    expect(barLines.length).toBe(5);

    // 正拍線 (每小節 3 條正拍線：1.2, 1.3, 1.4，4 小節共 12 條)
    const beatLines = container.querySelectorAll('.beat-line');
    expect(beatLines.length).toBe(12);

    // 細分量化線 (1/16 拍：每拍 3 條細分線，每小節 4 拍共 12 條，4 小節共 48 條)
    const subLines = container.querySelectorAll('.sub-line');
    expect(subLines.length).toBe(48);
  });

  it('4. 量化網格解析度切換時，動態更新細分格線密度', () => {
    const events = createSampleMelodicEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    // 切換為 1/8 拍 (每拍 1 條細分線，每小節 4 條，4 小節共 16 條)
    editor.setQuantizeGrid('1/8');
    (editor as any).render();

    const subLines8 = container.querySelectorAll('.sub-line');
    expect(subLines8.length).toBe(16);

    // 切換為 1/4 拍 (整拍量化，細分線應為 0)
    editor.setQuantizeGrid('1/4');
    (editor as any).render();

    const subLines4 = container.querySelectorAll('.sub-line');
    expect(subLines4.length).toBe(0);
  });

  it('5. 十字導引輔助線 (Crosshair Guidelines) 存在於網格畫布中', () => {
    const events = createSampleMelodicEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    const crosshairV = container.querySelector('.editor-crosshair-v');
    const crosshairH = container.querySelector('.editor-crosshair-h');
    expect(crosshairV).not.toBeNull();
    expect(crosshairH).not.toBeNull();
  });

  it('6. 高對比度格線模式 (High Contrast Mode) 狀態切換與樣式套用', () => {
    const events = createSampleMelodicEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    expect(editor.isHighContrast()).toBe(false);

    // 開啟高對比模式
    editor.setHighContrast(true);
    expect(editor.isHighContrast()).toBe(true);

    const gridContent = container.querySelector('.editor-grid-content') as MockElement;
    expect(gridContent).not.toBeNull();
    expect(gridContent.classList.contains('high-contrast-grid')).toBe(true);

    // 關閉高對比模式
    editor.setHighContrast(false);
    expect(editor.isHighContrast()).toBe(false);
    const gridContentNormal = container.querySelector('.editor-grid-content') as MockElement;
    expect(gridContentNormal).not.toBeNull();
    expect(gridContentNormal.classList.contains('high-contrast-grid')).toBe(false);
  });

  it('7. 標尺拍子 (Beat Markers) 與小節線對齊精度驗證 (消除 1.4 與 2.1 擠壓落差)', () => {
    const events = createSampleMelodicEvents();
    editor.loadTrack(10, 'Bass', '#10b981', events, 30720, 4, 1920, { numerator: 4, denominator: 4 }, null);

    const beatsRows = container.querySelectorAll('.ruler-beats-row');
    expect(beatsRows.length).toBe(4);

    // 每小節拍子列皆使用等寬 grid 分佈 (repeat(4, 1fr))
    for (const row of beatsRows) {
      expect(row.style.gridTemplateColumns).toContain('repeat(4, 1fr)');
    }

    // 結尾小節線精確對齊至 totalWidthPx - 2
    const endBarLine = container.querySelector('.end-bar-line');
    expect(endBarLine).not.toBeNull();
    // 4 bars * 240 pixelsPerBar = 960px -> 958px
    expect(endBarLine?.style.left).toBe('958px');
  });
});
