/**
 * Yamaha PSR-SX920 伴奏風格製作 (V2)
 * 前奏 (Intro) 與尾奏 (Ending) 智慧樣板生成引擎 (Section Presets Engine)
 * 提供倒數計拍、流行 2-5-1 和弦引導、俐落大鈸收束、樂團高潮大收尾等開箱即用之音樂骨架。
 */

import type { SectionStore } from './creator-app';

export interface GeneratedSectionPattern {
  name: string;
  bars: number;
  drumPattern: Map<number, boolean[]>;
  bassPattern: Map<number, number>;
  chordPattern: Map<number, Set<number>>;
  dynamicPatterns?: Record<string, Map<number, Set<number>>>;
}

export class SectionPresetsEngine {
  /**
   * 建立空白軌道結構
   */
  private static createBlankPatterns(totalSteps: number) {
    const drumPattern = new Map<number, boolean[]>();
    [36, 38, 42, 46, 49, 51].forEach(note => {
      drumPattern.set(note, new Array(totalSteps).fill(false));
    });
    const bassPattern = new Map<number, number>();
    const chordPattern = new Map<number, Set<number>>();
    return { drumPattern, bassPattern, chordPattern };
  }

  /**
   * 範本 1: 🥁 倒數計拍前奏 (Count-in Intro)
   * 支援 2 小節 (短引子)、4 小節 (標準前奏) 或 8 小節 (長版前奏)
   * 第 1 小節: 4 拍 Hi-Hat / 鼓棒清脆計拍 (1, 2, 3, 4)
   * 中間小節: 樂團進場推進，能量逐漸蓄積
   * 最後 1 小節: 小鼓漸強滾奏加花，震撼交棒給主歌
   */
  public static generateIntroCountIn(bars: number = 4, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const kick = drumPattern.get(36)!;
    const snare = drumPattern.get(38)!;
    const hihat = drumPattern.get(42)!;

    // 第 1 小節 (Bar 0): 4 拍倒數計拍 (嗒、嗒、嗒、嗒)
    for (let beat = 0; beat < 4; beat++) {
      const step = Math.round(beat * (stepsPerBar / 4));
      if (step < totalSteps) {
        hihat[step] = true;
      }
    }

    // 中間進行小節 (Bar 1 ~ Bar bars-2)
    for (let b = 1; b < bars - 1; b++) {
      const offset = b * stepsPerBar;
      kick[offset + 0] = true;
      kick[offset + 8] = true;
      snare[offset + 4] = true;
      snare[offset + 12] = true;
      for (let s = 0; s < stepsPerBar; s += 2) hihat[offset + s] = true;

      // 貝斯與和弦進行 (C - Am - F - G)
      const chordCycle = b % 2 === 1 ? [48, 52, 55] : [55, 59, 62];
      const bassNote = b % 2 === 1 ? 36 : 43;
      bassPattern.set(offset + 0, bassNote);
      bassPattern.set(offset + 8, bassNote);
      chordPattern.set(offset + 0, new Set(chordCycle));
      chordPattern.set(offset + 8, new Set(chordCycle));
    }

    // 最後 1 小節 (Bar bars-1): 樂團衝刺，最後一拍小鼓滾奏交棒主歌
    if (bars >= 2) {
      const lastBarOffset = (bars - 1) * stepsPerBar;
      kick[lastBarOffset + 0] = true;
      kick[lastBarOffset + 6] = true;
      kick[lastBarOffset + 8] = true;
      kick[lastBarOffset + 10] = true;
      snare[lastBarOffset + 4] = true;
      for (let s = 0; s < 12; s += 2) hihat[lastBarOffset + s] = true;

      // 最後一拍小鼓漸強滾奏 (16分音符)
      snare[lastBarOffset + 12] = true;
      snare[lastBarOffset + 13] = true;
      snare[lastBarOffset + 14] = true;
      snare[lastBarOffset + 15] = true;

      bassPattern.set(lastBarOffset + 0, 43); // G2
      bassPattern.set(lastBarOffset + 8, 43);
      bassPattern.set(lastBarOffset + 14, 47); // B2 導音引導進主歌 C

      chordPattern.set(lastBarOffset + 0, new Set([53, 55, 59])); // G7 和弦
      chordPattern.set(lastBarOffset + 8, new Set([53, 55, 59]));
    }

    return {
      name: 'Intro A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 2: 🎹 經典流行和弦引導前奏 (Pop Harmonic Cadence)
   * 支援 2 小節 (2-5-1)、4 小節 (經典 1-6-2-5) 或 8 小節 (雙循環加強版)
   */
  public static generateIntroHarmonic(bars: number = 4, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const kick = drumPattern.get(36)!;
    const snare = drumPattern.get(38)!;
    const hihat = drumPattern.get(42)!;

    // 定義流行和弦進行: C (I) -> Am (VI) -> Dm7 (II) -> G7 (V)
    const progression = [
      { bass: 36, chord: [48, 52, 55] }, // C (I)
      { bass: 45, chord: [45, 48, 52] }, // Am (VI)
      { bass: 38, chord: [50, 53, 57] }, // Dm7 (II)
      { bass: 43, chord: [53, 55, 59] }, // G7 (V)
    ];

    for (let b = 0; b < bars; b++) {
      const offset = b * stepsPerBar;
      const isLastBar = b === bars - 1;

      // 和弦與貝斯安排
      let chordInfo;
      if (bars === 2) {
        chordInfo = b === 0 ? progression[2] : progression[3]; // Dm -> G7
      } else {
        chordInfo = progression[b % 4];
      }

      bassPattern.set(offset + 0, chordInfo.bass);
      bassPattern.set(offset + 8, chordInfo.bass);
      chordPattern.set(offset + 0, new Set(chordInfo.chord));
      chordPattern.set(offset + 8, new Set(chordInfo.chord));

      if (!isLastBar) {
        // 常規伴奏節奏
        kick[offset + 0] = true;
        kick[offset + 8] = true;
        snare[offset + 4] = true;
        snare[offset + 12] = true;
        for (let s = 0; s < stepsPerBar; s += 2) hihat[offset + s] = true;
      } else {
        // 最後 1 小節: 強烈切分推進 + 第 4 拍標誌性小鼓過門加花 + 貝斯半音導音引導進入 Main A
        kick[offset + 0] = true;
        kick[offset + 6] = true;  // 拍 2 後半切分
        kick[offset + 8] = true;  // 拍 3 正拍
        kick[offset + 10] = true; // 拍 3 後半切分
        snare[offset + 4] = true; // 拍 2 小鼓

        // 前 3 拍 Hi-Hat (0 ~ 11)，第 4 拍留空突出小鼓過門
        for (let s = 0; s < 12; s += 2) hihat[offset + s] = true;

        // 第 4 拍小鼓過門加花 (16分音符漸強連擊)
        snare[offset + 12] = true;
        snare[offset + 13] = true;
        snare[offset + 14] = true;
        snare[offset + 15] = true;

        // 貝斯導音引導：第 4 拍後半 (step 14) 置入 B2 (47)，半音強烈導向主歌的 C2 (36)
        bassPattern.set(offset + 14, 47);

        // 終止小節強制鎖定為 G7 屬七和弦，製造極致解決張力
        chordPattern.set(offset + 0, new Set([53, 55, 59]));
        chordPattern.set(offset + 8, new Set([53, 55, 59]));
      }
    }

    return {
      name: 'Intro A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 3: 💥 俐落大鈸收束 (Punch Ending)
   * 第 1 小節: 小鼓漸強滾奏預告結束
   * 第 2 小節: 第 1 拍大鈸 (Crash) + 重擊大鼓 + 根音三和弦長延音，俐落停止！
   */
  public static generateEndingPunch(bars: number = 2, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const kick = drumPattern.get(36)!;
    const snare = drumPattern.get(38)!;
    const hihat = drumPattern.get(42)!;
    const crash = drumPattern.get(49)!;

    // 最後小節之前的小節: 推進加花與滾奏
    for (let b = 0; b < bars - 1; b++) {
      const offset = b * stepsPerBar;
      kick[offset + 0] = true;
      kick[offset + 4] = true;
      kick[offset + 8] = true;
      kick[offset + 10] = true;
      snare[offset + 4] = true;
      for (let s = 0; s < 8; s += 2) hihat[offset + s] = true;
      // 小鼓漸強滾奏
      snare[offset + 8] = true;
      snare[offset + 10] = true;
      snare[offset + 12] = true;
      snare[offset + 13] = true;
      snare[offset + 14] = true;
      snare[offset + 15] = true;

      bassPattern.set(offset + 0, 36); // C2
      bassPattern.set(offset + 4, 38); // D2
      bassPattern.set(offset + 8, 41); // F2
      bassPattern.set(offset + 12, 43); // G2

      chordPattern.set(offset + 0, new Set([48, 52, 55])); // C
      chordPattern.set(offset + 8, new Set([55, 59, 62])); // G
    }

    // 最終小節: 第 1 拍定音重擊，之後全體靜音留白
    const endBar = (bars - 1) * stepsPerBar;
    crash[endBar + 0] = true; // 大鈸一擊！
    kick[endBar + 0] = true;  // 大鼓重音！
    snare[endBar + 0] = true; // 小鼓拍擊！

    bassPattern.set(endBar + 0, 36); // C2 根音定音
    chordPattern.set(endBar + 0, new Set([48, 52, 55, 60])); // C Major 完結和弦

    return {
      name: 'Ending A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 4: 🥁 樂團高潮大收尾 (Climax Finish)
   * 狂熱的連擊切分節奏 + 雙重 Crash 大鈸震撼結尾
   */
  public static generateEndingClimax(bars: number = 2, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const kick = drumPattern.get(36)!;
    const snare = drumPattern.get(38)!;
    const crash = drumPattern.get(49)!;

    // 前段小節: 重音切分推進
    for (let b = 0; b < bars - 1; b++) {
      const offset = b * stepsPerBar;
      [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => { kick[offset + s] = true; });
      [4, 8, 12, 13, 14, 15].forEach(s => { snare[offset + s] = true; });

      bassPattern.set(offset + 0, 36);
      bassPattern.set(offset + 4, 43);
      bassPattern.set(offset + 8, 41);
      bassPattern.set(offset + 12, 43);

      chordPattern.set(offset + 0, new Set([48, 52, 55]));
      chordPattern.set(offset + 6, new Set([48, 52, 55]));
      chordPattern.set(offset + 12, new Set([55, 59, 62]));
    }

    // 最終小節: 3 下切分 Crash 重擊 + 最終長鳴 Crash
    const endBar = (bars - 1) * stepsPerBar;
    // 拍 1, 拍 2, 拍 3 點名
    [0, 4, 8].forEach(s => {
      crash[endBar + s] = true;
      kick[endBar + s] = true;
      bassPattern.set(endBar + s, 36);
      chordPattern.set(endBar + s, new Set([48, 52, 55]));
    });
    // 拍 4 最終一擊
    crash[endBar + 12] = true;
    kick[endBar + 12] = true;
    snare[endBar + 12] = true;
    bassPattern.set(endBar + 12, 36);
    chordPattern.set(endBar + 12, new Set([36, 48, 52, 55, 60]));

    return {
      name: 'Ending A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 5: 🌊 抒情溫柔尾奏 (Soft Ending)
   * 輕柔 Ride 鈸與鋼琴分解和弦，餘音嫋嫋自然停止
   */
  public static generateEndingSoft(bars: number = 2, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const ride = drumPattern.get(51)!;
    const kick = drumPattern.get(36)!;

    // 前段小節: 慢速抒情琶音
    for (let b = 0; b < bars - 1; b++) {
      const offset = b * stepsPerBar;
      [0, 4, 8, 12].forEach(s => { ride[offset + s] = true; });
      bassPattern.set(offset + 0, 36);
      bassPattern.set(offset + 8, 43);
      chordPattern.set(offset + 0, new Set([48, 52]));
      chordPattern.set(offset + 4, new Set([55]));
      chordPattern.set(offset + 8, new Set([60, 64]));
      chordPattern.set(offset + 12, new Set([67]));
    }

    // 最終小節: 終止式和弦淡入靜止
    const endBar = (bars - 1) * stepsPerBar;
    kick[endBar + 0] = true;
    ride[endBar + 0] = true;
    bassPattern.set(endBar + 0, 36);
    chordPattern.set(endBar + 0, new Set([48, 52, 55, 60]));

    return {
      name: 'Ending A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 6: ✨ 沿用 Main A 製作開場 (From Main A)
   * 複製 Main A 的伴奏風格，但在前 1 小節插入 4 拍 Hi-Hat 計拍
   */
  public static generateIntroFromMain(mainStore: SectionStore, bars: number = 4, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    // 複製 Main A 內容至第 1 小節至第 bars-1 小節
    const mainBars = mainStore.bars || 2;
    for (let b = 1; b < bars; b++) {
      const offset = b * stepsPerBar;
      const srcBar = (b - 1) % mainBars;
      const srcOffset = srcBar * stepsPerBar;

      mainStore.drumPattern.forEach((steps, note) => {
        if (!drumPattern.has(note)) {
          drumPattern.set(note, new Array(totalSteps).fill(false));
        }
        const targetArr = drumPattern.get(note)!;
        for (let s = 0; s < stepsPerBar; s++) {
          if (steps[srcOffset + s]) targetArr[offset + s] = true;
        }
      });

      for (let s = 0; s < stepsPerBar; s++) {
        const bassNote = mainStore.bassPattern.get(srcOffset + s);
        if (bassNote !== undefined) bassPattern.set(offset + s, bassNote);

        if (mainStore.chordPattern) {
          const chordSet = mainStore.chordPattern.get(srcOffset + s);
          if (chordSet && chordSet.size > 0) chordPattern.set(offset + s, new Set(chordSet));
        }
      }
    }

    // 第 1 小節 (Bar 0) 強制置入 4 拍 Hi-Hat 倒數計拍
    const hihat = drumPattern.get(42)!;
    for (let beat = 0; beat < 4; beat++) {
      const step = Math.round(beat * (stepsPerBar / 4));
      hihat[step] = true;
    }

    // 最後 1 小節第 4 拍加入小鼓過門與導音，無縫銜接主歌
    if (bars >= 2) {
      const lastBarOffset = (bars - 1) * stepsPerBar;
      const snare = drumPattern.get(38)!;
      snare[lastBarOffset + 12] = true;
      snare[lastBarOffset + 13] = true;
      snare[lastBarOffset + 14] = true;
      snare[lastBarOffset + 15] = true;
      bassPattern.set(lastBarOffset + 14, 47); // B2 導音
    }

    return {
      name: 'Intro A',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }

  /**
   * 範本 7: ⚡ 經典暫停過門 (Classic Break)
   * 第 1 拍: Crash 大鈸 (49) + 大鼓 (36) + 小鼓 (38) + 貝斯 (36 = C2) + 和弦 (48, 52, 55 = C) 定音重擊！
   * 第 2 ~ 3 拍: 樂團全體抽離靜音留白 (製造強大戲劇張力與呼吸感)
   * 第 4 拍: 標誌性小鼓 16 分音符漸強連擊加花 (steps 12, 13, 14, 15) + 貝斯 B2 (47) 導音引導進入主歌！
   */
  public static generateBreakPattern(bars: number = 1, stepsPerBar: number = 16): GeneratedSectionPattern {
    const totalSteps = bars * stepsPerBar;
    const { drumPattern, bassPattern, chordPattern } = this.createBlankPatterns(totalSteps);

    const kick = drumPattern.get(36)!;
    const snare = drumPattern.get(38)!;
    const crash = drumPattern.get(49)!;
    const hihat = drumPattern.get(42)!;

    // 前面各小節 (若使用者設定 bars > 1) 維持一般推進伴奏
    for (let b = 0; b < bars - 1; b++) {
      const offset = b * stepsPerBar;
      kick[offset + 0] = true;
      kick[offset + 8] = true;
      snare[offset + 4] = true;
      snare[offset + 12] = true;
      for (let s = 0; s < stepsPerBar; s += 2) hihat[offset + s] = true;
      bassPattern.set(offset + 0, 36);
      bassPattern.set(offset + 8, 43);
      chordPattern.set(offset + 0, new Set([48, 52, 55]));
      chordPattern.set(offset + 8, new Set([55, 59, 62]));
    }

    // 核心 Break 小節 (最後 1 小節)
    const breakOffset = (bars - 1) * stepsPerBar;

    // 拍 1 (step 0): 定音重大擊打！
    crash[breakOffset + 0] = true;
    kick[breakOffset + 0] = true;
    snare[breakOffset + 0] = true;
    bassPattern.set(breakOffset + 0, 36); // C2
    chordPattern.set(breakOffset + 0, new Set([48, 52, 55])); // C

    // 拍 2 ~ 拍 3 (step 1 ~ 11): 留白抽離！

    // 拍 4 (step 12 ~ 15): 小鼓漸強滾奏 + 導音回主歌！
    snare[breakOffset + 12] = true;
    snare[breakOffset + 13] = true;
    snare[breakOffset + 14] = true;
    snare[breakOffset + 15] = true;

    bassPattern.set(breakOffset + 14, 47); // B2 導音
    chordPattern.set(breakOffset + 12, new Set([53, 55, 59])); // G7

    return {
      name: 'Break',
      bars,
      drumPattern,
      bassPattern,
      chordPattern,
    };
  }
}
