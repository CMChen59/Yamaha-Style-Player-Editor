/**
 * Yamaha SFF2 CASM 虛擬和弦即時轉調引擎 (Chord Transposer)
 * 模擬 Yamaha 電子琴左手自動伴奏 CASM (Chord Audio Style Mapping) 轉調機制
 * 依據 Yamaha SFF2 / PSR-SX920 伴奏聲部規範
 */

import type { NoteEvent } from '../audio/audio-engine';
import type { NtrRule, NttRule } from './casm-modifier';

export type ChordType = 'maj' | 'm' | '7' | 'maj7' | 'm7' | 'sus4' | 'dim';

export interface ChordDefinition {
  root: string;            // 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
  type: ChordType;         // 'maj', 'm', '7', 'maj7', 'm7', 'sus4', 'dim'
  displayName: string;     // 例如 'C', 'Am', 'G7', 'Dm7', 'F#m'
  rootPitchClass: number;  // 0 ~ 11 (0=C, 1=C#, 2=D...)
  semitonesFromC: number;  // 相對於 C 基準的半音位移量 (-6 ~ +5 或 0 ~ 11)
  intervals: number[];     // 和弦音程相對於根音 (例如 [0, 4, 7])
}

export const ROOT_PITCH_CLASSES: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
  'F': 5,
  'F#': 6,
  'Gb': 6,
  'G': 7,
  'G#': 8,
  'Ab': 8,
  'A': 9,
  'A#': 10,
  'Bb': 10,
  'B': 11,
};

// 相對於 C 基準的最佳移調半音數 (取最小絕對值位移，避免音高大跳)
export const ROOT_SEMITONES_FROM_C: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
  'F': 5,
  'F#': 6,
  'Gb': -6,
  'G': -5,
  'G#': -4,
  'Ab': -4,
  'A': -3,
  'A#': -2,
  'Bb': -2,
  'B': -1,
};

export const CHORD_TYPE_INTERVALS: Record<ChordType, { intervals: number[]; label: string }> = {
  maj: { intervals: [0, 4, 7], label: '大三和弦 (Major)' },
  m: { intervals: [0, 3, 7], label: '小三和弦 (Minor)' },
  7: { intervals: [0, 4, 7, 10], label: '屬七和弦 (Dominant 7th)' },
  maj7: { intervals: [0, 4, 7, 11], label: '大七和弦 (Major 7th)' },
  m7: { intervals: [0, 3, 7, 10], label: '小七和弦 (Minor 7th)' },
  sus4: { intervals: [0, 5, 7], label: '掛留四和弦 (Sus4)' },
  dim: { intervals: [0, 3, 6], label: '減三和弦 (Diminished)' },
};

/**
 * Yamaha SFF-GE (Guitar Edition) 6 弦吉他標準品位指法模型
 * 弦序為：[第6弦(最低音), 第5弦, 第4弦, 第3弦, 第2弦, 第1弦(最高音)]
 */
export interface GuitarVoicing {
  rootString: 4 | 5 | 6;       // 根音所在的弦 (4, 5, 或 6)
  fifthString: 4 | 5 | 6;      // 五度音所在的弦 (4, 5, 或 6)
  strings: [number, number, number, number, number, number]; // [第6弦, 第5弦, 第4弦, 第3弦, 第2弦, 第1弦]
}

