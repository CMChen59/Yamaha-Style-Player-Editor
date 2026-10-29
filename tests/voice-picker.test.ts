import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  searchYamahaVoices,
  findYamahaVoice,
  YAMAHA_SX920_VOICES,
  VOICE_CATEGORIES,
  VOICE_SUITABILITY_FILTERS,
  type YamahaVoice,
} from '../src/core/data/yamaha-voices';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';

// ============================================================================
// Lightweight Mock DOM for Node testing of VoicePickerModal
// ============================================================================
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public textContent: string = '';
  public value: string = '';
  public title: string = '';
  public disabled: boolean = false;
  public style: Record<string, any> = {
    display: 'none',
    setProperty: (k: string, v: string) => { (this.style as any)[k] = v; },
  };
  public dataset: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Record<string, Function[]> = {};

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
      const cls = selector.slice(1);
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
        if (node.classList.contains(selector.slice(1))) results.push(node);
      } else if (selector.startsWith('#')) {
        if (node.id === selector.slice(1)) results.push(node);
      }
      for (const child of node.children) check(child);
    };
    check(this);
    return results;
  }

  public set innerHTML(html: string) {
    this.children = [];
    if (html.includes('voice-picker-modal')) {
      const modal = new MockElement('div');
      modal.className = 'voice-picker-modal';
      this.appendChild(modal);

      const title = new MockElement('h2');
      title.id = 'vp-title';
      modal.appendChild(title);

      const targetTrack = new MockElement('span');
      targetTrack.id = 'vp-target-track';
      modal.appendChild(targetTrack);

      const btnCloseHeader = new MockElement('button');
      btnCloseHeader.id = 'vp-btn-close-header';
      modal.appendChild(btnCloseHeader);

      const searchInput = new MockElement('input');
      searchInput.id = 'vp-search-input';
      modal.appendChild(searchInput);

      const btnClearSearch = new MockElement('button');
      btnClearSearch.id = 'vp-btn-clear-search';
      modal.appendChild(btnClearSearch);

      const filterPills = new MockElement('div');
      filterPills.id = 'vp-filter-pills';
      modal.appendChild(filterPills);

      const categoryList = new MockElement('div');
      categoryList.id = 'vp-category-list';
      modal.appendChild(categoryList);

      const resultsCount = new MockElement('span');
      resultsCount.id = 'vp-results-count';
      modal.appendChild(resultsCount);

      const voiceGrid = new MockElement('div');
      voiceGrid.id = 'vp-voice-grid';
      modal.appendChild(voiceGrid);

      const btnLoadMore = new MockElement('button');
      btnLoadMore.id = 'vp-btn-load-more';
      modal.appendChild(btnLoadMore);

      const footerInfo = new MockElement('div');
      footerInfo.id = 'vp-footer-selected-info';
      modal.appendChild(footerInfo);

      const btnAudition = new MockElement('button');
      btnAudition.id = 'vp-btn-audition-current';
      btnAudition.disabled = true;
      modal.appendChild(btnAudition);

      const btnCancel = new MockElement('button');
      btnCancel.id = 'vp-btn-cancel';
      modal.appendChild(btnCancel);

      const btnConfirm = new MockElement('button');
      btnConfirm.id = 'vp-btn-confirm';
      btnConfirm.disabled = true;
      modal.appendChild(btnConfirm);
    }
  }
}

