import { MidiSongAnalyzer, type MidiSongAnalysis, type MidiChannelAnalysis } from '../parser/midi-song-analyzer';
import type { YamahaFileParsed } from '../models/types';

/**
 * Yamaha 原廠 8 大伴奏聲部定義 (Ch 9 ~ 16，0-based 為 8 ~ 15)
 */
export type YamahaPartType =
  | 'Rhythm1' // Ch 9 (Sub Rhythm / 打擊效果)
  | 'Rhythm2' // Ch 10 (Main Drums / 主打擊鼓組)
  | 'Bass'    // Ch 11 (Bass / 伴奏貝斯)
  | 'Chord1'  // Ch 12 (Chord 1 / 核心節奏和弦: 鋼琴/吉他)
  | 'Chord2'  // Ch 13 (Chord 2 / 次要伴奏和弦: 電鋼琴/分解和弦)
  | 'Pad'     // Ch 14 (Pad / 鋪底長音弦樂/合成音色)
  | 'Phrase1' // Ch 15 (Phrase 1 / 裝飾樂句: 銅管/木管短音)
  | 'Phrase2';// Ch 16 (Phrase 2 / 自由加花: 吉他花音/特色獨奏)

export interface YamahaPartDestination {
  part: YamahaPartType;
  channel: number;      // 8 ~ 15 (0-based)
  displayChannel: number; // 9 ~ 16
  nameZh: string;
  defaultRole: string;
}

export const YAMAHA_ARRANGER_PARTS: YamahaPartDestination[] = [
  { part: 'Rhythm2', channel: 9, displayChannel: 10, nameZh: '主鼓組 (Rhythm 2)', defaultRole: '主鼓點/節奏骨幹' },
  { part: 'Rhythm1', channel: 8, displayChannel: 9, nameZh: '副打擊 (Rhythm 1)', defaultRole: '搖鈴/敲擊/輔助節奏' },
  { part: 'Bass', channel: 10, displayChannel: 11, nameZh: '貝斯 (Bass)', defaultRole: '低音根音/律動底盤' },
  { part: 'Chord1', channel: 11, displayChannel: 12, nameZh: '和弦一 (Chord 1)', defaultRole: '主要和弦/鋼琴/吉他' },
  { part: 'Chord2', channel: 12, displayChannel: 13, nameZh: '和弦二 (Chord 2)', defaultRole: '次要和弦/分解琶音' },
  { part: 'Pad', channel: 13, displayChannel: 14, nameZh: '鋪底 (Pad)', defaultRole: '長音背景/弦樂合奏' },
  { part: 'Phrase1', channel: 14, displayChannel: 15, nameZh: '樂句一 (Phrase 1)', defaultRole: '裝飾呼應/管樂短音' },
  { part: 'Phrase2', channel: 15, displayChannel: 16, nameZh: '樂句二 (Phrase 2)', defaultRole: '特色加花/撥奏/副線' },
];

/**
 * 通道主旋律判定分數與明細
 */
export interface MelodyDetectionResult {
  isMelody: boolean;
  confidence: number;      // 0 ~ 100 信心指數
  reasons: string[];       // 判定原因
  isUserOverridden?: boolean;
}

/**
 * 單一 MIDI 通道映射指派結果
 */
export interface ChannelMappingAssignment {
  sourceChannel: number;       // 0 ~ 15 (原始 MIDI 通道)
  displaySourceChannel: number;// 1 ~ 16
  voiceName: string;
  category: string;
  trackNames: string[];
  noteCount: number;
  melodyInfo: MelodyDetectionResult;
  isExcluded: boolean;         // 是否排除在伴奏之外 (預設 true 若 isMelody === true)
  targetPart: YamahaPartType | null; // 映射到的 Yamaha 伴奏聲部，若排除則為 null
  targetChannel: number | null;// 8 ~ 15
  autoAssignedPart: YamahaPartType | null; // 演算法建議的伴奏聲部
}

/**
 * 全曲聲部映射方案總表
 */
export interface SongPartMappingPlan {
  totalActiveChannels: number;
  excludedCount: number;
  assignedCount: number;
  assignments: ChannelMappingAssignment[];
  partToSourceChannelMap: Map<YamahaPartType, number>; // 每個 Yamaha 聲部對應的原始 MIDI 通道
}

/**
 * 聲部映射與主旋律智慧識別引擎
 */
