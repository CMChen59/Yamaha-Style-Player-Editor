/**
 * Yamaha PSR-SX920 伴奏風格 (.STY) 載入與解構引擎 (StyLoader)
 * 負責將實體琴 STY 二進位資料完整解析為 Creator App 狀態架構：
 * 1. 拆解 Track 0 中的所有段落（Main A~D, Fill In AA~DD, Break, Intro A~C, Ending A~C）。
 * 2. 精準將時間軸（Ticks）量化映射至步進網格（Step Grid / Piano Roll）。
 * 3. 提取鼓組、貝斯、和弦與 4 組動態伴奏聲部（Chord 2, Pad, Phrase 1, Phrase 2）之音符與音色混音參數。
 * 4. 保留原曲 CASM 轉調群組與 OTS 系統標頭底座。
 */

import { YamahaParser } from '../core/parser/yamaha-parser';
import type { MidiEvent } from '../core/models/types';
import type { SectionStore, RealNoteMeta } from './creator-app';
import { YAMAHA_SX920_DRUM_KITS, type YamahaDrumKitPreset } from './drum-kits';
import { YAMAHA_SX920_BASS_VOICES, type YamahaBassPreset } from './bass-voices';
import { YAMAHA_SX920_CHORD_VOICES, type YamahaChordPreset } from './chord-voices';
import { findYamahaVoice } from '../core/data/yamaha-voices';

export function mapToChordCategory(cat?: string): YamahaChordPreset['category'] {
  switch (cat) {
    case 'Piano': return 'Piano';
    case 'E.Piano': return 'E.Piano';
    case 'Guitar': return 'Guitar';
    case 'Strings': return 'Strings';
    case 'Organ': return 'Organ';
    case 'Accordion': return 'Accordion';
    case 'Brass': return 'Brass';
    case 'Saxophone': return 'Saxophone';
    case 'Pad': return 'Pad';
    case 'Choir': return 'Choir';
    default: return 'Synth';
  }
}

export function getVoiceIcon(cat?: string): string {
  switch (cat) {
    case 'Piano': return '🎹';
    case 'E.Piano': return '⚡';
    case 'Guitar': return '🎸';
    case 'Bass': return '🎸';
    case 'Strings': return '🎻';
    case 'Brass': return '🎺';
    case 'Saxophone': return '🎷';
    case 'Woodwind': return '🪈';
    case 'Organ': return '🎼';
    case 'Accordion': return '🪗';
    case 'Pad': return '🌌';
    case 'Choir': return '👼';
    case 'Drums':
    case 'Percussion': return '🥁';
    default: return '🎵';
  }
}

/**
 * 100% 精準解析 PSR-SX920 官方鼓組身分證 (Bank MSB/LSB/PC)
 */
export function resolveExactDrumKit(msb: number = 127, lsb: number = 0, pc: number = 0): YamahaDrumKitPreset {
  const preset = YAMAHA_SX920_DRUM_KITS.find(k => k.msb === msb && k.lsb === lsb && k.pc === pc);
  if (preset) return preset;

  const found = findYamahaVoice(msb, lsb, pc);
  if (found) {
    const name = found.chineseName ? `${found.name} (${found.chineseName})` : found.name;
    return {
      id: `drum-${msb}-${lsb}-${pc}`,
      name,
      category: found.category || 'Drums',
      msb,
      lsb,
      pc,
      panelPc: pc + 1,
      icon: '🥁',
      description: found.chineseName || found.name,
    };
  }

  return {
    id: `drum-${msb}-${lsb}-${pc}`,
    name: `Drum Kit (Bank ${msb}-${lsb} PC ${pc + 1})`,
    category: 'Drums',
    msb,
    lsb,
    pc,
    panelPc: pc + 1,
    icon: '🥁',
    description: `Yamaha 鼓組 (Bank ${msb}-${lsb}, PC ${pc + 1})`,
  };
}

/**
 * 100% 精準解析 PSR-SX920 官方貝斯身分證 (Bank MSB/LSB/PC)
 */
