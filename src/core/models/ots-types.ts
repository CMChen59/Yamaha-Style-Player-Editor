/**
 * Yamaha Style OTS (One Touch Setting) 與風格標頭 (Style Header) 資料模型
 * 相容 Yamaha SFF2 / PSR-SX920 / Genos 系列原廠伴奏規範
 */

export interface OtsVoiceSetting {
  voiceName: string;
  chineseName?: string;
  msb: number;      // Bank Select MSB (CC 0)
  lsb: number;      // Bank Select LSB (CC 32)
  pc: number;       // Program Change (0 ~ 127, 0-indexed)
  volume: number;   // CC 7 (0 ~ 127, 預設 100)
  pan: number;      // CC 10 (0 ~ 127, 預設 64)
  reverb: number;   // CC 91 (0 ~ 127, 預設 40)
  chorus: number;   // CC 93 (0 ~ 127, 預設 0)
  octave: number;   // 八度位移 (-2 ~ +2, 預設 0)
  enabled: boolean; // 是否開啟此聲部 (Right 1 預設 true, Right 2 預設 false)
}

export interface OtsSlotConfig {
  slotIndex: number; // 1 ~ 4
  name: string;      // 例如 "OTS 1"
  right1: OtsVoiceSetting;
  right2: OtsVoiceSetting;
  right3?: OtsVoiceSetting; // 對應 Ch 2 (SX920 / Genos 支援)
  left?: OtsVoiceSetting;   // 對應 Ch 3 (左手音色)
}

export interface StyleOtsData {
  slots: [OtsSlotConfig, OtsSlotConfig, OtsSlotConfig, OtsSlotConfig];
}

export interface StyleHeaderMetadata {
  title: string;        // 伴奏風格名稱 (Track Name / Meta 0x03)
  genre: string;        // 樂風分類 (如 Pop, Rock, Ballad, Latin, Jazz, Dance 等)
  bpm: number;          // 預設速度 (Meta 0x51)
  timeSignature: {      // 預設拍號 (Meta 0x58)
    numerator: number;
    denominator: number;
  };
  copyright?: string;   // 版權資訊 (Meta 0x02)
}

/**
 * 官方精選 OTS 4 鍵組合範本清單
 */
export type OtsPresetGenre = 'POP' | 'JAZZ' | 'ROCK' | 'BALLAD';

export interface OtsPreset {
  id: OtsPresetGenre;
  name: string;
  description: string;
  slots: [OtsSlotConfig, OtsSlotConfig, OtsSlotConfig, OtsSlotConfig];
}
