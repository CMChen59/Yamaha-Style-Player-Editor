/**
 * Yamaha Style 伴奏風格 (.STY) 聲部組裝精靈與跨段落拼貼引擎 (Style Section Assembly Studio)
 * 對標 Yamaha 鍵盤原廠 Style Creator -> Assembly 功能：
 * 允許音樂製作人挑選來源風格（當前 STY 或樣式池中其他 STY）、來源段落與來源聲部，
 * 自由拼貼替換至目標風格的指定段落與聲部。
 * 支援循環填滿 (Loop to Fill)、單次填入 (Once/Truncate)、音色效果器同步、半音移調、力度縮放，
 * 以及一鍵複製到所有 Main (A~D) 或所有 Fill In 等批次快速組裝能力。
 * 全程保護 Yamaha SFF2 CASM 轉調二進位區塊與 Track 0 SMF 0 格式結構完整性。
 */

import { YamahaPadModifier } from './pad-modifier';
import { StyleRemixer } from './style-remixer';
import { YamahaStyleModifier, type StylePartMixingParams } from './style-modifier';
import { type StylePartId } from '../models/style-types';
import type {
  YamahaFileParsed,
  MidiEvent,
} from '../models/types';

export interface StyleAssemblyOptions {
  destParsed: YamahaFileParsed;
  destSection: string;
  destChannel: number;
  srcParsed: YamahaFileParsed;
  srcSection: string;
  srcChannel: number;
  copyMode?: 'replace' | 'merge'; // 預設 'replace' (清空目標該聲部現有音符)
  loopMode?: 'loop' | 'once';     // 預設 'loop' (若來源較短則循環對齊填滿)
  copyVoiceParams?: boolean;      // 預設 true (同步音色 Bank MSB/LSB, PC, CC 7, 10, 91, 93)
  transposeShift?: number;        // 半音移調 (-24 ~ +24), 鼓組 Ch 10 強制不受移調影響
  velocityScale?: number;         // 力度縮放倍率 (0.1 ~ 2.0, 預設 1.0)
}

export interface StyleAssemblyResult {
  success: boolean;
  destSection: string;
  destChannel: number;
  srcSection: string;
  srcChannel: number;
  notesCopied: number;
  previousNoteCount: number;
  finalNoteCount: number;
  srcMeasureCount: number;
  destMeasureCount: number;
  loopCount: number;
  message: string;
}

export interface BatchAssemblyOptions {
  destParsed: YamahaFileParsed;
  destSections: string[];
  destChannel: number;
  srcParsed: YamahaFileParsed;
  srcSection: string;
  srcChannel: number;
  copyMode?: 'replace' | 'merge';
  loopMode?: 'loop' | 'once';
  copyVoiceParams?: boolean;
  transposeShift?: number;
  velocityScale?: number;
}

export interface BatchAssemblyResult {
  success: boolean;
  sectionsModified: string[];
  totalNotesCopied: number;
  results: StyleAssemblyResult[];
  message: string;
}

export interface SectionCloneOptions {
  destParsed: YamahaFileParsed;
  destSection: string;
  srcParsed: YamahaFileParsed;
  srcSection: string;
  channels?: number[]; // 若未指定則自動挑選來源段落中所有含音符的通道
  copyMode?: 'replace' | 'merge';
  loopMode?: 'loop' | 'once';
  copyVoiceParams?: boolean;
  transposeShift?: number;
  velocityScale?: number;
}

export interface SectionCloneResult {
  success: boolean;
  srcSection: string;
  destSection: string;
  channelsCloned: number[];
  totalNotesCopied: number;
  results: StyleAssemblyResult[];
  message: string;
}

export interface SectionPartOverview {
  channel: number;
  partId?: StylePartId;
  partName: string;
  shortName: string;
  icon: string;
  noteCount: number;
  voice?: {
    pc?: number;
    bankMsb?: number;
    bankLsb?: number;
    volume?: number;
    pan?: number;
    reverb?: number;
    chorus?: number;
  };
}