export function resolveExactBassVoice(msb: number = 104, lsb: number = 2, pc: number = 33): YamahaBassPreset {
  const preset = YAMAHA_SX920_BASS_VOICES.find(b => b.msb === msb && b.lsb === lsb && b.pc === pc);
  if (preset) return preset;

  const found = findYamahaVoice(msb, lsb, pc);
  if (found) {
    const name = found.chineseName ? `${found.name} (${found.chineseName})` : found.name;
    const isAcoustic = found.name.toLowerCase().includes('acoustic') || (found.chineseName && found.chineseName.includes('原聲'));
    return {
      id: `bass-${msb}-${lsb}-${pc}`,
      name,
      category: isAcoustic ? 'Acoustic' : 'Electric',
      msb,
      lsb,
      pc,
      panelPc: pc + 1,
      icon: '🎸',
      description: found.chineseName || found.name,
    };
  }

  return {
    id: `bass-${msb}-${lsb}-${pc}`,
    name: `Bass (Bank ${msb}-${lsb} PC ${pc + 1})`,
    category: 'Electric',
    msb,
    lsb,
    pc,
    panelPc: pc + 1,
    icon: '🎸',
    description: `Yamaha 貝斯 (Bank ${msb}-${lsb}, PC ${pc + 1})`,
  };
}

/**
 * 100% 精準解析 PSR-SX920 官方和弦/動態伴奏音色身分證 (Bank MSB/LSB/PC 完整三聯號檢索，絕不盲目只查 PC)
 */
export function resolveExactChordVoice(
  msb: number = 104,
  lsb: number = 0,
  pc: number = 0,
  defaultCategory: string = 'Guitar'
): YamahaChordPreset {
  const preset = YAMAHA_SX920_CHORD_VOICES.find(c => c.msb === msb && c.lsb === lsb && c.pc === pc);
  if (preset) return preset;

  const found = findYamahaVoice(msb, lsb, pc);
  if (found) {
    const category = mapToChordCategory(found.category || defaultCategory);
    const name = found.chineseName ? `${found.name} (${found.chineseName})` : found.name;
    return {
      id: `voice-${msb}-${lsb}-${pc}`,
      name,
      category,
      categoryLabel: found.chineseName || found.name,
      msb,
      lsb,
      pc,
      panelPc: pc + 1,
      icon: getVoiceIcon(found.category),
      description: found.chineseName || found.name,
    };
  }

  return {
    id: `custom-${msb}-${lsb}-${pc}`,
    name: `Voice (Bank ${msb}-${lsb} PC ${pc + 1})`,
    category: mapToChordCategory(defaultCategory),
    categoryLabel: '原檔自訂音色',
    msb,
    lsb,
    pc,
    panelPc: pc + 1,
    icon: getVoiceIcon(defaultCategory),
    description: `Yamaha 音色 (Bank ${msb}-${lsb}, PC ${pc + 1})`,
  };
}

export interface LoadedStyleResult {
  fileName: string;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  division: number;
  sections: Map<string, SectionStore>;
  drumKit: YamahaDrumKitPreset;
  rhythm1Kit?: YamahaDrumKitPreset;
  bassVoice: YamahaBassPreset;
  chordVoice: YamahaChordPreset;
  dynamicVoices: Record<string, YamahaChordPreset>;
  mixer: Record<string, { volume: number; pan: number; reverb: number; chorus: number }>;
  rawBytes: Uint8Array;
  activeDrumNotes: number[];
  activeDynamicPartIds: ('Chord2' | 'Pad' | 'Phrase1' | 'Phrase2')[];
  summary: string;
}

