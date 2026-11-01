import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { NewStyleModal, type NewStyleModalConfig } from '../src/player/new-style-modal';

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
    display: 'none',
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
  };
  public children: MockElement[] = [];
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
    }
    return null;
  }

  public querySelector(selector: string): MockElement | null {
    const found = this.find(selector);
    if (found) return found;
    const fallback = new MockElement('div');
    if (selector.startsWith('#')) fallback.id = selector.slice(1);
    this.children.push(fallback);
    return fallback;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    if (selector.includes('input:checked')) {
      for (const c of this.children) {
        if (c.checked) res.push(c);
        res.push(...c.querySelectorAll(selector));
      }
    }
    return res;
  }

  public focus() {}
  public select() {}

  public set innerHTML(html: string) {
    // 建立 mock 子元件
    const createInput = (id: string, val: string = '', checked: boolean = false) => {
      const el = new MockElement('input');
      el.id = id;
      el.value = val;
      el.checked = checked;
      this.appendChild(el);
      return el;
    };
    const createSelect = (id: string, val: string = '') => {
      const el = new MockElement('select');
      el.id = id;
      el.value = val;
      const opt = new MockElement('option');
      opt.textContent = '流行樂團 — 標準鼓組';
      el.children.push(opt);
      this.appendChild(el);
      return el;
    };
    const createButton = (id: string) => {
      const el = new MockElement('button');
      el.id = id;
      this.appendChild(el);
      return el;
    };

    createInput('ns-input-name', 'MyNewStyle');
    createInput('ns-input-bpm', '120');
    createInput('ns-slider-bpm', '120');
    createSelect('ns-select-timesig', '4/4');
    createSelect('ns-select-sec-preset', 'classic_4');
    const customSecs = new MockElement('div');
    customSecs.id = 'ns-custom-sections';
    this.appendChild(customSecs);
    createSelect('ns-select-inst-preset', 'pop');
    createInput('ns-chk-pilot-beat', 'true', true);

    const summary = new MockElement('div');
    summary.id = 'ns-summary-text';
    this.appendChild(summary);

    createButton('ns-btn-cancel');
    createButton('ns-btn-confirm');
    createButton('ns-btn-close-header');
  }
}