/** 經典民謠木吉他開放與把位和弦預設指型表 */
export const GUITAR_VOICING_PRESETS: Record<string, GuitarVoicing> = {
  // C
  'C_maj': { rootString: 5, fifthString: 6, strings: [43, 48, 52, 55, 60, 64] },   // G2, C3, E3, G3, C4, E4
  'C_m': { rootString: 5, fifthString: 6, strings: [43, 48, 51, 55, 58, 63] },     // G2, C3, Eb3, G3, Bb3, Eb4
  'C_7': { rootString: 5, fifthString: 6, strings: [43, 48, 52, 58, 60, 64] },     // G2, C3, E3, Bb3, C4, E4
  'C_maj7': { rootString: 5, fifthString: 6, strings: [43, 48, 52, 55, 59, 64] },  // G2, C3, E3, G3, B3, E4
  'C_m7': { rootString: 5, fifthString: 6, strings: [43, 48, 51, 58, 60, 63] },    // G2, C3, Eb3, Bb3, C4, Eb4
  'C_sus4': { rootString: 5, fifthString: 6, strings: [43, 48, 53, 55, 60, 64] },  // G2, C3, F3, G3, C4, E4
  'C_dim': { rootString: 5, fifthString: 6, strings: [42, 48, 51, 54, 60, 63] },

  // D
  'D_maj': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 62, 66] },   // A2, A2, D3, A3, D4, F#4
  'D_m': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 62, 65] },     // A2, A2, D3, A3, D4, F4
  'D_7': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 60, 66] },     // A2, A2, D3, A3, C4, F#4
  'D_maj7': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 61, 66] },  // A2, A2, D3, A3, C#4, F#4
  'D_m7': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 60, 65] },    // A2, A2, D3, A3, C4, F4
  'D_sus4': { rootString: 4, fifthString: 5, strings: [45, 45, 50, 57, 62, 67] },  // A2, A2, D3, A3, D4, G4
  'D_dim': { rootString: 4, fifthString: 5, strings: [44, 44, 50, 56, 59, 65] },

  // E
  'E_maj': { rootString: 6, fifthString: 5, strings: [40, 47, 52, 56, 59, 64] },   // E2, B2, E3, G#3, B3, E4
  'E_m': { rootString: 6, fifthString: 5, strings: [40, 47, 52, 55, 59, 64] },     // E2, B2, E3, G3, B3, E4
  'E_7': { rootString: 6, fifthString: 5, strings: [40, 47, 50, 56, 59, 64] },     // E2, B2, D3, G#3, B3, E4
  'E_maj7': { rootString: 6, fifthString: 5, strings: [40, 47, 51, 56, 59, 64] },  // E2, B2, D#3, G#3, B3, E4
  'E_m7': { rootString: 6, fifthString: 5, strings: [40, 47, 50, 55, 59, 64] },    // E2, B2, D3, G3, B3, E4
  'E_sus4': { rootString: 6, fifthString: 5, strings: [40, 47, 52, 57, 59, 64] },  // E2, B2, E3, A3, B3, E4
  'E_dim': { rootString: 6, fifthString: 5, strings: [40, 46, 49, 55, 58, 64] },

  // F
  'F_maj': { rootString: 6, fifthString: 5, strings: [41, 48, 53, 57, 60, 65] },   // F2, C3, F3, A3, C4, F4
  'F_m': { rootString: 6, fifthString: 5, strings: [41, 48, 53, 56, 60, 65] },     // F2, C3, F3, Ab3, C4, F4
  'F_7': { rootString: 6, fifthString: 5, strings: [41, 48, 51, 57, 60, 65] },     // F2, C3, Eb3, A3, C4, F4
  'F_maj7': { rootString: 6, fifthString: 5, strings: [41, 48, 52, 57, 60, 65] },  // F2, C3, E3, A3, C4, F4
  'F_m7': { rootString: 6, fifthString: 5, strings: [41, 48, 51, 56, 60, 65] },    // F2, C3, Eb3, Ab3, C4, F4
  'F_sus4': { rootString: 6, fifthString: 5, strings: [41, 48, 53, 58, 60, 65] },  // F2, C3, F3, Bb3, C4, F4
  'F_dim': { rootString: 6, fifthString: 5, strings: [41, 47, 50, 56, 59, 65] },

  // G
  'G_maj': { rootString: 6, fifthString: 4, strings: [43, 47, 50, 55, 59, 67] },   // G2, B2, D3, G3, B3, G4
  'G_m': { rootString: 6, fifthString: 5, strings: [43, 50, 55, 58, 62, 67] },     // G2, D3, G3, Bb3, D4, G4
  'G_7': { rootString: 6, fifthString: 4, strings: [43, 47, 50, 55, 59, 65] },     // G2, B2, D3, G3, B3, F4
  'G_maj7': { rootString: 6, fifthString: 4, strings: [43, 47, 50, 55, 59, 66] },  // G2, B2, D3, G3, B3, F#4
  'G_m7': { rootString: 6, fifthString: 5, strings: [43, 50, 53, 58, 62, 67] },    // G2, D3, F3, Bb3, D4, G4
  'G_sus4': { rootString: 6, fifthString: 4, strings: [43, 50, 50, 55, 60, 67] },  // G2, D3, D3, G3, C4, G4
  'G_dim': { rootString: 6, fifthString: 5, strings: [43, 49, 52, 58, 61, 67] },

  // A
  'A_maj': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 57, 61, 64] },   // E2, A2, E3, A3, C#4, E4
  'A_m': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 57, 60, 64] },     // E2, A2, E3, A3, C4, E4
  'A_7': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 55, 61, 64] },     // E2, A2, E3, G3, C#4, E4
  'A_maj7': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 56, 61, 64] },  // E2, A2, E3, G#3, C#4, E4
  'A_m7': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 55, 60, 64] },    // E2, A2, E3, G3, C4, E4
  'A_sus4': { rootString: 5, fifthString: 6, strings: [40, 45, 52, 57, 62, 64] },  // E2, A2, E3, A3, D4, E4
  'A_dim': { rootString: 5, fifthString: 6, strings: [39, 45, 51, 54, 60, 63] },

  // B
  'B_maj': { rootString: 5, fifthString: 6, strings: [42, 47, 54, 59, 63, 66] },   // F#2, B2, F#3, B3, D#4, F#4
  'B_m': { rootString: 5, fifthString: 6, strings: [42, 47, 54, 59, 62, 66] },     // F#2, B2, F#3, B3, D4, F#4
  'B_7': { rootString: 5, fifthString: 6, strings: [42, 47, 51, 57, 59, 66] },     // F#2, B2, D#3, A3, B3, F#4
  'B_maj7': { rootString: 5, fifthString: 6, strings: [42, 47, 54, 58, 63, 66] },  // F#2, B2, F#3, A#3, D#4, F#4
  'B_m7': { rootString: 5, fifthString: 6, strings: [42, 47, 54, 57, 62, 66] },    // F#2, B2, F#3, A3, D4, F#4
  'B_sus4': { rootString: 5, fifthString: 6, strings: [42, 47, 54, 59, 64, 66] },  // F#2, B2, F#3, B3, E4, F#4
  'B_dim': { rootString: 5, fifthString: 6, strings: [41, 47, 53, 56, 62, 65] },

  // Bb / A#
  'Bb_maj': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 58, 62, 65] },  // F2, Bb2, F3, Bb3, D4, F4
  'Bb_m': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 58, 61, 65] },    // F2, Bb2, F3, Bb3, Db4, F4
  'Bb_7': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 56, 62, 65] },    // F2, Bb2, F3, Ab3, D4, F4
  'Bb_maj7': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 57, 62, 65] }, // F2, Bb2, F3, A3, D4, F4
  'Bb_m7': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 56, 61, 65] },   // F2, Bb2, F3, Ab3, Db4, F4
  'Bb_sus4': { rootString: 5, fifthString: 6, strings: [41, 46, 53, 58, 63, 65] }, // F2, Bb2, F3, Bb3, Eb4, F4
  'Bb_dim': { rootString: 5, fifthString: 6, strings: [40, 46, 52, 55, 61, 64] },
};

