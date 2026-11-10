/**
 * MIDI 小節切片裝配至 Yamaha 伴奏段落引擎 (MIDI Slice Section Assembler)
 * 負責將標準 MIDI 音樂檔中選定之小節區間事件提取、過濾排除主旋律、PPQ 時鐘縮放、
 * 通道重定向至 Yamaha 伴奏 8 大標準聲部（CH 9 ~ 16，即內部通道 8 ~ 15），
 * 並封裝寫入至 Yamaha SFF2 / PSR-SX920 伴奏風格 (.STY) 檔案中，完整維護 CASM 與段落標記。
 */

import { YamahaParser } from '../parser/yamaha-parser';
import { YamahaStyleModifier } from './style-modifier';
import { CasmModifier } from './casm-modifier';
import { getGoldenStyleTemplateBytes } from '../data/yamaha-style-template';
import type { SongPartMappingPlan, YamahaPartType } from './midi-part-assign-matrix';
import { MidiSongAnalyzer, type MidiSongAnalysis } from '../parser/midi-song-analyzer';
import type { YamahaFileParsed } from '../models/types';
import { ROOT_SEMITONES_FROM_C } from './chord-transposer';

export interface BarChordInfo {
  bar: number;
  rootName: string;
  rootPitchClass: number;
  isMinor: boolean;
  shiftToC: number;
  chordName: string;
}

export interface MidiSliceAssembleOptions {
  /** 來源 MIDI 解析結果 */
  sourceParsed: YamahaFileParsed;
  /** 來源 MIDI 分析資料 */
  analysis: MidiSongAnalysis;
  /** 起始小節 (1-indexed) */
  startBar: number;
  /** 結束小節 (1-indexed) */
  endBar: number;
  /** 目標 Yamaha 伴奏段落名稱 (例如 'Main A', 'Intro A', 'Fill In AA') */
  targetSection: string;
  /** 伴奏聲部映射與主旋律排除計畫 */
  mappingPlan: SongPartMappingPlan;
  /** 目標伴奏風格物件 (若無則自動採用 Yamaha PSR-SX920 原廠黃金範本初始化) */
  baseStyleParsed?: YamahaFileParsed | null;
  /** 風格名稱 (可選) */
  styleName?: string;
  /** 是否啟用和弦反向正規化為 C 基準大調 (若未指定，Main/Fill/Break 預設為 true，Intro/Ending 預設為 false) */
  normalizeChordsToC?: boolean;
}

export interface AssembledPartInfo {
  part: YamahaPartType;
  targetChannel: number; // 8 ~ 15 (MIDI CH 9 ~ 16)
  sourceChannel: number;
  voiceName: string;
  noteCount: number;
}

export interface MidiSliceAssembleResult {
  success: boolean;
  styleParsed: YamahaFileParsed;
  targetSection: string;
  startBar: number;
  endBar: number;
  totalBars: number;
  totalNotesExtracted: number;
  assembledPartsCount: number;
  partDetails: AssembledPartInfo[];
  isHarmonicallyNormalized: boolean;
  detectedChordsByBar?: Array<{ bar: number; chordName: string; shiftToC: number }>;
  message: string;
}

