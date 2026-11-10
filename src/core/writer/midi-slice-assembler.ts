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
import type { MidiSongAnalysis } from '../parser/midi-song-analyzer';
import type { YamahaFileParsed } from '../models/types';

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
              maxSectionTicksTarget
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
              maxSectionTicksTarget
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
            maxSectionTicksTarget
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

      // 同步設定該伴奏聲部的樂器音色與基本混音屬性
      const srcChInfo = analysis.activeChannels.find(c => c.channel === assign.sourceChannel);
      if (srcChInfo) {
        YamahaStyleModifier.setPartMixing(
          styleParsed,
          targetCh,
          {
            bankMsb: srcChInfo.msb,
            bankLsb: srcChInfo.lsb,
            programChange: srcChInfo.pc,
            volume: 100,
            pan: 64,
          },
          { targetSection }
        );
      }

      totalNotesExtracted += notes.length;
      partDetails.push({
        part: assign.targetPart,
        targetChannel: targetCh,
        sourceChannel: assign.sourceChannel,
        voiceName: assign.voiceName,
        noteCount: notes.length,
      });
    }

    // 7. 確保目標段落具備合法合規的 CASM 轉調規則 (PSR-SX920 原廠標準)
    const stdRules = CasmModifier.getDefaultPartRules();
    for (const r of stdRules) {
      CasmModifier.injectOrUpdateSectionCasmRule(styleParsed, targetSection, r.channel, r);
    }

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
      message: `成功提取第 ${startBar} ~ ${endBar} 小節（共 ${totalBars} 小節），並裝配至伴奏段落【${targetSection}】！共提取 ${totalNotesExtracted} 顆音符至 ${partDetails.length} 個伴奏聲部。`,
    };
  }

  /**
   * 輔助處理音符落點、Tick 相對平移、PPQ 縮放與邊界截斷
   */
  private static pushExtractedNote(
    map: Map<number, Array<{ noteNumber: number; relTick: number; durationTicks: number; velocity: number; sourceChannel: number }>>,
    targetChannel: number,
    sourceChannel: number,
    noteNumber: number,
    velocity: number,
    startAbsTick: number,
    endAbsTick: number,
    startTickSrc: number,
    endTickSrc: number,
    scaleFactor: number,
    maxSectionTicksTarget: number
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

    if (!map.has(targetChannel)) {
      map.set(targetChannel, []);
    }

    map.get(targetChannel)!.push({
      noteNumber,
      relTick: relTickTarget,
      durationTicks: Math.min(durationTarget, maxSectionTicksTarget - relTickTarget),
      velocity: Math.min(127, Math.max(1, velocity)),
      sourceChannel,
    });
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