export class StyLoader {
  /**
   * 載入並解析 STY 檔案位元組
   */
  public static loadFromBytes(buffer: Uint8Array, fileName: string = 'Imported.sty'): LoadedStyleResult {
    const parsed = YamahaParser.parse(buffer, 'STY');

    const bpm = parsed.bpm && parsed.bpm > 20 && parsed.bpm < 300 ? parsed.bpm : 120;
    const timeSig = parsed.timeSignature ?? { numerator: 4, denominator: 4 };
    const division = parsed.division || 1920;

    // 計算每小節 ticks 與每步進 ticks
    // 預設 4/4 拍為 16 步進 (1/16 音符)；6/8 拍為 12 步進
    const stepsPerBar = timeSig.numerator === 6 && timeSig.denominator === 8 ? 12 : 16;
    const ticksPerMeasure = Math.round(division * timeSig.numerator * (4 / timeSig.denominator));
    const ticksPerStep = Math.max(1, Math.round(ticksPerMeasure / stepsPerBar));

    // 1. 扁平化展開所有音軌的時間軸事件（支援 SMF Format 0 與 Format 1）
    interface FlatEvent extends MidiEvent {
      absTick: number;
    }
    const flatEvents: FlatEvent[] = [];

    for (const track of parsed.tracks) {
      let t = 0;
      for (const ev of track.events) {
        t += ev.delta;
        flatEvents.push({ ...ev, absTick: t });
      }
    }
    flatEvents.sort((a, b) => a.absTick - b.absTick);

    // 2. 聲部與音色、混音參數提取 (100% 原檔 Bank MSB/LSB/PC 無損映射)
    const mixer: Record<string, { volume: number; pan: number; reverb: number; chorus: number }> = {
      rhythm1: { volume: 90, pan: 64, reverb: 40, chorus: 0 },
      drum: { volume: 100, pan: 64, reverb: 40, chorus: 0 },
      bass: { volume: 95, pan: 64, reverb: 20, chorus: 0 },
      chord: { volume: 90, pan: 52, reverb: 65, chorus: 20 },
      Chord2: { volume: 85, pan: 76, reverb: 50, chorus: 40 },
      Pad: { volume: 80, pan: 64, reverb: 75, chorus: 50 },
      Phrase1: { volume: 85, pan: 44, reverb: 60, chorus: 20 },
      Phrase2: { volume: 80, pan: 84, reverb: 60, chorus: 30 },
    };

    // 統計各通道在全曲的所有 NoteOn 音符數量，以實現「音符權重導向」通道精確匹配
    const channelNoteCounts = new Map<number, number>();
    for (const ev of flatEvents) {
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
        channelNoteCounts.set(ev.channel, (channelNoteCounts.get(ev.channel) || 0) + 1);
      }
    }

    // 建立 parsed.parts 快速通道索引表
    const partsByChannel = new Map<number, typeof parsed.parts[0]>();
    for (const p of parsed.parts) {
      partsByChannel.set(p.channel, p);
    }

    // 優先選取具有音符的通道，若皆有或皆無則依權重與存在性在 SFF2 (8~15) 與 SFF1 (0~7) 間精準抉擇
    const pickBestPart = (sff2Ch: number, sff1Ch: number) => {
      const c2 = channelNoteCounts.get(sff2Ch) || 0;
      const c1 = channelNoteCounts.get(sff1Ch) || 0;
      let chosenCh = sff2Ch;
      if (c2 > 0 && c1 === 0) {
        chosenCh = sff2Ch;
      } else if (c1 > 0 && c2 === 0) {
        chosenCh = sff1Ch;
      } else if (c2 > 0 && c1 > 0) {
        chosenCh = c2 >= c1 ? sff2Ch : sff1Ch;
      } else {
        chosenCh = partsByChannel.has(sff2Ch) ? sff2Ch : sff1Ch;
      }
      return partsByChannel.get(chosenCh) || partsByChannel.get(sff2Ch) || partsByChannel.get(sff1Ch);
    };

    // 1. 主鼓組 (Ch 10 Rhythm 2: SFF2 9 vs SFF1 7)
    const drumPart = pickBestPart(9, 7);
    if (drumPart) {
      if (drumPart.volume !== undefined) mixer.drum.volume = drumPart.volume;
      if (drumPart.pan !== undefined) mixer.drum.pan = drumPart.pan;
      if (drumPart.reverb !== undefined) mixer.drum.reverb = drumPart.reverb;
      if (drumPart.chorus !== undefined) mixer.drum.chorus = drumPart.chorus;
    }
    const drumMsb = drumPart?.bankMsb ?? 127;
    const drumLsb = drumPart?.bankLsb ?? 0;
    const drumPc = drumPart?.programChange ?? 0;
    let selectedDrumKit: YamahaDrumKitPreset = resolveExactDrumKit(drumMsb, drumLsb, drumPc);

    // 2. 副鼓組 / 打擊樂 (Ch 9 Rhythm 1: SFF2 8 vs SFF1 0)
    const r1Part = pickBestPart(8, 0);
    let selectedRhythm1Kit: YamahaDrumKitPreset | undefined = undefined;
    if (r1Part) {
      if (r1Part.volume !== undefined) mixer.rhythm1.volume = r1Part.volume;
      if (r1Part.pan !== undefined) mixer.rhythm1.pan = r1Part.pan;
      if (r1Part.reverb !== undefined) mixer.rhythm1.reverb = r1Part.reverb;
      if (r1Part.chorus !== undefined) mixer.rhythm1.chorus = r1Part.chorus;
      if (r1Part.programChange !== undefined) {
        const r1Msb = r1Part.bankMsb ?? 127;
        const r1Lsb = r1Part.bankLsb ?? 0;
        const r1Pc = r1Part.programChange;
        selectedRhythm1Kit = resolveExactDrumKit(r1Msb, r1Lsb, r1Pc);
      }
    }

