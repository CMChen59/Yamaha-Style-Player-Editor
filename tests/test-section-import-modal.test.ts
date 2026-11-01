import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { SectionImportModal } from '../src/player/section-import-modal';
import type { YamahaFileParsed } from '../src/core/models/types';

// ============================================================================
// Lightweight Mock DOM for SectionImportModal Unit Testing in Node environment
// ============================================================================
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public label: string = '';
  private _value: string = '';
  private _innerHTML: string = '';
  public disabled: boolean = false;
  public checked: boolean = true;
  public style: Record<string, any> = {
    display: 'none',
    opacity: '0.5',
    pointerEvents: 'none',
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
  };
  public dataset: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Record<string, Function[]> = {};

  public focus() {}
  public blur() {}

  public get value(): string {
    if (this.tagName === 'SELECT') {
      if (this._value !== '') {
        return this._value;
      }
      const opts = this.options;
      return opts.length > 0 ? opts[0].value : '';
    }
    return this._value;
  }

  public set value(val: string) {
    this._value = val;
  }

  public get options(): MockElement[] {
    const opts: MockElement[] = [];
    const collect = (el: MockElement) => {
      for (const child of el.children) {
        if (child.tagName === 'OPTION') opts.push(child);
        else collect(child);
      }
    };
    collect(this);
    return opts;
  }

  public get selectedIndex(): number {
    const opts = this.options;
    return opts.findIndex((o) => o.value === this.value);
  }

  public set selectedIndex(idx: number) {
    const opts = this.options;
    if (opts[idx]) {
      this.value = opts[idx].value;
    }
  }

  public classList = {
    add: (...classes: string[]) => {
      this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...classes])].join(' ');
    },
    remove: (...classes: string[]) => {
      this.className = this.className.split(' ').filter((c) => !classes.includes(c)).join(' ');
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

  public closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) {
        return curr;
      }
      if (selector.startsWith('#') && curr.id === selector.slice(1)) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
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

  public click() {
    this.dispatchEvent('click');
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
      if (selector === '.si-ch-checkbox') {
        if (node.classList.contains('si-ch-checkbox')) results.push(node);
      } else if (selector === '.si-ch-checkbox:checked') {
        if (node.classList.contains('si-ch-checkbox') && node.checked) results.push(node);
      } else if (selector.startsWith('.')) {
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

  public get innerHTML(): string {
    return this._innerHTML;
  }

  public set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    if (!html || html.trim() === '') return;

    // 模擬 SectionImportModal 主 DOM 結構初始化
    if (html.includes('section-import-modal')) {
      const modal = new MockElement('div');
      modal.className = 'section-import-modal';
      this.appendChild(modal);

      const title = new MockElement('h2');
      title.id = 'si-modal-title';
      modal.appendChild(title);

      const btnCloseHeader = new MockElement('button');
      btnCloseHeader.id = 'si-btn-close-header';
      modal.appendChild(btnCloseHeader);

      const fileInput = new MockElement('input');
      fileInput.id = 'si-file-input';
      modal.appendChild(fileInput);

      const dropZone = new MockElement('div');
      dropZone.id = 'si-drop-zone';
      modal.appendChild(dropZone);

      const fileSummary = new MockElement('div');
      fileSummary.id = 'si-file-summary';
      modal.appendChild(fileSummary);

      const routeCard = new MockElement('div');
      routeCard.id = 'si-route-card';
      modal.appendChild(routeCard);

      const selectSource = new MockElement('select');
      selectSource.id = 'si-select-source';
      routeCard.appendChild(selectSource);

      const selectTarget = new MockElement('select');
      selectTarget.id = 'si-select-target';
      routeCard.appendChild(selectTarget);

      const chCard = new MockElement('div');
      chCard.id = 'si-channels-card';
      modal.appendChild(chCard);

      const btnPresetAll = new MockElement('button');
      btnPresetAll.id = 'si-btn-preset-all';
      chCard.appendChild(btnPresetAll);

      const btnPresetRb = new MockElement('button');
      btnPresetRb.id = 'si-btn-preset-rb';
      chCard.appendChild(btnPresetRb);

      const btnPresetChord = new MockElement('button');
      btnPresetChord.id = 'si-btn-preset-chord';
      chCard.appendChild(btnPresetChord);

      const channelsGrid = new MockElement('div');
      channelsGrid.id = 'si-channels-grid';
      chCard.appendChild(channelsGrid);

      const chkMatchMeasures = new MockElement('input');
      chkMatchMeasures.id = 'si-chk-match-measures';
      chkMatchMeasures.checked = true;
      modal.appendChild(chkMatchMeasures);

      const chkOverwrite = new MockElement('input');
      chkOverwrite.id = 'si-chk-overwrite';
      chkOverwrite.checked = true;
      modal.appendChild(chkOverwrite);

      const chkCopyVoices = new MockElement('input');
      chkCopyVoices.id = 'si-chk-copy-voices';
      chkCopyVoices.checked = true;
      modal.appendChild(chkCopyVoices);

      const chkCopyCasm = new MockElement('input');
      chkCopyCasm.id = 'si-chk-copy-casm';
      chkCopyCasm.checked = true;
      modal.appendChild(chkCopyCasm);

      const summaryText = new MockElement('div');
      summaryText.id = 'si-summary-text';
      modal.appendChild(summaryText);

      const btnCancel = new MockElement('button');
      btnCancel.id = 'si-btn-cancel';
      modal.appendChild(btnCancel);

      const btnConfirm = new MockElement('button');
      btnConfirm.id = 'si-btn-confirm';
      btnConfirm.disabled = true;
      modal.appendChild(btnConfirm);
    } else if (html.includes('si-channel-label')) {
      // 聲部卡片子項目
      const chMatch = html.match(/data-channel="(\d+)"/);
      const ch = chMatch ? chMatch[1] : '8';
      const isChecked = html.includes('checked');

      const label = new MockElement('label');
      label.className = 'si-channel-label';
      this.appendChild(label);

      const input = new MockElement('input');
      input.className = 'si-ch-checkbox';
      input.dataset.channel = ch;
      input.checked = isChecked;
      label.appendChild(input);

      const count = new MockElement('span');
      count.className = 'si-ch-count';
      label.appendChild(count);
    }
  }
}