/** 常用流行音樂快速切換和弦按鈕定義 */
export const POPULAR_AUDITION_CHORDS: ChordDefinition[] = [
  { root: 'C', type: 'maj', displayName: 'C (原調)', rootPitchClass: 0, semitonesFromC: 0, intervals: [0, 4, 7] },
  { root: 'D', type: 'm', displayName: 'Dm', rootPitchClass: 2, semitonesFromC: 2, intervals: [0, 3, 7] },
  { root: 'E', type: 'm', displayName: 'Em', rootPitchClass: 4, semitonesFromC: 4, intervals: [0, 3, 7] },
  { root: 'F', type: 'maj', displayName: 'F', rootPitchClass: 5, semitonesFromC: 5, intervals: [0, 4, 7] },
  { root: 'G', type: 'maj', displayName: 'G', rootPitchClass: 7, semitonesFromC: -5, intervals: [0, 4, 7] },
  { root: 'A', type: 'm', displayName: 'Am', rootPitchClass: 9, semitonesFromC: -3, intervals: [0, 3, 7] },
  { root: 'G', type: '7', displayName: 'G7', rootPitchClass: 7, semitonesFromC: -5, intervals: [0, 4, 7, 10] },
  { root: 'Bb', type: 'maj', displayName: 'Bb', rootPitchClass: 10, semitonesFromC: -2, intervals: [0, 4, 7] },
  { root: 'C', type: '7', displayName: 'C7', rootPitchClass: 0, semitonesFromC: 0, intervals: [0, 4, 7, 10] },
  { root: 'F', type: 'm', displayName: 'Fm', rootPitchClass: 5, semitonesFromC: 5, intervals: [0, 3, 7] },
  { root: 'A', type: 'maj', displayName: 'A', rootPitchClass: 9, semitonesFromC: -3, intervals: [0, 4, 7] },
  { root: 'D', type: 'maj', displayName: 'D', rootPitchClass: 2, semitonesFromC: 2, intervals: [0, 4, 7] },
];