describe('階段一：全新空白 STY 伴奏製作嚮導 (NewStyleModal & Synthesizer)', () => {
  const origDocument = (globalThis as any).document;
  const origWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      body: {
        appendChild: () => {},
      },
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

  describe('1. NewStyleModal 彈窗生命週期與設定解析', () => {
    it('1.1 彈窗初始化具備正確原廠預設值', () => {
      const modal = new NewStyleModal();
      expect(modal.isOpen()).toBe(false);

      modal.open(() => {});
      expect(modal.isOpen()).toBe(true);

      const inputName = (modal as any).inputName;
      expect(inputName.value).toBe('MyNewStyle');

      const selectTimeSig = (modal as any).selectTimeSig;
      expect(selectTimeSig.value).toBe('4/4');

      const chkPilotBeat = (modal as any).chkPilotBeat;
      expect(chkPilotBeat.checked).toBe(true);

      modal.close();
      expect(modal.isOpen()).toBe(false);
    });

    it('1.2 選擇不同段落範本時，能返回正確的段落清單與小節數', () => {
      const modal = new NewStyleModal();
      let confirmedConfig: NewStyleModalConfig | null = null;
      modal.open((cfg) => {
        confirmedConfig = cfg;
      });

      // 預設 classic_4: 4 個段落
      (modal as any).handleConfirm();
      expect(confirmedConfig).not.toBeNull();
      expect(confirmedConfig!.sections).toHaveLength(4);
      expect(confirmedConfig!.sections.map(s => s.name)).toEqual(['Main A', 'Fill In AA', 'Main B', 'Ending A']);

      // 切換為 standard_8: 8 個段落
      modal.open((cfg) => {
        confirmedConfig = cfg;
      });
      (modal as any).selectSectionPreset.value = 'standard_8';
      (modal as any).handleConfirm();
      expect(confirmedConfig!.sections).toHaveLength(8);
      expect(confirmedConfig!.sections.map(s => s.name)).toEqual([
        'Intro A', 'Main A', 'Fill In AA', 'Main B', 'Fill In BB', 'Main C', 'Main D', 'Ending A'
      ]);
    });
  });

  describe('2. YamahaStyleSynthesizer 全新 SFF2 伴奏結構生成', () => {
    it('2.1 生成的原生 SFF2 伴奏檔案包含必要標籤、1920 PPQ、8 聲部與 CASM 轉調塊', () => {
      const blankStyle = YamahaStyleSynthesizer.createBlankStyle({
        styleName: 'TestStyle_120',
        bpm: 125,
        timeSignature: { numerator: 4, denominator: 4 },
        division: 1920,
        sections: [
          { name: 'Main A', bars: 4 },
          { name: 'Fill In AA', bars: 1 },
          { name: 'Main B', bars: 4 },
          { name: 'Ending A', bars: 2 },
        ],
      });

      expect(blankStyle.division).toBe(1920);
      expect(blankStyle.bpm).toBe(125);
      expect(blankStyle.hasCasm).toBe(true);
      expect(blankStyle.customChunks.some(c => c.id === 'CASM')).toBe(true);

      // 檢查段落包含 SFF2, SInt 與 4 個音樂段落
      const musicalSecs = YamahaStyleSynthesizer.getMusicalSections(blankStyle);
      expect(musicalSecs).toHaveLength(4);
      expect(musicalSecs.map(s => s.name)).toEqual(['Main A', 'Fill In AA', 'Main B', 'Ending A']);

      // 檢查 8 聲部均正確初始化
      expect(blankStyle.parts).toHaveLength(8);
      const bassPart = blankStyle.parts.find(p => p.channel === 10);
      expect(bassPart).toBeDefined();
      expect(bassPart?.volume).toBe(95);
      expect(bassPart?.pan).toBe(64);

      // 檢查 casmMappings 映射
      expect(blankStyle.casmMappings).toBeDefined();
      expect(blankStyle.casmMappings!['main a'][10]).toBe(10);
    });

    it('2.2 二進位安全匯出並反序列化回讀驗證 (Round-trip Verification)', () => {
      const blankStyle = YamahaStyleSynthesizer.createBlankStyle({
        styleName: 'MyExportStyle',
        bpm: 110,
        timeSignature: { numerator: 4, denominator: 4 },
      });

      const exportResult = YamahaWriter.validateAndWrite(blankStyle);
      expect(exportResult.fileSize).toBeGreaterThan(1000);
      expect(exportResult.hasCasm).toBe(true);

      // 回讀反序列化
      const reparsed = YamahaParser.parse(exportResult.bytes, 'STY');
      expect(reparsed.division).toBe(1920);
      expect(reparsed.bpm).toBe(110);
      expect(reparsed.hasCasm).toBe(true);

      const parts = reparsed.parts;
      expect(parts.length).toBeGreaterThanOrEqual(8);
      const drumPart = parts.find(p => p.channel === 9);
      expect(drumPart?.bankMsb).toBe(127);
    });

    it('2.3 載入生成的空白伴奏至 StyPlaybackEngine 順暢無阻', () => {
      const blankStyle = YamahaStyleSynthesizer.createBlankStyle({
        styleName: 'EngineMountTest',
        bpm: 130,
        timeSignature: { numerator: 4, denominator: 4 },
      });

      styPlaybackEngine.loadParsed(blankStyle);
      styPlaybackEngine.selectSection('Main A');

      expect(styPlaybackEngine.getCurrentSection()?.name).toBe('Main A');
      expect(styPlaybackEngine.getChannelVolume(9)).toBe(100);
      expect(styPlaybackEngine.getChannelPan(9)).toBe(64);
      expect(styPlaybackEngine.getChannelReverb(9)).toBe(40);
      expect(styPlaybackEngine.getChannelChorus(9)).toBe(0);
    });
  });
});