    // 3. 貝斯 (Ch 11 Bass: SFF2 10 vs SFF1 1)
    const bassPart = pickBestPart(10, 1);
    if (bassPart) {
      if (bassPart.volume !== undefined) mixer.bass.volume = bassPart.volume;
      if (bassPart.pan !== undefined) mixer.bass.pan = bassPart.pan;
      if (bassPart.reverb !== undefined) mixer.bass.reverb = bassPart.reverb;
      if (bassPart.chorus !== undefined) mixer.bass.chorus = bassPart.chorus;
    }
    const bassMsb = bassPart?.bankMsb ?? 104;
    const bassLsb = bassPart?.bankLsb ?? 2;
    const bassPc = bassPart?.programChange ?? 33;
    let selectedBassVoice: YamahaBassPreset = resolveExactBassVoice(bassMsb, bassLsb, bassPc);

    // 4. 和弦 1 (Ch 12 Chord 1: SFF2 11 vs SFF1 2)
    const chordPart = pickBestPart(11, 2);
    if (chordPart) {
      if (chordPart.volume !== undefined) mixer.chord.volume = chordPart.volume;
      if (chordPart.pan !== undefined) mixer.chord.pan = chordPart.pan;
      if (chordPart.reverb !== undefined) mixer.chord.reverb = chordPart.reverb;
      if (chordPart.chorus !== undefined) mixer.chord.chorus = chordPart.chorus;
    }
    const chordMsb = chordPart?.bankMsb ?? 104;
    const chordLsb = chordPart?.bankLsb ?? 0;
    const chordPc = chordPart?.programChange ?? 0;
    let selectedChordVoice: YamahaChordPreset = resolveExactChordVoice(chordMsb, chordLsb, chordPc, 'Piano');

    // 5. 動態聲部 (Chord 2, Pad, Phrase 1, Phrase 2)
    const dynamicVoices: Record<string, YamahaChordPreset> = {};
    const dynPartConfigs: Array<{ partId: 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'; sff2: number; sff1: number; defCat: string; defPc: number }> = [
      { partId: 'Chord2', sff2: 12, sff1: 3, defCat: 'Guitar', defPc: 25 },
      { partId: 'Pad', sff2: 13, sff1: 4, defCat: 'Pad', defPc: 49 },
      { partId: 'Phrase1', sff2: 14, sff1: 5, defCat: 'Strings', defPc: 49 },
      { partId: 'Phrase2', sff2: 15, sff1: 6, defCat: 'Pad', defPc: 89 },
    ];

    for (const cfg of dynPartConfigs) {
      const part = pickBestPart(cfg.sff2, cfg.sff1);
      if (part) {
        if (!mixer[cfg.partId]) {
          mixer[cfg.partId] = { volume: 80, pan: 64, reverb: 50, chorus: 30 };
        }
        if (part.volume !== undefined) mixer[cfg.partId].volume = part.volume;
        if (part.pan !== undefined) mixer[cfg.partId].pan = part.pan;
        if (part.reverb !== undefined) mixer[cfg.partId].reverb = part.reverb;
        if (part.chorus !== undefined) mixer[cfg.partId].chorus = part.chorus;

        if (part.programChange !== undefined) {
          const msb = part.bankMsb ?? 0;
          const lsb = part.bankLsb ?? 112;
          const pc = part.programChange;
          dynamicVoices[cfg.partId] = resolveExactChordVoice(msb, lsb, pc, cfg.defCat);
        }
      }
    }

    // 3. 解析各段落並歸納音符
    const sections = new Map<string, SectionStore>();
    const foundDrumNotes = new Set<number>();
    const activeDynamicParts = new Set<'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'>();

    // 標準支援段落清單映射表 (規範化段落名稱)
    const validSectionMap: Record<string, string> = {
      'main a': 'Main A',
      'main b': 'Main B',
      'main c': 'Main C',
      'main d': 'Main D',
      'fill in aa': 'Fill In AA',
      'fill in bb': 'Fill In BB',
      'fill in cc': 'Fill In CC',
      'fill in dd': 'Fill In DD',
      'fill in ba': 'Break',
      'break': 'Break',
      'intro a': 'Intro A',
      'intro b': 'Intro B',
      'intro c': 'Intro C',
      'ending a': 'Ending A',
      'ending b': 'Ending B',
      'ending c': 'Ending C',
    };