export interface ChordProgressionPreset {
  id: string;
  name: string;
  description: string;
  chordNames: string[];
}

/** 常用經典流行和弦進行預設 */
export const CHORD_PROGRESSION_PRESETS: ChordProgressionPreset[] = [
  {
    id: 'pop-1564',
    name: '流行 1-5-6-4 (C - G - Am - F)',
    description: '華語與西洋流行金曲最常見循環進程',
    chordNames: ['C', 'G', 'Am', 'F'],
  },
  {
    id: 'pop-1645',
    name: '流行 1-6-4-5 (C - Am - F - G)',
    description: '經典 50 年代 Doo-Wop 抒情循環',
    chordNames: ['C', 'Am', 'F', 'G'],
  },
  {
    id: 'canon-8',
    name: '卡農進行 8 小節 (C - G - Am - Em - F - C - F - G)',
    description: '帕海貝爾卡農經典 8 小節循環',
    chordNames: ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'],
  },
  {
    id: 'ballad-6415',
    name: '抒情小調 6-4-1-5 (Am - F - C - G)',
    description: '日韓抒情與動漫常見哀愁感性小調',
    chordNames: ['Am', 'F', 'C', 'G'],
  },
  {
    id: 'jazz-251',
    name: '爵士 2-5-1 (Dm7 - G7 - Cmaj7 - C)',
    description: '爵士標準曲最基礎 2-5-1 解決進程',
    chordNames: ['Dm7', 'G7', 'Cmaj7', 'C'],
  },
  {
    id: 'soul-4536',
    name: '動聽 4-5-3-6 (F - G - Em - Am)',
    description: '流行感性王道進行，動聽煽情',
    chordNames: ['F', 'G', 'Em', 'Am'],
  },
  {
    id: 'blues-12',
    name: '藍調 12 小節 (C7 - F7 - G7)',
    description: '標準 12 小節 Blues 和弦架構',
    chordNames: ['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7'],
  },
  {
    id: 'all-c',
    name: '基準原調 (全部 C)',
    description: '維持原檔錄製調性試聽',
    chordNames: ['C', 'C', 'C', 'C'],
  },
];

