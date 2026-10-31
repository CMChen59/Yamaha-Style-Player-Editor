import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SingleTrackEditor } from '../src/player/single-track-editor';
import { midiManager } from '../src/core/audio/midi-manager';
import fs from 'fs';
import path from 'path';

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '1/16';
  public title: string = '';
  public disabled: boolean = false;
  public checked: boolean = false;
  public style: Record<string, any> = {
    display: '',
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
    // 預先產生步進錄音相關元件
    if (_html.includes('ed-btn-step-rec')) {
      const btnStepRec = new MockElement('button');
      btnStepRec.id = 'ed-btn-step-rec';
      this.appendChild(btnStepRec);
    }
    if (_html.includes('ed-step-bar')) {
      const stepBar = new MockElement('div');
      stepBar.id = 'ed-step-bar';
      this.appendChild(stepBar);

      const stepResSelect = new MockElement('select');
      stepResSelect.id = 'ed-step-res-select';
      stepResSelect.value = '1/16';
      stepBar.appendChild(stepResSelect);

      const stepVelMode = new MockElement('select');
      stepVelMode.id = 'ed-step-vel-mode';
      stepVelMode.value = 'as-played';
      stepBar.appendChild(stepVelMode);

      const btnRest = new MockElement('button');
      btnRest.id = 'ed-btn-step-rest';
      stepBar.appendChild(btnRest);

      const btnTie = new MockElement('button');
      btnTie.id = 'ed-btn-step-tie';
      stepBar.appendChild(btnTie);

      const btnBack = new MockElement('button');
      btnBack.id = 'ed-btn-step-back';
      stepBar.appendChild(btnBack);

      const btnRewind = new MockElement('button');
      btnRewind.id = 'ed-btn-step-rewind';
      stepBar.appendChild(btnRewind);

      const posBadge = new MockElement('span');
      posBadge.id = 'ed-step-pos-badge';
      stepBar.appendChild(posBadge);

      const chordBadge = new MockElement('span');
      chordBadge.id = 'ed-step-chord-badge';
      stepBar.appendChild(chordBadge);
    }
  }

  public get innerHTML(): string {
    return '';
  }
}

