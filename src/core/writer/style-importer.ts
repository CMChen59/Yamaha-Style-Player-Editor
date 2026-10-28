/**
 * Yamaha Style 伴奏風格 (.STY) 外部 MIDI 匯入分流與 8 聲部智慧映射引擎
 * 依據 Yamaha SFF2 / PSR-SX920 8 伴奏聲部規範
 */

import { MidiImporter, type MidiSourceAnalysis, type MidiSourceTrackSummary } from './midi-importer';
import { YamahaStyleSynthesizer } from './style-synthesizer';
import { YamahaStyleAssembly } from './style-assembly';
import { type StylePoolEntry } from './style-remixer';
import {
  DEFAULT_STYLE_PARTS,
  type StylePartId,
  type StyleSectionType,
  type StylePartConfig,
  type StyleNoteEvent,
  type StyleSectionConfig,
} from '../models/style-types';
import type { YamahaFileParsed } from '../models/types';

export type InstrumentCategory =
  | 'drums'
  | 'percussion'
  | 'bass'
  | 'piano'
  | 'guitar'
  | 'strings'
  | 'pad'
  | 'brass'
  | 'reed'
  | 'lead'
  | 'other';

export interface StyleTrackAnalysis extends MidiSourceTrackSummary {
  minPitch: number;
  maxPitch: number;
  avgPitch: number;
  avgDurationTicks: number;
  polyphonyRatio: number;
  detectedCategory: InstrumentCategory;
  recommendedPart: StylePartId | null;
  recommendationReason: string;
  alternativeParts: { partId: StylePartId; reason: string }[];
}

export interface KeyDetectionResult {
  key: string;            // 例如 'G Major', 'C Major', 'A Minor'
  root: string;           // 例如 'G', 'C', 'A'
  mode: 'major' | 'minor';
  semitonesToC: number;   // 將原曲根音轉調至 C 基準所需的半音位移量 (例如 G -> -7, F -> -5, D -> -2)
  confidence: number;     // 0 ~ 1 信心度
  tonicPitchClass: number; // 0 ~ 11 (0=C, 1=C#, etc.)
}

export const ROOT_TO_C_SHIFT: Record<string, number> = {
  'C': 0,
  'C#': -1,
  'Db': -1,
  'D': -2,
  'D#': -3,
  'Eb': -3,
  'E': -4,
  'F': -5,
  'F#': -6,
  'Gb': -6,
  'G': -7,
  'G#': 4,
  'Ab': 4,
  'A': 3,
  'A#': 2,
  'Bb': 2,
  'B': 1,
};

export interface SectionScoutResult {
  firstDrumBar: number | null;
  introRange: { start: number; end: number; bars: number };
  mainRange: { start: number; end: number; bars: number };
  chorusRange: { start: number; end: number; bars: number };
  endingRange: { start: number; end: number; bars: number };
  drumEntryDescription: string;
  chorusDescription: string;
  summary: string;
}

export interface StyleSourceAnalysis extends MidiSourceAnalysis {
  styleTracks: StyleTrackAnalysis[];
  autoMapping: Partial<Record<StylePartId, number>>;
  detectedKey?: KeyDetectionResult;
  scoutResult?: SectionScoutResult;
}

export interface StylePartMappingItem {
  partId: StylePartId;
  sourceTrackIndex: number | null; // null 表示不指定/留空
  voice?: {
    msb?: number;
    lsb?: number;
    pc?: number;
    volume?: number;
    pan?: number;
    reverb?: number;
    chorus?: number;
  };
  transposeShift?: number; // 半音位移
}

export interface StyleSectionSliceConfig {
  id?: string;
  sectionName: StyleSectionType | string;
  startBar: number; // 1-indexed, 起始小節
  endBar: number;   // 1-indexed, 結束小節
  chordRoot?: string; // 選填自訂 C 基準轉調
}

export interface StyleImportOptions {
  projectName: string;
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  startBar?: number; // 1-indexed, default 1 (單段落模式相容)
  endBar?: number;   // 1-indexed, default 4 or 8 (單段落模式相容)
  targetSection?: StyleSectionType; // default 'Main A' (單段落模式相容)
  sections?: StyleSectionSliceConfig[]; // Phase 3.3: 全曲多段落切片配置清單
  partMappings: StylePartMappingItem[];
  normalizeToCRoot?: boolean; // Phase 3.3: 自動轉調為 Yamaha 原廠 C 基準 (預設 true)
  rootKeyOverride?: string;   // 手動指定原曲調性 (例如 'G', 'F', 'D')
  manualChordShift?: number;  // 手動覆寫和弦移調半音數
}

export interface SampleInjectionOptions {
  startBar: number;
  endBar: number;
  partMappings: StylePartMappingItem[];
  normalizeToCRoot?: boolean;
  rootKeyOverride?: string;
  manualChordShift?: number;
  copyMode?: 'replace' | 'merge';
  bpm?: number;
}

export interface SampleInjectionResult {
  success: boolean;
  destSection: string;
  notesInjected: number;
  sampledBars: number;
  partsUpdated: StylePartId[];
  message: string;
}