describe('Tier 1-4: Yamaha 2,300+ 原廠音色搜尋與選擇器 (Voice Picker)', () => {
  describe('1. Yamaha SX920 原廠音色庫與檢索引擎驗證', () => {
    it('資料庫應涵蓋 2,300+ 款官方完整音色', () => {
      expect(YAMAHA_SX920_VOICES.length).toBeGreaterThanOrEqual(2300);
    });

    it('應包含 17 大分類導航標籤 (含全部 + 16 大官方樂器類別)', () => {
      expect(VOICE_CATEGORIES.length).toBe(17);
      const keys = VOICE_CATEGORIES.map(c => c.key);
      expect(keys).toContain('ALL');
      expect(keys).toContain('Piano');
      expect(keys).toContain('Guitar');
      expect(keys).toContain('Bass');
      expect(keys).toContain('Strings');
      expect(keys).toContain('Brass');
      expect(keys).toContain('Drums');
    });

    it('應支援 7 大音色類型快速篩選 (含全部、推薦、S.Art!、MegaVoice、Live/Sweet/Cool、鼓組、警示)', () => {
      expect(VOICE_SUITABILITY_FILTERS.length).toBe(7);
      const filterKeys = VOICE_SUITABILITY_FILTERS.map(f => f.key);
      expect(filterKeys).toContain('ALL');
      expect(filterKeys).toContain('RECOMMENDED');
      expect(filterKeys).toContain('SART');
      expect(filterKeys).toContain('MEGAVOICE');
      expect(filterKeys).toContain('LIVE_SWEET_COOL');
      expect(filterKeys).toContain('DRUMS');
      expect(filterKeys).toContain('WARNING');
    });

    it('依分類檢索：能正確獲取 Piano 類別音色', () => {
      const pianos = searchYamahaVoices('', 'Piano', 'ALL');
      expect(pianos.length).toBeGreaterThan(50);
      expect(pianos.every(p => p.category === 'Piano')).toBe(true);
    });

    it('依類型檢索：能獲取 MegaVoice 伴奏專屬音色', () => {
      const megas = searchYamahaVoices('', 'ALL', 'MEGAVOICE');
      expect(megas.length).toBeGreaterThan(50);
      expect(megas.every(m => m.type === 'MegaVoice')).toBe(true);
    });

    it('依關鍵字檢索：支援模糊搜尋中英文名稱與 MSB-LSB-PC 代碼', () => {
      // 搜尋 CFX 鋼琴
      const cfxResults = searchYamahaVoices('CFX');
      expect(cfxResults.length).toBeGreaterThan(0);
      expect(cfxResults.some(r => r.name.includes('CFX'))).toBe(true);

      // 搜尋中文名稱「吉他」
      const guitarResults = searchYamahaVoices('吉他');
      expect(guitarResults.length).toBeGreaterThan(0);

      // 搜尋三聯號 MSB-LSB-PC
      const codeResults = searchYamahaVoices('104-1-0');
      expect(codeResults.length).toBeGreaterThan(0);
      expect(codeResults[0].msb).toBe(104);
      expect(codeResults[0].lsb).toBe(1);
      expect(codeResults[0].pc).toBe(0);
    });
  });

  describe('2. 播放引擎音色切換與示範樂句試聽 (Audition Phrase Integration)', () => {
    it('setChannelVoice 能即時更新該軌道之 PartVoiceInfo', () => {
      const testVoice: YamahaVoice = {
        name: 'CFX Concert Grand',
        category: 'Piano',
        msb: 104,
        lsb: 1,
        pc: 0,
        type: 'Live!',
        suitability: 'recommended',
        chineseName: 'CFX 演奏級平台鋼琴',
      };

      styPlaybackEngine.setChannelVoice(12, testVoice); // Channel 12: Chord 1
      const voiceInfo = styPlaybackEngine.getPartVoices().get(12);

      expect(voiceInfo).toBeDefined();
      expect(voiceInfo?.channel).toBe(12);
      expect(voiceInfo?.voiceName).toContain('CFX Concert Grand');
      expect(voiceInfo?.msb).toBe(104);
      expect(voiceInfo?.lsb).toBe(1);
      expect(voiceInfo?.pc).toBe(0);
      expect(voiceInfo?.category).toBe('Piano');
    });

    it('previewVoicePhrase 針對鼓組、貝斯與和弦樂器發送專屬試聽示範音符', () => {
      vi.useFakeTimers();
      const playedNotes: { channel: number; note: number; velocity: number }[] = [];
      const spyPreviewNote = vi.spyOn(styPlaybackEngine, 'previewNote').mockImplementation((ch, note, vel) => {
        playedNotes.push({ channel: ch, note, velocity: vel });
      });

      // 1. 鼓組試聽 (Channel 9 / Drums) -> 大鼓 (36) + 閉鈸 (42) + 小鼓 (38)
      playedNotes.length = 0;
      const drumVoice = {
        name: 'Standard Kit 1',
        category: 'Drums' as const,
        msb: 127,
        lsb: 0,
        pc: 0,
      };
      styPlaybackEngine.previewVoicePhrase(9, drumVoice);
      vi.runAllTimers();
      expect(playedNotes.map(p => p.note)).toEqual([36, 42, 38]);

      // 2. 貝斯試聽 (Channel 10 / Bass) -> 低音根音 C2 (36) + 五音 G2 (43)
      playedNotes.length = 0;
      const bassVoice = {
        name: 'Real Bass',
        category: 'Bass' as const,
        msb: 104,
        lsb: 18,
        pc: 33,
      };
      styPlaybackEngine.previewVoicePhrase(10, bassVoice);
      vi.runAllTimers();
      expect(playedNotes.map(p => p.note)).toEqual([36, 43]);

      // 3. 和弦樂器試聽 (Channel 12 / Chord 1) -> 大三和弦 C4 (60) + E4 (64) + G4 (67)
      playedNotes.length = 0;
      const chordVoice = {
        name: 'Vintage EP',
        category: 'E.Piano' as const,
        msb: 104,
        lsb: 6,
        pc: 4,
      };
      styPlaybackEngine.previewVoicePhrase(12, chordVoice);
      vi.runAllTimers();
      expect(playedNotes.map(p => p.note)).toEqual([60, 64, 67]);

      spyPreviewNote.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('3. 二進位伴奏檔混音音色回寫 (Style Modifier Binary Re-voicing)', () => {
    it('YamahaStyleModifier.setPartMixing 能精準修改 Track 0 與 CASM 之音色配置', () => {
      const mockParsed: any = {
        division: 480,
        timeSignature: { numerator: 4, denominator: 4 },
        tracks: [
          {
            trackIndex: 0,
            events: [
              { delta: 0, type: 'controlChange', channel: 12, controller: 0, value: 0 },
              { delta: 0, type: 'controlChange', channel: 12, controller: 32, value: 0 },
              { delta: 0, type: 'programChange', channel: 12, program: 0 },
            ],
          },
        ],
        sections: [
          {
            name: 'Main A',
            tracks: [
              {
                trackIndex: 0,
                events: [],
              },
            ],
          },
        ],
        parts: [
          {
            partName: 'Chord 1',
            channel: 12,
            volume: 100,
            pan: 64,
            reverb: 40,
            chorus: 0,
            bankMsb: 0,
            bankLsb: 0,
            programChange: 0,
          },
        ],
        rawBytes: new Uint8Array(100),
      };

      // 套用新音色：Kino Strings (104-33-48)
      const success = YamahaStyleModifier.setPartMixing(mockParsed, 12, {
        bankMsb: 104,
        bankLsb: 33,
        programChange: 48,
      });

      expect(success).toBe(true);

      const part = mockParsed.parts.find((p: any) => p.channel === 12);
      expect(part).toBeDefined();
      expect(part?.bankMsb).toBe(104);
      expect(part?.bankLsb).toBe(33);
      expect(part?.programChange).toBe(48);

      // 檢查 Track 0 中的控制器與 Program Change 是否同步更新
      const t0Events = mockParsed.tracks[0].events;
      const msbEv = t0Events.find((e: any) => e.type === 'controlChange' && e.controller === 0 && e.channel === 12);
      const lsbEv = t0Events.find((e: any) => e.type === 'controlChange' && e.controller === 32 && e.channel === 12);
      const pcEv = t0Events.find((e: any) => e.type === 'programChange' && e.channel === 12);

      expect(msbEv?.value).toBe(104);
      expect(lsbEv?.value).toBe(33);
      expect(pcEv?.program).toBe(48);
    });
  });

  describe('4. VoicePickerModal 視窗生命週期與交互邏輯', () => {
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

    it('VoicePickerModal 能正常建置 DOM 並掛載到 document.body', async () => {
      const { VoicePickerModal } = await import('../src/player/voice-picker-modal');
      const picker = new VoicePickerModal();
      expect(picker).toBeDefined();

      const backdrop = mockBody.children.find(c => c.id === 'voice-picker-backdrop');
      expect(backdrop).toBeDefined();
      expect(backdrop?.style.display).toBe('none');
    });

    it('open() 能正確開啟視窗、切換指定聲部並執行音色更換回呼', async () => {
      const { VoicePickerModal } = await import('../src/player/voice-picker-modal');
      const picker = new VoicePickerModal();

      let selectedResult: { channel: number; voice: YamahaVoice } | null = null;
      const cfxVoice = findYamahaVoice(104, 1, 0)!;

      picker.open(12, 'Chord 1', null, (channel, voice) => {
        selectedResult = { channel, voice };
      });

      expect(picker.isOpen()).toBe(true);

      // 模擬確認套用音色
      (picker as any).selectedVoice = cfxVoice;
      picker.confirmSelection();

      expect(selectedResult).not.toBeNull();
      expect(selectedResult?.channel).toBe(12);
      expect(selectedResult?.voice.name).toContain('CFX');
      expect(picker.isOpen()).toBe(false);
    });

    it('setCategory 與 setSuitabilityFilter 能即時過濾音色卡牌', async () => {
      const { VoicePickerModal } = await import('../src/player/voice-picker-modal');
      const picker = new VoicePickerModal();

      picker.open(10, 'Bass', null, () => {});

      // 切換至 Bass 分類
      picker.setCategory('Bass');
      const bassCount = (picker as any).currentResults.length;
      expect(bassCount).toBeGreaterThan(0);
      expect((picker as any).currentResults.every((v: YamahaVoice) => v.category === 'Bass')).toBe(true);

      // 切換至 MegaVoice 篩選
      picker.setSuitabilityFilter('MEGAVOICE');
      const megaBassCount = (picker as any).currentResults.length;
      expect(megaBassCount).toBeGreaterThan(0);
      expect((picker as any).currentResults.every((v: YamahaVoice) => v.type === 'MegaVoice')).toBe(true);

      picker.close();
      expect(picker.isOpen()).toBe(false);
    });
  });
});
