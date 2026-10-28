/**
 * Yamaha PSR-SX920 官方原廠鼓組套件清單 (Drum Kit Presets)
 * 收錄 PSR-SX920 常用鼓組身分證：Bank MSB (CC 0), Bank LSB (CC 32), PC (0-based) 與琴端顯示編號 (1-based)
 */

export interface YamahaDrumKitPreset {
  id: string;
  name: string;
  category: string;
  msb: number;
  lsb: number;
  pc: number;          // 0 ~ 127 (MIDI 底層)
  panelPc: number;     // 1 ~ 128 (琴端螢幕顯示)
  icon: string;
  description: string;
}

export const YAMAHA_SX920_DRUM_KITS: YamahaDrumKitPreset[] = [
  {
    id: 'standard-kit-1',
    name: 'Standard Kit 1 (標準 1 號鼓)',
    category: 'Standard',
    msb: 127,
    lsb: 0,
    pc: 0,
    panelPc: 1,
    icon: '🥁',
    description: '山葉全系列電子琴通用之最標準、最乾淨流行鼓組',
  },
  {
    id: 'standard-kit-2',
    name: 'Standard Kit 2 (標準 2 號鼓)',
    category: 'Standard',
    msb: 127,
    lsb: 0,
    pc: 1,
    panelPc: 2,
    icon: '🥁',
    description: '標準鼓組變體，較為溫和的敲擊回饋',
  },
  {
    id: 'pop-drum-kit',
    name: 'Pop Drum Kit (現代流行真實鼓)',
    category: 'Pop',
    msb: 127,
    lsb: 0,
    pc: 12,
    panelPc: 13,
    icon: '🎤',
    description: '現代華語流行音樂、抒情歌最常用的自然飽滿鼓聲',
  },
  {
    id: 'hit-kit',
    name: 'Hit Kit (衝擊打擊鼓組)',
    category: 'Pop',
    msb: 127,
    lsb: 0,
    pc: 8,
    panelPc: 9,
    icon: '💥',
    description: '中高頻穿透力更強的現代流行打擊鼓組',
  },
  {
    id: 'rock-kit',
    name: 'Rock Kit (美式搖滾重鼓)',
    category: 'Rock',
    msb: 127,
    lsb: 0,
    pc: 16,
    panelPc: 17,
    icon: '🎸',
    description: '大鼓低頻厚實、小鼓金屬響弦穿透力極強之搖滾硬漢鼓',
  },
  {
    id: 'electro-kit',
    name: 'Electro Kit (電子節奏鼓)',
    category: 'Dance',
    msb: 127,
    lsb: 0,
    pc: 24,
    panelPc: 25,
    icon: '⚡',
    description: '適合流行舞曲、浩室 EDM 的合成電鼓',
  },
  {
    id: 'analog-kit',
    name: 'Analog Kit (經典 808/909 模擬鼓)',
    category: 'Dance',
    msb: 127,
    lsb: 0,
    pc: 25,
    panelPc: 26,
    icon: '🎛️',
    description: '經典 Roland TR-808/909 深沉大鼓與清脆小鼓音色',
  },
  {
    id: 'jazz-kit',
    name: 'Jazz Kit (經典爵士鼓)',
    category: 'Jazz',
    msb: 127,
    lsb: 0,
    pc: 32,
    panelPc: 33,
    icon: '🎷',
    description: '強調動態細節、鈸聲溫暖細膩之原聲爵士鼓組',
  },
  {
    id: 'brush-kit',
    name: 'Brush Kit (爵士毛刷鼓)',
    category: 'Jazz',
    msb: 127,
    lsb: 0,
    pc: 40,
    panelPc: 41,
    icon: '🧹',
    description: '以金屬鋼刷在小鼓皮上摩擦、輕敲的輕柔抒情鼓聲',
  },
  {
    id: 'symphony-kit',
    name: 'Symphony Kit (管弦樂大鼓與定音鼓)',
    category: 'Classical',
    msb: 127,
    lsb: 0,
    pc: 48,
    panelPc: 49,
    icon: '🎻',
    description: '電影配樂、交響樂團專用之定音鼓 (Timpani) 與大軍鼓',
  },
  {
    id: 'cuban-kit',
    name: 'Cuban Kit (古巴拉丁打擊組)',
    category: 'Latin',
    msb: 127,
    lsb: 0,
    pc: 56,
    panelPc: 57,
    icon: '🪘',
    description: 'Bongo、Conga、牛鈴、沙錘等熱情拉丁打擊樂組合',
  },
  {
    id: 'sfx-kit-1',
    name: 'SFX Kit 1 (特效音效鼓組 1)',
    category: 'SFX',
    msb: 126,
    lsb: 0,
    pc: 0,
    panelPc: 1,
    icon: '🎬',
    description: '各種刮盤、環境、槍聲、掌聲等合成音效庫',
  },
];
