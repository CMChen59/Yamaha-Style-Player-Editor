/**
 * Yamaha PSR-SX920 完整原廠 Data List 音色資料庫 (Voice Library Database)
 * 收錄 Yamaha PSR-SX920 官方 2,300+ 全套原廠樂器、音色三聯號身分證 (Bank MSB, Bank LSB, PC)
 * 以及琴端螢幕圖示代碼 (Icon Code)、樂器分類、Multi Pad 適用度與避坑標記。
 */

import rawVoiceData from './yamaha-sx920-datalist.json';

export interface YamahaVoice {
  id: string;
  name: string;             // 官方英文名稱 (如 'CFX Concert Grand', 'Kino Strings')
  chineseName: string;      // 繁體中文說明 (如 'CFX 音樂會旗艦三角鋼琴', '電影大片史詩弦樂')
  category: VoiceCategory;  // 樂器分類
  msb: number;              // Bank Select MSB (CC 0)
  lsb: number;              // Bank Select LSB (CC 32)
  pc: number;               // Program Change (0 ~ 127, 0-indexed)
  icon: string;             // Yamaha 琴端圖標 (如 S801, S809)
  type?: 'S.Art!' | 'Live!' | 'Sweet!' | 'Cool!' | 'MegaVoice' | 'OrganFlutes' | 'Standard' | 'Legacy';
  suitability?: 'recommended' | 'warning' | 'standard';
  suitabilityReason?: string;
}

export type VoiceCategory =
  | 'Piano'
  | 'E.Piano'
  | 'Organ'
  | 'Accordion'
  | 'Guitar'
  | 'Bass'
  | 'Strings'
  | 'Brass'
  | 'Saxophone'
  | 'Woodwind'
  | 'Synth'
  | 'Pad'
  | 'Choir'
  | 'Drums'
  | 'Percussion'
  | 'Legacy';

export type VoiceSuitabilityFilter =
  | 'ALL'
  | 'RECOMMENDED'
  | 'MEGAVOICE'
  | 'LIVE_SWEET_COOL'
  | 'SART'
  | 'DRUMS'
  | 'WARNING';

export const VOICE_CATEGORIES: Array<{ key: VoiceCategory | 'ALL'; label: string; icon: string }> = [
  { key: 'ALL', label: '全部音色', icon: '🌐' },
  { key: 'Piano', label: '鋼琴 (Piano)', icon: '🎹' },
  { key: 'E.Piano', label: '電鋼琴 (E.Piano)', icon: '⚡' },
  { key: 'Strings', label: '弦樂 (Strings)', icon: '🎻' },
  { key: 'Guitar', label: '吉他 (Guitar)', icon: '🎸' },
  { key: 'Bass', label: '貝斯 (Bass)', icon: '🎸' },
  { key: 'Saxophone', label: '薩克斯風 (Sax)', icon: '🎷' },
  { key: 'Brass', label: '銅管樂 (Brass)', icon: '🎺' },
  { key: 'Woodwind', label: '木管/長笛 (Wind)', icon: '🪈' },
  { key: 'Organ', label: '風琴 (Organ)', icon: '🎼' },
  { key: 'Accordion', label: '手風琴 (Accordion)', icon: '🪗' },
  { key: 'Synth', label: '合成主奏 (Synth)', icon: '🎛️' },
  { key: 'Pad', label: '溫暖鋪底 (Pad)', icon: '🌌' },
  { key: 'Choir', label: '人聲合唱 (Choir)', icon: '👼' },
  { key: 'Drums', label: '原廠鼓組 (Drums)', icon: '🥁' },
  { key: 'Percussion', label: '世界打擊 (Perc)', icon: '🔔' },
  { key: 'Legacy', label: 'GM/XG 經典 (Legacy)', icon: '📻' },
];

export const VOICE_SUITABILITY_FILTERS: Array<{ key: VoiceSuitabilityFilter; label: string; icon: string }> = [
  { key: 'ALL', label: '全部類型', icon: '📋' },
  { key: 'RECOMMENDED', label: '⭐ Multi Pad 推薦', icon: '⭐' },
  { key: 'MEGAVOICE', label: 'MegaVoice 伴奏極品', icon: '🎸' },
  { key: 'LIVE_SWEET_COOL', label: 'Live! / Sweet! / Cool!', icon: '💎' },
  { key: 'SART', label: 'S.Art! 超音色', icon: '🎷' },
  { key: 'DRUMS', label: '鼓組與打擊樂', icon: '🥁' },
  { key: 'WARNING', label: '⚠️ 避坑警示 (OrganFlutes)', icon: '⚠️' },
];