export class ChordTransposer {
  /**
   * 解析和弦名稱字串 (如 'C', 'Am', 'G7', 'Dm7', 'Cmaj7', 'F#m', 'Bb', 'Gsus4', 'Bdim')
   */
  public static parseChordString(chordStr: string): ChordDefinition {
    const trimmed = chordStr.trim();
    if (!trimmed) return ChordTransposer.buildChord('C', 'maj');

    // 比對根音 (A~G, 可帶 # 或 b) 與其餘後綴
    const match = trimmed.match(/^([A-G][#b]?)(.*)$/i);
    if (!match) return ChordTransposer.buildChord('C', 'maj');

    // 格式化根音字首大寫，# 或 b 規範
    let root = match[1].toUpperCase();
    if (match[1].length === 2 && match[1][1].toLowerCase() === 'b') {
      root = match[1][0].toUpperCase() + 'b';
    } else if (match[1].length === 2 && match[1][1] === '#') {
      root = match[1][0].toUpperCase() + '#';
    }

    const rest = match[2].toLowerCase();
    let type: ChordType = 'maj';
    if (rest === 'm' || rest === 'min' || rest === '-') {
      type = 'm';
    } else if (rest === 'maj7' || rest === 'm7+' || rest === 'ma7' || rest === 'major7') {
      type = 'maj7';
    } else if (rest === 'm7' || rest === 'min7' || rest === '-7') {
      type = 'm7';
    } else if (rest === '7' || rest === 'dom7') {
      type = '7';
    } else if (rest === 'sus4' || rest === 'sus') {
      type = 'sus4';
    } else if (rest === 'dim' || rest === 'o') {
      type = 'dim';
    }

    return ChordTransposer.buildChord(root, type);
  }

  /**
   * 取得指定預設進行名稱的和弦陣列
   */
  public static getProgressionPreset(presetId: string): ChordDefinition[] {
    const preset = CHORD_PROGRESSION_PRESETS.find(p => p.id === presetId) || CHORD_PROGRESSION_PRESETS[0];
    return preset.chordNames.map(name => ChordTransposer.parseChordString(name));
  }
  /**
   * 根據根音與類型構建和弦定義物件
   */
  public static buildChord(root: string, type: ChordType = 'maj'): ChordDefinition {
    const cleanRoot = root.replace(/m|7|maj7|sus4|dim/g, '').trim() || 'C';
    const pitchClass = ROOT_PITCH_CLASSES[cleanRoot] ?? 0;
    const shift = ROOT_SEMITONES_FROM_C[cleanRoot] ?? 0;
    const typeInfo = CHORD_TYPE_INTERVALS[type] ?? CHORD_TYPE_INTERVALS.maj;

    let suffix = '';
    if (type === 'm') suffix = 'm';
    else if (type === '7') suffix = '7';
    else if (type === 'maj7') suffix = 'maj7';
    else if (type === 'm7') suffix = 'm7';
    else if (type === 'sus4') suffix = 'sus4';
    else if (type === 'dim') suffix = 'dim';

    return {
      root: cleanRoot,
      type,
      displayName: `${cleanRoot}${suffix}`,
      rootPitchClass: pitchClass,
      semitonesFromC: shift,
      intervals: typeInfo.intervals,
    };
  }

  /**
   * 取得指定和弦的最佳吉他 6 弦品位指型 (含 CAGED 封閉和弦演算法後備)
   */
  public static getGuitarVoicing(chord: ChordDefinition): GuitarVoicing {
    // 根音名稱標準化 (支援降記號與升記號互換查表)
    let root = chord.root;
    if (root === 'Db') root = 'C#';
    else if (root === 'Eb') root = 'D#';
    else if (root === 'Gb') root = 'F#';
    else if (root === 'Ab') root = 'G#';
    else if (root === 'A#') root = 'Bb';

    const key = `${root}_${chord.type}`;
    if (GUITAR_VOICING_PRESETS[key]) {
      return GUITAR_VOICING_PRESETS[key];
    }
    // 嘗試查核標準大和弦
    const majKey = `${root}_maj`;
    if (chord.type === 'maj' && GUITAR_VOICING_PRESETS[majKey]) {
      return GUITAR_VOICING_PRESETS[majKey];
    }

    // 動態封閉和弦 (CAGED Barre Chords) 演算法推算
    const pitchClass = chord.rootPitchClass; // 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=Bb, 11=B
    const useEShape = pitchClass >= 4 && pitchClass <= 8; // E, F, F#, G, Ab 優先採用第 6 弦 E-Shape

    if (useEShape) {
      // E 型封閉：品位 shift = (pitchClass - 4 + 12) % 12
      const fret = (pitchClass - 4 + 12) % 12;
      let base: [number, number, number, number, number, number];
      if (chord.type === 'm' || chord.type === 'm7') {
        base = [40, 47, 52, 55, 59, 64];
      } else if (chord.type === '7') {
        base = [40, 47, 50, 56, 59, 64];
      } else if (chord.type === 'maj7') {
        base = [40, 47, 51, 56, 59, 64];
      } else if (chord.type === 'sus4') {
        base = [40, 47, 52, 57, 59, 64];
      } else if (chord.type === 'dim') {
        base = [40, 46, 49, 55, 58, 64];
      } else {
        base = [40, 47, 52, 56, 59, 64];
      }
      return {
        rootString: 6,
        fifthString: 5,
        strings: base.map(p => p + fret) as [number, number, number, number, number, number],
      };
    } else {
      // A 型封閉：品位 shift = (pitchClass - 9 + 12) % 12
      const fret = (pitchClass - 9 + 12) % 12;
      let base: [number, number, number, number, number, number];
      if (chord.type === 'm' || chord.type === 'm7') {
        base = [40, 45, 52, 57, 60, 64];
      } else if (chord.type === '7') {
        base = [40, 45, 52, 55, 61, 64];
      } else if (chord.type === 'maj7') {
        base = [40, 45, 52, 56, 61, 64];
      } else if (chord.type === 'sus4') {
        base = [40, 45, 52, 57, 62, 64];
      } else if (chord.type === 'dim') {
        base = [39, 45, 51, 54, 60, 63];
      } else {
        base = [40, 45, 52, 57, 61, 64];
      }
      return {
        rootString: 5,
        fifthString: 6,
        strings: base.map(p => p + fret) as [number, number, number, number, number, number],
      };
    }
  }

  /**
   * Yamaha SFF-GE 虛擬吉他琴品指板弦位轉調解碼器
   * 依據 Yamaha SFF-GE 專利規格，將 48~59 虛擬弦位觸發碼即時映射至目標和弦之吉他品位真實發聲音高
   * 
   * @param pitch 來源音高 (48~59 為虛擬弦位碼；>=90 為 MegaVoice 特效雜音)
   * @param targetChord 目標和弦
   * @param ntt CASM NTT 規則 (如 130 為指彈琶音)
   */
  public static transposeGuitarNote(
    pitch: number,
    targetChord: ChordDefinition,
    _ntt?: number
  ): number {
    // 1. Yamaha MegaVoice 特效與琴弦雜音直通 (Fret Noise, Pick Scrapes, Mutes >= 90)
    if (pitch >= 90) {
      return pitch;
    }

    const voicing = ChordTransposer.getGuitarVoicing(targetChord);
    const pc = ((pitch % 12) + 12) % 12;

    // 2. 虛擬弦位觸發碼轉換 (依據 Yamaha SFF-GE 專利規範，各八度音名均映射至對應弦位)
    // B (11) -> 第 1 弦 (最高音 E 弦)
    // A (9)  -> 第 2 弦 (B 弦)
    // G (7)  -> 第 3 弦 (G 弦)
    // F (5)  -> 第 4 弦 (D 弦)
    // E (4)  -> 第 5 弦 (A 弦)
    // D (2)  -> 第 6 弦 (最低音 E 弦)
    // C# (1) -> 和弦五度音弦 (5th)
    // C (0)  -> 和弦根音弦 (Root)
    switch (pc) {
      case 0: // C: Root Note trigger (和弦根音弦)
        return voicing.strings[6 - voicing.rootString];
      case 1: // C#: 5th Note trigger (和弦五度音弦)
        return voicing.strings[6 - voicing.fifthString];
      case 2: // D: String 6 (第 6 弦，最低音 E 弦)
      case 3:
        return voicing.strings[0];
      case 4: // E: String 5 (第 5 弦，A 弦)
        return voicing.strings[1];
      case 5: // F: String 4 (第 4 弦，D 弦)
      case 6:
        return voicing.strings[2];
      case 7: // G: String 3 (第 3 弦，G 弦)
      case 8:
        return voicing.strings[3];
      case 9: // A: String 2 (第 2 弦，B 弦)
      case 10:
        return voicing.strings[4];
      case 11: // B: String 1 (第 1 弦，最高音 E 弦)
        return voicing.strings[5];
      default:
        return ChordTransposer.transposeSingleNote(pitch, targetChord, 12, false, 0, 127, 'Root Transpose', 'Chord');
    }
  }

  /**
   * 依據 Yamaha CASM 規則將單顆 C 基準音符轉換至目標和弦
   * 
   * @param pitch 來源音高 (0~127，假設以 C 基準錄製)
   * @param targetChord 目標和弦定義
   * @param channel MIDI 通道 (8~15)
   * @param isDrum 是否為打擊樂/鼓組聲部
   * @param lowLimit 該聲部音高下限 (預設 0)
   * @param highLimit 該聲部音高上限 (預設 127)
   * @param ntr 轉調規則 (Root Transpose / Root Fixed / Guitar)
   * @param ntt 音符變換表 (Bypass / Chord / Bass / Melody)
   * @param sourceChordType 來源和弦類型 (0=Maj, 2=Maj7, 8=min, 14=7th 等)
   */
  public static transposeSingleNote(
    pitch: number,
    targetChord: ChordDefinition,
    channel: number,
    isDrum: boolean = false,
    lowLimit: number = 0,
    highLimit: number = 127,
    ntr?: NtrRule | number,
    ntt?: NttRule | number,
    sourceChordType?: number
  ): number {
    // 0. Yamaha SFF-GE 吉他專利弦碼轉譯 (NTR = 2 / Guitar)
    if (ntr === 2 || ntr === 'Guitar') {
      return ChordTransposer.transposeGuitarNote(
        pitch,
        targetChord,
        typeof ntt === 'number' ? ntt : undefined
      );
    }
    // 1. 打擊樂 / 鼓組 (isDrum=true 或標準鼓軌 Ch 9) 或設定為 Root Fixed + Bypass (原音直通) 之聲部: 保持原音不變
    // 注意：Yamaha STY 的 Rhythm 1 (Ch 8) 經常配置旋律樂器 (如 Pizzicato Strings / 馬林巴)，必須支援動態判定是否為鼓組！
    const effectiveDrum = isDrum || (channel === 9 && isDrum !== false);
    if (effectiveDrum || ((ntr === 1 || ntr === 'Root Fixed') && (ntt === 0 || ntt === 'Bypass'))) {
      return pitch;
    }

    // 2. 來源和弦與目標和弦的音階調和 (NTT Source Chord Harmonization)
    const isSource7th = sourceChordType !== undefined && (
      (sourceChordType >= 14 && sourceChordType <= 23) || sourceChordType === 29 || sourceChordType === 30
    );
    const isSourceMinor = sourceChordType !== undefined && (
      (sourceChordType >= 8 && sourceChordType <= 13) || sourceChordType === 33 || sourceChordType === 34
    );

    let scaleShift = 0;
    const pitchClass = ((pitch % 12) + 12) % 12; // 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B

    if (ntt !== 'Bypass' && ntt !== 0) {
      if (isSource7th) {
        // 來源為屬七和弦 (如 LoveSong Main A 中的 Piano 與 Strings)：
        // 原始錄音音符常包含 Bb (10, 小七度), Eb (3, #9/小三度), F (5, 11th)
        if (targetChord.type === 'maj' || targetChord.type === 'maj7') {
          // 目標為大調：
          // Bb (10) -> C (0) (+2) 或 B (11) (+1，若是 maj7)
          if (pitchClass === 10) {
            scaleShift = targetChord.type === 'maj7' ? +1 : +2;
          }
          // Eb (3) -> E (4) (+1，小三度升為大三度)
          else if (pitchClass === 3) {
            scaleShift = +1;
          }
          // F (5) -> G (7) (+2，11th 轉為純五度音)
          else if (pitchClass === 5) {
            scaleShift = +2;
          }
        } else if (targetChord.type === 'm' || targetChord.type === 'm7' || targetChord.type === 'dim') {
          // 目標為小調：
          // Bb (10) -> C (0) (+2，若是 m 三和弦) 或 保持 Bb (若是 m7)
          if (pitchClass === 10 && targetChord.type === 'm') {
            scaleShift = +2;
          }
          // F (5) -> G (7) (+2)
          else if (pitchClass === 5) {
            scaleShift = +2;
          }
          // Eb (3) 已經是小調小三度，保持 0
        }
      } else if (isSourceMinor) {
        // 來源為小調和弦 (如 4006 Intro A)：
        // 原始音符包含 Eb (3, 小三度), Ab (8, 小六度), Bb (10, 小七度)
        if (targetChord.type === 'maj' || targetChord.type === 'maj7') {
          // 目標為大調：
          // Eb (3) -> E (4) (+1，升為大三度)
          if (pitchClass === 3) {
            scaleShift = +1;
          }
          // Ab (8) -> A (9) (+1，升為大六度)
          else if (pitchClass === 8) {
            scaleShift = +1;
          }
          // Bb (10) -> B (11) (+1，若是 maj7) 或 C (0) (+2)
          else if (pitchClass === 10) {
            scaleShift = targetChord.type === 'maj7' ? +1 : +2;
          }
        }
      } else {
        // 來源為標準大調 (chordType <= 7，預設情況)：
        if (targetChord.type === 'm' || targetChord.type === 'm7' || targetChord.type === 'dim') {
          // 小調和弦：將大三度音 (E, pitchClass=4) 降半音轉為小三度 (Eb, pitchClass=3)
          if (pitchClass === 4) {
            scaleShift = -1;
          }
          // 減和弦：五度音 (G, pitchClass=7) 降半音 (Gb, pitchClass=6)
          if (targetChord.type === 'dim' && pitchClass === 7) {
            scaleShift = -1;
          }
          // ★ 關鍵消除 G# 衝突 (Minor Harmonization) ★
          if (pitchClass === 11) {
            scaleShift = -1; // 消除 G# (8) 衝突，調和為自然小七度 (在 Am 下轉為純淨 G 音)
          }
        } else if (targetChord.type === 'sus4') {
          // 掛留四和弦：將大三度音 (E, pitchClass=4) 升為純四度 (F, pitchClass=5)
          if (pitchClass === 4) {
            scaleShift = +1;
          }
        } else if (targetChord.type === '7') {
          // 屬七和弦：若原音包含大七度 (B, pitchClass=11)，降為小七度 (Bb, pitchClass=10)
          if (pitchClass === 11) {
            scaleShift = -1;
          }
        }
      }
    }

    const isRootFixed = ntr === 1 || ntr === 'Root Fixed';
    const rootShift = targetChord.semitonesFromC;

    // 若半音位移為 0 且無音階調整，直接回傳原音
    const isChordNtt = ntt === 2 || ntt === 130 || ntt === 'Chord';
    const isStrictTriad = targetChord.type === 'maj' || targetChord.type === 'm';
    if (rootShift === 0 && scaleShift === 0 && (!isChordNtt || !isStrictTriad || pitchClass !== 11)) {
      return pitch;
    }

    const isBass = channel === 10; // Ch 10 為 Bass 聲部
    const isChordPart = channel === 11 || channel === 12; // Ch 11/12 為 Chord 1/2

    // 3. 疊加根音位移與音階調整
    let newPitch = pitch + rootShift + scaleShift;
    // 4. NTT = 2 / 130 (Chord) 和弦音智慧吸附保護 (Chord Tone Snapping)
    if (isChordNtt && !isDrum && channel !== 9 && channel !== 10) {
      const targetRootPc = ((targetChord.semitonesFromC % 12) + 12) % 12;
      const notePc = ((newPitch % 12) + 12) % 12;
      const relPc = ((notePc - targetRootPc) + 12) % 12;
      if (targetChord.type === 'maj') {
        if (relPc === 11) newPitch += 1; // 大七度吸附至根音 (+1 半音)
      } else if (targetChord.type === 'm') {
        if (relPc === 8) newPitch -= 1;  // 雙重保險：消除 G# (8) -> 吸附至五度音 (7)
        else if (relPc === 11) newPitch -= 1; // 大七度 (11) 吸附至小七度 (10)
      }
    }

    // 4. 八度保護與音域防護 (Octave Wrap & Note Limits)
    if (isBass) {
      // Bass 最佳音域：28 (E1) ~ 55 (G3)
      const effectiveLow = Math.max(28, lowLimit);
      const effectiveHigh = Math.min(55, highLimit);

      while (newPitch < effectiveLow && newPitch + 12 <= effectiveHigh) {
        newPitch += 12;
      }
      while (newPitch > effectiveHigh && newPitch - 12 >= effectiveLow) {
        newPitch -= 12;
      }
    } else if (isChordPart && !isRootFixed) {
      // 和弦吉他/鋼琴最佳音域：40 (E2) ~ 90 (F#6)
      while (newPitch < 40) newPitch += 12;
      while (newPitch > 90) newPitch -= 12;
    }

    // 嚴格保證在 MIDI 0 ~ 127 及 High/Low Limits 內
    newPitch = Math.min(Math.min(127, highLimit), Math.max(Math.max(0, lowLimit), newPitch));
    return newPitch;
  }

  /**
   * 取得和弦的中文詳細說明描述
   */
  public static getChordDescription(chord: ChordDefinition): string {
    const typeLabel = CHORD_TYPE_INTERVALS[chord.type]?.label || chord.type;
    if (chord.root === 'C' && chord.type === 'maj') {
      return `${typeLabel} · 基準原音 (未位移)`;
    }
    const shiftStr = chord.semitonesFromC > 0 ? `+${chord.semitonesFromC}` : `${chord.semitonesFromC}`;
    return `${typeLabel} · 半音位移 ${shiftStr}`;
  }

  /**
   * 依據 Yamaha CASM 規則將 C 基準音符轉換至目標和弦
   * 
   * @param notes 來源音符 (假設以 C 基準錄製)
   * @param targetChord 目標和弦定義
   * @param channel MIDI 通道 (8~15)
   * @param isDrum 是否為打擊樂/鼓組聲部
   * @param lowLimit 該聲部音高下限 (預設 0)
   * @param highLimit 該聲部音高上限 (預設 127)
   * @param ntr 轉調規則 (Root Transpose / Root Fixed)
   * @param ntt 音符變換表 (Bypass / Chord / Bass / Melody)
   */
  public static transposeNotes(
    notes: NoteEvent[],
    targetChord: ChordDefinition,
    channel: number,
    isDrum: boolean = false,
    lowLimit: number = 0,
    highLimit: number = 127,
    ntr?: NtrRule | number,
    ntt?: NttRule | number,
    sourceChordType?: number
  ): NoteEvent[] {
    return notes.map((origNote) => ({
      ...origNote,
      note: this.transposeSingleNote(
        origNote.note,
        targetChord,
        channel,
        isDrum,
        lowLimit,
        highLimit,
        ntr,
        ntt,
        sourceChordType
      ),
    }));
  }
}
