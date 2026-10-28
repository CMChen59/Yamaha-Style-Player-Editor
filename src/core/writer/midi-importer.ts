import { YamahaPadSynthesizer, type PadTrackConfig } from './pad-synthesizer';
import { YamahaPadModifier } from './pad-modifier';
import { YamahaParser } from '../parser/yamaha-parser';
import { YamahaWriter } from './yamaha-writer';
import type { YamahaFileParsed, MidiTrack, MidiEvent } from '../models/types';

/**
 * 來源 MIDI 單軌分析摘要
 */
export interface MidiSourceTrackSummary {
  trackIndex: number;
  name: string;
  channel: number;
  noteCount: number;
  measureCount: number;
  totalTicks: number;
  programChange?: number;
  bankMsb?: number;
  bankLsb?: number;
  notes: {
    note: number;
    velocity: number;
    startTick: number;
    durationTick: number;
  }[];
}

/**
 * 外部 MIDI 完整剖析結果
 */
export interface MidiSourceAnalysis {
  fileName: string;
  rawBuffer: Uint8Array;
  division: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  totalTicks: number;
  totalMeasures: number;
  tracks: MidiSourceTrackSummary[];
}

/**
 * Pad 1~4 切片分配選項
 */
export interface PadAssignmentOption {
  padIndex: number; // 0, 1, 2, 3 (對應 Pad 1 ~ Pad 4)
  sourceTrackIndex: number | null; // null 或負數表示不指定
  name: string;
  startBar: number; // 1-indexed (例如從第 1 小節開始)
  endBar: number;   // 1-indexed (例如到第 4 小節結束)
  repeat: boolean;
  chordMatch: boolean;
  icon?: string;
  voice?: {
    msb?: number;
    lsb?: number;
    pc?: number;
    volume?: number;
    pan?: number;
    reverb?: number;
    chorus?: number;
  };
}

/**
 * MIDI 匯入與 PAD 合成整體設定
 */
export interface MidiImportOptions {
  projectName: string;
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  targetDivision?: number; // 預設 480 PPQ
  padAssignments: PadAssignmentOption[];
  injectCasm?: boolean; // 預設 true
}

/**
 * 外部標準 MIDI (.mid / .midi) 匯入與切片分配處理引擎
 */
export class MidiImporter {
  /**
   * 剖析外部標準 MIDI 檔案結構與所有音軌細節
   */
  public static analyzeMidi(buffer: Uint8Array, fileName: string = 'imported.mid'): MidiSourceAnalysis {
    const parsed = YamahaParser.parse(buffer, 'STY');
    const division = parsed.division || 480;
    const bpm = parsed.bpm || 120;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };

    const ticksPerBeat = division;
    const beatsPerMeasure = timeSig.numerator * (4 / timeSig.denominator);
    const ticksPerMeasure = Math.max(1, Math.round(ticksPerBeat * beatsPerMeasure));

    let maxGlobalTick = 0;
    const trackSummaries: MidiSourceTrackSummary[] = [];

    // 若為 SMF Format 0 且僅單一音軌，拆分各通道為獨立虛擬音軌方便切片分配
    if (parsed.midiFormat === 0 && parsed.tracks.length === 1) {
      const singleTrack = parsed.tracks[0];
      const channelNotesMap = new Map<number, { note: number; velocity: number; startTick: number; durationTick: number }[]>();
      const channelPcMap = new Map<number, { pc?: number; msb?: number; lsb?: number }>();
      const activeNotes = new Map<string, { tick: number; velocity: number }>();

      let curTick = 0;
      for (const ev of singleTrack.events) {
        curTick += ev.delta;
        const ch = ev.channel ?? 0;

        if (ev.type === 'controlChange') {
          const info = channelPcMap.get(ch) || {};
          if (ev.controller === 0) info.msb = ev.value;
          if (ev.controller === 32) info.lsb = ev.value;
          channelPcMap.set(ch, info);
        } else if (ev.type === 'programChange') {
          const info = channelPcMap.get(ch) || {};
          info.pc = ev.program;
          channelPcMap.set(ch, info);
        } else if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
          activeNotes.set(`${ch}_${ev.noteNumber}`, { tick: curTick, velocity: ev.velocity! });
        } else if (
          (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) &&
          ev.noteNumber !== undefined
        ) {
          const key = `${ch}_${ev.noteNumber}`;
          const start = activeNotes.get(key);
          if (start) {
            const list = channelNotesMap.get(ch) || [];
            list.push({
              note: ev.noteNumber,
              velocity: start.velocity,
              startTick: start.tick,
              durationTick: Math.max(1, curTick - start.tick),
            });
            channelNotesMap.set(ch, list);
            activeNotes.delete(key);
          }
        }
      }

