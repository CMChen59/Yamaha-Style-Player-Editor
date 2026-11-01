import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { midiManager } from '../src/core/audio/midi-manager';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
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

  public find(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.find(selector);
        if (found) return found;
      }
      return null;
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        const found = c.find(selector);
        if (found) return found;
      }
      return null;
    }
    return null;
  }

  public querySelector(selector: string): MockElement | null {
    const found = this.find(selector);
    if (found) return found;
    const fallback = new MockElement('div');
    if (selector.startsWith('.')) fallback.classList.add(selector.slice(1));
    else if (selector.startsWith('#')) fallback.id = selector.slice(1);
    this.children.push(fallback);
    return fallback;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    if (selector.toLowerCase() === 'option') {
      for (const c of this.children) {
        if (c.tagName.toLowerCase() === 'option') res.push(c);
        res.push(...c.querySelectorAll(selector));
      }
    }
    return res;
  }

  public rawHtml: string = '';
  public set innerHTML(html: string) {
    this.rawHtml = html;
    if (html.includes('ed-lane-cc-select')) {
      const ccSelect = new MockElement('select');
      ccSelect.id = 'ed-lane-cc-select';
      const regex = /<option value="([^"]+)"/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const opt = new MockElement('option');
        opt.setAttribute('value', match[1]);
        opt.value = match[1];
        ccSelect.appendChild(opt);
      }
      this.appendChild(ccSelect);
    }
  }
}