    for (const sec of parsed.sections) {
      const rawName = sec.name.trim();
      const lower = rawName.toLowerCase();
      const standardName = validSectionMap[lower];
      if (!standardName) {
        // 略過 SFF2, SInt 等非演奏段落標記
        continue;
      }

      // 計算該段落小節數
      let bars = sec.measureCount;
      if (!bars || bars <= 0) {
        const start = sec.startTick;
        const end = sec.endTick || (start + ticksPerMeasure);
        bars = Math.max(1, Math.round((end - start) / ticksPerMeasure));
      }

      const totalSteps = bars * stepsPerBar;

      // 初始化 Pattern 結構
      const drumPattern = new Map<number, boolean[]>();
      // 預設基礎鼓組音高列
      [36, 38, 42, 46, 49, 51].forEach(note => {
        drumPattern.set(note, new Array(totalSteps).fill(false));
      });

      const bassPattern = new Map<number, number>();
      const chordPattern = new Map<number, Set<number>>();
      const dynamicPatterns: Record<string, Map<number, Set<number>>> = {
        Chord2: new Map(),
        Pad: new Map(),
        Phrase1: new Map(),
        Phrase2: new Map(),
      };

      // 提取落在該段落時間範圍內的 NoteOn 事件
      const secStart = sec.startTick;
      const secEnd = sec.endTick !== undefined ? sec.endTick : secStart + bars * ticksPerMeasure;

      // 表現力對照表初始化
      const drumMeta = new Map<string, RealNoteMeta>();
      const bassMeta = new Map<number, RealNoteMeta>();
      const chordMeta = new Map<string, RealNoteMeta>();
      const dynamicMeta: Record<string, Map<string, RealNoteMeta>> = {
        Chord2: new Map(),
        Pad: new Map(),
        Phrase1: new Map(),
        Phrase2: new Map(),
      };
      const ccEvents: Array<{ channel: number; controller: number; value: number; step: number; relTick: number }> = [];
      const pitchBendEvents: Array<{ channel: number; value: number; step: number; relTick: number }> = [];
      const sectionVoices: Record<number, { msb: number; lsb: number; pc: number; name?: string }> = {};

      // 預設繼承自 parsed.parts 的當前通道音色
      for (const p of parsed.parts) {
        if (p.programChange !== undefined) {
          sectionVoices[p.channel] = {
            msb: p.bankMsb ?? 0,
            lsb: p.bankLsb ?? 0,
            pc: p.programChange,
          };
        }
      }

      // 收集該段落內的連續控制器、滑音事件與段落級音色切換事件 (CC 11, CC 1, CC 64, CC 0, CC 32, Program Change)
      for (const ev of flatEvents) {
        if (ev.absTick >= secStart && ev.absTick < secEnd) {
          const relTick = ev.absTick - secStart;
          const step = Math.min(totalSteps - 1, Math.max(0, Math.floor(relTick / ticksPerStep)));
          if (ev.type === 'controlChange' && ev.channel !== undefined && ev.controller !== undefined && ev.value !== undefined) {
            if ([11, 1, 64, 71, 74].includes(ev.controller)) {
              ccEvents.push({
                channel: ev.channel,
                controller: ev.controller,
                value: ev.value,
                step,
                relTick,
              });
            } else if (ev.controller === 0 || ev.controller === 32) {
              if (!sectionVoices[ev.channel]) {
                sectionVoices[ev.channel] = { msb: 0, lsb: 0, pc: 0 };
              }
              if (ev.controller === 0) sectionVoices[ev.channel].msb = ev.value;
              if (ev.controller === 32) sectionVoices[ev.channel].lsb = ev.value;
            }
          } else if (ev.type === 'programChange' && ev.channel !== undefined && ev.program !== undefined) {
            if (!sectionVoices[ev.channel]) {
              sectionVoices[ev.channel] = { msb: 0, lsb: 0, pc: ev.program };
            } else {
              sectionVoices[ev.channel].pc = ev.program;
            }
          } else if (ev.type === 'pitchBend' && ev.channel !== undefined && ev.value !== undefined) {
            pitchBendEvents.push({
              channel: ev.channel,
              value: ev.value,
              step,
              relTick,
            });
          }
        }
      }

      // 補齊段落音色名稱
      for (const v of Object.values(sectionVoices)) {
        const found = findYamahaVoice(v.msb, v.lsb, v.pc);
        v.name = found ? (found.chineseName ? `${found.name} (${found.chineseName})` : found.name) : `Voice (Bank ${v.msb}-${v.lsb} PC ${v.pc + 1})`;
      }

      // 依據 CASM 路由映射同步聲部音色 (將 Source Channel 音色鏡像給 Destination Part Channel)
      const secNameLower = standardName.toLowerCase();
      const casmSecMap = parsed.casmMappings?.[secNameLower] || parsed.casmMappings?.[sec.name.toLowerCase()];
      if (casmSecMap) {
        for (const [srcStr, dest] of Object.entries(casmSecMap)) {
          const src = parseInt(srcStr, 10);
          if (sectionVoices[src] && !sectionVoices[dest]) {
            sectionVoices[dest] = { ...sectionVoices[src] };
          }
        }
      }

      const secNotes = flatEvents.filter(
        ev => ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.absTick >= secStart && ev.absTick < secEnd
      );

      // SFF2 vs SFF1 獨佔分流判斷：
      // Yamaha 原廠伴奏同時含有 SFF2 (8~15) 與 SFF1 (0~7) 兩套鏡像音軌。
      // 若該段落已具備 SFF2 通道音符，則不可混入 SFF1 通道音符，防止雙重發聲與半音互斥衝突！
      const secChannelNotes = new Set<number>();
      for (const ev of secNotes) {
        if (ev.channel !== undefined) secChannelNotes.add(ev.channel);
      }
      const activeBassCh = secChannelNotes.has(10) ? 10 : (secChannelNotes.has(1) ? 1 : undefined);
      const activeChord1Ch = secChannelNotes.has(11) ? 11 : (secChannelNotes.has(2) ? 2 : undefined);
      const activeChord2Ch = secChannelNotes.has(12) ? 12 : (secChannelNotes.has(3) ? 3 : undefined);
      const activePadCh = secChannelNotes.has(13) ? 13 : (secChannelNotes.has(4) ? 4 : undefined);
      const activePhrase1Ch = secChannelNotes.has(14) ? 14 : (secChannelNotes.has(5) ? 5 : undefined);
      const activePhrase2Ch = secChannelNotes.has(15) ? 15 : (secChannelNotes.has(6) ? 6 : undefined);
      const hasSff2Drums = secChannelNotes.has(9) || secChannelNotes.has(8);

      const msPerTick = (60000 / (bpm * division));

      for (let noteIdx = 0; noteIdx < secNotes.length; noteIdx++) {
        const ev = secNotes[noteIdx];
        const ch = ev.channel ?? 0;

        // 通道獨佔防重疊過濾 (SFF2 優先，避免雙重伴奏疊加)
        if ((ch === 1 || ch === 10) && activeBassCh !== undefined && ch !== activeBassCh) continue;
        if ((ch === 2 || ch === 11) && activeChord1Ch !== undefined && ch !== activeChord1Ch) continue;
        if ((ch === 3 || ch === 12) && activeChord2Ch !== undefined && ch !== activeChord2Ch) continue;
        if ((ch === 4 || ch === 13) && activePadCh !== undefined && ch !== activePadCh) continue;
        if ((ch === 5 || ch === 14) && activePhrase1Ch !== undefined && ch !== activePhrase1Ch) continue;
        if ((ch === 6 || ch === 15) && activePhrase2Ch !== undefined && ch !== activePhrase2Ch) continue;
        if ((ch === 0 || ch === 7) && hasSff2Drums) continue;

        const relTick = ev.absTick - secStart;
        const step = Math.round(relTick / ticksPerStep);
        if (step < 0 || step >= totalSteps) continue;

        const note = ev.noteNumber ?? 60;
        const velocity = Math.max(1, Math.min(127, ev.velocity ?? 100));

        // 計算音符發音真實時值 (尋找對應 NoteOff)
        let durationTicks = Math.round(ticksPerStep * 1.5);
        for (let j = 0; j < flatEvents.length; j++) {
          const nextEv = flatEvents[j];
          if (nextEv.absTick > ev.absTick && nextEv.channel === ev.channel && nextEv.noteNumber === ev.noteNumber) {
            if (nextEv.type === 'noteOff' || (nextEv.type === 'noteOn' && (nextEv.velocity ?? 0) === 0)) {
              durationTicks = Math.max(12, nextEv.absTick - ev.absTick);
              break;
            } else if (nextEv.type === 'noteOn') {
              durationTicks = Math.max(12, nextEv.absTick - ev.absTick);
              break;
            }
          }
        }
        const durationMs = Math.max(30, Math.round(durationTicks * msPerTick));

        // 計算掃弦微時差 (Strumming Micro-timing Offset)
        const nominalTick = step * ticksPerStep;
        const offsetTicks = relTick - nominalTick;
        const offsetMs = offsetTicks > 0 ? Math.min(45, Math.round(offsetTicks * msPerTick)) : 0;

        // 通道分流映射與真實表現力寫入 (優先採用 Yamaha 官方 CASM 路由指派)
        const destPart = casmSecMap ? casmSecMap[ch] : undefined;

        if (destPart === 9 || destPart === 8 || (destPart === undefined && (ch === 9 || ch === 8 || ch === 0))) {
          // 鼓組聲部 (ch=8 為 Rhythm 1 打擊樂, ch=9 為 Rhythm 2 主爵士鼓)
          if (!drumPattern.has(note)) {
            drumPattern.set(note, new Array(totalSteps).fill(false));
          }
          drumPattern.get(note)![step] = true;
          foundDrumNotes.add(note);

          drumMeta.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 10 || (destPart === undefined && (ch === 10 || ch === 1))) {
          // 貝斯聲部
          bassPattern.set(step, note);
          bassMeta.set(step, {
            velocity,
            durationMs,
            durationTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 11 || (destPart === undefined && (ch === 11 || ch === 2))) {
          // 和弦 1 聲部
          if (!chordPattern.has(step)) {
            chordPattern.set(step, new Set());
          }
          chordPattern.get(step)!.add(note);
          chordMeta.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            offsetMs,
            offsetTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 12 || (destPart === undefined && (ch === 12 || ch === 3))) {
          // Chord 2
          this.addDynamicNote(dynamicPatterns.Chord2, step, note);
          activeDynamicParts.add('Chord2');
          dynamicMeta.Chord2.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            offsetMs,
            offsetTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 13 || (destPart === undefined && (ch === 13 || ch === 4))) {
          // Pad
          this.addDynamicNote(dynamicPatterns.Pad, step, note);
          activeDynamicParts.add('Pad');
          dynamicMeta.Pad.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            offsetMs,
            offsetTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 14 || (destPart === undefined && (ch === 14 || ch === 5))) {
          // Phrase 1 (例如 Intro B 的電吉他 Solo)
          this.addDynamicNote(dynamicPatterns.Phrase1, step, note);
          activeDynamicParts.add('Phrase1');
          dynamicMeta.Phrase1.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            offsetMs,
            offsetTicks,
            sourceChannel: ch,
          });
        } else if (destPart === 15 || (destPart === undefined && (ch === 15 || ch === 6))) {
          // Phrase 2
          this.addDynamicNote(dynamicPatterns.Phrase2, step, note);
          activeDynamicParts.add('Phrase2');
          dynamicMeta.Phrase2.set(`${note}_${step}`, {
            velocity,
            durationMs,
            durationTicks,
            offsetMs,
            offsetTicks,
            sourceChannel: ch,
          });
        }
      }

      sections.set(standardName, {
        name: standardName,
        bars,
        drumPattern,
        bassPattern,
        chordPattern,
        dynamicPatterns,
        drumMeta,
        bassMeta,
        chordMeta,
        dynamicMeta,
        ccEvents,
        pitchBendEvents,
        sectionVoices,
      });
    }