/**
 * Yamaha PSR-SX920 完整音色清單 (2,300+ 種官方完整 Data List 音色)
 */
export const YAMAHA_SX920_VOICES: YamahaVoice[] = rawVoiceData as YamahaVoice[];

/**
 * 歷史與前代琴種 (PSR-SX900 / Tyros / Genos / 舊版範本) 三聯號相容別名對照表 (0-based PC)
 * Key: 檔案內原始三聯號 `${msb}-${lsb}-${pc}` (0-based)
 * Value: PSR-SX920 面板官方標準三聯號 `{ msb, lsb, pc }` (0-based)
 */
export const LEGACY_VOICE_ALIASES: Record<string, { msb: number; lsb: number; pc: number }> = {
  '104-1-0': { msb: 104, lsb: 21, pc: 0 },    // CFX Concert Grand (4006.STY Main A Chord 1 104-1-1 -> SX920 官方 104-21-1)
  '104-0-0': { msb: 104, lsb: 21, pc: 0 },    // Concert Grand -> CFX Concert Grand (SX920 官方 104-21-1)
  '104-0-48': { msb: 12, lsb: 1, pc: 49 },    // Kino Strings (SX920 官方旗艦 12-1-50)
  '104-1-1': { msb: 104, lsb: 11, pc: 0 },    // Pop Grand -> C7 PopGrand (SX920 官方 104-11-1)
  '104-2-64': { msb: 0, lsb: 113, pc: 64 },   // Sweet! SopranoSax (SX920 官方 0-113-65)
  '8-40-75': { msb: 0, lsb: 113, pc: 75 },    // Sweet! PanPipes (黃金範本 Ch 7/15 8-40-76 -> SX920 官方 0-113-76)
  '104-12-107': { msb: 0, lsb: 113, pc: 107 },// Regular Kanoun (黃金範本 Ch 16 104-12-108 -> SX920 官方 0-113-108)
  '0-112-0': { msb: 0, lsb: 122, pc: 0 },     // S.Art ConcertGrand1 (SX920 官方 0-122-1)
  '104-2-1': { msb: 104, lsb: 4, pc: 0 },     // Live! RockPiano (SX920 官方 104-4-1)
  '104-2-4': { msb: 0, lsb: 118, pc: 4 },     // Cool! SuitcaseEP (SX920 官方 0-118-5)
  '104-1-4': { msb: 0, lsb: 117, pc: 4 },     // Regular StageEP (SX920 官方 0-117-5)
  '104-0-24': { msb: 8, lsb: 34, pc: 0 },     // S.Art NylonGuitar SW (SX920 官方 8-34-1)
  '104-8-24': { msb: 8, lsb: 34, pc: 0 },     // S.Art NylonGuitar SW (SX920 官方 8-34-1)
  '104-3-25': { msb: 0, lsb: 113, pc: 25 },   // Live! 12StringGuitar (SX920 官方 0-113-26)
  '104-2-24': { msb: 8, lsb: 35, pc: 1 },     // S.Art FlamencoGuitar (SX920 官方 8-35-2)
  '104-1-48': { msb: 8, lsb: 32, pc: 49 },    // S.Art ConcertStrings (SX920 官方 8-32-50)
  '104-0-56': { msb: 0, lsb: 115, pc: 56 },   // Sweet! Trumpet (SX920 官方 0-115-57)
  '104-0-52': { msb: 0, lsb: 112, pc: 54 },   // Regular AirChoir (SX920 官方 0-112-55)
  '104-1-52': { msb: 0, lsb: 116, pc: 52 },   // Live! GospelVoices (SX920 官方 0-116-53)
};

/**
 * 雙向反向索引表：由 SX920 面板標準三聯號 (0-based `${msb}-${lsb}-${pc}`) 反查所有歷史相容舊代碼 (0-based)
 */
export const REVERSE_VOICE_ALIASES: Record<string, string[]> = (() => {
  const rev: Record<string, string[]> = {};
  for (const [legacyKey, canonical] of Object.entries(LEGACY_VOICE_ALIASES)) {
    const canKey = `${canonical.msb}-${canonical.lsb}-${canonical.pc}`;
    if (!rev[canKey]) rev[canKey] = [];
    if (!rev[canKey].includes(legacyKey)) {
      rev[canKey].push(legacyKey);
    }
  }
  return rev;
})();