export interface SectionOverview {
  name: string;
  startTick: number;
  endTick: number;
  measureCount: number;
  parts: SectionPartOverview[];
  totalNotes: number;
}

/**
 * Yamaha Style 原廠標準常用段落清單 (標準 Arranger Workstation 規範)
 */
export const STANDARD_YAMAHA_SECTIONS: string[] = [
  'Main A',
  'Main B',
  'Main C',
  'Main D',
  'Fill In AA',
  'Fill In BB',
  'Fill In CC',
  'Fill In DD',
  'Fill In BA',
  'Break',
  'Intro A',
  'Intro B',
  'Intro C',
  'Intro D',
  'Ending A',
  'Ending B',
  'Ending C',
  'Ending D',
];

export interface AddSectionOptions {
  sectionName: string;
  bars: number;
}

export interface AddSectionResult {
  success: boolean;
  sectionName: string;
  bars: number;
  startTick: number;
  endTick: number;
  message: string;
}

export class YamahaStyleAssembly {
  /**
   * 取得指定伴奏段落 (Section) 之 8 伴奏聲部概覽資訊（音符數、名稱、圖示、音色設定）
   */
  public static getSectionOverview(parsed: YamahaFileParsed, sectionName: string): SectionOverview | null {
    if (!parsed || !parsed.tracks || parsed.tracks.length === 0) return null;
    const range = StyleRemixer.getSectionTickRange(parsed, sectionName);
    if (!range) return null;

    // 伴奏通道動態探測：
    // 完整納入 parsed.parts 中登記的所有伴奏通道 (相容 SFF1 Ch 1~8 與 SFF2 Ch 9~16)，
    // 以及當前段落或全風格 Track 0 中實際擁有 NoteOn 音符的通道
    const channelSet = new Set<number>();
    for (const p of parsed.parts || []) {
      channelSet.add(p.channel);
    }
    if (parsed.tracks[0]) {
      let cur = 0;
      for (const ev of parsed.tracks[0].events) {
        cur += ev.delta;
        if (cur >= range.startTick && cur < range.endTick && ev.channel !== undefined && ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          channelSet.add(ev.channel);
        }
      }
    }

    // 若為全新空白檔案或無任何通道資訊，預設使用標準 Yamaha SFF2 通道 8~15 (Ch 9~16)
    if (channelSet.size === 0) {
      for (let ch = 8; ch <= 15; ch++) {
        channelSet.add(ch);
      }
    }

    const candidateChannels = Array.from(channelSet).sort((a, b) => a - b);
    const parts: SectionPartOverview[] = [];
    let totalNotes = 0;

    for (const ch of candidateChannels) {
      const noteCount = StyleRemixer.countNotesInChannel(parsed, range.startTick, range.endTick, ch);
      totalNotes += noteCount;

      const parsedPart = parsed.parts.find((p) => p.channel === ch);
      const meta = YamahaStyleModifier.getPartDisplayMeta(ch, parsedPart?.partName);
      const override = StyleRemixer.getSectionChannelOverride(parsed, range.startTick, range.endTick, ch);

      parts.push({
        channel: ch,
        partId: meta.id,
        partName: meta.name,
        shortName: meta.shortName,
        icon: meta.icon,
        noteCount,
        voice: {
          pc: override.pc ?? parsedPart?.programChange,
          bankMsb: override.bankMsb ?? parsedPart?.bankMsb,
          bankLsb: override.bankLsb ?? parsedPart?.bankLsb,
          volume: override.volume ?? parsedPart?.volume,
          pan: override.pan ?? parsedPart?.pan,
          reverb: parsedPart?.reverb,
          chorus: parsedPart?.chorus,
        },
      });
    }

    return {
      name: sectionName,
      startTick: range.startTick,
      endTick: range.endTick,
      measureCount: range.measureCount,
      parts,
      totalNotes,
    };
  }

