import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { ALL_STANDARD_SECTIONS } from '../src/core/models/style-types';
import { AddSectionModal, type AddSectionConfig } from '../src/player/add-section-modal';

// ============================================================================
// Lightweight Mock DOM for AddSectionModal Unit Testing in Node environment
// ============================================================================
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '';
  public disabled: boolean = false;
  public checked: boolean = true;
  public style: Record<string, any> = {
    display: 'none',
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
  };
  public dataset: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Record<string, Function[]> = {};

  public focus() {}
  public blur() {}

  public get options(): MockElement[] {
    return this.children.filter(c => c.tagName === 'OPTION');
  }

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

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  public appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
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
      const cls = selector.slice(1).split(':')[0];
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

    if (html.includes('add-section-modal')) {
      const modal = new MockElement('div');
      modal.className = 'add-section-modal';
      this.appendChild(modal);

      const title = new MockElement('h2');
      title.id = 'as-modal-title';
      modal.appendChild(title);

      const btnCloseHeader = new MockElement('button');
      btnCloseHeader.id = 'as-btn-close-header';
      modal.appendChild(btnCloseHeader);

      const selectSec = new MockElement('select');
      selectSec.id = 'as-select-section';
      modal.appendChild(selectSec);

      const quickBars = new MockElement('div');
      quickBars.id = 'as-quick-bars';
      modal.appendChild(quickBars);

      [1, 2, 4, 8].forEach(b => {
        const btn = new MockElement('button');
        btn.className = 'as-btn-bar';
        btn.dataset.bars = b.toString();
        quickBars.appendChild(btn);
      });

      const inputBars = new MockElement('input');
      inputBars.id = 'as-input-bars';
      inputBars.value = '4';
      modal.appendChild(inputBars);

      const chkPilot = new MockElement('input');
      chkPilot.id = 'as-chk-pilot';
      chkPilot.checked = true;
      modal.appendChild(chkPilot);

      const summaryText = new MockElement('div');
      summaryText.id = 'as-summary-text';
      modal.appendChild(summaryText);

      const btnCancel = new MockElement('button');
      btnCancel.id = 'as-btn-cancel';
      modal.appendChild(btnCancel);

      const btnConfirm = new MockElement('button');
      btnConfirm.id = 'as-btn-confirm';
      modal.appendChild(btnConfirm);
    }
  }
}

describe('【新增伴奏段落】快捷彈窗 (Add Section Modal) 與核心引擎測試', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  let origDoc: any;
  let origWin: any;
  let mockBody: MockElement;

  beforeEach(() => {
    origDoc = (globalThis as any).document;
    origWin = (globalThis as any).window;

    mockBody = new MockElement('body');
    (globalThis as any).document = {
      body: mockBody,
      createElement: (tag: string) => new MockElement(tag),
      getElementById: (id: string) => mockBody.querySelector('#' + id),
      querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
      addEventListener: () => {},
    };
    (globalThis as any).window = {
      addEventListener: () => {},
    };
  });

  afterEach(() => {
    (globalThis as any).document = origDoc;
    (globalThis as any).window = origWin;
  });

  it('1. AddSectionModal 能成功建立 DOM 並掛載到 document.body', () => {
    const modal = new AddSectionModal();
    expect(modal).toBeDefined();

    const backdrop = mockBody.children.find(c => c.id === 'add-section-backdrop');
    expect(backdrop).toBeDefined();
    expect(backdrop?.style.display).toBe('none');
    expect(modal.isOpen()).toBe(false);
  });

  it('2. open() 能精準過濾既有段落，僅提供未存在之 Yamaha 標準段落供使用者選擇', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const modal = new AddSectionModal();
    modal.open(parsed, () => {});

    expect(modal.isOpen()).toBe(true);

    const select = mockBody.querySelector('#as-select-section') as MockElement;
    expect(select).toBeDefined();
    expect(select.options.length).toBeGreaterThan(0);

    // 檢查現有的段落 (例如 Main A) 不應出現在新增選單中
    const existing = parsed.sections.map(s => s.name.toLowerCase());
    for (const opt of select.options) {
      expect(existing).not.toContain(opt.value.toLowerCase());
    }
  });

  it('3. 段落切換時能自動帶入推薦小節長度 (Fill In 為 1 小節, Main 為 4 小節)', () => {
    const modal = new AddSectionModal();
    const mockParsed: any = {
      sections: [{ name: 'Main A', startTick: 0, endTick: 7680, measureCount: 4 }],
      tracks: [{ events: [] }],
      division: 1920,
    };

    modal.open(mockParsed, () => {});

    const select = mockBody.querySelector('#as-select-section') as MockElement;
    const inputBars = mockBody.querySelector('#as-input-bars') as MockElement;
    const chkPilot = mockBody.querySelector('#as-chk-pilot') as MockElement;

    // 模擬選取 Fill In AA
    select.value = 'Fill In AA';
    (modal as any).handleSectionChange();
    expect(inputBars.value).toBe('1');
    expect(chkPilot.checked).toBe(false);

    // 模擬選取 Main C
    select.value = 'Main C';
    (modal as any).handleSectionChange();
    expect(inputBars.value).toBe('4');
    expect(chkPilot.checked).toBe(true);
  });

  it('4. 點擊確認新增時正確回傳 AddSectionConfig 參數', () => {
    const modal = new AddSectionModal();
    const mockParsed: any = {
      sections: [{ name: 'Main A', startTick: 0, endTick: 7680, measureCount: 4 }],
      tracks: [{ events: [] }],
      division: 1920,
    };

    let resultConfig: AddSectionConfig | null = null;
    modal.open(mockParsed, (config) => {
      resultConfig = config;
    });

    const select = mockBody.querySelector('#as-select-section') as MockElement;
    const inputBars = mockBody.querySelector('#as-input-bars') as MockElement;
    const chkPilot = mockBody.querySelector('#as-chk-pilot') as MockElement;

    select.value = 'Main C';
    inputBars.value = '8';
    chkPilot.checked = true;

    (modal as any).handleConfirm();

    expect(resultConfig).not.toBeNull();
    expect(resultConfig?.sectionName).toBe('Main C');
    expect(resultConfig?.bars).toBe(8);
    expect(resultConfig?.pilotBeat).toBe(true);
    expect(modal.isOpen()).toBe(false);
  });

  it('5. YamahaStyleModifier.createSection 建立新段落時自動注入 SFF2 CASM 伴奏規則與 casmMappings', () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const ok = YamahaStyleModifier.createSection(parsed, 'Main E', 4);
    expect(ok).toBe(true);

    // 驗證 parsed.sections 中存在 Main E
    const addedSec = parsed.sections.find(s => s.name === 'Main E');
    expect(addedSec).toBeDefined();
    expect(addedSec?.measureCount).toBe(4);

    // 驗證 casmMappings 已自動註冊 Main E 的 8 大通道映射
    expect(parsed.casmMappings).toBeDefined();
    const mainEMap = parsed.casmMappings?.['main e'];
    expect(mainEMap).toBeDefined();
    expect(mainEMap[8]).toBe(8);
    expect(mainEMap[9]).toBe(9);
    expect(mainEMap[10]).toBe(10);
    expect(mainEMap[15]).toBe(15);

    // 二進位序列化與反序列化驗證 (Round-Trip)
    const writtenBytes = YamahaWriter.write(parsed, 'STY');
    const reparsed = YamahaParser.parse(writtenBytes, 'STY');

    const reparsedSec = reparsed.sections.find(s => s.name === 'Main E');
    expect(reparsedSec).toBeDefined();
    expect(reparsed.casmMappings?.['main e']).toBeDefined();
  });
});
