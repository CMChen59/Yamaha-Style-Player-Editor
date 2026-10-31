import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { styPlaybackEngine, type PlaybackCCEvent } from '../src/player/sty-playback-engine';
import { SingleTrackEditor } from '../src/player/single-track-editor';

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

  public setAttribute(name: string, val: string) {
    (this as any)[name] = val;
  }

  public getAttribute(name: string) {
    return (this as any)[name];
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
    const btnUndo = new MockElement('button');
    btnUndo.id = 'ed-btn-undo';
    this.appendChild(btnUndo);

    const btnRedo = new MockElement('button');
    btnRedo.id = 'ed-btn-redo';
    this.appendChild(btnRedo);

    const btnDelete = new MockElement('button');
    btnDelete.id = 'ed-btn-delete';
    this.appendChild(btnDelete);

    const velStatus = new MockElement('span');
    velStatus.id = 'ed-vel-status';
    this.appendChild(velStatus);
  }
}

describe('計畫 B: CC 控制器自動化控制線 (Automation Lanes) 完整測試', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
  const buffer = fs.readFileSync(samplePath);
  const parsed = YamahaParser.parse(buffer);

  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
    };
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  it('1. YamahaStyleModifier.replaceSectionChannelCCEvents 能精確替換段落中特定聲部的 CC 11 表情曲線', () => {
    const sectionName = 'Main A';
    const channel = 10; // Bass
    const controller = 11; // Expression

    const newCCEvents: PlaybackCCEvent[] = [
      { channel, controller, value: 40, relTick: 0 },
      { channel, controller, value: 70, relTick: 1920 },
      { channel, controller, value: 95, relTick: 3840 },
      { channel, controller, value: 120, relTick: 5760 },
      { channel, controller, value: 127, relTick: 7680 },
    ];

    const ok = YamahaStyleModifier.replaceSectionChannelCCEvents(
      parsed,
      sectionName,
      channel,
      controller,
      newCCEvents
    );
    expect(ok).toBe(true);

    // 驗證 Track 0 中寫入的 CC 事件
    const track0 = parsed.tracks[0];
    let curTick = 0;
    const writtenCC: Array<{ tick: number; value: number; controller: number }> = [];

    const range = parsed.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
    expect(range).toBeDefined();

    for (const ev of track0.events) {
      curTick += ev.delta;
      if (
        curTick >= range!.startTick &&
        curTick < range!.endTick &&
        ev.type === 'controlChange' &&
        ev.controller === controller
      ) {
        writtenCC.push({ tick: curTick - range!.startTick, value: ev.value ?? 0, controller: ev.controller });
      }
    }

    expect(writtenCC.length).toBe(5);
    expect(writtenCC[0].value).toBe(40);
    expect(writtenCC[4].value).toBe(127);
  });

  it('2. 支援同時獨立管理多種 CC 控制器 (CC 7 音量與 CC 10 聲相)，互不干擾', () => {
    const sectionName = 'Main A';
    const channel = 11; // Chord 1

    // 寫入 CC 7 (Volume)
    const volEvents = [
      { channel, controller: 7, value: 80, relTick: 0 },
      { channel, controller: 7, value: 110, relTick: 3840 },
    ];
    YamahaStyleModifier.replaceSectionChannelCCEvents(parsed, sectionName, channel, 7, volEvents);

    // 寫入 CC 10 (Pan)
    const panEvents = [
      { channel, controller: 10, value: 32, relTick: 0 },
      { channel, controller: 10, value: 96, relTick: 3840 },
    ];
    YamahaStyleModifier.replaceSectionChannelCCEvents(parsed, sectionName, channel, 10, panEvents);

    const track0 = parsed.tracks[0];
    let curTick = 0;
    let foundVol = 0;
    let foundPan = 0;
    const range = parsed.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase())!;

    for (const ev of track0.events) {
      curTick += ev.delta;
      if (curTick >= range.startTick && curTick < range.endTick && ev.type === 'controlChange') {
        if (ev.controller === 7) foundVol++;
        if (ev.controller === 10) foundPan++;
      }
    }

    expect(foundVol).toBeGreaterThanOrEqual(2);
    expect(foundPan).toBeGreaterThanOrEqual(2);
  });

  it('3. styPlaybackEngine 支援 CC 自動化事件之儲存、讀取與即時聽覺反饋', () => {
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');

    const testEvents: PlaybackCCEvent[] = [
      { channel: 12, controller: 11, value: 60, relTick: 0 },
      { channel: 12, controller: 11, value: 127, relTick: 1920 },
    ];

    styPlaybackEngine.setChannelCCEvents(12, 11, testEvents);
    const retrieved = styPlaybackEngine.getChannelCCEvents(12, 11);
    expect(retrieved.length).toBe(2);
    expect(retrieved[0].value).toBe(60);
    expect(retrieved[1].value).toBe(127);

    // 驗證 applyLiveControlChange 即時聽覺反饋不拋出異常
    expect(() => {
      styPlaybackEngine.applyLiveControlChange(12, 11, 95);
      styPlaybackEngine.applyLiveControlChange(12, 7, 100);
      styPlaybackEngine.applyLiveControlChange(12, 10, 64);
    }).not.toThrow();
  });

  it('4. SingleTrackEditor 支援 CC 自動化歷史紀錄堆疊 (Undo / Redo)', () => {
    const mockContainer = new MockElement('div');
    const editor = new SingleTrackEditor(mockContainer as any);

    const initialCC: PlaybackCCEvent[] = [
      { channel: 10, controller: 11, value: 127, relTick: 0 },
    ];

    editor.loadTrack(
      10,
      'Bass',
      '#3b82f6',
      [],
      7680,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      true,
      initialCC
    );

    let changedController: number | null = null;
    let changedEvents: PlaybackCCEvent[] = [];
    editor.setOnCCEventsChanged((ch, ctrl, evs) => {
      changedController = ctrl;
      changedEvents = evs;
    });

    // 模擬使用者套用漸強曲線
    const rampCC: PlaybackCCEvent[] = [
      { channel: 10, controller: 11, value: 40, relTick: 0 },
      { channel: 10, controller: 11, value: 127, relTick: 7680 },
    ];
    editor.pushCCHistory('CC 11 漸強曲線', 11, initialCC, rampCC);
    expect(editor.canUndo()).toBe(true);

    // 執行 Undo
    const undoSuccess = editor.undo();
    expect(undoSuccess).toBe(true);
    expect(changedController).toBe(11);
    expect(changedEvents[0].value).toBe(127);

    // 執行 Redo
    const redoSuccess = editor.redo();
    expect(redoSuccess).toBe(true);
    expect(changedController).toBe(11);
    expect(changedEvents[0].value).toBe(40);
  });

  it('5. 經 CC 控制器自動化修改後的 STY 能通過 YamahaWriter 二進位序列化與嚴格結構驗證', () => {
    const result = YamahaWriter.validateAndWrite(parsed);
    expect(result.success).toBe(true);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(1000);

    // 再次反組譯驗證二進位合規性
    const reparsed = YamahaParser.parse(result.bytes);
    expect(reparsed.tracks.length).toBeGreaterThanOrEqual(1);
    expect(reparsed.sections.length).toBeGreaterThan(0);
    expect(reparsed.hasCasm).toBe(true);
  });
});
