import type { YamahaFileParsed } from '../models/types';
import { resolveYamahaVoiceWithAlias } from '../data/yamaha-voices';

export interface EffectiveChannelVoice {
  channel: number;
  bar: number;
  tick: number;
  msb: number;
  lsb: number;
  pc: number;
  rawMsb: number;
  rawLsb: number;
  rawPc: number;
  voiceName: string;
  panelCode: string;
  category: string;
  isDrum: boolean;
  volume: number;
  pan: number;
}

export interface MidiProgramChangePoint {
  tick: number;
  bar: number;
  channel: number;
  msb: number;
  lsb: number;
  pc: number;
  voiceName: string;
  category: string;
  panelCode: string;
}

export interface MidiChannelAnalysis {
  channel: number;            // 0~15 (對應 MIDI CH 1 ~ CH 16)
  displayChannel: number;     // 1~16
  hasNotes: boolean;
  noteCount: number;
  notePercentage: number;     // 佔全曲音符百分比 (0~100)
  trackNames: string[];
  msb: number;
  lsb: number;
  pc: number;
  rawMsb: number;
  rawLsb: number;
  rawPc: number;
  panelCode: string;          // 1-based "MSB-LSB-PC"
  voiceName: string;
  category: string;
  isDrum: boolean;
  pitchMin: number | null;
  pitchMax: number | null;
  pitchRangeLabel: string;
  firstBar: number | null;
  lastBar: number | null;
  volume: number;
  pan: number;
  reverb: number;
  chorus: number;
  programChangesCount: number;
  programChangeTimeline?: MidiProgramChangePoint[];
}

export interface MidiTempoPoint {
  tick: number;
  bar: number;
  bpm: number;
}

export interface MidiTimeSignaturePoint {
  tick: number;
  bar: number;
  numerator: number;
  denominator: number;
}

export interface MidiMarkerPoint {
  tick: number;
  bar: number;
  text: string;
}

export interface MidiSongAnalysis {
  fileName: string;
  isStyleFile: boolean;
  isGeneralMidiSong: boolean;
  midiFormat: number;
  trackCount: number;
  division: number;
  initialBpm: number;
  minBpm: number;
  maxBpm: number;
  hasTempoChanges: boolean;
  tempoEvents: MidiTempoPoint[];
  timeSignature: { numerator: number; denominator: number };
  timeSignatureEvents: MidiTimeSignaturePoint[];
  keySignatureLabel: string;
  totalTicks: number;
  ticksPerBar: number;
  totalBars: number;
  durationSeconds: number;
  formattedDuration: string;
  totalNotes: number;
  songMarkers: MidiMarkerPoint[];
  activeChannels: MidiChannelAnalysis[];       // 包含有音符或有設定音色的通道
  channelsWithNotes: MidiChannelAnalysis[];    // 實際有發聲音符 (noteCount > 0) 的通道
  channelsWithNotesCount: number;
  instrumentCategories: string[];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const YAMAHA_STANDARD_SECTION_NAMES = new Set([
  'sff1', 'sff2', 'sint',
  'intro a', 'intro b', 'intro c', 'intro d',
  'main a', 'main b', 'main c', 'main d',
  'fill in aa', 'fill in bb', 'fill in cc', 'fill in dd', 'fill in ba', 'break',
  'ending a', 'ending b', 'ending c', 'ending d',
]);

export function formatMidiNoteName(noteNumber: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(noteNumber)));
  const name = NOTE_NAMES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
}

