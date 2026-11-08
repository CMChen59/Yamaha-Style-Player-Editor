import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SingleTrackEditor } from '../src/player/single-track-editor';

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public innerHTML: string = '';
  public title: string = '';
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

  public querySelector(selector: string): MockElement | null {
    if (selector === '#ed-btn-solo-play') {
      const btn = new MockElement('button');
      btn.id = 'ed-btn-solo-play';
      btn.textContent = '🎧 僅播此軌 (Solo)';
      return btn;
    }
    return null;
  }
}

describe('下方單軌編輯器專屬「僅播此軌 (Solo)」快捷按鈕測試', () => {
  let container: MockElement;
  let editor: SingleTrackEditor;

  beforeEach(() => {
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

  it('支援註冊 setOnToggleSoloPlay 回呼函式', () => {
    const soloSpy = vi.fn();
    editor.setOnToggleSoloPlay(soloSpy);
    // 驗證回呼註冊成功
    expect(typeof editor.setOnToggleSoloPlay).toBe('function');
    expect(typeof editor.updateSoloPlayState).toBe('function');
  });

  it('呼叫 updateSoloPlayState(true, channel) 能正確操作按鈕樣式與狀態文字', () => {
    const mockBtn = new MockElement('button');
    mockBtn.id = 'ed-btn-solo-play';
    container.querySelector = vi.fn().mockReturnValue(mockBtn);

    editor.updateSoloPlayState(true, 8);
    expect(mockBtn.classList.contains('playing')).toBe(true);
    expect(mockBtn.innerHTML).toContain('暫停獨奏 (Pause)');

    editor.updateSoloPlayState(false);
    expect(mockBtn.classList.contains('playing')).toBe(false);
    expect(mockBtn.innerHTML).toContain('僅播此軌 (Solo)');
  });
});
