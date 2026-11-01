import type { YamahaFileParsed, YamahaSection, MidiEvent, CasmChannelEntry } from '../core/models/types';
import { getSharedAudioContext } from '../creator/shared-audio-context';
import { drumSynth } from '../creator/drum-synth';
import { bassSynth } from '../creator/bass-synth';
import { ChordSynth } from '../creator/chord-synth';
import { midiManager } from '../core/audio/midi-manager';
import { findYamahaVoice, type YamahaVoice } from '../core/data/yamaha-voices';
import { ChordTransposer, type ChordDefinition } from '../core/writer/chord-transposer';

export function formatYamahaPan(pan: number): string {
  if (pan === 64) return 'C';
  if (pan < 64) return `L${64 - pan}`;
  return `R${pan - 64}`;
}

export interface PlaybackCCEvent {
  relTick: number;          // 相對於段落起始的 Tick
  channel: number;          // 目的 MIDI Channel (8~15)
  sourceChannel?: number;   // 原始 MIDI 來源 Channel (0~15)
  controller: number;       // 控制器編號 (e.g. 11: Expression, 1: Mod, 64: Sustain, etc.)
  value: number;            // 控制器數值 (0~127)
}

export interface PlaybackNoteEvent {
  relTick: number;          // 相對於段落起始的 Tick
  channel: number;          // 目的 MIDI Channel (標準 8~15，對應 Yamaha 8 大伴奏聲部)
  sourceChannel: number;    // 原始 MIDI 檔案中的來源 Channel (0~15)
  noteNumber: number;       // 音高 (0~127)
  velocity: number;         // 力度 (1~127)
  durationTicks: number;    // 發聲長度 (Ticks)
  durationMs: number;       // 發聲長度 (毫秒)
}

export interface PartVoiceInfo {
  channel: number;          // 8~15
  msb: number;
  lsb: number;
  pc: number;
  voiceName: string;
  category: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSectionName: string | null;
  bpm: number;
  isLooping: boolean;
  outputMode: 'webaudio' | 'midi';
  currentBar: number;
  currentBeat: number;
  currentTick: number;
}

export type TickCallback = (bar: number, beat: number, tick: number, totalBars: number) => void;
export type ChannelActivityCallback = (activeChannels: Set<number>) => void;

export class StyPlaybackEngine {
  private parsed: YamahaFileParsed | null = null;
  private currentSection: YamahaSection | null = null;
  private rawSectionEvents: PlaybackNoteEvent[] = [];
  private rawSectionCCEvents: PlaybackCCEvent[] = [];
  private sectionEvents: PlaybackNoteEvent[] = [];
  private sectionCCEvents: PlaybackCCEvent[] = [];
  private totalSectionTicks: number = 0;
  private totalBars: number = 1;

  private isPlaying: boolean = false;
  private isLooping: boolean = true;
  private bpm: number = 120;
  private outputMode: 'webaudio' | 'midi' = 'webaudio';

  // 播放排程時鐘
  private timerId: any = null;
  private rafId: number | null = null;
  private playbackStartAudioTime: number = 0;
  private lastScheduledTick: number = 0;

  // 聲部專屬合成器 (Channel 11~15 各自獨立 ChordSynth 實例，避免音色互相覆蓋)
  private chordSynths: Map<number, ChordSynth> = new Map();
  private partVoices: Map<number, PartVoiceInfo> = new Map();
  private customVoiceOverrides: Map<number, YamahaVoice> = new Map();
  private auditionChord: ChordDefinition = ChordTransposer.buildChord('C', 'maj');
  private onChordChangeCallback: ((chord: ChordDefinition) => void) | null = null;

  // 智慧多小節和弦進行輪播 (Chord Progression Auto-Advance)
  private chordAutoAdvance: boolean = false;
  private chordProgression: ChordDefinition[] = ChordTransposer.getProgressionPreset('pop-1564');
  private currentProgressionPresetId: string = 'pop-1564';
  private selectedProgressionBarIndex: number = 0;
  private activeProgressionBar: number = -1;
  private onProgressionBarChangeCallback: ((barIndex: number, chord: ChordDefinition) => void) | null = null;
  private onProgressionUpdateCallback: ((progression: ChordDefinition[], presetId: string, selectedBar: number) => void) | null = null;

  // 聲部靜音與獨奏 (Channel 8~15)
  private mutedChannels: Set<number> = new Set();
  private soloChannel: number | null = null;
  private channelVolumes: Map<number, number> = new Map(); // 0~127
  private channelPans: Map<number, number> = new Map(); // 0~127, 預設 64 (Center)
  private channelReverbs: Map<number, number> = new Map(); // 0~127
  private channelChoruses: Map<number, number> = new Map(); // 0~127
  private masterVolumePercent: number = 100; // 全域總音量 0% ~ 150% (預設 100%)

  // 回呼
  private onTickCallback: TickCallback | null = null;
  private onActivityCallback: ChannelActivityCallback | null = null;
  private activeChannelsInWindow: Set<number> = new Set();

  constructor() {
    // 預設全聲部音量為 100，並為每個和弦/樂句聲部建立專屬合成器
    for (let c = 8; c <= 15; c++) {
      this.channelVolumes.set(c, 100);
      this.channelPans.set(c, 64);
      this.channelReverbs.set(c, 40);
      this.channelChoruses.set(c, 0);
      // 為所有伴奏聲部建立專屬合成器 (支援 Ch 8 Rhy1 旋律性樂器如 Pizzicato Strings)
      this.chordSynths.set(c, new ChordSynth());
    }
  }

  /**
   * 判定特定聲部是否為真實鼓組/打擊樂 (True Drum Kit)
   * Yamaha STY 中 Rhythm 1 (Ch 8) 經常使用非鼓組的旋律樂器 (如 Pizzicato Strings, 木琴, 琶音器等)
   */
  public isChannelDrum(channel: number): boolean {
    const overrideVoice = this.customVoiceOverrides.get(channel);
    if (overrideVoice) {
      return overrideVoice.category === 'Drums' || overrideVoice.msb === 127;
    }
    const pv = this.partVoices.get(channel);
    if (pv) {
      return pv.category === 'Drums' || pv.msb === 127;
    }
    const part = this.getPartInfo(channel);
    if (part) {
      return part.category === 'Drums' || part.bankMsb === 127;
    }
    // 預設兜底：只有 Channel 9 (Rh2, 標準打擊樂通道) 預設為鼓
    return channel === 9;
  }

