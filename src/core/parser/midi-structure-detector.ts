import type { YamahaFileParsed } from '../models/types';
import type { MidiSongAnalysis, MidiChannelAnalysis } from './midi-song-analyzer';
import { MidiPartAssignMatrix } from '../writer/midi-part-assign-matrix';
import { MidiSliceAssembler, type MidiSliceAssembleResult } from '../writer/midi-slice-assembler';

export type SectionCategory = 'INTRO' | 'INTERLUDE' | 'ENDING' | 'VERSE' | 'CHORUS' | 'FILL';

export interface DetectedSection {
  /** 目標 Yamaha 伴奏段落代號 (如 'Intro A', 'Intro B', 'Ending A', 'Main A') */
  targetSection: string;
  /** 樂理結構類型 */
  sectionType: SectionCategory;
  /** 介面顯示中文名稱 */
  nameZh: string;
  /** 起始小節 (1-based) */
  startBar: number;
  /** 結束小節 (1-based) */
  endBar: number;
  /** 起始拍數 (1-based) */
  startBeat: number;
  /** 結束拍數 (1-based) */
  endBeat: number;
  /** 小節數量 */
  barLength: number;
  /** 推薦和弦模式 (前奏/間奏/尾奏預設為 ORIGINAL_PASS_THROUGH 直通) */
  recommendedChordMode: 'ORIGINAL_PASS_THROUGH' | 'CM7_MAJOR' | 'CM_MINOR';
  /** 代表/領奏樂器清單 */
  leadInstruments: string[];
  /** 信心度評分 (0 ~ 100) */
  confidence: number;
  /** 判定理由說明 */
  reasonZh: string;
  /** 是否為簡單直通段落 (前奏/間奏/尾奏，零走音風險) */
  isSimplePassThrough: boolean;
}

export interface SongStructureDetectionResult {
  fileName: string;
  totalBars: number;
  globalMelodyChannel: number | null;
  globalMelodyName: string;
  /** 優先推薦之簡單直通段落 (前奏 Intro A, 間奏 Intro B, 尾奏 Ending A) */
  simpleSections: DetectedSection[];
  /** 所有偵測到的段落 (包含後續 Main / Fill 等) */
  allSections: DetectedSection[];
}

export class MidiStructureDetector {
  /**
   * 智慧分析 MIDI 樂曲結構，優先識別【前奏 Intro A、間奏 Intro B、尾奏 Ending A】三大直通段落
   */
  public static detectStructure(parsed: YamahaFileParsed, analysis: MidiSongAnalysis): SongStructureDetectionResult {
    const totalBars = Math.max(1, analysis.totalBars);
    const ticksPerBar = Math.max(1, analysis.ticksPerBar);

    // 1. 識別全曲人聲主唱/主旋律通道 (Global Vocal Melody Channel)
    const melodyChInfo = this.findGlobalMelodyChannel(analysis);
    const melodyChannel = melodyChInfo?.channel ?? null;
    const melodyName = melodyChInfo?.voiceName || (melodyChannel !== null ? `CH ${melodyChannel + 1}` : '無明顯人聲');

    // 2. 統計各小節音符分佈 (全曲主唱 vs 全曲所有軌道)
    const { vocalNotesByBar, activeChannelsByBar } = this.profileBarsActivity(
      parsed,
      totalBars,
      ticksPerBar,
      melodyChannel
    );

    const detected: DetectedSection[] = [];

    // ==========================================
    // 3. 探測【前奏 Intro A】
    // ==========================================
    const introSection = this.detectIntroA(analysis, vocalNotesByBar, activeChannelsByBar, melodyName);
    if (introSection) {
      detected.push(introSection);
    }

    // ==========================================
    // 4. 探測【間奏 Intro B (Interlude / Solo 齊奏)】
    // ==========================================
    const interludeSection = this.detectInterlude(analysis, vocalNotesByBar, activeChannelsByBar, introSection);
    if (interludeSection) {
      detected.push(interludeSection);
    }

    // ==========================================
    // 5. 探測【尾奏 Ending A】
    // ==========================================
    const endingSection = this.detectEndingA(analysis, vocalNotesByBar, activeChannelsByBar, interludeSection);
    if (endingSection) {
      detected.push(endingSection);
    }

    const simpleSections = [...detected];

    return {
      fileName: analysis.fileName,
      totalBars,
      globalMelodyChannel: melodyChannel,
      globalMelodyName: melodyName,
      simpleSections,
      allSections: detected,
    };
  }

