/**
 * Yamaha Style 伴奏風格 (.STY) 跨伴奏聲部混搭重組引擎 (Style Remixer)
 * 允許載入多個 STY 伴奏來源（或外部 MIDI 匯入之風格），提取各自聲部（如 Style A 的鼓組、Style B 的貝斯、Style C 的鋼琴和弦），
 * 跨段落自由拼裝組合成全新的 Yamaha SFF2 / PSR-SX920 原廠相容伴奏風格。
 */

import { YamahaStyleSynthesizer } from './style-synthesizer';
import {
  DEFAULT_STYLE_PARTS,
  type StylePartId,
  type StyleSectionType,
  type StylePartConfig,
  type StyleNoteEvent,
  type StyleSectionConfig,
} from '../models/style-types';
import type { YamahaFileParsed, YamahaSection } from '../models/types';

export interface StylePoolEntry {
  id: string;
  name: string;
  parsed: YamahaFileParsed;
}

export interface StylePartSummary {
  partId: StylePartId;
  channel: number;
  noteCount: number;
  pc: number;
  bankMsb: number;
  bankLsb: number;
  volume: number;
  pan: number;
  reverb: number;
  chorus: number;
}

export interface StyleRemixPartAssignment {
  partId: StylePartId;
  sourceStyleId: string;
  sourceSectionName: string;
  transposeShift?: number;
  volume?: number;
  pan?: number;
  voice?: { msb?: number; lsb?: number; pc?: number };
}

export interface StyleRemixSectionSpec {
  targetSectionName: StyleSectionType | string;
  bars?: number;
  parts: Partial<Record<StylePartId, StyleRemixPartAssignment | null>>;
}

export interface StyleRemixOptions {
  projectName: string;
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  division?: number;
  pool: StylePoolEntry[];
  sections: StyleRemixSectionSpec[];
}

export class StyleRemixer {
  /**
   * 取得指定 Style 中所有真正的音樂段落 (過濾 SFF2, SInt, RP*, CM*, N*, I* 等標頭與控制標籤)
   */
  public static getMusicalSections(parsed: YamahaFileParsed): YamahaSection[] {
    return YamahaStyleSynthesizer.getMusicalSections(parsed);
  }

  /**
   * 計算特定段落的起始與結束 Tick 範圍 (包含最後一個段落的自動外推)
   */
  public static getSectionTickRange(
    parsed: YamahaFileParsed,
    sectionName: string
  ): { startTick: number; endTick: number; measureCount: number } | null {
    const musicalSections = this.getMusicalSections(parsed);
    const secIdx = musicalSections.findIndex(
      (s) => s.name.trim().toLowerCase() === sectionName.trim().toLowerCase()
    );
    if (secIdx === -1) return null;

    const sec = musicalSections[secIdx];
    const division = parsed.division || 480;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };
    const ticksPerMeasure = Math.round(division * timeSig.numerator * (4 / timeSig.denominator));

    let startTick = sec.startTick;
    let endTick: number;

    if (sec.endTick !== undefined && sec.endTick > startTick) {
      endTick = sec.endTick;
    } else if (secIdx + 1 < musicalSections.length) {
      endTick = musicalSections[secIdx + 1].startTick;
    } else {
      // 最後一個段落：計算 Track 0 的總 Tick 長度
      const track0 = parsed.tracks[0];
      let totalTicks = 0;
      if (track0) {
        let cur = 0;
        for (const ev of track0.events) {
          cur += ev.delta;
          totalTicks = Math.max(totalTicks, cur);
        }
      }
      endTick = Math.max(startTick + ticksPerMeasure, totalTicks);
    }

