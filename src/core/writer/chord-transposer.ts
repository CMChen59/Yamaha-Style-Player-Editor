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
   * 依據 Yamaha CASM 規則將單顆 C 基準音符轉換至目標和弦
   * 
   * @param pitch 來源音高 (0~127，假設以 C 基準錄製)
   * @param targetChord 目標和弦定義
   * @param channel MIDI 通道 (8~15)
   * @param isDrum 是否為打擊樂/鼓組聲部
   * @param lowLimit 該聲部音高下限 (預設 0)
   * @param highLimit 該聲部音高上限 (預設 127)
   * @param ntr 轉調規則 (Root Transpose / Root Fixed)
   * @param ntt 音符變換表 (Bypass / Chord / Bass / Melody)
   */
  public static transposeSingleNote(
    pitch: number,
    targetChord: ChordDefinition,
    channel: number,
    isDrum: boolean = false,
    lowLimit: number = 0,
    highLimit: number = 127,
    ntr?: NtrRule,
    ntt?: NttRule
  ): number {
    // 1. 打擊樂 / 鼓組 (isDrum=true 或標準鼓軌 Ch 9) 或設定為 Root Fixed + Bypass (原音直通) 之聲部: 保持原音不變
    // 注意：Yamaha STY 的 Rhythm 1 (Ch 8) 經常配置旋律樂器 (如 Pizzicato Strings / 馬林巴)，必須支援動態判定是否為鼓組！
    const effectiveDrum = isDrum || (channel === 9 && isDrum !== false);
    if (effectiveDrum || (ntr === 'Root Fixed' && ntt === 'Bypass')) {
      return pitch;
    }

    // 2. 若為 C 大三和弦且半音位移為 0，且非特殊變形，直接回傳
    if (targetChord.semitonesFromC === 0 && targetChord.type === 'maj' && ntr !== 'Root Fixed') {
      return pitch;
    }

    const rootShift = ntr === 'Root Fixed' ? 0 : targetChord.semitonesFromC;
    const isBass = channel === 10; // Ch 10 為 Bass 聲部
    const isChordPart = channel === 11 || channel === 12; // Ch 11/12 為 Chord 1/2

    const pitchClass = ((pitch % 12) + 12) % 12; // 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B

    // 3. 和弦變形規則 (NTT: Note Transposition Table 模擬)
    // 在 C 基準中，主要音為：C (0), D (2), E (4), F (5), G (7), A (9), B (11)
    let scaleShift = 0;

    if (ntt !== 'Bypass') {
      if (targetChord.type === 'm' || targetChord.type === 'm7' || targetChord.type === 'dim') {
        // 小調和弦：將大三度音 (E, pitchClass=4) 降半音轉為小三度 (Eb, pitchClass=3)
        if (pitchClass === 4) {
          scaleShift = -1;
        }
        // 減和弦：五度音 (G, pitchClass=7) 降半音 (Gb, pitchClass=6)
        if (targetChord.type === 'dim' && pitchClass === 7) {
          scaleShift = -1;
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

    // 4. 疊加根音位移與音階調整
    let newPitch = pitch + rootShift + scaleShift;

    // 5. 八度保護與音域防護 (Octave Wrap & Note Limits)
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
    } else if (isChordPart) {
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
    ntr?: NtrRule,
    ntt?: NttRule
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
        ntt
      ),
    }));
  }
}