describe('【階段三】跨檔案伴奏段落移植視覺化彈窗 (SectionImportModal) 測試', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  let origDoc: any;
  let origWin: any;
  let mockBody: MockElement;
  let mockWindowListeners: Record<string, Function[]> = {};

  function createBlankTargetStyle(): YamahaFileParsed {
    return YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TargetBlankStyle',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 1920,
      sections: [
        { name: 'Main A', bars: 4 },
        { name: 'Fill In AA', bars: 1 },
        { name: 'Main B', bars: 4 },
        { name: 'Ending A', bars: 2 },
      ],
    });
  }

  function createMockFile(name: string, buffer: Buffer): File {
    return {
      name,
      size: buffer.length,
      type: 'audio/x-yamaha-style',
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    } as any;
  }

  beforeEach(() => {
    origDoc = (globalThis as any).document;
    origWin = (globalThis as any).window;
    mockWindowListeners = {};

    mockBody = new MockElement('body');
    (globalThis as any).document = {
      body: mockBody,
      createElement: (tag: string) => new MockElement(tag),
      getElementById: (id: string) => mockBody.querySelector('#' + id),
      querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
      addEventListener: () => {},
    };
    (globalThis as any).window = {
      addEventListener: (evt: string, fn: Function) => {
        if (!mockWindowListeners[evt]) mockWindowListeners[evt] = [];
        mockWindowListeners[evt].push(fn);
      },
      removeEventListener: () => {},
    };
    (globalThis as any).alert = vi.fn();
  });

  afterEach(() => {
    (globalThis as any).document = origDoc;
    (globalThis as any).window = origWin;
    vi.restoreAllMocks();
  });

  it('1. DOM 節點結構完整初始化與生命週期 (開/關/Esc)', () => {
    const modal = new SectionImportModal();
    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;
    expect(backdrop).not.toBeNull();
    expect(modal.isOpen()).toBe(false);

    const targetParsed = createBlankTargetStyle();
    const onConfirmMock = vi.fn();

    // 開啟彈窗
    modal.open(targetParsed, onConfirmMock);
    expect(modal.isOpen()).toBe(true);
    expect(backdrop.style.display).toBe('flex');

    // 關閉按鈕測試
    const btnCancel = backdrop.querySelector('#si-btn-cancel') as MockElement;
    btnCancel.click();
    expect(modal.isOpen()).toBe(false);

    // 重新開啟並測試 Esc 鍵
    modal.open(targetParsed, onConfirmMock);
    expect(modal.isOpen()).toBe(true);
    const escListeners = mockWindowListeners['keydown'] || [];
    for (const fn of escListeners) {
      fn({ key: 'Escape' });
    }
    expect(modal.isOpen()).toBe(false);
  });

  it('2. 載入外部 STY 伴奏檔案解析與介面解鎖', async () => {
    const modal = new SectionImportModal();
    const targetParsed = createBlankTargetStyle();
    modal.open(targetParsed, vi.fn());

    const buffer = fs.readFileSync(sampleStyPath);
    const file = createMockFile('4006_SX900.T547.sty', buffer);

    await modal.loadExternalFile(file);

    expect(modal.getExternalParsed()).not.toBeNull();
    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;

    // 檢查檔案摘要 Badge
    const summaryBadge = backdrop.querySelector('#si-file-summary') as MockElement;
    expect(summaryBadge.style.display).toBe('block');
    expect(summaryBadge.innerHTML).toContain('4006_SX900.T547.sty');

    // 檢查路由卡片與聲部卡片已解鎖
    const routeCard = backdrop.querySelector('#si-route-card') as MockElement;
    const channelsCard = backdrop.querySelector('#si-channels-card') as MockElement;
    expect(routeCard.style.opacity).toBe('1');
    expect(routeCard.style.pointerEvents).toBe('auto');
    expect(channelsCard.style.opacity).toBe('1');
    expect(channelsCard.style.pointerEvents).toBe('auto');
  });

  it('3. 來源與目標段落下拉選單動態填充 (含現有段落與擴充全新段落)', async () => {
    const modal = new SectionImportModal();
    const targetParsed = createBlankTargetStyle();
    modal.open(targetParsed, vi.fn());

    const buffer = fs.readFileSync(sampleStyPath);
    const file = createMockFile('4006_SX900.T547.sty', buffer);
    await modal.loadExternalFile(file);

    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;
    const selectSource = backdrop.querySelector('#si-select-source') as MockElement;
    const selectTarget = backdrop.querySelector('#si-select-target') as MockElement;

    // 來源段落應包含外部檔案的段落
    expect(selectSource.options.length).toBeGreaterThan(0);
    const hasMainA = selectSource.options.some((opt) => opt.value === 'Main A');
    expect(hasMainA).toBe(true);

    // 目標段落應包含「現有段落」與「擴充全新段落」
    const targetValues = selectTarget.options.map((opt) => opt.value);
    expect(targetValues).toContain('Main A');
    expect(targetValues).toContain('Main B');
    // 應推薦未使用的段落，如 Main C, Main D, Intro B 等
    const hasUnused = targetValues.some((v) => ['Main C', 'Main D', 'Intro B'].includes(v));
    expect(hasUnused).toBe(true);
  });

  it('4. 8 伴奏聲部卡片渲染與快捷全選/R&B/和弦切換', async () => {
    const modal = new SectionImportModal();
    const targetParsed = createBlankTargetStyle();
    modal.open(targetParsed, vi.fn());

    const buffer = fs.readFileSync(sampleStyPath);
    const file = createMockFile('4006_SX900.T547.sty', buffer);
    await modal.loadExternalFile(file);

    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;
    const grid = backdrop.querySelector('#si-channels-grid') as MockElement;

    // 應產生 8 個聲部卡片 (CH 8~15, 即 CH 9~16)
    const cards = grid.children;
    expect(cards.length).toBe(8);

    // 測試快捷篩選按鈕
    const btnAll = backdrop.querySelector('#si-btn-preset-all') as MockElement;
    const btnRb = backdrop.querySelector('#si-btn-preset-rb') as MockElement;
    const btnChord = backdrop.querySelector('#si-btn-preset-chord') as MockElement;

    // 點擊「全選」
    btnAll.click();
    let selectedChs = modal.getSelectedChannels();
    expect(selectedChs.length).toBe(8);

    // 點擊「僅節奏與貝斯 (R&B)」(CH 8, 9, 10 即 CH 9, 10, 11)
    btnRb.click();
    selectedChs = modal.getSelectedChannels();
    expect(selectedChs.sort((a, b) => a - b)).toEqual([8, 9, 10]);

    // 點擊「僅和弦與旋律」(CH 11, 12, 13, 14, 15)
    btnChord.click();
    selectedChs = modal.getSelectedChannels();
    expect(selectedChs.sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15]);
  });

  it('5. 摘要預覽文字更新與確認按鈕回呼完整性', async () => {
    const modal = new SectionImportModal();
    const targetParsed = createBlankTargetStyle();
    const onConfirmMock = vi.fn();
    modal.open(targetParsed, onConfirmMock);

    const buffer = fs.readFileSync(sampleStyPath);
    const file = createMockFile('4006_SX900.T547.sty', buffer);
    await modal.loadExternalFile(file);

    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;
    const btnConfirm = backdrop.querySelector('#si-btn-confirm') as MockElement;
    const summaryText = backdrop.querySelector('#si-summary-text') as MockElement;

    expect(btnConfirm.disabled).toBe(false);
    expect(summaryText.innerHTML).toContain('即將從');

    // 觸發確認按鈕
    btnConfirm.click();

    expect(modal.isOpen()).toBe(false);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);

    const [receivedSource, receivedSrcSec, receivedOptions] = onConfirmMock.mock.calls[0];
    expect(receivedSource).not.toBeNull();
    expect(receivedSrcSec).toBeDefined();
    expect(receivedOptions.channels.length).toBeGreaterThan(0);
    expect(receivedOptions.matchMeasures).toBe(true);
    expect(receivedOptions.copyVoices).toBe(true);
    expect(receivedOptions.copyCasm).toBe(true);
  });

  it('6. 閉環整合測試：確認回呼執行 YamahaStyleModifier 成功移植段落', async () => {
    const modal = new SectionImportModal();
    const targetParsed = createBlankTargetStyle();

    let executedResult: any = null;
    modal.open(targetParsed, (sourceParsed, srcSec, options) => {
      executedResult = YamahaStyleModifier.importSectionFromExternalStyle(
        targetParsed,
        sourceParsed,
        srcSec,
        options
      );
    });

    const buffer = fs.readFileSync(sampleStyPath);
    const file = createMockFile('4006_SX900.T547.sty', buffer);
    await modal.loadExternalFile(file);

    const backdrop = mockBody.querySelector('#section-import-backdrop') as MockElement;
    const btnConfirm = backdrop.querySelector('#si-btn-confirm') as MockElement;
    btnConfirm.click();

    expect(executedResult).not.toBeNull();
    expect(executedResult.success).toBe(true);
    expect(executedResult.copiedNotesCount).toBeGreaterThan(0);

    // 驗證目標風格中段落音符確實被注入
    const range = StyleRemixer.getSectionTickRange(targetParsed, executedResult.targetSection);
    expect(range).not.toBeNull();
    let totalNotes = 0;
    for (let ch = 0; ch <= 15; ch++) {
      totalNotes += StyleRemixer.countNotesInChannel(targetParsed, range!.startTick, range!.endTick, ch);
    }
    expect(totalNotes).toBe(executedResult.copiedNotesCount);
  });
});