      maxGlobalTick = curTick;

      // 為每個有音符或事件的通道建立軌道摘要
      const channels = Array.from(channelNotesMap.keys()).sort((a, b) => a - b);
      if (channels.length === 0 && channelPcMap.size > 0) {
        channels.push(...Array.from(channelPcMap.keys()));
      }

      for (let idx = 0; idx < channels.length; idx++) {
        const ch = channels[idx];
        const notes = channelNotesMap.get(ch) || [];
        const pcInfo = channelPcMap.get(ch);
        const trkMaxTick = notes.length > 0 ? Math.max(...notes.map(n => n.startTick + n.durationTick)) : curTick;
        const measureCount = Math.max(1, Math.ceil(trkMaxTick / ticksPerMeasure));

        trackSummaries.push({
          trackIndex: idx,
          name: `Channel ${ch + 1}`,
          channel: ch,
          noteCount: notes.length,
          measureCount,
          totalTicks: trkMaxTick,
          programChange: pcInfo?.pc,
          bankMsb: pcInfo?.msb,
          bankLsb: pcInfo?.lsb,
          notes,
        });
      }
    } else {
      // SMF Format 1: 標準多音軌結構
      parsed.tracks.forEach((track, tIdx) => {
        let trackName = track.name?.trim();
        let dominantChannel: number | undefined;
        let bankMsb: number | undefined;
        let bankLsb: number | undefined;
        let programChange: number | undefined;
        let curTick = 0;

        const notes: { note: number; velocity: number; startTick: number; durationTick: number }[] = [];
        const activeNotes = new Map<number, { tick: number; velocity: number }>();
        const channelCounts = new Map<number, number>();

        for (const ev of track.events) {
          curTick += ev.delta;

          if (ev.channel !== undefined) {
            channelCounts.set(ev.channel, (channelCounts.get(ev.channel) || 0) + 1);
          }

          if (ev.type === 'meta' && ev.metaType === 0x03 && ev.text) {
            trackName = ev.text.trim();
          } else if (ev.type === 'controlChange') {
            if (ev.controller === 0) bankMsb = ev.value;
            if (ev.controller === 32) bankLsb = ev.value;
          } else if (ev.type === 'programChange') {
            programChange = ev.program;
          } else if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
            activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
          } else if (
            (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) &&
            ev.noteNumber !== undefined
          ) {
            const start = activeNotes.get(ev.noteNumber);
            if (start) {
              notes.push({
                note: ev.noteNumber,
                velocity: start.velocity,
                startTick: start.tick,
                durationTick: Math.max(1, curTick - start.tick),
              });
              activeNotes.delete(ev.noteNumber);
            }
          }
        }

        // 決定主要通道
        if (channelCounts.size > 0) {
          dominantChannel = Array.from(channelCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
        }

        if (curTick > maxGlobalTick) {
          maxGlobalTick = curTick;
        }

        const trkMaxTick = notes.length > 0 ? Math.max(...notes.map(n => n.startTick + n.durationTick)) : curTick;
        const measureCount = Math.max(1, Math.ceil(trkMaxTick / ticksPerMeasure));

        const finalName = trackName || (notes.length === 0 && tIdx === 0 ? 'Conductor / Tempo Track' : `Track ${tIdx + 1}`);

        trackSummaries.push({
          trackIndex: tIdx,
          name: finalName,
          channel: dominantChannel ?? 0,
          noteCount: notes.length,
          measureCount,
          totalTicks: trkMaxTick,
          programChange,
          bankMsb,
          bankLsb,
          notes,
        });
      });
    }

    const totalMeasures = Math.max(1, Math.ceil(maxGlobalTick / ticksPerMeasure));

    return {
      fileName,
      rawBuffer: buffer,
      division,
      bpm,
      timeSignature: timeSig,
      totalTicks: maxGlobalTick,
      totalMeasures,
      tracks: trackSummaries,
    };
  }

  /**
   * 根據使用者的軌道對應與小節切片設定，將外部 MIDI 合成為全新 Yamaha Multi Pad 專案
   */
  public static convertMidiToPadProject(analysis: MidiSourceAnalysis, options: MidiImportOptions): YamahaFileParsed {
    const projectName = options.projectName.trim() || 'Imported Pad';
    const bpm = options.bpm ?? analysis.bpm ?? 120;
    const timeSig = options.timeSignature ?? analysis.timeSignature ?? { numerator: 4, denominator: 4 };
    const targetDivision = options.targetDivision ?? 480;

    const sourceTicksPerBar = analysis.division * (4 / analysis.timeSignature.denominator) * analysis.timeSignature.numerator;
    const scale = targetDivision / analysis.division;

    // 計算 4 個 Pad 各自需要的小節數與初階參數
    let maxPadBars = 4;
    const padConfigs: PadTrackConfig[] = [];

    for (let i = 0; i < 4; i++) {
      const assign = options.padAssignments.find(a => a.padIndex === i);
      if (assign && assign.sourceTrackIndex !== null && assign.sourceTrackIndex !== undefined && assign.sourceTrackIndex >= 0) {
        const srcTrack = analysis.tracks.find(t => t.trackIndex === assign.sourceTrackIndex);
        const startBar = Math.max(1, assign.startBar || 1);
        const endBar = Math.max(startBar, assign.endBar || 4);
        const barCount = endBar - startBar + 1;
        if (barCount > maxPadBars) maxPadBars = barCount;

        padConfigs.push({
          name: assign.name?.trim() || srcTrack?.name || `Pad ${i + 1}`,
          icon: assign.icon || 'S809',
          repeat: assign.repeat ?? false,
          chordMatch: assign.chordMatch ?? false,
          msb: assign.voice?.msb ?? srcTrack?.bankMsb ?? 0,
          lsb: assign.voice?.lsb ?? srcTrack?.bankLsb ?? 112,
          pc: assign.voice?.pc ?? srcTrack?.programChange ?? (i === 0 ? 0 : i === 1 ? 48 : i === 2 ? 24 : 32),
          volume: assign.voice?.volume ?? 100,
          pan: assign.voice?.pan ?? 64,
          reverb: assign.voice?.reverb ?? 40,
          chorus: assign.voice?.chorus ?? 0,
        });
      } else {
        padConfigs.push({
          name: assign?.name || `Pad ${i + 1}`,
          icon: 'S809',
          repeat: false,
          chordMatch: false,
          msb: 0,
          lsb: 112,
          pc: i === 0 ? 0 : i === 1 ? 48 : i === 2 ? 24 : 32,
          volume: 100,
          pan: 64,
          reverb: 40,
          chorus: 0,
        });
      }
    }

    // 1. 初始化空白 Yamaha Multi Pad 專案骨幹 (包含合法 Conductor Track 0、CASM 區塊等)
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName,
      bpm,
      timeSignature: timeSig,
      division: targetDivision,
      bars: maxPadBars,
      pads: padConfigs,
      injectCasm: options.injectCasm ?? true,
    });

    // 2. 依序注入各 Pad 切片音符
    for (let i = 0; i < 4; i++) {
      const padNum = i + 1;
      const assign = options.padAssignments.find(a => a.padIndex === i);
      if (!assign || assign.sourceTrackIndex === null || assign.sourceTrackIndex === undefined || assign.sourceTrackIndex < 0) {
        continue;
      }

      const srcTrack = analysis.tracks.find(t => t.trackIndex === assign.sourceTrackIndex);
      if (!srcTrack || !srcTrack.notes || srcTrack.notes.length === 0) {
        continue;
      }

      const startBar = Math.max(1, assign.startBar || 1);
      const endBar = Math.max(startBar, assign.endBar || 4);
      const padBars = endBar - startBar + 1;

      const sliceStartTick = (startBar - 1) * sourceTicksPerBar;
      const sliceEndTick = endBar * sourceTicksPerBar;

      // 提取落在此小節區間內的音符
      const notesToImport = srcTrack.notes.filter(
        n => n.startTick >= sliceStartTick && n.startTick < sliceEndTick
      );

      // 按時間先後順序寫入目標 Pad 軌道
      for (const n of notesToImport) {
        const rebasedTick = n.startTick - sliceStartTick;
        const scaledStartTick = Math.max(0, Math.round(rebasedTick * scale));
        const scaledDurTick = Math.max(1, Math.round(n.durationTick * scale));

        YamahaPadModifier.addNoteEvent(project, padNum, {
          note: n.note,
          velocity: n.velocity,
          startTick: scaledStartTick,
          durationTick: scaledDurTick,
        });
      }

      // 設定該 Pad 專屬小節長度
      YamahaPadModifier.setPadBarLength(project, padNum, padBars);

      // 同步 Pad 屬性標籤
      YamahaPadModifier.setPadName(project, padNum, assign.name || srcTrack.name || `Pad ${padNum}`);
      YamahaPadModifier.setPadRepeat(project, padNum, assign.repeat ?? false);
      YamahaPadModifier.setPadChordMatch(project, padNum, assign.chordMatch ?? false);
      if (assign.icon) {
        YamahaPadModifier.setPadIcon(project, padNum, assign.icon);
      }
    }

    return project;
  }

  /**
   * 建立內建標準 4 軌示範 MIDI 二進位檔案 (Demo Groove)
   * 包含：鋼琴和弦、木吉他分解和弦、貝斯律動、打擊樂聲部 (共 8 小節)
   */
  public static createDemoGrooveMidi(): Uint8Array {
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = division * 4; // 4/4 拍
    const totalBars = 8;
    const totalTicks = totalBars * ticksPerBar;

    function buildTrack(trackIndex: number, trackName: string, items: { absTick: number; ev: MidiEvent }[]): MidiTrack {
      items.sort((a, b) => {
        if (a.absTick !== b.absTick) return a.absTick - b.absTick;
        if (a.ev.type === 'noteOff' && b.ev.type === 'noteOn') return -1;
        if (a.ev.type === 'noteOn' && b.ev.type === 'noteOff') return 1;
        return 0;
      });
      let prev = 0;
      const events: MidiEvent[] = items.map(item => {
        const delta = Math.max(0, item.absTick - prev);
        prev = item.absTick;
        item.ev.delta = delta;
        return item.ev;
      });
      const track: MidiTrack = { trackIndex, name: trackName, events, rawChunk: new Uint8Array(0) };
      YamahaPadModifier.rebuildTrackRawChunk(track);
      return track;
    }

    // Track 0: Conductor
    const trk0Items: { absTick: number; ev: MidiEvent }[] = [
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x03, text: 'Demo Groove (4-Track)' } },
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x58, metaData: new Uint8Array([4, 2, 24, 8]) } }, // 4/4
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x51, metaData: new Uint8Array([0x07, 0xa1, 0x20]) } }, // 120 BPM
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x59, metaData: new Uint8Array([0, 0]) } }, // C Maj
      { absTick: totalTicks, ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) } },
    ];
    const trk0 = buildTrack(0, 'Conductor', trk0Items);

    // Track 1: Piano Chords (Ch 0, PC 0 Concert Grand)
    const chords = [
      [60, 64, 67], // C
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [55, 59, 62], // G
      [60, 64, 67], // C
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [55, 59, 62], // G
    ];
    const trk1Items: { absTick: number; ev: MidiEvent }[] = [
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x03, text: 'Piano Chords' } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 0, controller: 0, value: 0 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 0, controller: 32, value: 112 } },
      { absTick: 0, ev: { delta: 0, type: 'programChange', channel: 0, program: 0 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 0, controller: 7, value: 100 } },
    ];
    chords.forEach((chordNotes, barIdx) => {
      const hitTicks = [barIdx * ticksPerBar, barIdx * ticksPerBar + ticksPerBeat * 2];
      hitTicks.forEach(tick => {
        const offTick = tick + Math.round(ticksPerBeat * 1.8);
        chordNotes.forEach(n => {
          trk1Items.push({ absTick: tick, ev: { delta: 0, type: 'noteOn', channel: 0, noteNumber: n, velocity: 88 } });
          trk1Items.push({ absTick: offTick, ev: { delta: 0, type: 'noteOff', channel: 0, noteNumber: n, velocity: 0 } });
        });
      });
    });
    trk1Items.push({ absTick: totalTicks, ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) } });
    const trk1 = buildTrack(1, 'Piano Chords', trk1Items);

    // Track 2: Steel Guitar Arpeggio (Ch 1, PC 24 Acoustic Guitar)
    const trk2Items: { absTick: number; ev: MidiEvent }[] = [
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x03, text: 'Acoustic Guitar Arp' } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 1, controller: 0, value: 0 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 1, controller: 32, value: 112 } },
      { absTick: 0, ev: { delta: 0, type: 'programChange', channel: 1, program: 24 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 1, controller: 7, value: 92 } },
    ];
    const arpSteps = [
      [60, 64, 67, 72, 67, 64, 67, 72],
      [57, 60, 64, 69, 64, 60, 64, 69],
      [53, 57, 60, 65, 60, 57, 60, 65],
      [55, 59, 62, 67, 62, 59, 62, 67],
      [60, 64, 67, 72, 67, 64, 67, 72],
      [57, 60, 64, 69, 64, 60, 64, 69],
      [53, 57, 60, 65, 60, 57, 60, 65],
      [55, 59, 62, 67, 62, 59, 62, 67],
    ];
    arpSteps.forEach((pattern, barIdx) => {
      pattern.forEach((note, stepIdx) => {
        const onTick = barIdx * ticksPerBar + stepIdx * Math.round(ticksPerBeat / 2);
        const offTick = onTick + Math.round(ticksPerBeat * 0.4);
        trk2Items.push({ absTick: onTick, ev: { delta: 0, type: 'noteOn', channel: 1, noteNumber: note, velocity: 78 } });
        trk2Items.push({ absTick: offTick, ev: { delta: 0, type: 'noteOff', channel: 1, noteNumber: note, velocity: 0 } });
      });
    });
    trk2Items.push({ absTick: totalTicks, ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) } });
    const trk2 = buildTrack(2, 'Acoustic Guitar Arp', trk2Items);

    // Track 3: Groovy Bass (Ch 2, PC 32 Acoustic/Fingered Bass)
    const trk3Items: { absTick: number; ev: MidiEvent }[] = [
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x03, text: 'Groove Bass' } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 2, controller: 0, value: 0 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 2, controller: 32, value: 112 } },
      { absTick: 0, ev: { delta: 0, type: 'programChange', channel: 2, program: 32 } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 2, controller: 7, value: 105 } },
    ];
    const bassRoots = [36, 33, 29, 31, 36, 33, 29, 31];
    bassRoots.forEach((root, barIdx) => {
      const beats = [0, 1.5, 2, 3.5];
      beats.forEach(beatOffset => {
        const onTick = barIdx * ticksPerBar + Math.round(beatOffset * ticksPerBeat);
        const offTick = onTick + Math.round(ticksPerBeat * 0.45);
        trk3Items.push({ absTick: onTick, ev: { delta: 0, type: 'noteOn', channel: 2, noteNumber: root, velocity: 95 } });
        trk3Items.push({ absTick: offTick, ev: { delta: 0, type: 'noteOff', channel: 2, noteNumber: root, velocity: 0 } });
      });
    });
    trk3Items.push({ absTick: totalTicks, ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) } });
    const trk3 = buildTrack(3, 'Groove Bass', trk3Items);

    // Track 4: Drum Kit Groove (Ch 9, GM Drums: 36 Kick, 38 Snare, 42 Closed Hi-Hat)
    const trk4Items: { absTick: number; ev: MidiEvent }[] = [
      { absTick: 0, ev: { delta: 0, type: 'meta', metaType: 0x03, text: 'Drum Kit Groove' } },
      { absTick: 0, ev: { delta: 0, type: 'controlChange', channel: 9, controller: 7, value: 100 } },
    ];
    for (let bar = 0; bar < totalBars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        const beatTick = bar * ticksPerBar + beat * ticksPerBeat;

        // 8th-note Hi-Hats
        const hhTicks = [beatTick, beatTick + Math.round(ticksPerBeat * 0.5)];
        hhTicks.forEach(ht => {
          trk4Items.push({ absTick: ht, ev: { delta: 0, type: 'noteOn', channel: 9, noteNumber: 42, velocity: 70 } });
          trk4Items.push({ absTick: ht + Math.round(ticksPerBeat * 0.2), ev: { delta: 0, type: 'noteOff', channel: 9, noteNumber: 42, velocity: 0 } });
        });

        // Kick on 1 & 3, Snare on 2 & 4
        const drumNote = (beat === 0 || beat === 2) ? 36 : 38;
        const vel = (beat === 1 || beat === 3) ? 100 : 90;
        trk4Items.push({ absTick: beatTick, ev: { delta: 0, type: 'noteOn', channel: 9, noteNumber: drumNote, velocity: vel } });
        trk4Items.push({ absTick: beatTick + Math.round(ticksPerBeat * 0.25), ev: { delta: 0, type: 'noteOff', channel: 9, noteNumber: drumNote, velocity: 0 } });
      }
    }
    trk4Items.push({ absTick: totalTicks, ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) } });
    const trk4 = buildTrack(4, 'Drum Kit Groove', trk4Items);

    const demoParsed: YamahaFileParsed = {
      format: 'STY',
      midiFormat: 1,
      division,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      sections: [{ name: 'Main A', startTick: 0, endTick: totalTicks, measureCount: totalBars }],
      tracks: [trk0, trk1, trk2, trk3, trk4],
      parts: [],
      customChunks: [],
      hasCasm: false,
      hasOts: false,
    };

    return YamahaWriter.write(demoParsed);
  }
}