    // 收集所有打擊樂器音高 (由低至高排序)
    const activeDrumNotes = Array.from(foundDrumNotes).sort((a, b) => a - b);
    const activeDynamicPartIds = Array.from(activeDynamicParts);

    // ✨ 校正全域 selectedChordVoice：優先自具有和弦音符的 Main 主伴奏段落提取音符來源通道之真實音色
    const mainSectionNames = ['Main A', 'Main B', 'Main C', 'Main D'];
    for (const name of mainSectionNames) {
      const sec = sections.get(name);
      if (sec && sec.chordPattern) {
        let hasNotes = false;
        for (const s of sec.chordPattern.values()) {
          if (s.size > 0) { hasNotes = true; break; }
        }
        if (hasNotes && sec.sectionVoices) {
          // 優先自 chordMeta 取得音符來源通道
          let srcCh: number | undefined = undefined;
          if (sec.chordMeta) {
            for (const m of sec.chordMeta.values()) {
              if (m.sourceChannel !== undefined) {
                srcCh = m.sourceChannel;
                break;
              }
            }
          }
          const chosenCh = (srcCh !== undefined && sec.sectionVoices[srcCh]) ? srcCh : 11;
          const secV = sec.sectionVoices[chosenCh] || sec.sectionVoices[11];
          if (secV) {
            selectedChordVoice = resolveExactChordVoice(secV.msb, secV.lsb, secV.pc, 'Guitar');
            break;
          }
        }
      }
    }