export class MidiPartAssignMatrix {
  private static readonly MELODY_KEYWORDS = [
    'melody', 'lead', 'vocal', 'voice', 'solo', 'singer', 'main', 'song',
    '主旋律', '人聲', '主唱', '歌聲', '主奏', '笛', 'flute', 'sax', 'trumpet'
  ];

  private static readonly ACCOMP_KEYWORDS = [
    'chord', 'acmp', 'back', 'bg', 'pad', 'str', 'string', 'rhythm',
    'bass', 'drum', 'perc', 'gtr', 'guitar', 'piano', 'ep', 'key',
    '伴奏', '和弦', '底', '節奏', '鼓', '貝斯'
  ];

  /**
   * 智慧分析單一通道是否為主旋律軌 (Melody Detection Heuristics)
   */
  public static detectMelody(ch: MidiChannelAnalysis): MelodyDetectionResult {
    // 1. 鼓組 (CH 10 或 isDrum) 絕對不是主旋律
    if (ch.isDrum || ch.channel === 9) {
      return { isMelody: false, confidence: 0, reasons: ['打擊樂器鼓組'] };
    }

    // 2. 貝斯 (Bass) 絕對不是主旋律
    if (ch.category === 'Bass' || (ch.pitchMax !== null && ch.pitchMax < 48)) {
      return { isMelody: false, confidence: 0, reasons: ['低音樂器/貝斯聲部'] };
    }

    // 3. 沒有音符的通道
    if (!ch.hasNotes || ch.noteCount === 0) {
      return { isMelody: false, confidence: 0, reasons: ['無有效音符'] };
    }

    let score = 0;
    const reasons: string[] = [];

    // 特徵 A: 軌道名稱關鍵字分析
    const trkNamesLower = ch.trackNames.map(n => n.toLowerCase()).join(' ');
    for (const kw of this.MELODY_KEYWORDS) {
      if (trkNamesLower.includes(kw)) {
        score += 45;
        reasons.push(`軌道名稱包含主旋律關鍵字「${kw}」`);
        break;
      }
    }

    for (const kw of this.ACCOMP_KEYWORDS) {
      if (trkNamesLower.includes(kw)) {
        score -= 30;
        reasons.push(`軌道名稱包含伴奏關鍵字「${kw}」`);
        break;
      }
    }

    // 特徵 B: 樂器音色類別判定
    if (ch.category === 'Woodwind' || ch.category === 'Saxophone') {
      score += 30;
      reasons.push(`使用管樂/薩克斯風等常見旋律樂器 (${ch.category})`);
    } else if (ch.category === 'Brass') {
      score += 15;
      reasons.push(`使用銅管樂器 (${ch.category})`);
    } else if (ch.category === 'Strings') {
      // 若弦樂音域非常高且名稱未標明合奏/背景，可能是小提琴主奏
      if (ch.pitchMin !== null && ch.pitchMin >= 60 && !trkNamesLower.includes('pad') && !trkNamesLower.includes('back')) {
        score += 10;
        reasons.push('高音弦樂旋律線');
      }
    }

    // 特徵 C: 音高範圍分析 (流行歌主旋律通常集中在 C4 ~ A5，即 MIDI 60 ~ 81)
    if (ch.pitchMin !== null && ch.pitchMax !== null) {
      if (ch.pitchMin >= 55 && ch.pitchMax <= 90) {
        score += 20;
        reasons.push(`音域 (${ch.pitchRangeLabel}) 處於人聲/主奏黃金音高區 (G3 ~ F#6)`);
      }
    }

    // 特徵 D: 典型通用 MIDI 主旋律通道慣例 (CH 1, CH 2, CH 4 常作為 Vocal / Solo)
    if (ch.channel === 0 || ch.channel === 1 || ch.channel === 3) {
      score += 10;
      reasons.push(`常規主奏通道 (CH ${ch.displayChannel})`);
    }

    // 歸納判定
    const confidence = Math.max(0, Math.min(100, score));
    const isMelody = confidence >= 50;

    return {
      isMelody,
      confidence,
      reasons: reasons.length > 0 ? reasons : ['常規伴奏樂器']
    };
  }