export class StyleImporter {
  /**
   * 智慧分析外部 MIDI，評估音軌音樂特徵並自動推薦對應 Yamaha Style 8 伴奏聲部
   */
  public static analyzeForStyle(
    input: MidiSourceAnalysis | Uint8Array,
    fileName: string = 'imported.mid'
  ): StyleSourceAnalysis {
    const baseAnalysis: MidiSourceAnalysis =
      input instanceof Uint8Array ? MidiImporter.analyzeMidi(input, fileName) : input;

    const styleTracks: StyleTrackAnalysis[] = baseAnalysis.tracks.map((track) => {
      return StyleImporter.analyzeSingleTrack(track, baseAnalysis.division);
    });

    // 執行 8 聲部智慧分配裁決演算法
    const autoMapping = StyleImporter.allocateParts(styleTracks);

    // 執行全曲調性偵測 (Krumhansl-Schmuckler Key-Finding Algorithm)
    const detectedKey = StyleImporter.detectKeySignature(baseAnalysis.tracks, baseAnalysis.division);

    const result: StyleSourceAnalysis = {
      ...baseAnalysis,
      styleTracks,
      autoMapping,
      detectedKey,
    };

    result.scoutResult = StyleImporter.detectSongStructureScout(result);
    return result;
  }

  /**
   * 單音軌音樂特徵剖析
   */
  private static analyzeSingleTrack(
    track: MidiSourceTrackSummary,
    division: number
  ): StyleTrackAnalysis {
    if (track.notes.length === 0) {
      return {
        ...track,
        minPitch: 0,
        maxPitch: 0,
        avgPitch: 0,
        avgDurationTicks: 0,
        polyphonyRatio: 1.0,
        detectedCategory: 'other',
        recommendedPart: null,
        recommendationReason: '音軌無音符事件 (通常為導引軌或純控制器軌)',
        alternativeParts: [],
      };
    }

    let minPitch = 127;
    let maxPitch = 0;
    let sumPitch = 0;
    let sumDuration = 0;

    // 計算重疊度 (Polyphony)
    const tickNoteCountMap = new Map<number, number>();

    for (const n of track.notes) {
      if (n.note < minPitch) minPitch = n.note;
      if (n.note > maxPitch) maxPitch = n.note;
      sumPitch += n.note;
      sumDuration += n.durationTick;

      // 採 1/16 拍精度統計同時發聲數
      const quantizedTick = Math.round(n.startTick / (division / 4)) * (division / 4);
      tickNoteCountMap.set(quantizedTick, (tickNoteCountMap.get(quantizedTick) || 0) + 1);
    }

    const avgPitch = Math.round(sumPitch / track.notes.length);
    const avgDurationTicks = Math.round(sumDuration / track.notes.length);

    let maxSimultaneous = 1;
    let totalChordMoments = 0;
    for (const count of tickNoteCountMap.values()) {
      if (count > maxSimultaneous) maxSimultaneous = count;
      if (count >= 2) totalChordMoments++;
    }
    const polyphonyRatio = Number((totalChordMoments / Math.max(1, tickNoteCountMap.size)).toFixed(2));

    // 樂器類別自動推斷
    const detectedCategory = StyleImporter.detectCategory(track, avgPitch, avgDurationTicks, division);

    // 推薦初評
    const { recommendedPart, recommendationReason, alternativeParts } =
      StyleImporter.evaluateInitialRecommendation(track, detectedCategory, avgPitch, avgDurationTicks, division, polyphonyRatio);

    return {
      ...track,
      minPitch,
      maxPitch,
      avgPitch,
      avgDurationTicks,
      polyphonyRatio,
      detectedCategory,
      recommendedPart,
      recommendationReason,
      alternativeParts,
    };
  }

  /**
   * 推斷樂器分類 (Category)
   */
  private static detectCategory(
    track: MidiSourceTrackSummary,
    avgPitch: number,
    avgDurationTicks: number,
    division: number
  ): InstrumentCategory {
    const nameLower = (track.name || '').toLowerCase();
    const pc = track.programChange ?? -1;
    const isChannel10 = track.channel === 9; // MIDI Ch 10 is 0-indexed 9

    // 1. 鼓組與打擊樂判斷
    if (isChannel10 || nameLower.includes('drum') || nameLower.includes('kit') || nameLower.includes('beat')) {
      return 'drums';
    }
    if (nameLower.includes('perc') || nameLower.includes('latin') || nameLower.includes('conga') || nameLower.includes('tambourine')) {
      return 'percussion';
    }

    // 1.5 主旋律 / 導唱判斷 (Melody / Vocal / Lead)
    if (
      nameLower.includes('melody') ||
      nameLower.includes('vocal') ||
      nameLower.includes('lead') ||
      nameLower.includes('solo') ||
      nameLower.includes('主旋律') ||
      nameLower.includes('主唱') ||
      nameLower.includes('導唱') ||
      nameLower.includes('歌') ||
      nameLower.includes('唱') ||
      (pc >= 80 && pc <= 87)
    ) {
      return 'lead';
    }

    // 2. 貝斯判斷
    if (nameLower.includes('bass') || (pc >= 32 && pc <= 39) || (avgPitch <= 48 && avgDurationTicks >= division * 0.5)) {
      return 'bass';
    }

    // 3. 鋼琴 / 鍵盤
    if (nameLower.includes('piano') || nameLower.includes('ep') || nameLower.includes('key') || (pc >= 0 && pc <= 7)) {
      return 'piano';
    }

    // 4. 吉他
    if (nameLower.includes('guitar') || nameLower.includes('gt') || nameLower.includes('gtr') || (pc >= 24 && pc <= 31)) {
      return 'guitar';
    }

    // 5. 弦樂
    if (nameLower.includes('string') || nameLower.includes('str') || (pc >= 40 && pc <= 51)) {
      return 'strings';
    }

    // 6. 長音 Pad / 合成器背景
    if (nameLower.includes('pad') || nameLower.includes('warm') || nameLower.includes('sweep') || (pc >= 88 && pc <= 95)) {
      return 'pad';
    }

    // 7. 銅管 / 木管
    if (nameLower.includes('brass') || nameLower.includes('horn') || nameLower.includes('trumpet') || (pc >= 56 && pc <= 63)) {
      return 'brass';
    }
    if (nameLower.includes('sax') || nameLower.includes('flute') || (pc >= 64 && pc <= 79)) {
      return 'reed';
    }

    // 8. 主奏 Lead
    if (nameLower.includes('lead') || (pc >= 80 && pc <= 87)) {
      return 'lead';
    }

    // 9. 依音高與時值備援推斷
    if (avgPitch <= 50) return 'bass';
    if (avgDurationTicks >= division * 2) return 'pad';

    return 'other';
  }

