/**
 * Yamaha PSR-SX920 前奏 (Intro) 與尾奏 (Ending) 創作引擎單元測試
 * 驗證智慧範本生成、拍點排列、以及經由 1920 PPQ 黃金範本匯出之二進位結構完整性。
 */

import { describe, it, expect } from 'vitest';
import { SectionPresetsEngine } from '../src/creator/section-presets-engine';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('SectionPresetsEngine 前奏與尾奏智慧生成引擎', () => {
  it('generateIntroCountIn 正確生成 4 拍 Hi-Hat 計拍與第 2 小節過門加花', () => {
    const pattern = SectionPresetsEngine.generateIntroCountIn(2, 16);
    expect(pattern.name).toBe('Intro A');
    expect(pattern.bars).toBe(2);

    const hihat = pattern.drumPattern.get(42)!;
    expect(hihat).toBeDefined();

    // 第 1 小節: 4 拍計拍 (拍 1, 拍 2, 拍 3, 拍 4 -> steps 0, 4, 8, 12)
    expect(hihat[0]).toBe(true);
    expect(hihat[4]).toBe(true);
    expect(hihat[8]).toBe(true);
    expect(hihat[12]).toBe(true);

    // 第 2 小節最後一拍 (steps 28, 29, 30, 31): 小鼓漸強滾奏
    const snare = pattern.drumPattern.get(38)!;
    expect(snare[28]).toBe(true);
    expect(snare[29]).toBe(true);
    expect(snare[30]).toBe(true);
    expect(snare[31]).toBe(true);

    // 第 2 小節貝斯與和弦進場
    expect(pattern.bassPattern.get(16)).toBe(43); // G2
    expect(pattern.chordPattern.get(16)).toBeDefined();
    expect(pattern.chordPattern.get(16)!.has(53)).toBe(true); // G7
  });

  it('generateIntroCountIn 支援 8 小節完整長版前奏 (128 steps) 且第 8 小節有終結過門', () => {
    const pattern = SectionPresetsEngine.generateIntroCountIn(8, 16);
    expect(pattern.name).toBe('Intro A');
    expect(pattern.bars).toBe(8);

    const hihat = pattern.drumPattern.get(42)!;
    expect(hihat.length).toBe(128);

    // 第 1 小節 (steps 0~15) 依然為 4 拍計拍
    expect(hihat[0]).toBe(true);
    expect(hihat[4]).toBe(true);
    expect(hihat[8]).toBe(true);
    expect(hihat[12]).toBe(true);

    // 第 8 小節 (steps 112~127) 最後一拍為小鼓滾奏
    const snare = pattern.drumPattern.get(38)!;
    expect(snare[124]).toBe(true);
    expect(snare[125]).toBe(true);
    expect(snare[126]).toBe(true);
    expect(snare[127]).toBe(true);

    // 第 8 小節有導音 B2 (note 47) 準備引導進入 Main A 主歌
    expect(pattern.bassPattern.get(112 + 14)).toBe(47);
  });

  it('generateIntroHarmonic 正確生成流行 2-5-1 和弦進行 (Dm7 -> G7)', () => {
    const pattern = SectionPresetsEngine.generateIntroHarmonic(2, 16);
    expect(pattern.name).toBe('Intro A');

    // 第 1 小節 Dm7: 貝斯 D2 (note 38)
    expect(pattern.bassPattern.get(0)).toBe(38);
    const chordBar0 = pattern.chordPattern.get(0)!;
    expect(chordBar0.has(50)).toBe(true); // D3
    expect(chordBar0.has(53)).toBe(true); // F3
    expect(chordBar0.has(57)).toBe(true); // A3

    // 第 2 小節 G7: 貝斯 G2 (note 43)
    expect(pattern.bassPattern.get(16)).toBe(43);
    const chordBar1 = pattern.chordPattern.get(16)!;
    expect(chordBar1.has(55)).toBe(true); // G3
    expect(chordBar1.has(59)).toBe(true); // B3

    // 驗證第 2 小節 (最後一小節) 第 4 拍有小鼓過門加花與 B2 導音
    const snare = pattern.drumPattern.get(38)!;
    expect(snare[16 + 12]).toBe(true);
    expect(snare[16 + 13]).toBe(true);
    expect(snare[16 + 14]).toBe(true);
    expect(snare[16 + 15]).toBe(true);
    expect(pattern.bassPattern.get(16 + 14)).toBe(47); // B2 導音
  });

  it('generateIntroHarmonic 支援 4 小節 (經典 1-6-2-5)，第 4 小節具備切分大鼓、小鼓過門與 B2 導音', () => {
    const pattern = SectionPresetsEngine.generateIntroHarmonic(4, 16);
    expect(pattern.bars).toBe(4);

    const snare = pattern.drumPattern.get(38)!;
    const kick = pattern.drumPattern.get(36)!;
    const lastBarOffset = 3 * 16; // 48

    // 第 4 小節 (最後一小節) 切分大鼓推進
    expect(kick[lastBarOffset + 0]).toBe(true);
    expect(kick[lastBarOffset + 6]).toBe(true);
    expect(kick[lastBarOffset + 8]).toBe(true);
    expect(kick[lastBarOffset + 10]).toBe(true);

    // 第 4 小節第 4 拍小鼓過門連擊 (steps 60, 61, 62, 63)
    expect(snare[lastBarOffset + 12]).toBe(true);
    expect(snare[lastBarOffset + 13]).toBe(true);
    expect(snare[lastBarOffset + 14]).toBe(true);
    expect(snare[lastBarOffset + 15]).toBe(true);

    // B2 (note 47) 導音強烈引導進入主歌 C
    expect(pattern.bassPattern.get(lastBarOffset + 14)).toBe(47);
  });

  it('generateEndingPunch 正確在第 2 小節第 1 拍置入大鈸重擊，其餘步驟留白留延音', () => {
    const pattern = SectionPresetsEngine.generateEndingPunch(2, 16);
    expect(pattern.name).toBe('Ending A');
    expect(pattern.bars).toBe(2);

    const crash = pattern.drumPattern.get(49)!;
    const kick = pattern.drumPattern.get(36)!;
    const snare = pattern.drumPattern.get(38)!;

    // 第 2 小節第 1 拍 (step 16): 大鈸 + 大鼓 + 小鼓同時發聲
    expect(crash[16]).toBe(true);
    expect(kick[16]).toBe(true);
    expect(snare[16]).toBe(true);
    expect(pattern.bassPattern.get(16)).toBe(36); // 根音 C2
    expect(pattern.chordPattern.get(16)).toBeDefined();

    // 第 2 小節後續步驟 (steps 17 ~ 31): 鼓組全體留白
    for (let s = 17; s < 32; s++) {
      expect(crash[s]).toBe(false);
      expect(kick[s]).toBe(false);
      expect(snare[s]).toBe(false);
    }
  });

  it('generateEndingClimax 正確生成連擊大鈸與拍 4 最終震撼定音', () => {
    const pattern = SectionPresetsEngine.generateEndingClimax(2, 16);
    const crash = pattern.drumPattern.get(49)!;
    expect(crash[16]).toBe(true); // 拍 1 Crash
    expect(crash[20]).toBe(true); // 拍 2 Crash
    expect(crash[24]).toBe(true); // 拍 3 Crash
    expect(crash[28]).toBe(true); // 拍 4 最終 Crash
  });

  it('generateEndingSoft 正確生成輕柔 Ride 鈸與分解和弦', () => {
    const pattern = SectionPresetsEngine.generateEndingSoft(2, 16);
    const ride = pattern.drumPattern.get(51)!;
    expect(ride[0]).toBe(true);
    expect(ride[4]).toBe(true);
    expect(ride[8]).toBe(true);
    expect(ride[12]).toBe(true);
    expect(pattern.chordPattern.get(0)).toBeDefined();
    expect(pattern.chordPattern.get(4)).toBeDefined();
  });

  it('generateIntroFromMain 能沿用 Main A 伴奏並在第 1 小節強制替換為計拍', () => {
    const dummyMain = {
      name: 'Main A',
      bars: 2,
      drumPattern: new Map<number, boolean[]>([
        [36, new Array(32).fill(true)], // 全填滿大鼓
      ]),
      bassPattern: new Map<number, number>([[0, 36], [16, 36]]),
      chordPattern: new Map<number, Set<number>>([[0, new Set([48])], [16, new Set([48])]]),
    };

    const intro = SectionPresetsEngine.generateIntroFromMain(dummyMain, 2, 16);
    expect(intro.name).toBe('Intro A');

    // 第 1 小節有 4 拍 Hi-Hat 計拍
    const hihat = intro.drumPattern.get(42)!;
    expect(hihat[0]).toBe(true);
    expect(hihat[4]).toBe(true);
    expect(hihat[8]).toBe(true);
    expect(hihat[12]).toBe(true);

    // 第 2 小節繼承 Main A 的大鼓
    const kick = intro.drumPattern.get(36)!;
    expect(kick[16]).toBe(true);
  });
});