    const measureCount = Math.max(1, Math.round((endTick - startTick) / ticksPerMeasure));
    return { startTick, endTick, measureCount };
  }

  /**
   * 計算特定段落與通道內的音符事件數量
   */
  public static countNotesInChannel(
    parsed: YamahaFileParsed,
    startTick: number,
    endTick: number,
    channel: number
  ): number {
    const track0 = parsed.tracks[0];
    if (!track0) return 0;
    let cur = 0;
    let count = 0;
    for (const ev of track0.events) {
      cur += ev.delta;
      if (cur >= startTick && cur < endTick && ev.channel === channel && ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        count++;
      }
    }
    return count;
  }

  /**
   * 取得特定段落與通道在 Track 0 中的音色 (PC/Bank) 或音量 (CC 7) 覆寫設定
   */
  public static getSectionChannelOverride(
    parsed: YamahaFileParsed,
    startTick: number,
    endTick: number,
    channel: number
  ): { pc?: number; bankMsb?: number; bankLsb?: number; volume?: number; pan?: number } {
    const override: { pc?: number; bankMsb?: number; bankLsb?: number; volume?: number; pan?: number } = {};
    const track0 = parsed.tracks[0];
    if (!track0) return override;
    let cur = 0;
    for (const ev of track0.events) {
      cur += ev.delta;
      if (cur >= startTick && cur < endTick && ev.channel === channel) {
        if (ev.type === 'programChange' && ev.program !== undefined) {
          override.pc = ev.program;
        }
        if (ev.type === 'controlChange' && ev.value !== undefined) {
          if (ev.controller === 0) override.bankMsb = ev.value;
          if (ev.controller === 32) override.bankLsb = ev.value;
          if (ev.controller === 7) override.volume = ev.value;
          if (ev.controller === 10) override.pan = ev.value;
        }
      }
    }
    return override;
  }

  /**
   * 智慧判定指定 Style 中對應此聲部的實際 MIDI 通道
   * 1. 優先使用指定 channel (若有手動覆寫)
   * 2. 檢查標準 Yamaha 通道 (Channel 8~15)
   * 3. 檢查 CASM / SFF1 傳統通道指派 (如 Ch 1=Bass, Ch 2=Chord1, Ch 3=Chord2, Ch 4/5=Pad, Ch 6/7=Phrase)
   */
  public static resolveSourceChannel(
    parsed: YamahaFileParsed,
    sectionName: string,
    partId: StylePartId,
    overrideChannel?: number
  ): number {
    if (overrideChannel !== undefined && overrideChannel >= 0 && overrideChannel <= 15) {
      return overrideChannel;
    }

    const range = this.getSectionTickRange(parsed, sectionName);
    const standardChannel = DEFAULT_STYLE_PARTS[partId].channel; // 8~15

    if (!range) return standardChannel;

    // 檢查標準通道在該段落中是否有音符
    const standardNotes = this.countNotesInChannel(parsed, range.startTick, range.endTick, standardChannel);
    if (standardNotes > 0) {
      return standardChannel;
    }

    // 若標準通道無音符，智慧檢查傳統/自訂 SFF 通道映射
    const fallbackChannelsMap: Record<StylePartId, number[]> = {
      Rhythm1: [8, 0],
      Rhythm2: [9, 1, 8],
      Bass: [10, 1, 2],
      Chord1: [11, 2, 3],
      Chord2: [12, 3, 4],
      Pad: [13, 4, 5],
      Phrase1: [14, 5, 6],
      Phrase2: [15, 6, 7],
    };

    const candidates = fallbackChannelsMap[partId] || [standardChannel];
    for (const ch of candidates) {
      const cnt = this.countNotesInChannel(parsed, range.startTick, range.endTick, ch);
      if (cnt > 0) {
        return ch;
      }
    }

    return standardChannel;
  }

  /**
   * 從 Track 0 提取指定段落時間軸範圍內、指定 channel 的所有 Note 事件 (相對段落開頭的 Tick)
   */
  public static extractSectionChannelNotes(
    parsed: YamahaFileParsed,
    startTick: number,
    endTick: number,
    channel: number
  ): Array<{ note: number; velocity: number; startTick: number; durationTick: number }> {
    const track0 = parsed.tracks[0];
    if (!track0) return [];

    const notes: Array<{ note: number; velocity: number; startTick: number; durationTick: number }> = [];
    let curTick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();

    for (const ev of track0.events) {
      curTick += ev.delta;

      if (ev.channel === channel) {
        if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
          if (curTick >= startTick && curTick < endTick) {
            activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
          }
        } else if (
          (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) &&
          ev.noteNumber !== undefined
        ) {
          const startInfo = activeNotes.get(ev.noteNumber);
          if (startInfo) {
            const relTick = startInfo.tick - startTick;
            const duration = Math.max(12, curTick - startInfo.tick);
            notes.push({
              note: ev.noteNumber,
              velocity: startInfo.velocity,
              startTick: relTick,
              durationTick: duration,
            });
            activeNotes.delete(ev.noteNumber);
          }
        }
      }
    }

    // 若有未關閉的 NoteOff，在段落結束點閉合
    for (const [noteNumber, startInfo] of activeNotes.entries()) {
      const relTick = startInfo.tick - startTick;
      const duration = Math.max(12, endTick - startInfo.tick);
      notes.push({
        note: noteNumber,
        velocity: startInfo.velocity,
        startTick: relTick,
        durationTick: duration,
      });
    }

    return notes;
  }

  /**
   * 從 Style 中提取指定段落與指定伴奏聲部 (8 大聲部) 的所有音符事件
   */
  public static extractSectionPartNotes(
    parsed: YamahaFileParsed,
    sectionName: string,
    partId: StylePartId,
    overrideChannel?: number
  ): StyleNoteEvent[] {
    const range = this.getSectionTickRange(parsed, sectionName);
    if (!range) return [];

    const partDef = DEFAULT_STYLE_PARTS[partId];
    if (!partDef) return [];
    const targetChannel = this.resolveSourceChannel(parsed, sectionName, partId, overrideChannel);

    const channelNotes = this.extractSectionChannelNotes(parsed, range.startTick, range.endTick, targetChannel);
    return channelNotes.map((n) => ({
      partId,
      note: n.note,
      velocity: n.velocity,
      startTick: n.startTick,
      durationTick: n.durationTick,
    }));
  }

  /**
   * 取得特定 Style 在某個聲部上的音色與混音預設設定
   */
  public static extractPartVoiceConfig(
    parsed: YamahaFileParsed,
    partId: StylePartId
  ): Partial<StylePartConfig> {
    const partDef = DEFAULT_STYLE_PARTS[partId];
    if (!partDef) return {};

    const targetChannel = partDef.channel;
    const config: Partial<StylePartConfig> = { ...partDef };

    // 1. 先從 parsed.parts 尋找
    const partInfo = parsed.parts.find((p) => p.channel === targetChannel);
    if (partInfo) {
      if (partInfo.programChange !== undefined) config.pc = partInfo.programChange;
      if (partInfo.bankMsb !== undefined) config.msb = partInfo.bankMsb;
      if (partInfo.bankLsb !== undefined) config.lsb = partInfo.bankLsb;
      if (partInfo.volume !== undefined) config.volume = partInfo.volume;
      if (partInfo.pan !== undefined) config.pan = partInfo.pan;
      if (partInfo.reverb !== undefined) config.reverb = partInfo.reverb;
      if (partInfo.chorus !== undefined) config.chorus = partInfo.chorus;
    }

    // 2. 若 Track 0 事件中有更詳細的初始化設定，以 Track 0 開頭事件覆寫
    const track0 = parsed.tracks[0];
    if (track0) {
      for (const ev of track0.events) {
        if (ev.channel === targetChannel) {
          if (ev.type === 'programChange' && ev.program !== undefined) config.pc = ev.program;
          if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
            if (ev.controller === 0) config.msb = ev.value;
            if (ev.controller === 32) config.lsb = ev.value;
            if (ev.controller === 7) config.volume = ev.value;
            if (ev.controller === 10) config.pan = ev.value;
            if (ev.controller === 91) config.reverb = ev.value;
            if (ev.controller === 93) config.chorus = ev.value;
          }
        }
      }
    }

    return config;
  }

  /**
   * 取得某個段落各聲部的詳細摘要資訊 (音符數、音色、音量等)
   */
  public static getSectionSummary(
    parsed: YamahaFileParsed,
    sectionName: string
  ): Record<StylePartId, StylePartSummary> {
    const result: Partial<Record<StylePartId, StylePartSummary>> = {};
    const partKeys: StylePartId[] = [
      'Rhythm1',
      'Rhythm2',
      'Bass',
      'Chord1',
      'Chord2',
      'Pad',
      'Phrase1',
      'Phrase2',
    ];

    for (const key of partKeys) {
      const def = DEFAULT_STYLE_PARTS[key];
      const voice = this.extractPartVoiceConfig(parsed, key);
      const notes = this.extractSectionPartNotes(parsed, sectionName, key);

      result[key] = {
        partId: key,
        channel: def.channel,
        noteCount: notes.length,
        pc: voice.pc ?? def.pc,
        bankMsb: voice.msb ?? def.msb,
        bankLsb: voice.lsb ?? def.lsb,
        volume: voice.volume ?? def.volume,
        pan: voice.pan ?? def.pan,
        reverb: voice.reverb ?? def.reverb,
        chorus: voice.chorus ?? def.chorus,
      };
    }

    return result as Record<StylePartId, StylePartSummary>;
  }

  /**
   * 核心混搭合成引擎：將來自多個 Style Pool 的各聲部拼裝並合成全新的 Yamaha Style (.sty)
   */
  public static remixStyles(options: StyleRemixOptions): YamahaFileParsed {
    const projectName = options.projectName.trim() || 'Remixed Style';
    const bpm = Math.max(30, Math.min(300, options.bpm ?? 120));
    const timeSig = options.timeSignature ?? { numerator: 4, denominator: 4 };
    const division = options.division ?? 480;

    const poolMap = new Map<string, YamahaFileParsed>();
    for (const p of options.pool) {
      poolMap.set(p.id, p.parsed);
    }

    const sectionsConfig: StyleSectionConfig[] = [];
    const partsConfig: Record<StylePartId, StylePartConfig> = { ...DEFAULT_STYLE_PARTS };

    // 處理每個目標段落
    for (const secSpec of options.sections) {
      const targetSecName = secSpec.targetSectionName;
      let maxSectionBars = secSpec.bars || 0;
      const sectionNotes: StyleNoteEvent[] = [];

      // 檢查此段落指派的 8 大聲部
      for (const [partIdStr, assignment] of Object.entries(secSpec.parts)) {
        const partId = partIdStr as StylePartId;
        if (!assignment) continue;

        const srcParsed = poolMap.get(assignment.sourceStyleId);
        if (!srcParsed) continue;

        // 提取該來源風格段落的音符
        const rawNotes = this.extractSectionPartNotes(srcParsed, assignment.sourceSectionName, partId);
        const shift = assignment.transposeShift || 0;
        const isDrum = partId === 'Rhythm1' || partId === 'Rhythm2';

        // 估算小節長度
        const srcRange = this.getSectionTickRange(srcParsed, assignment.sourceSectionName);
        if (srcRange && srcRange.measureCount > maxSectionBars) {
          maxSectionBars = srcRange.measureCount;
        }

        // 提取並更新音色混音參數
        const srcVoice = this.extractPartVoiceConfig(srcParsed, partId);
        partsConfig[partId] = {
          ...partsConfig[partId],
          msb: assignment.voice?.msb ?? srcVoice.msb ?? partsConfig[partId].msb,
          lsb: assignment.voice?.lsb ?? srcVoice.lsb ?? partsConfig[partId].lsb,
          pc: assignment.voice?.pc ?? srcVoice.pc ?? partsConfig[partId].pc,
          volume: assignment.volume ?? srcVoice.volume ?? partsConfig[partId].volume,
          pan: assignment.pan ?? srcVoice.pan ?? partsConfig[partId].pan,
        };

        // 移調音符 (鼓組不移調)
        for (const n of rawNotes) {
          const effectiveShift = isDrum ? 0 : shift;
          const transposed = Math.min(127, Math.max(0, n.note + effectiveShift));
          sectionNotes.push({
            partId,
            note: transposed,
            velocity: n.velocity,
            startTick: n.startTick,
            durationTick: n.durationTick,
          });
        }
      }

      sectionsConfig.push({
        name: targetSecName,
        bars: Math.max(1, maxSectionBars || 4),
        notes: sectionNotes,
      });
    }

    // 調用 YamahaStyleSynthesizer 產生標準 Format 0 單軌與 SFF2 CASM 轉調區塊
    return YamahaStyleSynthesizer.createBlankStyle({
      styleName: projectName,
      bpm,
      timeSignature: timeSig,
      division,
      sections: sectionsConfig,
      parts: partsConfig,
    });
  }
}