  /**
   * 初步評估單軌推薦與理由
   */
  private static evaluateInitialRecommendation(
    track: MidiSourceTrackSummary,
    cat: InstrumentCategory,
    avgPitch: number,
    avgDurationTicks: number,
    division: number,
    polyphonyRatio: number
  ): {
    recommendedPart: StylePartId | null;
    recommendationReason: string;
    alternativeParts: { partId: StylePartId; reason: string }[];
  } {
    const isChannel10 = track.channel === 9;

    if (cat === 'drums' || isChannel10) {
      return {
        recommendedPart: 'Rhythm2',
        recommendationReason: isChannel10
          ? 'MIDI 通道 10 標準打擊樂通道，強烈推薦為主爵士鼓組 (Rhythm 2)'
          : `名稱或特徵符合爵士鼓組 (${track.name || 'Drums'})`,
        alternativeParts: [{ partId: 'Rhythm1', reason: '作為輔助次打擊樂 (Percussion)' }],
      };
    }

    if (cat === 'percussion') {
      return {
        recommendedPart: 'Rhythm1',
        recommendationReason: `偵測為打擊樂器 (${track.name || 'Percussion'})，推薦為次打擊樂聲部 (Rhythm 1)`,
        alternativeParts: [{ partId: 'Rhythm2', reason: '指派為主節奏鼓組' }],
      };
    }

    if (cat === 'bass') {
      return {
        recommendedPart: 'Bass',
        recommendationReason: `低音域 (平均音高 MIDI ${avgPitch}) 與貝斯音色，推薦為低音聲部 (Bass)`,
        alternativeParts: [{ partId: 'Phrase1', reason: '作為低音裝飾旋律短句' }],
      };
    }

    if (cat === 'pad' || (cat === 'strings' && avgDurationTicks >= division * 1.5)) {
      return {
        recommendedPart: 'Pad',
        recommendationReason: `長音音符 (${(avgDurationTicks / division).toFixed(1)} 拍) 且為鋪底音色，推薦為背景長音 (Pad)`,
        alternativeParts: [
          { partId: 'Chord2', reason: '作為副和弦聲部' },
          { partId: 'Chord1', reason: '作為主和弦聲部' },
        ],
      };
    }

    const nameLower = (track.name || '').toLowerCase();
    const isArpeggioOrRiff =
      nameLower.includes('arp') ||
      nameLower.includes('riff') ||
      nameLower.includes('lead') ||
      nameLower.includes('solo');

    if ((cat === 'piano' || cat === 'guitar') && (isArpeggioOrRiff || polyphonyRatio < 0.2)) {
      return {
        recommendedPart: 'Phrase1',
        recommendationReason: `分解琶音或單音短句 (${track.name || 'Arp'}, 多音比率 ${(polyphonyRatio * 100).toFixed(0)}%)，推薦為琶音裝飾短句 (Phrase 1)`,
        alternativeParts: [
          { partId: 'Phrase2', reason: '作為副裝飾句 (Phrase 2)' },
          { partId: 'Chord1', reason: '作為主和弦聲部' },
        ],
      };
    }

    if (cat === 'piano' || cat === 'guitar' || polyphonyRatio >= 0.25) {
      return {
        recommendedPart: 'Chord1',
        recommendationReason: `具備和弦演奏特徵 (多音同發比率 ${(polyphonyRatio * 100).toFixed(0)}%)，推薦為節奏主和弦 (Chord 1)`,
        alternativeParts: [
          { partId: 'Chord2', reason: '作為副和弦或管樂襯托' },
          { partId: 'Phrase1', reason: '作為分解琶音旋律短句' },
        ],
      };
    }

    if (cat === 'brass' || cat === 'reed') {
      return {
        recommendedPart: 'Chord2',
        recommendationReason: `管樂組或切分對位，推薦為副和弦/管樂組 (Chord 2)`,
        alternativeParts: [
          { partId: 'Phrase2', reason: '作為管樂加花裝飾句' },
          { partId: 'Phrase1', reason: '作為對位旋律' },
        ],
      };
    }

    // 預設為裝飾句 Phrase 1 / Phrase 2
    return {
      recommendedPart: 'Phrase1',
      recommendationReason: `單音樂句或裝飾旋律，推薦為對位主旋律短句 (Phrase 1)`,
      alternativeParts: [
        { partId: 'Phrase2', reason: '作為副裝飾句 (Phrase 2)' },
        { partId: 'Chord1', reason: '作為主和弦聲部' },
      ],
    };
  }