  /**
   * 取得全風格所有段落概覽
   */
  public static getAllSectionsOverview(parsed: YamahaFileParsed): SectionOverview[] {
    const musicalSections = StyleRemixer.getMusicalSections(parsed);
    const list: SectionOverview[] = [];
    for (const sec of musicalSections) {
      const overview = this.getSectionOverview(parsed, sec.name);
      if (overview) {
        list.push(overview);
      }
    }
    return list;
  }

  /**
   * 取得指定伴奏風格中「尚缺少的 Yamaha 原廠標準段落」清單
   * 例如若風格僅包含 Main A~D、Intro A、Fill In BB，則會回傳 Break、Fill In AA、Ending A 等，方便使用者一鍵選取新增
   */
  public static getMissingStandardSections(parsed: YamahaFileParsed): string[] {
    if (!parsed || !parsed.sections) return [...STANDARD_YAMAHA_SECTIONS];
    const existingNames = new Set(parsed.sections.map((s) => s.name.trim().toLowerCase()));
    return STANDARD_YAMAHA_SECTIONS.filter((name) => !existingNames.has(name.toLowerCase()));
  }

  /**
   * 在伴奏風格中新增全新音樂段落 (Add New Musical Section)
   * 於 Track 0 插入段落 Marker (0xFF 0x06)，分配時間軸 Ticks 並更新 parsed.sections
   * 保持 SFF2 CASM 轉調與 SMF 0 格式結構 100% 完整相容
   */
  public static addNewSection(
    parsed: YamahaFileParsed,
    options: AddSectionOptions
  ): AddSectionResult {
    const rawName = options.sectionName ? options.sectionName.trim() : '';
    if (!rawName) {
      return {
        success: false,
        sectionName: '',
        bars: 0,
        startTick: 0,
        endTick: 0,
        message: '新增失敗：段落名稱不可為空',
      };
    }

    if (!parsed || !parsed.tracks || parsed.tracks.length === 0) {
      return {
        success: false,
        sectionName: rawName,
        bars: 0,
        startTick: 0,
        endTick: 0,
        message: '新增失敗：伴奏結構無效或缺少音軌',
      };
    }

    const track0 = parsed.tracks[0];
    if (!track0 || !track0.events) {
      return {
        success: false,
        sectionName: rawName,
        bars: 0,
        startTick: 0,
        endTick: 0,
        message: '新增失敗：伴奏 Track 0 不存在',
      };
    }

    // 檢查名稱是否已存在 (不分大小寫)
    const exists = parsed.sections.some(
      (s) => s.name.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (exists) {
      return {
        success: false,
        sectionName: rawName,
        bars: 0,
        startTick: 0,
        endTick: 0,
        message: `新增失敗：伴奏段落 [${rawName}] 已經存在，請使用不同的名稱`,
      };
    }

    const bars = Math.max(1, Math.min(128, Math.round(options.bars || 1)));
    const division = parsed.division || 480;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };
    const ticksPerMeasure = Math.round(division * timeSig.numerator * (4 / timeSig.denominator));
    const sectionTicks = bars * ticksPerMeasure;

    // 計算新段落的起始插入 Tick：置於現有所有音樂段落結尾
    const musicalSections = StyleRemixer.getMusicalSections(parsed);
    let insertTick = 0;
    if (musicalSections.length > 0) {
      const lastSec = musicalSections[musicalSections.length - 1];
      const lastRange = StyleRemixer.getSectionTickRange(parsed, lastSec.name);
      if (lastRange) {
        insertTick = lastRange.endTick;
      } else {
        insertTick = lastSec.startTick + (lastSec.measureCount ?? 1) * ticksPerMeasure;
      }
    }
    const endTick = insertTick + sectionTicks;

    // 展開 Track 0 所有事件至絕對 Tick
    let curTick = 0;
    const annotatedEvents: Array<{ ev: MidiEvent; absTick: number; order: number }> = [];
    let orderCounter = 0;
    let endOfTrackEvent: { ev: MidiEvent; absTick: number; order: number } | null = null;

    for (const ev of track0.events) {
      curTick += ev.delta;
      if (ev.type === 'meta' && ev.metaType === 0x2f) {
        endOfTrackEvent = { ev: { ...ev }, absTick: Math.max(curTick, endTick), order: 999999 };
      } else {
        annotatedEvents.push({ ev: { ...ev }, absTick: curTick, order: orderCounter++ });
      }
    }

    // 建立新段落 Marker 事件 (0xFF 0x06)
    const markerEvent: MidiEvent = {
      delta: 0,
      type: 'meta',
      metaType: 0x06,
      text: rawName,
      metaData: new TextEncoder().encode(rawName),
    };
    annotatedEvents.push({ ev: markerEvent, absTick: insertTick, order: orderCounter++ });

    // 確保 End of Track 事件位於所有事件最末端
    if (endOfTrackEvent) {
      annotatedEvents.push(endOfTrackEvent);
    } else {
      annotatedEvents.push({
        ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) },
        absTick: endTick,
        order: 999999,
      });
    }

    // 排序所有事件
    annotatedEvents.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;

      const aIsMeta = a.ev.type === 'meta';
      const bIsMeta = b.ev.type === 'meta';
      if (aIsMeta && !bIsMeta) return -1;
      if (!aIsMeta && bIsMeta) return 1;

      const aIsEOT = a.ev.type === 'meta' && a.ev.metaType === 0x2f;
      const bIsEOT = b.ev.type === 'meta' && b.ev.metaType === 0x2f;
      if (aIsEOT && !bIsEOT) return 1;
      if (!aIsEOT && bIsEOT) return -1;

      return a.order - b.order;
    });

    // 重新編碼 Delta-times
    let prevTick = 0;
    track0.events = annotatedEvents.map((item) => {
      item.ev.delta = Math.max(0, item.absTick - prevTick);
      prevTick = item.absTick;
      return item.ev;
    });

    // 重編碼 Track 0 二進位 Chunk
    YamahaPadModifier.rebuildTrackRawChunk(track0);

    // 更新 parsed.sections 列表
    if (musicalSections.length > 0) {
      const lastSec = musicalSections[musicalSections.length - 1];
      const secInParsed = parsed.sections.find((s) => s.name === lastSec.name);
      if (secInParsed) {
        secInParsed.endTick = insertTick;
        secInParsed.measureCount = Math.max(1, Math.round((insertTick - secInParsed.startTick) / ticksPerMeasure));
      }
    }

    parsed.sections.push({
      name: rawName,
      startTick: insertTick,
      endTick,
      measureCount: bars,
    });
    parsed.sections.sort((a, b) => a.startTick - b.startTick);

    return {
      success: true,
      sectionName: rawName,
      bars,
      startTick: insertTick,
      endTick,
      message: `成功建立全新伴奏段落 [${rawName}] (${bars} 小節，Tick 範圍: ${insertTick} ~ ${endTick})！`,
    };
  }

  /**
   * 單一聲部跨段落 / 跨風格組裝拼貼 (Single Part Assembly)
   * 依據 Yamaha Style Creator Assembly 原廠邏輯進行音符擷取、拍子對齊、小節循環與聲部置換
   */
  public static assemblePart(options: StyleAssemblyOptions): StyleAssemblyResult {
    const {
      destParsed,
      destSection,
      destChannel,
      srcParsed,
      srcSection,
      srcChannel,
    } = options;

    const copyMode = options.copyMode ?? 'replace';
    const loopMode = options.loopMode ?? 'loop';
    const copyVoiceParams = options.copyVoiceParams ?? true;
    const transposeShift = options.transposeShift ?? 0;
    const velocityScale = Math.max(0.1, Math.min(2.0, options.velocityScale ?? 1.0));

    // 1. 驗證來源與目標結構
    if (!destParsed || !destParsed.tracks || destParsed.tracks.length === 0) {
      return this.makeFailResult(options, '目標伴奏結構無效或缺少音軌');
    }
    if (!srcParsed || !srcParsed.tracks || srcParsed.tracks.length === 0) {
      return this.makeFailResult(options, '來源伴奏結構無效或缺少音軌');
    }

    const srcRange = StyleRemixer.getSectionTickRange(srcParsed, srcSection);
    if (!srcRange) {
      return this.makeFailResult(options, `找不到來源段落 [${srcSection}]`);
    }

    const destRange = StyleRemixer.getSectionTickRange(destParsed, destSection);
    if (!destRange) {
      return this.makeFailResult(options, `找不到目標段落 [${destSection}]`);
    }

    const destTrack0 = destParsed.tracks[0];
    if (!destTrack0 || !destTrack0.events) {
      return this.makeFailResult(options, '目標伴奏 Track 0 不存在');
    }

    // 2. 統計目標聲部組裝前音符數
    const previousNoteCount = StyleRemixer.countNotesInChannel(
      destParsed,
      destRange.startTick,
      destRange.endTick,
      destChannel
    );

    // 3. 擷取來源聲部音符
    const rawSrcNotes = StyleRemixer.extractSectionChannelNotes(
      srcParsed,
      srcRange.startTick,
      srcRange.endTick,
      srcChannel
    );

    // 4. 計算時間軸縮放與小節循環
    const srcDivision = srcParsed.division || 480;
    const destDivision = destParsed.division || 480;
    const divisionScale = destDivision / srcDivision;

    const srcSpanTicks = Math.round((srcRange.endTick - srcRange.startTick) * divisionScale);
    const destSpanTicks = destRange.endTick - destRange.startTick;

    if (destSpanTicks <= 0) {
      return this.makeFailResult(options, `目標段落 [${destSection}] 長度為 0 Tick`);
    }

    // 計算循環次數
    let loopCount = 1;
    if (loopMode === 'loop' && srcSpanTicks > 0 && srcSpanTicks < destSpanTicks) {
      loopCount = Math.ceil(destSpanTicks / srcSpanTicks);
    }

    // 產生目標音符序列
    const generatedNotes: Array<{
      note: number;
      velocity: number;
      absStart: number;
      absEnd: number;
    }> = [];

    // Ch 10 (index 9) 為打擊樂鼓組，依 Yamaha 規範強制不受移調影響
    const isDrumChannel = destChannel === 9;

    for (let l = 0; l < loopCount; l++) {
      const loopOffset = l * srcSpanTicks;
      for (const n of rawSrcNotes) {
        const scaledStart = Math.round(n.startTick * divisionScale);
        const scaledDur = Math.round(n.durationTick * divisionScale);

        const relStart = loopOffset + scaledStart;
        if (relStart >= destSpanTicks) continue;

        const relEnd = Math.min(destSpanTicks, relStart + Math.max(12, scaledDur));
        const actualDur = relEnd - relStart;
        if (actualDur <= 0) continue;

        const shiftedNote = isDrumChannel
          ? n.note
          : Math.max(0, Math.min(127, n.note + transposeShift));
        const scaledVel = Math.max(1, Math.min(127, Math.round(n.velocity * velocityScale)));

        const absStart = destRange.startTick + relStart;
        const absEnd = absStart + actualDur;

        generatedNotes.push({
          note: shiftedNote,
          velocity: scaledVel,
          absStart,
          absEnd,
        });
      }
    }

    // 5. 執行 Track 0 音符置換 / 疊加
    // 展開所有事件至絕對 Tick
    let curTick = 0;
    const existingEventsWithTick: Array<{ ev: MidiEvent; absTick: number; order: number }> = [];
    let orderCounter = 0;

    for (const ev of destTrack0.events) {
      curTick += ev.delta;
      const isNote = (ev.type === 'noteOn' || ev.type === 'noteOff') && ev.channel === destChannel;
      const inDestRange = curTick >= destRange.startTick && curTick < destRange.endTick;

      // 若為 Replace 模式且落在目標段落與通道，則排除既有音符
      if (copyMode === 'replace' && isNote && inDestRange) {
        continue;
      }
      existingEventsWithTick.push({ ev: { ...ev }, absTick: curTick, order: orderCounter++ });
    }

    // 加入新生成的音符事件
    for (const gn of generatedNotes) {
      const noteOnEv: MidiEvent = {
        delta: 0,
        type: 'noteOn',
        channel: destChannel,
        noteNumber: gn.note,
        velocity: gn.velocity,
      };
      const noteOffEv: MidiEvent = {
        delta: 0,
        type: 'noteOff',
        channel: destChannel,
        noteNumber: gn.note,
        velocity: 0,
      };

      existingEventsWithTick.push({ ev: noteOnEv, absTick: gn.absStart, order: orderCounter++ });
      existingEventsWithTick.push({ ev: noteOffEv, absTick: gn.absEnd, order: orderCounter++ });
    }

    // 排序所有事件
    // 規則：absTick 升序；若相同 Tick：Meta/Marker 優先，NoteOff 優先於 NoteOn
    existingEventsWithTick.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;

      const aIsMeta = a.ev.type === 'meta';
      const bIsMeta = b.ev.type === 'meta';
      if (aIsMeta && !bIsMeta) return -1;
      if (!aIsMeta && bIsMeta) return 1;

      const aIsOff = a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) === 0);
      const bIsOff = b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) === 0);
      if (aIsOff && !bIsOff) return -1;
      if (!aIsOff && bIsOff) return 1;

      return a.order - b.order;
    });

    // 重新編碼 Delta-times
    let prevTick = 0;
    destTrack0.events = existingEventsWithTick.map((item) => {
      item.ev.delta = Math.max(0, item.absTick - prevTick);
      prevTick = item.absTick;
      return item.ev;
    });

    // 重建 Track 二進位 Chunk 並清洗重疊音
    YamahaPadModifier.sanitizeTrackDuplicateNotes(destTrack0);
    YamahaPadModifier.rebuildTrackRawChunk(destTrack0);

    // 6. 若需要，同步聲部音色與效果器參數 (Copy Voice Params)
    if (copyVoiceParams) {
      this.syncVoiceParams(srcParsed, srcChannel, srcSection, destParsed, destChannel, destSection);
    }

    // 7. 確保 destParsed.parts 包含此通道條目以維持 UI 混音盤同步
    this.ensureDestPartEntry(destParsed, destChannel);

    const finalNoteCount = StyleRemixer.countNotesInChannel(
      destParsed,
      destRange.startTick,
      destRange.endTick,
      destChannel
    );

    const meta = YamahaStyleModifier.getPartDisplayMeta(destChannel);
    const message = `成功將 [${srcSection}] 的 ${meta.name} (Ch ${srcChannel + 1}) 組裝至 [${destSection}] (Ch ${destChannel + 1})：複製 ${generatedNotes.length} 個音符 (循環 ${loopCount} 次)，目標最終音符數由 ${previousNoteCount} 變更為 ${finalNoteCount}。`;

    return {
      success: true,
      destSection,
      destChannel,
      srcSection,
      srcChannel,
      notesCopied: generatedNotes.length,
      previousNoteCount,
      finalNoteCount,
      srcMeasureCount: srcRange.measureCount,
      destMeasureCount: destRange.measureCount,
      loopCount,
      message,
    };
  }

  /**
   * 批次組裝聲部至多個目標段落 (Batch Assembly to Multiple Sections)
   * 允許一鍵將指定聲部複製套用至例如所有 Main 段落或指定段落清單
   */
  public static assemblePartToSections(options: BatchAssemblyOptions): BatchAssemblyResult {
    const { destSections } = options;
    const results: StyleAssemblyResult[] = [];
    const modified: string[] = [];
    let totalCopied = 0;

    for (const secName of destSections) {
      const res = this.assemblePart({
        destParsed: options.destParsed,
        destSection: secName,
        destChannel: options.destChannel,
        srcParsed: options.srcParsed,
        srcSection: options.srcSection,
        srcChannel: options.srcChannel,
        copyMode: options.copyMode,
        loopMode: options.loopMode,
        copyVoiceParams: options.copyVoiceParams,
        transposeShift: options.transposeShift,
        velocityScale: options.velocityScale,
      });

      results.push(res);
      if (res.success) {
        modified.push(secName);
        totalCopied += res.notesCopied;
      }
    }

    const success = modified.length > 0;
    const message = success
      ? `批次組裝完成：已成功複製到 ${modified.length} 個段落 [${modified.join(', ')}]，共寫入 ${totalCopied} 個音符。`
      : '批次組裝未成功套用至任何段落。';

    return {
      success,
      sectionsModified: modified,
      totalNotesCopied: totalCopied,
      results,
      message,
    };
  }

  /**
   * 一鍵將指定聲部複製到全體 Main 伴奏段落 (Main A, Main B, Main C, Main D)
   */
  public static copyPartToAllMains(
    destParsed: YamahaFileParsed,
    srcSection: string,
    channel: number,
    srcParsed?: YamahaFileParsed,
    options?: Partial<StyleAssemblyOptions>
  ): BatchAssemblyResult {
    const musicalSections = StyleRemixer.getMusicalSections(destParsed);
    const mainSections = musicalSections
      .map((s) => s.name)
      .filter((n) => n.trim().toLowerCase().startsWith('main'));

    return this.assemblePartToSections({
      destParsed,
      destSections: mainSections,
      destChannel: channel,
      srcParsed: srcParsed ?? destParsed,
      srcSection,
      srcChannel: channel,
      copyMode: options?.copyMode ?? 'replace',
      loopMode: options?.loopMode ?? 'loop',
      copyVoiceParams: options?.copyVoiceParams ?? true,
      transposeShift: options?.transposeShift ?? 0,
      velocityScale: options?.velocityScale ?? 1.0,
    });
  }

  /**
   * 一鍵將指定聲部複製到全體過門段落 (Fill In AA, BB, CC, DD, BA 等)
   */
  public static copyPartToAllFills(
    destParsed: YamahaFileParsed,
    srcSection: string,
    channel: number,
    srcParsed?: YamahaFileParsed,
    options?: Partial<StyleAssemblyOptions>
  ): BatchAssemblyResult {
    const musicalSections = StyleRemixer.getMusicalSections(destParsed);
    const fillSections = musicalSections
      .map((s) => s.name)
      .filter((n) => n.trim().toLowerCase().startsWith('fill'));

    return this.assemblePartToSections({
      destParsed,
      destSections: fillSections,
      destChannel: channel,
      srcParsed: srcParsed ?? destParsed,
      srcSection,
      srcChannel: channel,
      copyMode: options?.copyMode ?? 'replace',
      loopMode: options?.loopMode ?? 'loop',
      copyVoiceParams: options?.copyVoiceParams ?? true,
      transposeShift: options?.transposeShift ?? 0,
      velocityScale: options?.velocityScale ?? 1.0,
    });
  }

  /**
   * 整段伴奏段落完整克隆複製 (Full Section Clone)
   * 將來源段落的所有聲部通道一次性複製填滿至目標段落
   */
  public static cloneFullSection(options: SectionCloneOptions): SectionCloneResult {
    const { destParsed, destSection, srcParsed, srcSection } = options;

    const srcOverview = this.getSectionOverview(srcParsed, srcSection);
    if (!srcOverview) {
      return {
        success: false,
        srcSection,
        destSection,
        channelsCloned: [],
        totalNotesCopied: 0,
        results: [],
        message: `來源段落 [${srcSection}] 不存在`,
      };
    }

    // 決定要複製的通道清單
    const targetChannels =
      options.channels ??
      srcOverview.parts.filter((p) => p.noteCount > 0).map((p) => p.channel);

    const clonedChannels: number[] = [];
    let totalNotes = 0;
    const results: StyleAssemblyResult[] = [];

    for (const ch of targetChannels) {
      const res = this.assemblePart({
        destParsed,
        destSection,
        destChannel: ch,
        srcParsed,
        srcSection,
        srcChannel: ch,
        copyMode: options.copyMode ?? 'replace',
        loopMode: options.loopMode ?? 'loop',
        copyVoiceParams: options.copyVoiceParams ?? true,
        transposeShift: options.transposeShift ?? 0,
        velocityScale: options.velocityScale ?? 1.0,
      });

      results.push(res);
      if (res.success) {
        clonedChannels.push(ch);
        totalNotes += res.notesCopied;
      }
    }

    const success = clonedChannels.length > 0;
    const message = success
      ? `段落完整克隆成功：已將 [${srcSection}] 的 ${clonedChannels.length} 個聲部完整拼貼至 [${destSection}]，共複製 ${totalNotes} 個音符。`
      : `段落克隆未複製任何聲部。`;

    return {
      success,
      srcSection,
      destSection,
      channelsCloned: clonedChannels,
      totalNotesCopied: totalNotes,
      results,
      message,
    };
  }

  // ========================================================
  // 內部輔助方法 (Internal Helpers)
  // ========================================================

  /**
   * 同步音色與效果器參數從來源通道至目標通道
   */
  private static syncVoiceParams(
    srcParsed: YamahaFileParsed,
    srcChannel: number,
    srcSection: string,
    destParsed: YamahaFileParsed,
    destChannel: number,
    destSection: string
  ): void {
    const srcRange = StyleRemixer.getSectionTickRange(srcParsed, srcSection);
    const srcOverride = srcRange
      ? StyleRemixer.getSectionChannelOverride(srcParsed, srcRange.startTick, srcRange.endTick, srcChannel)
      : {};
    const srcPart = srcParsed.parts.find((p) => p.channel === srcChannel);

    const mixingParams: StylePartMixingParams = {
      bankMsb: srcOverride.bankMsb ?? srcPart?.bankMsb,
      bankLsb: srcOverride.bankLsb ?? srcPart?.bankLsb,
      programChange: srcOverride.pc ?? srcPart?.programChange,
      volume: srcOverride.volume ?? srcPart?.volume,
      pan: srcOverride.pan ?? srcPart?.pan,
      reverb: srcPart?.reverb,
      chorus: srcPart?.chorus,
    };

    YamahaStyleModifier.setPartMixing(destParsed, destChannel, mixingParams, {
      targetSection: destSection,
    });
  }

  /**
   * 確保目標解析物件的 parts 清單中包含指定通道
   */
  private static ensureDestPartEntry(parsed: YamahaFileParsed, channel: number): void {
    if (!parsed.parts.some((p) => p.channel === channel)) {
      const meta = YamahaStyleModifier.getPartDisplayMeta(channel);
      const isDrum = channel === 8 || channel === 9;
      parsed.parts.push({
        trackIndex: 0,
        channel,
        partName: meta.name,
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
        bankMsb: isDrum ? 127 : 0,
        bankLsb: 0,
        programChange: 0,
      });
      parsed.parts.sort((a, b) => a.channel - b.channel);
    }
  }

  private static makeFailResult(
    options: StyleAssemblyOptions,
    message: string
  ): StyleAssemblyResult {
    return {
      success: false,
      destSection: options.destSection,
      destChannel: options.destChannel,
      srcSection: options.srcSection,
      srcChannel: options.srcChannel,
      notesCopied: 0,
      previousNoteCount: 0,
      finalNoteCount: 0,
      srcMeasureCount: 0,
      destMeasureCount: 0,
      loopCount: 0,
      message,
    };
  }
}