describe('PSR-SX920 實體琴鍵連線步進錄音 (Web MIDI Step Input) 完整測試', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  let container: MockElement;
  let editor: SingleTrackEditor;

  beforeEach(() => {
    vi.useFakeTimers();

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

    // 載入 4 小節 4/4 拍、480 PPQ 之 Chord 1 軌道 (Ch 11)
    editor.loadTrack(
      11,
      'Chord 1',
      '#3b82f6',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      { voiceName: 'Live! GrandPiano', msb: 0, lsb: 112, pc: 0, category: 'Piano' }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  it('1. 步進錄音模式可正常開啟/關閉，並同步工作條與游標視覺', () => {
    expect(editor.isRecording()).toBe(false);

    // 開啟步進錄音
    editor.toggleStepRecording(true);
    expect(editor.isRecording()).toBe(true);

    const stepBar = container.querySelector('#ed-step-bar');
    expect(stepBar).toBeTruthy();
    expect(stepBar?.style.display).toBe('flex');

    const toggleBtn = container.querySelector('#ed-btn-step-rec');
    expect(toggleBtn?.classList.contains('recording')).toBe(true);

    // 關閉步進錄音
    editor.toggleStepRecording(false);
    expect(editor.isRecording()).toBe(false);
    expect(stepBar?.style.display).toBe('none');
  });

  it('2. 支援切換不同步進時值解析度 (1/16, 1/8, 1/4, 1/2, 1/1)', () => {
    editor.toggleStepRecording(true);
    expect(editor.getStepResolution()).toBe('1/16');

    editor.setStepResolution('1/4');
    expect(editor.getStepResolution()).toBe('1/4');
    expect(editor.getStepRecorder()?.getStepTicks()).toBe(480);

    editor.setStepResolution('1/8');
    expect(editor.getStepResolution()).toBe('1/8');
    expect(editor.getStepRecorder()?.getStepTicks()).toBe(240);

    editor.setStepResolution('1/16');
    expect(editor.getStepRecorder()?.getStepTicks()).toBe(120);
  });

  it('3. 實體琴鍵彈奏單音 (Web MIDI NoteOn / NoteOff) 精準寫入當前軌道並推進游標', () => {
    editor.toggleStepRecording(true);
    editor.setStepResolution('1/4'); // 480 ticks

    const recorder = editor.getStepRecorder()!;
    expect(recorder.getCurrentTick()).toBe(0);

    // 模擬 PSR-SX920 琴鍵彈奏 C4 (60) 力度 95
    midiManager.simulateNoteOn(60, 95, 0); // 琴端通常在 Channel 0/1 發送
    midiManager.simulateNoteOff(60, 0);

    // 推進防抖計時器
    vi.advanceTimersByTime(50);

    // 驗證音符已成功寫入
    const events = (editor as any).events;
    expect(events.length).toBe(1);
    expect(events[0].noteNumber).toBe(60);
    expect(events[0].velocity).toBe(95);
    expect(events[0].relTick).toBe(0);
    expect(events[0].durationTicks).toBe(480);
    expect(events[0].channel).toBe(11); // 成功路由至聚焦軌道 (Chord 1)

    // 驗證游標前進至 Tick 480
    expect(recorder.getCurrentTick()).toBe(480);
  });

  it('4. 實體琴鍵彈奏多音和弦 (Chord Capture) 正確聚合且無掉音', () => {
    editor.toggleStepRecording(true);
    editor.setStepResolution('1/4');

    // 模擬彈奏 C 大三和弦 (C4, E4, G4)
    midiManager.simulateNoteOn(60, 100, 0);
    midiManager.simulateNoteOn(64, 98, 0);
    midiManager.simulateNoteOn(67, 102, 0);

    // 放開琴鍵
    midiManager.simulateNoteOff(60, 0);
    midiManager.simulateNoteOff(64, 0);
    midiManager.simulateNoteOff(67, 0);

    vi.advanceTimersByTime(50);

    const events = (editor as any).events;
    expect(events.length).toBe(3);
    const pitches = events.map((e: any) => e.noteNumber).sort((a: number, b: number) => a - b);
    expect(pitches).toEqual([60, 64, 67]);

    // 所有和弦音起始 Tick 與 Duration 一致
    events.forEach((e: any) => {
      expect(e.relTick).toBe(0);
      expect(e.durationTicks).toBe(480);
    });

    // 游標前進 480
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(480);
  });

  it('5. 支援插入休止符 (insertRest) 並推進游標', () => {
    editor.toggleStepRecording(true);
    editor.setStepResolution('1/8'); // 240 ticks

    editor.insertRest();
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(240);
    expect((editor as any).events.length).toBe(0);

    // 接著彈入一個音符
    midiManager.simulateNoteOn(62, 100, 0);
    midiManager.simulateNoteOff(62, 0);
    vi.advanceTimersByTime(50);

    const events = (editor as any).events;
    expect(events.length).toBe(1);
    expect(events[0].noteNumber).toBe(62);
    expect(events[0].relTick).toBe(240); // 落在第 2 拍前半 (Tick 240)
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(480);
  });

  it('6. 支援延音 (Tie)：延長上一音符時值並前進游標', () => {
    editor.toggleStepRecording(true);
    editor.setStepResolution('1/4'); // 480 ticks

    // 彈入 C4 (1 拍 = 480 ticks)
    midiManager.simulateNoteOn(60, 100, 0);
    midiManager.simulateNoteOff(60, 0);
    vi.advanceTimersByTime(50);

    expect((editor as any).events[0].durationTicks).toBe(480);
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(480);

    // 按下延音 (Tie)
    const tied = editor.tiePreviousNote();
    expect(tied).toBe(true);

    // 時值擴展為 960 (2 拍)，游標前進至 960
    expect((editor as any).events[0].durationTicks).toBe(960);
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(960);
  });

  it('7. 支援單步撤銷退回 (stepBack) 與回到起點 (rewind)', () => {
    editor.toggleStepRecording(true);
    editor.setStepResolution('1/4');

    // 彈入第 1 音
    midiManager.simulateNoteOn(60, 100, 0);
    midiManager.simulateNoteOff(60, 0);
    vi.advanceTimersByTime(50);

    // 彈入第 2 音
    midiManager.simulateNoteOn(62, 100, 0);
    midiManager.simulateNoteOff(62, 0);
    vi.advanceTimersByTime(50);

    expect((editor as any).events.length).toBe(2);
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(960);

    // 執行退步 (Step Back)
    editor.stepBack();
    expect((editor as any).events.length).toBe(1);
    expect((editor as any).events[0].noteNumber).toBe(60);
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(480);

    // 執行回起點 (Rewind)
    editor.rewindStepCursor();
    expect(editor.getStepRecorder()?.getCurrentTick()).toBe(0);
  });

  it('8. 驗證 index.html 包含 MIDI 輸入埠與步進錄音樣式元素', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="select-midi-in-port"');
    expect(html).toContain('MIDI 輸入埠 (琴鍵步進)');
    expect(html).toContain('.editor-step-bar');
    expect(html).toContain('.editor-step-cursor');
    expect(html).toContain('.step-rec-toggle-btn');
    expect(html).toContain('實體琴鍵連線步進錄音');
  });
});