  /**
   * 8 聲部全域智慧裁決與防衝突分配演算法
   */
  private static allocateParts(tracks: StyleTrackAnalysis[]): Partial<Record<StylePartId, number>> {
    const allocation: Partial<Record<StylePartId, number>> = {};
    const usedTrackIndices = new Set<number>();

    // 優先度 1: 爵士鼓組 Rhythm 2 (Ch 10 優先)
    const rhythm2Track = tracks.find(
      (t) => !usedTrackIndices.has(t.trackIndex) && (t.channel === 9 || t.detectedCategory === 'drums')
    );
    if (rhythm2Track) {
      allocation['Rhythm2'] = rhythm2Track.trackIndex;
      usedTrackIndices.add(rhythm2Track.trackIndex);
    }

    // 優先度 2: 打擊樂 Rhythm 1 (次打擊樂或溢流鼓組)
    const rhythm1Track = tracks.find(
      (t) =>
        !usedTrackIndices.has(t.trackIndex) &&
        (t.detectedCategory === 'percussion' || t.recommendedPart === 'Rhythm1' || t.detectedCategory === 'drums')
    );
    if (rhythm1Track) {
      allocation['Rhythm1'] = rhythm1Track.trackIndex;
      usedTrackIndices.add(rhythm1Track.trackIndex);
    }

    // 優先度 3: 低音貝斯 Bass
    const bassTrack = tracks.find(
      (t) => !usedTrackIndices.has(t.trackIndex) && (t.detectedCategory === 'bass' || t.recommendedPart === 'Bass')
    );
    if (bassTrack) {
      allocation['Bass'] = bassTrack.trackIndex;
      usedTrackIndices.add(bassTrack.trackIndex);
    }

    // 優先度 4: 長音背景 Pad
    const padTrack = tracks.find(
      (t) => !usedTrackIndices.has(t.trackIndex) && (t.detectedCategory === 'pad' || t.recommendedPart === 'Pad')
    );
    if (padTrack) {
      allocation['Pad'] = padTrack.trackIndex;
      usedTrackIndices.add(padTrack.trackIndex);
    }

    // 優先度 5: 主和弦 Chord 1
    const chord1Track = tracks.find(
      (t) =>
        !usedTrackIndices.has(t.trackIndex) &&
        (t.recommendedPart === 'Chord1' || t.detectedCategory === 'piano' || t.detectedCategory === 'guitar')
    );
    if (chord1Track) {
      allocation['Chord1'] = chord1Track.trackIndex;
      usedTrackIndices.add(chord1Track.trackIndex);
    }

    // 優先度 6: 副和弦 Chord 2 (次和弦、管樂或溢流和弦)
    const chord2Track = tracks.find(
      (t) =>
        !usedTrackIndices.has(t.trackIndex) &&
        (t.recommendedPart === 'Chord2' ||
          t.detectedCategory === 'brass' ||
          t.detectedCategory === 'strings' ||
          t.recommendedPart === 'Chord1' ||
          t.polyphonyRatio >= 0.25)
    );
    if (chord2Track) {
      allocation['Chord2'] = chord2Track.trackIndex;
      usedTrackIndices.add(chord2Track.trackIndex);
    }

    // 優先度 7: 短句 Phrase 1
    const phrase1Track = tracks.find(
      (t) =>
        !usedTrackIndices.has(t.trackIndex) &&
        t.notes.length > 0 &&
        (t.recommendedPart === 'Phrase1' ||
          t.detectedCategory === 'lead' ||
          t.detectedCategory === 'reed')
    );
    if (phrase1Track) {
      allocation['Phrase1'] = phrase1Track.trackIndex;
      usedTrackIndices.add(phrase1Track.trackIndex);
    }

    // 優先度 8: 副短句 Phrase 2 (其他任何有音符的未分配軌道)
    const phrase2Track = tracks.find(
      (t) => !usedTrackIndices.has(t.trackIndex) && t.notes.length > 0
    );
    if (phrase2Track) {
      allocation['Phrase2'] = phrase2Track.trackIndex;
      usedTrackIndices.add(phrase2Track.trackIndex);
    }

    return allocation;
  }

