import { BinaryWriter } from './binary-writer';
import type { YamahaFileParsed, MidiEvent, MidiTrack } from '../models/types';
import { PadRecorder, type QuantizeGrid } from './pad-recorder';
import { resolveYamahaVoiceWithAlias } from '../data/yamaha-voices';
import { MidiSongAnalyzer } from '../parser/midi-song-analyzer';

/**
 * Multi Pad 24 大小調標準定義 (12 小調 + 12 大調)
 */
export interface PadKeyDefinition {
  key: string;         // 標準代碼 (如 'Am', 'Em', 'Cm', 'C', 'G')
  labelZh: string;     // 繁中顯示名稱 (如 'Am (A 小調)', 'Em (E 小調)')
  rootPc: number;      // 0 ~ 11 (C=0, C#=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, Ab=8, A=9, Bb=10, B=11)
  isMinor: boolean;
}

export const PAD_KEY_LIST: PadKeyDefinition[] = [
  // 12 小調 (常用於演歌、抒情前奏 Pad)
  { key: 'Am',  labelZh: 'Am (A 小調)',       rootPc: 9,  isMinor: true },
  { key: 'Bbm', labelZh: 'Bbm / A#m (降B小調)', rootPc: 10, isMinor: true },
  { key: 'Bm',  labelZh: 'Bm (B 小調)',       rootPc: 11, isMinor: true },
  { key: 'Cm',  labelZh: 'Cm (C 小調)',       rootPc: 0,  isMinor: true },
  { key: 'C#m', labelZh: 'C#m / Dbm (升C小調)', rootPc: 1,  isMinor: true },
  { key: 'Dm',  labelZh: 'Dm (D 小調)',       rootPc: 2,  isMinor: true },
  { key: 'Ebm', labelZh: 'Ebm / D#m (降E小調)', rootPc: 3,  isMinor: true },
  { key: 'Em',  labelZh: 'Em (E 小調)',       rootPc: 4,  isMinor: true },
  { key: 'Fm',  labelZh: 'Fm (F 小調)',       rootPc: 5,  isMinor: true },
  { key: 'F#m', labelZh: 'F#m / Gbm (升F小調)', rootPc: 6,  isMinor: true },
  { key: 'Gm',  labelZh: 'Gm (G 小調)',       rootPc: 7,  isMinor: true },
  { key: 'G#m', labelZh: 'G#m / Abm (升G小調)', rootPc: 8,  isMinor: true },
  // 12 大調
  { key: 'C',   labelZh: 'C (C 大調)',        rootPc: 0,  isMinor: false },
  { key: 'Db',  labelZh: 'Db / C# (降D大調)',   rootPc: 1,  isMinor: false },
  { key: 'D',   labelZh: 'D (D 大調)',        rootPc: 2,  isMinor: false },
  { key: 'Eb',  labelZh: 'Eb / D# (降E大調)',   rootPc: 3,  isMinor: false },
  { key: 'E',   labelZh: 'E (E 大調)',        rootPc: 4,  isMinor: false },
  { key: 'F',   labelZh: 'F (F 大調)',        rootPc: 5,  isMinor: false },
  { key: 'F#',  labelZh: 'F# / Gb (升F大調)',   rootPc: 6,  isMinor: false },
  { key: 'G',   labelZh: 'G (G 大調)',        rootPc: 7,  isMinor: false },
  { key: 'Ab',  labelZh: 'Ab / G# (降A大調)',   rootPc: 8,  isMinor: false },
  { key: 'A',   labelZh: 'A (A 大調)',        rootPc: 9,  isMinor: false },
  { key: 'Bb',  labelZh: 'Bb / A# (降B大調)',   rootPc: 10, isMinor: false },
  { key: 'B',   labelZh: 'B (B 大調)',        rootPc: 11, isMinor: false },
];

/**
 * Yamaha Multi Pad 原廠常用圖示代碼 (I1~I4)
 */
export const PAD_ICON_LIST: Array<{ code: string; labelZh: string }> = [
  { code: 'S809', labelZh: 'S809 (標準樂句 Phrase)' },
  { code: 'S810', labelZh: 'S810 (吉他琶音 Guitar Arp)' },
  { code: 'S811', labelZh: 'S811 (管樂插音 Brass/Sax)' },
  { code: 'S812', labelZh: 'S812 (弦樂鋪底 Strings Pad)' },
  { code: 'S813', labelZh: 'S813 (打擊節奏 Drum/Perc)' },
  { code: 'S814', labelZh: 'S814 (合成特效 Synth/SFX)' },
];

/**
 * Multi Pad 4 大經典音樂型態分類 (遵循 GEMINI.md 鐵律)
 */
export type PadMusicalType =
  | 'EMPTY'         // 空軌 (0 音符)
  | 'DRUM_SFX'      // 打擊節奏 / 罐頭音效 (鐵律 CM = OFF，移調時跳過)
  | 'CHORD_TEXTURE' // 純和聲織體 / 1、5 音脈衝 / 琶音刷弦 (唯一合法開啟 CM = ON 並做 CM7 正規化)
  | 'SHORT_MOTIF'   // 開放骨幹音短動機 (1~2 小節無 3 度與導音，如 2011-2 Pad 1，建議 CM = OFF)
  | 'MELODY_INTRO'; // 跨小節長旋律 / 完整前奏 / 含和聲轉折或導音花音 (如 2010-1 空港，鐵律強制 CM = OFF 並用固定調性平移)

/**
 * 單一 Pad 軌道 (Pad 1 ~ 4) 樂理與混音診斷結果
 */
export interface PadTrackDiagnosis {
  padNum: number;               // 1 ~ 4
  name: string;                 // N1 ~ N4 名稱
  icon: string;                 // I1 ~ I4 圖示
  repeat: boolean;              // RP 旗標
  chordMatch: boolean;          // CM 旗標
  channel: number;              // 0 ~ 15
  noteCount: number;
  barLength: number;
  pitchMin: number | null;
  pitchMax: number | null;
  pitchRangeLabel: string;
  distinctPitchClasses: number[];
  distinctPitchNames: string[];
  hasLeadingOrChromaticTone: boolean;
  musicalType: PadMusicalType;
  musicalTypeLabelZh: string;
  recommendedChordMatch: boolean;
  hasChordMatchConflict: boolean; // 若為長旋律卻開啟了 CM = ON，標記為衝突警示
  recommendationReasonZh: string;
  voiceInfo: {
    msb: number;
    lsb: number;
    pc: number;
    voiceName: string;
    category: string;
    panelCode: string;
  };
  mixing: {
    volume: number;
    pan: number;
    expression: number;
    reverb: number;
    chorus: number;
  };
}

/**
 * 整份 Multi Pad (.PAD) 專案綜合診斷與原曲基準調自動估算結果
 */
export interface PadProjectDiagnosis {
  estimatedKey: string;          // 自動估算之原曲基準調 (如 'Am', 'Em', 'C')
  estimatedKeyLabelZh: string;   // 如 'Am (A 小調)'
  estimatedRootPc: number;       // 0 ~ 11
  estimatedIsMinor: boolean;
  keyConfidence: number;         // 0 ~ 100
  keyDetectionReasonZh: string;
  tracks: PadTrackDiagnosis[];   // Pad 1 ~ Pad 4
  hasLongMelody: boolean;
  enforcedRuleSummaryZh: string;
}

/**
 * 固定調性 PAD 剛體半音平移選項
 */
export interface PadKeyTransposeOptions {
  /** 原曲基準調 (如 'Am', 'Em', 'C')；可由系統自動估算預填，亦可由使用者手動指定覆寫 */
  sourceKey?: string;
  /** 目標調性 (如 'Em', 'Cm', 'Am', 'Dm') */
  targetKey?: string;
  /** 若使用者直接指定半音偏移量 (-24 ~ +24)，則優先以此半音數平移 */
  customSemitones?: number;
  /** 平移方向偏好：'up' (向上 0~+11)、'down' (向下 -11~0)、'auto' (預設：只要最高音不超過 maxPitchLimit 優先向上平移保持明亮音色，否則自動折返) */
  direction?: 'up' | 'down' | 'auto';
  /** 指定要平移的 Pad 編號 (1~4)，未指定則自動平移所有非鼓組且有音符之 Pad */
  padNumbers?: number[];
  /** 高音八度折返保護上限 (預設 96 即 C7；超過時依 octaveWrapMode 自動降八度) */
  maxPitchLimit?: number;
  /** 低音八度折返保護下限 (預設 36 即 C2) */
  minPitchLimit?: number;
  /** 八度折返策略：'track' (預設：整軌統一降/升八度以保持旋律線條不斷裂) | 'note' (單音折返) | 'none' (不折返) */
  octaveWrapMode?: 'track' | 'note' | 'none';
  /** 是否強制鎖定 Track 0 為 CM0000 (預設 true，遵循固定調性 PAD 轉換鐵律) */
  enforceFixedKeyCM0000?: boolean;
  /** 是否自動在 Pad 名稱 (N1~N4) 加上或更新目標調性後綴，如 'Lead 1 (Em)' (預設 true) */
  appendKeySuffixToNames?: boolean;
  /** 自訂名稱調性後綴文字 (例如傳入 'Em原調' 則產出 'Lead 1 (Em原調)'；未傳入則預設使用 targetKey 如 'Em') */
  keySuffixLabel?: string;
}

/**
 * 固定調性 PAD 剛體半音平移執行結果
 */
export interface PadKeyTransposeResult {
  success: boolean;
  sourceKey: string;
  targetKey: string;
  baseSemitoneShift: number;
  cmTag: string;
  rpTag: string;
  padNames: string[];
  trackResults: Array<{
    padNum: number;
    skipped: boolean;
    reason?: string;
    noteCount: number;
    appliedSemitones: number;
    octaveWrapped: boolean;
    oldPitchRange: [number, number] | null;
    newPitchRange: [number, number] | null;
  }>;
}

/**
 * 【任務 4-1B】MIDI 單軌小節區間擷取至 Multi Pad 槽位 (Pad 1~4) 參數
 */
export interface MidiChannelToPadImportOptions {
  /** 來源 MIDI 音樂檔 */
  sourceParsed: YamahaFileParsed;
  /** 目標 Multi Pad 專案 */
  targetPadParsed: YamahaFileParsed;
  /** 來源 MIDI 通道 (0 ~ 15) */
  sourceChannel: number;
  /** 目標 Pad 編號 (1 ~ 4) */
  targetPadNum: number;
  /** 起始小節 (1-based) */
  startBar: number;
  /** 結束小節 (1-based, inclusive) */
  endBar: number;
  /** 起始拍偏移 (1-based, default 1) */
  startBeat?: number;
  /** 結束拍偏移 (1-based, default 1) */
  endBeat?: number;
  /** 自訂 Pad 名稱 (未提供則自動以音色簡稱 + 小節命名，如 'Sax B1-4') */
  customPadName?: string;
}

/**
 * 【任務 4-1B】MIDI 單軌區間擷取至 Multi Pad 執行結果
 */
export interface MidiChannelToPadImportResult {
  success: boolean;
  targetPadNum: number;
  padName: string;
  iconCode: string;
  extractedNoteCount: number;
  extractedCCCount: number;
  barLength: number;
  voiceInfo: {
    msb: number;
    lsb: number;
    pc: number;
    voiceName: string;
    category: string;
    panelCode: string;
  };
  musicalType: PadMusicalType;
  musicalTypeLabelZh: string;
  chordMatch: boolean;
  repeat: boolean;
}

/**
 * Yamaha Pad 屬性與混音編輯核心模組
 * 負責將記憶體中的修改同步至 MIDI 軌道事件與 Yamaha 專利控制標籤 (RP, CM, N, I)
 */
export class YamahaPadModifier {
  /**
   * 更新指定 Pad (1~4) 的名稱
   */
  public static setPadName(parsed: YamahaFileParsed, padNum: number, name: string): void {
    if (!parsed.padConfig) {
      parsed.padConfig = {
        names: ['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4'],
        icons: ['', '', '', ''],
        repeatFlags: [false, false, false, false],
        chordMatchFlags: [false, false, false, false],
      };
    }
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.names[idx] = name.trim();
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的循環播放 (Repeat / RP) 旗標
   */
  public static setPadRepeat(parsed: YamahaFileParsed, padNum: number, repeat: boolean): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.repeatFlags[idx] = repeat;
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的和弦跟隨 (Chord Match / CM) 旗標
   */
  public static setPadChordMatch(parsed: YamahaFileParsed, padNum: number, chordMatch: boolean): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.chordMatchFlags[idx] = chordMatch;
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的圖示代碼 (Icon / I)
   */
  public static setPadIcon(parsed: YamahaFileParsed, padNum: number, icon: string): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.icons[idx] = icon.trim();
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 提取音軌內的所有 Note-On/Note-Off 演奏音符清單
   */
  public static extractTrackNotes(track: MidiTrack | undefined): Array<{ note: number; startTick: number; durationTick: number; velocity: number }> {
    const notes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
    if (!track || !track.events) return notes;
    let curTick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();

    for (const ev of track.events) {
      curTick += ev.delta;

      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const start = activeNotes.get(ev.noteNumber);
        if (start) {
          notes.push({
            note: ev.noteNumber,
            startTick: start.tick,
            durationTick: Math.max(1, curTick - start.tick),
            velocity: start.velocity,
          });
          activeNotes.delete(ev.noteNumber);
        }
      }
    }
    return notes;
  }

