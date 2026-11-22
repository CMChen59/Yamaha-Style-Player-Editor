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
  isSilent?: boolean;
  isPickupOrSparse?: boolean;
}

export interface SubBarChordEntry extends BarChordInfo {
  startTick: number;
  endTick: number;
  subIndex: number;
}

export type SliceChordMode = 'CM_MINOR' | 'CM7_MAJOR' | 'ORIGINAL_PASS_THROUGH';

export interface MidiSliceAssembleOptions {
  /** 來源 MIDI 解析結果 */
  sourceParsed: YamahaFileParsed;
  /** 來源 MIDI 分析資料 */
  analysis: MidiSongAnalysis;
  /** 起始小節 (1-indexed) */
  startBar: number;
  /** 結束小節 (1-indexed) */
  endBar: number;
  /** 起始拍數 (1-indexed, 預設 1；若有弱起/前置空拍偏移可指定如 3) */
  startBeat?: number;
  /** 結束拍數 (1-indexed, 可選) */
  endBeat?: number;
  /** 目標 Yamaha 伴奏段落名稱 (例如 'Main A', 'Intro A', 'Fill In AA') */
  targetSection: string;
  /** 伴奏聲部映射與主旋律排除計畫 */
  mappingPlan: SongPartMappingPlan;
  /** 目標伴奏風格物件 (若無則自動採用 Yamaha PSR-SX920 原廠黃金範本初始化) */
  baseStyleParsed?: YamahaFileParsed | null;
  /** 風格名稱 (可選) */
  styleName?: string;
  /** 和弦基準模式 (三合一模式：'CM_MINOR' 小調 Cm / 'CM7_MAJOR' 大調 CM7 / 'ORIGINAL_PASS_THROUGH' 原曲直通) */
  chordMode?: SliceChordMode;
  /** @deprecated 相容舊欄位：是否啟用和弦反向正規化為 C 基準大調 (若未指定 chordMode 則使用此欄位) */
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
  startBeat?: number;
  endBeat?: number;
  totalBars: number;
  totalNotesExtracted: number;
  assembledPartsCount: number;
  partDetails: AssembledPartInfo[];
  chordMode: SliceChordMode;
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
    const beatsPerBar = timeSig.numerator;
    const ticksPerBeatSrc = Math.round(srcPpq * (4 / timeSig.denominator));
    const srcTicksPerBar = Math.round(srcPpq * beatsPerMeasure);
    const ticksPerBarSrc = srcTicksPerBar;
    const targetTicksPerBar = Math.round(targetPpq * beatsPerMeasure);

    const startBeat = options.startBeat && options.startBeat >= 1 && options.startBeat <= beatsPerBar ? options.startBeat : 1;
    const startTickSrc = Math.round((startBar - 1) * srcTicksPerBar + (startBeat - 1) * ticksPerBeatSrc);
    const totalBeats = totalBars * beatsPerBar;
    const endTickSrc = Math.round(startTickSrc + totalBeats * ticksPerBeatSrc);
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

    // 5. 判定和弦模式與分析切片和弦進行
    const isIntroOrEnding = /^(intro|ending)/i.test(targetSection.trim());

    const bassAssign = mappingPlan.assignments.find(a => a.targetPart === 'Bass' && !a.isExcluded);
    const bassCh = bassAssign ? bassAssign.sourceChannel : undefined;

    // 分析切片代表性和弦與起始小節和弦 (若有 startBeat 偏移，以 startTickSrc 所在位置之真實和弦為起始基準)
    const repChord = startBeat === 1
      ? MidiSliceAssembler.detectRepresentativeChord(sourceParsed, startBar, endBar, ticksPerBarSrc, bassCh)
      : MidiSliceAssembler.detectTickRangeChord(sourceParsed, startTickSrc, Math.min(endTickSrc, startTickSrc + srcTicksPerBar), bassCh, startBar);
    const startChord = MidiSliceAssembler.detectTickRangeChord(
      sourceParsed,
      startTickSrc,
      startTickSrc + (beatsPerBar === 4 ? Math.round(srcTicksPerBar / 2) : srcTicksPerBar),
      bassCh,
      startBar
    );

