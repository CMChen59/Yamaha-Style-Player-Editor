import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';

// ============================================================================
// Lightweight Mock DOM for SectionCloneModal Unit Testing in Node environment
// ============================================================================
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '';
  public title: string = '';
  public disabled: boolean = false;
  public checked: boolean = true;
  public selected: boolean = false;
  public selectedIndex: number = 0;
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

  public closest(selector: string): MockElement | null {
    const cls = selector.replace('.', '');
    let curr: MockElement | null = this;
    while (curr) {
      if (curr.classList.contains(cls)) return curr;
      curr = curr.parentElement;
    }
    return null;
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
      const cls = selector.slice(1).split(':')[0]; // handle pseudo-selectors
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
        if (selector.includes(':checked')) {
          const cls = selector.split(':')[0].slice(1);
          if (node.classList.contains(cls) && node.checked) results.push(node);
        } else {
          const cls = selector.slice(1);
          if (node.classList.contains(cls)) results.push(node);
        }
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

    if (html.includes('section-clone-modal')) {
      const modal = new MockElement('div');
      modal.className = 'section-clone-modal';
      this.appendChild(modal);

      const title = new MockElement('h2');
      title.id = 'sc-modal-title';
      modal.appendChild(title);

      const btnCloseHeader = new MockElement('button');
      btnCloseHeader.id = 'sc-btn-close-header';
      modal.appendChild(btnCloseHeader);

      const selectSource = new MockElement('select');
      selectSource.id = 'sc-select-source';
      modal.appendChild(selectSource);

      const selectTarget = new MockElement('select');
      selectTarget.id = 'sc-select-target';
      modal.appendChild(selectTarget);

      const customTargetWrap = new MockElement('div');
      customTargetWrap.id = 'sc-custom-target-wrap';
      modal.appendChild(customTargetWrap);

      const inputCustomTarget = new MockElement('input');
      inputCustomTarget.id = 'sc-input-custom-target';
      customTargetWrap.appendChild(inputCustomTarget);

      const btnPresetAll = new MockElement('button');
      btnPresetAll.id = 'sc-btn-preset-all';
      modal.appendChild(btnPresetAll);

      const btnPresetRb = new MockElement('button');
      btnPresetRb.id = 'sc-btn-preset-rb';
      modal.appendChild(btnPresetRb);

      const btnPresetChord = new MockElement('button');
      btnPresetChord.id = 'sc-btn-preset-chord';
      modal.appendChild(btnPresetChord);

      const channelsGrid = new MockElement('div');
      channelsGrid.id = 'sc-channels-grid';
      modal.appendChild(channelsGrid);

      const chkMatchMeasures = new MockElement('input');
      chkMatchMeasures.id = 'sc-chk-match-measures';
      chkMatchMeasures.checked = true;
      modal.appendChild(chkMatchMeasures);

      const chkOverwrite = new MockElement('input');
      chkOverwrite.id = 'sc-chk-overwrite';
      chkOverwrite.checked = true;
      modal.appendChild(chkOverwrite);

      const chkCopyMixing = new MockElement('input');
      chkCopyMixing.id = 'sc-chk-copy-mixing';
      chkCopyMixing.checked = true;
      modal.appendChild(chkCopyMixing);

      const chkCopyCasm = new MockElement('input');
      chkCopyCasm.id = 'sc-chk-copy-casm';
      chkCopyCasm.checked = true;
      modal.appendChild(chkCopyCasm);

      const summaryText = new MockElement('div');
      summaryText.id = 'sc-summary-text';
      modal.appendChild(summaryText);

      const btnCancel = new MockElement('button');
      btnCancel.id = 'sc-btn-cancel';
      modal.appendChild(btnCancel);

      const btnConfirm = new MockElement('button');
      btnConfirm.id = 'sc-btn-confirm';
      modal.appendChild(btnConfirm);
    } else if (html.includes('sc-ch-checkbox')) {
      // Channel card template inside renderChannelCheckboxes
      const matchCh = html.match(/data-channel="(\d+)"/);
      const ch = matchCh ? matchCh[1] : '8';
      const chk = new MockElement('input');
      chk.className = 'sc-ch-checkbox';
      chk.dataset.channel = ch;
      chk.checked = true;
      this.appendChild(chk);

      const countEl = new MockElement('span');
      countEl.id = `sc-ch-count-${ch}`;
      countEl.className = 'sc-ch-count';
      this.appendChild(countEl);
    }
  }
}