/**
 * 取得指定 SX920 標準音色所對應的所有相容舊代碼
 * @param msb Bank MSB
 * @param lsb Bank LSB
 * @param pc Program Change (0-based)
 * @param oneBased 是否轉換為琴端面板 1-based 格式 (預設 true，如 "104-1-1")
 */
export function getLegacyAliasesForVoice(
  msb: number,
  lsb: number,
  pc: number,
  oneBased: boolean = true
): string[] {
  const canKey = `${msb}-${lsb}-${pc}`;
  const rawList = REVERSE_VOICE_ALIASES[canKey] || [];
  if (!oneBased) return [...rawList];
  return rawList.map(key => {
    const [m, l, p] = key.split('-').map(n => parseInt(n, 10));
    return `${m}-${l}-${p + 1}`;
  });
}

// 快速索引表以實現 O(1) 毫秒級查找
interface VoiceIndex {
  exactMap: Map<string, YamahaVoice>;
  msbPcMap: Map<string, YamahaVoice>;
  pcMap: Map<number, YamahaVoice>;
  searchCache: Array<{ voice: YamahaVoice; searchStr: string }>;
}

let voiceIndex: VoiceIndex | null = null;

function getVoiceIndex(): VoiceIndex {
  if (voiceIndex) return voiceIndex;

  const exactMap = new Map<string, YamahaVoice>();
  const msbPcMap = new Map<string, YamahaVoice>();
  const pcMap = new Map<number, YamahaVoice>();
  const searchCache: Array<{ voice: YamahaVoice; searchStr: string }> = [];

  for (const voice of YAMAHA_SX920_VOICES) {
    const exactKey = `${voice.msb}-${voice.lsb}-${voice.pc}`;
    if (!exactMap.has(exactKey)) {
      exactMap.set(exactKey, voice);
    }

    const msbPcKey = `${voice.msb}-${voice.pc}`;
    if (!msbPcMap.has(msbPcKey)) {
      msbPcMap.set(msbPcKey, voice);
    }

    if (!pcMap.has(voice.pc)) {
      pcMap.set(voice.pc, voice);
    }

    // 收集此音色的所有相容舊代碼 (0-based 與 1-based) 納入雙向全文檢索
    const alias0List = getLegacyAliasesForVoice(voice.msb, voice.lsb, voice.pc, false);
    const alias1List = getLegacyAliasesForVoice(voice.msb, voice.lsb, voice.pc, true);
    const aliasTokens = [
      ...alias0List,
      ...alias0List.map(k => k.replace(/-/g, ' ')),
      ...alias1List,
      ...alias1List.map(k => k.replace(/-/g, ' ')),
    ];

    // 預先建置小寫搜尋字串 (包含 0-based 與 1-based PC、標準 MSB-LSB-PC 三聯號、相容舊代碼、中英文名稱與分類)
    const pc1Based = voice.pc + 1;
    const searchTokens = [
      voice.name.toLowerCase(),
      voice.chineseName ? voice.chineseName.toLowerCase() : '',
      voice.category.toLowerCase(),
      voice.type ? voice.type.toLowerCase() : '',
      // 0-based MIDI PC (如 0-119-88)
      `${voice.msb}-${voice.lsb}-${voice.pc}`,
      `${voice.msb} ${voice.lsb} ${voice.pc}`,
      `pc:${voice.pc}`,
      `pc ${voice.pc}`,
      voice.pc.toString(),
      // 1-based Yamaha 琴端螢幕顯示 (如 0-119-89)
      `${voice.msb}-${voice.lsb}-${pc1Based}`,
      `${voice.msb} ${voice.lsb} ${pc1Based}`,
      `pc:${pc1Based}`,
      `pc ${pc1Based}`,
      pc1Based.toString(),
      ...aliasTokens,
      voice.icon.toLowerCase(),
      voice.suitability || '',
    ].join(' ');
    searchCache.push({ voice, searchStr: searchTokens });
  }

  voiceIndex = { exactMap, msbPcMap, pcMap, searchCache };
  return voiceIndex;
}