export class MidiSliceAssembler {
  /**
   * 執行小節切片並裝配至目標 Yamaha 伴奏段落
   */
  public static assembleSliceToSection(options: MidiSliceAssembleOptions): MidiSliceAssembleResult {
    const {
      sourceParsed,
      analysis,
      startBar,
      endBar,
      targetSection,
      mappingPlan,
      baseStyleParsed,
      styleName
    } = options;

    const totalBars = Math.max(1, endBar - startBar + 1);

    // 1. 初始化目標伴奏風格 Parsed 物件
    let styleParsed: YamahaFileParsed;
    if (baseStyleParsed) {
      styleParsed = this.cloneParsed(baseStyleParsed);
    } else {
      const templateBytes = getGoldenStyleTemplateBytes();
      styleParsed = YamahaParser.parse(templateBytes, 'STY');
      (styleParsed as any).styleName = styleName || `${analysis.fileName.replace(/\.[^/.]+$/, '')}_Arranger`;
      styleParsed.bpm = analysis.initialBpm || 120;
    }

    // 2. 計算來源與目標時鐘 (PPQ) 與小節 Tick 邊界
    const srcPpq = sourceParsed.division || 480;
    const targetPpq = styleParsed.division || 1920;
    const scaleFactor = targetPpq / srcPpq;

    const timeSig = sourceParsed.timeSignature || { numerator: 4, denominator: 4 };
    const beatsPerMeasure = timeSig.numerator * (4 / timeSig.denominator);
    const srcTicksPerBar = Math.round(srcPpq * beatsPerMeasure);
    const ticksPerBarSrc = srcTicksPerBar;
    const targetTicksPerBar = Math.round(targetPpq * beatsPerMeasure);

    const startTickSrc = (startBar - 1) * srcTicksPerBar;
    const endTickSrc = endBar * srcTicksPerBar;
    const maxSectionTicksTarget = totalBars * targetTicksPerBar;

    // 3. 確保目標段落存在且小節數吻合
    const existingSection = styleParsed.sections.find(
      s => s.name.toLowerCase() === targetSection.toLowerCase()
    );

    if (!existingSection) {
      const created = YamahaStyleModifier.createSection(styleParsed, targetSection, totalBars);
      if (!created) {
        throw new Error(`無法在目標伴奏中建立段落: ${targetSection}`);
      }
    } else {
      // 調整現有段落小節長度
      YamahaStyleModifier.resizeSectionMeasures(styleParsed, targetSection, totalBars);
    }

    // 4. 清除目標段落中所有舊音符，以便寫入全新的切片音符
    YamahaStyleModifier.clearSectionNotes(styleParsed, targetSection);

    // 5. 提取來源 MIDI 中指定小節區間之音符
    // 判定是否啟用和弦反向正規化 (Main / Fill / Break 預設啟用，Intro / Ending 預設直通保留)
    const isMainOrFill = /^(main|fill|break)/i.test(targetSection.trim());
    const shouldNormalize = options.normalizeChordsToC !== undefined
      ? options.normalizeChordsToC
      : isMainOrFill;

    const barChordMap = new Map<number, BarChordInfo>();
    const detectedChordsByBar: Array<{ bar: number; chordName: string; shiftToC: number }> = [];

    if (shouldNormalize) {
      const bassAssign = mappingPlan.assignments.find(a => a.targetPart === 'Bass' && !a.isExcluded);
      const bassCh = bassAssign ? bassAssign.sourceChannel : undefined;

      for (let b = startBar; b <= endBar; b++) {
        const cInfo = MidiSliceAssembler.detectBarChord(sourceParsed, b, ticksPerBarSrc, bassCh);
        barChordMap.set(b, cInfo);
        detectedChordsByBar.push({ bar: b, chordName: cInfo.chordName, shiftToC: cInfo.shiftToC });
      }
    }

    // 建立 sourceChannel -> assignment 快速索引
    const srcAssignMap = new Map<number, typeof mappingPlan.assignments[0]>();
    for (const a of mappingPlan.assignments) {
      srcAssignMap.set(a.sourceChannel, a);
    }

    // 依目標通道 (8 ~ 15) 分組收集提取的音符
    const extractedNotesByTargetCh = new Map<number, Array<{
      noteNumber: number;
      relTick: number;
      durationTicks: number;
      velocity: number;
      sourceChannel: number;
    }>>();

    // 收集來源 MIDI 各軌道落入 [startTickSrc, endTickSrc) 的音符
    // 注意：MIDI 音符以 NoteOn (vel > 0) 與 NoteOff (或 vel == 0) 配對
    for (const track of sourceParsed.tracks) {
      if (!track.events || track.events.length === 0) continue;

      let absTick = 0;
      // 記錄正在發聲的音符: key: `${channel}_${noteNumber}` -> { startAbsTick, velocity }
      const activeNotes = new Map<string, { startAbsTick: number; velocity: number }>();

      for (const ev of track.events) {
        absTick += ev.delta;

        if (ev.channel === undefined) continue;
        const assign = srcAssignMap.get(ev.channel);

        // 若該通道被排除 (主旋律) 或未指派任何 Yamaha 聲部，則直接跳過
        if (!assign || assign.isExcluded || assign.targetChannel === null) {
          continue;
        }

        const targetChannel = assign.targetChannel; // 8 ~ 15
        const noteKey = `${ev.channel}_${ev.noteNumber}`;

        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          // 若之前同一音高未收尾，先結算前一顆音符
          if (activeNotes.has(noteKey)) {
            const prev = activeNotes.get(noteKey)!;
            this.pushExtractedNote(
              extractedNotesByTargetCh,
              targetChannel,
              ev.channel,
              ev.noteNumber!,
              prev.velocity,
              prev.startAbsTick,
              absTick,
              startTickSrc,
              endTickSrc,
              scaleFactor,
              maxSectionTicksTarget,
              barChordMap,
              ticksPerBarSrc
            );
          }
          activeNotes.set(noteKey, { startAbsTick: absTick, velocity: ev.velocity! });
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
          if (activeNotes.has(noteKey)) {
            const prev = activeNotes.get(noteKey)!;
            activeNotes.delete(noteKey);
            this.pushExtractedNote(
              extractedNotesByTargetCh,
              targetChannel,
              ev.channel,
              ev.noteNumber!,
              prev.velocity,
              prev.startAbsTick,
              absTick,
              startTickSrc,
              endTickSrc,
              scaleFactor,
              maxSectionTicksTarget,
              barChordMap,
              ticksPerBarSrc
            );
          }
        }
      }

      // 若軌道結尾仍有未關閉的音符，在 endTickSrc 自動截斷收尾
      for (const [key, prev] of activeNotes.entries()) {
        const [chStr, noteStr] = key.split('_');
        const ch = parseInt(chStr, 10);
        const note = parseInt(noteStr, 10);
        const assign = srcAssignMap.get(ch);
        if (assign && !assign.isExcluded && assign.targetChannel !== null) {
          this.pushExtractedNote(
            extractedNotesByTargetCh,
            assign.targetChannel,
            ch,
            note,
            prev.velocity,
            prev.startAbsTick,
            endTickSrc,
            startTickSrc,
            endTickSrc,
            scaleFactor,
            maxSectionTicksTarget,
            barChordMap,
            ticksPerBarSrc
          );
        }
      }
    }