    // 若特定動態聲部在全域未設定 (或僅有預設 Strings fallback pc=49)，自具有音符之 Main 主伴奏段落 (若無則擴展至其它段落) 提取真實音色
    for (const partId of activeDynamicParts) {
      if (!dynamicVoices[partId] || dynamicVoices[partId].pc === 49) {
        let foundVoice = false;
        // 1. 優先在 Main 主伴奏段落尋找
        for (const name of mainSectionNames) {
          const sec = sections.get(name);
          if (sec) {
            const pat = sec.dynamicPatterns?.[partId];
            let hasNotes = false;
            if (pat) {
              for (const s of pat.values()) {
                if (s.size > 0) { hasNotes = true; break; }
              }
            }
            if (hasNotes && sec.sectionVoices) {
              let srcCh: number | undefined = undefined;
              if (sec.dynamicMeta?.[partId]) {
                for (const m of sec.dynamicMeta[partId].values()) {
                  if (m.sourceChannel !== undefined) {
                    srcCh = m.sourceChannel;
                    break;
                  }
                }
              }
              const targetCh = partId === 'Phrase1' ? 14 : (partId === 'Phrase2' ? 15 : (partId === 'Chord2' ? 12 : 13));
              const chosenCh = (srcCh !== undefined && sec.sectionVoices[srcCh]) ? srcCh : targetCh;
              const secV = sec.sectionVoices[chosenCh] || sec.sectionVoices[targetCh];
              if (secV) {
                const defCat = partId === 'Phrase1' ? 'Guitar' : (partId === 'Pad' ? 'Pad' : 'Strings');
                dynamicVoices[partId] = resolveExactChordVoice(secV.msb, secV.lsb, secV.pc, defCat);
                foundVoice = true;
                break;
              }
            }
          }
        }
        // 2. 若 Main 段落無此聲部 (例如 Phrase 1 僅出現在 Intro 或 Ending)，再至其它段落尋找
        if (!foundVoice) {
          for (const sec of sections.values()) {
            const pat = sec.dynamicPatterns?.[partId];
            let hasNotes = false;
            if (pat) {
              for (const s of pat.values()) {
                if (s.size > 0) { hasNotes = true; break; }
              }
            }
            if (hasNotes && sec.sectionVoices) {
              let srcCh: number | undefined = undefined;
              if (sec.dynamicMeta?.[partId]) {
                for (const m of sec.dynamicMeta[partId].values()) {
                  if (m.sourceChannel !== undefined) {
                    srcCh = m.sourceChannel;
                    break;
                  }
                }
              }
              const targetCh = partId === 'Phrase1' ? 14 : (partId === 'Phrase2' ? 15 : (partId === 'Chord2' ? 12 : 13));
              const chosenCh = (srcCh !== undefined && sec.sectionVoices[srcCh]) ? srcCh : targetCh;
              const secV = sec.sectionVoices[chosenCh] || sec.sectionVoices[targetCh];
              if (secV) {
                const defCat = partId === 'Phrase1' ? 'Guitar' : (partId === 'Pad' ? 'Pad' : 'Strings');
                dynamicVoices[partId] = resolveExactChordVoice(secV.msb, secV.lsb, secV.pc, defCat);
                break;
              }
            }
          }
        }
      }
    }

    const summary = `成功載入【${fileName}】：共 ${sections.size} 個段落、BPM ${bpm}、${timeSig.numerator}/${timeSig.denominator} 拍號、動態啟用 ${activeDynamicPartIds.length} 個伴奏聲部。`;

    return {
      fileName,
      bpm,
      timeSignature: timeSig,
      division,
      sections,
      drumKit: selectedDrumKit,
      rhythm1Kit: selectedRhythm1Kit,
      bassVoice: selectedBassVoice,
      chordVoice: selectedChordVoice,
      dynamicVoices,
      mixer,
      rawBytes: buffer,
      activeDrumNotes,
      activeDynamicPartIds,
      summary,
    };
  }

  /**
   * 輔助動態和弦聲部加入音符
   */
  private static addDynamicNote(map: Map<number, Set<number>>, step: number, note: number) {
    if (!map.has(step)) {
      map.set(step, new Set());
    }
    map.get(step)!.add(note);
  }
}