describe('Tier 2-1 Step 3: 跨段落克隆與衍生彈窗 (Section Clone Modal) 測試', () => {
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

  it('1. SectionCloneModal 能成功建置 DOM 並掛載到 document.body', async () => {
    const { SectionCloneModal } = await import('../src/player/section-clone-modal');
    const modal = new SectionCloneModal();
    expect(modal).toBeDefined();

    const backdrop = mockBody.children.find(c => c.id === 'section-clone-backdrop');
    expect(backdrop).toBeDefined();
    expect(backdrop?.style.display).toBe('none');
    expect(modal.isOpen()).toBe(false);
  });

  it('2. open() 能載入 STY 段落清單並初始化來源與目標選單', async () => {
    const { SectionCloneModal } = await import('../src/player/section-clone-modal');
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const modal = new SectionCloneModal();
    modal.open(parsed, 'Main A', () => {});

    expect(modal.isOpen()).toBe(true);

    const selectSrc = mockBody.querySelector('#sc-select-source') as MockElement;
    const selectTarget = mockBody.querySelector('#sc-select-target') as MockElement;

    expect(selectSrc).toBeDefined();
    expect(selectSrc.options.length).toBeGreaterThan(0);
    // 應包含 Main A, Main B, Main C, Main D 等
    const srcValues = selectSrc.options.map(o => o.value);
    expect(srcValues).toContain('Main A');
    expect(srcValues).toContain('Main B');

    // 目標段落應包含「➕ 建立全新段落...」(__NEW__)
    const targetValues = selectTarget.options.map(o => o.value);
    expect(targetValues).toContain('__NEW__');
    expect(targetValues).toContain('Main B');
  });

  it('3. 伴奏聲部預設篩選按鈕 (All / R&B / Chord) 切換測試', async () => {
    const { SectionCloneModal } = await import('../src/player/section-clone-modal');
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const modal = new SectionCloneModal();
    modal.open(parsed, 'Main A', () => {});

    const grid = mockBody.querySelector('#sc-channels-grid') as MockElement;
    expect(grid.children.length).toBe(8); // 8 大聲部卡片

    // 測試僅節奏與貝斯 (R&B: CH 8, 9, 10)
    (modal as any).setChannelPreset('rb');
    let selectedChs = (modal as any).getSelectedChannels();
    expect(selectedChs).toEqual([8, 9, 10]);

    // 測試僅和弦與旋律 (Chord: CH 11, 12, 13, 14, 15)
    (modal as any).setChannelPreset('chord');
    selectedChs = (modal as any).getSelectedChannels();
    expect(selectedChs).toEqual([11, 12, 13, 14, 15]);

    // 測試全選 (All: CH 8 ~ 15)
    (modal as any).setChannelPreset('all');
    selectedChs = (modal as any).getSelectedChannels();
    expect(selectedChs).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('4. 來源段落各聲部音符計數 (Note Counts) 正常更新', async () => {
    const { SectionCloneModal } = await import('../src/player/section-clone-modal');
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const modal = new SectionCloneModal();
    modal.open(parsed, 'Main A', () => {});

    const selectSrc = mockBody.querySelector('#sc-select-source') as MockElement;
    selectSrc.value = 'Main A';
    (modal as any).refreshChannelNoteCounts();

    // 檢查各聲部計數標籤是否有被填充
    const ch9CountEl = mockBody.querySelector('#sc-ch-count-9') as MockElement;
    expect(ch9CountEl).toBeDefined();
    expect(ch9CountEl.textContent).toContain('顆音符');
  });

  it('5. 點擊確認按鈕時正確回傳參數並觸發回呼函式', async () => {
    const { SectionCloneModal } = await import('../src/player/section-clone-modal');
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    const modal = new SectionCloneModal();
    let callbackResult: any = null;

    modal.open(parsed, 'Main A', (srcSec, targetSec, options) => {
      callbackResult = { srcSec, targetSec, options };
    });

    const selectSrc = mockBody.querySelector('#sc-select-source') as MockElement;
    const selectTarget = mockBody.querySelector('#sc-select-target') as MockElement;

    selectSrc.value = 'Main A';
    selectTarget.value = 'Main B';

    // 點擊確認
    (modal as any).handleConfirm();

    expect(callbackResult).not.toBeNull();
    expect(callbackResult.srcSec).toBe('Main A');
    expect(callbackResult.targetSec).toBe('Main B');
    expect(callbackResult.options.channels).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(callbackResult.options.matchMeasures).toBe(true);
    expect(callbackResult.options.overwrite).toBe(true);
    expect(modal.isOpen()).toBe(false);
  });

  it('6. 端對端整合：Modal 觸發 YamahaStyleModifier.cloneSection 複製段落', async () => {
    const buffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 建立新段落 Main E 並複製 Main A 的 R&B (鼓組與貝斯: CH 8, 9, 10)
    const result = YamahaStyleModifier.cloneSection(parsed, 'Main A', 'Main E', {
      channels: [8, 9, 10],
      matchMeasures: true,
      overwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.copiedNotesCount).toBeGreaterThan(0);
    expect(result.copiedChannels).toContain(9);

    // 驗證新段落 Main E 存在且具有正確的小節數
    const range = StyleRemixer.getSectionTickRange(parsed, 'Main E');
    expect(range).not.toBeNull();
    expect(range?.measureCount).toBe(8);

    // 驗證 Main E 中的鼓組音符數大於 0
    const drumCount = StyleRemixer.countNotesInChannel(parsed, range!.startTick, range!.endTick, 9);
    expect(drumCount).toBeGreaterThan(0);
  });
});