describe('計畫 C：混音台進階空間效果器（Reverb & Chorus）測試套件', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.clearAllMocks();
    styPlaybackEngine.setOutputMode('webaudio');

    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {},
      activeElement: null,
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

  describe('1. StyPlaybackEngine 空間效果器控制與狀態同步', () => {
    it('1.1 預設殘響 (Reverb CC 91) 為 40，預設合唱 (Chorus CC 93) 為 0', () => {
      expect(styPlaybackEngine.getChannelReverb(11)).toBe(40);
      expect(styPlaybackEngine.getChannelChorus(11)).toBe(0);
    });

    it('1.2 setChannelReverb 能正確更新數值並限制在 0 ~ 127 區間', () => {
      styPlaybackEngine.setChannelReverb(11, 75);
      expect(styPlaybackEngine.getChannelReverb(11)).toBe(75);

      // 負值截斷
      styPlaybackEngine.setChannelReverb(11, -20);
      expect(styPlaybackEngine.getChannelReverb(11)).toBe(0);

      // 超界截斷
      styPlaybackEngine.setChannelReverb(11, 200);
      expect(styPlaybackEngine.getChannelReverb(11)).toBe(127);
    });

    it('1.3 setChannelChorus 能正確更新數值並限制在 0 ~ 127 區間', () => {
      styPlaybackEngine.setChannelChorus(12, 60);
      expect(styPlaybackEngine.getChannelChorus(12)).toBe(60);

      // 負值截斷
      styPlaybackEngine.setChannelChorus(12, -10);
      expect(styPlaybackEngine.getChannelChorus(12)).toBe(0);

      // 超界截斷
      styPlaybackEngine.setChannelChorus(12, 180);
      expect(styPlaybackEngine.getChannelChorus(12)).toBe(127);
    });

    it('1.4 在 MIDI 模式下，setChannelReverb 與 setChannelChorus 透過 Web MIDI 發送 CC 91 與 CC 93', () => {
      const sendSpy = vi.spyOn(midiManager, 'sendControlChange').mockImplementation(() => {});
      styPlaybackEngine.setOutputMode('midi');

      styPlaybackEngine.setChannelReverb(10, 85);
      expect(sendSpy).toHaveBeenCalledWith(10, 91, 85);

      styPlaybackEngine.setChannelChorus(10, 45);
      expect(sendSpy).toHaveBeenCalledWith(10, 93, 45);

      sendSpy.mockRestore();
    });

    it('1.5 applyLiveControlChange 能正確轉發 CC 91 與 CC 93 至 setChannelReverb 與 setChannelChorus', () => {
      styPlaybackEngine.applyLiveControlChange(13, 91, 65);
      expect(styPlaybackEngine.getChannelReverb(13)).toBe(65);

      styPlaybackEngine.applyLiveControlChange(13, 93, 30);
      expect(styPlaybackEngine.getChannelChorus(13)).toBe(30);
    });
  });

  describe('2. SingleTrackEditor 自動化控制線支援 CC 91 與 CC 93', () => {
    it('2.1 SingleTrackEditor 初始化時建立包含 CC 91 (40) 與 CC 93 (0) 的預設點', () => {
      const container = new MockElement('div');
      const editor = new SingleTrackEditor(container as any);
      editor.loadTrack(11, 'Chord 1', '#10b981', [], 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

      const ccMap = (editor as any).ccEventsMap as Map<number, any[]>;
      expect(ccMap.has(91)).toBe(true);
      expect(ccMap.get(91)?.[0]?.value).toBe(40);

      expect(ccMap.has(93)).toBe(true);
      expect(ccMap.get(93)?.[0]?.value).toBe(0);
    });

    it('2.2 自動化控制線下拉選單包含 CC 91 與 CC 93 選項', () => {
      const container = new MockElement('div');
      const editor = new SingleTrackEditor(container as any);
      editor.loadTrack(12, 'Chord 2', '#06b6d4', [], 1920, 4, 480, { numerator: 4, denominator: 4 }, null);

      const select = container.querySelector('#ed-lane-cc-select');
      expect(select).not.toBeNull();
      const options = select!.querySelectorAll('option').map(o => o.value);
      expect(options).toContain('91');
      expect(options).toContain('93');
    });
  });

  describe('3. YamahaStyleModifier 與二進位匯出持久化驗證', () => {
    it('3.1 setPartMixing 寫入 CC 91 與 CC 93 至 STY SMF Track 0，並成功反序列化回讀', () => {
      const style = YamahaStyleSynthesizer.createBlankStyle({ styleName: 'Spatial FX Test' });

      // 為 Channel 11 (Chord 1) 設定自訂空間效果深度
      const ok = YamahaStyleModifier.setPartMixing(style, 11, {
        volume: 105,
        pan: 40,
        reverb: 88,
        chorus: 52,
      });
      expect(ok).toBe(true);

      const part = style.parts.find(p => p.channel === 11);
      expect(part?.reverb).toBe(88);
      expect(part?.chorus).toBe(52);

      // 檢查 Track 0 中的 MIDI 事件
      const track0Events = style.tracks[0].events;
      const revEv = track0Events.find(e => e.type === 'controlChange' && e.channel === 11 && e.controller === 91);
      const choEv = track0Events.find(e => e.type === 'controlChange' && e.channel === 11 && e.controller === 93);

      expect(revEv?.value).toBe(88);
      expect(choEv?.value).toBe(52);

      // 二進位匯出與解析回讀 (Round-trip)
      const exportResult = YamahaWriter.validateAndWrite(style);
      expect(exportResult.fileSize).toBeGreaterThan(0);

      const reparsed = YamahaParser.parse(exportResult.bytes, 'STY');
      const reparsedPart = reparsed.parts.find(p => p.channel === 11);
      expect(reparsedPart?.reverb).toBe(88);
      expect(reparsedPart?.chorus).toBe(52);
    });

    it('3.2 載入含自訂空間效果的 STY 至 StyPlaybackEngine 時，能正確還原殘響與合唱', () => {
      const style = YamahaStyleSynthesizer.createBlankStyle({ styleName: 'Playback Engine Load Test' });
      YamahaStyleModifier.setPartMixing(style, 12, {
        reverb: 95,
        chorus: 42,
      });

      styPlaybackEngine.loadParsed(style);
      // selectSection 會套用各聲部設定
      styPlaybackEngine.selectSection('Main A');

      expect(styPlaybackEngine.getChannelReverb(12)).toBe(95);
      expect(styPlaybackEngine.getChannelChorus(12)).toBe(42);
    });
  });
});