    // 6. 將提取出的各聲部音符與樂器參數寫入目標段落
    const partDetails: AssembledPartInfo[] = [];
    let totalNotesExtracted = 0;

    for (const assign of mappingPlan.assignments) {
      if (assign.isExcluded || assign.targetChannel === null || assign.targetPart === null) {
        continue;
      }

      const targetCh = assign.targetChannel;
      const notes = extractedNotesByTargetCh.get(targetCh) || [];

      // 寫入音符至段落指定通道
      YamahaStyleModifier.replaceSectionChannelNotes(
        styleParsed,
        targetSection,
        targetCh,
        notes,
        targetCh
      );

      // 同步設定該伴奏聲部的樂器音色與基本混音屬性 (使用起始小節 startBar 當下生效之最新音色與混音參數)
      const effVoice = MidiSongAnalyzer.getEffectiveVoiceAtBar(
        sourceParsed,
        assign.sourceChannel,
        startBar
      );

      YamahaStyleModifier.setPartMixing(
        styleParsed,
        targetCh,
        {
          bankMsb: effVoice.msb,
          bankLsb: effVoice.lsb,
          programChange: effVoice.pc,
          volume: effVoice.volume,
          pan: effVoice.pan,
        },
        { targetSection }
      );

      totalNotesExtracted += notes.length;
      partDetails.push({
        part: assign.targetPart,
        targetChannel: targetCh,
        sourceChannel: assign.sourceChannel,
        voiceName: effVoice.voiceName,
        noteCount: notes.length,
      });
    }

    // 7. 確保目標段落具備合法合規的 CASM 轉調規則 (PSR-SX920 原廠標準)
    const stdRules = CasmModifier.getDefaultPartRules();
    for (const r of stdRules) {
      CasmModifier.injectOrUpdateSectionCasmRule(styleParsed, targetSection, r.channel, r);
    }