  /**
   * 更新指定 Pad 的混音參數 (音量、左右平衡、混響、音色)
   */
  public static setPadMixing(
    parsed: YamahaFileParsed,
    padNum: number,
    params: {
      volume?: number;
      pan?: number;
      reverb?: number;
      chorus?: number;
      bankMsb?: number;
      bankLsb?: number;
      programChange?: number;
    }
  ): void {
    const track = parsed.tracks[padNum]; // Pad 1~4 對應 Track 1~4
    if (!track) return;

    let targetChannel = padNum - 1;
    // 取得該 Track 使用的 Channel
    const firstChanEv = track.events.find((e) => e.channel !== undefined);
    if (firstChanEv && firstChanEv.channel !== undefined) {
      targetChannel = firstChanEv.channel;
    }

    // 更新音量 (CC 7)
    if (params.volume !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 7, params.volume);
    }

    // 更新聲相 (CC 10)
    if (params.pan !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 10, params.pan);
    }

    // 更新混響 (CC 91)
    if (params.reverb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 91, params.reverb);
    }

    // 更新合唱 (CC 93)
    if (params.chorus !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 93, params.chorus);
    }

    // 更新 Bank MSB (CC 0)
    if (params.bankMsb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 0, params.bankMsb);
    }

    // 更新 Bank LSB (CC 32)
    if (params.bankLsb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 32, params.bankLsb);
    }

    // 更新 Program Change
    if (params.programChange !== undefined) {
      this.updateOrInsertPC(track, targetChannel, params.programChange);
    }

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
  }

  /**
   * 同步 Pad 控制標籤 (RP, CM, N1~N4, I1~I4) 至 Track 0
   * 遵循 Yamaha 官方 Multi Pad 標準規範與實機驗收鐵律：
   * - Track 0 開頭第 1 個事件必須為 CMxxxx，緊接著 RPxxxx、N1~N4、I1~I4 (皆為 Tick 0 之 Meta 0x01 Text Event)
   */
  public static syncControlTagsToTrack0(parsed: YamahaFileParsed): void {
    if (!parsed.padConfig || parsed.tracks.length === 0) return;
    const track0 = parsed.tracks[0];
    const cfg = parsed.padConfig;

    // 1. 先計算各事件的絕對 Tick，移除舊有的控制標籤 (RP, CM, N1~N4, I1~I4) 以及殘留的伴奏段落標記 (Meta 0x06/0x07 或 Intro, Main, Fill, Ending)，並嚴格保持剩餘事件的絕對時間軸 (Delta-Time 守恆)
    let curTick = 0;
    const annotated = track0.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev: { ...ev }, absTick: curTick, index };
    });

    const filtered = annotated.filter(({ ev }) => {
      if (ev.type === 'meta' && (ev.metaType === 1 || ev.metaType === 6 || ev.metaType === 7) && ev.text !== undefined) {
        const t = ev.text.trim();
        if (t.startsWith('RP') || t.startsWith('CM') || /^N[1-4]/.test(t) || /^I[1-4]/.test(t)) {
          return false;
        }
        // 若為 Multi Pad，排除殘留的 Style 段落標記 (包含 Meta 0x06/0x07 Marker 或 Intro/Main/Fill/Ending 文字)，避免琴端韌體誤判
        if (parsed.format === 'PAD') {
          if (ev.metaType === 6 || ev.metaType === 7) {
            return false;
          }
          const lower = t.toLowerCase();
          if (lower.startsWith('intro') || lower.startsWith('main') || lower.startsWith('fill') || lower.startsWith('ending')) {
            return false;
          }
        }
      }
      return true;
    });

    let prevTick = 0;
    track0.events = filtered.map((item) => {
      const delta = Math.max(0, item.absTick - prevTick);
      prevTick = item.absTick;
      item.ev.delta = delta;
      return item.ev;
    });

    // 2. 生成標籤字串 (Track 0 開頭第 1 個事件必須為 CMxxxx，接著 RPxxxx，再依序 N1~N4、I1~I4)
    const cmTag = `CM${cfg.chordMatchFlags.map((f) => (f ? '1' : '0')).join('')}`;
    const rpTag = `RP${cfg.repeatFlags.map((f) => (f ? '1' : '0')).join('')}`;

    const newControlEvents: MidiEvent[] = [
      this.createMarkerEvent(cmTag),
      this.createMarkerEvent(rpTag),
    ];

    for (let i = 0; i < 4; i++) {
      const num = i + 1;
      const name = cfg.names[i] || `Pad${num}`;
      newControlEvents.push(this.createMarkerEvent(`N${num}${name}`));
    }

    for (let i = 0; i < 4; i++) {
      const num = i + 1;
      const icon = cfg.icons[i] || 'S809';
      newControlEvents.push(this.createMarkerEvent(`I${num}${icon}`));
    }

    // 強制置於 Track 0 最開頭 (Index 0, Tick 0)
    track0.events.splice(0, 0, ...newControlEvents);

    // 重新編碼 Track 0 的 rawChunk
    this.rebuildTrackRawChunk(track0);
  }

  /**
   * 解析調性字串 (如 'Am', 'Em', 'C#m', 'Bbm', 'C', 'Eb' 等)，回傳標準調性定義
   */
  public static resolvePadKeyDefinition(keyStr: string): PadKeyDefinition {
    const clean = (keyStr || 'Am').trim();
    const aliasMap: Record<string, string> = {
      'a#m': 'Bbm', 'bbm': 'Bbm',
      'dbm': 'C#m', 'c#m': 'C#m',
      'd#m': 'Ebm', 'ebm': 'Ebm',
      'gbm': 'F#m', 'f#m': 'F#m',
      'abm': 'G#m', 'g#m': 'G#m',
      'c#': 'Db',   'db': 'Db',
      'd#': 'Eb',   'eb': 'Eb',
      'gb': 'F#',   'f#': 'F#',
      'g#': 'Ab',   'ab': 'Ab',
      'a#': 'Bb',   'bb': 'Bb',
    };
    const normalized = aliasMap[clean.toLowerCase()] || clean;
    const found = PAD_KEY_LIST.find(k => k.key.toLowerCase() === normalized.toLowerCase());
    return found || PAD_KEY_LIST[0]; // 預設回退至 Am
  }

  /**
   * 計算從「原曲基準調 (sourceKey)」平移至「目標調性 (targetKey)」的半音差
   */
  public static calculateSemitoneShift(
    sourceKey: string,
    targetKey: string,
    direction: 'up' | 'down' | 'auto' = 'auto',
    highestTrackPitch: number = 84,
    maxPitchLimit: number = 96
  ): {
    semitones: number;
    upSemitones: number;
    downSemitones: number;
    sourceDef: PadKeyDefinition;
    targetDef: PadKeyDefinition;
  } {
    const sourceDef = this.resolvePadKeyDefinition(sourceKey);
    const targetDef = this.resolvePadKeyDefinition(targetKey);
    const upSemitones = (targetDef.rootPc - sourceDef.rootPc + 12) % 12;
    const downSemitones = upSemitones === 0 ? 0 : upSemitones - 12;

    let semitones = upSemitones;
    if (direction === 'up') {
      semitones = upSemitones;
    } else if (direction === 'down') {
      semitones = downSemitones;
    } else {
      // 'auto': 只要向上平移後不超過 maxPitchLimit (預設 C7 = 96)，優先採向上平移以維持明亮音域 (如 Am ➔ Em 為 +7 半音)；
      // 若向上平移會衝破 maxPitchLimit，則改採向下平移 (如 -5 半音)
      if (highestTrackPitch + upSemitones <= maxPitchLimit) {
        semitones = upSemitones;
      } else {
        semitones = downSemitones;
      }
    }

    return {
      semitones,
      upSemitones,
      downSemitones,
      sourceDef,
      targetDef,
    };
  }

  /**
   * 全面診斷 Multi Pad (.PAD) 專案：
   * 1. 自動診斷 Pad 1 ~ Pad 4 各軌樂器音色、混音、音符音域、音級與「4 大經典音樂型態」
   * 2. 自動估算全檔「原曲基準調 (Estimated Source Key)」(供 UI 預填，使用者亦可隨時手動覆寫)
   */
  public static analyzePadProject(parsed: YamahaFileParsed): PadProjectDiagnosis {
    const noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const tracksDiagnosis: PadTrackDiagnosis[] = [];

    // 確保 padConfig 存在
    if (!parsed.padConfig) {
      parsed.padConfig = {
        names: ['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4'],
        icons: ['S809', 'S809', 'S809', 'S809'],
        repeatFlags: [false, false, false, false],
        chordMatchFlags: [false, false, false, false],
      };
    }

    // 全檔音級統計 (用於自動估算原曲基準調)
    const globalPcWeights = new Array(12).fill(0);
    const trackFinalPcs: number[] = [];
    const trackFirstPcs: number[] = [];
    const bar1DownbeatPcs: number[] = [];
    const firstBeatLimit = parsed.division || 96;

    for (let padNum = 1; padNum <= 4; padNum++) {
      const track = parsed.tracks[padNum];
      const name = parsed.padConfig.names[padNum - 1] || `Pad ${padNum}`;
      const icon = parsed.padConfig.icons[padNum - 1] || 'S809';
      const repeat = parsed.padConfig.repeatFlags[padNum - 1] ?? false;
      const chordMatch = parsed.padConfig.chordMatchFlags[padNum - 1] ?? false;

      if (!track || !track.events) {
        tracksDiagnosis.push({
          padNum,
          name,
          icon,
          repeat,
          chordMatch,
          channel: padNum - 1,
          noteCount: 0,
          barLength: 1,
          pitchMin: null,
          pitchMax: null,
          pitchRangeLabel: '無音符',
          distinctPitchClasses: [],
          distinctPitchNames: [],
          hasLeadingOrChromaticTone: false,
          musicalType: 'EMPTY',
          musicalTypeLabelZh: '空軌 (無音符)',
          recommendedChordMatch: false,
          hasChordMatchConflict: false,
          recommendationReasonZh: '此軌無音符，預設關閉 Chord Match',
          voiceInfo: { msb: 0, lsb: 0, pc: 0, voiceName: 'Grand Piano', category: 'Piano', panelCode: '0-0-1' },
          mixing: { volume: 100, pan: 64, expression: 127, reverb: 40, chorus: 0 },
        });
        continue;
      }

      // 提取通道、音色與混音 CC
      const firstChanEv = track.events.find(e => e.channel !== undefined);
      const channel = firstChanEv?.channel ?? (padNum - 1);

      const findCC = (ccNum: number, fallback: number): number => {
        const ev = track.events.find(e => e.type === 'controlChange' && e.controller === ccNum);
        return ev?.value !== undefined ? ev.value : fallback;
      };

      const msb = findCC(0, 0);
      const lsb = findCC(32, 0);
      const pcEv = track.events.find(e => e.type === 'programChange');
      const pc = pcEv?.program ?? 0;

      const resolvedVoice = resolveYamahaVoiceWithAlias(msb, lsb, pc);
      const voiceName = resolvedVoice?.voice ? resolvedVoice.voice.name : `Program ${pc + 1}`;
      const category = resolvedVoice?.voice ? resolvedVoice.voice.category : 'Synth';
      const panelCode = resolvedVoice ? resolvedVoice.panelCode : `${msb}-${lsb}-${pc + 1}`;

      const volume = findCC(7, 100);
      const pan = findCC(10, 64);
      const expression = findCC(11, 127);
      const reverb = findCC(91, 40);
      const chorus = findCC(93, 0);

      // 提取音符清單與小節數
      const notes = this.extractTrackNotes(track);
      const barLength = this.getPadBarLength(parsed, padNum);
      const noteCount = notes.length;

      if (noteCount === 0) {
        tracksDiagnosis.push({
          padNum,
          name,
          icon,
          repeat,
          chordMatch,
          channel,
          noteCount: 0,
          barLength,
          pitchMin: null,
          pitchMax: null,
          pitchRangeLabel: '無音符',
          distinctPitchClasses: [],
          distinctPitchNames: [],
          hasLeadingOrChromaticTone: false,
          musicalType: 'EMPTY',
          musicalTypeLabelZh: '空軌 (無音符)',
          recommendedChordMatch: false,
          hasChordMatchConflict: false,
          recommendationReasonZh: '此軌無發聲音符',
          voiceInfo: { msb, lsb, pc, voiceName, category, panelCode },
          mixing: { volume, pan, expression, reverb, chorus },
        });
        continue;
      }

      const pitches = notes.map(n => n.note);
      const pitchMin = Math.min(...pitches);
      const pitchMax = Math.max(...pitches);
      const minLabel = `${noteNames[pitchMin % 12]}${Math.floor(pitchMin / 12) - 1}`;
      const maxLabel = `${noteNames[pitchMax % 12]}${Math.floor(pitchMax / 12) - 1}`;
      const pitchRangeLabel = `${minLabel} (${pitchMin}) ~ ${maxLabel} (${pitchMax})`;

      const distinctPcs = Array.from(new Set(pitches.map(p => p % 12))).sort((a, b) => a - b);
      const distinctPitchNames = distinctPcs.map(pcVal => noteNames[pcVal]);

      const isDrumTrack = channel === 9 || msb === 126 || msb === 127 || category === 'Drums';

      // 若非鼓組，納入全曲調性統計
      if (!isDrumTrack) {
        for (const n of notes) {
          const pcVal = n.note % 12;
          // 依時長與力度加權
          const weight = Math.max(1, Math.round(n.durationTick / 120)) * (n.velocity / 64);
          globalPcWeights[pcVal] += weight;
        }
        trackFirstPcs.push(notes[0].note % 12);
        trackFinalPcs.push(notes[notes.length - 1].note % 12);
        if (notes[0].startTick < firstBeatLimit) {
          bar1DownbeatPcs.push(notes[0].note % 12);
        }
      }

      // 檢查是否含有半音階導音或非白鍵變化音 (或相鄰兩個半音，如 G#-A, F#-G#-A, D#-E)
      let adjSemitonesCount = 0;
      const pcSet = new Set(distinctPcs);
      for (const pVal of distinctPcs) {
        if (pcSet.has((pVal + 1) % 12)) {
          adjSemitonesCount++;
        }
      }
      const hasBlackKey = distinctPcs.some(pVal => [1, 3, 6, 8, 10].includes(pVal));
      const hasLeadingOrChromaticTone = hasBlackKey || adjSemitonesCount >= 3;

      // 判定 4 大音樂型態與 Chord Match 推薦鐵律
      let musicalType: PadMusicalType;
      let musicalTypeLabelZh: string;
      let recommendedChordMatch: boolean;
      let recommendationReasonZh: string;

      if (isDrumTrack) {
        musicalType = 'DRUM_SFX';
        musicalTypeLabelZh = '打擊節奏 / 音效 (Drums / SFX)';
        recommendedChordMatch = false;
        recommendationReasonZh = '打擊樂軌鐵律強制關閉 Chord Match (CM=0)，防止換和弦時鼓點音高錯亂';
      } else if (
        distinctPcs.length <= 2 &&
        distinctPcs.every(pVal => [0, 4, 7, 9].includes(pVal)) &&
        noteCount >= 8
      ) {
        // 如 Balloon.S910.pad 第 3 軌 (純 1、5 音 C 與 G 脈衝)
        musicalType = 'CHORD_TEXTURE';
        musicalTypeLabelZh = '純和弦織體 / 1、5音脈衝 (Chord Texture)';
        recommendedChordMatch = true;
        recommendationReasonZh = '純 1、5 音骨幹伴奏織體，適合開啟 Chord Match (CM=1) 隨左手即時跟隨和弦';
      } else if (barLength <= 2 && noteCount <= 8 && !hasBlackKey) {
        // 如 2011-2_PAD.PAD 第 1 軌 (2 小節 6 音符 E-D-B 開放骨幹音短動機)
        musicalType = 'SHORT_MOTIF';
        musicalTypeLabelZh = '開放骨幹音短動機 (Short Motif)';
        recommendedChordMatch = false;
        recommendationReasonZh = '短小骨幹音動機，建議關閉 Chord Match (CM=0) 避免被 C 大調 NTT 壓扁走音';
      } else {
        // 跨小節長旋律 / 完整前奏 (如 2010-1 空港 Pad 2/3，或 2011-2 Pad 3/4)
        musicalType = 'MELODY_INTRO';
        musicalTypeLabelZh = hasLeadingOrChromaticTone
          ? '完整前奏 / 帶導音花音長旋律 (Melody Intro with Leading Tone)'
          : '跨小節長旋律 / 前奏對位 (Long Melodic Phrase)';
        recommendedChordMatch = false;
        recommendationReasonZh = '長旋律/前奏鐵律強制關閉 Chord Match (CM=0)，請使用「指定調性剛體平移」以 100% 保留演歌導音與音程';
      }

      const hasChordMatchConflict =
        (musicalType === 'MELODY_INTRO' || musicalType === 'DRUM_SFX') && chordMatch === true;

      tracksDiagnosis.push({
        padNum,
        name,
        icon,
        repeat,
        chordMatch,
        channel,
        noteCount,
        barLength,
        pitchMin,
        pitchMax,
        pitchRangeLabel,
        distinctPitchClasses: distinctPcs,
        distinctPitchNames,
        hasLeadingOrChromaticTone,
        musicalType,
        musicalTypeLabelZh,
        recommendedChordMatch,
        hasChordMatchConflict,
        recommendationReasonZh,
        voiceInfo: { msb, lsb, pc, voiceName, category, panelCode },
        mixing: { volume, pan, expression, reverb, chorus },
      });
    }

    // 2. 自動估算全檔原曲基準調 (Estimated Source Key)
    const keyEst = this.estimatePadSourceKey(globalPcWeights, trackFirstPcs, trackFinalPcs, bar1DownbeatPcs);
    const hasLongMelody = tracksDiagnosis.some(t => t.musicalType === 'MELODY_INTRO');
    const enforcedRuleSummaryZh = hasLongMelody
      ? '偵測到跨小節完整前奏/長旋律軌：遵循實機鐵律，轉調時將自動鎖定 CM0000 並執行全軌純剛體半音平移，100% 保護和聲導音與旋律花音零失真。'
      : '各軌均為短動機或伴奏織體，可依需求切換固定調性平移或和弦跟隨。';

    return {
      estimatedKey: keyEst.key,
      estimatedKeyLabelZh: keyEst.labelZh,
      estimatedRootPc: keyEst.rootPc,
      estimatedIsMinor: keyEst.isMinor,
      keyConfidence: keyEst.confidence,
      keyDetectionReasonZh: keyEst.reasonZh,
      tracks: tracksDiagnosis,
      hasLongMelody,
      enforcedRuleSummaryZh,
    };
  }

  /**
   * 內部輔助：綜合音級權重、首拍強拍主音、和聲導音解決 (如 G#->A, D#->E) 與各軌收尾終止式 (全終止主音 / 半終止屬音)，自動估算原曲基準調
   */
  private static estimatePadSourceKey(
    pcWeights: number[],
    firstPcs: number[],
    finalPcs: number[],
    bar1DownbeatPcs: number[] = []
  ): { key: string; labelZh: string; rootPc: number; isMinor: boolean; confidence: number; reasonZh: string } {
    const totalWeight = pcWeights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) {
      const def = this.resolvePadKeyDefinition('C');
      return {
        key: def.key,
        labelZh: def.labelZh,
        rootPc: def.rootPc,
        isMinor: def.isMinor,
        confidence: 50,
        reasonZh: '無有效旋律音符，預設為 C 大調',
      };
    }

    // 對全部 24 個大小調評分
    // 自然小調音階半音偏移: [0, 2, 3, 5, 7, 8, 10]，另加和聲小調導音 (11) 與旋律小調大六度 (9)
    // 自然大調音階半音偏移: [0, 2, 4, 5, 7, 9, 11]
    let bestDef = PAD_KEY_LIST[0];
    let bestScore = -Infinity;
    let bestReason = '';

    for (const candidate of PAD_KEY_LIST) {
      const r = candidate.rootPc;
      let score = 0;
      const reasons: string[] = [];

      if (candidate.isMinor) {
        // 小調評分模型
        const tonicW = pcWeights[r];               // 1 (主音，如 Am 的 A)
        const supertonicW = pcWeights[(r + 2) % 12]; // 2 (如 B)
        const minorThirdW = pcWeights[(r + 3) % 12]; // b3 (小三度，如 C)
        const majorThirdW = pcWeights[(r + 4) % 12]; // 3 (大三度衝突音，如 C#)
        const fourthW = pcWeights[(r + 5) % 12];     // 4 (如 D)
        const fifthW = pcWeights[(r + 7) % 12];      // 5 (屬音，如 E)
        const minorSixthW = pcWeights[(r + 8) % 12]; // b6 (如 F)
        const majorSixthW = pcWeights[(r + 9) % 12]; // 6 (旋律小調大六度，如 F#)
        const minorSevW = pcWeights[(r + 10) % 12];  // b7 (如 G)
        const leadingToneW = pcWeights[(r + 11) % 12]; // 7 (和聲小調導音，如 G#)

        score += tonicW * 3.2 + fifthW * 2.5 + minorThirdW * 2.8 + fourthW * 1.5 + supertonicW * 1.4 + minorSixthW * 1.4 + minorSevW * 1.2;
        score -= majorThirdW * 3.5; // 大三度扣分

        // 和聲小調導音特徵加分 (同時有主音 r、小三度 r+3、屬音 r+7 與導音 r+11)
        if (leadingToneW > 0 && tonicW > 0 && minorThirdW > 0) {
          score += leadingToneW * 3.5 + totalWeight * 0.35;
          const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          reasons.push(`偵測到和聲小調導音 ${noteNames[(r + 11) % 12]} 解決至主音 ${noteNames[r]}`);
          if (majorSixthW > 0) {
            score += majorSixthW * 2.0 + totalWeight * 0.15;
            reasons.push(`含旋律小調大六度花音 ${noteNames[(r + 9) % 12]}`);
          }
        }

        // 收尾音 (Cadence) 落在主音或屬音強力加權
        const cadenceTonicCount = finalPcs.filter(pc => pc === r).length;
        const cadenceFifthCount = finalPcs.filter(pc => pc === (r + 7) % 12).length;
        if (cadenceTonicCount > 0) {
          score += totalWeight * (0.35 * cadenceTonicCount);
          reasons.push(`${cadenceTonicCount} 軌樂句尾音收束於主音`);
        } else if (cadenceFifthCount > 0) {
          score += totalWeight * (0.15 * cadenceFifthCount);
          reasons.push(`樂句半終止於屬音`);
        }

        // 首音落在主音或屬音加權
        const startTonicOrFifth = firstPcs.filter(pc => pc === r || pc === (r + 7) % 12).length;
        if (startTonicOrFifth > 0) {
          score += totalWeight * (0.12 * startTonicOrFifth);
        }
      } else {
        // 大調評分模型
        const tonicW = pcWeights[r];               // 1 (主音)
        const flatTwoW = pcWeights[(r + 1) % 12];    // b2 (調外衝突音)
        const supertonicW = pcWeights[(r + 2) % 12]; // 2
        const minorThirdW = pcWeights[(r + 3) % 12]; // b3 (小三度衝突音)
        const majorThirdW = pcWeights[(r + 4) % 12]; // 3 (大三度)
        const fourthW = pcWeights[(r + 5) % 12];     // 4 (完全四度，如 C 大調之 F)
        const tritoneW = pcWeights[(r + 6) % 12];    // #4 (增四度經過音)
        const fifthW = pcWeights[(r + 7) % 12];      // 5 (屬音)
        const flatSixW = pcWeights[(r + 8) % 12];    // b6 (調外衝突音)
        const majorSixthW = pcWeights[(r + 9) % 12]; // 6
        const flatSevenW = pcWeights[(r + 10) % 12]; // b7 (降七度衝突音，例如 G 大調若出現大量還原 F 則為 b7 衝突)
        const majorSevW = pcWeights[(r + 11) % 12];  // 7 (大七度導音)

        score += tonicW * 3.0 + fifthW * 2.4 + majorThirdW * 2.6 + fourthW * 1.6 + supertonicW * 1.3 + majorSixthW * 1.3 + majorSevW * 1.4;
        // 調外音扣分 (特別防範將 C 大調含少量 #4 經過音並半終止於 G 的樂句誤判為 G 大調)
        score -= minorThirdW * 3.5 + flatTwoW * 2.2 + flatSixW * 2.2 + flatSevenW * 2.6 + tritoneW * 1.1;
        if (flatSevenW > majorSevW) {
          score -= (flatSevenW - majorSevW) * 2.5;
        }

        // 第 1 小節第 1 拍強拍 (Downbeat) 起音於大調主音強力加權
        const downbeatTonicCount = bar1DownbeatPcs.filter(pc => pc === r).length;
        if (downbeatTonicCount > 0) {
          score += totalWeight * (0.25 * downbeatTonicCount);
          reasons.push(`${downbeatTonicCount} 軌於首拍強拍起音於大調主音`);
        }

        const cadenceTonicCount = finalPcs.filter(pc => pc === r).length;
        const cadenceFifthCount = finalPcs.filter(pc => pc === (r + 7) % 12).length;
        if (cadenceTonicCount > 0) {
          score += totalWeight * (0.28 * cadenceTonicCount);
          reasons.push(`${cadenceTonicCount} 軌樂句尾音收束於大調主音`);
        } else if (cadenceFifthCount > 0) {
          score += totalWeight * (0.18 * cadenceFifthCount);
          reasons.push(`${cadenceFifthCount} 軌樂句半終止於大調屬音 (Sol)`);
        }

        const startTonicCount = firstPcs.filter(pc => pc === r).length;
        if (startTonicCount > 0) {
          score += totalWeight * (0.15 * startTonicCount);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestDef = candidate;
        bestReason = reasons.length > 0
          ? `${reasons.join('、')}，判定原曲基準調為 ${candidate.labelZh}`
          : `依全軌音階分佈與骨幹音權重，估算原曲基準調為 ${candidate.labelZh}`;
      }
    }

    const confidence = Math.min(98, Math.max(60, Math.round((bestScore / (totalWeight * 4)) * 100)));
    return {
      key: bestDef.key,
      labelZh: bestDef.labelZh,
      rootPc: bestDef.rootPc,
      isMinor: bestDef.isMinor,
      confidence,
      reasonZh: bestReason,
    };
  }

  /**
   * 固定調性 PAD 純剛體半音平移引擎 (Pure Fixed-Key Transposition Engine)
   * 嚴格遵循 GEMINI.md 實機驗收鐵律：
   * 1. 支援自動估算或由使用者手動指定「原曲基準調 (sourceKey)」與「目標調性 (targetKey)」，或自訂半音偏移量
   * 2. 全軌音符執行純剛體半音平移 (Pure Semitone Pitch Shift)，100% 保留演歌導音 (G#->D#)、大六度花音 (F#->C#) 與所有裝飾音程
   * 3. 支援超過 C7 (MIDI 96) 之八度折返防呆保護
   * 4. 強制將 Track 0 開頭第 1 個事件鎖定為 CM0000 (關閉琴端自然小調吸附)，並在 N1~N4 自動標註目標調性後綴
   */
  public static transposePadKey(
    parsed: YamahaFileParsed,
    options: PadKeyTransposeOptions
  ): PadKeyTransposeResult {
    // 1. 確保基礎診斷與 padConfig 初始化
    const diagnosis = this.analyzePadProject(parsed);
    const effectiveSourceKey = options.sourceKey ? options.sourceKey.trim() : diagnosis.estimatedKey;
    const effectiveTargetKey = options.targetKey ? options.targetKey.trim() : effectiveSourceKey;

    const maxPitchLimit = options.maxPitchLimit ?? 96; // 預設 C7 (96)
    const minPitchLimit = options.minPitchLimit ?? 36; // 預設 C2 (36)
    const octaveWrapMode = options.octaveWrapMode ?? 'track';
    const enforceFixedKeyCM0000 = options.enforceFixedKeyCM0000 ?? true;
    const appendKeySuffixToNames = options.appendKeySuffixToNames ?? true;

    // 找出所有非鼓組軌的當前最高音，供 'auto' 方向判斷
    const melodyMaxPitches = diagnosis.tracks
      .filter(t => t.musicalType !== 'DRUM_SFX' && t.musicalType !== 'EMPTY' && t.pitchMax !== null)
      .map(t => t.pitchMax!);
    const globalHighestPitch = melodyMaxPitches.length > 0 ? Math.max(...melodyMaxPitches) : 84;

    // 2. 計算基準半音差
    let baseSemitoneShift = 0;
    if (options.customSemitones !== undefined) {
      baseSemitoneShift = Math.round(options.customSemitones);
    } else {
      const shiftInfo = this.calculateSemitoneShift(
        effectiveSourceKey,
        effectiveTargetKey,
        options.direction ?? 'auto',
        globalHighestPitch,
        maxPitchLimit
      );
      baseSemitoneShift = shiftInfo.semitones;
    }

    const targetPads = options.padNumbers ?? [1, 2, 3, 4];
    const trackResults: PadKeyTransposeResult['trackResults'] = [];

    // 3. 逐軌執行純剛體半音平移
    for (let padNum = 1; padNum <= 4; padNum++) {
      const trkDiag = diagnosis.tracks[padNum - 1];
      const track = parsed.tracks[padNum];

      if (!targetPads.includes(padNum)) {
        trackResults.push({
          padNum,
          skipped: true,
          reason: '未勾選此軌',
          noteCount: trkDiag?.noteCount ?? 0,
          appliedSemitones: 0,
          octaveWrapped: false,
          oldPitchRange: trkDiag && trkDiag.pitchMin !== null && trkDiag.pitchMax !== null ? [trkDiag.pitchMin, trkDiag.pitchMax] : null,
          newPitchRange: trkDiag && trkDiag.pitchMin !== null && trkDiag.pitchMax !== null ? [trkDiag.pitchMin, trkDiag.pitchMax] : null,
        });
        continue;
      }

      if (!track || !trkDiag || trkDiag.musicalType === 'EMPTY') {
        trackResults.push({
          padNum,
          skipped: true,
          reason: '空軌 (0 音符)',
          noteCount: 0,
          appliedSemitones: 0,
          octaveWrapped: false,
          oldPitchRange: null,
          newPitchRange: null,
        });
        continue;
      }

      if (trkDiag.musicalType === 'DRUM_SFX') {
        trackResults.push({
          padNum,
          skipped: true,
          reason: '打擊樂軌自動跳過移調',
          noteCount: trkDiag.noteCount,
          appliedSemitones: 0,
          octaveWrapped: false,
          oldPitchRange: [trkDiag.pitchMin!, trkDiag.pitchMax!],
          newPitchRange: [trkDiag.pitchMin!, trkDiag.pitchMax!],
        });
        continue;
      }

      const oldMin = trkDiag.pitchMin!;
      const oldMax = trkDiag.pitchMax!;
      let appliedSemitones = baseSemitoneShift;
      let octaveWrapped = false;

      // 整軌八度折返防呆保護 (保持整軌旋律線條連續不斷裂)
      if (octaveWrapMode === 'track') {
        while (oldMax + appliedSemitones > maxPitchLimit && appliedSemitones > -24) {
          appliedSemitones -= 12;
          octaveWrapped = true;
        }
        while (oldMin + appliedSemitones < minPitchLimit && appliedSemitones < 24) {
          appliedSemitones += 12;
          octaveWrapped = true;
        }
      }

      let newMin = 127;
      let newMax = 0;

      for (const ev of track.events) {
        if ((ev.type === 'noteOn' || ev.type === 'noteOff') && ev.noteNumber !== undefined) {
          let newPitch = ev.noteNumber + appliedSemitones;
          if (octaveWrapMode === 'note') {
            while (newPitch > maxPitchLimit) {
              newPitch -= 12;
              octaveWrapped = true;
            }
            while (newPitch < minPitchLimit) {
              newPitch += 12;
              octaveWrapped = true;
            }
          }
          newPitch = Math.max(0, Math.min(127, newPitch));
          ev.noteNumber = newPitch;
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            if (newPitch < newMin) newMin = newPitch;
            if (newPitch > newMax) newMax = newPitch;
          }
        }
      }

      // 重建該軌 MTrk 二進位資料
      this.rebuildTrackRawChunk(track);

      trackResults.push({
        padNum,
        skipped: false,
        noteCount: trkDiag.noteCount,
        appliedSemitones,
        octaveWrapped,
        oldPitchRange: [oldMin, oldMax],
        newPitchRange: newMin <= newMax ? [newMin, newMax] : [oldMin, oldMax],
      });
    }

    // 4. 強制鎖定 CM0000 (關閉全數 Chord Match) 與更新 N1~N4 調性後綴
    if (enforceFixedKeyCM0000 && parsed.padConfig) {
      parsed.padConfig.chordMatchFlags = [false, false, false, false];
    }

    if (appendKeySuffixToNames && parsed.padConfig) {
      const suffix = (options.keySuffixLabel || effectiveTargetKey).trim();
      if (suffix) {
        parsed.padConfig.names = parsed.padConfig.names.map((rawName, idx) => {
          const padNum = idx + 1;
          if (!targetPads.includes(padNum)) return rawName || `Pad ${padNum}`;
          const baseName = (rawName || `Pad ${padNum}`)
            .replace(/\s*\([^)]*\)\s*$/, '') // 移除舊有的 (Am)、(Em原調) 等後綴，避免多次轉調重複疊加
            .trim();
          return `${baseName} (${suffix})`;
        });
      }
    }

    // 5. 同步寫入 Track 0 最開頭並重建 Track 0 二進位
    this.syncControlTagsToTrack0(parsed);

    const cfg = parsed.padConfig!;
    const cmTag = `CM${cfg.chordMatchFlags.map(f => (f ? '1' : '0')).join('')}`;
    const rpTag = `RP${cfg.repeatFlags.map(f => (f ? '1' : '0')).join('')}`;

    return {
      success: true,
      sourceKey: effectiveSourceKey,
      targetKey: effectiveTargetKey,
      baseSemitoneShift,
      cmTag,
      rpTag,
      padNames: [...cfg.names],
      trackResults,
    };
  }

  /**
   * 一鍵清空指定 Pad (1~4) 的所有音符事件，保留該軌的音色與混音設定 (成為 0 音符空軌)
   */
  public static clearPadTrackNotes(parsed: YamahaFileParsed, padNum: number): boolean {
    if (padNum < 1 || padNum > 4) return false;
    return this.replacePadNotes(parsed, padNum, [], 1);
  }

  /**
   * 將來源 Pad (sourcePadNum 1~4) 的所有音符、音色 (MSB/LSB/PC)、混音 (Vol/Pan/Rev/Cho) 與小節數
   * 完整複製到目標 Pad (targetPadNum 1~4)，可選同時執行八度移位 (octaveShift: -1 | 0 | 1) 以製作雙軌疊音
   */
  public static clonePadTrack(
    parsed: YamahaFileParsed,
    sourcePadNum: number,
    targetPadNum: number,
    options?: { octaveShift?: number }
  ): { success: boolean; copiedNoteCount: number } {
    if (
      sourcePadNum < 1 ||
      sourcePadNum > 4 ||
      targetPadNum < 1 ||
      targetPadNum > 4 ||
      sourcePadNum === targetPadNum
    ) {
      return { success: false, copiedNoteCount: 0 };
    }

    const diag = this.analyzePadProject(parsed);
    const srcDiag = diag.tracks[sourcePadNum - 1];
    if (!srcDiag) return { success: false, copiedNoteCount: 0 };

    const srcNotes = this.extractTrackNotes(parsed.tracks[sourcePadNum]);
    const semitoneOffset = (options?.octaveShift ?? 0) * 12;
    const clonedNotes = srcNotes.map(n => ({
      note: Math.max(0, Math.min(127, n.note + semitoneOffset)),
      startTick: n.startTick,
      durationTick: n.durationTick,
      velocity: n.velocity,
    }));

    // 1. 複製音色與混音設定至目標 Pad
    this.setPadMixing(parsed, targetPadNum, {
      bankMsb: srcDiag.voiceInfo.msb,
      bankLsb: srcDiag.voiceInfo.lsb,
      programChange: srcDiag.voiceInfo.pc,
      volume: srcDiag.mixing.volume,
      pan: srcDiag.mixing.pan,
      reverb: srcDiag.mixing.reverb,
      chorus: srcDiag.mixing.chorus,
    });

    // 2. 複製音符與小節長度
    this.replacePadNotes(parsed, targetPadNum, clonedNotes, srcDiag.barLength);

    // 3. 複製 Repeat 與 ChordMatch 屬性並更新名稱標記
    this.setPadRepeat(parsed, targetPadNum, srcDiag.repeat);
    this.setPadChordMatch(parsed, targetPadNum, srcDiag.chordMatch);
    this.setPadIcon(parsed, targetPadNum, srcDiag.icon);
    const baseSrcName = srcDiag.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    this.setPadName(parsed, targetPadNum, `${baseSrcName} Copy`);

    return { success: true, copiedNoteCount: clonedNotes.length };
  }

  private static createMarkerEvent(text: string): MidiEvent {
    const encoder = new TextEncoder();
    const metaData = encoder.encode(text);
    return {
      delta: 0,
      type: 'meta',
      metaType: 1, // Yamaha Multi Pad 官方標準為 Meta 0x01 (Text Event)
      text,
      metaData,
    };
  }

  private static updateOrInsertCC(track: MidiTrack, channel: number, controller: number, value: number): void {
    const matching = track.events.filter(
      (e) => e.type === 'controlChange' && e.controller === controller
    );
    if (matching.length > 0) {
      for (const ev of matching) {
        ev.value = value;
        ev.channel = channel;
      }
    } else {
      // 插入在第一個 NoteOn 之前
      const firstNoteIdx = track.events.findIndex((e) => e.type === 'noteOn');
      const insertIdx = firstNoteIdx >= 0 ? firstNoteIdx : 0;
      track.events.splice(insertIdx, 0, {
        delta: 0,
        type: 'controlChange',
        channel,
        controller,
        value,
      });
    }
  }

  private static updateOrInsertPC(track: MidiTrack, channel: number, program: number): void {
    const matching = track.events.filter(
      (e) => e.type === 'programChange'
    );
    if (matching.length > 0) {
      for (const ev of matching) {
        ev.program = program;
        ev.channel = channel;
      }
    } else {
      const firstNoteIdx = track.events.findIndex((e) => e.type === 'noteOn');
      const insertIdx = firstNoteIdx >= 0 ? firstNoteIdx : 0;
      track.events.splice(insertIdx, 0, {
        delta: 0,
        type: 'programChange',
        channel,
        program,
      });
    }
  }

  /**
   * 更新指定 Pad 音軌中特定音符的力度 (Velocity)、長度 (Duration Ticks)、起始位置 (Start Tick) 或音高 (Note Number)
   */
  public static updateNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    target: { note: number; startTick: number; oldDurationTick: number },
    updates: { velocity?: number; durationTick?: number; startTick?: number; note?: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 尋找目標 Note-On 事件
    const onEntry = annotated.find(
      (item) =>
        item.absTick === target.startTick &&
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === target.note &&
        (item.ev.velocity ?? 0) > 0
    );
    if (!onEntry) return false;

    // 尋找對應的 Note-Off 事件 (Note-Off 或 Note-On with vel=0)
    let offEntry = annotated.find(
      (item) =>
        item.index > onEntry.index &&
        item.absTick === target.startTick + target.oldDurationTick &&
        item.ev.noteNumber === target.note &&
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
    );

    if (!offEntry) {
      // 容錯備用：找第一個在此 Note-On 之後的 Note-Off
      offEntry = annotated.find(
        (item) =>
          item.index > onEntry.index &&
          item.ev.noteNumber === target.note &&
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
      );
    }

    let modified = false;

    // 計算當前有效音長 (供移動起始位置時保持音長)
    const effectiveDur = updates.durationTick !== undefined
      ? Math.max(1, Math.round(updates.durationTick))
      : (offEntry ? offEntry.absTick - onEntry.absTick : target.oldDurationTick);

    // 更新力度 (Velocity)
    if (updates.velocity !== undefined) {
      const newVel = Math.max(1, Math.min(127, Math.round(updates.velocity)));
      onEntry.ev.velocity = newVel;
      modified = true;
    }

    // 更新音高 (Note Number)
    if (updates.note !== undefined) {
      const newNote = Math.max(0, Math.min(127, Math.round(updates.note)));
      onEntry.ev.noteNumber = newNote;
      if (offEntry) offEntry.ev.noteNumber = newNote;
      modified = true;
    }

    // 更新起始位置 (Start Tick)
    if (updates.startTick !== undefined) {
      const newStart = Math.max(0, Math.round(updates.startTick));
      onEntry.absTick = newStart;
      if (offEntry) offEntry.absTick = newStart + effectiveDur;
      modified = true;
    } else if (updates.durationTick !== undefined && offEntry) {
      // 若只更新音長，不變更起始位置
      offEntry.absTick = onEntry.absTick + effectiveDur;
      modified = true;
    }

    if (!modified) return false;

    // 保證 End of Track (0x2F) 不早於任何事件
    const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (endMeta) {
      for (const item of annotated) {
        if (item.ev !== endMeta.ev && item.absTick > endMeta.absTick) {
          endMeta.absTick = item.absTick;
        }
      }
    }

    // 依據 absTick 重新排序，若 absTick 相同則維持原有相對順序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 刪除指定 Pad 音軌中特定音符 (移除其 Note-On 與對應之 Note-Off，並重新計算 Delta Times 與 RawChunk)
   */
  public static deleteNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    target: { note: number; startTick: number; oldDurationTick: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 尋找目標 Note-On
    const onEntry = annotated.find(
      (item) =>
        item.absTick === target.startTick &&
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === target.note &&
        (item.ev.velocity ?? 0) > 0
    );
    if (!onEntry) return false;

    // 尋找對應 Note-Off
    let offEntry = annotated.find(
      (item) =>
        item.index > onEntry.index &&
        item.absTick === target.startTick + target.oldDurationTick &&
        item.ev.noteNumber === target.note &&
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
    );

    if (!offEntry) {
      offEntry = annotated.find(
        (item) =>
          item.index > onEntry.index &&
          item.ev.noteNumber === target.note &&
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
      );
    }

    // 過濾掉 onEntry 與 offEntry
    const remaining = annotated.filter((item) => item !== onEntry && item !== offEntry);

    // 依據 absTick 重新排序
    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = remaining.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 批次更新指定 Pad 音軌中多顆音符 (支援批次修改音高、力度、時值、起始位置)
   * 採用單次標註、批次更新、末端一次性重新計算 Delta-Time 與重構 RawChunk，確保極致效能
   */
  public static batchUpdateNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    items: Array<{
      target: { note: number; startTick: number; oldDurationTick: number };
      updates: { velocity?: number; durationTick?: number; startTick?: number; note?: number };
    }>
  ): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || items.length === 0) return 0;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    let updatedCount = 0;

    for (const item of items) {
      const { target, updates } = item;
      // 尋找目標 Note-On
      const onEntry = annotated.find(
        (entry) =>
          entry.absTick === target.startTick &&
          entry.ev.type === 'noteOn' &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.velocity ?? 0) > 0
      );
      if (!onEntry) continue;

      // 尋找對應 Note-Off
      let offEntry = annotated.find(
        (entry) =>
          entry.index > onEntry.index &&
          entry.absTick === target.startTick + target.oldDurationTick &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
      );
      if (!offEntry) {
        offEntry = annotated.find(
          (entry) =>
            entry.index > onEntry.index &&
            entry.ev.noteNumber === target.note &&
            (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
        );
      }

      let modified = false;
      const effectiveDur = updates.durationTick !== undefined
        ? Math.max(1, Math.round(updates.durationTick))
        : (offEntry ? offEntry.absTick - onEntry.absTick : target.oldDurationTick);

      if (updates.velocity !== undefined) {
        onEntry.ev.velocity = Math.max(1, Math.min(127, Math.round(updates.velocity)));
        modified = true;
      }

      if (updates.note !== undefined) {
        const newNote = Math.max(0, Math.min(127, Math.round(updates.note)));
        onEntry.ev.noteNumber = newNote;
        if (offEntry) offEntry.ev.noteNumber = newNote;
        modified = true;
      }

      if (updates.startTick !== undefined) {
        const newStart = Math.max(0, Math.round(updates.startTick));
        onEntry.absTick = newStart;
        if (offEntry) offEntry.absTick = newStart + effectiveDur;
        modified = true;
      } else if (updates.durationTick !== undefined && offEntry) {
        offEntry.absTick = onEntry.absTick + effectiveDur;
        modified = true;
      }

      if (modified) {
        updatedCount++;
      }
    }

    if (updatedCount === 0) return 0;

    // 保證 End of Track (0x2F) 不早於任何事件
    const endMeta = annotated.find((entry) => entry.ev.type === 'meta' && entry.ev.metaType === 0x2f);
    if (endMeta) {
      for (const entry of annotated) {
        if (entry.ev !== endMeta.ev && entry.absTick > endMeta.absTick) {
          endMeta.absTick = entry.absTick;
        }
      }
    }

    // 依據 absTick 重新排序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = annotated.map((entry) => {
      const delta = entry.absTick - prevTick;
      prevTick = entry.absTick;
      entry.ev.delta = Math.max(0, delta);
      return entry.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return updatedCount;
  }

  /**
   * 批次刪除指定 Pad 音軌中多顆音符
   */
  public static batchDeleteNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    targets: Array<{ note: number; startTick: number; oldDurationTick: number }>
  ): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || targets.length === 0) return 0;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const entriesToRemove = new Set<any>();
    let deletedCount = 0;

    for (const target of targets) {
      const onEntry = annotated.find(
        (entry) =>
          !entriesToRemove.has(entry) &&
          entry.absTick === target.startTick &&
          entry.ev.type === 'noteOn' &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.velocity ?? 0) > 0
      );
      if (!onEntry) continue;

      let offEntry = annotated.find(
        (entry) =>
          !entriesToRemove.has(entry) &&
          entry.index > onEntry.index &&
          entry.absTick === target.startTick + target.oldDurationTick &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
      );
      if (!offEntry) {
        offEntry = annotated.find(
          (entry) =>
            !entriesToRemove.has(entry) &&
            entry.index > onEntry.index &&
            entry.ev.noteNumber === target.note &&
            (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
        );
      }

      entriesToRemove.add(onEntry);
      if (offEntry) entriesToRemove.add(offEntry);
      deletedCount++;
    }

    if (deletedCount === 0) return 0;

    const remaining = annotated.filter((entry) => !entriesToRemove.has(entry));

    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = remaining.map((entry) => {
      const delta = entry.absTick - prevTick;
      prevTick = entry.absTick;
      entry.ev.delta = Math.max(0, delta);
      return entry.ev;
    });

    this.rebuildTrackRawChunk(track);
    return deletedCount;
  }

  /**
   * 在指定 Pad 音軌中新增一顆音符 (自動配置 Channel、Note-On 與 Note-Off，並重新排序 Delta Times 與 RawChunk)
   */
  public static addNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    newNote: { note: number; startTick: number; durationTick: number; velocity: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    // 確定此軌道使用的 channel (預設為 padNum - 1 或現存事件的 channel)
    let channel = padNum - 1;
    for (const ev of track.events) {
      if (ev.channel !== undefined) {
        channel = ev.channel;
        break;
      }
    }

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const noteNum = Math.max(0, Math.min(127, Math.round(newNote.note)));
    const vel = Math.max(1, Math.min(127, Math.round(newNote.velocity)));
    const startTick = Math.max(0, Math.round(newNote.startTick));
    const durTick = Math.max(1, Math.round(newNote.durationTick));
    const endTick = startTick + durTick;

    // 核心防護：避免在同一個時間點 (absTick) 與相同音高 (noteNumber) 重複插入 Note-On 事件
    const alreadyExists = annotated.some(
      (item) =>
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === noteNum &&
        item.absTick === startTick &&
        (item.ev.velocity ?? 0) > 0
    );
    if (alreadyExists) {
      return false;
    }

    // 建立 Note-On 事件
    const onEv: MidiEvent = {
      delta: 0,
      type: 'noteOn',
      channel,
      noteNumber: noteNum,
      velocity: vel,
    };

    // 建立 Note-Off 事件
    const offEv: MidiEvent = {
      delta: 0,
      type: 'noteOff',
      channel,
      noteNumber: noteNum,
      velocity: 0,
    };

    const newIndexBase = annotated.length + 10;
    annotated.push({ ev: onEv, absTick: startTick, index: newIndexBase });
    annotated.push({ ev: offEv, absTick: endTick, index: newIndexBase + 1 });

    // 確保 End of Track (0x2F) 在最後
    const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (endMeta && endTick > endMeta.absTick) {
      endMeta.absTick = endTick;
    }

    // 依據 absTick 重新排序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      // Meta 0x2F 永遠置於最後
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      // Note-Off 優先於 Note-On
      if ((a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) && (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)) {
        return -1;
      }
      if ((b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) && (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 整軌替換 Pad 音符 (適用於即時錄音寫入、MIDI 切片置換)：
   * 保留該軌道之所有控制事件 (Program Change, Bank Select, Volume, Pan 等)，
   * 將原音符清除並批次填入新音符序列，自動設定 End of Track 與重編二進位資料。
   */
  public static replacePadNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    notes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }>,
    totalBars?: number
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let channel = padNum - 1;
    for (const ev of track.events) {
      if (ev.channel !== undefined) {
        channel = ev.channel;
        break;
      }
    }

    // 保留非音符事件 (Program Change, CC, Pitch Bend, Meta 等)
    let curTick = 0;
    const nonNoteEntries: Array<{ ev: any; absTick: number }> = [];
    for (const ev of track.events) {
      curTick += ev.delta;
      const isNote = ev.type === 'noteOn' || ev.type === 'noteOff';
      const isEndOfTrack = ev.type === 'meta' && ev.metaType === 0x2f;
      if (!isNote && !isEndOfTrack) {
        nonNoteEntries.push({ ev: { ...ev }, absTick: curTick });
      }
    }

    // 生成新音符事件之 Note-On 與 Note-Off
    const newNoteEntries: Array<{ ev: any; absTick: number }> = [];
    for (const n of notes) {
      const noteNum = Math.max(0, Math.min(127, Math.round(n.note)));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
      const sTick = Math.max(0, Math.round(n.startTick));
      const dur = Math.max(1, Math.round(n.durationTick));
      const eTick = sTick + dur;

      newNoteEntries.push({
        ev: { delta: 0, type: 'noteOn', channel, noteNumber: noteNum, velocity: vel },
        absTick: sTick,
      });
      newNoteEntries.push({
        ev: { delta: 0, type: 'noteOff', channel, noteNumber: noteNum, velocity: 0 },
        absTick: eTick,
      });
    }

    // 合併並排序
    const allEntries = [...nonNoteEntries, ...newNoteEntries];
    allEntries.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      const aIsOff = a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) === 0);
      const bIsOff = b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) === 0);
      if (aIsOff && !bIsOff) return -1;
      if (!aIsOff && bIsOff) return 1;
      return 0;
    });

    // 計算小節長度
    const ppq = parsed.division || 480;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = ppq * beatsPerBar;
    let maxTick = 0;
    for (const item of allEntries) {
      if (item.absTick > maxTick) maxTick = item.absTick;
    }

    const bars = totalBars || Math.max(1, Math.ceil(maxTick / ticksPerBar));
    const targetEndTick = Math.max(maxTick, bars * ticksPerBar);

    // 加入 End of Track Meta
    allEntries.push({
      ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) },
      absTick: targetEndTick,
    });

    // 重新計算 delta
    let prevTick = 0;
    track.events = allEntries.map((item) => {
      const delta = Math.max(0, item.absTick - prevTick);
      prevTick = item.absTick;
      item.ev.delta = delta;
      return item.ev;
    });

    // 重新編碼 rawChunk
    this.rebuildTrackRawChunk(track);

    // 同步更新 Section 資訊
    const secIdx = padNum - 1;
    if (parsed.sections && parsed.sections[secIdx]) {
      parsed.sections[secIdx].measureCount = bars;
    }

    return true;
  }

  /**
   * 替換指定 Pad 音軌中特定控制器 (CC) 的自動化事件流 (如 CC 11 表情、CC 1 顫音、CC 64 延音、CC 74 亮度等)
   * 遵循 Yamaha Multi Pad 二進位規範：
   * - 保留所有 NoteOn/NoteOff、Program Change、Pitch Bend 與其他不同 controller 的事件
   * - 移除該 Track 內所有同 controller 的舊 CC 事件
   * - 注入新的 CC 事件流，依據 absTick 嚴格排序並重新計算 Delta Times 與 RawChunk
   */
  public static replacePadCCEvents(
    parsed: YamahaFileParsed,
    padNum: number,
    controller: number,
    ccEvents: Array<{ relTick: number; value: number }>
  ): boolean {
    if (padNum < 1 || padNum > 4) return false;
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let channel = padNum - 1;
    for (const ev of track.events) {
      if (ev.channel !== undefined) {
        channel = ev.channel;
        break;
      }
    }

    // 1. 標註現有事件的絕對 Tick，並清除該 Pad 軌中同類別的舊 CC 事件
    let curTick = 0;
    const keptEvents: Array<{ ev: MidiEvent; absTick: number; index: number }> = [];
    track.events.forEach((ev, idx) => {
      curTick += ev.delta;
      const isTargetCC =
        ev.type === 'controlChange' &&
        ev.controller === controller;

      if (isTargetCC) {
        // 清除舊的同控制器事件
        return;
      }
      keptEvents.push({ ev: { ...ev }, absTick: curTick, index: idx });
    });

    // 2. 加入新的 CC 控制器事件
    let virtualIndex = 9600000;
    for (const c of ccEvents) {
      const absTick = Math.max(0, Math.round(c.relTick));
      const val = Math.max(0, Math.min(127, Math.round(c.value)));

      keptEvents.push({
        ev: { delta: 0, type: 'controlChange', channel, controller, value: val },
        absTick,
        index: virtualIndex++,
      });
    }

    // 3. 確保 End of Track 不早於任何新事件
    const endMeta = keptEvents.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (endMeta) {
      for (const item of keptEvents) {
        if (item.ev !== endMeta.ev && item.absTick > endMeta.absTick) {
          endMeta.absTick = item.absTick;
        }
      }
    }

    // 4. 按時間排序 (若 absTick 相同，End of Track 確保在最後)
    keptEvents.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      return a.index - b.index;
    });

    // 5. 重新計算 Delta-times
    let prev = 0;
    track.events = keptEvents.map((item) => {
      const delta = Math.max(0, item.absTick - prev);
      prev = item.absTick;
      item.ev.delta = delta;
      return item.ev;
    });

    // 6. 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 清理並消除音軌中重複堆疊的 Note-On 與多餘的 Note-Off 事件，防止重疊幽靈音符
   * @returns boolean 是否進行了實質清理與重新計算
   */
  public static sanitizeTrackDuplicateNotes(track: MidiTrack): boolean {
    if (!track || !track.events || track.events.length === 0) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const activeCounts = new Map<string, number>();
    const seenNoteOnTicks = new Set<string>();
    const kept: typeof annotated = [];
    let modified = false;

    for (const item of annotated) {
      const ev = item.ev;
      const ch = ev.channel ?? 0;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.noteNumber !== undefined) {
        const key = `${ch}_${ev.noteNumber}_${item.absTick}`;
        if (seenNoteOnTicks.has(key)) {
          // 同一通道、同一音高且完全同一個起始 Tick，視為重複 Note-On，予以剃除
          modified = true;
          continue;
        }
        seenNoteOnTicks.add(key);
        const countKey = `${ch}_${ev.noteNumber}`;
        activeCounts.set(countKey, (activeCounts.get(countKey) || 0) + 1);
        kept.push(item);
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const countKey = `${ch}_${ev.noteNumber}`;
        const count = activeCounts.get(countKey) || 0;
        if (count <= 0) {
          // 沒有對應進行中的 Note-On，此為孤立/重複 Note-Off，予以剃除
          modified = true;
          continue;
        }
        activeCounts.set(countKey, count - 1);
        kept.push(item);
      } else {
        kept.push(item);
      }
    }

    if (!modified) return false;

    // 重新排序並維持 Meta 0x2F 在最後
    kept.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      if ((a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) && (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)) {
        return -1;
      }
      if ((b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) && (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = kept.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 取得指定 Pad 當前的總小節數 (綜合考量音符範圍、End-of-Track 與 Section 標記)
   */
  public static getPadBarLength(parsed: YamahaFileParsed, padNum: number): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return 4;

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    let curTick = 0;
    const noteTicks: { start: number; end: number }[] = [];
    const active = new Map<number, number>();
    let endOfTrackTick = 0;

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        active.set(ev.noteNumber, curTick);
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = active.get(ev.noteNumber);
        if (st !== undefined) {
          noteTicks.push({ start: st, end: curTick });
          active.delete(ev.noteNumber);
        }
      } else if (ev.type === 'meta' && ev.metaType === 0x2f) {
        endOfTrackTick = curTick;
      }
    }

    if (noteTicks.length === 0) {
      const sec = parsed.sections ? parsed.sections[padNum - 1] : undefined;
      if (sec && sec.measureCount) return sec.measureCount;
      if (endOfTrackTick > 0) return Math.max(1, Math.round(endOfTrackTick / ticksPerBar));
      return 4;
    }

    const firstNoteTick = Math.min(...noteTicks.map((n) => n.start));
    const lastNoteTick = Math.max(...noteTicks.map((n) => n.end));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const notesBars = Math.max(1, Math.ceil((lastNoteTick - gridStartTick) / ticksPerBar));
    const endMetaBars = endOfTrackTick > gridStartTick
      ? Math.max(1, Math.round((endOfTrackTick - gridStartTick) / ticksPerBar))
      : 1;

    if (endOfTrackTick > gridStartTick) {
      return Math.max(notesBars, endMetaBars);
    }

    const sec = parsed.sections ? parsed.sections[padNum - 1] : undefined;
    const secBars = sec && sec.measureCount ? sec.measureCount : 1;

    return Math.max(notesBars, secBars);
  }

  /**
   * 設定指定 Pad 的總小節數 (透過重算並推移 End-of-Track 標記，同步更新二進位 RawChunk 與 Section 標記)
   */
  public static setPadBarLength(parsed: YamahaFileParsed, padNum: number, targetBars: number): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    const newBars = Math.max(1, Math.min(64, Math.round(targetBars)));
    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const noteStarts = annotated
      .filter((i) => i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) > 0)
      .map((i) => i.absTick);
    const firstNoteTick = noteStarts.length > 0 ? Math.min(...noteStarts) : 0;
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    let targetEndTick = gridStartTick + newBars * ticksPerBar;

    // 尋找 End of Track (Meta 0x2F)
    let endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (!endMeta) {
      const eotEv: MidiEvent = {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      };
      endMeta = { ev: eotEv, absTick: targetEndTick, index: annotated.length + 999 };
      annotated.push(endMeta);
    } else {
      endMeta.absTick = targetEndTick;
    }

    // 保證 End of Track 不早於任何現存音符事件
    for (const item of annotated) {
      if (item !== endMeta && item.absTick > endMeta.absTick) {
        endMeta.absTick = item.absTick;
      }
    }

    // 重新排序並計算 delta-time
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 同步更新 parsed.sections
    if (parsed.sections && parsed.sections[padNum - 1]) {
      parsed.sections[padNum - 1].measureCount = newBars;
      parsed.sections[padNum - 1].endTick = targetEndTick;
    }

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 複製指定 Pad 的特定小節音符至目標小節 (支援 1➔3、1➔5 等跳小節複製，自動擴展總小節數)
   */
  public static copyPadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    sourceBar: number, // 1-indexed, 例如 1
    targetBar: number, // 1-indexed, 例如 3 或 5
    mode: 'replace' | 'insert' | 'merge' = 'replace'
  ): { success: boolean; copiedCount: number; newTotalBars: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return { success: false, copiedCount: 0, newTotalBars: 1 };
    if (sourceBar <= 0 || targetBar <= 0 || (sourceBar === targetBar && mode !== 'insert')) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    // 提取當前軌道的所有 Note 事件
    let curTick = 0;
    const noteList: { note: number; velocity: number; startTick: number; durationTick: number }[] = [];
    const active = new Map<number, { tick: number; velocity: number }>();

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        active.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = active.get(ev.noteNumber);
        if (st !== undefined) {
          noteList.push({
            note: ev.noteNumber,
            velocity: st.velocity,
            startTick: st.tick,
            durationTick: Math.max(curTick - st.tick, 1),
          });
          active.delete(ev.noteNumber);
        }
      }
    }

    if (noteList.length === 0) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const firstNoteTick = Math.min(...noteList.map((n) => n.startTick));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const sourceStartTick = gridStartTick + (sourceBar - 1) * ticksPerBar;
    const sourceEndTick = sourceStartTick + ticksPerBar;

    // 找出在 sourceBar 內起奏的所有音符
    const sourceNotes = noteList.filter(
      (n) => n.startTick >= sourceStartTick && n.startTick < sourceEndTick
    );

    if (sourceNotes.length === 0) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const targetStartTick = gridStartTick + (targetBar - 1) * ticksPerBar;
    const targetEndTick = targetStartTick + ticksPerBar;
    const curPadLen = this.getPadBarLength(parsed, padNum);

    // 模式 C：插入順移模式 (Insert / Ripple Paste)
    if (mode === 'insert') {
      if (targetBar <= curPadLen) {
        // 將 targetStartTick 及之後的所有事件向後順移 ticksPerBar (+1 小節)
        let evTick = 0;
        const annotated = track.events.map((ev, index) => {
          evTick += ev.delta;
          return { ev, absTick: evTick, index };
        });

        const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);

        // 嚴謹配對 Note-On 與 Note-Off，防止先前小節在邊界處結束之音符其 Note-Off 被誤推移
        const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
        const noteItemsToShift = new Set<any>();

        for (const item of annotated) {
          if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
            activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
          } else if (
            (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
            item.ev.noteNumber !== undefined
          ) {
            const st = activeNotes.get(item.ev.noteNumber);
            if (st !== undefined) {
              if (st.absTick >= targetStartTick) {
                // 音符起奏於 targetStartTick 之後，Note-On 與 Note-Off 皆向後順移
                const onEntry = annotated.find((x) => x.index === st.onIndex);
                if (onEntry) noteItemsToShift.add(onEntry);
                noteItemsToShift.add(item);
              } else if (item.absTick > targetStartTick) {
                // 音符起奏於先前小節，但在 targetStartTick 之後才結束（跨小節），截斷於邊界處
                item.absTick = targetStartTick;
              }
              activeNotes.delete(item.ev.noteNumber);
            }
          }
        }

        // 對已標記的音符事件與非音符事件執行順移
        for (const item of annotated) {
          const isNote = item.ev.type === 'noteOn' || item.ev.type === 'noteOff';
          if (isNote) {
            if (noteItemsToShift.has(item)) {
              item.absTick += ticksPerBar;
            }
          } else if (item.absTick >= targetStartTick && item.absTick > 0 && !(item.ev.type === 'meta' && item.ev.metaType === 0x2f)) {
            item.absTick += ticksPerBar;
          }
        }

        const newTotalBars = curPadLen + 1;
        const newEndTick = gridStartTick + newTotalBars * ticksPerBar;
        if (endMeta && endMeta.absTick < newEndTick) {
          endMeta.absTick = newEndTick;
        }

        // 重新排序並寫回 delta-time
        annotated.sort((a, b) => {
          if (a.absTick !== b.absTick) return a.absTick - b.absTick;
          if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
          if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
          return a.index - b.index;
        });

        let prev = 0;
        track.events = annotated.map((item) => {
          const delta = item.absTick - prev;
          prev = item.absTick;
          item.ev.delta = Math.max(0, delta);
          return item.ev;
        });

        this.rebuildTrackRawChunk(track);

        // 將 sourceNotes 寫入已空出來的 targetBar
        for (const sNote of sourceNotes) {
          const relTick = sNote.startTick - sourceStartTick;
          const newStart = targetStartTick + relTick;
          this.addNoteEvent(parsed, padNum, {
            note: sNote.note,
            startTick: newStart,
            durationTick: sNote.durationTick,
            velocity: sNote.velocity,
          });
        }

        // 同步更新 parsed.sections 與總長度
        if (parsed.sections && parsed.sections[padNum - 1]) {
          parsed.sections[padNum - 1].measureCount = newTotalBars;
          parsed.sections[padNum - 1].endTick = endMeta ? endMeta.absTick : newEndTick;
        }

        return { success: true, copiedCount: sourceNotes.length, newTotalBars };
      } else {
        // 目標小節超出目前長度，等同於向後延伸追加
        for (const sNote of sourceNotes) {
          const relTick = sNote.startTick - sourceStartTick;
          const newStart = targetStartTick + relTick;
          this.addNoteEvent(parsed, padNum, {
            note: sNote.note,
            startTick: newStart,
            durationTick: sNote.durationTick,
            velocity: sNote.velocity,
          });
        }
        const newTotalBars = targetBar;
        this.setPadBarLength(parsed, padNum, targetBar);
        return { success: true, copiedCount: sourceNotes.length, newTotalBars };
      }
    }

    const tickOffset = targetStartTick - sourceStartTick;

    // 若 mode === 'replace'，刪除 targetBar 內已有的音符
    if (mode === 'replace') {
      const targetExisting = noteList.filter(
        (n) => n.startTick >= targetStartTick && n.startTick < targetEndTick
      );
      for (const tNote of targetExisting) {
        this.deleteNoteEvent(parsed, padNum, {
          note: tNote.note,
          startTick: tNote.startTick,
          oldDurationTick: tNote.durationTick,
        });
      }
    }

    // 逐一將 sourceNotes 複製到 targetBar
    for (const sNote of sourceNotes) {
      const newStart = sNote.startTick + tickOffset;
      this.addNoteEvent(parsed, padNum, {
        note: sNote.note,
        startTick: newStart,
        durationTick: sNote.durationTick,
        velocity: sNote.velocity,
      });
    }

    // 若目標小節超出原本 Pad 長度，自動擴展長度
    const newTotalBars = Math.max(curPadLen, targetBar);
    if (targetBar > curPadLen) {
      this.setPadBarLength(parsed, padNum, targetBar);
    }

    return { success: true, copiedCount: sourceNotes.length, newTotalBars };
  }

  /**
   * 一鍵倍增指定小節 (Duplicate Measure / Ctrl+D)，接續貼在下一小節
   */
  public static duplicatePadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    sourceBar?: number
  ): { success: boolean; copiedCount: number; newTargetBar: number } {
    const curLen = this.getPadBarLength(parsed, padNum);
    const src = sourceBar !== undefined && sourceBar > 0 ? sourceBar : curLen;
    const target = src + 1;
    const res = this.copyPadMeasure(parsed, padNum, src, target, 'replace');
    return { success: res.success, copiedCount: res.copiedCount, newTargetBar: target };
  }

  /**
   * 刪除或清空指定 Pad 的特定小節
   * - mode: 'ripple' (剪除順移)：刪除目標小節內所有音符，後方小節音符自動向前平移 1 個小節，總小節長度 -1
   * - mode: 'clear' (清空音符)：清空目標小節內所有音符為靜音空白，後方音符與總小節數保持不變
   */
  public static deletePadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    targetBar: number, // 1-indexed, 例如 2
    mode: 'ripple' | 'clear' = 'ripple',
    minBars: number = 4
  ): { success: boolean; deletedCount: number; newTotalBars: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) {
      return { success: false, deletedCount: 0, newTotalBars: 1 };
    }

    const curPadLen = this.getPadBarLength(parsed, padNum);
    if (targetBar < 1 || targetBar > curPadLen) {
      return { success: false, deletedCount: 0, newTotalBars: curPadLen };
    }

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    // 1. 提取所有事件並標記絕對 Tick
    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 計算基準對齊網格起點
    const noteStarts = annotated
      .filter((i) => i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) > 0)
      .map((i) => i.absTick);
    const firstNoteTick = noteStarts.length > 0 ? Math.min(...noteStarts) : 0;
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const targetStartTick = gridStartTick + (targetBar - 1) * ticksPerBar;
    const targetEndTick = targetStartTick + ticksPerBar;

    // 統計目標小節內起奏的音符數量
    const targetNoteOns = annotated.filter(
      (i) =>
        i.ev.type === 'noteOn' &&
        (i.ev.velocity ?? 0) > 0 &&
        i.absTick >= targetStartTick &&
        i.absTick < targetEndTick
    );
    const deletedCount = targetNoteOns.length;

    if (mode === 'clear') {
      // 模式 B：小節音符清空 (Clear Measure)
      const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
      const itemsToDelete = new Set<any>();

      for (const item of annotated) {
        if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
          activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
        } else if (
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
          item.ev.noteNumber !== undefined
        ) {
          const st = activeNotes.get(item.ev.noteNumber);
          if (st !== undefined) {
            if (st.absTick >= targetStartTick && st.absTick < targetEndTick) {
              const onEntry = annotated.find((x) => x.index === st.onIndex);
              if (onEntry) itemsToDelete.add(onEntry);
              itemsToDelete.add(item);
            }
            activeNotes.delete(item.ev.noteNumber);
          }
        }
      }

      for (const tOn of targetNoteOns) {
        itemsToDelete.add(tOn);
      }

      const remaining = annotated.filter((item) => !itemsToDelete.has(item));

      // 依 absTick 排序並重算 delta-time
      remaining.sort((a, b) => {
        if (a.absTick !== b.absTick) return a.absTick - b.absTick;
        if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
        if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
        return a.index - b.index;
      });

      let prevTick = 0;
      track.events = remaining.map((item) => {
        const delta = item.absTick - prevTick;
        prevTick = item.absTick;
        item.ev.delta = Math.max(0, delta);
        return item.ev;
      });

      this.rebuildTrackRawChunk(track);
      return { success: true, deletedCount, newTotalBars: curPadLen };
    }

    // 模式 A：小節剪除順移 (Ripple Delete)
    // 若總小節數為 1，無法縮減至 0 小節，轉為清空該小節
    if (curPadLen <= 1) {
      return this.deletePadMeasure(parsed, padNum, 1, 'clear', minBars);
    }

    // 若當前小節數大於 minBars (例如 8 小節)，刪除時正常縮減 1 小節；
    // 若在標準小節數內 (例如 4 小節)，後續音符往前順移，並於末端保持空白小節維持標準結構
    const effectiveMinBars = Math.min(minBars, curPadLen);
    const newTotalBars = Math.max(effectiveMinBars, curPadLen - 1);
    const newEndTick = gridStartTick + newTotalBars * ticksPerBar;

    // 標記要刪除的音符
    const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
    const itemsToDelete = new Set<any>();

    for (const item of annotated) {
      if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
        activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
      } else if (
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
        item.ev.noteNumber !== undefined
      ) {
        const st = activeNotes.get(item.ev.noteNumber);
        if (st !== undefined) {
          if (st.absTick >= targetStartTick && st.absTick < targetEndTick) {
            const onEntry = annotated.find((x) => x.index === st.onIndex);
            if (onEntry) itemsToDelete.add(onEntry);
            itemsToDelete.add(item);
          } else if (st.absTick < targetStartTick && item.absTick >= targetStartTick && item.absTick < targetEndTick) {
            item.absTick = targetStartTick;
          }
          activeNotes.delete(item.ev.noteNumber);
        }
      }
    }

    for (const tOn of targetNoteOns) {
      itemsToDelete.add(tOn);
    }

    // 處理在 targetBar 內的其他非音符控制器事件 (保留 0 Tick 標頭設定，且不可誤刪先前音符的 NoteOff)
    for (const item of annotated) {
      const isNote = item.ev.type === 'noteOn' || item.ev.type === 'noteOff';
      if (!isNote && !itemsToDelete.has(item) && item.absTick >= targetStartTick && item.absTick < targetEndTick) {
        if (item.absTick > 0 && !(item.ev.type === 'meta' && item.ev.metaType === 0x2f)) {
          itemsToDelete.add(item);
        }
      }
    }

    // 過濾並將 targetEndTick 之後的事件向前平移 ticksPerBar
    const remaining: typeof annotated = [];
    let endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);

    for (const item of annotated) {
      if (itemsToDelete.has(item)) continue;
      if (item.ev.type === 'meta' && item.ev.metaType === 0x2f) continue;

      if (item.absTick >= targetEndTick) {
        item.absTick -= ticksPerBar;
      }
      remaining.push(item);
    }

    // 重設 End of Track (Meta 0x2F)
    if (!endMeta) {
      const eotEv: MidiEvent = {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      };
      endMeta = { ev: eotEv, absTick: newEndTick, index: annotated.length + 999 };
    } else {
      endMeta.absTick = newEndTick;
    }

    // 確保 End of Track 不早於任何現存事件
    for (const item of remaining) {
      if (item.absTick > endMeta.absTick) {
        endMeta.absTick = item.absTick;
      }
    }
    remaining.push(endMeta);

    // 重新排序
    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      if (
        (a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) &&
        (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)
      ) {
        return -1;
      }
      if (
        (b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) &&
        (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)
      ) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = remaining.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 同步更新 parsed.sections
    if (parsed.sections && parsed.sections[padNum - 1]) {
      parsed.sections[padNum - 1].measureCount = newTotalBars;
      parsed.sections[padNum - 1].endTick = endMeta.absTick;
    }

    this.rebuildTrackRawChunk(track);
    return { success: true, deletedCount, newTotalBars };
  }

  /**
   * 2.8-B 八度快速移調工具 (Octave Shift +/- 12 半音)
   * - 若傳入 targetStartTick 與 targetNote：僅移調該特定單一音符
   * - 若未傳入目標音符：將指定 Pad 整軌所有音符一鍵升/降八度
   * - 自動進行 0 ~ 127 MIDI 音高邊界防護
   */
  public static shiftPadOctave(
    parsed: YamahaFileParsed,
    padNum: number,
    direction: 1 | -1,
    targetStartTick?: number,
    targetNote?: number
  ): { success: boolean; shiftedCount: number; targetNoteInfo?: { oldNote: number; newNote: number } } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return { success: false, shiftedCount: 0 };

    const semitones = direction * 12;
    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    let shiftedCount = 0;
    let targetNoteInfo: { oldNote: number; newNote: number } | undefined;

    if (targetStartTick !== undefined && targetNote !== undefined) {
      // 僅移調單一目標音符
      const onEntry = annotated.find(
        (i) => i.absTick === targetStartTick && i.ev.type === 'noteOn' && i.ev.noteNumber === targetNote && (i.ev.velocity ?? 0) > 0
      );
      if (!onEntry) return { success: false, shiftedCount: 0 };

      const oldNote = targetNote;
      const newNote = Math.max(0, Math.min(127, oldNote + semitones));
      if (newNote === oldNote) return { success: false, shiftedCount: 0 };

      // 尋找對應的 Note-Off
      const offEntry = annotated.find(
        (i) => i.index > onEntry.index &&
          i.ev.noteNumber === targetNote &&
          (i.ev.type === 'noteOff' || (i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) === 0))
      );

      onEntry.ev.noteNumber = newNote;
      if (offEntry) offEntry.ev.noteNumber = newNote;

      shiftedCount = 1;
      targetNoteInfo = { oldNote, newNote };
    } else {
      // 整軌所有音符一鍵移調
      for (const item of annotated) {
        if ((item.ev.type === 'noteOn' || item.ev.type === 'noteOff') && item.ev.noteNumber !== undefined) {
          const oldNote = item.ev.noteNumber;
          const newNote = Math.max(0, Math.min(127, oldNote + semitones));
          item.ev.noteNumber = newNote;
          if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
            shiftedCount++;
          }
        }
      }
    }

    if (shiftedCount === 0) return { success: false, shiftedCount: 0 };

    this.rebuildTrackRawChunk(track);
    return { success: true, shiftedCount, targetNoteInfo };
  }

  /**
   * 2.8-B Pad 音軌量化與 Swing 搖擺律動套用
   * - 支援 1/16、1/8、1/4、1/32、三連音及 Swing 搖擺律動 (54%, 60%, 66%)
   * - 可針對「選取音符」或「整軌音符」執行量化
   */
  public static quantizePadTrack(
    parsed: YamahaFileParsed,
    padNum: number,
    grid: QuantizeGrid,
    targetStartTick?: number,
    targetNote?: number
  ): { success: boolean; quantizedCount: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || grid === 'off') return { success: false, quantizedCount: 0 };

    const ppq = parsed.division || 480;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = ppq * beatsPerBar;
    const totalBars = this.getPadBarLength(parsed, padNum);
    const maxTicks = totalBars * ticksPerBar;

    // 提取所有音符
    let curTick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();
    const noteList: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = activeNotes.get(ev.noteNumber);
        if (st) {
          noteList.push({
            note: ev.noteNumber,
            velocity: st.velocity,
            startTick: st.tick,
            durationTick: Math.max(curTick - st.tick, 1),
          });
          activeNotes.delete(ev.noteNumber);
        }
      }
    }

    if (noteList.length === 0) return { success: false, quantizedCount: 0 };

    let quantizedCount = 0;
    const firstNoteTick = Math.min(...noteList.map((n) => n.startTick));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const modifiedNotes = noteList.map((n) => {
      const isTarget = (targetStartTick !== undefined && targetNote !== undefined)
        ? (n.startTick === targetStartTick && n.note === targetNote)
        : true;

      if (!isTarget) return n;

      // 依據 gridStartTick 計算相對 Tick 進行量化
      const relStart = n.startTick - gridStartTick;
      const qRelStart = PadRecorder.snapTickToGrid(relStart, grid, ppq);
      const minDur = PadRecorder.getMinGridDuration(grid, ppq);
      const qStart = gridStartTick + Math.max(0, Math.min(maxTicks - minDur, qRelStart));

      // 音長吸附
      const relEnd = relStart + n.durationTick;
      const qRelEnd = PadRecorder.snapTickToGrid(relEnd, grid, ppq);
      const qDur = Math.max(minDur, qRelEnd - qRelStart);

      quantizedCount++;
      return {
        note: n.note,
        velocity: n.velocity,
        startTick: qStart,
        durationTick: qDur,
      };
    });

    if (quantizedCount === 0) return { success: false, quantizedCount: 0 };

    const ok = this.replacePadNotes(parsed, padNum, modifiedNotes, totalBars);
    return { success: ok, quantizedCount };
  }

  /**
   * 【任務 4-1B】自來源 MIDI 歌曲擷取指定通道 (sourceChannel) 與小節區間 (startBar ~ endBar)，
   * 自動完成：
   * 1. PPQ 時間軸智慧縮放與歸零對齊 (relTick = 0)
   * 2. 跨界殘留音過濾 (Boundary Bleed Elimination：起點前已發音之尾音直接排除，杜絕第 1 拍爆音)
   * 3. 當下生效音色與混音回溯 (Effective Voice Lookahead：MSB/LSB/PC/Vol/Pan/Rev/Cho)
   * 4. 真實動態控制器提取與滿表情進場保護 (CC11 表情、CC1 顫音、CC64 延音踏板 + 結尾踏板歸零)
   * 5. 4 大音樂型態智慧診斷與 CM / Repeat / Icon / Name 自動推薦配置
   */
  public static importMidiChannelRangeToPad(
    options: MidiChannelToPadImportOptions
  ): MidiChannelToPadImportResult {
    const {
      sourceParsed,
      targetPadParsed,
      sourceChannel,
      targetPadNum,
      startBar,
      endBar,
      startBeat = 1,
      endBeat = 1,
      customPadName,
    } = options;

    if (targetPadNum < 1 || targetPadNum > 4) {
      throw new Error(`無效的目標 Pad 編號: ${targetPadNum} (必須為 1 ~ 4)`);
    }

    const srcDivision = sourceParsed.division || 480;
    const dstDivision = targetPadParsed.division || 480;
    const scale = dstDivision / srcDivision;

    const timeSig = sourceParsed.timeSignature || { numerator: 4, denominator: 4 };
    const beatsPerBar = timeSig.numerator || 4;
    const ticksPerBeatSrc = Math.max(1, Math.round(srcDivision * (4 / (timeSig.denominator || 4))));
    const ticksPerBarSrc = ticksPerBeatSrc * beatsPerBar;

    const sBar = Math.max(1, Math.round(startBar));
    const eBar = Math.max(sBar, Math.round(endBar));
    const sBeat = Math.max(1, Math.min(beatsPerBar, Math.round(startBeat)));
    const eBeat = Math.max(1, Math.min(beatsPerBar, Math.round(endBeat)));

    const startTickSrc = (sBar - 1) * ticksPerBarSrc + (sBeat - 1) * ticksPerBeatSrc;
    const barCount = Math.max(1, eBar - sBar + 1);
    const endTickSrc = eBeat > 1
      ? (eBar - 1) * ticksPerBarSrc + (eBeat - 1) * ticksPerBeatSrc
      : startTickSrc + barCount * ticksPerBarSrc;
    const totalTicksSrc = Math.max(ticksPerBeatSrc, endTickSrc - startTickSrc);
    const targetBars = Math.max(1, Math.ceil(totalTicksSrc / ticksPerBarSrc));

    // 1. 回溯該通道在 sBar 當下生效的音色與混音
    const effVoice = MidiSongAnalyzer.getEffectiveVoiceAtBar(sourceParsed, sourceChannel, sBar);
    let effReverb = 40;
    let effChorus = 0;

    // 2. 掃描全軌提取該通道在 [startTickSrc, endTickSrc) 的音符與動態 CC (並回溯 Reverb/Chorus)
    const extractedNotes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
    const cc11List: Array<{ relTick: number; value: number }> = [];
    const cc1List: Array<{ relTick: number; value: number }> = [];
    const cc64List: Array<{ relTick: number; value: number }> = [];

    for (const track of sourceParsed.tracks) {
      if (!track || !track.events) continue;
      let curTick = 0;
      const activeNotes = new Map<number, { tick: number; velocity: number }>();

      for (const ev of track.events) {
        curTick += ev.delta;
        if (ev.channel !== sourceChannel) continue;

        if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
          if (curTick <= startTickSrc) {
            if (ev.controller === 91) effReverb = ev.value;
            else if (ev.controller === 93) effChorus = ev.value;
          }
          if (curTick >= startTickSrc && curTick < endTickSrc) {
            const relTickDst = Math.max(0, Math.round((curTick - startTickSrc) * scale));
            if (ev.controller === 11) cc11List.push({ relTick: relTickDst, value: ev.value });
            else if (ev.controller === 1) cc1List.push({ relTick: relTickDst, value: ev.value });
            else if (ev.controller === 64) cc64List.push({ relTick: relTickDst, value: ev.value });
          }
        } else if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
          activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
        } else if (
          (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) &&
          ev.noteNumber !== undefined
        ) {
          const st = activeNotes.get(ev.noteNumber);
          if (st) {
            activeNotes.delete(ev.noteNumber);
            // 【跨界殘留音過濾鐵律】：起點前已按下之音符 (st.tick < startTickSrc) 一律排除，絕不強塞至 rel=0
            if (st.tick >= startTickSrc && st.tick < endTickSrc) {
              const relStartSrc = st.tick - startTickSrc;
              const clippedEndSrc = Math.min(curTick, endTickSrc);
              const durSrc = Math.max(1, clippedEndSrc - st.tick);
              const startTickDst = Math.max(0, Math.round(relStartSrc * scale));
              const durationTickDst = Math.max(1, Math.round(durSrc * scale));
              extractedNotes.push({
                note: ev.noteNumber,
                startTick: startTickDst,
                durationTick: durationTickDst,
                velocity: st.velocity,
              });
            }
          }
        }
      }

      // 若有在區間內按下但直到檔案結束仍未收到 NoteOff 的懸空音符，予以安全收尾截斷
      for (const [noteNum, st] of activeNotes.entries()) {
        if (st.tick >= startTickSrc && st.tick < endTickSrc) {
          const relStartSrc = st.tick - startTickSrc;
          const durSrc = Math.max(1, endTickSrc - st.tick);
          extractedNotes.push({
            note: noteNum,
            startTick: Math.max(0, Math.round(relStartSrc * scale)),
            durationTick: Math.max(1, Math.round(durSrc * scale)),
            velocity: st.velocity,
          });
        }
      }
    }

    extractedNotes.sort((a, b) => a.startTick - b.startTick || a.note - b.note);

    // 3. 寫入音色與混音參數至目標 Pad 軌道
    this.setPadMixing(targetPadParsed, targetPadNum, {
      bankMsb: effVoice.msb,
      bankLsb: effVoice.lsb,
      programChange: effVoice.pc,
      volume: effVoice.volume,
      pan: effVoice.pan,
      reverb: effReverb,
      chorus: effChorus,
    });

    // 4. 寫入音符並設定小節數
    this.replacePadNotes(targetPadParsed, targetPadNum, extractedNotes, targetBars);

    // 5. 清除舊動態 CC 並寫入提取的真實動態 CC (確保開頭 CC11=127 飽滿進場，結尾 CC64=0 放開延音)
    if (!cc11List.some((c) => c.relTick === 0)) {
      cc11List.unshift({ relTick: 0, value: 127 });
    }
    this.replacePadCCEvents(targetPadParsed, targetPadNum, 11, cc11List);
    this.replacePadCCEvents(targetPadParsed, targetPadNum, 1, cc1List);

    if (cc64List.length > 0) {
      const lastSustain = cc64List[cc64List.length - 1];
      if (lastSustain.value >= 64) {
        const endRelTickDst = Math.max(0, Math.round(totalTicksSrc * scale) - 1);
        cc64List.push({ relTick: endRelTickDst, value: 0 });
      }
    }
    this.replacePadCCEvents(targetPadParsed, targetPadNum, 64, cc64List);

    // 6. 執行智慧型態診斷，依 4 大型態鐵律配置 CM / Repeat / Icon / Name
    const diagAfterNotes = this.analyzePadProject(targetPadParsed);
    const trkDiag = diagAfterNotes.tracks[targetPadNum - 1];

    let autoCm = false;
    let autoRp = false;
    if (trkDiag.musicalType === 'CHORD_TEXTURE') {
      autoCm = true;
      autoRp = true;
    } else if (trkDiag.musicalType === 'DRUM_SFX') {
      autoCm = false;
      autoRp = true;
    } else {
      // MELODY_INTRO / SHORT_MOTIF / EMPTY：遵循長旋律鐵律預設 CM=OFF, Repeat=OFF
      autoCm = false;
      autoRp = false;
    }

    const cat = effVoice.category || '';
    let autoIcon = 'S809';
    if (effVoice.isDrum) autoIcon = 'S813';
    else if (cat.includes('Guitar')) autoIcon = 'S810';
    else if (cat.includes('Brass') || cat.includes('Sax') || cat.includes('Woodwind')) autoIcon = 'S811';
    else if (cat.includes('Strings') || cat.includes('Pad')) autoIcon = 'S812';
    else if (cat.includes('Synth')) autoIcon = 'S814';

    const cleanVoiceShort = (effVoice.voiceName || `CH${sourceChannel + 1}`)
      .split(' (')[0]
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '')
      .slice(0, 9) || `CH${sourceChannel + 1}`;
    const barTag = sBar === eBar ? `B${sBar}` : `B${sBar}-${eBar}`;
    const finalPadName = (customPadName && customPadName.trim())
      ? customPadName.trim()
      : `${cleanVoiceShort} ${barTag}`;

    this.setPadChordMatch(targetPadParsed, targetPadNum, autoCm);
    this.setPadRepeat(targetPadParsed, targetPadNum, autoRp);
    this.setPadIcon(targetPadParsed, targetPadNum, autoIcon);
    this.setPadName(targetPadParsed, targetPadNum, finalPadName);

    const extractedCCCount = cc11List.length + cc1List.length + cc64List.length;

    return {
      success: true,
      targetPadNum,
      padName: finalPadName,
      iconCode: autoIcon,
      extractedNoteCount: extractedNotes.length,
      extractedCCCount,
      barLength: targetBars,
      voiceInfo: {
        msb: effVoice.msb,
        lsb: effVoice.lsb,
        pc: effVoice.pc,
        voiceName: effVoice.voiceName,
        category: effVoice.category,
        panelCode: effVoice.panelCode,
      },
      musicalType: trkDiag.musicalType,
      musicalTypeLabelZh: trkDiag.musicalTypeLabelZh,
      chordMatch: autoCm,
      repeat: autoRp,
    };
  }

  /**
   * 重新編碼標準 MIDI Track (MTrk) 的二進位 Byte Buffer
   */
  public static rebuildTrackRawChunk(track: MidiTrack): void {
    const writer = new BinaryWriter();

    for (const ev of track.events) {
      // 寫入 Delta-time
      writer.writeVarInt(ev.delta);

      if (ev.type === 'meta') {
        writer.writeUint8(0xff);
        writer.writeUint8(ev.metaType ?? 0);
        const data = ev.metaData ?? (ev.text !== undefined ? new TextEncoder().encode(ev.text) : new Uint8Array(0));
        writer.writeVarInt(data.length);
        writer.writeBytes(data);
      } else if (ev.type === 'sysex') {
        writer.writeUint8(0xf0);
        const data = ev.rawBytes ?? new Uint8Array(0);
        writer.writeVarInt(data.length);
        writer.writeBytes(data);
      } else {
        const channel = (ev.channel ?? 0) & 0x0f;
        let statusByte = 0;

        if (ev.type === 'noteOn') {
          statusByte = 0x90 | channel;
        } else if (ev.type === 'noteOff') {
          statusByte = 0x80 | channel;
        } else if (ev.type === 'controlChange') {
          statusByte = 0xb0 | channel;
        } else if (ev.type === 'programChange') {
          statusByte = 0xc0 | channel;
        } else if (ev.type === 'pitchBend') {
          statusByte = 0xe0 | channel;
        }

        if (statusByte !== 0) {
          writer.writeUint8(statusByte);

          if (ev.type === 'noteOn' || ev.type === 'noteOff') {
            writer.writeUint8((ev.noteNumber ?? 60) & 0x7f);
            writer.writeUint8((ev.velocity ?? 64) & 0x7f);
          } else if (ev.type === 'controlChange') {
            writer.writeUint8((ev.controller ?? 0) & 0x7f);
            writer.writeUint8((ev.value ?? 0) & 0x7f);
          } else if (ev.type === 'programChange') {
            writer.writeUint8((ev.program ?? 0) & 0x7f);
          } else if (ev.type === 'pitchBend') {
            const val = ev.value ?? 8192;
            writer.writeUint8(val & 0x7f);
            writer.writeUint8((val >> 7) & 0x7f);
          }
        }
      }
    }

    const eventBytes = writer.toUint8Array();

    // 組裝 MTrk 標頭與長度
    const chunkWriter = new BinaryWriter();
    chunkWriter.writeString('MTrk');
    chunkWriter.writeUint32BE(eventBytes.length);
    chunkWriter.writeBytes(eventBytes);

    track.rawChunk = chunkWriter.toUint8Array();
  }
}