    // 全曲調性小調判定：優先讀取 analysis.isMinorKey，或分析調性名稱是否包含 'minor' (修復以前 includes('m') 誤判 'major' 的 bug)
    const isSongMinor = analysis.isMinorKey !== undefined
      ? analysis.isMinorKey
      : (repChord.isMinor || (analysis.keySignatureLabel && analysis.keySignatureLabel.toLowerCase().includes('minor')));

    let effectiveChordMode: SliceChordMode;
    if (options.chordMode) {
      effectiveChordMode = options.chordMode;
    } else if (options.normalizeChordsToC !== undefined) {
      effectiveChordMode = options.normalizeChordsToC ? (isSongMinor ? 'CM_MINOR' : 'CM7_MAJOR') : 'ORIGINAL_PASS_THROUGH';
    } else {
      if (isIntroOrEnding) {
        effectiveChordMode = isSongMinor ? 'CM_MINOR' : 'ORIGINAL_PASS_THROUGH';
      } else {
        effectiveChordMode = isSongMinor ? 'CM_MINOR' : 'CM7_MAJOR';
      }
    }

    const barChordMap = new Map<number, BarChordInfo>();
    const subBarChordList: SubBarChordEntry[] = [];
    const detectedChordsByBar: Array<{ bar: number; chordName: string; shiftToC: number }> = [];

    // 計算切片均一移調至 Cm 所需半音數 (若切片代表和弦為小調，以該切片起點根音為準，例如 Am -> Cm 為 +3；若全曲為小調且無起點，回退至全曲主音)
    const effectiveMinorRoot = repChord.isMinor ? repChord.rootName : (isSongMinor && analysis.detectedTonic ? analysis.detectedTonic : repChord.rootName);
    const uniformShiftToCm = -ROOT_SEMITONES_FROM_C[effectiveMinorRoot] || 0;

    const halfTicks = Math.round(srcTicksPerBar / 2);
    for (let m = 0; m < totalBars; m++) {
      const currentBar = startBar + m;
      const measStartTick = startTickSrc + m * srcTicksPerBar;
      const measEndTick = measStartTick + srcTicksPerBar;

      const cInfo = MidiSliceAssembler.detectTickRangeChord(sourceParsed, measStartTick, measEndTick, bassCh, currentBar);
      barChordMap.set(currentBar, cInfo);

      let displayChordName = cInfo.chordName;

      // 若為 4/4 拍，切成兩半 (各 2 拍高解析度分析)
      if (beatsPerBar === 4) {
        const h1Start = measStartTick;
        const h1End = measStartTick + halfTicks;
        const h2Start = h1End;
        const h2End = measEndTick;

        let c1 = MidiSliceAssembler.detectTickRangeChord(sourceParsed, h1Start, h1End, bassCh, currentBar);
        let c2 = MidiSliceAssembler.detectTickRangeChord(sourceParsed, h2Start, h2End, bassCh, currentBar);

        // 若後半節無音符/靜音，繼承前半節
        if (c2.isSilent && !c1.isSilent) {
          c2 = { ...c1, isSilent: false };
        }

        subBarChordList.push({ ...c1, startTick: h1Start, endTick: h1End, subIndex: 0 });
        subBarChordList.push({ ...c2, startTick: h2Start, endTick: h2End, subIndex: 1 });

        if (c1.chordName !== c2.chordName && !c2.isSilent) {
          displayChordName = `${c1.chordName}-${c2.chordName}`;
        }
      } else {
        subBarChordList.push({ ...cInfo, startTick: measStartTick, endTick: measEndTick, subIndex: 0 });
      }

      const displayShift = effectiveChordMode === 'ORIGINAL_PASS_THROUGH'
        ? 0
        : (effectiveChordMode === 'CM_MINOR' && isIntroOrEnding ? uniformShiftToCm : cInfo.shiftToC);
      detectedChordsByBar.push({ bar: currentBar, chordName: displayChordName, shiftToC: displayShift });
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
              ticksPerBarSrc,
              effectiveChordMode,
              uniformShiftToCm,
              isIntroOrEnding,
              subBarChordList
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
              ticksPerBarSrc,
              effectiveChordMode,
              uniformShiftToCm,
              isIntroOrEnding,
              subBarChordList
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
            ticksPerBarSrc,
            effectiveChordMode,
            uniformShiftToCm,
            isIntroOrEnding,
            subBarChordList
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
      if (r.isDrum) {
        // 打擊樂聲部一律固定根音、Bypass、Drum 標籤
        r.ntr = 'Root Fixed';
        r.ntt = 'Bypass';
        r.sourceChordRoot = 0;
        r.sourceChordType = 2;
      } else if (effectiveChordMode === 'CM_MINOR') {
        // 小調 Cm 基準模式：Source Chord = Cm (Root 0, Type 8)
        r.sourceChordRoot = 0;
        r.sourceChordType = 8;
        r.ntr = 'Root Transpose';
        r.hiKey = 2; // Yamaha 小調標準 HiKey = 2 (D)
        r.retriggerRule = 'Pitch Shift';
        if (r.partId === 'Bass') {
          r.partName = isIntroOrEnding ? 'BassIntr' : 'BassMain';
          r.ntt = 'Bass';
          r.noteLowLimit = isIntroOrEnding ? 0 : 28;
          r.noteHighLimit = isIntroOrEnding ? 127 : 55;
        } else {
          r.partName = isIntroOrEnding ? 'Maj-min ' : r.partName;
          r.ntt = 'Minor'; // 0x07 (Maj-min Minor Table)
          r.noteLowLimit = 0;
          r.noteHighLimit = 127;
        }
      } else if (effectiveChordMode === 'ORIGINAL_PASS_THROUGH') {
        // 原曲直通模式：NTT = Bypass (0x00)，源根音為原曲起始根音
        r.sourceChordRoot = startChord.rootPitchClass;
        r.sourceChordType = startChord.isMinor ? 8 : 0;
        r.ntr = 'Root Transpose';
        r.ntt = 'Bypass'; // 0x00 (琴端不做和弦音階吸附，原汁原味直通播放)
        r.retriggerRule = 'Pitch Shift';
        r.noteLowLimit = 0;
        r.noteHighLimit = 127;
      } else {
        // 大調 CM7 基準模式：Source Chord = CM7 (Root 0, Type 2)
        r.sourceChordRoot = 0;
        r.sourceChordType = 2;
        r.ntr = 'Root Transpose';
        r.retriggerRule = r.partId === 'Bass' ? 'Retrigger' : 'Pitch Shift';
        if (r.partId === 'Bass') {
          r.ntt = 'Bass';
          r.hiKey = 5;
        } else if (r.partId === 'Phrase1' || r.partId === 'Phrase2') {
          r.ntt = 'Melody';
          r.hiKey = 6;
        } else {
          r.ntt = 'Chord';
          r.hiKey = 6;
        }
      }

      CasmModifier.injectOrUpdateSectionCasmRule(styleParsed, targetSection, r.channel, r);
    }