  /**
   * 針對全曲或指定切片小節區段進行 8 大伴奏聲部的最佳化自動分配 (Part Assignment Engine)
   * 若提供 sliceContext，將自動動態嗅探該小節起始點之最新生效音色與該區間音符數
   */
  public static createAutoMappingPlan(
    analysis: MidiSongAnalysis,
    sliceContext?: {
      sourceParsed: YamahaFileParsed;
      startBar: number;
      endBar: number;
    }
  ): SongPartMappingPlan {
    const activeChannels = analysis.activeChannels.filter(c => c.hasNotes && c.noteCount > 0);
    const assignments: ChannelMappingAssignment[] = [];
    const partToSourceChannelMap = new Map<YamahaPartType, number>();

    // 若有切片上下文，預先統計該區間 [startTick, endTick) 內各通道的音符數
    const sliceNoteCountMap = new Map<number, number>();
    if (sliceContext) {
      const division = sliceContext.sourceParsed.division || 480;
      const timeSig = sliceContext.sourceParsed.timeSignature || { numerator: 4, denominator: 4 };
      const num = timeSig.numerator || 4;
      const den = timeSig.denominator || 4;
      const ticksPerBar = Math.max(1, Math.round(division * num * (4 / den)));
      const startTick = Math.max(0, (sliceContext.startBar - 1) * ticksPerBar);
      const endTick = sliceContext.endBar * ticksPerBar;

      for (const track of sliceContext.sourceParsed.tracks) {
        let curTick = 0;
        for (const ev of track.events) {
          curTick += ev.delta;
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
            if (curTick >= startTick && curTick < endTick) {
              sliceNoteCountMap.set(ev.channel, (sliceNoteCountMap.get(ev.channel) || 0) + 1);
            }
          }
        }
      }
    }

    // 1. 初步分析各通道的主旋律特徵 (若有切片區間，採用該小節起始當下生效之最新音色與該區段音符數)
    for (const ch of activeChannels) {
      let vName = ch.voiceName;
      let cat = ch.category;
      let noteCount = ch.noteCount;

      if (sliceContext) {
        const eff = MidiSongAnalyzer.getEffectiveVoiceAtBar(
          sliceContext.sourceParsed,
          ch.channel,
          sliceContext.startBar
        );
        vName = eff.voiceName;
        cat = eff.category;
        noteCount = sliceNoteCountMap.get(ch.channel) || 0;
      }

      const melodyInfo = sliceContext
        ? this.detectMelody({ ...ch, category: cat, voiceName: vName, noteCount })
        : this.detectMelody(ch);

      assignments.push({
        sourceChannel: ch.channel,
        displaySourceChannel: ch.displayChannel,
        voiceName: vName,
        category: cat,
        trackNames: ch.trackNames,
        noteCount,
        melodyInfo,
        isExcluded: melodyInfo.isMelody, // 預設排除主旋律
        targetPart: null,
        targetChannel: null,
        autoAssignedPart: null,
      });
    }

    // 待分配的伴奏候選通道 (未被排除的通道)
    const candidates = assignments.filter(a => !a.isExcluded);

    // 2. 階段一：指派核心骨幹 (主鼓組與貝斯，優先挑選該區段有發聲音符者)
    // 2.1 主鼓組 (Rhythm 2: Ch 10)
    const mainDrum = candidates.find(a => (a.sourceChannel === 9 || a.category === 'Drums') && a.noteCount > 0)
      || candidates.find(a => a.sourceChannel === 9 || a.category === 'Drums');
    if (mainDrum) {
      this.bindPart(mainDrum, 'Rhythm2', partToSourceChannelMap);
    }

    // 2.2 貝斯 (Bass: Ch 11)
    const mainBass = candidates.find(a => a.targetPart === null && (a.category === 'Bass' || a.sourceChannel === 10) && a.noteCount > 0)
      || candidates.find(a => a.targetPart === null && (a.category === 'Bass' || a.sourceChannel === 10));
    if (mainBass) {
      this.bindPart(mainBass, 'Bass', partToSourceChannelMap);
    }

    // 2.3 輔助打擊 (Rhythm 1: Ch 9) - 優先分配明確為鼓組 (Drums) 或非旋律打擊
    const subDrum = candidates.find(a =>
      a.targetPart === null &&
      (a.category === 'Drums' || (a.category === 'Percussion' && a.trackNames.some(t => t.toLowerCase().includes('perc') || t.toLowerCase().includes('drum')))) &&
      a.noteCount > 0
    ) || candidates.find(a =>
      a.targetPart === null &&
      (a.category === 'Drums' || (a.category === 'Percussion' && a.trackNames.some(t => t.toLowerCase().includes('perc') || t.toLowerCase().includes('drum'))))
    );
    if (subDrum && !partToSourceChannelMap.has('Rhythm1')) {
      this.bindPart(subDrum, 'Rhythm1', partToSourceChannelMap);
    }

