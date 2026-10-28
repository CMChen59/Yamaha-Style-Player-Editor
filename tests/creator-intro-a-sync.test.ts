import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ChordRollLite } from '../src/creator/chord-roll-lite';
import { StyLoader } from '../src/creator/sty-loader';

describe('Intro A 音軌同步與 Phrase 1/2 高音域自適應修復驗證', () => {
  const originalDoc = (global as any).document;

  beforeEach(() => {
    (global as any).document = {
      createElement: () => ({
        className: '',
        innerHTML: '',
        style: {},
        dataset: {},
        appendChild: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {} },
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    };
  });

  afterEach(() => {
    (global as any).document = originalDoc;
  });

  it('1. ChordRollLite 應能自適應擴展音域至 C7 (96)，完整渲染 Intro A 高音 Phrase 音符', () => {
    const container = document.createElement('div') as any;
    const phraseRoll = new ChordRollLite(
      container,
      5,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { partId: 'Phrase1', title: '裝飾短句 1 (Phrase 1 - Ch 15)' }
    );

    // 初始預設應為 C3 (48) ~ C6 (84)
    expect(phraseRoll.getMinPitch()).toBe(48);
    expect(phraseRoll.getMaxPitch()).toBe(84);

    // 模擬載入 Intro A Phrase 1 的 17 個真實高音音符 (範圍 76 ~ 91，包含 E5 ~ G6)
    const introAPhraseNotes = [83, 84, 86, 91, 89, 81, 79, 88, 86, 79, 77, 84, 83, 76, 79, 86, 91];
    const pattern = new Map<number, Set<number>>();
    introAPhraseNotes.forEach((n, idx) => {
      pattern.set(idx * 2, new Set([n]));
    });

    phraseRoll.setPatternData(pattern);

    // 自適應擴展後：maxPitch 應自動擴展至 96 (C7)
    expect(phraseRoll.getMaxPitch()).toBe(96);
    expect(phraseRoll.getMinPitch()).toBe(48);
    expect(phraseRoll.hasNotes()).toBe(true);

    // 驗證高音 91 (G6) 與 76 (E5) 都能在 pattern 中取得
    expect(phraseRoll.getActiveNotesAtStep(0)).toContain(83);
    expect(phraseRoll.getActiveNotesAtStep(6)).toContain(91); // 最高音

    // 總共應包含 96 - 48 + 1 = 49 個半音列
    expect(phraseRoll.getPitchesCount()).toBe(49);
  });

  it('2. StyLoader 載入 1024_容易受傷的女人.sty 後，全域與 Intro A 之聲部音色應 100% 正確', () => {
    const filePath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    const buf = fs.readFileSync(filePath);
    const result = StyLoader.loadFromBytes(new Uint8Array(buf), '1024_容易受傷的女人.sty');

    // 和弦全域音色應校正為民謠吉他 (SteelGuitarTwin2, PC 25, Bank 104-13)
    expect(result.chordVoice.name).toContain('SteelGuitarTwin2');
    expect(result.chordVoice.pc).toBe(25);
    expect(result.chordVoice.msb).toBe(104);
    expect(result.chordVoice.lsb).toBe(13);

    // Pad 全域音色應校正為爵士雞尾酒鋼琴 (Cocktail Piano, PC 0, Bank 104-3)
    expect(result.dynamicVoices['Pad']).toBeDefined();
    expect(result.dynamicVoices['Pad'].name).toContain('Cocktail Piano');
    expect(result.dynamicVoices['Pad'].pc).toBe(0);

    // 檢查 Intro A 段落
    const introA = result.sections.get('Intro A');
    expect(introA).toBeDefined();
    expect(introA?.bars).toBe(5);

    // Intro A 聲部音符
    let chordNoteCount = 0;
    introA?.chordPattern.forEach(set => chordNoteCount += set.size);
    expect(chordNoteCount).toBe(16);

    let padNoteCount = 0;
    introA?.dynamicPatterns?.['Pad']?.forEach(set => padNoteCount += set.size);
    expect(padNoteCount).toBe(8);

    let phr1NoteCount = 0;
    introA?.dynamicPatterns?.['Phrase1']?.forEach(set => phr1NoteCount += set.size);
    expect(phr1NoteCount).toBe(17);

    let phr2NoteCount = 0;
    introA?.dynamicPatterns?.['Phrase2']?.forEach(set => phr2NoteCount += set.size);
    expect(phr2NoteCount).toBe(17);

    // Intro A 專屬音色定義 (sectionVoices)
    expect(introA?.sectionVoices?.[11]?.name).toContain('SteelGuitarTwin2'); // Chord 1 = 吉他
    expect(introA?.sectionVoices?.[13]?.name).toContain('Cocktail Piano');   // Pad = 鋼琴
    expect(introA?.sectionVoices?.[14]?.name).toContain('BellHeaven');       // Phrase 1 = 鈴音 Pad
    expect(introA?.sectionVoices?.[15]?.name).toContain('SeattleStrings');    // Phrase 2 = 西雅圖弦樂
  });
});