    let modeDesc = '';
    if (effectiveChordMode === 'CM_MINOR') {
      modeDesc = ` [Cm 小調基準模式 (Yamaha SFF2 標準，源和弦 Cm/Type 8，琴端按小和弦純平行移調無失真)]`;
    } else if (effectiveChordMode === 'CM7_MAJOR') {
      modeDesc = ` [CM7 大調基準正規化模式 (源和弦 CM7/Type 2，琴端左手換和弦 100% 精準轉調)]`;
    } else {
      modeDesc = ` [原曲和弦進行直通保留模式 (NTT = Bypass，琴端按單音直通播放原曲編曲)]`;
    }

    const beatInfo = startBeat > 1 ? ` (第 ${startBeat} 拍起音)` : '';

    return {
      success: true,
      styleParsed,
      targetSection,
      startBar,
      endBar,
      startBeat,
      endBeat: startBeat,
      totalBars,
      totalNotesExtracted,
      assembledPartsCount: partDetails.length,
      partDetails,
      chordMode: effectiveChordMode,
      isHarmonicallyNormalized: effectiveChordMode !== 'ORIGINAL_PASS_THROUGH',
      detectedChordsByBar,
      message: `成功提取第 ${startBar} ~ ${endBar} 小節${beatInfo}（共 ${totalBars} 小節），並裝配至伴奏段落【${targetSection}】！共提取 ${totalNotesExtracted} 顆音符至 ${partDetails.length} 個伴奏聲部。${modeDesc}`,
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
    ticksPerBarSrc?: number,
    chordMode: SliceChordMode = 'ORIGINAL_PASS_THROUGH',
    uniformShiftToCm: number = 0,
    isIntroOrEnding: boolean = false,
    subBarChordList?: SubBarChordEntry[]
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

    // 尋找當前音符所在之和弦 (優先採信高解析度半小節和弦，無則回退至小節和弦)
    let cInfo: BarChordInfo | undefined;
    if (subBarChordList && subBarChordList.length > 0) {
      for (const sub of subBarChordList) {
        if (clippedStart >= sub.startTick && clippedStart < sub.endTick) {
          cInfo = sub;
          break;
        }
      }
    }
    if (!cInfo && barChordMap && ticksPerBarSrc) {
      const noteBar = Math.floor(clippedStart / ticksPerBarSrc) + 1;
      cInfo = barChordMap.get(noteBar);
    }

    // 根據 chordMode 判定音高位移 (打擊樂 targetChannel 8, 9 永遠不移調)
    let effectiveNote = noteNumber;
    if (targetChannel !== 8 && targetChannel !== 9) {
      if (chordMode === 'ORIGINAL_PASS_THROUGH') {
        // 原曲直通：保持原音高，零移調
        effectiveNote = noteNumber;
      } else if (chordMode === 'CM_MINOR') {
        // 小調 Cm 基準模式 (Yamaha SFF2 標準)
        if (isIntroOrEnding) {
          // 前奏/尾奏：全段樂句純剛體平行平移至 Cm (保留所有導音與旋律小調音程，如 4006 Intro A)
          effectiveNote += uniformShiftToCm;
          if (targetChannel === 10) {
            // Bass 安全音域
            while (effectiveNote < 28) effectiveNote += 12;
            while (effectiveNote > 60) effectiveNote -= 12;
          } else {
            while (effectiveNote < 36) effectiveNote += 12;
            while (effectiveNote > 96) effectiveNote -= 12;
          }
        } else {
          // Main / Fill 伴奏段落：逐半小節移調至 C minor (保留小三度 Eb，不強升大三度！)
          if (cInfo && cInfo.shiftToC !== 0) {
            effectiveNote += cInfo.shiftToC;
          }
          if (targetChannel === 10) {
            while (effectiveNote < 28) effectiveNote += 12;
            while (effectiveNote > 55) effectiveNote -= 12;
          } else {
            while (effectiveNote < 40) effectiveNote += 12;
            while (effectiveNote > 84) effectiveNote -= 12;
          }
        }
      } else if (chordMode === 'CM7_MAJOR') {
        // 大調 CM7 基準模式 (Yamaha 原廠標準：支援半小節細分和弦反向平移)
        if (cInfo && cInfo.shiftToC !== 0) {
          effectiveNote += cInfo.shiftToC;
          // 若原和弦為小調，將小三度 (Eb, pitchClass 3) 轉為大三度 (E, pitchClass 4)
          if (cInfo.isMinor && (effectiveNote % 12 === 3)) {
            effectiveNote += 1;
          }
          if (targetChannel === 10) {
            while (effectiveNote < 28) effectiveNote += 12;
            while (effectiveNote > 55) effectiveNote -= 12;
          } else {
            while (effectiveNote < 45) effectiveNote += 12;
            while (effectiveNote > 84) effectiveNote -= 12;
          }
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
   * 智慧分析指定 Tick 範圍 [rangeStartTick, rangeEndTick) 內之原曲和弦根音與大/小調性
   */
  public static detectTickRangeChord(
    sourceParsed: YamahaFileParsed,
    rangeStartTick: number,
    rangeEndTick: number,
    bassChannel?: number,
    bar: number = 1
  ): BarChordInfo {
    const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

    let bassPitch: number | null = null;
    let minBassTick: number = Infinity;
    const pitchCounts = new Array<number>(12).fill(0);

    for (const track of sourceParsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (curTick >= rangeEndTick) break;
        if (curTick >= rangeStartTick && ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.noteNumber !== undefined) {
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

    const totalNotes = pitchCounts.reduce((s, v) => s + v, 0);
    const distinctPitches = pitchCounts.filter(c => c > 0).length;

    // 若區間完全無音符 (空區間 / 靜音)
    if (totalNotes === 0) {
      return {
        bar,
        rootName: 'C',
        rootPitchClass: 0,
        isMinor: false,
        shiftToC: 0,
        chordName: 'N.C.',
        isSilent: true,
        isPickupOrSparse: true,
      };
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

    // 若無明確貝斯且音級少於 3 個，或者同時缺乏小三度與大三度音，標記為弱起前導音或稀疏小節
    const isPickupOrSparse = bassPitch === null && (distinctPitches < 3 || (minorThirdCount === 0 && majorThirdCount === 0));

    // 計算反向移調至 C 基準大調所需的半音位移量 (shiftToC)
    const semitonesFromC = ROOT_SEMITONES_FROM_C[rootName] ?? 0;
    const shiftToC = semitonesFromC === 0 ? 0 : -semitonesFromC;

    const chordName = `${rootName}${isMinor ? 'm' : ''}`;

    return {
      bar,
      rootName,
      rootPitchClass: rootPc,
      isMinor,
      shiftToC,
      chordName,
      isSilent: false,
      isPickupOrSparse,
    };
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
    const barStartTick = Math.max(0, (bar - 1) * ticksPerBar);
    const barEndTick = bar * ticksPerBar;
    return this.detectTickRangeChord(sourceParsed, barStartTick, barEndTick, bassChannel, bar);
  }

  /**
   * 智慧分析指定小節內之高解析度半小節和弦 (支援 4/4 拍每 2 拍一個和弦變換，徹底解決一小節雙和弦走音問題)
   */
  public static detectSubBarChords(
    sourceParsed: YamahaFileParsed,
    bar: number,
    ticksPerBar: number,
    bassChannel?: number,
    timeSig?: { numerator: number; denominator: number }
  ): SubBarChordEntry[] {
    const num = timeSig?.numerator ?? 4;
    const barStartTick = Math.max(0, (bar - 1) * ticksPerBar);
    const barEndTick = bar * ticksPerBar;

    // 若不是 4 拍或偶數拍 (例如 3/4)，整小節為單一區間
    if (num < 4 || num % 2 !== 0) {
      const whole = this.detectTickRangeChord(sourceParsed, barStartTick, barEndTick, bassChannel, bar);
      return [{
        ...whole,
        startTick: barStartTick,
        endTick: barEndTick,
        subIndex: 0,
      }];
    }

    // 4/4 拍：二等分 (每 2 拍一個子區間)
    const halfTicks = Math.round(ticksPerBar / 2);
    const midTick = barStartTick + halfTicks;

    const sub1 = this.detectTickRangeChord(sourceParsed, barStartTick, midTick, bassChannel, bar);
    const sub2 = this.detectTickRangeChord(sourceParsed, midTick, barEndTick, bassChannel, bar);

    // 若後半小節為靜音或極度稀疏且無貝斯，平滑繼承前半小節之和聲
    const effectiveSub2 = (sub2.isSilent || (sub2.isPickupOrSparse && sub2.rootName === 'C' && sub1.rootName !== 'C'))
      ? { ...sub1, bar, isSilent: sub2.isSilent }
      : sub2;

    // 若前半小節為靜音，平滑繼承後半小節之和聲
    const effectiveSub1 = (sub1.isSilent && !sub2.isSilent)
      ? { ...sub2, bar, isSilent: false }
      : sub1;

    return [
      { ...effectiveSub1, startTick: barStartTick, endTick: midTick, subIndex: 0 },
      { ...effectiveSub2, startTick: midTick, endTick: barEndTick, subIndex: 1 },
    ];
  }

  /**
   * 智慧偵測切片區間 [startBar, endBar] 之代表性起點和弦 (具備弱起拍向後探測 Lookahead Fallback)
   * 若 startBar 為空小節或弱起前導音，自動向後嗅探區間內第一個真正具備和聲/低音進場的小節
   */
  public static detectRepresentativeChord(
    sourceParsed: YamahaFileParsed,
    startBar: number,
    endBar: number,
    ticksPerBar: number,
    bassChannel?: number
  ): BarChordInfo & { effectiveBar: number } {
    let firstNonSilent: BarChordInfo | null = null;

    for (let b = startBar; b <= endBar; b++) {
      const chord = this.detectBarChord(sourceParsed, b, ticksPerBar, bassChannel);
      if (!chord.isSilent && !chord.isPickupOrSparse) {
        return { ...chord, effectiveBar: b };
      }
      if (!firstNonSilent && !chord.isSilent) {
        firstNonSilent = chord;
      }
    }

    const fallback = firstNonSilent || this.detectBarChord(sourceParsed, startBar, ticksPerBar, bassChannel);
    return { ...fallback, effectiveBar: fallback.bar };
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
