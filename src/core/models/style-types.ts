/**
 * Yamaha Style 伴奏風格 (.STY) 核心資料模型定義
 * 依據 Yamaha SFF2 / PSR-SX920 原廠伴奏格式規範
 */

export type StylePartId =
  | 'Rhythm1'
  | 'Rhythm2'
  | 'Bass'
  | 'Chord1'
  | 'Chord2'
  | 'Pad'
  | 'Phrase1'
  | 'Phrase2';

export type StyleSectionType =
  | 'Intro A'
  | 'Intro B'
  | 'Intro C'
  | 'Main A'
  | 'Main B'
  | 'Main C'
  | 'Main D'
  | 'Fill In AA'
  | 'Fill In BB'
  | 'Fill In CC'
  | 'Fill In DD'
  | 'Fill In BA'
  | 'Ending A'
  | 'Ending B'
  | 'Ending C'
  | 'Break';

export interface StylePartConfig {
  partId: StylePartId;
  channel: number; // 0-indexed: 8 ~ 15 (對應 MIDI Channel 9 ~ 16)
  name: string;
  msb: number;
  lsb: number;
  pc: number;
  volume: number;
  pan: number;
  reverb: number;
  chorus: number;
}

export interface StyleNoteEvent {
  partId?: StylePartId;
  channel?: number; // 8 ~ 15
  note: number;
  startTick: number; // 相對於所屬 Section 開頭的 Tick 偏移量
  durationTick: number;
  velocity: number;
}

export interface StyleSectionConfig {
  name: StyleSectionType | string;
  bars: number;
  notes?: StyleNoteEvent[];
}

export interface NewStyleProjectOptions {
  styleName?: string;
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  division?: number; // 預設 480
  sections?: StyleSectionConfig[];
  parts?: Partial<Record<StylePartId, Partial<StylePartConfig>>>;
  injectCasm?: boolean;
}

/**
 * Yamaha Style 標準 8 伴奏聲部預設配置
 * 遵循 Yamaha Arranger Workstation 標準通道指派：
 * - Ch 9 (idx 8): Rhythm 1 (打擊樂)
 * - Ch 10 (idx 9): Rhythm 2 (主鼓組)
 * - Ch 11 (idx 10): Bass (低音貝斯)
 * - Ch 12 (idx 11): Chord 1 (節奏和弦)
 * - Ch 13 (idx 12): Chord 2 (副和弦)
 * - Ch 14 (idx 13): Pad (長音弦樂鋪底)
 * - Ch 15 (idx 14): Phrase 1 (裝飾對位 1)
 * - Ch 16 (idx 15): Phrase 2 (裝飾對位 2)
 */
export const DEFAULT_STYLE_PARTS: Record<StylePartId, StylePartConfig> = {
  Rhythm1: {
    partId: 'Rhythm1',
    channel: 8,
    name: 'Sub Rhythm (Rhythm 1)',
    msb: 127,
    lsb: 0,
    pc: 0,
    volume: 88,
    pan: 64,
    reverb: 40,
    chorus: 0,
  },
  Rhythm2: {
    partId: 'Rhythm2',
    channel: 9,
    name: 'Main Rhythm (Rhythm 2)',
    msb: 127,
    lsb: 0,
    pc: 0,
    volume: 100,
    pan: 64,
    reverb: 40,
    chorus: 0,
  },
  Bass: {
    partId: 'Bass',
    channel: 10,
    name: 'Bass',
    msb: 0,
    lsb: 0,
    pc: 33, // Finger Bass
    volume: 95,
    pan: 64,
    reverb: 30,
    chorus: 0,
  },
  Chord1: {
    partId: 'Chord1',
    channel: 11,
    name: 'Chord 1',
    msb: 0,
    lsb: 0,
    pc: 0, // Grand Piano
    volume: 90,
    pan: 52,
    reverb: 45,
    chorus: 0,
  },
  Chord2: {
    partId: 'Chord2',
    channel: 12,
    name: 'Chord 2',
    msb: 0,
    lsb: 0,
    pc: 24, // Acoustic Guitar
    volume: 85,
    pan: 76,
    reverb: 45,
    chorus: 0,
  },
  Pad: {
    partId: 'Pad',
    channel: 13,
    name: 'Pad',
    msb: 0,
    lsb: 0,
    pc: 48, // Strings
    volume: 80,
    pan: 64,
    reverb: 55,
    chorus: 20,
  },
  Phrase1: {
    partId: 'Phrase1',
    channel: 14,
    name: 'Phrase 1',
    msb: 0,
    lsb: 0,
    pc: 61, // Brass Section
    volume: 85,
    pan: 44,
    reverb: 45,
    chorus: 0,
  },
  Phrase2: {
    partId: 'Phrase2',
    channel: 15,
    name: 'Phrase 2',
    msb: 0,
    lsb: 0,
    pc: 11, // Vibraphone
    volume: 80,
    pan: 84,
    reverb: 50,
    chorus: 15,
  },
};

/**
 * 段落專屬伴奏聲部開關/靜音狀態對照表
 * 結構: muteMap[sectionName][channel] = true 表示在該段落中此通道靜音 (Muted)
 */
export type SectionPartMuteMap = Record<string, Record<number, boolean>>;

/**
 * 段落聲部開口矩陣單元格結構
 */
export interface SectionPartMatrixCell {
  sectionName: string;
  channel: number;
  partId?: StylePartId;
  partName: string;
  shortName: string;
  icon: string;
  noteCount: number;
  isMuted: boolean;
  canToggle: boolean;
}

/**
 * 段落聲部開口矩陣單列 (一個段落) 結構
 */
export interface SectionPartMatrixRow {
  sectionName: string;
  measureCount: number;
  startTick: number;
  endTick: number;
  cells: SectionPartMatrixCell[];
  mutedCount: number;
  activeCount: number;
  totalNotes: number;
}