    // 3. 階段二：指派和弦與長音鋪底 (Chord 1, Chord 2, Pad)
    // 3.1 核心和弦 Chord 1 (鋼琴 / 鍵盤優先，若無則吉他)
    const chord1Cand = candidates.find(a =>
      a.targetPart === null && (a.category === 'Piano' || a.category === 'E.Piano') && a.noteCount > 0
    ) || candidates.find(a =>
      a.targetPart === null && a.category.includes('Guitar') && a.noteCount > 0
    ) || candidates.find(a =>
      a.targetPart === null && (a.category === 'Piano' || a.category === 'E.Piano')
    ) || candidates.find(a =>
      a.targetPart === null && a.category.includes('Guitar')
    );
    if (chord1Cand && !partToSourceChannelMap.has('Chord1')) {
      this.bindPart(chord1Cand, 'Chord1', partToSourceChannelMap);
    }

    // 3.2 次要和弦 Chord 2 (優先挑選音符數最多的伴奏吉他 / 鍵盤)
    const guitarCandidates = candidates
      .filter(a => a.targetPart === null && a.category.includes('Guitar'))
      .sort((a, b) => b.noteCount - a.noteCount);

    const chord2Cand = guitarCandidates[0] || candidates.find(a =>
      a.targetPart === null && (a.category === 'Piano' || a.category === 'E.Piano' || a.category === 'Organ') && a.noteCount > 0
    ) || candidates.find(a =>
      a.targetPart === null && (a.category === 'Piano' || a.category === 'E.Piano' || a.category === 'Organ')
    );
    if (chord2Cand && !partToSourceChannelMap.has('Chord2')) {
      this.bindPart(chord2Cand, 'Chord2', partToSourceChannelMap);
    }

    // 3.3 鋪底長音 Pad (弦樂 / 合成音色 Pad)
    const padCand = candidates.find(a => a.targetPart === null && (a.category.includes('Strings') || a.category.includes('Pad') || a.category.includes('Choir')));
    if (padCand && !partToSourceChannelMap.has('Pad')) {
      this.bindPart(padCand, 'Pad', partToSourceChannelMap);
    }

    // 4. 階段三：指派裝飾樂句 (Phrase 1, Phrase 2)
    // 銅管、木管、旋律敲擊 (如顫音琴 Vibraphone/Bell) 或加花樂器
    const phrase1Cand = candidates.find(a =>
      a.targetPart === null &&
      (a.category.includes('Brass') || a.category.includes('Sax') || a.category.includes('Woodwind') || a.category === 'Percussion')
    );
    if (phrase1Cand && !partToSourceChannelMap.has('Phrase1')) {
      this.bindPart(phrase1Cand, 'Phrase1', partToSourceChannelMap);
    }

    const phrase2Cand = candidates.find(a => a.targetPart === null);
    if (phrase2Cand && !partToSourceChannelMap.has('Phrase2')) {
      this.bindPart(phrase2Cand, 'Phrase2', partToSourceChannelMap);
    }

    // 5. 填補尚未指派的伴奏聲部空缺 (若還有剩餘候選伴奏軌)
    const remainingParts: YamahaPartType[] = [
      'Chord1', 'Chord2', 'Pad', 'Phrase1', 'Phrase2', 'Rhythm1'
    ];

    for (const part of remainingParts) {
      if (!partToSourceChannelMap.has(part)) {
        const nextUnassigned = candidates.find(a => a.targetPart === null);
        if (nextUnassigned) {
          this.bindPart(nextUnassigned, part, partToSourceChannelMap);
        }
      }
    }

    const excludedCount = assignments.filter(a => a.isExcluded).length;
    const assignedCount = assignments.filter(a => a.targetPart !== null).length;

    return {
      totalActiveChannels: assignments.length,
      excludedCount,
      assignedCount,
      assignments,
      partToSourceChannelMap,
    };
  }

  private static bindPart(
    assignment: ChannelMappingAssignment,
    part: YamahaPartType,
    map: Map<YamahaPartType, number>
  ) {
    const partDef = YAMAHA_ARRANGER_PARTS.find(p => p.part === part)!;
    assignment.targetPart = part;
    assignment.targetChannel = partDef.channel;
    assignment.autoAssignedPart = part;
    map.set(part, assignment.sourceChannel);
  }
}