  /**
   * 內部輔助：識別全曲人聲主唱/主旋律通道
   */
  private static findGlobalMelodyChannel(analysis: MidiSongAnalysis): MidiChannelAnalysis | null {
    let bestCh: MidiChannelAnalysis | null = null;
    let maxConf = 0;

    for (const ch of analysis.channelsWithNotes) {
      const res = MidiPartAssignMatrix.detectMelody(ch);
      if (res.isMelody && res.confidence > maxConf) {
        maxConf = res.confidence;
        bestCh = ch;
      }
    }

    // 若未依關鍵字命中，以發聲小節覆蓋率最廣且非鼓組/貝斯的樂器為候選
    if (!bestCh) {
      const candidates = analysis.channelsWithNotes.filter(c => !c.isDrum && c.category !== 'Bass');
      if (candidates.length > 0) {
        bestCh = candidates.reduce((prev, curr) => (curr.noteCount > prev.noteCount ? curr : prev), candidates[0]);
      }
    }

    return bestCh;
  }

  /**
   * 內部輔助：逐小節統計音符活躍度
   */
  private static profileBarsActivity(
    parsed: YamahaFileParsed,
    totalBars: number,
    ticksPerBar: number,
    melodyChannel: number | null
  ): {
    vocalNotesByBar: number[];
    allNotesByBar: number[];
    activeChannelsByBar: Array<Set<number>>;
  } {
    const vocalNotesByBar = new Array(totalBars + 1).fill(0);
    const allNotesByBar = new Array(totalBars + 1).fill(0);
    const activeChannelsByBar: Array<Set<number>> = Array.from({ length: totalBars + 1 }, () => new Set<number>());

    for (const track of parsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (ev.type === 'noteOn' && (ev.velocity || 0) > 0) {
          const bar = Math.floor(curTick / ticksPerBar) + 1;
          if (bar >= 1 && bar <= totalBars) {
            allNotesByBar[bar]++;
            if (ev.channel !== undefined) {
              activeChannelsByBar[bar].add(ev.channel);
              if (melodyChannel !== null && ev.channel === melodyChannel) {
                vocalNotesByBar[bar]++;
              }
            }
          }
        }
      }
    }