describe('YamahaTemplateStyleSynthesizer 前奏與尾奏 STY 二進位匯出整合驗證', () => {
  it('能將使用者編輯的 Intro A 與 Ending A 完美合成進 1920 PPQ 原廠範本且 CASM 零修改', () => {
    const introPattern = SectionPresetsEngine.generateIntroCountIn(2, 16);
    const endingPattern = SectionPresetsEngine.generateEndingPunch(2, 16);

    // 準備基礎 Main A
    const mainDrums = new Map<number, boolean[]>();
    const mainKick = new Array(32).fill(false);
    mainKick[0] = true; mainKick[8] = true; mainKick[16] = true; mainKick[24] = true;
    mainDrums.set(36, mainKick);
    const mainBass = new Map<number, number>([[0, 36], [8, 36], [16, 36], [24, 36]]);
    const mainChord = new Map<number, Set<number>>([[0, new Set([48, 52, 55])], [16, new Set([48, 52, 55])]]);

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'SX920_Intro_Ending_Test',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 104, lsb: 0, pc: 0 },
      sections: [
        {
          name: 'Main A',
          bars: 2,
          stepsPerBar: 16,
          drumPattern: mainDrums,
          bassPattern: mainBass,
          chordPattern: mainChord,
        },
        {
          name: 'Intro A',
          bars: 2,
          stepsPerBar: 16,
          drumPattern: introPattern.drumPattern,
          bassPattern: introPattern.bassPattern,
          chordPattern: introPattern.chordPattern,
        },
        {
          name: 'Ending A',
          bars: 2,
          stepsPerBar: 16,
          drumPattern: endingPattern.drumPattern,
          bassPattern: endingPattern.bassPattern,
          chordPattern: endingPattern.chordPattern,
        },
      ],
      mixer: {
        drum: { volume: 100, pan: 64, reverb: 40, chorus: 0 },
        bass: { volume: 95, pan: 64, reverb: 20, chorus: 0 },
        chord: { volume: 90, pan: 52, reverb: 65, chorus: 20 },
      },
    });

    expect(bytes).toBeDefined();
    expect(bytes.length).toBeGreaterThan(10000);

    // 逆向解析驗證
    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);
    expect(parsed.hasCasm).toBe(true);

    // 驗證 CASM 區塊大小完整為 2104 位元組原廠原生資料
    const casm = parsed.customChunks.find(c => c.id === 'CASM');
    expect(casm?.data.length).toBe(2104);

    // 檢查 Track 0 是否在 Intro A 與 Ending A 區間精確置入 NoteOn 事件
    const tr0 = parsed.tracks[0];
    let t = 0;
    const notesBySection = new Map<string, number>();

    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        const sec = parsed.sections.find(s => s.startTick <= t && (s.endTick === undefined || t < s.endTick));
        const sName = sec?.name || 'Unknown';
        notesBySection.set(sName, (notesBySection.get(sName) || 0) + 1);
      }
    }

    // 驗證 Main A, Intro A, Ending A 皆有音符
    expect(notesBySection.get('Main A')).toBeGreaterThan(0);
    expect(notesBySection.get('Intro A')).toBeGreaterThan(0);
    expect(notesBySection.get('Ending A')).toBeGreaterThan(0);
  });

  it('前奏與尾奏能各自作為獨立段落進行獨立單獨試聽，音符資料與步進長度完整', () => {
    const intro4 = SectionPresetsEngine.generateIntroHarmonic(4, 16);
    expect(intro4.bars).toBe(4);
    // 總步數為 64 步
    const drumKick = intro4.drumPattern.get(36)!;
    expect(drumKick.length).toBe(64);
    expect(intro4.bassPattern.size).toBeGreaterThan(0);
    expect(intro4.chordPattern.size).toBeGreaterThan(0);

    const ending2 = SectionPresetsEngine.generateEndingPunch(2, 16);
    expect(ending2.bars).toBe(2);
    // 總步數為 32 步
    const endingCrash = ending2.drumPattern.get(49)!;
    expect(endingCrash.length).toBe(32);
    expect(endingCrash[16]).toBe(true); // 第 2 小節第 1 拍定音
  });

  it('支援完整 3 組前奏 (Intro A/B/C) 與 3 組尾奏 (Ending A/B/C) 共同匯出至 SFF2，所有段落皆有音符且維持 CASM 結構完整', () => {
    const mainDrums = new Map<number, boolean[]>();
    mainDrums.set(36, new Array(32).fill(false));
    mainDrums.get(36)![0] = true;
    mainDrums.get(36)![16] = true;

    const mainBass = new Map<number, number>();
    mainBass.set(0, 36);
    mainBass.set(16, 36);

    const mainChord = new Map<number, Set<number>>();
    mainChord.set(0, new Set([48, 52, 55]));
    mainChord.set(16, new Set([48, 52, 55]));

    const introA = SectionPresetsEngine.generateIntroHarmonic(4, 16);
    const introB = SectionPresetsEngine.generateIntroCountIn(4, 16);
    const introC = SectionPresetsEngine.generateIntroHarmonic(8, 16);
    const endingA = SectionPresetsEngine.generateEndingPunch(2, 16);
    const endingB = SectionPresetsEngine.generateEndingClimax(4, 16);
    const endingC = SectionPresetsEngine.generateEndingSoft(4, 16);

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'SX920_All_Intros_Endings_Test',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 104, lsb: 0, pc: 0 },
      sections: [
        { name: 'Main A', bars: 2, stepsPerBar: 16, drumPattern: mainDrums, bassPattern: mainBass, chordPattern: mainChord },
        { name: 'Intro A', bars: 4, stepsPerBar: 16, drumPattern: introA.drumPattern, bassPattern: introA.bassPattern, chordPattern: introA.chordPattern },
        { name: 'Intro B', bars: 4, stepsPerBar: 16, drumPattern: introB.drumPattern, bassPattern: introB.bassPattern, chordPattern: introB.chordPattern },
        { name: 'Intro C', bars: 8, stepsPerBar: 16, drumPattern: introC.drumPattern, bassPattern: introC.bassPattern, chordPattern: introC.chordPattern },
        { name: 'Ending A', bars: 2, stepsPerBar: 16, drumPattern: endingA.drumPattern, bassPattern: endingA.bassPattern, chordPattern: endingA.chordPattern },
        { name: 'Ending B', bars: 4, stepsPerBar: 16, drumPattern: endingB.drumPattern, bassPattern: endingB.bassPattern, chordPattern: endingB.chordPattern },
        { name: 'Ending C', bars: 4, stepsPerBar: 16, drumPattern: endingC.drumPattern, bassPattern: endingC.bassPattern, chordPattern: endingC.chordPattern },
      ],
      mixer: {
        drum: { volume: 100, pan: 64, reverb: 40, chorus: 0 },
        bass: { volume: 95, pan: 64, reverb: 20, chorus: 0 },
        chord: { volume: 90, pan: 52, reverb: 65, chorus: 20 },
      },
    });

    expect(bytes).toBeDefined();
    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.division).toBe(1920);
    expect(parsed.hasCasm).toBe(true);

    // 檢查 Track 0 每個段落皆有音符
    const tr0 = parsed.tracks[0];
    let t = 0;
    const notesBySection = new Map<string, number>();

    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        const sec = parsed.sections.find(s => s.startTick <= t && (s.endTick === undefined || t < s.endTick));
        const sName = sec?.name || 'Unknown';
        notesBySection.set(sName, (notesBySection.get(sName) || 0) + 1);
      }
    }

    expect(notesBySection.get('Main A')).toBeGreaterThan(0);
    expect(notesBySection.get('Intro A')).toBeGreaterThan(0);
    expect(notesBySection.get('Intro B')).toBeGreaterThan(0);
    expect(notesBySection.get('Intro C')).toBeGreaterThan(0);
    expect(notesBySection.get('Ending A')).toBeGreaterThan(0);
    expect(notesBySection.get('Ending B')).toBeGreaterThan(0);
    expect(notesBySection.get('Ending C')).toBeGreaterThan(0);
  });

  it('SectionPresetsEngine 正確生成 Break (暫停過門) 範本：第 1 拍定音重擊、中間留白、第 4 拍小鼓滾奏加花與導音', () => {
    const breakPattern = SectionPresetsEngine.generateBreakPattern(1, 16);
    expect(breakPattern.name).toBe('Break');
    expect(breakPattern.bars).toBe(1);

    // 拍 1 (step 0): Crash 大鈸 (49) + 大鼓 (36) + 小鼓 (38) + 貝斯 C2 (36) + 和弦
    expect(breakPattern.drumPattern.get(49)![0]).toBe(true);
    expect(breakPattern.drumPattern.get(36)![0]).toBe(true);
    expect(breakPattern.drumPattern.get(38)![0]).toBe(true);
    expect(breakPattern.bassPattern.get(0)).toBe(36);
    expect(breakPattern.chordPattern.get(0)?.has(48)).toBe(true);

    // 拍 2 ~ 拍 3 (step 1 ~ 11): 留白靜音
    const snare = breakPattern.drumPattern.get(38)!;
    for (let s = 1; s < 12; s++) {
      expect(snare[s]).toBe(false);
    }

    // 拍 4 (step 12 ~ 15): 小鼓漸強滾奏 + 導音
    expect(snare[12]).toBe(true);
    expect(snare[13]).toBe(true);
    expect(snare[14]).toBe(true);
    expect(snare[15]).toBe(true);
    expect(breakPattern.bassPattern.get(14)).toBe(47); // B2 導音
  });

  it('合成器能將使用者編輯之 Break 段落精準對應至 Yamaha 原廠標準 Fill In BA，並在實體琴 Track 0 輸出音符', () => {
    const mainDrums = new Map<number, boolean[]>();
    mainDrums.set(36, new Array(16).fill(false));
    mainDrums.get(36)![0] = true;
    const mainBass = new Map<number, number>([[0, 36]]);
    const mainChord = new Map<number, Set<number>>([[0, new Set([48, 52, 55])]]);

    const breakPattern = SectionPresetsEngine.generateBreakPattern(1, 16);

    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'SX920_Break_Test',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 104, lsb: 0, pc: 0 },
      sections: [
        { name: 'Main A', bars: 1, stepsPerBar: 16, drumPattern: mainDrums, bassPattern: mainBass, chordPattern: mainChord },
        { name: 'Break', bars: 1, stepsPerBar: 16, drumPattern: breakPattern.drumPattern, bassPattern: breakPattern.bassPattern, chordPattern: breakPattern.chordPattern },
      ],
      mixer: {
        drum: { volume: 100, pan: 64, reverb: 40, chorus: 0 },
        bass: { volume: 95, pan: 64, reverb: 20, chorus: 0 },
        chord: { volume: 90, pan: 52, reverb: 65, chorus: 20 },
      },
    });

    expect(bytes).toBeDefined();
    const parsed = YamahaParser.parse(bytes, 'STY');

    // 檢查 Track 0 是否在 Fill In BA 段落中精準寫入了 Break 音符
    const tr0 = parsed.tracks[0];
    let t = 0;
    const notesBySection = new Map<string, number>();

    for (const ev of tr0.events) {
      t += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        const sec = parsed.sections.find(s => s.startTick <= t && (s.endTick === undefined || t < s.endTick));
        const sName = sec?.name || 'Unknown';
        notesBySection.set(sName, (notesBySection.get(sName) || 0) + 1);
      }
    }

    expect(notesBySection.get('Main A')).toBeGreaterThan(0);
    // Yamaha 原廠標準段落標記為 Fill In BA (對應琴體面板之 BREAK 按鍵)
    expect(notesBySection.get('Fill In BA')).toBeGreaterThan(0);
  });
});