/**
 * 智慧音色搜尋引擎
 * 支援多關鍵字、樂器分類、Multi Pad 適用度篩選，以及新舊三聯號雙向檢索
 */
export function searchYamahaVoices(
  query: string = '',
  category: VoiceCategory | 'ALL' = 'ALL',
  suitabilityFilter: VoiceSuitabilityFilter = 'ALL'
): YamahaVoice[] {
  const { exactMap, searchCache } = getVoiceIndex();
  const q = query.trim().toLowerCase();

  // 檢測是否為 Yamaha 三聯號或前綴查詢 (支援 "0-119-89", "0-119-8", "0-119-", "0 119 89")
  const tripletMatch = q.match(/^(\d+)[- ](\d+)(?:[- ](\d*))?$/);
  if (tripletMatch) {
    const m = parseInt(tripletMatch[1], 10);
    const l = parseInt(tripletMatch[2], 10);
    const pStr = tripletMatch[3] !== undefined ? tripletMatch[3] : '';
    const p = pStr !== '' ? parseInt(pStr, 10) : null;

    const matches: YamahaVoice[] = [];
    for (let i = 0; i < searchCache.length; i++) {
      const { voice } = searchCache[i];
      if (voice.msb !== m || voice.lsb !== l) continue;

      if (p === null) {
        // 僅輸入 MSB-LSB (如 "0-119" 或 "0-119-") -> 列出該 Bank 的所有音色
        matches.push(voice);
      } else {
        const pc1 = voice.pc + 1;
        const pc0 = voice.pc;
        const isExact1 = pc1 === p;
        const isExact0 = pc0 === p;
        const isPrefix1 = pc1.toString().startsWith(pStr);
        const isPrefix0 = pc0.toString().startsWith(pStr);

        if (isExact1 || isExact0 || isPrefix1 || isPrefix0) {
          matches.push(voice);
        }
      }
    }

    // 智慧排序：
    // 1. 完全符合 1-based (琴端螢幕顯示 PC) 置頂
    // 2. 完全符合 0-based (MIDI 底層數值 PC) 次之
    // 3. 1-based 前綴相符
    // 4. 0-based 前綴相符
    // 5. 依 PC 數值升冪排序
    if (p !== null && matches.length > 1) {
      matches.sort((a, b) => {
        const a1 = (a.pc + 1) === p;
        const b1 = (b.pc + 1) === p;
        if (a1 && !b1) return -1;
        if (!a1 && b1) return 1;

        const a0 = a.pc === p;
        const b0 = b.pc === p;
        if (a0 && !b0) return -1;
        if (!a0 && b0) return 1;

        const ap1 = (a.pc + 1).toString().startsWith(pStr);
        const bp1 = (b.pc + 1).toString().startsWith(pStr);
        if (ap1 && !bp1) return -1;
        if (!ap1 && bp1) return 1;

        return a.pc - b.pc;
      });
    }

    // 雙向別名擴充：若輸入的是舊版相容三聯號 (如 1-based "104-1-1" 或 0-based "104-1-0"、"8-40-76")，
    // 自動將對應的 PSR-SX920 面板旗艦音色 (如 CFX Concert Grand 104-21-1) 納入搜尋結果！
    if (p !== null) {
      // 1-based 相容別名查詢 (例如輸入 "104-1-1" 對應 0-based "104-1-0" -> 104-21-0 CFX Concert Grand)
      if (p >= 1) {
        const alias1Target = LEGACY_VOICE_ALIASES[`${m}-${l}-${p - 1}`];
        if (alias1Target) {
          const canVoice1 = exactMap.get(`${alias1Target.msb}-${alias1Target.lsb}-${alias1Target.pc}`);
          if (canVoice1 && !matches.includes(canVoice1)) {
            matches.unshift(canVoice1);
          }
        }
      }
      // 0-based 相容別名查詢 (例如輸入 "104-1-0" 或 "8-40-75")
      const alias0Target = LEGACY_VOICE_ALIASES[`${m}-${l}-${p}`];
      if (alias0Target) {
        const canVoice0 = exactMap.get(`${alias0Target.msb}-${alias0Target.lsb}-${alias0Target.pc}`);
        if (canVoice0 && !matches.includes(canVoice0)) {
          if (matches.length === 0) {
            matches.push(canVoice0);
          } else {
            matches.splice(1, 0, canVoice0);
          }
        }
      }
    }

    return matches;
  }

  const queryTokens = q ? q.split(/\s+/).filter(t => t.length > 0) : [];
  const results: YamahaVoice[] = [];

  for (let i = 0; i < searchCache.length; i++) {
    const item = searchCache[i];
    const { voice, searchStr } = item;

    // 1. 分類過濾
    if (category !== 'ALL' && voice.category !== category) {
      continue;
    }

    // 2. 適用度 / 類型過濾
    if (suitabilityFilter !== 'ALL') {
      if (suitabilityFilter === 'RECOMMENDED' && voice.suitability !== 'recommended') {
        continue;
      }
      if (suitabilityFilter === 'MEGAVOICE' && voice.type !== 'MegaVoice') {
        continue;
      }
      if (suitabilityFilter === 'SART' && voice.type !== 'S.Art!') {
        continue;
      }
      if (
        suitabilityFilter === 'LIVE_SWEET_COOL' &&
        voice.type !== 'Live!' &&
        voice.type !== 'Sweet!' &&
        voice.type !== 'Cool!'
      ) {
        continue;
      }
      if (
        suitabilityFilter === 'DRUMS' &&
        voice.category !== 'Drums' &&
        voice.category !== 'Percussion'
      ) {
        continue;
      }
      if (suitabilityFilter === 'WARNING' && voice.suitability !== 'warning') {
        continue;
      }
    }

    // 3. 關鍵字模糊多條件比對 (所有輸入的詞都要命中)
    if (queryTokens.length > 0) {
      let matched = true;
      for (const token of queryTokens) {
        if (!searchStr.includes(token)) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
    }

    results.push(voice);
  }

  return results;
}

export interface VoiceResolutionResult {
  voice: YamahaVoice | undefined;
  /** PSR-SX920 面板標準 MSB (CC 0) */
  msb: number;
  /** PSR-SX920 面板標準 LSB (CC 32) */
  lsb: number;
  /** PSR-SX920 面板標準 PC (0-based) */
  pc: number;
  /** PSR-SX920 面板 1-based 代碼字串 (如 "104-21-1") */
  panelCode: string;
  /** 檔案內原始 MSB */
  rawMsb: number;
  /** 檔案內原始 LSB */
  rawLsb: number;
  /** 檔案內原始 PC (0-based) */
  rawPc: number;
  /** 檔案內原始 1-based 代碼字串 (如 "104-1-1") */
  rawPanelCode: string;
  /** 是否經過相容舊代碼轉譯為 SX920 面板標準代碼 */
  isLegacyAlias: boolean;
  /** 若為相容舊代碼轉譯，其原始 1-based 舊代碼標籤 (如 "104-1-1") */
  legacyCodeLabel?: string;
  /** 該音色擁有的所有相容舊代碼清單 (1-based) */
  legacyAliases: string[];
  /** 完整顯示名稱 (含中英文名稱) */
  voiceName: string;
  /** 附帶代碼與相容舊碼註記之顯示字串 (如 "CFX Concert Grand (CFX 音樂會旗艦大三角鋼琴 (Concert Grand)) [104-21-1 · 相容舊碼 104-1-1]") */
  formattedDisplayWithCode: string;
}

/**
 * 依據 MSB, LSB, PC 精確尋找或模糊配對最適原廠音色 (O(1) 高速查找)
 */
export function findYamahaVoice(msb: number, lsb: number, pc: number): YamahaVoice | undefined {
  const { exactMap, msbPcMap, pcMap } = getVoiceIndex();

  const exactKey = `${msb}-${lsb}-${pc}`;

  // 1. 優先檢查歷史相容別名 (Legacy Triplet Aliases)
  const legacyAlias = LEGACY_VOICE_ALIASES[exactKey];
  if (legacyAlias) {
    const aliasVoice = exactMap.get(`${legacyAlias.msb}-${legacyAlias.lsb}-${legacyAlias.pc}`);
    if (aliasVoice) return aliasVoice;
  }

  // 2. 三聯號完全吻合 (MSB, LSB, PC 均符合)
  const exact = exactMap.get(`${msb}-${lsb}-${pc}`);
  if (exact) return exact;

  // 3. 次要吻合：若 MSB 相同且 PC 相同 (忽略小改版 LSB)
  const msbPc = msbPcMap.get(`${msb}-${pc}`);
  if (msbPc) return msbPc;

  // 4. 通用備用：僅 PC 相同 (相容 GM/XG 標準樂器)
  return pcMap.get(pc);
}

/**
 * 解析音色並完整回傳 PSR-SX920 面板標準三聯號與相容舊代碼雙向資訊
 * 優先呈現 SX920 面板標準名稱與代碼 (如 104-21-1)，同時保留並標註檔案原始舊代碼 (如 104-1-1)
 */
export function resolveYamahaVoiceWithAlias(
  msb: number,
  lsb: number,
  pc: number
): VoiceResolutionResult {
  const voice = findYamahaVoice(msb, lsb, pc);
  const cMsb = voice ? voice.msb : msb;
  const cLsb = voice ? voice.lsb : lsb;
  const cPc = voice ? voice.pc : pc;

  const panelCode = `${cMsb}-${cLsb}-${cPc + 1}`;
  const rawPanelCode = `${msb}-${lsb}-${pc + 1}`;
  const isLegacyAlias = Boolean(
    voice && (voice.msb !== msb || voice.lsb !== lsb || voice.pc !== pc)
  );
  const legacyCodeLabel = isLegacyAlias ? rawPanelCode : undefined;

  const legacyAliases = getLegacyAliasesForVoice(cMsb, cLsb, cPc, true);
  if (isLegacyAlias && !legacyAliases.includes(rawPanelCode)) {
    legacyAliases.unshift(rawPanelCode);
  }

  const voiceName = voice
    ? voice.chineseName && voice.chineseName !== voice.name
      ? `${voice.name} (${voice.chineseName})`
      : voice.name
    : `Voice (${rawPanelCode})`;

  const formattedDisplayWithCode = isLegacyAlias
    ? `${voiceName} [${panelCode} · 相容舊碼 ${rawPanelCode}]`
    : `${voiceName} [${panelCode}]`;

  return {
    voice,
    msb: cMsb,
    lsb: cLsb,
    pc: cPc,
    panelCode,
    rawMsb: msb,
    rawLsb: lsb,
    rawPc: pc,
    rawPanelCode,
    isLegacyAlias,
    legacyCodeLabel,
    legacyAliases,
    voiceName,
    formattedDisplayWithCode,
  };
}

/**
 * 智慧解析試聽樂器聲音物理/諧波合成模型 (相容 Yamaha PSR-SX920 1,500+ 音色庫、General MIDI 128 樂器家族與原廠伴奏通道)
 */
export function resolveAuditionInstrumentId(
  msb: number = 0,
  lsb: number = 0,
  pc: number = 0,
  ch?: number
): { instrumentId: string; isDrum: boolean } {
  // 1. 優先在 Yamaha PSR-SX920 原廠 1,500+ 音色庫中精確查找
  const yVoice = findYamahaVoice(msb, lsb, pc);
  const isDrumCategory =
    yVoice?.category === 'Drums' ||
    (yVoice?.category === 'Percussion' && (msb === 127 || msb === 126 || ch === 9));

  // 2. 打擊樂器 / 鼓組判定
  // 判定原則：
  // a. Bank MSB 為 127 (標準鼓組) 或 126 (SFX Kit)
  // b. PC >= 120 (GM 打擊音效)
  // c. 音色庫分類明確為 Drums 或 Percussion
  // d. 僅在 MIDI Ch 10 (channel index 9, 即 Main Rhythm) 且非明確指定為旋律音色 (msb !== 0) 時預設為鼓組
  // 注意：MIDI Ch 9 (channel index 8, 即 Sub Rhythm) 在 Yamaha 伴奏中經常擔任跳躍撥弦 (Pizzicato)、敲擊樂或打擊旋律，絕不能強制設為鼓組！
  const isDrum = msb === 127 || msb === 126 || pc >= 120 || isDrumCategory || (ch === 9 && msb !== 0);

  if (isDrum) {
    return { instrumentId: 'standard-drum-kit', isDrum: true };
  }

  // 3. 依據 Yamaha 原廠音色分類對應合成器聲音模型
  if (yVoice) {
    if (yVoice.category === 'Bass') {
      return { instrumentId: 'electric-bass', isDrum: false };
    }
    if (yVoice.category === 'Guitar') {
      return { instrumentId: 'steel_guitar', isDrum: false };
    }
    if (yVoice.category === 'Strings') {
      return { instrumentId: yVoice.id.includes('pizz') ? 'pizzicato' : 'strings', isDrum: false };
    }
    if (yVoice.category === 'Saxophone') {
      return { instrumentId: 'wind_sax', isDrum: false };
    }
    if (yVoice.category === 'Brass') {
      return { instrumentId: 'brass', isDrum: false };
    }
    if (yVoice.category === 'Woodwind') {
      return { instrumentId: 'flute', isDrum: false };
    }
    if (yVoice.category === 'Synth' || yVoice.category === 'Pad') {
      return { instrumentId: 'synth_pad', isDrum: false };
    }
    if (yVoice.category === 'Piano' || yVoice.category === 'E.Piano' || yVoice.category === 'Organ' || yVoice.category === 'Accordion') {
      return { instrumentId: 'grand-piano', isDrum: false };
    }
  }

  // 4. 通用 General MIDI (GM) 128 種樂器家族全覆蓋分類
  if (pc >= 24 && pc <= 31) {
    // 吉他類 (Nylon, Steel, Jazz, Clean, Muted, Overdrive, Distortion, Harmonics)
    return { instrumentId: 'steel_guitar', isDrum: false };
  }
  if (pc >= 32 && pc <= 39) {
    // 貝斯類 (Acoustic, Finger, Pick, Fretless, Slap 1/2, Synth Bass 1/2)
    return { instrumentId: 'electric-bass', isDrum: false };
  }
  if (pc === 45) {
    // 撥弦 (Pizzicato Strings)
    return { instrumentId: 'pizzicato', isDrum: false };
  }
  if ((pc >= 40 && pc <= 44) || (pc >= 46 && pc <= 55)) {
    // 弦樂獨奏與弦樂合奏群 (Violin, Viola, Cello, Strings, Synth Strings, Choir, Voice)
    return { instrumentId: 'strings', isDrum: false };
  }
  if (pc >= 56 && pc <= 63) {
    // 銅管組 (Trumpet, Trombone, Tuba, French Horn, Brass Section, Synth Brass)
    return { instrumentId: 'brass', isDrum: false };
  }
  if (pc >= 64 && pc <= 71) {
    // 簧樂/薩克斯風組 (Soprano, Alto, Tenor, Baritone, Oboe, Clarinet, etc.)
    return { instrumentId: 'wind_sax', isDrum: false };
  }
  if (pc >= 72 && pc <= 79) {
    // 管樂/長笛組 (Piccolo, Flute, Recorder, Pan Flute, Whistle, Ocarina)
    return { instrumentId: 'flute', isDrum: false };
  }
  if (pc >= 80 && pc <= 87) {
    // 合成主奏 (Synth Lead: Square, Sawtooth, etc.)
    return { instrumentId: 'synth_lead', isDrum: false };
  }
  if (pc >= 88 && pc <= 95) {
    // 鋪底音色 (Synth Pad: Warm Pad, Poly Synth, Bowed Pad, etc.)
    return { instrumentId: 'synth_pad', isDrum: false };
  }
  if (pc >= 8 && pc <= 15) {
    // 鐵琴/木琴/鍾琴 (Chromatic Percussion)
    return { instrumentId: 'pizzicato', isDrum: false };
  }

  // 5. 通用 Bass 通道回退 (MIDI Ch 11, index 10)
  if (ch === 10 || ch === 1) {
    return { instrumentId: 'electric-bass', isDrum: false };
  }

  return { instrumentId: 'grand-piano', isDrum: false };
}

/**
 * 判斷指定音色是否為 Yamaha 專屬之 MegaVoice (兆級音色)
 * 依據 Yamaha 官方 Data List 與伴奏手冊 (P.31)，MegaVoice 在 C6 (音高 ≥ 96) 為琴弦摩擦、敲琴板、掃弦雜音等特殊演奏法取樣，嚴禁轉調。
 */
export function isMegaVoice(
  msb: number,
  lsb: number = 0,
  pc: number = 0,
  voiceName?: string
): boolean {
  if (voiceName && (voiceName.toLowerCase().includes('mega') || voiceName.includes('兆級'))) {
    return true;
  }
  const voice = findYamahaVoice(msb, lsb, pc);
  if (voice) {
    if (voice.type === 'MegaVoice') return true;
    if (voice.name.toLowerCase().includes('mega')) return true;
    if (voice.chineseName && voice.chineseName.includes('兆級')) return true;
  }
  return false;
}