    return { vocalNotesByBar, allNotesByBar, activeChannelsByBar };
  }

  /**
   * 探測【前奏 Intro A】
   */
  private static detectIntroA(
    analysis: MidiSongAnalysis,
    vocalNotesByBar: number[],
    activeChannelsByBar: Array<Set<number>>,
    melodyName: string
  ): DetectedSection | null {
    const totalBars = analysis.totalBars;
    // 尋找主唱進歌的第一個小節 (firstVocalBar)
    let firstVocalBar = 0;
    for (let b = 1; b <= totalBars; b++) {
      if (vocalNotesByBar[b] > 0) {
        firstVocalBar = b;
        break;
      }
    }

    // 若主唱一開始就進歌 (第 1 小節即有主唱)，通常代表無前奏或只有極短引子
    if (firstVocalBar <= 1) {
      return null;
    }

    // 前奏結束小節通常是 firstVocalBar - 1
    // 若第 1 小節有空拍/弱起 (如《容易受傷的女人》在第 1 小節第 3 拍起音)
    const startBar = 1;
    const startBeat = analysis.firstNoteBeat || 1;
    const endBar = firstVocalBar - 1;
    const endBeat = 4; // 完整小節結尾
    const barLength = Math.max(1, endBar - startBar + 1);

    // 探測前奏活躍樂器
    const leadInstruments = this.getLeadInstrumentsForBars(activeChannelsByBar, startBar, endBar, analysis);

    return {
      targetSection: 'Intro A',
      sectionType: 'INTRO',
      nameZh: '前奏 (Intro A)',
      startBar,
      endBar,
      startBeat,
      endBeat,
      barLength,
      recommendedChordMode: 'ORIGINAL_PASS_THROUGH',
      leadInstruments,
      confidence: 95,
      reasonZh: `全曲人聲主唱 (${melodyName}) 於第 ${firstVocalBar} 小節進歌，前奏自第 ${startBar} 節 (第 ${startBeat} 拍) 起奏至第 ${endBar} 節，推薦原曲直通播放。`,
      isSimplePassThrough: true,
    };
  }

  /**
   * 探測【間奏 Intro B (Interlude / Solo 齊奏)】
   */
  private static detectInterlude(
    analysis: MidiSongAnalysis,
    vocalNotesByBar: number[],
    activeChannelsByBar: Array<Set<number>>,
    introSection: DetectedSection | null
  ): DetectedSection | null {
    const totalBars = analysis.totalBars;
    const searchStart = introSection ? introSection.endBar + 2 : 10;
    const searchEnd = Math.max(searchStart, Math.floor(totalBars * 0.85));

    // 尋找主唱在曲中休止 >= 4 個小節的區間 (且伴奏樂隊仍活躍演奏)
    interface Gap {
      start: number;
      end: number;
      length: number;
    }

    const gaps: Gap[] = [];
    let curStart = -1;

    for (let b = searchStart; b <= searchEnd; b++) {
      // 容許第 1 小節只有 1~2 顆尾音掛留 (如唱完一句的結尾字在下個第 1 拍延音)
      const isSilent = vocalNotesByBar[b] === 0 || (curStart === -1 && vocalNotesByBar[b] <= 1 && vocalNotesByBar[b + 1] === 0);
      if (isSilent) {
        if (curStart === -1) curStart = b;
      } else {
        if (curStart !== -1) {
          const len = (b - 1) - curStart + 1;
          if (len >= 4) {
            gaps.push({ start: curStart, end: b - 1, length: len });
          }
          curStart = -1;
        }
      }
    }

    if (curStart !== -1) {
      const len = searchEnd - curStart + 1;
      if (len >= 4) {
        gaps.push({ start: curStart, end: searchEnd, length: len });
      }
    }

    if (gaps.length === 0) {
      return null;
    }

    // 取最長或最接近標準 8 小節 (或 4 小節) 的間奏區間
    gaps.sort((a, b) => {
      const aDist = Math.abs(a.length - 8);
      const bDist = Math.abs(b.length - 8);
      if (aDist !== bDist) return aDist - bDist;
      return b.length - a.length;
    });

    const bestGap = gaps[0];
    const barLength = bestGap.length;
    const leadInstruments = this.getLeadInstrumentsForBars(activeChannelsByBar, bestGap.start, bestGap.end, analysis);

    return {
      targetSection: 'Intro B',
      sectionType: 'INTERLUDE',
      nameZh: '間奏 Solo 齊奏 (Intro B)',
      startBar: bestGap.start,
      endBar: bestGap.end,
      startBeat: 1,
      endBeat: 4,
      barLength,
      recommendedChordMode: 'ORIGINAL_PASS_THROUGH',
      leadInstruments,
      confidence: 90,
      reasonZh: `曲中間奏休止長達 ${barLength} 小節 (第 ${bestGap.start} ~ ${bestGap.end} 節)，樂隊大齊奏 Solo，推薦配置為 Intro B 原曲直通。`,
      isSimplePassThrough: true,
    };
  }

  /**
   * 探測【尾奏 Ending A】
   */
  private static detectEndingA(
    analysis: MidiSongAnalysis,
    vocalNotesByBar: number[],
    activeChannelsByBar: Array<Set<number>>,
    _interludeSection: DetectedSection | null
  ): DetectedSection | null {
    const totalBars = analysis.totalBars;

    // 尋找人聲最後一次發聲的小節
    let lastVocalBar = 0;
    for (let b = totalBars; b >= 1; b--) {
      if (vocalNotesByBar[b] > 0) {
        lastVocalBar = b;
        break;
      }
    }

    // 若最後人聲唱到最後 1 小節，代表無尾奏
    if (lastVocalBar === 0 || lastVocalBar >= totalBars - 1) {
      return null;
    }

    // 尾奏起始小節
    const startBar = lastVocalBar + 1;
    const endBar = totalBars;
    const barLength = endBar - startBar + 1;

    // 尾奏通常在 2 ~ 8 小節之間
    if (barLength < 2) {
      return null;
    }

    const leadInstruments = this.getLeadInstrumentsForBars(activeChannelsByBar, startBar, endBar, analysis);

    return {
      targetSection: 'Ending A',
      sectionType: 'ENDING',
      nameZh: '尾奏 (Ending A)',
      startBar,
      endBar,
      startBeat: 1,
      endBeat: 4,
      barLength,
      recommendedChordMode: 'ORIGINAL_PASS_THROUGH',
      leadInstruments,
      confidence: 92,
      reasonZh: `全曲人聲於第 ${lastVocalBar} 小節唱畢，結尾第 ${startBar} ~ ${endBar} 節 (${barLength} 小節) 為樂隊收尾樂句，推薦配置為 Ending A 原曲直通。`,
      isSimplePassThrough: true,
    };
  }

  /**
   * 內部輔助：提取指定小節區間內最活躍之代表樂器清單
   */
  private static getLeadInstrumentsForBars(
    activeChannelsByBar: Array<Set<number>>,
    startBar: number,
    endBar: number,
    analysis: MidiSongAnalysis
  ): string[] {
    const channelCounts = new Map<number, number>();
    for (let b = startBar; b <= endBar; b++) {
      const chs = activeChannelsByBar[b];
      if (chs) {
        for (const ch of chs) {
          channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
        }
      }
    }

    // 依出現小節數排序
    const sortedChs = Array.from(channelCounts.entries())
      .filter(([ch]) => ch !== 9) // 排除一般鼓組
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ch]) => {
        const found = analysis.channelsWithNotes.find(c => c.channel === ch);
        return found ? found.voiceName : `CH ${ch + 1}`;
      });

    return sortedChs.length > 0 ? sortedChs : ['全樂隊合奏'];
  }

  /**
   * 批次組裝切片至 Yamaha 伴奏專案 (支援一鍵組裝前奏、間奏、尾奏等指定段落)
   */
  public static batchAssembleSections(params: {
    sourceParsed: YamahaFileParsed;
    analysis: MidiSongAnalysis;
    sectionsToAssemble: DetectedSection[];
    baseStyleParsed?: YamahaFileParsed | null;
    styleName?: string;
  }): {
    styleParsed: YamahaFileParsed;
    assembledResults: MidiSliceAssembleResult[];
  } {
    const { sourceParsed, analysis, sectionsToAssemble, baseStyleParsed, styleName } = params;

    let currentStyle: YamahaFileParsed | undefined = baseStyleParsed || undefined;
    const assembledResults: MidiSliceAssembleResult[] = [];

    for (const sec of sectionsToAssemble) {
      const mappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
        sourceParsed,
        startBar: sec.startBar,
        endBar: sec.endBar,
        startBeat: sec.startBeat,
        targetSection: sec.targetSection,
      });

      const res = MidiSliceAssembler.assembleSliceToSection({
        sourceParsed,
        analysis,
        startBar: sec.startBar,
        endBar: sec.endBar,
        startBeat: sec.startBeat,
        endBeat: sec.endBeat,
        targetSection: sec.targetSection,
        mappingPlan,
        baseStyleParsed: currentStyle,
        styleName: styleName || `${analysis.fileName.replace(/\.[^/.]+$/, '')}_AutoArranger`,
        chordMode: sec.recommendedChordMode,
        normalizeChordsToC: sec.recommendedChordMode === 'CM7_MAJOR',
      });

      currentStyle = res.styleParsed;
      assembledResults.push(res);
    }

    if (!currentStyle) {
      throw new Error('未組裝任何段落');
    }

    return {
      styleParsed: currentStyle,
      assembledResults,
    };
  }
}
