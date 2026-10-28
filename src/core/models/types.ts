/**
 * Yamaha Style & Pad 核心資料模型與二進位結構定義
 */

export interface MidiEvent {
  delta: number;
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'programChange' | 'pitchBend' | 'meta' | 'sysex' | 'other';
  channel?: number;
  noteNumber?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  program?: number;
  metaType?: number;
  metaData?: Uint8Array;
  text?: string;
  rawBytes?: Uint8Array;
}

export interface MidiTrack {
  trackIndex: number;
  name?: string;
  events: MidiEvent[];
  rawChunk: Uint8Array;
}

export interface YamahaSection {
  name: string;          // 如 'Main A', 'Intro A', 'Fill In AA'
  startTick: number;     // 區段起始 Tick
  endTick?: number;      // 區段結束 Tick
  measureCount?: number; // 小節數量
}

export interface YamahaTrackInfo {
  trackIndex: number;
  channel: number;       // 伴奏聲部通常為 9 ~ 16 (0-indexed 為 8 ~ 15)
  partName: string;      // 'Rhythm 1', 'Rhythm 2', 'Bass', 'Chord 1', etc.
  bankMsb?: number;
  bankLsb?: number;
  programChange?: number;
  volume?: number;
  pan?: number;
  reverb?: number;
  chorus?: number;
}

export interface YamahaCustomChunk {
  id: string;            // 例如 'CASM', 'OTS ', 'FVK ', 'MH  '
  data: Uint8Array;
  offset: number;
}

export interface YamahaPadConfig {
  names: string[];         // Pad 1~4 自訂名稱
  icons: string[];         // Pad 1~4 圖示代碼 (如 S809)
  repeatFlags: boolean[];  // Pad 1~4 是否開啟循環播放 (RP)
  chordMatchFlags: boolean[]; // Pad 1~4 是否開啟和弦跟隨 (CM)
}

export interface YamahaFileParsed {
  format: 'STY' | 'PAD';
  midiFormat: number;    // 0 或 1
  division: number;      // Ticks Per Quarter Note (通常為 480)
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  sections: YamahaSection[];
  tracks: MidiTrack[];
  parts: YamahaTrackInfo[];
  customChunks: YamahaCustomChunk[];
  casmMappings?: Record<string, Record<number, number>>; // 段落名稱 (小寫) -> { sourceChannel: destinationChannel }
  hasCasm: boolean;
  hasOts: boolean;
  padConfig?: YamahaPadConfig;
}