  public getPartInfo(c: number): any {
    if (!this.parsed) return undefined;
    let part = this.parsed.parts.find(p => p.channel === c);
    if (!part) {
      const sff1FallbackMap: Record<number, number> = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 5, 15: 6, 8: 8, 9: 9 };
      const fb = sff1FallbackMap[c];
      if (fb !== undefined && fb !== c) {
        part = this.parsed.parts.find(p => p.channel === fb);
      }
    }
    return part;
  }

  public loadParsed(parsed: YamahaFileParsed) {
    this.stop();
    this.resetAuditionChord();
    this.customVoiceOverrides.clear();
    this.parsed = parsed;
    this.bpm = parsed.bpm || 120;
    this.currentSection = null;
    this.sectionEvents = [];
    this.sectionCCEvents = [];
    this.partVoices.clear();

    // 載入原廠伴奏各聲部混音音量 (CC 7) 與效果器預設值
    for (let c = 8; c <= 15; c++) {
      const part = this.getPartInfo(c);
      const vol = part?.volume !== undefined ? part.volume : 100;
      this.channelVolumes.set(c, vol);
      const synth = this.chordSynths.get(c);
      if (synth) synth.setVolume(vol);
      if (c === 10) bassSynth.setVolume(vol);
      if (c === 8 || c === 9) drumSynth.setVolume(vol);
    }
  }

  public getSections(): YamahaSection[] {
    if (!this.parsed) return [];
    return this.parsed.sections.filter(s => {
      const name = s.name.toLowerCase();
      return !name.startsWith('sff') && !name.startsWith('sint') && !name.startsWith('rp') && !name.startsWith('cm');
    });
  }

  public getParsed(): YamahaFileParsed | null {
    return this.parsed;
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setBpm(newBpm: number) {
    const clamped = Math.max(30, Math.min(300, Math.round(newBpm)));
    if (this.bpm === clamped) return;

    if (this.isPlaying) {
      const ctx = getSharedAudioContext();
      const now = ctx ? ctx.currentTime : 0;
      const division = this.parsed?.division || 480;
      const currentTick = this.lastScheduledTick;

      this.bpm = clamped;
      const newTicksPerSec = (this.bpm * division) / 60;
      this.playbackStartAudioTime = now - (currentTick / newTicksPerSec);
    } else {
      this.bpm = clamped;
    }
  }

  public setLoop(loop: boolean) {
    this.isLooping = loop;
  }

  public getLoop(): boolean {
    return this.isLooping;
  }

  public setOutputMode(mode: 'webaudio' | 'midi') {
    this.outputMode = mode;
    if (mode === 'webaudio' && this.isPlaying) {
      midiManager.panicAllChannels();
    } else if (mode === 'midi' && this.isPlaying) {
      // 立即初始化琴端音色、音量、表情與控制器
      for (const [ch, voice] of this.partVoices.entries()) {
        midiManager.sendVoiceChange(ch, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
        const vol = this.getEffectiveChannelVolume(ch);
        midiManager.sendControlChange(ch, 7, vol);
        midiManager.sendControlChange(ch, 11, this.getInitialExpression(ch));
        const part = this.getPartInfo(ch);
        if (part?.pan !== undefined) midiManager.sendControlChange(ch, 10, part.pan);
        if (part?.reverb !== undefined) midiManager.sendControlChange(ch, 91, part.reverb);
        if (part?.chorus !== undefined) midiManager.sendControlChange(ch, 93, part.chorus);
      }
    }
  }

  public getOutputMode(): 'webaudio' | 'midi' {
    return this.outputMode;
  }

  public setOnTick(cb: TickCallback) {
    this.onTickCallback = cb;
  }

  public setOnActivity(cb: ChannelActivityCallback) {
    this.onActivityCallback = cb;
  }

  public setChannelMute(channel: number, mute: boolean) {
    if (mute) {
      this.mutedChannels.add(channel);
    } else {
      this.mutedChannels.delete(channel);
    }

    if (this.outputMode === 'midi') {
      midiManager.sendControlChange(channel, 7, mute ? 0 : this.getEffectiveChannelVolume(channel));
    }
  }

  public isChannelMuted(channel: number): boolean {
    if (this.soloChannel !== null) {
      return this.soloChannel !== channel;
    }
    return this.mutedChannels.has(channel);
  }

  public setChannelSolo(channel: number | null) {
    this.soloChannel = channel;
    if (this.outputMode === 'midi') {
      for (let ch = 8; ch <= 15; ch++) {
        const effectiveMute = this.isChannelMuted(ch);
        midiManager.sendControlChange(ch, 7, effectiveMute ? 0 : this.getEffectiveChannelVolume(ch));
      }
    }
  }

  public getChannelSolo(): number | null {
    return this.soloChannel;
  }

  public getMasterVolume(): number {
    return this.masterVolumePercent;
  }

  public setMasterVolume(percent: number) {
    this.masterVolumePercent = Math.max(0, Math.min(150, Math.round(percent)));
    if (this.outputMode === 'midi') {
      for (let ch = 8; ch <= 15; ch++) {
        const isMuted = this.isChannelMuted(ch);
        midiManager.sendControlChange(ch, 7, isMuted ? 0 : this.getEffectiveChannelVolume(ch));
      }
    } else {
      for (let ch = 8; ch <= 15; ch++) {
        const effVol = this.getEffectiveChannelVolume(ch);
        const synth = this.chordSynths.get(ch);
        if (synth) synth.setVolume(effVol);
        if (ch === 10) bassSynth.setVolume(effVol);
        if (ch === 8 || ch === 9) drumSynth.setVolume(effVol);
      }
    }
  }

  public getEffectiveChannelVolume(channel: number): number {
    const baseVol = this.channelVolumes.get(channel) ?? 100;
    return Math.max(0, Math.min(127, Math.round(baseVol * (this.masterVolumePercent / 100))));
  }

  public setChannelVolume(channel: number, vol: number) {
    const clamped = Math.max(0, Math.min(127, Math.round(vol)));
    this.channelVolumes.set(channel, clamped);
    const effVol = this.getEffectiveChannelVolume(channel);
    const synth = this.chordSynths.get(channel);
    if (synth) synth.setVolume(effVol);
    if (channel === 10) bassSynth.setVolume(effVol);
    if (channel === 8 || channel === 9) drumSynth.setVolume(effVol);

    if (this.outputMode === 'midi') {
      if (!this.isChannelMuted(channel)) {
        midiManager.sendControlChange(channel, 7, effVol);
      }
    }
  }

  public getChannelVolume(channel: number): number {
    return this.channelVolumes.get(channel) ?? 100;
  }

  public getChannelPan(channel: number): number {
    return this.channelPans.get(channel) ?? 64;
  }

  public setChannelPan(channel: number, pan: number) {
    const clamped = Math.max(0, Math.min(127, Math.round(pan)));
    this.channelPans.set(channel, clamped);
    const synth = this.chordSynths.get(channel);
    if (synth) synth.setPan(clamped);
    if (channel === 10) bassSynth.setPan(clamped);
    if (channel === 8 || channel === 9) drumSynth.setPan(clamped);

    if (this.outputMode === 'midi') {
      midiManager.sendControlChange(channel, 10, clamped);
    }
  }

  public getChannelReverb(channel: number): number {
    return this.channelReverbs.get(channel) ?? 40;
  }

  public setChannelReverb(channel: number, rev: number) {
    const clamped = Math.max(0, Math.min(127, Math.round(rev)));
    this.channelReverbs.set(channel, clamped);
    const synth = this.chordSynths.get(channel);
    if (synth) synth.setReverb(clamped);
    if (channel === 10) bassSynth.setReverb(clamped);
    if (channel === 8 || channel === 9) drumSynth.setReverb(clamped);
    if (this.outputMode === 'midi') {
      midiManager.sendControlChange(channel, 91, clamped);
    }
  }

  public getChannelChorus(channel: number): number {
    return this.channelChoruses.get(channel) ?? 0;
  }

  public setChannelChorus(channel: number, cho: number) {
    const clamped = Math.max(0, Math.min(127, Math.round(cho)));
    this.channelChoruses.set(channel, clamped);
    const synth = this.chordSynths.get(channel);
    if (synth) synth.setChorus(clamped);
    if (channel === 10) bassSynth.setChorus(clamped);
    if (channel === 8 || channel === 9) drumSynth.setChorus(clamped);
    if (this.outputMode === 'midi') {
      midiManager.sendControlChange(channel, 93, clamped);
    }
  }

  /**
   * 即時套用單一控制器數值 (支援 WebAudio 合成器與 Web MIDI 實體琴即時聽覺反饋)
   */
  public applyLiveControlChange(channel: number, controller: number, value: number): void {
    const clamped = Math.max(0, Math.min(127, Math.round(value)));
    if (controller === 7) {
      this.setChannelVolume(channel, clamped);
    } else if (controller === 10) {
      this.setChannelPan(channel, clamped);
    } else if (controller === 91) {
      this.setChannelReverb(channel, clamped);
    } else if (controller === 93) {
      this.setChannelChorus(channel, clamped);
    } else {
      if (this.outputMode === 'midi') {
        midiManager.sendControlChange(channel, controller, clamped);
      } else {
        const synth = this.chordSynths.get(channel);
        if (synth && controller === 11) {
          synth.setExpression(clamped);
        }
      }
    }
  }

  public getPartVoices(): Map<number, PartVoiceInfo> {
    return this.partVoices;
  }

  /**
   * 選擇段落並萃取原始音符事件流 (完整支援 CASM 路由與 Per-Part SFF2 仲裁)
   */
  public selectSection(sectionName: string): boolean {
    if (!this.parsed) return false;
    const target = this.parsed.sections.find(s => {
      const sName = s.name.toLowerCase();
      const qName = sectionName.toLowerCase();
      return sName === qName ||
        (qName === 'break' && sName === 'fill in ba') ||
        (qName === 'fill in ba' && sName === 'break');
    });
    if (!target) return false;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();

    this.currentSection = target;
    const division = this.parsed.division || 480;
    const num = this.parsed.timeSignature.numerator || 4;
    const den = this.parsed.timeSignature.denominator || 4;
    const ticksPerBar = division * num * (4 / den);

    const startTick = target.startTick;
    const endTick = target.endTick ?? (startTick + ticksPerBar);
    this.totalSectionTicks = Math.max(ticksPerBar, endTick - startTick);
    this.totalBars = target.measureCount ?? Math.max(1, Math.round(this.totalSectionTicks / ticksPerBar));

    // 1. 取得該段落專屬 CASM 映射表 (將 Source Channel 映射至 Destination Channel)
    const secNameLower = target.name.toLowerCase();
    const casmSecMap = this.parsed.casmMappings?.[secNameLower]
      || this.parsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];

    // 2. 收集音軌展平事件 (含全域與段落內的 CC 0, CC 32, Program Change)
    interface FlatEvent {
      absTick: number;
      delta: number;
      ev: MidiEvent;
    }
    const flatEvents: FlatEvent[] = [];
    for (const trk of this.parsed.tracks) {
      let cur = 0;
      for (const ev of trk.events) {
        cur += ev.delta;
        flatEvents.push({ absTick: cur, delta: ev.delta, ev });
      }
    }
    flatEvents.sort((a, b) => a.absTick - b.absTick);

    // 收集通道音色 (MSB, LSB, PC)
    const rawVoices: Record<number, { msb: number; lsb: number; pc: number }> = {};
    for (const p of this.parsed.parts) {
      if (p.programChange !== undefined) {
        rawVoices[p.channel] = {
          msb: p.bankMsb ?? 0,
          lsb: p.bankLsb ?? 0,
          pc: p.programChange,
        };
      }
    }

    for (const item of flatEvents) {
      if (item.absTick >= startTick && item.absTick < endTick) {
        const ev = item.ev;
        const ch = ev.channel;
        if (ch !== undefined) {
          if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
            if (ev.controller === 0 || ev.controller === 32) {
              if (!rawVoices[ch]) rawVoices[ch] = { msb: 0, lsb: 0, pc: 0 };
              if (ev.controller === 0) rawVoices[ch].msb = ev.value;
              if (ev.controller === 32) rawVoices[ch].lsb = ev.value;
            }
          } else if (ev.type === 'programChange' && ev.program !== undefined) {
            if (!rawVoices[ch]) rawVoices[ch] = { msb: 0, lsb: 0, pc: ev.program };
            else rawVoices[ch].pc = ev.program;
          }
        }
      }
    }

    // 3. 通道分流映射函數：將原始來源通道 (0~15) 映射至標準 Yamaha 伴奏聲部 (8~15)
    const resolveDestChannel = (srcCh: number): number => {
      if (casmSecMap && casmSecMap[srcCh] !== undefined) {
        return casmSecMap[srcCh];
      }
      if (srcCh >= 8 && srcCh <= 15) return srcCh;
      // SFF1 傳統通道預設映射
      switch (srcCh) {
        case 0: return 8;  // Rhythm 1 (Sub)
        case 1: return 10; // Bass
        case 2: return 11; // Chord 1
        case 3: return 12; // Chord 2
        case 4: return 13; // Pad
        case 5: return 14; // Phrase 1
        case 6: return 15; // Phrase 2
        case 7: return 8;  // Extra Rhythm
        default: return srcCh;
      }
    };

    // 4. 偵測段落內各目標聲部 (8~15) 是否同時具有原生 SFF2 軌道 (8~15)
    // 進行 Per-Part 精準仲裁：若目標聲部已經有原生 SFF2，則排除 SFF1 (0~7) 鏡像音軌，避免半音重複！
    const notesInSec = flatEvents.filter(
      item => item.absTick >= startTick && item.absTick < endTick &&
      (item.ev.type === 'noteOn' || item.ev.type === 'noteOff')
    );

    const destPartsWithSff2 = new Set<number>();
    for (const item of notesInSec) {
      const srcCh = item.ev.channel ?? 0;
      if (srcCh >= 8 && srcCh <= 15) {
        const dest = resolveDestChannel(srcCh);
        destPartsWithSff2.add(dest);
      }
    }

    // 5. 組合 NoteOn 與其長度
    const rawNoteEvents: PlaybackNoteEvent[] = [];
    const noteOnMap: Map<string, { absTick: number; ev: MidiEvent; destCh: number; srcCh: number }> = new Map();

    for (const item of notesInSec) {
      const { absTick, ev } = item;
      const srcCh = ev.channel ?? 0;
      const destCh = resolveDestChannel(srcCh);

      // 若檔案無 CASM 且該目標聲部 (destCh) 已經有原生的 8~15 音符，且當前音符來自 0~7 鏡像，則跳過以防雙重發聲；若有 CASM 則交由 CASM 條目仲裁
      if (!this.parsed?.hasCasm && srcCh < 8 && destPartsWithSff2.has(destCh)) {
        continue;
      }

      const note = ev.noteNumber ?? 0;
      const key = `${srcCh}_${destCh}_${note}`;

      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        if (noteOnMap.has(key)) {
          const prev = noteOnMap.get(key)!;
          const durTicks = Math.max(24, absTick - prev.absTick);
          rawNoteEvents.push({
            relTick: prev.absTick - startTick,
            channel: prev.destCh,
            sourceChannel: prev.srcCh,
            noteNumber: note,
            velocity: prev.ev.velocity ?? 100,
            durationTicks: durTicks,
            durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
          });
        }
        noteOnMap.set(key, { absTick, ev, destCh, srcCh });
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
        if (noteOnMap.has(key)) {
          const prev = noteOnMap.get(key)!;
          const durTicks = Math.max(24, absTick - prev.absTick);
          rawNoteEvents.push({
            relTick: prev.absTick - startTick,
            channel: prev.destCh,
            sourceChannel: prev.srcCh,
            noteNumber: note,
            velocity: prev.ev.velocity ?? 100,
            durationTicks: durTicks,
            durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
          });
          noteOnMap.delete(key);
        }
      }
    }

    // 處理尚未 NoteOff 的剩餘音符
    noteOnMap.forEach((prev) => {
      const note = prev.ev.noteNumber ?? 0;
      const durTicks = Math.min(ticksPerBar, Math.max(48, endTick - prev.absTick));
      rawNoteEvents.push({
        relTick: prev.absTick - startTick,
        channel: prev.destCh,
        sourceChannel: prev.srcCh,
        noteNumber: note,
        velocity: prev.ev.velocity ?? 100,
        durationTicks: durTicks,
        durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
      });
    });

    rawNoteEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionEvents = rawNoteEvents;
    this.sectionEvents = this.filterActiveEventsForChord(rawNoteEvents, this.auditionChord);

    // 組合 CC 控制器事件流 (含 CC 11 表情、CC 1 顫音、CC 64 延音踏板、CC 10 相位、CC 91 殘響、CC 93 合唱)
    const rawCCEvents: PlaybackCCEvent[] = [];
    for (const item of flatEvents) {
      if (item.absTick >= startTick && item.absTick < endTick) {
        const ev = item.ev;
        if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
          const srcCh = ev.channel ?? 0;
          const destCh = resolveDestChannel(srcCh);

          if (destCh < 8 || destCh > 15) continue;
          if (!this.parsed?.hasCasm && srcCh < 8 && destPartsWithSff2.has(destCh)) continue;
          if (ev.controller === 0 || ev.controller === 32) continue; // 音色庫切換由 setupPartVoices 處理

          rawCCEvents.push({
            relTick: item.absTick - startTick,
            channel: destCh,
            sourceChannel: srcCh,
            controller: ev.controller,
            value: ev.value,
          });
        }
      }
    }
    rawCCEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionCCEvents = rawCCEvents;
    this.sectionCCEvents = this.filterActiveCCForChord(rawCCEvents, this.auditionChord);

    // 6. 依段落 CASM 路由更新聲部音量與音色
    this.setupSectionMixing(casmSecMap);
    this.setupPartVoices(rawVoices, casmSecMap);

    if (wasPlaying) this.play();
    return true;
  }

  public getSectionCCEvents(): PlaybackCCEvent[] {
    return this.sectionCCEvents;
  }

  public getChannelCCEvents(channel: number, controller?: number): PlaybackCCEvent[] {
    return this.sectionCCEvents.filter(
      (e) => e.channel === channel && (controller === undefined || e.controller === controller)
    );
  }

  public setChannelCCEvents(channel: number, controller: number, newEvents: PlaybackCCEvent[]): void {
    const kept = this.sectionCCEvents.filter(
      (e) => !(e.channel === channel && e.controller === controller)
    );
    this.sectionCCEvents = [...kept, ...newEvents].sort((a, b) => a.relTick - b.relTick);
  }

  public getInitialExpression(channel: number): number {
    const firstInSec = this.sectionCCEvents.find(e => e.channel === channel && e.controller === 11);
    if (firstInSec && firstInSec.relTick === 0) {
      return firstInSec.value;
    }
    if (firstInSec) {
      return firstInSec.value;
    }
    if (this.parsed && this.currentSection) {
      const startTick = this.currentSection.startTick;
      let lastVal: number | undefined;
      for (const trk of this.parsed.tracks) {
        let t = 0;
        for (const ev of trk.events) {
          t += ev.delta;
          if (t <= startTick && ev.type === 'controlChange' && ev.controller === 11) {
            const srcCh = ev.channel ?? 0;
            const casmSecMap = this.parsed.casmMappings?.[this.currentSection.name.toLowerCase()];
            const destCh = (casmSecMap && casmSecMap[srcCh] !== undefined)
              ? casmSecMap[srcCh]
              : (srcCh >= 8 && srcCh <= 15 ? srcCh : this.resolveSff1Fallback(srcCh));
            if (destCh === channel) {
              lastVal = ev.value;
            }
          }
        }
      }
      if (lastVal !== undefined) return lastVal;
    }
    return 127;
  }

  private resolveSff1Fallback(srcCh: number): number {
    switch (srcCh) {
      case 0: return 8;
      case 1: return 10;
      case 2: return 11;
      case 3: return 12;
      case 4: return 13;
      case 5: return 14;
      case 6: return 15;
      case 7: return 8;
      default: return srcCh;
    }
  }

  /**
   * 取得指定目的聲部 (8~15) 在當前段落與指定和弦下的有效來源 MIDI 通道 (Active Source Channel)
   * 依據 Yamaha CASM Ctb2/CTAB 多軌和弦仲裁規範 (Multi-Track Chord Dynamic Arbitration)
   *
   * @param destCh 目的聲部通道 (8~15)
   * @param chord 目標和弦定義 (預設為當前試聽和弦 this.auditionChord)
   * @returns 有效來源通道 (0~15)，若該聲部在該和弦類型下應被靜音 (例如 7th 專屬音軌在 Major 和弦下) 則回傳 undefined
   */
  public getActiveSourceChannel(destCh: number, chord: ChordDefinition = this.auditionChord): number | undefined {
    if (!this.parsed) return destCh;

    const secKey = this.currentSection?.name?.toLowerCase();
    const entries = (secKey && this.parsed.casmEntries?.[secKey]) ||
                    this.parsed.casmEntries?.['*'];

    // 1. 若無 CASM 聲部條目表，退回查核基本 casmMappings 或 1:1 映射
    if (!entries || entries.length === 0) {
      const casmSecMap = (secKey && this.parsed.casmMappings?.[secKey]) ||
                         this.parsed.casmMappings?.['*'];
      if (casmSecMap) {
        for (const [s, d] of Object.entries(casmSecMap)) {
          if (d === destCh) return parseInt(s, 10);
        }
      }
      return destCh;
    }

    // 2. 篩選所有路由至 destCh 的 CASM 條目
    const destEntries = entries.filter(e => e.destCh === destCh);
    if (destEntries.length === 0) {
      return destCh;
    }

    const chordType = chord.type;
    const isMinor = chordType === 'm' || chordType === 'm7';
    const is7th = chordType === '7';
    const isDim = chordType === 'dim';

    // 3. 若只有單一來源條目
    if (destEntries.length === 1) {
      const single = destEntries[0];
      const ct = single.chordType;
      // 若該軌條目為專屬 Minor 軌道 (8~13, 33, 34)：
      // 若當前段落完全沒有任何 Major 伴奏軌 (如純小調專屬錄製之段落)，則作為基準軌放行發聲並由轉調引擎位移；
      // 若當前段落已有其他 Major 軌道，則依規範僅在 Minor 和弦下發聲
      const isTrackMinorOnly = (ct >= 8 && ct <= 13) || ct === 33 || ct === 34;
      if (isTrackMinorOnly && !isMinor && !isDim) {
        const hasAnyMajorInSec = entries.some(e => e.destCh >= 10 && e.chordType <= 7);
        if (hasAnyMajorInSec) {
          return undefined;
        }
      }
      return single.srcCh;
    }

    // 4. 多來源條目競合仲裁 (例如 Intro B 中 srcCh=2 為 Minor，srcCh=11 為 Major；或 Main A 中 srcCh=2 為 Piano rt，srcCh=11 為 Piano)
    // 優先排除僅為根音標記的輔助軌 (如 'Piano rt' / '... rt')，避免單音輔助軌搶佔真正的主和弦伴奏
    const mainDestEntries = destEntries.filter(e => !e.partName.toLowerCase().endsWith('rt') && !e.partName.toLowerCase().includes(' rt'));
    const candidates = mainDestEntries.length > 0 ? mainDestEntries : destEntries;

    if (isMinor || isDim) {
      // 小調優先尋找專屬 Minor 條目 (例如 Intro B 中的 srcCh=2)
      const minorEntry = destEntries.find(e => (e.chordType >= 8 && e.chordType <= 13) || e.chordType === 33 || e.chordType === 34);
      if (minorEntry) return minorEntry.srcCh;
      // 若無專屬 Minor 條目，優先使用主要原生候選軌 (例如 Piano Ch 11)
      const nativeEntry = candidates.find(e => e.srcCh === destCh);
      if (nativeEntry) return nativeEntry.srcCh;
      const majEntry = candidates.find(e => e.chordType <= 7);
      if (majEntry) return majEntry.srcCh;
      return candidates[0].srcCh;
    } else if (is7th) {
      // 屬七和弦優先尋找專屬 7th 條目 (優先候選軌)
      const seventhEntry = candidates.find(e => (e.chordType >= 14 && e.chordType <= 23) || e.chordType === 29 || e.chordType === 30);
      if (seventhEntry) return seventhEntry.srcCh;
      const nativeEntry = candidates.find(e => e.srcCh === destCh);
      if (nativeEntry) return nativeEntry.srcCh;
      const majEntry = candidates.find(e => e.chordType <= 7);
      if (majEntry) return majEntry.srcCh;
      return candidates[0].srcCh;
    } else {
      // 大調 (Major / Maj7) 或 Sus4：
      // 1. 若候選軌有原生同名主伴奏軌 (如 srcCh === destCh === 11 的 Piano)，以包含完整和弦的主伴奏軌為最高優先！
      const nativeEntry = candidates.find(e => e.srcCh === destCh);
      if (nativeEntry) return nativeEntry.srcCh;
      // 2. 尋找標準大調條目
      const majEntry = candidates.find(e => e.chordType <= 7);
      if (majEntry) return majEntry.srcCh;
      // 3. 回退第一條有效候選軌
      return candidates[0].srcCh;
    }
  }

  /**
   * 取得特定目標聲部於當前和弦與段落下的有效 CASM 條目 (含 NTR / NTT 參數)
   */
  public getActiveCasmEntry(destCh: number, chord: ChordDefinition): CasmChannelEntry | undefined {
    if (!this.parsed?.casmEntries || !this.currentSection) return undefined;
    const secKey = this.currentSection.name.toLowerCase();
    const entries = this.parsed.casmEntries[secKey];
    if (!entries || entries.length === 0) return undefined;

    const activeSrc = this.getActiveSourceChannel(destCh, chord);
    if (activeSrc === undefined) return undefined;

    return entries.find(e => e.destCh === destCh && e.srcCh === activeSrc);
  }

  private filterActiveEventsForChord(events: PlaybackNoteEvent[], chord: ChordDefinition): PlaybackNoteEvent[] {
    return events.filter(e => {
      const activeSrc = this.getActiveSourceChannel(e.channel, chord);
      return activeSrc !== undefined && e.sourceChannel === activeSrc;
    });
  }

  private filterActiveCCForChord(ccEvents: PlaybackCCEvent[], chord: ChordDefinition): PlaybackCCEvent[] {
    return ccEvents.filter(e => {
      const activeSrc = this.getActiveSourceChannel(e.channel, chord);
      return activeSrc === undefined || e.sourceChannel === activeSrc;
    });
  }

  private setupSectionMixing(casmSecMap?: Record<number, number>) {
    const sourceVolumes: Record<number, number> = {};
    const sourcePans: Record<number, number> = {};
    const sourceReverbs: Record<number, number> = {};
    const sourceChoruses: Record<number, number> = {};

    if (this.parsed) {
      for (const p of this.parsed.parts) {
        if (p.volume !== undefined) sourceVolumes[p.channel] = p.volume;
        if (p.pan !== undefined) sourcePans[p.channel] = p.pan;
        if (p.reverb !== undefined) sourceReverbs[p.channel] = p.reverb;
        if (p.chorus !== undefined) sourceChoruses[p.channel] = p.chorus;
      }
    }

    // 覆蓋當前段落 (this.currentSection) 起始小節專屬之控制器快照
    if (this.currentSection?.initialControllers) {
      for (const [srcStr, ctrl] of Object.entries(this.currentSection.initialControllers)) {
        const ch = parseInt(srcStr, 10);
        if (ctrl.volume !== undefined) sourceVolumes[ch] = ctrl.volume;
        if (ctrl.pan !== undefined) sourcePans[ch] = ctrl.pan;
        if (ctrl.reverb !== undefined) sourceReverbs[ch] = ctrl.reverb;
        if (ctrl.chorus !== undefined) sourceChoruses[ch] = ctrl.chorus;
      }
    }

    for (let destCh = 8; destCh <= 15; destCh++) {
      let matchedSrc: number | undefined;

      // 1. CASM 優先：尋找當前段落有效來源音軌之音量/控制器 (優先考量當前試聽和弦的 activeSrc)
      const activeSrc = this.getActiveSourceChannel(destCh, this.auditionChord);
      if (activeSrc !== undefined && (sourceVolumes[activeSrc] !== undefined || sourcePans[activeSrc] !== undefined)) {
        matchedSrc = activeSrc;
      } else if (casmSecMap) {
        for (const [srcStr, dst] of Object.entries(casmSecMap)) {
          if (dst === destCh && (sourceVolumes[parseInt(srcStr, 10)] !== undefined || sourcePans[parseInt(srcStr, 10)] !== undefined)) {
            matchedSrc = parseInt(srcStr, 10);
            break;
          }
        }
      }

      // 2. 若 CASM 未特別指定此聲部，則嘗試同名通道原生 SFF2 (8~15)
      if (matchedSrc === undefined && (sourceVolumes[destCh] !== undefined || sourcePans[destCh] !== undefined)) {
        matchedSrc = destCh;
      }

      // 3. 若仍無，嘗試 SFF1 傳統通道反推 (移除 8:0 誤對應)
      if (matchedSrc === undefined) {
        const sff1FallbackMap: Record<number, number> = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 5, 15: 6, 8: 8, 9: 9 };
        const fb = sff1FallbackMap[destCh];
        if (fb !== undefined && (sourceVolumes[fb] !== undefined || sourcePans[fb] !== undefined)) matchedSrc = fb;
      }

      // 解析音量 (Volume / CC 7)
      const vol = (matchedSrc !== undefined && sourceVolumes[matchedSrc] !== undefined)
        ? sourceVolumes[matchedSrc]
        : (sourceVolumes[destCh] ?? 100);
      this.channelVolumes.set(destCh, vol);

      // 解析相位 (Pan / CC 10)
      const pan = (matchedSrc !== undefined && sourcePans[matchedSrc] !== undefined)
        ? sourcePans[matchedSrc]
        : (sourcePans[destCh] ?? 64);
      this.channelPans.set(destCh, pan);

      // 解析殘響 (Reverb / CC 91)
      const rev = (matchedSrc !== undefined && sourceReverbs[matchedSrc] !== undefined)
        ? sourceReverbs[matchedSrc]
        : (sourceReverbs[destCh] ?? 40);
      this.channelReverbs.set(destCh, rev);

      // 解析合唱 (Chorus / CC 93)
      const cho = (matchedSrc !== undefined && sourceChoruses[matchedSrc] !== undefined)
        ? sourceChoruses[matchedSrc]
        : (sourceChoruses[destCh] ?? 0);
      this.channelChoruses.set(destCh, cho);

      // 同步軟體合成器實例
      const synth = this.chordSynths.get(destCh);
      if (synth) {
        synth.setVolume(this.getEffectiveChannelVolume(destCh));
        synth.setPan(pan);
        synth.setReverb(rev);
        synth.setChorus(cho);
      }
      if (destCh === 10) {
        bassSynth.setVolume(this.getEffectiveChannelVolume(10));
        bassSynth.setPan(pan);
        bassSynth.setReverb(rev);
        bassSynth.setChorus(cho);
      }
      if (destCh === 8 || destCh === 9) {
        drumSynth.setVolume(this.getEffectiveChannelVolume(destCh));
        drumSynth.setPan(pan);
        drumSynth.setReverb(rev);
        drumSynth.setChorus(cho);
      }
    }
  }

      private setupPartVoices(rawVoices: Record<number, { msb: number; lsb: number; pc: number }>, casmSecMap?: Record<number, number>) {
    this.partVoices.clear();

    // 若當前段落有專屬 ProgramChange / Bank 快照，同步進 rawVoices
    if (this.currentSection?.initialControllers) {
      for (const [srcStr, ctrl] of Object.entries(this.currentSection.initialControllers)) {
        const ch = parseInt(srcStr, 10);
        if (ctrl.programChange !== undefined) {
          if (!rawVoices[ch]) rawVoices[ch] = { msb: 0, lsb: 0, pc: 0 };
          rawVoices[ch].pc = ctrl.programChange;
          if (ctrl.bankMsb !== undefined) rawVoices[ch].msb = ctrl.bankMsb;
          if (ctrl.bankLsb !== undefined) rawVoices[ch].lsb = ctrl.bankLsb;
        }
      }
    }

    // 映射各聲部音色 (以 Yamaha CASM 路由為最高優先準則)
    for (let destCh = 8; destCh <= 15; destCh++) {
      // 0. 若使用者已手動設定/覆寫此聲部音色，以使用者的自訂音色為最高優先級！
      if (this.customVoiceOverrides.has(destCh)) {
        const customVoice = this.customVoiceOverrides.get(destCh)!;
        const name = customVoice.chineseName ? `${customVoice.name} (${customVoice.chineseName})` : customVoice.name;
        const info: PartVoiceInfo = {
          channel: destCh,
          msb: customVoice.msb,
          lsb: customVoice.lsb,
          pc: customVoice.pc,
          voiceName: name,
          category: customVoice.category,
        };
        this.partVoices.set(destCh, info);

        // 同步更新軟體合成器模型
        const synth = this.chordSynths.get(destCh);
        if (synth) {
          synth.setVoice({ category: customVoice.category, id: customVoice.id, name: customVoice.name });
        }
        continue;
      }
      let matchedSrc: number | undefined;

      // 1. 優先查核當前段落 CASM 映射表 (優先考量當前試聽和弦的 activeSrc)
      const activeSrc = this.getActiveSourceChannel(destCh, this.auditionChord);
      if (activeSrc !== undefined && rawVoices[activeSrc]) {
        matchedSrc = activeSrc;
      } else if (casmSecMap) {
        for (const [srcStr, dst] of Object.entries(casmSecMap)) {
          if (dst === destCh && rawVoices[parseInt(srcStr, 10)]) {
            matchedSrc = parseInt(srcStr, 10);
            break;
          }
        }
      }

      // 2. 若 CASM 未特別指定此聲部，則嘗試同名通道原生 SFF2 (8~15)
      if (matchedSrc === undefined && rawVoices[destCh]) {
        matchedSrc = destCh;
      }

      // 3. 若仍無，嘗試 SFF1 傳統通道反推 (10->1, 11->2, 12->3, 13->4, 14->5, 15->6, 8->8, 9->9)
      if (matchedSrc === undefined) {
        const sff1FallbackMap: Record<number, number> = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 5, 15: 6, 8: 8, 9: 9 };
        const fb = sff1FallbackMap[destCh];
        if (fb !== undefined && rawVoices[fb]) matchedSrc = fb;
      }

      // 4. 若仍無匹配來源：如果是 Dest 8 (Rh1)，保持鼓組類別 (Drums)，預設套用主鼓組 rawVoices[9] 或標準鼓組
      let v: { msb: number; lsb: number; pc: number };
      if (matchedSrc !== undefined && rawVoices[matchedSrc]) {
        v = rawVoices[matchedSrc];
      } else if (rawVoices[destCh]) {
        v = rawVoices[destCh];
      } else if (destCh === 8) {
        v = rawVoices[9] || { msb: 127, lsb: 0, pc: 0 };
      } else {
        v = { msb: 0, lsb: 0, pc: 0 };
      }
      const found = findYamahaVoice(v.msb, v.lsb, v.pc);
      const name = found ? (found.chineseName ? `${found.name} (${found.chineseName})` : found.name) : `Voice (${v.msb}-${v.lsb}-${v.pc + 1})`;
      const category = found?.category || this.inferCategoryByChannel(destCh);

      const info: PartVoiceInfo = {
        channel: destCh,
        msb: v.msb,
        lsb: v.lsb,
        pc: v.pc,
        voiceName: name,
        category,
      };
      this.partVoices.set(destCh, info);

      // 設定該聲部專屬合成器之音色類別
      const synth = this.chordSynths.get(destCh);
      if (synth) {
        synth.setVoice({ category, name });
      }
    }
  }

  private inferCategoryByChannel(ch: number): string {
    switch (ch) {
      case 8:
      case 9:
        return 'Drums';
      case 10:
        return 'Bass';
      case 11:
        return 'Guitar';
      case 12:
        return 'E.Piano';
      case 13:
        return 'Strings';
      case 14:
        return 'Brass';
      case 15:
        return 'Synth';
      default:
        return 'Piano';
    }
  }

  public getCurrentSection(): YamahaSection | null {
    return this.currentSection;
  }

  public getTotalBars(): number {
    return this.totalBars;
  }

  public getTotalSectionTicks(): number {
    return this.totalSectionTicks;
  }

  public getSectionEvents(): PlaybackNoteEvent[] {
    return this.sectionEvents;
  }

  public getChannelEvents(channel: number): PlaybackNoteEvent[] {
    return this.sectionEvents.filter(e => e.channel === channel);
  }

  public getAllChannelEvents(channel: number): PlaybackNoteEvent[] {
    return this.rawSectionEvents.filter(e => e.channel === channel);
  }

  /**
   * 更新特定聲部的音符事件集合 (供單軌專注編輯器即時回寫)
   */
  public setChannelEvents(channel: number, newEvents: PlaybackNoteEvent[]) {
    const activeSrc = this.getActiveSourceChannel(channel, this.auditionChord);
    const othersRaw = this.rawSectionEvents.filter(e => !(e.channel === channel && (activeSrc === undefined || e.sourceChannel === activeSrc)));
    this.rawSectionEvents = [...othersRaw, ...newEvents].sort((a, b) => a.relTick - b.relTick);
    this.sectionEvents = this.filterActiveEventsForChord(this.rawSectionEvents, this.auditionChord);
  }

  public getChordSynth(channel: number): ChordSynth | undefined {
    return this.chordSynths.get(channel);
  }

  /**
   * 即時單音試聽 (支援 Web Audio 與 PSR-SX920 Web MIDI)
   */
  public previewNote(channel: number, note: number, velocity: number = 100, durMs: number = 250) {
    if (this.outputMode === 'midi') {
      if (midiManager.getSelectedOutput()) {
        midiManager.sendNoteOn(channel, note, velocity);
        setTimeout(() => midiManager.sendNoteOff(channel, note), durMs);
      }
    } else {
      if (channel === 8 || channel === 9) {
        drumSynth.playNote(note, velocity);
      } else if (channel === 10) {
        bassSynth.playNote(note, velocity, durMs);
      } else {
        const synth = this.chordSynths.get(channel);
        if (synth) synth.playNote(note, velocity, durMs);
      }
    }
  }

  /**
   * 更換特定聲部的 Yamaha 原廠音色設定
   */
  public setChannelVoice(channel: number, voice: YamahaVoice) {
    this.customVoiceOverrides.set(channel, voice);
    const name = voice.chineseName ? `${voice.name} (${voice.chineseName})` : voice.name;
    const info: PartVoiceInfo = {
      channel,
      msb: voice.msb,
      lsb: voice.lsb,
      pc: voice.pc,
      voiceName: name,
      category: voice.category,
    };
    this.partVoices.set(channel, info);

    // 1. 若處於 Web MIDI 輸出模式，向實體琴發送 Bank Select 與 Program Change
    if (this.outputMode === 'midi' && midiManager.getSelectedOutput()) {
      midiManager.sendVoiceChange(channel, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
    }

    // 2. 若處於 Web Audio 軟體合成器模式，通知該軌道專屬合成器切換樂器模型
    const synth = this.chordSynths.get(channel);
    if (synth) {
      synth.setVoice({ category: voice.category, name: voice.name });
    }
  }

  /**
   * 試聽特定音色之示範樂句或和弦琶音 (Audition Phrase)
   */
  public previewVoicePhrase(channel: number, voice: YamahaVoice) {
    const isDrum = voice.category === 'Drums' || voice.category === 'Percussion' || channel === 8 || channel === 9;
    // 在 Web Audio 模式下，即時切換該聲部合成器聲音模型為當前試聽音色！
    const synth = this.chordSynths.get(channel);
    if (synth) {
      synth.setVoice({ category: voice.category, id: voice.id, name: voice.name });
    }

    if (this.outputMode === 'midi' && midiManager.getSelectedOutput()) {
      // 送出音色切換
      midiManager.sendVoiceChange(channel, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
    }

    if (isDrum) {
      // 鼓組試聽：大鼓 (36) + 閉鈸 (42) + 小鼓 (38)
      this.previewNote(channel, 36, 110, 200);
      setTimeout(() => this.previewNote(channel, 42, 95, 150), 120);
      setTimeout(() => this.previewNote(channel, 38, 105, 200), 240);
    } else if (voice.category === 'Bass' || channel === 10) {
      // 貝斯試聽：低音根音 (C2 36) -> 五音 (G2 43)
      this.previewNote(channel, 36, 105, 250);
      setTimeout(() => this.previewNote(channel, 43, 100, 300), 180);
    } else {
      // 旋律/和弦樂器：大三和弦琶音 (C4 60 -> E4 64 -> G4 67)
      this.previewNote(channel, 60, 100, 250);
      setTimeout(() => this.previewNote(channel, 64, 95, 250), 140);
      setTimeout(() => this.previewNote(channel, 67, 105, 380), 280);
    }
  }

  /**
   * 啟動微秒級高精度排程播放
   */
  public play() {
    if (!this.currentSection || this.sectionEvents.length === 0) return;
    this.stop();

    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.isPlaying = true;

    // 若為 MIDI 模式，初始化琴端 8 大聲部音色與音量
    if (this.outputMode === 'midi') {
      midiManager.panicAllChannels();
      for (const [ch, voice] of this.partVoices.entries()) {
        midiManager.sendVoiceChange(ch, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
        const isMuted = this.isChannelMuted(ch);
        midiManager.sendControlChange(ch, 7, isMuted ? 0 : this.getEffectiveChannelVolume(ch));

        // 發送起始 Expression (CC 11)
        const initExpr = this.getInitialExpression(ch);
        midiManager.sendControlChange(ch, 11, initExpr);

        // 發送 Pan (CC 10), Reverb (CC 91), Chorus (CC 93) (依 CASM 路由即時數值)
        midiManager.sendControlChange(ch, 10, this.getChannelPan(ch));
        midiManager.sendControlChange(ch, 91, this.getChannelReverb(ch));
        midiManager.sendControlChange(ch, 93, this.getChannelChorus(ch));
      }
    } else {
      for (let ch = 8; ch <= 15; ch++) {
        const initExpr = this.getInitialExpression(ch);
        const synth = this.chordSynths.get(ch);
        if (synth) synth.setExpression(initExpr);
      }
    }

    const division = this.parsed?.division || 480;
    const ticksPerSec = (this.bpm * division) / 60;
    const startTime = (ctx ? ctx.currentTime : 0) + 0.04; // 40ms 安全緩衝

    this.playbackStartAudioTime = startTime;
    this.lastScheduledTick = -1;

    const lookaheadIntervalMs = 25; // 25ms 檢查週期
    const lookaheadWindowSec = 0.15; // 150ms 預排視窗

    const scheduleLoop = () => {
      if (!this.isPlaying) return;
      const currentCtx = getSharedAudioContext();
      if (!currentCtx) return;

      const nowAudioTime = currentCtx.currentTime;
      // 計算目前已經播放了多少秒
      const elapsedSec = Math.max(0, nowAudioTime - this.playbackStartAudioTime);
      const currentAbsoluteTick = elapsedSec * ticksPerSec;

      // 如果超出當前段落長度
      if (currentAbsoluteTick >= this.totalSectionTicks) {
        if (this.isLooping) {
          // 無縫循環：將起點平移一個段落長度，不產生任何時鐘抖動
          const loopCount = Math.floor(currentAbsoluteTick / this.totalSectionTicks);
          this.playbackStartAudioTime += (this.totalSectionTicks * loopCount) / ticksPerSec;
          this.lastScheduledTick = -1;
        } else {
          this.stop();
          return;
        }
      }

      const loopCurrentTick = (currentAbsoluteTick % this.totalSectionTicks);
      const windowEndTick = loopCurrentTick + (lookaheadWindowSec * ticksPerSec);

      // 1. 排程 CC 控制器事件 (如 CC 11 Expression 漸強漸弱曲線、CC 1 顫音、CC 64 延音等)
      for (const ccEvent of this.rawSectionCCEvents) {
        const evTick = ccEvent.relTick;
        if (evTick > this.lastScheduledTick && evTick <= windowEndTick) {
          const currentChord = this.getChordForTick(evTick);
          const activeSrcCh = this.getActiveSourceChannel(ccEvent.channel, currentChord);
          if (activeSrcCh !== undefined && ccEvent.sourceChannel !== activeSrcCh) {
            continue;
          }

          const eventAudioTime = this.playbackStartAudioTime + (evTick / ticksPerSec);
          if (this.outputMode === 'midi') {
            const deltaMs = Math.max(0, (eventAudioTime - nowAudioTime) * 1000);
            const midiTimestamp = performance.now() + deltaMs;
            midiManager.sendControlChange(ccEvent.channel, ccEvent.controller, ccEvent.value, midiTimestamp);
          } else {
            const synth = this.chordSynths.get(ccEvent.channel);
            if (synth) {
              if (ccEvent.controller === 11) {
                synth.setExpression(ccEvent.value, eventAudioTime);
              } else if (ccEvent.controller === 7) {
                synth.setVolume(ccEvent.value);
              } else if (ccEvent.controller === 10) {
                synth.setPan(ccEvent.value);
              } else if (ccEvent.controller === 91) {
                synth.setReverb(ccEvent.value);
              } else if (ccEvent.controller === 93) {
                synth.setChorus(ccEvent.value);
              }
            }
            if (ccEvent.channel === 10) {
              if (ccEvent.controller === 7) bassSynth.setVolume(ccEvent.value);
              else if (ccEvent.controller === 10) bassSynth.setPan(ccEvent.value);
              else if (ccEvent.controller === 91) bassSynth.setReverb(ccEvent.value);
              else if (ccEvent.controller === 93) bassSynth.setChorus(ccEvent.value);
            }
            if (ccEvent.channel === 8 || ccEvent.channel === 9) {
              if (ccEvent.controller === 7) drumSynth.setVolume(ccEvent.value);
              else if (ccEvent.controller === 10) drumSynth.setPan(ccEvent.value);
              else if (ccEvent.controller === 91) drumSynth.setReverb(ccEvent.value);
              else if (ccEvent.controller === 93) drumSynth.setChorus(ccEvent.value);
            }
          }
        }
      }

      // 2. 排程 [lastScheduledTick + 1, windowEndTick] 範圍內的音符
      this.activeChannelsInWindow.clear();

      for (const event of this.rawSectionEvents) {
        const evTick = event.relTick;
        // 檢查音符是否落在當前預排視窗中
        if (evTick > this.lastScheduledTick && evTick <= windowEndTick) {
          // 聲部靜音檢查 (依目的聲部通道 8~15 判定)
          if (this.isChannelMuted(event.channel)) continue;

          const currentChord = this.getChordForTick(evTick);

          // ★ CASM 多軌和弦動態仲裁 (Multi-Track Chord Dynamic Arbitration) ★
          // 依據當前小節和弦類型，動態選定目標聲部的有效來源軌道 (Active Source Channel)
          const activeSrcCh = this.getActiveSourceChannel(event.channel, currentChord);
          if (activeSrcCh === undefined || event.sourceChannel !== activeSrcCh) {
            continue;
          }

          // 計算發聲精確音訊時間
          const eventAudioTime = this.playbackStartAudioTime + (evTick / ticksPerSec);
          const durSec = (event.durationTicks / division) * (60 / this.bpm);
          const durMs = durSec * 1000;

          this.activeChannelsInWindow.add(event.channel);

          const isDrum = this.isChannelDrum(event.channel);
          const activeCasm = this.getActiveCasmEntry(event.channel, currentChord);
          const ntr = activeCasm?.ntr;
          const ntt = activeCasm?.ntt;

          const noteToPlay = isDrum
            ? event.noteNumber
            : ChordTransposer.transposeSingleNote(
                event.noteNumber,
                currentChord,
                event.channel,
                isDrum,
                0,
                127,
                ntr,
                ntt
              );

          if (this.outputMode === 'webaudio') {
            const effVol = this.getEffectiveChannelVolume(event.channel);
            const scaledVel = Math.round(event.velocity * (effVol / 127));
            if (scaledVel <= 0) continue;
            this.playWebAudioNote(event.channel, noteToPlay, scaledVel, durMs, eventAudioTime);
          } else {
            // 在 MIDI 模式下，實體琴已由 CC 7 (Effective Channel Volume) 調控音軌總量，
            // NoteOn 保持 STY 原始真實敲擊力度，不進行二次雙重衰減！
            this.playMidiNote(event.channel, noteToPlay, event.velocity, durMs, eventAudioTime, nowAudioTime);
          }
        }
      }

      this.lastScheduledTick = windowEndTick;
    };

    scheduleLoop();
    this.timerId = setInterval(scheduleLoop, lookaheadIntervalMs);

    // 輕量 60fps 游標回呼（只計算小節與拍號，零重 DOM 操作）
    const num = this.parsed?.timeSignature.numerator || 4;
    const den = this.parsed?.timeSignature.denominator || 4;
    const ticksPerBar = division * num * (4 / den);
    const ticksPerBeat = division * (4 / den);

    const renderTick = () => {
      if (!this.isPlaying) return;
      const currentCtx = getSharedAudioContext();
      const now = currentCtx ? currentCtx.currentTime : 0;
      const elapsedSec = Math.max(0, now - this.playbackStartAudioTime);
      const curTick = (elapsedSec * ticksPerSec) % this.totalSectionTicks;

      const currentBar = Math.floor(curTick / ticksPerBar) + 1;
      const beatInBar = (curTick % ticksPerBar) / ticksPerBeat + 1;

      const barIndex0 = currentBar - 1;
      if (this.chordAutoAdvance && this.activeProgressionBar !== barIndex0) {
        this.activeProgressionBar = barIndex0;
        const currentProgChord = this.getChordForBar(barIndex0);
        if (this.onProgressionBarChangeCallback) {
          this.onProgressionBarChangeCallback(barIndex0, currentProgChord);
        }
      }

      if (this.onTickCallback) {
        this.onTickCallback(currentBar, parseFloat(beatInBar.toFixed(1)), Math.round(curTick), this.totalBars);
      }
      if (this.onActivityCallback && this.activeChannelsInWindow.size > 0) {
        this.onActivityCallback(new Set(this.activeChannelsInWindow));
      }

      this.rafId = requestAnimationFrame(renderTick);
    };

    this.rafId = requestAnimationFrame(renderTick);
  }

  public pause() {
    this.stop();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.activeProgressionBar !== -1) {
      this.activeProgressionBar = -1;
      if (this.onProgressionBarChangeCallback) {
        this.onProgressionBarChangeCallback(-1, this.auditionChord);
      }
    }
    if (this.outputMode === 'midi') {
      midiManager.panicAllChannels();
      // 恢復所有伴奏通道 CC 11 表情為 127，避免實體琴手動彈奏時發音偏小
      for (let ch = 8; ch <= 15; ch++) {
        midiManager.sendControlChange(ch, 11, 127);
      }
    }
  }

  public setAuditionChord(chord: ChordDefinition) {
    this.auditionChord = chord;
    this.sectionEvents = this.filterActiveEventsForChord(this.rawSectionEvents, chord);
    this.sectionCCEvents = this.filterActiveCCForChord(this.rawSectionCCEvents, chord);

    if (this.currentSection && this.parsed) {
      const secKey = this.currentSection.name.toLowerCase();
      const casmSecMap = this.parsed.casmMappings
        ? (this.parsed.casmMappings[secKey] || this.parsed.casmMappings['*'] || {})
        : {};
      this.setupSectionMixing(casmSecMap);
      const rawVoices: Record<number, { msb: number; lsb: number; pc: number }> = {};
      for (const p of this.parsed.parts) {
        if (p.programChange !== undefined) {
          rawVoices[p.channel] = {
            msb: p.bankMsb ?? 0,
            lsb: p.bankLsb ?? 0,
            pc: p.programChange,
          };
        }
      }
      this.setupPartVoices(rawVoices, casmSecMap);
    }
    if (this.onChordChangeCallback) {
      this.onChordChangeCallback(chord);
    }
  }

  public getAuditionChord(): ChordDefinition {
    return this.auditionChord;
  }

  public resetAuditionChord() {
    this.setAuditionChord(ChordTransposer.buildChord('C', 'maj'));
  }

  public onChordChange(cb: (chord: ChordDefinition) => void) {
    this.onChordChangeCallback = cb;
  }

  /**
   * 設定是否啟動多小節和弦進行自動輪播
   */
  public setChordAutoAdvance(enabled: boolean) {
    this.chordAutoAdvance = enabled;
    if (!enabled) {
      this.activeProgressionBar = -1;
      if (this.onProgressionBarChangeCallback) {
        this.onProgressionBarChangeCallback(-1, this.auditionChord);
      }
    } else if (this.isPlaying && this.activeProgressionBar >= 0) {
      const chord = this.getChordForBar(this.activeProgressionBar);
      if (this.onProgressionBarChangeCallback) {
        this.onProgressionBarChangeCallback(this.activeProgressionBar, chord);
      }
    }
  }

  public getChordAutoAdvance(): boolean {
    return this.chordAutoAdvance;
  }

  /**
   * 設定當前和弦進行鏈
   */
  public setChordProgression(chords: ChordDefinition[], presetId: string = 'custom') {
    if (!chords || chords.length === 0) return;
    this.chordProgression = [...chords];
    this.currentProgressionPresetId = presetId;
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(this.chordProgression, this.currentProgressionPresetId, this.selectedProgressionBarIndex);
    }
  }

  public getChordProgression(): ChordDefinition[] {
    return [...this.chordProgression];
  }

  public getChordProgressionPresetId(): string {
    return this.currentProgressionPresetId;
  }

  public setSelectedProgressionBarIndex(index: number) {
    this.selectedProgressionBarIndex = Math.max(0, index);
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(this.chordProgression, this.currentProgressionPresetId, this.selectedProgressionBarIndex);
    }
  }

  public getSelectedProgressionBarIndex(): number {
    return this.selectedProgressionBarIndex;
  }

  public setChordForProgressionBar(barIndex: number, chord: ChordDefinition) {
    if (barIndex < 0) return;
    while (this.chordProgression.length <= barIndex) {
      this.chordProgression.push(ChordTransposer.buildChord('C', 'maj'));
    }
    this.chordProgression[barIndex] = chord;
    this.currentProgressionPresetId = 'custom';
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(this.chordProgression, this.currentProgressionPresetId, this.selectedProgressionBarIndex);
    }
  }

  /**
   * 取得指定 Tick 所屬小節應發聲的和弦
   */
  public getChordForTick(relTick: number): ChordDefinition {
    if (!this.chordAutoAdvance || this.chordProgression.length === 0) {
      return this.auditionChord;
    }
    const num = this.parsed?.timeSignature.numerator || 4;
    const den = this.parsed?.timeSignature.denominator || 4;
    const division = this.parsed?.division || 480;
    const ticksPerBar = division * num * (4 / den);
    if (ticksPerBar <= 0) return this.auditionChord;

    const barIndex = Math.max(0, Math.floor(relTick / ticksPerBar));
    return this.chordProgression[barIndex % this.chordProgression.length];
  }

  /**
   * 取得指定小節 (0-based) 的和弦
   */
  public getChordForBar(barIndex: number): ChordDefinition {
    if (this.chordProgression.length === 0) return this.auditionChord;
    return this.chordProgression[Math.max(0, barIndex) % this.chordProgression.length];
  }

  public onProgressionBarChange(cb: (barIndex: number, chord: ChordDefinition) => void) {
    this.onProgressionBarChangeCallback = cb;
  }

  public onProgressionUpdate(cb: (progression: ChordDefinition[], presetId: string, selectedBar: number) => void) {
    this.onProgressionUpdateCallback = cb;
  }

  /**
   * 彈奏和弦試聽音形 (Audition Chord Preview)
   * 點選和弦按鍵時，短暫彈奏該和弦的和弦音與 Bass，提供清晰立即的聽覺反饋
   */
  public previewChord(chord: ChordDefinition) {
    if (this.isPlaying) return;
    const bassNote = 36 + chord.semitonesFromC;
    const chordNotes = chord.intervals.map(iv => 60 + chord.semitonesFromC + iv);

    if (this.outputMode === 'midi') {
      if (midiManager.getSelectedOutput()) {
        midiManager.sendNoteOn(10, bassNote, 85);
        chordNotes.forEach(n => midiManager.sendNoteOn(11, n, 80));
        setTimeout(() => {
          midiManager.sendNoteOff(10, bassNote);
          chordNotes.forEach(n => midiManager.sendNoteOff(11, n));
        }, 350);
      }
    } else {
      bassSynth.playNote(bassNote, 85, 350);
      const synth = this.chordSynths.get(11) || this.chordSynths.get(12);
      if (synth) {
        chordNotes.forEach(n => synth.playNote(n, 75, 350));
      }
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private playWebAudioNote(channel: number, note: number, velocity: number, durMs: number, when: number) {
    const isDrum = this.isChannelDrum(channel);
    if (isDrum) {
      // 真實打擊鼓組
      drumSynth.playNote(note, velocity, when);
    } else if (channel === 10) {
      // 貝斯部 (Bass: Ch 10)
      bassSynth.playNote(note, velocity, durMs, when);
    } else {
      // 和弦、樂句與旋律性節奏部 (如 Ch 8 Pizzicato Strings 或 Ch 11~15)
      const synth = this.chordSynths.get(channel);
      if (synth) {
        synth.playNote(note, velocity, durMs, when);
      }
    }
  }

  private playMidiNote(channel: number, note: number, velocity: number, durMs: number, when: number, nowAudioTime: number) {
    if (!midiManager.getSelectedOutput()) return;
    const deltaMs = Math.max(0, (when - nowAudioTime) * 1000);
    const midiTimestamp = performance.now() + deltaMs;

    midiManager.sendNoteOn(channel, note, velocity, midiTimestamp);
    midiManager.sendNoteOff(channel, note, midiTimestamp + durMs);
  }
}

export const styPlaybackEngine = new StyPlaybackEngine();