  /**
   * 智慧調性偵測 (Krumhansl-Schmuckler Key-Finding Algorithm)
   * 根據外部 MIDI 各音軌之音高音長加權直方圖，精確計算原曲調性與對應 Yamaha C 根音轉調半音位移
   */
  public static detectKeySignature(
    tracks: MidiSourceTrackSummary[],
    division: number = 480,
    startTick?: number,
    endTick?: number
  ): KeyDetectionResult {
    const pitchWeights = new Float64Array(12);
    let totalWeight = 0;

    for (const track of tracks) {
      // 忽略鼓組/打擊樂通道 (Channel 9 即 MIDI Ch 10)
      if (track.channel === 9) continue;

      for (const note of track.notes) {
        if (startTick !== undefined && endTick !== undefined) {
          if (note.startTick < startTick || note.startTick >= endTick) {
            continue;
          }
        }
        const pc = ((note.note % 12) + 12) % 12;
        const durWeight = Math.max(1, note.durationTick / Math.max(1, division / 2));
        // 低音域 (Bass 音域 < 55) 給予 2.5 倍權重，因為低音根音對調性具有決定性引導作用
        const bassMultiplier = note.note < 55 ? 2.5 : 1.0;
        const weight = durWeight * bassMultiplier;
        pitchWeights[pc] += weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      if (startTick !== undefined && endTick !== undefined) {
        // 若指定小節區間內無非打擊樂音符，自動回退至全曲調性偵測
        return StyleImporter.detectKeySignature(tracks, division);
      }
      return {
        key: 'C Major',
        root: 'C',
        mode: 'major',
        semitonesToC: 0,
        confidence: 1.0,
        tonicPitchClass: 0,
      };
    }

    // Krumhansl-Schmuckler 原型音高權重表
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const pitchNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

    let bestR = -Infinity;
    let bestTonic = 0;
    let bestMode: 'major' | 'minor' = 'major';

    for (let tonic = 0; tonic < 12; tonic++) {
      const rMaj = StyleImporter.calculateCorrelation(pitchWeights, majorProfile, tonic);
      if (rMaj > bestR) {
        bestR = rMaj;
        bestTonic = tonic;
        bestMode = 'major';
      }
      const rMin = StyleImporter.calculateCorrelation(pitchWeights, minorProfile, tonic);
      if (rMin > bestR) {
        bestR = rMin;
        bestTonic = tonic;
        bestMode = 'minor';
      }
    }

    const root = pitchNames[bestTonic];
    const semitonesToC = ROOT_TO_C_SHIFT[root] ?? 0;
    const confidence = Math.max(0, Math.min(1, (bestR + 1) / 2));
    const key = `${root} ${bestMode === 'major' ? 'Major' : 'Minor'}`;

    return {
      key,
      root,
      mode: bestMode,
      semitonesToC,
      confidence: Number(confidence.toFixed(2)),
      tonicPitchClass: bestTonic,
    };
  }

  private static calculateCorrelation(weights: Float64Array, profile: number[], shift: number): number {
    let meanW = 0;
    let meanP = 0;
    for (let i = 0; i < 12; i++) {
      meanW += weights[i];
      meanP += profile[i];
    }
    meanW /= 12;
    meanP /= 12;

    let num = 0;
    let denW = 0;
    let denP = 0;

    for (let i = 0; i < 12; i++) {
      const wDiff = weights[i] - meanW;
      const pDiff = profile[(i - shift + 12) % 12] - meanP;
      num += wDiff * pDiff;
      denW += wDiff * wDiff;
      denP += pDiff * pDiff;
    }

    if (denW === 0 || denP === 0) return 0;
    return num / Math.sqrt(denW * denP);
  }

  /**
   * 根據智慧映射、多段落切片與 C 調基準自動校正，合成標準 Yamaha Style (.sty)
   */
  public static synthesizeStyleFromImport(
    analysis: StyleSourceAnalysis,
    options: StyleImportOptions
  ): YamahaFileParsed {
    const division = analysis.division || 480;
    const bpm = options.bpm || analysis.bpm || 120;
    const timeSig = options.timeSignature || analysis.timeSignature || { numerator: 4, denominator: 4 };

    const ticksPerBeat = division;
    const beatsPerMeasure = timeSig.numerator * (4 / timeSig.denominator);
    const ticksPerMeasure = Math.round(ticksPerBeat * beatsPerMeasure);

    // 1. 計算 Yamaha C 調基準移調半音數 (Chord Normalization to C Root)
    let cRootShift = 0;
    if (options.normalizeToCRoot !== false) {
      if (options.manualChordShift !== undefined) {
        cRootShift = options.manualChordShift;
      } else if (options.rootKeyOverride && ROOT_TO_C_SHIFT[options.rootKeyOverride] !== undefined) {
        cRootShift = ROOT_TO_C_SHIFT[options.rootKeyOverride];
      } else if (analysis.detectedKey) {
        cRootShift = analysis.detectedKey.semitonesToC;
      } else {
        const detected = StyleImporter.detectKeySignature(analysis.tracks, division);
        cRootShift = detected.semitonesToC;
      }
    }

    // 2. 準備 8 個伴奏聲部預設與音色覆寫
    const partsConfig: Record<StylePartId, StylePartConfig> = { ...DEFAULT_STYLE_PARTS };
    for (const mapping of options.partMappings) {
      const partDef = partsConfig[mapping.partId];
      if (!partDef) continue;

      if (mapping.voice) {
        const isDrumPart = mapping.partId === 'Rhythm1' || mapping.partId === 'Rhythm2';
        let safeMsb = mapping.voice.msb ?? partDef.msb;
        if (isDrumPart && safeMsb !== 126 && safeMsb !== 127) {
          safeMsb = 127;
        }
        partsConfig[mapping.partId] = {
          ...partDef,
          msb: safeMsb,
          lsb: mapping.voice.lsb ?? partDef.lsb,
          pc: mapping.voice.pc ?? partDef.pc,
          volume: mapping.voice.volume ?? partDef.volume,
          pan: mapping.voice.pan ?? partDef.pan,
          reverb: mapping.voice.reverb ?? partDef.reverb,
          chorus: mapping.voice.chorus ?? partDef.chorus,
        };
      }

      if (mapping.sourceTrackIndex !== null && mapping.sourceTrackIndex !== undefined) {
        const sourceTrack = analysis.tracks.find((t) => t.trackIndex === mapping.sourceTrackIndex);
        if (sourceTrack && !mapping.voice) {
          const isDrumPart = mapping.partId === 'Rhythm1' || mapping.partId === 'Rhythm2';
          if (sourceTrack.programChange !== undefined) {
            partsConfig[mapping.partId].pc = sourceTrack.programChange;
          }
          if (isDrumPart) {
            // Yamaha SFF2 / PSR-SX920 鼓組聲部 (Rhythm 1/2) Bank MSB 必須強制鎖定為 127 (標準鼓組) 或 126 (SFX)，絕不可為 0 (避免被琴端視為鋼琴或遭自動靜音)
            partsConfig[mapping.partId].msb =
              sourceTrack.bankMsb === 126 || sourceTrack.bankMsb === 127 ? sourceTrack.bankMsb : 127;
            partsConfig[mapping.partId].lsb = sourceTrack.bankLsb ?? 0;
          } else {
            if (sourceTrack.bankMsb !== undefined) partsConfig[mapping.partId].msb = sourceTrack.bankMsb;
            if (sourceTrack.bankLsb !== undefined) partsConfig[mapping.partId].lsb = sourceTrack.bankLsb;
          }
        }
      }
    }

    // 3. 確定要切片合成的段落清單 (支援 Phase 3.3 全曲多段落切片或相容單段落模式)
    const slicesToProcess: StyleSectionSliceConfig[] =
      options.sections && options.sections.length > 0
        ? options.sections
        : [
            {
              sectionName: options.targetSection || 'Main A',
              startBar: options.startBar || 1,
              endBar: options.endBar || 4,
            },
          ];

    // 4. 為每個段落切片擷取時序音符並套用 C 基準校正
    const sectionsConfig: StyleSectionConfig[] = [];

    for (const slice of slicesToProcess) {
      const startBar = Math.max(1, slice.startBar);
      const endBar = Math.max(startBar, slice.endBar);
      const measureLength = endBar - startBar + 1;
      const sliceStartTick = (startBar - 1) * ticksPerMeasure;
      const sliceEndTick = endBar * ticksPerMeasure;

      // 若該段落單獨指定了 chordRoot 則採用該覆寫，否則套用全曲 C 基準移調
      let effectiveSectionChordShift = cRootShift;
      if (slice.chordRoot && ROOT_TO_C_SHIFT[slice.chordRoot] !== undefined) {
        effectiveSectionChordShift = ROOT_TO_C_SHIFT[slice.chordRoot];
      }

      const sectionNotes: StyleNoteEvent[] = [];

      for (const mapping of options.partMappings) {
        if (mapping.sourceTrackIndex === null || mapping.sourceTrackIndex === undefined) continue;
        const sourceTrack = analysis.tracks.find((t) => t.trackIndex === mapping.sourceTrackIndex);
        if (!sourceTrack || sourceTrack.notes.length === 0) continue;

        // 鼓組/打擊樂 (Rhythm 1/2, Ch 8/9) 絕對保持固定音高，絕不轉調！
        // 旋律/和弦/低音聲部則疊加聲部自訂移調與 C 基準校正
        const isDrum = mapping.partId === 'Rhythm1' || mapping.partId === 'Rhythm2';
        const baseShift = mapping.transposeShift || 0;
        const noteShift = isDrum ? baseShift : baseShift + effectiveSectionChordShift;

        for (const n of sourceTrack.notes) {
          if (n.startTick >= sliceStartTick && n.startTick < sliceEndTick) {
            const relTick = n.startTick - sliceStartTick;
            const transposedNote = Math.min(127, Math.max(0, n.note + noteShift));

            sectionNotes.push({
              partId: mapping.partId,
              note: transposedNote,
              velocity: n.velocity,
              startTick: relTick,
              durationTick: n.durationTick,
            });
          }
        }
      }

      sectionsConfig.push({
        name: slice.sectionName,
        bars: measureLength,
        notes: sectionNotes,
      });
    }

    // 5. 調用 YamahaStyleSynthesizer 建立 Format 0 單軌 Style 與完整 SFF2 CASM 轉調區塊
    return YamahaStyleSynthesizer.createBlankStyle({
      styleName: options.projectName || 'My Style',
      bpm,
      timeSignature: timeSig,
      division,
      sections: sectionsConfig,
      parts: partsConfig,
    });
  }

  /**
   * 整合包 2: 將外部 MIDI 採集小節樂句 (含 C 根音校正) 精準注入至現有 Yamaha Style 的指定段落
   */
  public static injectSampledSectionIntoStyle(
    destParsed: YamahaFileParsed,
    destSectionName: string,
    analysis: StyleSourceAnalysis,
    options: SampleInjectionOptions
  ): SampleInjectionResult {
    if (!destParsed || !destParsed.tracks || destParsed.tracks.length === 0) {
      return {
        success: false,
        destSection: destSectionName,
        notesInjected: 0,
        sampledBars: 0,
        partsUpdated: [],
        message: '目標伴奏檔結構無效',
      };
    }

    const startBar = Math.max(1, options.startBar);
    const endBar = Math.max(startBar, options.endBar);
    const sampledBars = endBar - startBar + 1;

    // 1. 若目標伴奏尚未包含該段落，自動為其擴充新增段落
    const existingSection = destParsed.sections?.find((s) => s.name === destSectionName);
    if (!existingSection) {
      const addRes = YamahaStyleAssembly.addNewSection(destParsed, {
        sectionName: destSectionName,
        bars: sampledBars,
      });
      if (!addRes.success) {
        return {
          success: false,
          destSection: destSectionName,
          notesInjected: 0,
          sampledBars,
          partsUpdated: [],
          message: `新增段落失敗: ${addRes.message}`,
        };
      }
    }

    // 2. 將選取的小節採樣合成為內存臨時 SFF2 Style (自動完成 C 根音校正、鼓組鎖定與 Yamaha 通道對齊)
    const tempStyle = StyleImporter.synthesizeStyleFromImport(analysis, {
      projectName: 'MidiSampleTemp',
      bpm: options.bpm || destParsed.bpm || analysis.bpm || 120,
      timeSignature: destParsed.timeSignature || analysis.timeSignature || { numerator: 4, denominator: 4 },
      startBar,
      endBar,
      targetSection: destSectionName as any,
      partMappings: options.partMappings,
      normalizeToCRoot: options.normalizeToCRoot !== false,
      rootKeyOverride: options.rootKeyOverride,
      manualChordShift: options.manualChordShift,
    });

    let totalNotesInjected = 0;
    const partsUpdated: StylePartId[] = [];

    // 3. 逐一呼叫 YamahaStyleAssembly.assemblePart 進行無損聲部注入
    for (const mapping of options.partMappings) {
      if (mapping.sourceTrackIndex === null || mapping.sourceTrackIndex === undefined) continue;
      const partDef = DEFAULT_STYLE_PARTS[mapping.partId];
      if (!partDef) continue;

      const standardCh = partDef.channel;
      let destCh = standardCh;
      if (destParsed.parts) {
        const destPartEntry = destParsed.parts.find((p) =>
          p.partName.toLowerCase().replace(/\s+/g, '').includes(mapping.partId.toLowerCase())
        );
        if (destPartEntry) {
          destCh = destPartEntry.channel;
        }
      }

      const res = YamahaStyleAssembly.assemblePart({
        destParsed,
        destSection: destSectionName,
        destChannel: destCh,
        srcParsed: tempStyle,
        srcSection: destSectionName,
        srcChannel: standardCh,
        copyMode: options.copyMode || 'replace',
        loopMode: 'loop',
        copyVoiceParams: true,
      });

      if (res.success) {
        totalNotesInjected += res.notesCopied;
        partsUpdated.push(mapping.partId);
      }
    }

    return {
      success: true,
      destSection: destSectionName,
      notesInjected: totalNotesInjected,
      sampledBars,
      partsUpdated,
      message: `成功將 ${partsUpdated.length} 個聲部 (${totalNotesInjected} 顆音符) 注入至段落 [${destSectionName}]！`,
    };
  }

  /**
   * 整合包 2: 將外部 MIDI 採集小節樂句封裝為樣式庫條目 (Style Pool Entry)
   */
  public static createStylePoolEntryFromSample(
    analysis: StyleSourceAnalysis,
    options: StyleImportOptions,
    poolId?: string
  ): StylePoolEntry {
    const style = StyleImporter.synthesizeStyleFromImport(analysis, options);
    return {
      id: poolId || `pool-sample-${Date.now()}`,
      name: `${options.projectName || 'Sampled Groove'}.sty`,
      parsed: style,
    };
  }

  /**
   * 整合包 2: 智慧段落嗅探 (Section Scout)
   * 自動偵測鼓組進場小節、能量密度高潮區間與結尾，推測 Intro, Main A, Chorus (Main B) 及 Ending
   */
  public static detectSongStructureScout(analysis: StyleSourceAnalysis): SectionScoutResult {
    const totalMeasures = Math.max(1, analysis.totalMeasures || 1);
    const division = analysis.division || 480;
    const timeSig = analysis.timeSignature || { numerator: 4, denominator: 4 };
    const ticksPerMeasure = Math.max(1, Math.round(division * timeSig.numerator * (4 / timeSig.denominator)));

    // 1. 偵測打擊樂軌道 (Channel 10 / drums 或 category=drums/percussion)
    const drumNotes: { startTick: number; note: number; velocity: number }[] = [];
    if (analysis.tracks) {
      for (const track of analysis.tracks) {
        const styleTrack = analysis.styleTracks?.find((st) => st.trackIndex === track.trackIndex);
        const isDrum = track.channel === 9 || styleTrack?.detectedCategory === 'drums' || styleTrack?.detectedCategory === 'percussion';
        if (isDrum && track.notes) {
          for (const n of track.notes) {
            drumNotes.push(n);
          }
        }
      }
    }

    drumNotes.sort((a, b) => a.startTick - b.startTick);
    const firstDrumTick = drumNotes.length > 0 ? drumNotes[0].startTick : null;
    const firstDrumBar = firstDrumTick !== null ? Math.min(totalMeasures, Math.floor(firstDrumTick / ticksPerMeasure) + 1) : null;

    // 2. 推測 Intro (前奏) 與 Main A (主歌)
    let introRange: { start: number; end: number; bars: number };
    let mainRange: { start: number; end: number; bars: number };
    let drumEntryDescription = '';

    if (firstDrumBar !== null && firstDrumBar > 1) {
      // 典型流行歌結構：前奏無鼓或輕擊，第 firstDrumBar 小節敲下大鼓/小鼓進主歌
      const introEnd = firstDrumBar - 1;
      introRange = {
        start: 1,
        end: introEnd,
        bars: introEnd,
      };
      const mainStart = firstDrumBar;
      const mainEnd = Math.min(totalMeasures, mainStart + 7);
      mainRange = {
        start: mainStart,
        end: mainEnd,
        bars: mainEnd - mainStart + 1,
      };
      drumEntryDescription = `鼓組於第 ${firstDrumBar} 小節進場，前奏推測為第 1 ~ ${introEnd} 小節 (${introEnd} 小節)，主歌 Main A 自第 ${mainStart} 小節展開`;
    } else if (firstDrumBar === 1) {
      // 開頭即有鼓組
      const introBars = totalMeasures >= 16 ? 8 : (totalMeasures >= 8 ? 4 : Math.min(4, totalMeasures));
      introRange = {
        start: 1,
        end: introBars,
        bars: introBars,
      };
      const mainStart = Math.min(totalMeasures, introBars + 1);
      const mainEnd = Math.min(totalMeasures, mainStart + 7);
      mainRange = {
        start: mainStart,
        end: mainEnd,
        bars: mainEnd - mainStart + 1,
      };
      drumEntryDescription = `開頭即有鼓組節奏，標準前奏推測為第 1 ~ ${introBars} 小節，主歌推測為第 ${mainStart} ~ ${mainEnd} 小節`;
    } else {
      // 無打擊樂軌道
      const introBars = Math.min(4, totalMeasures);
      introRange = {
        start: 1,
        end: introBars,
        bars: introBars,
      };
      const mainStart = Math.min(totalMeasures, introBars + 1);
      const mainEnd = Math.min(totalMeasures, mainStart + 7);
      mainRange = {
        start: mainStart,
        end: mainEnd,
        bars: mainEnd - mainStart + 1,
      };
      drumEntryDescription = `未偵測到鼓組軌道，採用流行曲式推薦：前奏第 1 ~ ${introBars} 小節，主歌第 ${mainStart} ~ ${mainEnd} 小節`;
    }

    // 3. 計算各小節音符能量密度 (Note Energy Density) 尋找副歌高潮 (Chorus)
    const barEnergy = new Array(totalMeasures + 1).fill(0);
    if (analysis.tracks) {
      for (const track of analysis.tracks) {
        if (!track.notes) continue;
        for (const n of track.notes) {
          const bar = Math.floor(n.startTick / ticksPerMeasure) + 1;
          if (bar >= 1 && bar <= totalMeasures) {
            barEnergy[bar] += (n.velocity / 127);
          }
        }
      }
    }

    // 副歌通常在 Main A 之後 (例如第 9 或 17 小節後)，計算 4 或 8 小節滑動窗口最高能量
    const searchStartBar = Math.min(totalMeasures, Math.max(5, (firstDrumBar || 5) + 4));
    const searchEndBar = Math.min(totalMeasures, Math.max(searchStartBar, Math.floor(totalMeasures * 0.85)));

    let bestChorusStart = searchStartBar;
    let maxEnergy = -1;
    const windowSize = 4;

    for (let b = searchStartBar; b <= searchEndBar - windowSize + 1; b++) {
      let winSum = 0;
      for (let k = 0; k < windowSize; k++) {
        winSum += barEnergy[b + k];
      }
      if (winSum > maxEnergy) {
        maxEnergy = winSum;
        bestChorusStart = b;
      }
    }

    const chorusLen = Math.min(8, totalMeasures - bestChorusStart + 1);
    const chorusRange = {
      start: bestChorusStart,
      end: Math.min(totalMeasures, bestChorusStart + chorusLen - 1),
      bars: chorusLen,
    };
    const chorusDescription = `全曲音符能量高潮位於第 ${chorusRange.start} ~ ${chorusRange.end} 小節附近，推薦作為副歌 (Main B 或 Main C)`;

    // 4. 尾奏 (Ending)
    const endingBars = Math.min(4, totalMeasures);
    const endingStart = Math.max(1, totalMeasures - endingBars + 1);
    const endingRange = {
      start: endingStart,
      end: totalMeasures,
      bars: totalMeasures - endingStart + 1,
    };

    const summary = `${drumEntryDescription}；副歌高潮位於第 ${chorusRange.start}~${chorusRange.end} 節`;

    return {
      firstDrumBar,
      introRange,
      mainRange,
      chorusRange,
      endingRange,
      drumEntryDescription,
      chorusDescription,
      summary,
    };
  }
}

