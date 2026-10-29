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
  public checked: boolean = false;
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
    if (_html.includes('ed-btn-quantize-now')) {
      const quantizeSelect = new MockElement('select');
      quantizeSelect.id = 'ed-quantize-select';
      quantizeSelect.value = '1/16';
      this.appendChild(quantizeSelect);

      const btnQuantizeNow = new MockElement('button');
      btnQuantizeNow.id = 'ed-btn-quantize-now';
      this.appendChild(btnQuantizeNow);

      const btnQuantizeSettings = new MockElement('button');
      btnQuantizeSettings.id = 'ed-btn-quantize-settings';
      this.appendChild(btnQuantizeSettings);

      const quantizePanel = new MockElement('div');
      quantizePanel.id = 'ed-quantize-panel';
      this.appendChild(quantizePanel);

      const sliderStrength = new MockElement('input');
      sliderStrength.id = 'ed-q-strength-slider';
      sliderStrength.value = '100';
      quantizePanel.appendChild(sliderStrength);

      const badgeStrength = new MockElement('span');
      badgeStrength.id = 'ed-q-strength-val';
      badgeStrength.textContent = '100%';
      quantizePanel.appendChild(badgeStrength);

      const sliderSwing = new MockElement('input');
      sliderSwing.id = 'ed-q-swing-slider';
      sliderSwing.value = '50';
      quantizePanel.appendChild(sliderSwing);

      const badgeSwing = new MockElement('span');
      badgeSwing.id = 'ed-q-swing-val';
      badgeSwing.textContent = '50% (直音)';
      quantizePanel.appendChild(badgeSwing);

      const chkLengths = new MockElement('input');
      chkLengths.id = 'ed-q-chk-lengths';
      chkLengths.checked = false;
      quantizePanel.appendChild(chkLengths);

      const velStatus = new MockElement('span');
      velStatus.id = 'ed-vel-status';
      this.appendChild(velStatus);
    }
  }
}

describe('Tier 2-2 Step 2: 單軌編輯器量化工具列與快速鍵 (SingleTrackEditor Quantize) 測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;
  let previewSpy: any;

  function createUnquantizedEvents(): PlaybackNoteEvent[] {
    return [
      // 稍微偏離 0 (偏了 15 ticks)
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 15, durationTicks: 100, durationMs: 0 },
      // 稍微偏離 120 (在 110)
      { channel: 8, sourceChannel: 8, noteNumber: 42, velocity: 90, relTick: 110, durationTicks: 100, durationMs: 0 },
      // 稍微偏離 240 (在 255)
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 95, relTick: 255, durationTicks: 100, durationMs: 0 },
      // 距 480 較遠
      { channel: 8, sourceChannel: 8, noteNumber: 46, velocity: 80, relTick: 465, durationTicks: 120, durationMs: 0 },
    ];
  }

  function loadSampleTrack(events: PlaybackNoteEvent[]) {
    editor.loadTrack(8, 'Drums', '#ef4444', events, 1920, 4, 480, { numerator: 4, denominator: 4 }, null);
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

  it('1. 初始量化參數預設值正確 (1/16, Strength 100%, Swing 50%, Lengths false)', () => {
    expect(editor.getQuantizeGrid()).toBe('1/16');
    expect(editor.getQuantizeStrength()).toBe(100);
    expect(editor.getQuantizeSwing()).toBe(50);
  });

  it('2. 切換量化解析度 (1/8, 1/4, 1/8T 三連音)', () => {
    editor.setQuantizeGrid('1/8');
    expect(editor.getQuantizeGrid()).toBe('1/8');
    expect(editor.getStepTicks()).toBe(240); // 480 / 2

    editor.setQuantizeGrid('1/4');
    expect(editor.getQuantizeGrid()).toBe('1/4');
    expect(editor.getStepTicks()).toBe(480);

    editor.setQuantizeGrid('1/8T');
    expect(editor.getQuantizeGrid()).toBe('1/8T');
    expect(editor.getStepTicks()).toBe(160); // 480 / 3
  });

  it('3. 未選取音符時，executeQuantize 執行全軌量化', () => {
    const events = createUnquantizedEvents();
    loadSampleTrack(events);

    // 執行 1/16 拍 100% 量化
    editor.setQuantizeGrid('1/16');
    editor.setQuantizeStrength(100);
    const ok = editor.executeQuantize();

    expect(ok).toBe(true);
    const current = (editor as any).events;
    // 15 -> 0, 110 -> 120, 255 -> 240, 465 -> 480
    expect(current[0].relTick).toBe(0);
    expect(current[1].relTick).toBe(120);
    expect(current[2].relTick).toBe(240);
    expect(current[3].relTick).toBe(480);
  });

  it('4. 選取特定音符時，僅量化選取的音符，未選取音符保持原位', () => {
    const events = createUnquantizedEvents();
    loadSampleTrack(events);

    // 模擬僅選取第 2 顆音符 (relTick: 110)
    (editor as any).selectedEvents.clear();
    (editor as any).selectedEvents.add((editor as any).events[1]);

    editor.setQuantizeGrid('1/16');
    editor.setQuantizeStrength(100);
    editor.executeQuantize();

    const current = (editor as any).events;
    // 只有第 2 顆音符被吸附至 120
    expect(current[1].relTick).toBe(120);
    // 第 1 顆音符保持原位 15 ticks 不變
    expect(current[0].relTick).toBe(15);
    // 第 3 顆音符保持原位 255 ticks 不變
    expect(current[2].relTick).toBe(255);
  });

  it('5. 搖擺律動 (Swing 60% & Shuffle 67%) 能推延後半拍', () => {
    // 建立正拍 0 與後半拍 120 音符
    const events: PlaybackNoteEvent[] = [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 100, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 42, velocity: 90, relTick: 125, durationTicks: 100, durationMs: 0 },
    ];
    loadSampleTrack(events);

    editor.setQuantizeGrid('1/16');
    editor.setQuantizeSwing(60); // 60% Light Swing -> 240 * 0.60 = 144
    editor.executeQuantize();

    const current = (editor as any).events;
    expect(current[0].relTick).toBe(0);
    expect(current[1].relTick).toBe(144);
  });

  it('6. 量化操作無縫整合 Undo / Redo 堆疊 (Ctrl+Z 復原)', () => {
    const events = createUnquantizedEvents();
    loadSampleTrack(events);

    // 記錄量化前原始 ticks
    const origTicks = (editor as any).events.map((e: any) => e.relTick);
    expect(origTicks).toEqual([15, 110, 255, 465]);

    // 執行量化
    editor.setQuantizeGrid('1/16');
    editor.executeQuantize();

    // 確認已量化
    expect((editor as any).events.map((e: any) => e.relTick)).toEqual([0, 120, 240, 480]);

    // 執行 Undo
    const undoOk = editor.undo();
    expect(undoOk).toBe(true);

    // 確認完整復原至量化前的原始位置
    expect((editor as any).events.map((e: any) => e.relTick)).toEqual([15, 110, 255, 465]);

    // 執行 Redo
    const redoOk = editor.redo();
    expect(redoOk).toBe(true);
    expect((editor as any).events.map((e: any) => e.relTick)).toEqual([0, 120, 240, 480]);
  });
});