    const normDesc = shouldNormalize
      ? ` [已自動執行 C 基準大調和弦正規化: ${detectedChordsByBar.map(c => `第${c.bar}小節(${c.chordName})`).join(' ➔ ')}]`
      : ` [原曲和弦進行直通保留模式]`;

    return {
      success: true,
      styleParsed,
      targetSection,
      startBar,
      endBar,
      totalBars,
      totalNotesExtracted,
      assembledPartsCount: partDetails.length,
      partDetails,
      isHarmonicallyNormalized: shouldNormalize,
      detectedChordsByBar,
      message: `成功提取第 ${startBar} ~ ${endBar} 小節（共 ${totalBars} 小節），並裝配至伴奏段落【${targetSection}】！共提取 ${totalNotesExtracted} 顆音符至 ${partDetails.length} 個伴奏聲部。${normDesc}`,
    };
  }

  /**
   * 輔助處理音符落點、Tick 相對平移、PPQ 縮放、邊界截斷與和弦反向正規化
   */
  private static pushExtractedNote(
    map: Map<number, Array<{ noteNumber: number; relTick: number; durationTicks: number; velocity: number; sourceChannel: number }>>,
    targetChannel: number,
    _sourceChannel: number,
    noteNumber: number,
    velocity: number,
    startAbsTick: number,
    endAbsTick: number,
    startTickSrc: number,
    endTickSrc: number,
    scaleFactor: number,
    maxSectionTicksTarget: number,
    barChordMap?: Map<number, BarChordInfo>,
    ticksPerBarSrc?: number
  ) {
    // 檢查音符是否與切片區間 [startTickSrc, endTickSrc) 有交集
    if (endAbsTick <= startTickSrc || startAbsTick >= endTickSrc) {
      return; // 完全在區間之外
    }

    // 裁切音符起訖點至切片區間內
    const clippedStart = Math.max(startAbsTick, startTickSrc);
    const clippedEnd = Math.min(endAbsTick, endTickSrc);
    const durationSrc = clippedEnd - clippedStart;
    if (durationSrc <= 0) return;

    // 計算相對小節開頭的 Tick 並進行 PPQ 縮放
    const relTickSrc = clippedStart - startTickSrc;
    const relTickTarget = Math.round(relTickSrc * scaleFactor);
    const durationTarget = Math.max(1, Math.round(durationSrc * scaleFactor));

    // 確保不會溢出段落最大邊界
    if (relTickTarget >= maxSectionTicksTarget) return;

    // 若啟用和弦反向正規化且此聲部非打擊樂 (Target Channel 不為 8、9，即非 Rhythm 1 / 2)：
    let effectiveNote = noteNumber;
    if (barChordMap && ticksPerBarSrc && targetChannel !== 8 && targetChannel !== 9) {
      const noteBar = Math.floor(clippedStart / ticksPerBarSrc) + 1;
      const cInfo = barChordMap.get(noteBar);
      if (cInfo && cInfo.shiftToC !== 0) {
        effectiveNote += cInfo.shiftToC;

        // 若原和弦為小調，將小三度 (Eb, pitchClass 3) 轉為大三度 (E, pitchClass 4)，以形成 Yamaha 規範之純淨 C 大調基準樣式
        if (cInfo.isMinor && (effectiveNote % 12 === 3)) {
          effectiveNote += 1;
        }

        // 音域保護限制 (防止移調後衝出樂器正常演奏音區)
        if (targetChannel === 10) {
          // Bass 聲部安全音域：E1 (28) ~ G3 (55)
          while (effectiveNote < 28) effectiveNote += 12;
          while (effectiveNote > 55) effectiveNote -= 12;
        } else {
          // 和弦 / 鋪底吉他 / 鍵盤安全音域：A2 (45) ~ C6 (84)
          while (effectiveNote < 45) effectiveNote += 12;
          while (effectiveNote > 84) effectiveNote -= 12;
        }
      }
    }

    if (!map.has(targetChannel)) {
      map.set(targetChannel, []);
    }

    map.get(targetChannel)!.push({
      noteNumber: Math.max(0, Math.min(127, effectiveNote)),
      relTick: relTickTarget,
      durationTicks: Math.min(durationTarget, maxSectionTicksTarget - relTickTarget),
      velocity: Math.min(127, Math.max(1, velocity)),
      sourceChannel: targetChannel, // 強制歸一化為目標伴奏通道 (8~15)
    });
  }

  /**
   * 智慧分析指定小節 (bar) 之原曲和弦根音與大/小調性，計算回溯至 C 基準大調所需之半音位移
   */
  public static detectBarChord(
    sourceParsed: YamahaFileParsed,
    bar: number,
    ticksPerBar: number,
    bassChannel?: number
  ): BarChordInfo {
    const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const barStartTick = Math.max(0, (bar - 1) * ticksPerBar);
    const barEndTick = bar * ticksPerBar;

    let bassPitch: number | null = null;
    let minBassTick: number = Infinity;
    const pitchCounts = new Array<number>(12).fill(0);

    for (const track of sourceParsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (curTick >= barEndTick) break;
        if (curTick >= barStartTick && ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.noteNumber !== undefined) {
          // 排除打擊樂軌道 (CH 10, channel 9)
          if (ev.channel === 9) continue;

          const pitch = ev.noteNumber;
          pitchCounts[pitch % 12]++;

          // 若指定貝斯通道，或者為該小節最低音且在低音區 (<= 55, G3)
          if (bassChannel !== undefined && ev.channel === bassChannel) {
            if (curTick < minBassTick) {
              minBassTick = curTick;
              bassPitch = pitch;
            }
          } else if (bassPitch === null && pitch <= 55) {
            bassPitch = pitch;
          }
        }
      }
    }

    // 決定根音音級 (Root Pitch Class: 0 ~ 11)
    let rootPc = 0;
    if (bassPitch !== null) {
      rootPc = bassPitch % 12;
    } else {
      // 若無貝斯音符，以出現頻率最高者作為根音候選
      let maxCount = 0;
      for (let i = 0; i < 12; i++) {
        if (pitchCounts[i] > maxCount) {
          maxCount = pitchCounts[i];
          rootPc = i;
        }
      }
    }

    const rootName = PITCH_NAMES[rootPc];
    // 檢驗小三度 (rootPc + 3) vs 大三度 (rootPc + 4)
    const minorThirdCount = pitchCounts[(rootPc + 3) % 12];
    const majorThirdCount = pitchCounts[(rootPc + 4) % 12];
    const isMinor = minorThirdCount > majorThirdCount;

    // 計算反向移調至 C 基準大調所需的半音位移量 (shiftToC)
    // 依據 ROOT_SEMITONES_FROM_C，shiftToC = -ROOT_SEMITONES_FROM_C[rootName]
    const semitonesFromC = ROOT_SEMITONES_FROM_C[rootName] ?? 0;
    const shiftToC = -semitonesFromC;

    const chordName = `${rootName}${isMinor ? 'm' : ''}`;

    return {
      bar,
      rootName,
      rootPitchClass: rootPc,
      isMinor,
      shiftToC,
      chordName,
    };
  }

  /**
   * 深拷貝 YamahaFileParsed 結構，完整保留二進位 Uint8Array 與物件指標
   */
  public static cloneParsed(src: YamahaFileParsed): YamahaFileParsed {
    const cloned: YamahaFileParsed = {
      ...src,
      tracks: src.tracks.map(t => ({
        ...t,
        events: t.events ? t.events.map(e => ({
          ...e,
          metaData: e.metaData ? new Uint8Array(e.metaData) : undefined,
          rawBytes: e.rawBytes ? new Uint8Array(e.rawBytes) : undefined,
        })) : [],
        rawChunk: t.rawChunk ? new Uint8Array(t.rawChunk) : new Uint8Array(0),
      })),
      sections: src.sections ? src.sections.map(s => ({ ...s })) : [],
      customChunks: src.customChunks ? src.customChunks.map(c => ({
        id: c.id,
        offset: c.offset ?? 0,
        data: c.data instanceof Uint8Array
          ? new Uint8Array(c.data)
          : (c.data ? new Uint8Array(Object.values(c.data)) : new Uint8Array(0)),
      })) : [],
      parts: src.parts ? src.parts.map(p => ({ ...p })) : [],
    };
    if ((src as any).styleName) {
      (cloned as any).styleName = (src as any).styleName;
    }
    return cloned;
  }
}