export function formatDurationMmSs(seconds: number): string {
  const totalSec = Math.max(0, Math.round(seconds));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export class MidiSongAnalyzer {
  /**
   * 判斷已解析的檔案是否為「Yamaha 原廠伴奏檔 (.sty/.prs/.sst)」
   * 若無 CASM 且無 Yamaha 標準伴奏段落標記 (SFF1/SFF2/Main A/Intro A 等)，即視為一般 MIDI 音樂檔 (.mid)
   */
  public static isYamahaStyleFile(parsed: YamahaFileParsed, fileName: string = ''): boolean {
    if (parsed.hasCasm || parsed.hasOts) {
      return true;
    }
    const hasYamahaMarker = parsed.sections.some((s) =>
      YAMAHA_STANDARD_SECTION_NAMES.has(s.name.trim().toLowerCase())
    );
    if (hasYamahaMarker) {
      return true;
    }
    const lowerName = fileName.trim().toLowerCase();
    if (lowerName.endsWith('.sty') || lowerName.endsWith('.prs') || lowerName.endsWith('.sst') || lowerName.endsWith('.bcs')) {
      return parsed.sections.length > 0;
    }
    return false;
  }

  /**
   * 深度剖析 MIDI / STY 檔案結構：小節數、速度變化、拍號、調號、時長、16 通道使用狀況與樂器清單
   */
  public static analyze(parsed: YamahaFileParsed, fileName: string = 'Untitled.mid'): MidiSongAnalysis {
    const isStyleFile = this.isYamahaStyleFile(parsed, fileName);
    const division = parsed.division || 480;
    const num = parsed.timeSignature?.numerator || 4;
    const den = parsed.timeSignature?.denominator || 4;
    const ticksPerBar = Math.max(1, Math.round(division * num * (4 / den)));

    const tempoEvents: MidiTempoPoint[] = [];
    const timeSignatureEvents: MidiTimeSignaturePoint[] = [];
    const songMarkers: MidiMarkerPoint[] = [];
    let metaKeySig: string | null = null;

    // 16 通道統計容器
    interface ChAccum {
      noteCount: number;
      pitchMin: number | null;
      pitchMax: number | null;
      firstTick: number | null;
      lastTick: number | null;
      trackNames: Set<string>;
      msb: number | undefined;
      lsb: number | undefined;
      pc: number | undefined;
      runningMsb: number | undefined;
      runningLsb: number | undefined;
      volume: number | undefined;
      pan: number | undefined;
      reverb: number | undefined;
      chorus: number | undefined;
      programChangesCount: number;
      hasAnyEvent: boolean;
      rawProgramChanges: Array<{ tick: number; bar: number; msb?: number; lsb?: number; pc: number }>;
    }

    const chMap: Map<number, ChAccum> = new Map();
    for (let ch = 0; ch < 16; ch++) {
      const part = parsed.parts.find((p) => p.channel === ch);
      chMap.set(ch, {
        noteCount: 0,
        pitchMin: null,
        pitchMax: null,
        firstTick: null,
        lastTick: null,
        trackNames: new Set<string>(),
        msb: part?.bankMsb,
        lsb: part?.bankLsb,
        pc: part?.programChange,
        runningMsb: part?.bankMsb,
        runningLsb: part?.bankLsb,
        volume: part?.volume,
        pan: part?.pan,
        reverb: part?.reverb,
        chorus: part?.chorus,
        programChangesCount: 0,
        hasAnyEvent: !!part,
        rawProgramChanges: [],
      });
    }

    // 用於推算調性的十二音級統計 (排除鼓組通道)
    const pitchClassHistogram = new Array<number>(12).fill(0);
    let maxNoteTick = 0;
    let maxAnyEventTick = 0;
    let totalNotes = 0;

    for (const trk of parsed.tracks) {
      let curTick = 0;
      const cleanTrkName = trk.name?.replace(/[\x00-\x1F]+/g, '').trim() || '';

      for (const ev of trk.events) {
        curTick += ev.delta;
        if (curTick > maxAnyEventTick) {
          maxAnyEventTick = curTick;
        }

        if (ev.type === 'meta') {
          // Tempo (0x51)
          if (ev.metaType === 0x51 && ev.metaData && ev.metaData.length === 3) {
            const mpq = (ev.metaData[0] << 16) | (ev.metaData[1] << 8) | ev.metaData[2];
            if (mpq > 0) {
              const bpm = Math.round(60000000 / mpq);
              const bar = Math.floor(curTick / ticksPerBar) + 1;
              const prev = tempoEvents[tempoEvents.length - 1];
              if (!prev || prev.bpm !== bpm || prev.tick !== curTick) {
                tempoEvents.push({ tick: curTick, bar, bpm });
              }
            }
          }
          // Time Signature (0x58)
          else if (ev.metaType === 0x58 && ev.metaData && ev.metaData.length >= 2) {
            const tNum = ev.metaData[0];
            const tDen = Math.pow(2, ev.metaData[1]);
            const bar = Math.floor(curTick / ticksPerBar) + 1;
            timeSignatureEvents.push({ tick: curTick, bar, numerator: tNum, denominator: tDen });
          }
          // Key Signature (0x59)
          else if (ev.metaType === 0x59 && ev.metaData && ev.metaData.length >= 2 && !metaKeySig) {
            const sf = ev.metaData[0] > 127 ? ev.metaData[0] - 256 : ev.metaData[0];
            const mi = ev.metaData[1];
            metaKeySig = this.formatKeySignatureMeta(sf, mi);
          }
          // Marker / Cue (0x06 / 0x07)
          else if ((ev.metaType === 0x06 || ev.metaType === 0x07) && ev.text) {
            const txt = ev.text.replace(/[\x00-\x1F]+/g, '').trim();
            if (txt && !['sff1', 'sff2', 'sint'].includes(txt.toLowerCase())) {
              songMarkers.push({
                tick: curTick,
                bar: Math.floor(curTick / ticksPerBar) + 1,
                text: txt,
              });
            }
          }
          continue;
        }

        const ch = ev.channel;
        if (ch === undefined || ch < 0 || ch > 15) continue;
        const acc = chMap.get(ch)!;
        acc.hasAnyEvent = true;
        if (cleanTrkName) {
          acc.trackNames.add(cleanTrkName);
        }

        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          const note = ev.noteNumber ?? 60;
          acc.noteCount++;
          totalNotes++;
          if (acc.pitchMin === null || note < acc.pitchMin) acc.pitchMin = note;
          if (acc.pitchMax === null || note > acc.pitchMax) acc.pitchMax = note;
          if (acc.firstTick === null || curTick < acc.firstTick) acc.firstTick = curTick;
          if (acc.lastTick === null || curTick > acc.lastTick) acc.lastTick = curTick;
          if (curTick > maxNoteTick) maxNoteTick = curTick;

          // 非第 10 通道且非鼓組 MSB 時納入調性統計
          if (ch !== 9 && acc.msb !== 127 && acc.msb !== 126) {
            pitchClassHistogram[note % 12]++;
          }
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
          if (acc.noteCount > 0) {
            if (acc.lastTick === null || curTick > acc.lastTick) acc.lastTick = curTick;
            if (curTick > maxNoteTick) maxNoteTick = curTick;
          }
        } else if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
          if (ev.controller === 0) {
            acc.runningMsb = ev.value;
            if (acc.msb === undefined) acc.msb = ev.value;
          } else if (ev.controller === 32) {
            acc.runningLsb = ev.value;
            if (acc.lsb === undefined) acc.lsb = ev.value;
          } else if (ev.controller === 7 && acc.volume === undefined) acc.volume = ev.value;
          else if (ev.controller === 10 && acc.pan === undefined) acc.pan = ev.value;
          else if (ev.controller === 91 && acc.reverb === undefined) acc.reverb = ev.value;
          else if (ev.controller === 93 && acc.chorus === undefined) acc.chorus = ev.value;
        } else if (ev.type === 'programChange' && (ev.program !== undefined || (ev as any).programChange !== undefined)) {
          const pc = ev.program !== undefined ? ev.program : (ev as any).programChange;
          acc.programChangesCount++;
          if (acc.pc === undefined) {
            acc.pc = pc;
          }
          const bar = Math.floor(curTick / ticksPerBar) + 1;
          acc.rawProgramChanges.push({
            tick: curTick,
            bar,
            msb: acc.runningMsb,
            lsb: acc.runningLsb,
            pc,
          });
        }
      }
    }

    // 速度彙整
    const initialBpm = tempoEvents.length > 0 ? tempoEvents[0].bpm : (parsed.bpm || 120);
    if (tempoEvents.length === 0) {
      tempoEvents.push({ tick: 0, bar: 1, bpm: initialBpm });
    }
    const bpmValues = tempoEvents.map((t) => t.bpm);
    const minBpm = Math.min(...bpmValues);
    const maxBpm = Math.max(...bpmValues);
    const uniqueBpms = new Set(bpmValues);
    const hasTempoChanges = uniqueBpms.size > 1;

    // 總 Tick 與總小節數計算 (以最後一顆音符結束位置為主，對齊完整小節邊界)
    const effectiveEndTick = maxNoteTick > 0 ? maxNoteTick : maxAnyEventTick;
    const totalBars = Math.max(1, Math.ceil(Math.max(1, effectiveEndTick) / ticksPerBar));
    const totalTicks = totalBars * ticksPerBar;

    // 精確計算總秒數 (支援曲中變速分段積分)
    const durationSeconds = this.computeDurationSeconds(totalTicks, division, tempoEvents);
    const formattedDuration = formatDurationMmSs(durationSeconds);

    // 調號判定
    const keySignatureLabel = metaKeySig || this.estimateKeyFromHistogram(pitchClassHistogram);

    // 整理 16 通道樂器與音符統計
    const activeChannels: MidiChannelAnalysis[] = [];
    for (let ch = 0; ch < 16; ch++) {
      const acc = chMap.get(ch)!;
      if (!acc.hasAnyEvent && acc.noteCount === 0) continue;

      const rawMsb = acc.msb ?? (ch === 9 ? 127 : 0);
      const rawLsb = acc.lsb ?? 0;
      const rawPc = acc.pc ?? 0;

      // 在標準 GM MIDI 檔中，CH 10 (ch === 9) 即便未寫入 Bank MSB 127，也必定是鼓組通道
      const effectiveLookupMsb = (ch === 9 && rawMsb === 0) ? 127 : rawMsb;
      const resolved = resolveYamahaVoiceWithAlias(effectiveLookupMsb, rawLsb, rawPc);

      const isDrum =
        ch === 9 ||
        effectiveLookupMsb === 127 ||
        effectiveLookupMsb === 126 ||
        resolved.voice?.category === 'Drums';

      const category = isDrum
        ? 'Drums'
        : (resolved.voice?.category || 'Piano');

      const pitchRangeLabel =
        acc.pitchMin !== null && acc.pitchMax !== null
          ? `${formatMidiNoteName(acc.pitchMin)} ~ ${formatMidiNoteName(acc.pitchMax)}`
          : '無音符';

      const firstBar = acc.firstTick !== null ? Math.floor(acc.firstTick / ticksPerBar) + 1 : null;
      const lastBar = acc.lastTick !== null ? Math.min(totalBars, Math.max(firstBar || 1, Math.ceil(Math.max(1, acc.lastTick) / ticksPerBar))) : null;

      const programChangeTimeline: MidiProgramChangePoint[] = acc.rawProgramChanges.map((rpc) => {
        const rMsb = rpc.msb ?? (ch === 9 ? 127 : 0);
        const rLsb = rpc.lsb ?? 0;
        const effLookupMsb = ch === 9 && rMsb === 0 ? 127 : rMsb;
        const rResolved = resolveYamahaVoiceWithAlias(effLookupMsb, rLsb, rpc.pc);
        const isD = ch === 9 || effLookupMsb === 127 || effLookupMsb === 126 || rResolved.voice?.category === 'Drums';
        const cat = isD ? 'Drums' : (rResolved.voice?.category || 'Piano');
        return {
          tick: rpc.tick,
          bar: rpc.bar,
          channel: ch,
          msb: rResolved.msb,
          lsb: rResolved.lsb,
          pc: rResolved.pc,
          voiceName: rResolved.voiceName,
          category: cat,
          panelCode: rResolved.panelCode,
        };
      });

      activeChannels.push({
        channel: ch,
        displayChannel: ch + 1,
        hasNotes: acc.noteCount > 0,
        noteCount: acc.noteCount,
        notePercentage: totalNotes > 0 ? Math.round((acc.noteCount / totalNotes) * 1000) / 10 : 0,
        trackNames: Array.from(acc.trackNames),
        msb: resolved.msb,
        lsb: resolved.lsb,
        pc: resolved.pc,
        rawMsb,
        rawLsb,
        rawPc,
        panelCode: resolved.panelCode,
        voiceName: resolved.voiceName,
        category,
        isDrum,
        pitchMin: acc.pitchMin,
        pitchMax: acc.pitchMax,
        pitchRangeLabel,
        firstBar,
        lastBar,
        volume: acc.volume ?? 100,
        pan: acc.pan ?? 64,
        reverb: acc.reverb ?? 40,
        chorus: acc.chorus ?? 0,
        programChangesCount: acc.programChangesCount,
        programChangeTimeline,
      });
    }

    const channelsWithNotes = activeChannels.filter((c) => c.hasNotes);
    const instrumentCategories = Array.from(new Set(channelsWithNotes.map((c) => c.category)));

    return {
      fileName,
      isStyleFile,
      isGeneralMidiSong: !isStyleFile,
      midiFormat: parsed.midiFormat,
      trackCount: parsed.tracks.length,
      division,
      initialBpm,
      minBpm,
      maxBpm,
      hasTempoChanges,
      tempoEvents,
      timeSignature: { numerator: num, denominator: den },
      timeSignatureEvents,
      keySignatureLabel,
      totalTicks,
      ticksPerBar,
      totalBars,
      durationSeconds,
      formattedDuration,
      totalNotes,
      songMarkers,
      activeChannels,
      channelsWithNotes,
      channelsWithNotesCount: channelsWithNotes.length,
      instrumentCategories,
    };
  }

  private static computeDurationSeconds(totalTicks: number, division: number, tempoEvents: MidiTempoPoint[]): number {
    if (totalTicks <= 0 || division <= 0) return 0;
    const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
    let totalSec = 0;
    let prevTick = 0;
    let currentBpm = sorted[0]?.bpm || 120;

    for (const pt of sorted) {
      const clampedTick = Math.min(totalTicks, Math.max(prevTick, pt.tick));
      if (clampedTick > prevTick) {
        const deltaTicks = clampedTick - prevTick;
        const ticksPerSec = (currentBpm * division) / 60;
        totalSec += deltaTicks / ticksPerSec;
        prevTick = clampedTick;
      }
      currentBpm = pt.bpm;
      if (prevTick >= totalTicks) break;
    }

    if (prevTick < totalTicks) {
      const deltaTicks = totalTicks - prevTick;
      const ticksPerSec = (currentBpm * division) / 60;
      totalSec += deltaTicks / ticksPerSec;
    }

    return totalSec;
  }

  private static formatKeySignatureMeta(sharpsFlats: number, isMinor: number): string {
    const majorKeys: Record<number, string> = {
      [-7]: 'Cb Major', [-6]: 'Gb Major', [-5]: 'Db Major', [-4]: 'Ab Major',
      [-3]: 'Eb Major', [-2]: 'Bb Major', [-1]: 'F Major', [0]: 'C Major',
      [1]: 'G Major', [2]: 'D Major', [3]: 'A Major', [4]: 'E Major',
      [5]: 'B Major', [6]: 'F# Major', [7]: 'C# Major',
    };
    const minorKeys: Record<number, string> = {
      [-7]: 'Ab Minor', [-6]: 'Eb Minor', [-5]: 'Bb Minor', [-4]: 'F Minor',
      [-3]: 'C Minor', [-2]: 'G Minor', [-1]: 'D Minor', [0]: 'A Minor',
      [1]: 'E Minor', [2]: 'B Minor', [3]: 'F# Minor', [4]: 'C# Minor',
      [5]: 'G# Minor', [6]: 'D# Minor', [7]: 'A# Minor',
    };
    if (isMinor === 1) {
      return `${minorKeys[sharpsFlats] || 'A Minor'} (MIDI 內嵌標記)`;
    }
    return `${majorKeys[sharpsFlats] || 'C Major'} (MIDI 內嵌標記)`;
  }

  private static estimateKeyFromHistogram(hist: number[]): string {
    const total = hist.reduce((s, v) => s + v, 0);
    if (total === 0) return 'C Major (預設)';

    // Krumhansl-Schmuckler 大調與小調權重模板
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    let bestRoot = 0;
    let bestMode: 'Major' | 'Minor' = 'Major';
    let bestScore = -Infinity;

    for (let root = 0; root < 12; root++) {
      let majScore = 0;
      let minScore = 0;
      for (let i = 0; i < 12; i++) {
        const count = hist[(root + i) % 12];
        majScore += count * majorProfile[i];
        minScore += count * minorProfile[i];
      }
      if (majScore > bestScore) {
        bestScore = majScore;
        bestRoot = root;
        bestMode = 'Major';
      }
      if (minScore > bestScore) {
        bestScore = minScore;
        bestRoot = root;
        bestMode = 'Minor';
      }
    }

    return `${NOTE_NAMES[bestRoot]} ${bestMode} (智慧推算)`;
  }

  /**
   * 回溯嗅探指定小節起始點 (startBar) 該通道當下最新生效的原廠音色與混音參數
   * 支援曲中音色切換 (Mid-song Program Change / Bank Select Lookback)
   */
  public static getEffectiveVoiceAtBar(
    parsed: YamahaFileParsed,
    channel: number,
    bar: number
  ): EffectiveChannelVoice {
    const division = parsed.division || 480;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };
    const num = timeSig.numerator || 4;
    const den = timeSig.denominator || 4;
    const ticksPerBar = Math.max(1, Math.round(division * num * (4 / den)));
    const targetTick = Math.max(0, (bar - 1) * ticksPerBar);

    // 收集該通道的所有 CC0, CC32, CC7, CC10, ProgramChange 事件
    const chEvents: Array<{
      tick: number;
      type: string;
      controller?: number;
      value?: number;
      program?: number;
    }> = [];

    for (const track of parsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (ev.channel !== channel) continue;

        if (
          ev.type === 'controlChange' &&
          (ev.controller === 0 || ev.controller === 32 || ev.controller === 7 || ev.controller === 10)
        ) {
          chEvents.push({ tick: curTick, type: 'controlChange', controller: ev.controller, value: ev.value });
        } else if (ev.type === 'programChange') {
          const pc = ev.program !== undefined ? ev.program : (ev as any).programChange;
          if (pc !== undefined) {
            chEvents.push({ tick: curTick, type: 'programChange', program: pc });
          }
        }
      }
    }

    chEvents.sort((a, b) => a.tick - b.tick);

    let currentMsb = channel === 9 ? 127 : 0;
    let currentLsb = 0;
    let currentPc = 0;
    let currentVol = 100;
    let currentPan = 64;
    let hasExplicitPc = false;

    // 優先掃描 targetTick 以前 (含 targetTick 當下設定) 的所有事件
    const priorEvents = chEvents.filter((e) => e.tick <= targetTick);
    for (const ev of priorEvents) {
      if (ev.type === 'controlChange') {
        if (ev.controller === 0 && ev.value !== undefined) currentMsb = ev.value;
        else if (ev.controller === 32 && ev.value !== undefined) currentLsb = ev.value;
        else if (ev.controller === 7 && ev.value !== undefined) currentVol = ev.value;
        else if (ev.controller === 10 && ev.value !== undefined) currentPan = ev.value;
      } else if (ev.type === 'programChange' && ev.program !== undefined) {
        currentPc = ev.program;
        hasExplicitPc = true;
      }
    }

    // 若 targetTick 之前完全未定義 PC，但在該小節開頭緊接著有音色切換指令 (targetTick ~ targetTick + ticksPerBar)
    if (!hasExplicitPc) {
      const nearFutureEvents = chEvents.filter(
        (e) => e.tick > targetTick && e.tick < targetTick + ticksPerBar
      );
      for (const ev of nearFutureEvents) {
        if (ev.type === 'controlChange') {
          if (ev.controller === 0 && ev.value !== undefined) currentMsb = ev.value;
          else if (ev.controller === 32 && ev.value !== undefined) currentLsb = ev.value;
        } else if (ev.type === 'programChange' && ev.program !== undefined) {
          currentPc = ev.program;
          hasExplicitPc = true;
          break;
        }
      }

      // 若全曲後半段有任何 PC，取第一筆
      if (!hasExplicitPc) {
        const firstPc = chEvents.find((e) => e.type === 'programChange');
        if (firstPc && firstPc.program !== undefined) {
          currentPc = firstPc.program;
        }
      }
    }

    const effectiveLookupMsb = channel === 9 && currentMsb === 0 ? 127 : currentMsb;
    const resolved = resolveYamahaVoiceWithAlias(effectiveLookupMsb, currentLsb, currentPc);

    const isDrum =
      channel === 9 ||
      effectiveLookupMsb === 127 ||
      effectiveLookupMsb === 126 ||
      resolved.voice?.category === 'Drums';

    const category = isDrum ? 'Drums' : (resolved.voice?.category || 'Piano');

    return {
      channel,
      bar,
      tick: targetTick,
      msb: resolved.msb,
      lsb: resolved.lsb,
      pc: resolved.pc,
      rawMsb: currentMsb,
      rawLsb: currentLsb,
      rawPc: currentPc,
      voiceName: resolved.voiceName,
      panelCode: resolved.panelCode,
      category,
      isDrum,
      volume: currentVol,
      pan: currentPan,
    };
  }
}
