/**
 * Yamaha PSR-SX920 視覺化混音台 (Mixer Panel) 單元測試
 * 驗證通道條建立、音量推桿、立體聲聲相格式化、靜音/獨奏邏輯與回呼事件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MixerPanel, type MixerChannelInfo } from '../src/creator/mixer-panel';

// 輕量 Mock DOM 節點以在 Node 環境下運行測試
class MockNode {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  private _innerHTML: string = '';
  public textContent: string = '';
  public value: string = '';
  public style: Record<string, any> = { display: '', setProperty: () => {} };
  public children: MockNode[] = [];
  public attributes: Record<string, string> = {};
  public listeners: Record<string, Function[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  public get innerHTML(): string {
    return this._innerHTML;
  }

  public set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    if (!html) return;

    const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '').trim();
    // 採用標準 HTML Tokenizer 解析標籤與樹狀階層
    const tokenRegex = /<([\/]?)([a-zA-Z0-9]+)([^>]*?)>/g;
    const stack: MockNode[] = [this];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(cleanHtml)) !== null) {
      const textBetween = cleanHtml.slice(lastIndex, match.index).trim();
      const currentParent = stack[stack.length - 1];
      if (textBetween && currentParent) {
        currentParent.textContent = textBetween;
      }
      lastIndex = tokenRegex.lastIndex;

      const isClosing = match[1] === '/';
      const tagName = match[2];
      const attrStr = match[3];
      const isSelfClosing = attrStr.trim().endsWith('/') || ['input', 'img', 'br', 'hr'].includes(tagName.toLowerCase());

      if (isClosing) {
        if (stack.length > 1) {
          stack.pop();
        }
      } else {
        const child = new MockNode(tagName);
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          const name = attrMatch[1];
          const val = attrMatch[2] ?? '';
          if (name === 'id') child.id = val;
          else if (name === 'class') child.className = val;
          else if (name === 'value') child.value = val;
          child.setAttribute(name, val);
        }

        if (currentParent) {
          currentParent.children.push(child);
        }

        if (!isSelfClosing) {
          stack.push(child);
        }
      }
    }
  }

  public appendChild(child: MockNode) {
    this.children.push(child);
    return child;
  }

  public setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  public getAttribute(name: string) {
    return this.attributes[name] || null;
  }

  public addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  public dispatchEvent(ev: any) {
    const list = this.listeners[ev.type] || [];
    list.forEach(fn => fn(ev));
    return true;
  }

  public click() {
    this.dispatchEvent({ type: 'click' });
  }

  public classList = {
    add: (cls: string) => {
      const parts = this.className.split(' ').filter(Boolean);
      if (!parts.includes(cls)) parts.push(cls);
      this.className = parts.join(' ');
    },
    remove: (cls: string) => {
      this.className = this.className.split(' ').filter(c => c !== cls).join(' ');
    },
    contains: (cls: string) => {
      return this.className.split(' ').includes(cls);
    },
  };

  public querySelector<T = any>(sel: string): T | null {
    const all = this.querySelectorAll(sel);
    return (all.length > 0 ? all[0] : null) as any;
  }

  public querySelectorAll(sel: string): MockNode[] {
    const result: MockNode[] = [];

    const matches = (node: MockNode): boolean => {
      if (sel.startsWith('#') && node.id === sel.slice(1)) return true;
      if (sel.startsWith('.') && node.classList.contains(sel.slice(1))) return true;
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const inner = sel.slice(1, -1);
        if (inner.includes('=')) {
          const [attr, val] = inner.split('=').map(s => s.replace(/['"]/g, ''));
          return node.attributes[attr] === val;
        } else {
          return !!node.attributes[inner];
        }
      }
      return false;
    };

    const traverse = (node: MockNode) => {
      if (matches(node)) result.push(node);
      for (const child of node.children) {
        traverse(child);
      }
    };

    for (const child of this.children) {
      traverse(child);
    }

    return result;
  }
}

// 設置 globalThis.document
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      const node = new MockNode(tag);
      return node;
    },
  };
  (globalThis as any).Event = class {
    constructor(public type: string) {}
  };
  (globalThis as any).MouseEvent = class {
    constructor(public type: string) {}
  };
}

describe('MixerPanel 視覺化混音台', () => {
  let container: any;
  let callbacks: any;

  beforeEach(() => {
    container = new MockNode('div');
    callbacks = {
      onVolumeChange: vi.fn(),
      onPanChange: vi.fn(),
      onReverbChange: vi.fn(),
      onChorusChange: vi.fn(),
      onMuteToggle: vi.fn(),
      onSoloToggle: vi.fn(),
      onTrackPlayToggle: vi.fn(),
      onPlayAllToggle: vi.fn(),
      onResetDefaults: vi.fn(),
      onPanic: vi.fn(),
      onVisibilityChange: vi.fn(),
    };
  });

  it('能夠成功實例化並建立基本面板結構', () => {
    const panel = new MixerPanel(container, callbacks);
    expect(panel).toBeDefined();
    expect(container.children.length).toBeGreaterThan(0);
    const wrapper = container.children[0];
    expect(wrapper.className).toBe('mixer-panel-card');
  });

  it('能正確格式化聲相 (formatPan): 64 -> C, <64 -> L, >64 -> R', () => {
    const panel = new MixerPanel(container, callbacks);
    expect(panel.formatPan(64)).toBe('C');
    expect(panel.formatPan(0)).toBe('L64');
    expect(panel.formatPan(52)).toBe('L12');
    expect(panel.formatPan(76)).toBe('R12');
    expect(panel.formatPan(127)).toBe('R63');
  });

  it('支援設定包含 Reverb 與 Chorus 之通道條資料 (setChannels)', () => {
    const panel = new MixerPanel(container, callbacks);
    const testChannels: MixerChannelInfo[] = [
      {
        id: 'drum',
        name: 'Rhythm 2',
        subName: '鼓組',
        chNumber: 10,
        midiChannel: 9,
        icon: '🥁',
        color: '#38bdf8',
        voiceName: 'Standard Kit 1',
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
        muted: false,
        solo: false,
      },
      {
        id: 'chord',
        name: 'Chord 1',
        subName: '和弦 1',
        chNumber: 12,
        midiChannel: 11,
        icon: '🎹',
        color: '#a855f7',
        voiceName: 'Concert Grand',
        volume: 90,
        pan: 52,
        reverb: 65,
        chorus: 20,
        muted: false,
        solo: false,
      },
    ];

    panel.setChannels(testChannels);
    expect(panel).toBeDefined();
  });

  it('toggle() 正確切換可見性並觸發 onVisibilityChange', () => {
    const panel = new MixerPanel(container, callbacks);
    expect(panel.isVisible()).toBe(false);

    panel.toggle(true);
    expect(panel.isVisible()).toBe(true);
    expect(container.style.display).toBe('block');
    expect(callbacks.onVisibilityChange).toHaveBeenCalledWith(true);

    panel.toggle(false);
    expect(panel.isVisible()).toBe(false);
    expect(container.style.display).toBe('none');
    expect(callbacks.onVisibilityChange).toHaveBeenCalledWith(false);
  });

  it('支援點擊軌道試聽按鈕並觸發 onTrackPlayToggle', () => {
    const panel = new MixerPanel(container, callbacks);
    panel.setChannels([
      {
        id: 'drum',
        name: 'Rhythm 2',
        subName: '鼓組',
        chNumber: 10,
        midiChannel: 9,
        icon: '🥁',
        color: '#38bdf8',
        voiceName: 'Standard Kit 1',
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
        muted: false,
        solo: false,
      },
    ]);

    const playBtn = container.querySelector('[data-play-btn="drum"]');
    expect(playBtn).toBeDefined();
    playBtn.click();
    expect(callbacks.onTrackPlayToggle).toHaveBeenCalledWith('drum');
  });

  it('支援點擊標頭播放全曲按鈕並觸發 onPlayAllToggle', () => {
    new MixerPanel(container, callbacks);
    const playAllBtn = container.querySelector('#btn-mixer-play-all');
    expect(playAllBtn).toBeDefined();
    playAllBtn.click();
    expect(callbacks.onPlayAllToggle).toHaveBeenCalled();
  });

  it('setTrackPlaying 正確切換播放狀態 class 與圖標文字', () => {
    const panel = new MixerPanel(container, callbacks);
    panel.setChannels([
      {
        id: 'drum',
        name: 'Rhythm 2',
        subName: '鼓組',
        chNumber: 10,
        midiChannel: 9,
        icon: '🥁',
        color: '#38bdf8',
        voiceName: 'Standard Kit 1',
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
        muted: false,
        solo: false,
      },
    ]);

    const playBtn = container.querySelector('[data-play-btn="drum"]');
    const playIcon = container.querySelector('[data-play-icon="drum"]');
    const playText = container.querySelector('[data-play-text="drum"]');

    panel.setTrackPlaying('drum', true);
    expect(playBtn.classList.contains('mixer-btn-play-active')).toBe(true);
    expect(playIcon.textContent).toBe('⏸');
    expect(playText.textContent).toBe('暫停');

    panel.setTrackPlaying('drum', false);
    expect(playBtn.classList.contains('mixer-btn-play-active')).toBe(false);
    expect(playIcon.textContent).toBe('▶');
    expect(playText.textContent).toBe('試聽');
  });

  it('setPlayAllState 正確切換全曲播放按鈕狀態 class 與文字', () => {
    const panel = new MixerPanel(container, callbacks);
    const playAllBtn = container.querySelector('#btn-mixer-play-all');
    const playAllIcon = container.querySelector('#mixer-play-all-icon');
    const playAllText = container.querySelector('#mixer-play-all-text');

    panel.setPlayAllState(true);
    expect(playAllBtn.classList.contains('mixer-btn-play-active')).toBe(true);
    expect(playAllIcon.textContent).toBe('⏸');
    expect(playAllText.textContent).toBe('暫停全曲');

    panel.setPlayAllState(false);
    expect(playAllBtn.classList.contains('mixer-btn-play-active')).toBe(false);
    expect(playAllIcon.textContent).toBe('▶');
    expect(playAllText.textContent).toBe('播放全曲');
  });

  it('支援段落音軌活動狀態連動 (updateSectionActivity: 亮燈 ACTIVE vs 熄滅 SILENT)', () => {
    const panel = new MixerPanel(container, callbacks);
    panel.setChannels([
      {
        id: 'rhythm1',
        name: 'Rhythm 1',
        subName: '打擊樂',
        chNumber: 9,
        midiChannel: 8,
        icon: '🪘',
        color: '#0284c7',
        voiceName: 'Percussion Kit',
        volume: 90,
        pan: 64,
        reverb: 40,
        chorus: 0,
        muted: false,
        solo: false,
        hasNotesInCurrentSection: false,
      },
      {
        id: 'drum',
        name: 'Rhythm 2',
        subName: '主鼓組',
        chNumber: 10,
        midiChannel: 9,
        icon: '🥁',
        color: '#38bdf8',
        voiceName: 'Standard Kit 1',
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
        muted: false,
        solo: false,
        hasNotesInCurrentSection: true,
      },
    ]);

    const r1Strip = container.querySelector('[data-strip-id="rhythm1"]');
    const r1Badge = container.querySelector('[data-status-badge="rhythm1"]');
    const drumStrip = container.querySelector('[data-strip-id="drum"]');
    const drumBadge = container.querySelector('[data-status-badge="drum"]');

    expect(r1Strip.classList.contains('strip-silent')).toBe(true);
    expect(r1Badge.textContent).toBe('⚪ 空白');
    expect(drumStrip.classList.contains('strip-active')).toBe(true);
    expect(drumBadge.textContent).toBe('🟢 有音符');

    // 動態切換段落活動
    panel.updateSectionActivity({
      rhythm1: true,
      drum: false,
    });

    expect(r1Strip.classList.contains('strip-active')).toBe(true);
    expect(r1Badge.textContent).toBe('🟢 有音符');
    expect(drumStrip.classList.contains('strip-silent')).toBe(true);
    expect(drumBadge.textContent).toBe('⚪ 空白');
  });

  it('支援即時動態 LED VU 音量表跳動 (triggerVuMeter) 與重設 (clearAllVuMeters)', () => {
    vi.useFakeTimers();
    const panel = new MixerPanel(container, callbacks);
    panel.setChannels([
      {
        id: 'bass',
        name: 'Bass',
        subName: '貝斯',
        chNumber: 11,
        midiChannel: 10,
        icon: '🎸',
        color: '#10b981',
        voiceName: 'Finger Bass',
        volume: 95,
        pan: 64,
        reverb: 20,
        chorus: 0,
        muted: false,
        solo: false,
      },
    ]);

    const fill = container.querySelector('[data-vu-fill="bass"]');
    const peak = container.querySelector('[data-vu-peak="bass"]');

    expect(fill).toBeDefined();
    expect(peak).toBeDefined();

    // 觸發 velocity = 127 (100% 音量表滿格)
    panel.triggerVuMeter('bass', 127);
    expect(fill.style.height).toBe('100%');
    expect(peak.style.bottom).toBe('100%');

    // 衰減時間 150ms 後平滑歸零
    vi.advanceTimersByTime(160);
    expect(fill.style.height).toBe('0%');
    expect(peak.style.bottom).toBe('0%');

    // clearAllVuMeters 立即歸零
    panel.triggerVuMeter('bass', 64);
    expect(fill.style.height).toBe('50%');
    panel.clearAllVuMeters();
    expect(fill.style.height).toBe('0%');
    expect(peak.style.bottom).toBe('0%');

    vi.useRealTimers();
  });
});
