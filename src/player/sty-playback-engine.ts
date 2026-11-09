import type { YamahaFileParsed, YamahaSection, MidiEvent, CasmChannelEntry } from '../core/models/types';
import { getSharedAudioContext } from '../creator/shared-audio-context';
import { drumSynth } from '../creator/drum-synth';
import { bassSynth } from '../creator/bass-synth';
import { ChordSynth } from '../creator/chord-synth';
import { midiManager } from '../core/audio/midi-manager';
import { resolveYamahaVoiceWithAlias, isMegaVoice, type YamahaVoice } from '../core/data/yamaha-voices';
import { ChordTransposer, type ChordDefinition } from '../core/writer/chord-transposer';
import { isIntroOrEndingSection } from '../core/models/style-types';

export function formatYamahaPan(pan: number): string {
  if (pan === 64) return 'C';
  if (pan < 64) return `L${64 - pan}`;
  return `R${pan - 64}`;
}

export type PlaybackOutputMode = 'webaudio' | 'midi' | 'both';

export interface PlaybackCCEvent {
  relTick: number;          // 相對於段落起始的 Tick
  channel: number;          // 目的 MIDI Channel (8~15)
  sourceChannel?: number;   // 原始 MIDI 來源 Channel (0~15)
  controller: number;       // 控制器編號 (e.g. 11: Expression, 1: Mod, 64: Sustain, etc.)
  value: number;            // 控制器數值 (0~127)
}

export interface PlaybackPitchBendEvent {
  relTick: number;          // 相對於段落起始的 Tick
  channel: number;          // 目的 MIDI Channel (8~15)
  sourceChannel?: number;   // 原始 MIDI 來源 Channel (0~15)
  value: number;            // 彎音數值 (0~16383, 8192 為正中無偏音)
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
  msb: number;              // PSR-SX920 面板標準 MSB (發送 Program Change 與 UI 主顯示一致)
  lsb: number;              // PSR-SX920 面板標準 LSB
  pc: number;               // PSR-SX920 面板標準 PC (0-based)
  rawMsb?: number;          // 檔案內原始 MSB (相容舊代碼追蹤)
  rawLsb?: number;          // 檔案內原始 LSB
  rawPc?: number;           // 檔案內原始 PC (0-based)
  isLegacyAlias?: boolean;  // 是否由舊版相容代碼轉譯為 SX920 旗艦代碼
  legacyCodeLabel?: string; // 1-based 相容舊代碼 (如 "104-1-1")
  panelCode?: string;       // 1-based SX920 面板標準代碼 (如 "104-21-1")
  formattedDisplayWithCode?: string;
  voiceName: string;
  category: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSectionName: string | null;
  bpm: number;
  isLooping: boolean;
  outputMode: PlaybackOutputMode;
  currentBar: number;
  currentBeat: number;
  currentTick: number;
}

export type TickCallback = (bar: number, beat: number, tick: number, totalBars: number) => void;
export type ChannelActivityCallback = (activeChannels: Set<number>) => void;
export type PlayStateCallback = (isPlaying: boolean) => void;
export type PlayEndedCallback = () => void;

export class StyPlaybackEngine {
  private parsed: YamahaFileParsed | null = null;
  private currentSection: YamahaSection | null = null;
  private rawSectionEvents: PlaybackNoteEvent[] = [];
  private rawSectionCCEvents: PlaybackCCEvent[] = [];
  private rawSectionPitchBendEvents: PlaybackPitchBendEvent[] = [];
  private sectionEvents: PlaybackNoteEvent[] = [];
  private sectionCCEvents: PlaybackCCEvent[] = [];
  private sectionPitchBendEvents: PlaybackPitchBendEvent[] = [];
  private currentSectionRawVoices: Record<number, { msb: number; lsb: number; pc: number }> = {};
  private totalSectionTicks: number = 0;
  private totalBars: number = 1;

  // 標準 MIDI 音樂檔 16 通道原曲直播模式 (MIDI Song Mode)
  private isSongMode: boolean = false;
  private songStartBar: number = 1;
  private songEndBar: number = 1;
  private songTotalBars: number = 1;

  private isPlaying: boolean = false;
  private isLooping: boolean = true;
  private bpm: number = 120;
  private outputMode: PlaybackOutputMode = 'webaudio';

  // 播放排程時鐘
  private timerId: any = null;
  private rafId: number | null = null;
  private playbackStartAudioTime: number = 0;
  private lastScheduledTick: number = 0;

  // 聲部專屬合成器 (支援全 16 通道 0~15 各自獨立 ChordSynth 實例，避免音色互相覆蓋)
  private chordSynths: Map<number, ChordSynth> = new Map();
  private partVoices: Map<number, PartVoiceInfo> = new Map();
  private customVoiceOverrides: Map<number, YamahaVoice> = new Map();
  private auditionChord: ChordDefinition = ChordTransposer.buildChord('C', 'maj');
  private onChordChangeCallback: ((chord: ChordDefinition) => void) | null = null;

  // 智慧多小節和弦進行輪播 (Chord Progression Auto-Advance)
  private chordAutoAdvance: boolean = false;
  private isProgressionSuspended: boolean = false; // 是否因 Intro / Ending 智慧掛起 (原調保護)
  private chordProgression: ChordDefinition[] = ChordTransposer.getProgressionPreset('pop-1564');
  private currentProgressionPresetId: string = 'pop-1564';
  private selectedProgressionBarIndex: number = 0;
  private activeProgressionBar: number = -1;
  private onProgressionBarChangeCallback: ((barIndex: number, chord: ChordDefinition) => void) | null = null;
  private onProgressionUpdateCallback: ((progression: ChordDefinition[], presetId: string, selectedBar: number) => void) | null = null;

  // 聲部靜音與獨奏 (支援全 16 通道 0~15)
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
  private onPlayStateChangeCallback: PlayStateCallback | null = null;
  private onEndedCallback: PlayEndedCallback | null = null;
  private activeChannelsInWindow: Set<number> = new Set();

  constructor() {
    // 預設全 16 通道 (0~15) 音量為 100，並為每個通道建立專屬合成器
    for (let c = 0; c <= 15; c++) {
      this.channelVolumes.set(c, 100);
      this.channelPans.set(c, 64);
      this.channelReverbs.set(c, 40);
      this.channelChoruses.set(c, 0);
      this.chordSynths.set(c, new ChordSynth());
    }
  }

  public getIsSongMode(): boolean {
    return this.isSongMode;
  }

  public getSongBarRange(): { startBar: number; endBar: number; totalSongBars: number } {
    return {
      startBar: this.songStartBar,
      endBar: this.songEndBar,
      totalSongBars: this.songTotalBars,
    };
  }

  /**
   * 判定特定聲部是否為真實鼓組/打擊樂 (True Drum Kit)
   * Yamaha STY 中 Rhythm 1 (Ch 8) 經常使用非鼓組的旋律樂器 (如 Pizzicato Strings, 木琴, 琶音器等)
   */
  public isChannelDrum(channel: number): boolean {
    const overrideVoice = this.customVoiceOverrides.get(channel);
    if (overrideVoice) {
      return overrideVoice.category === 'Drums' || overrideVoice.msb === 127 || overrideVoice.msb === 126;
    }
    const pv = this.partVoices.get(channel);
    if (pv) {
      return pv.category === 'Drums' || pv.msb === 127 || pv.msb === 126;
    }
    const part = this.getPartInfo(channel);
    if (part) {
      return part.category === 'Drums' || part.bankMsb === 127 || part.bankMsb === 126;
    }
    // 預設兜底：只有 Channel 9 (MIDI CH 10, 標準打擊樂通道) 預設為鼓
    return channel === 9;
  }

  /**
   * 判斷指定聲部是否使用 Yamaha MegaVoice (兆級音色)
   * 依據 Yamaha 伴奏規格 (手冊 P.31)，MegaVoice 在 C6 (音高 ≥ 96) 為特殊雜音/演奏法觸發區，嚴禁轉調！
   */
  public isChannelMegaVoice(channel: number): boolean {
    const overrideVoice = this.customVoiceOverrides.get(channel);
    if (overrideVoice) {
      return isMegaVoice(overrideVoice.msb, overrideVoice.lsb, overrideVoice.pc, overrideVoice.name);
    }
    const pv = this.partVoices.get(channel);
    if (pv) {
      return isMegaVoice(pv.msb, pv.lsb, pv.pc, pv.voiceName);
    }
    const part = this.getPartInfo(channel);
    if (part) {
      return isMegaVoice(part.bankMsb, part.bankLsb, part.programChange, part.voiceName);
    }
    return false;
  }

  public getPartInfo(c: number): any {
    if (!this.parsed) return undefined;
    let part = this.parsed.parts.find(p => p.channel === c);
    if (!part && !this.isSongMode) {
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
    this.mutedChannels.clear();
    this.soloChannel = null;
    this.isSongMode = false;
    this.songStartBar = 1;
    this.songEndBar = 1;
    this.songTotalBars = 1;
    this.parsed = parsed;
    this.bpm = parsed.bpm || 120;
    this.isProgressionSuspended = false;
    this.currentSection = null;
    this.rawSectionEvents = [];
    this.rawSectionCCEvents = [];
    this.rawSectionPitchBendEvents = [];
    this.sectionEvents = [];
    this.sectionCCEvents = [];
    this.sectionPitchBendEvents = [];
    this.currentSectionRawVoices = {};
    this.partVoices.clear();

    // 載入各通道混音音量 (CC 7) 與效果器預設值 (支援全 16 通道 0~15)
    for (let c = 0; c <= 15; c++) {
      const part = this.getPartInfo(c);
      const vol = part?.volume !== undefined ? part.volume : 100;
      const pan = part?.pan !== undefined ? part.pan : 64;
      const rev = part?.reverb !== undefined ? part.reverb : 40;
      const cho = part?.chorus !== undefined ? part.chorus : 0;
      this.channelVolumes.set(c, vol);
      this.channelPans.set(c, pan);
      this.channelReverbs.set(c, rev);
      this.channelChoruses.set(c, cho);
      const synth = this.chordSynths.get(c);
      if (synth) {
        synth.setVolume(vol);
        synth.setPan(pan);
        synth.setReverb(rev);
        synth.setChorus(cho);
      }
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

  public isWebAudioEnabled(): boolean {
    return this.outputMode === 'webaudio' || this.outputMode === 'both';
  }

  public isMidiEnabled(): boolean {
    return this.outputMode === 'midi' || this.outputMode === 'both';
  }

  /**
   * 將當前聲部 (伴奏模式為 Ch 9~16 即 8~15；MIDI 全曲模式為 Ch 1~16 即 0~15) 的 SX920 音色 (MSB/LSB/PC)、
   * 音量 (CC 7)、相位 (CC 10)、殘響 (CC 91)、合唱 (CC 93)、表情 (CC 11) 與彎音歸中同步推播至實體琴
   */
  public syncAllPartsToMidi(options?: { panicFirst?: boolean; resetExpression?: boolean }) {
    if (options?.panicFirst) {
      midiManager.panicAllChannels();
    }
    const startCh = this.isSongMode ? 0 : 8;
    for (let ch = startCh; ch <= 15; ch++) {
      const voice = this.partVoices.get(ch);
      if (voice) {
        midiManager.sendVoiceChange(ch, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
      }
      const isMuted = this.isChannelMuted(ch);
      midiManager.sendControlChange(ch, 7, isMuted ? 0 : this.getEffectiveChannelVolume(ch));
      const expr = options?.resetExpression ? 127 : this.getInitialExpression(ch);
      midiManager.sendControlChange(ch, 11, expr);
      midiManager.sendControlChange(ch, 10, this.getChannelPan(ch));
      midiManager.sendControlChange(ch, 91, this.getChannelReverb(ch));
      midiManager.sendControlChange(ch, 93, this.getChannelChorus(ch));
      midiManager.sendPitchBend(ch, 8192);
    }
  }

  public setOutputMode(mode: PlaybackOutputMode) {
    const prevMidi = this.isMidiEnabled();
    this.outputMode = mode;
    const nextMidi = this.isMidiEnabled();

    if (prevMidi && !nextMidi) {
      midiManager.panicAllChannels();
    } else if (nextMidi) {
      // 切換至 MIDI 或雙模同步時，立即初始化琴端聲部音色、音量、表情與控制器
      this.syncAllPartsToMidi({ panicFirst: false, resetExpression: !this.isPlaying });
    }
  }

  public getOutputMode(): PlaybackOutputMode {
    return this.outputMode;
  }

  public setOnTick(cb: TickCallback) {
    this.onTickCallback = cb;
  }

  public setOnActivity(cb: ChannelActivityCallback) {
    this.onActivityCallback = cb;
  }

  public setOnPlayStateChange(cb: PlayStateCallback | null) {
    this.onPlayStateChangeCallback = cb;
  }

  public setOnEnded(cb: PlayEndedCallback | null) {
    this.onEndedCallback = cb;
  }

  public setChannelMute(channel: number, mute: boolean) {
    if (mute) {
      this.mutedChannels.add(channel);
    } else {
      this.mutedChannels.delete(channel);
    }

    if (this.isMidiEnabled()) {
      const effectiveMute = this.isChannelMuted(channel);
      midiManager.sendControlChange(channel, 7, effectiveMute ? 0 : this.getEffectiveChannelVolume(channel));
      if (effectiveMute) {
        midiManager.silenceChannel(channel);
      }
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
    if (this.isMidiEnabled()) {
      const startCh = this.isSongMode ? 0 : 8;
      for (let ch = startCh; ch <= 15; ch++) {
        const effectiveMute = this.isChannelMuted(ch);
        midiManager.sendControlChange(ch, 7, effectiveMute ? 0 : this.getEffectiveChannelVolume(ch));
        if (effectiveMute) {
          midiManager.silenceChannel(ch);
        }
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
    const startCh = this.isSongMode ? 0 : 8;
    for (let ch = startCh; ch <= 15; ch++) {
      const effVol = this.getEffectiveChannelVolume(ch);
      const synth = this.chordSynths.get(ch);
      if (synth) synth.setVolume(effVol);
      if (ch === 10) bassSynth.setVolume(effVol);
      if (ch === 8 || ch === 9) drumSynth.setVolume(effVol);
    }
    if (this.isMidiEnabled()) {
      for (let ch = startCh; ch <= 15; ch++) {
        const isMuted = this.isChannelMuted(ch);
        midiManager.sendControlChange(ch, 7, isMuted ? 0 : this.getEffectiveChannelVolume(ch));
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

    if (this.isMidiEnabled()) {
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

    if (this.isMidiEnabled()) {
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
    if (this.isMidiEnabled()) {
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
    if (this.isMidiEnabled()) {
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
      if (this.isWebAudioEnabled()) {
        const synth = this.chordSynths.get(channel);
        if (synth && controller === 11) {
          synth.setExpression(clamped);
        }
      }
      if (this.isMidiEnabled()) {
        midiManager.sendControlChange(channel, controller, clamped);
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

    this.isSongMode = false;
    this.currentSection = target;

    // 智慧段落判斷 (Smart Progression Suspend)：
    // 若為 Intro 或 Ending，且使用者開啟了自動輪播，則自動掛起保護原曲旋律
    if (isIntroOrEndingSection(target.name)) {
      if (this.chordAutoAdvance) {
        this.isProgressionSuspended = true;
      }
    } else {
      // 切換回 Main、Fill In、Break 等段落時，自動解除掛起恢復輪播
      this.isProgressionSuspended = false;
    }
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

    // 組合 CC 控制器事件流 (含 CC 11 表情、CC 1 顫音、CC 64 延音踏板、CC 10 相位、CC 91 殘響、CC 93 合唱) 與 Pitch Bend 彎音事件流
    const rawCCEvents: PlaybackCCEvent[] = [];
    const rawPitchBendEvents: PlaybackPitchBendEvent[] = [];
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
        } else if (ev.type === 'pitchBend' && ev.value !== undefined) {
          const srcCh = ev.channel ?? 0;
          const destCh = resolveDestChannel(srcCh);

          if (destCh < 8 || destCh > 15) continue;
          if (!this.parsed?.hasCasm && srcCh < 8 && destPartsWithSff2.has(destCh)) continue;

          rawPitchBendEvents.push({
            relTick: item.absTick - startTick,
            channel: destCh,
            sourceChannel: srcCh,
            value: ev.value,
          });
        }
      }
    }
    rawCCEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionCCEvents = rawCCEvents;
    this.sectionCCEvents = this.filterActiveCCForChord(rawCCEvents, this.auditionChord);

    rawPitchBendEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionPitchBendEvents = rawPitchBendEvents;
    this.sectionPitchBendEvents = this.filterActivePitchBendForChord(rawPitchBendEvents, this.auditionChord);

    // 緩存當前段落原始音色快照 (供和弦動態切換時完整重算 CASM 音色)
    this.currentSectionRawVoices = {};
    for (const [k, v] of Object.entries(rawVoices)) {
      this.currentSectionRawVoices[Number(k)] = { ...v };
    }

    // 6. 依段落 CASM 路由更新聲部音量與音色
    this.setupSectionMixing(casmSecMap);
    this.setupPartVoices(rawVoices, casmSecMap);

    // 若目前已處於 MIDI 或雙模模式且尚未進入 play()，先行將新段落 8 聲部音色與混音同步至琴端
    if (!wasPlaying && this.isMidiEnabled()) {
      this.syncAllPartsToMidi({ panicFirst: false, resetExpression: true });
    }

    if (wasPlaying) this.play();
    return true;
  }

  /**
   * 載入標準 MIDI 音樂檔 (.mid) 全曲或指定小節區間之 16 通道原曲原調直通播放模式
   * - 不會向 parsed.sections 寫入任何假段落 (如 Main A / Intro A)
   * - 保留全部 16 通道 (CH 1 ~ CH 16, 0-based 0~15) 原始通道配置與音高，不套用 CASM 和弦轉調
   * - 支援設定任意播放起訖小節區間 (startBar ~ endBar, 1-based)
   */
  public loadSongMode(startBar: number = 1, endBar?: number): boolean {
    if (!this.parsed) return false;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();

    this.isSongMode = true;
    this.isProgressionSuspended = true; // 原曲模式停用 CASM 和弦輪播

    const division = this.parsed.division || 480;
    const num = this.parsed.timeSignature.numerator || 4;
    const den = this.parsed.timeSignature.denominator || 4;
    const ticksPerBar = Math.max(1, Math.round(division * num * (4 / den)));

    // 1. 展平全曲所有軌道事件並計算總小節數
    interface FlatEvent {
      absTick: number;
      delta: number;
      ev: MidiEvent;
    }
    const flatEvents: FlatEvent[] = [];
    let maxNoteTick = 0;
    let maxAnyTick = 0;
    for (const trk of this.parsed.tracks) {
      let cur = 0;
      for (const ev of trk.events) {
        cur += ev.delta;
        if (cur > maxAnyTick) maxAnyTick = cur;
        if (ev.type === 'noteOn' || ev.type === 'noteOff') {
          if (cur > maxNoteTick) maxNoteTick = cur;
        }
        flatEvents.push({ absTick: cur, delta: ev.delta, ev });
      }
    }
    flatEvents.sort((a, b) => a.absTick - b.absTick);

    const effectiveEndTick = maxNoteTick > 0 ? maxNoteTick : maxAnyTick;
    this.songTotalBars = Math.max(1, Math.ceil(Math.max(1, effectiveEndTick) / ticksPerBar));
    this.songStartBar = Math.max(1, Math.min(this.songTotalBars, Math.round(startBar)));
    this.songEndBar = endBar !== undefined
      ? Math.max(this.songStartBar, Math.min(this.songTotalBars, Math.round(endBar)))
      : this.songTotalBars;

    const startTick = (this.songStartBar - 1) * ticksPerBar;
    const endTick = this.songEndBar * ticksPerBar;
    this.totalSectionTicks = Math.max(ticksPerBar, endTick - startTick);
    this.totalBars = this.songEndBar - this.songStartBar + 1;

    // 內部虛擬播放視窗定位 (不寫入 parsed.sections)
    this.currentSection = {
      name: '__MIDI_SONG__',
      startTick,
      endTick,
      measureCount: this.totalBars,
    };

    // 2. 收集 16 通道音色與混音控制器 (截至 endTick 前的有效設定，以 startTick 前或曲首為主)
    const rawVoices: Record<number, { msb: number; lsb: number; pc: number }> = {};
    const rawVolumes: Record<number, number> = {};
    const rawPans: Record<number, number> = {};
    const rawReverbs: Record<number, number> = {};
    const rawChoruses: Record<number, number> = {};

    for (const p of this.parsed.parts) {
      const ch = p.channel;
      if (p.programChange !== undefined || p.bankMsb !== undefined) {
        rawVoices[ch] = {
          msb: p.bankMsb ?? (ch === 9 ? 127 : 0),
          lsb: p.bankLsb ?? 0,
          pc: p.programChange ?? 0,
        };
      }
      if (p.volume !== undefined) rawVolumes[ch] = p.volume;
      if (p.pan !== undefined) rawPans[ch] = p.pan;
      if (p.reverb !== undefined) rawReverbs[ch] = p.reverb;
      if (p.chorus !== undefined) rawChoruses[ch] = p.chorus;
    }

    for (const item of flatEvents) {
      if (item.absTick <= startTick) {
        const ev = item.ev;
        const ch = ev.channel;
        if (ch !== undefined && ch >= 0 && ch <= 15) {
          if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
            if (ev.controller === 0) {
              if (!rawVoices[ch]) rawVoices[ch] = { msb: ev.value, lsb: 0, pc: 0 };
              else rawVoices[ch].msb = ev.value;
            } else if (ev.controller === 32) {
              if (!rawVoices[ch]) rawVoices[ch] = { msb: ch === 9 ? 127 : 0, lsb: ev.value, pc: 0 };
              else rawVoices[ch].lsb = ev.value;
            } else if (ev.controller === 7) rawVolumes[ch] = ev.value;
            else if (ev.controller === 10) rawPans[ch] = ev.value;
            else if (ev.controller === 91) rawReverbs[ch] = ev.value;
            else if (ev.controller === 93) rawChoruses[ch] = ev.value;
          } else if (ev.type === 'programChange' && ev.program !== undefined) {
            if (!rawVoices[ch]) rawVoices[ch] = { msb: ch === 9 ? 127 : 0, lsb: 0, pc: ev.program };
            else rawVoices[ch].pc = ev.program;
          }
        }
      }
    }

    // 2b. 若特定通道在 startTick 前尚無音色設定 (例如音符自第 4 小節才進來，PC 設定在第 4 小節或音符處)，
    //     向後尋找該通道全曲的第一個音色事件，確保切片播放時正確發送該軌音色，絕不退回預設鋼琴
    for (let ch = 0; ch < 16; ch++) {
      if (!rawVoices[ch] || rawVoices[ch].pc === undefined) {
        for (const item of flatEvents) {
          const ev = item.ev;
          if (ev.channel === ch) {
            if (ev.type === "controlChange" && ev.controller !== undefined && ev.value !== undefined) {
              if (ev.controller === 0) {
                if (!rawVoices[ch]) rawVoices[ch] = { msb: ev.value, lsb: 0, pc: 0 };
                else rawVoices[ch].msb = ev.value;
              } else if (ev.controller === 32) {
                if (!rawVoices[ch]) rawVoices[ch] = { msb: ch === 9 ? 127 : 0, lsb: ev.value, pc: 0 };
                else rawVoices[ch].lsb = ev.value;
              }
            } else if (ev.type === "programChange" && ev.program !== undefined) {
              if (!rawVoices[ch]) rawVoices[ch] = { msb: ch === 9 ? 127 : 0, lsb: 0, pc: ev.program };
              else rawVoices[ch].pc = ev.program;
              break;
            }
          }
        }
      }
    }

    // 3. 萃取 [startTick, endTick) 區間內的 16 通道 NoteOn / NoteOff 事件 (1:1 原通道直通)
    const rawNoteEvents: PlaybackNoteEvent[] = [];
    const noteOnMap: Map<string, { absTick: number; ev: MidiEvent; ch: number }> = new Map();

    for (const item of flatEvents) {
      if (item.absTick < startTick || item.absTick >= endTick) continue;
      const { absTick, ev } = item;
      if (ev.type !== 'noteOn' && ev.type !== 'noteOff') continue;

      const ch = ev.channel ?? 0;
      const note = ev.noteNumber ?? 0;
      const key = `${ch}_${note}`;

      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        if (noteOnMap.has(key)) {
          const prev = noteOnMap.get(key)!;
          const durTicks = Math.max(24, absTick - prev.absTick);
          rawNoteEvents.push({
            relTick: prev.absTick - startTick,
            channel: ch,
            sourceChannel: ch,
            noteNumber: note,
            velocity: prev.ev.velocity ?? 100,
            durationTicks: durTicks,
            durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
          });
        }
        noteOnMap.set(key, { absTick, ev, ch });
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) {
        if (noteOnMap.has(key)) {
          const prev = noteOnMap.get(key)!;
          const durTicks = Math.max(24, absTick - prev.absTick);
          rawNoteEvents.push({
            relTick: prev.absTick - startTick,
            channel: ch,
            sourceChannel: ch,
            noteNumber: note,
            velocity: prev.ev.velocity ?? 100,
            durationTicks: durTicks,
            durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
          });
          noteOnMap.delete(key);
        }
      }
    }

    noteOnMap.forEach((prev) => {
      const note = prev.ev.noteNumber ?? 0;
      const durTicks = Math.min(ticksPerBar, Math.max(48, endTick - prev.absTick));
      rawNoteEvents.push({
        relTick: prev.absTick - startTick,
        channel: prev.ch,
        sourceChannel: prev.ch,
        noteNumber: note,
        velocity: prev.ev.velocity ?? 100,
        durationTicks: durTicks,
        durationMs: (durTicks / division) * (60 / this.bpm) * 1000,
      });
    });

    rawNoteEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionEvents = rawNoteEvents;
    this.sectionEvents = [...rawNoteEvents];

    // 4. 萃取 [startTick, endTick) 區間內的 16 通道 CC 與 PitchBend 事件
    const rawCCEvents: PlaybackCCEvent[] = [];
    const rawPitchBendEvents: PlaybackPitchBendEvent[] = [];
    for (const item of flatEvents) {
      if (item.absTick < startTick || item.absTick >= endTick) continue;
      const ev = item.ev;
      const ch = ev.channel ?? 0;
      if (ch < 0 || ch > 15) continue;

      if (ev.type === 'controlChange' && ev.controller !== undefined && ev.value !== undefined) {
        if (ev.controller === 0 || ev.controller === 32) continue;
        rawCCEvents.push({
          relTick: item.absTick - startTick,
          channel: ch,
          sourceChannel: ch,
          controller: ev.controller,
          value: ev.value,
        });
      } else if (ev.type === 'pitchBend' && ev.value !== undefined) {
        rawPitchBendEvents.push({
          relTick: item.absTick - startTick,
          channel: ch,
          sourceChannel: ch,
          value: ev.value,
        });
      }
    }

    rawCCEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionCCEvents = rawCCEvents;
    this.sectionCCEvents = [...rawCCEvents];

    rawPitchBendEvents.sort((a, b) => a.relTick - b.relTick);
    this.rawSectionPitchBendEvents = rawPitchBendEvents;
    this.sectionPitchBendEvents = [...rawPitchBendEvents];

    // 5. 設定全 16 通道音色與混音器狀態
    this.partVoices.clear();
    for (let ch = 0; ch <= 15; ch++) {
      const vol = rawVolumes[ch] ?? 100;
      const pan = rawPans[ch] ?? 64;
      const rev = rawReverbs[ch] ?? 40;
      const cho = rawChoruses[ch] ?? 0;
      this.channelVolumes.set(ch, vol);
      this.channelPans.set(ch, pan);
      this.channelReverbs.set(ch, rev);
      this.channelChoruses.set(ch, cho);

      if (this.customVoiceOverrides.has(ch)) {
        const customVoice = this.customVoiceOverrides.get(ch)!;
        const name = customVoice.chineseName ? `${customVoice.name} (${customVoice.chineseName})` : customVoice.name;
        const panelCode = `${customVoice.msb}-${customVoice.lsb}-${customVoice.pc + 1}`;
        this.partVoices.set(ch, {
          channel: ch,
          msb: customVoice.msb,
          lsb: customVoice.lsb,
          pc: customVoice.pc,
          rawMsb: customVoice.msb,
          rawLsb: customVoice.lsb,
          rawPc: customVoice.pc,
          isLegacyAlias: false,
          panelCode,
          formattedDisplayWithCode: `${name} [${panelCode}]`,
          voiceName: name,
          category: customVoice.category,
        });
        const synth = this.chordSynths.get(ch);
        if (synth) {
          synth.setVoice({ category: customVoice.category, id: customVoice.id, name: customVoice.name });
          synth.setVolume(this.getEffectiveChannelVolume(ch));
          synth.setPan(pan);
          synth.setReverb(rev);
          synth.setChorus(cho);
        }
        continue;
      }

      const rv = rawVoices[ch] || { msb: ch === 9 ? 127 : 0, lsb: 0, pc: 0 };
      const lookupMsb = (ch === 9 && rv.msb === 0) ? 127 : rv.msb;
      const resolved = resolveYamahaVoiceWithAlias(lookupMsb, rv.lsb, rv.pc);
      const isDrum = ch === 9 || lookupMsb === 127 || lookupMsb === 126 || resolved.voice?.category === 'Drums';
      const category = isDrum ? 'Drums' : (resolved.voice?.category || 'Piano');

      this.partVoices.set(ch, {
        channel: ch,
        msb: resolved.msb,
        lsb: resolved.lsb,
        pc: resolved.pc,
        rawMsb: rv.msb,
        rawLsb: rv.lsb,
        rawPc: rv.pc,
        isLegacyAlias: resolved.isLegacyAlias,
        legacyCodeLabel: resolved.legacyCodeLabel,
        panelCode: resolved.panelCode,
        formattedDisplayWithCode: resolved.formattedDisplayWithCode,
        voiceName: resolved.voiceName,
        category,
      });

      const synth = this.chordSynths.get(ch);
      if (synth) {
        synth.setVoice({ category, id: resolved.voice?.id, name: resolved.voiceName });
        synth.setVolume(this.getEffectiveChannelVolume(ch));
        synth.setPan(pan);
        synth.setReverb(rev);
        synth.setChorus(cho);
      }
      if (category === 'Bass') {
        bassSynth.setVolume(this.getEffectiveChannelVolume(ch));
        bassSynth.setPan(pan);
        bassSynth.setReverb(rev);
        bassSynth.setChorus(cho);
      }
      if (isDrum) {
        drumSynth.setVolume(this.getEffectiveChannelVolume(ch));
        drumSynth.setPan(pan);
        drumSynth.setReverb(rev);
        drumSynth.setChorus(cho);
      }
    }

    if (!wasPlaying && this.isMidiEnabled()) {
      this.syncAllPartsToMidi({ panicFirst: false, resetExpression: true });
    }

    if (wasPlaying) this.play();
    return true;
  }

  public getSectionCCEvents(): PlaybackCCEvent[] {
    return this.sectionCCEvents;
  }

  public getSectionPitchBendEvents(): PlaybackPitchBendEvent[] {
    return this.sectionPitchBendEvents;
  }

  public getChannelPitchBendEvents(channel: number): PlaybackPitchBendEvent[] {
    return this.sectionPitchBendEvents.filter(e => e.channel === channel);
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
    if (!this.parsed || this.isSongMode) return destCh;

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

  private filterActivePitchBendForChord(pbEvents: PlaybackPitchBendEvent[], chord: ChordDefinition): PlaybackPitchBendEvent[] {
    return pbEvents.filter(e => {
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
        const panelCode = `${customVoice.msb}-${customVoice.lsb}-${customVoice.pc + 1}`;
        const info: PartVoiceInfo = {
          channel: destCh,
          msb: customVoice.msb,
          lsb: customVoice.lsb,
          pc: customVoice.pc,
          rawMsb: customVoice.msb,
          rawLsb: customVoice.lsb,
          rawPc: customVoice.pc,
          isLegacyAlias: false,
          panelCode,
          formattedDisplayWithCode: `${name} [${panelCode}]`,
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
      const resolved = resolveYamahaVoiceWithAlias(v.msb, v.lsb, v.pc);
      const name = resolved.voiceName;
      const category = resolved.voice?.category || this.inferCategoryByChannel(destCh);

      const info: PartVoiceInfo = {
        channel: destCh,
        msb: resolved.msb,
        lsb: resolved.lsb,
        pc: resolved.pc,
        rawMsb: resolved.rawMsb,
        rawLsb: resolved.rawLsb,
        rawPc: resolved.rawPc,
        isLegacyAlias: resolved.isLegacyAlias,
        legacyCodeLabel: resolved.legacyCodeLabel,
        panelCode: resolved.panelCode,
        formattedDisplayWithCode: resolved.formattedDisplayWithCode,
        voiceName: name,
        category,
      };
      this.partVoices.set(destCh, info);

      // 設定該聲部專屬合成器之音色類別
      const synth = this.chordSynths.get(destCh);
      if (synth) {
        synth.setVoice({ category, id: resolved.voice?.id, name });
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
   * 即時單音試聽 (支援 Web Audio、PSR-SX920 Web MIDI 與雙模同步發聲)
   */
  public previewNote(channel: number, note: number, velocity: number = 100, durMs: number = 250) {
    if (this.isMidiEnabled()) {
      midiManager.sendNoteOn(channel, note, velocity);
      setTimeout(() => midiManager.sendNoteOff(channel, note), durMs);
    }
    if (this.isWebAudioEnabled()) {
      const isDrum = this.isChannelDrum(channel);
      const isBass = (!this.isSongMode && channel === 10) || (this.isSongMode && this.partVoices.get(channel)?.category === 'Bass');
      if (isDrum) {
        drumSynth.playNote(note, velocity);
      } else if (isBass) {
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
    const panelCode = `${voice.msb}-${voice.lsb}-${voice.pc + 1}`;
    const info: PartVoiceInfo = {
      channel,
      msb: voice.msb,
      lsb: voice.lsb,
      pc: voice.pc,
      rawMsb: voice.msb,
      rawLsb: voice.lsb,
      rawPc: voice.pc,
      isLegacyAlias: false,
      panelCode,
      formattedDisplayWithCode: `${name} [${panelCode}]`,
      voiceName: name,
      category: voice.category,
    };
    this.partVoices.set(channel, info);

    // 1. 若處於 Web MIDI 或雙模輸出模式，向實體琴發送 Bank Select 與 Program Change
    if (this.isMidiEnabled()) {
      midiManager.sendVoiceChange(channel, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
    }

    // 2. 通知該軌道專屬軟體合成器切換樂器模型
    const synth = this.chordSynths.get(channel);
    if (synth) {
      synth.setVoice({ category: voice.category, id: voice.id, name: voice.name });
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

    if (this.isMidiEnabled()) {
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
    this.stop(false);

    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.isPlaying = true;
    if (this.onPlayStateChangeCallback) {
      this.onPlayStateChangeCallback(true);
    }

    // 初始化 Web Audio 軟體音源表情
    const startCh = this.isSongMode ? 0 : 8;
    for (let ch = startCh; ch <= 15; ch++) {
      const initExpr = this.getInitialExpression(ch);
      const synth = this.chordSynths.get(ch);
      if (synth) synth.setExpression(initExpr);
    }

    // 若啟用 MIDI 輸出 (midi 或 both)，初始化琴端聲部音色、音量、表情、空間效果與彎音歸中
    if (this.isMidiEnabled()) {
      this.syncAllPartsToMidi({ panicFirst: true, resetExpression: false });
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
          if (this.onEndedCallback) {
            this.onEndedCallback();
          }
          return;
        }
      }

      const loopCurrentTick = (currentAbsoluteTick % this.totalSectionTicks);
      const windowEndTick = loopCurrentTick + (lookaheadWindowSec * ticksPerSec);

      // 1. 排程 CC 控制器事件 (如 CC 11 Expression 漸強漸弱曲線、CC 1 顫音、CC 64 延音等)
      for (const ccEvent of this.rawSectionCCEvents) {
        const evTick = ccEvent.relTick;
        if (evTick > this.lastScheduledTick && evTick <= windowEndTick) {
          if (!this.isSongMode) {
            const currentChord = this.getChordForTick(evTick);
            const activeSrcCh = this.getActiveSourceChannel(ccEvent.channel, currentChord);
            if (activeSrcCh !== undefined && ccEvent.sourceChannel !== activeSrcCh) {
              continue;
            }
          }

          const eventAudioTime = this.playbackStartAudioTime + (evTick / ticksPerSec);
          if (this.isMidiEnabled()) {
            const deltaMs = Math.max(0, (eventAudioTime - nowAudioTime) * 1000);
            const midiTimestamp = performance.now() + deltaMs;
            midiManager.sendControlChange(ccEvent.channel, ccEvent.controller, ccEvent.value, midiTimestamp);
          }
          if (this.isWebAudioEnabled()) {
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
            if (ccEvent.channel === 10 || (this.isSongMode && this.partVoices.get(ccEvent.channel)?.category === 'Bass')) {
              if (ccEvent.controller === 7) bassSynth.setVolume(ccEvent.value);
              else if (ccEvent.controller === 10) bassSynth.setPan(ccEvent.value);
              else if (ccEvent.controller === 91) bassSynth.setReverb(ccEvent.value);
              else if (ccEvent.controller === 93) bassSynth.setChorus(ccEvent.value);
            }
            if (this.isChannelDrum(ccEvent.channel)) {
              if (ccEvent.controller === 7) drumSynth.setVolume(ccEvent.value);
              else if (ccEvent.controller === 10) drumSynth.setPan(ccEvent.value);
              else if (ccEvent.controller === 91) drumSynth.setReverb(ccEvent.value);
              else if (ccEvent.controller === 93) drumSynth.setChorus(ccEvent.value);
            }
          }
        }
      }

      // 1b. 排程 Pitch Bend 彎音輪事件 (展現 PSR-SX920 吉他推弦、薩克斯風滑音與貝斯滑音真實表現力)
      if (this.isMidiEnabled() && this.rawSectionPitchBendEvents.length > 0) {
        for (const pbEvent of this.rawSectionPitchBendEvents) {
          const evTick = pbEvent.relTick;
          if (evTick > this.lastScheduledTick && evTick <= windowEndTick) {
            if (this.isChannelMuted(pbEvent.channel)) continue;
            if (!this.isSongMode) {
              const currentChord = this.getChordForTick(evTick);
              const activeSrcCh = this.getActiveSourceChannel(pbEvent.channel, currentChord);
              if (activeSrcCh !== undefined && pbEvent.sourceChannel !== activeSrcCh) {
                continue;
              }
            }
            const eventAudioTime = this.playbackStartAudioTime + (evTick / ticksPerSec);
            const deltaMs = Math.max(0, (eventAudioTime - nowAudioTime) * 1000);
            const midiTimestamp = performance.now() + deltaMs;
            midiManager.sendPitchBend(pbEvent.channel, pbEvent.value, midiTimestamp);
          }
        }
      }

      // 2. 排程 [lastScheduledTick + 1, windowEndTick] 範圍內的音符
      this.activeChannelsInWindow.clear();

      for (const event of this.rawSectionEvents) {
        const evTick = event.relTick;
        // 檢查音符是否落在當前預排視窗中
        if (evTick > this.lastScheduledTick && evTick <= windowEndTick) {
          // 聲部靜音檢查
          if (this.isChannelMuted(event.channel)) continue;

          const currentChord = this.getChordForTick(evTick);

          if (!this.isSongMode) {
            // ★ CASM 多軌和弦動態仲裁 (Multi-Track Chord Dynamic Arbitration) ★
            const activeSrcCh = this.getActiveSourceChannel(event.channel, currentChord);
            if (activeSrcCh === undefined || event.sourceChannel !== activeSrcCh) {
              continue;
            }
          }

          // 計算發聲精確音訊時間
          const eventAudioTime = this.playbackStartAudioTime + (evTick / ticksPerSec);
          const durSec = (event.durationTicks / division) * (60 / this.bpm);
          const durMs = durSec * 1000;

          this.activeChannelsInWindow.add(event.channel);

          const isDrum = this.isChannelDrum(event.channel);
          let noteToPlay = event.noteNumber;

          if (!this.isSongMode && !isDrum) {
            const isMega = this.isChannelMegaVoice(event.channel);
            const activeCasm = this.getActiveCasmEntry(event.channel, currentChord);
            const ntr = activeCasm?.ntr;
            const ntt = activeCasm?.ntt;
            const sourceChordType = activeCasm?.chordType;
            const hiKey = activeCasm?.hiKey;
            const lowLimit = activeCasm?.lowLimit ?? 0;
            const highLimit = activeCasm?.highLimit ?? 127;

            noteToPlay = ChordTransposer.transposeSingleNote(
              event.noteNumber,
              currentChord,
              event.channel,
              isDrum,
              lowLimit,
              highLimit,
              ntr,
              ntt,
              sourceChordType,
              isMega,
              hiKey
            );
          }

          if (this.isWebAudioEnabled()) {
            const effVol = this.getEffectiveChannelVolume(event.channel);
            const scaledVel = Math.round(event.velocity * (effVol / 127));
            if (scaledVel > 0) {
              this.playWebAudioNote(event.channel, noteToPlay, scaledVel, durMs, eventAudioTime);
            }
          }
          if (this.isMidiEnabled()) {
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
      const rawTick = elapsedSec * ticksPerSec;

      if (!this.isLooping && rawTick >= this.totalSectionTicks) {
        // 單次播放已達結尾，避免取模產生 Bar 1 抖動與數值回捲
        this.stop();
        if (this.onEndedCallback) {
          this.onEndedCallback();
        }
        return;
      }

      const curTick = rawTick % this.totalSectionTicks;

      const relBar = Math.floor(curTick / ticksPerBar) + 1;
      const displayBar = this.isSongMode ? (this.songStartBar - 1 + relBar) : relBar;
      const displayTotalBars = this.isSongMode ? this.songEndBar : this.totalBars;
      const beatInBar = (curTick % ticksPerBar) / ticksPerBeat + 1;

      const barIndex0 = relBar - 1;
      if (!this.isSongMode && this.isEffectiveChordAutoAdvance() && this.activeProgressionBar !== barIndex0) {
        this.activeProgressionBar = barIndex0;
        const currentProgChord = this.getChordForBar(barIndex0);
        if (this.onProgressionBarChangeCallback) {
          this.onProgressionBarChangeCallback(barIndex0, currentProgChord);
        }
      }

      if (this.onTickCallback) {
        this.onTickCallback(displayBar, parseFloat(beatInBar.toFixed(1)), Math.round(curTick), displayTotalBars);
      }
      if (this.onActivityCallback && this.activeChannelsInWindow.size > 0) {
        this.onActivityCallback(new Set(this.activeChannelsInWindow));
      }

      if (typeof requestAnimationFrame !== 'undefined') { this.rafId = requestAnimationFrame(renderTick); }
    };

    if (typeof requestAnimationFrame !== 'undefined') { this.rafId = requestAnimationFrame(renderTick); }
  }

  public pause() {
    this.stop();
  }

  public stop(notify: boolean = true) {
    const wasPlaying = this.isPlaying;
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
    if (this.activeProgressionBar !== -1) {
      this.activeProgressionBar = -1;
      if (this.onProgressionBarChangeCallback) {
        this.onProgressionBarChangeCallback(-1, this.auditionChord);
      }
    }
    if (this.isMidiEnabled()) {
      midiManager.panicAllChannels();
      // 恢復所有通道 CC 11 表情為 127，避免實體琴手動彈奏時發音偏小
      const startCh = this.isSongMode ? 0 : 8;
      for (let ch = startCh; ch <= 15; ch++) {
        midiManager.sendControlChange(ch, 11, 127);
      }
    }
    if (notify && wasPlaying && this.onPlayStateChangeCallback) {
      this.onPlayStateChangeCallback(false);
    }
  }

  public setAuditionChord(chord: ChordDefinition) {
    if (this.isSongMode) {
      this.auditionChord = chord;
      if (this.onChordChangeCallback) {
        this.onChordChangeCallback(chord);
      }
      return;
    }
    const prevVoices = new Map<number, PartVoiceInfo>(this.partVoices);
    const prevVols = new Map<number, number>(this.channelVolumes);
    const prevPans = new Map<number, number>(this.channelPans);
    const prevActiveSources = new Map<number, number | undefined>();
    for (let ch = 8; ch <= 15; ch++) {
      prevActiveSources.set(ch, this.getActiveSourceChannel(ch, this.auditionChord));
    }

    this.auditionChord = chord;
    this.sectionEvents = this.filterActiveEventsForChord(this.rawSectionEvents, chord);
    this.sectionCCEvents = this.filterActiveCCForChord(this.rawSectionCCEvents, chord);
    this.sectionPitchBendEvents = this.filterActivePitchBendForChord(this.rawSectionPitchBendEvents, chord);

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
      for (const [k, v] of Object.entries(this.currentSectionRawVoices)) {
        rawVoices[Number(k)] = { ...v };
      }
      this.setupPartVoices(rawVoices, casmSecMap);

      // 若處於 MIDI 或雙模模式，當和弦切換引發 CASM 來源音軌切換或音色/混音變動時，即時推播更新至琴端
      if (this.isMidiEnabled()) {
        for (let ch = 8; ch <= 15; ch++) {
          const nextSrc = this.getActiveSourceChannel(ch, chord);
          const srcChanged = prevActiveSources.get(ch) !== nextSrc;
          const oldV = prevVoices.get(ch);
          const newV = this.partVoices.get(ch);
          if (newV && (srcChanged || !oldV || oldV.msb !== newV.msb || oldV.lsb !== newV.lsb || oldV.pc !== newV.pc)) {
            midiManager.sendVoiceChange(ch, { msb: newV.msb, lsb: newV.lsb, pc: newV.pc });
          }
          const newVol = this.channelVolumes.get(ch);
          if (srcChanged || newVol !== prevVols.get(ch)) {
            midiManager.sendControlChange(ch, 7, this.isChannelMuted(ch) ? 0 : this.getEffectiveChannelVolume(ch));
          }
          const newPan = this.channelPans.get(ch);
          if (newPan !== undefined && (srcChanged || newPan !== prevPans.get(ch))) {
            midiManager.sendControlChange(ch, 10, newPan);
          }
        }
      }
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
    // 使用者手動操作開關時，若在 Intro/Ending 且手動打開，代表使用者明確覆寫要求輪播，解除掛起；若手動關閉亦解除掛起
    if (enabled && isIntroOrEndingSection(this.currentSection?.name)) {
      this.isProgressionSuspended = false;
    } else if (!enabled) {
      this.isProgressionSuspended = false;
    }
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
   * 取得當前是否因 Intro / Ending 處於自動輪播智慧掛起狀態 (原調保護)
   */
  public getIsProgressionSuspended(): boolean {
    return this.isProgressionSuspended;
  }

  /**
   * 取得當前實際生效的自動輪播狀態 (未被掛起且已啟用)
   */
  public getActiveProgressionBar(): number {
    return this.activeProgressionBar;
  }

  public isEffectiveChordAutoAdvance(): boolean {
    return this.chordAutoAdvance && !this.isProgressionSuspended;
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
    if (!this.isEffectiveChordAutoAdvance() || this.chordProgression.length === 0) {
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

    if (this.isMidiEnabled()) {
      midiManager.sendNoteOn(10, bassNote, 85);
      chordNotes.forEach(n => midiManager.sendNoteOn(11, n, 80));
      setTimeout(() => {
        midiManager.sendNoteOff(10, bassNote);
        chordNotes.forEach(n => midiManager.sendNoteOff(11, n));
      }, 350);
    }
    if (this.isWebAudioEnabled()) {
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
    const isBass = (!this.isSongMode && channel === 10) || (this.isSongMode && this.partVoices.get(channel)?.category === 'Bass');
    if (isDrum) {
      // 真實打擊鼓組
      drumSynth.playNote(note, velocity, when);
    } else if (isBass) {
      // 貝斯部 (Bass)
      bassSynth.playNote(note, velocity, durMs, when);
    } else {
      // 和弦、樂句與旋律性通道 (0~15)
      const synth = this.chordSynths.get(channel);
      if (synth) {
        synth.playNote(note, velocity, durMs, when);
      }
    }
  }

  private playMidiNote(channel: number, note: number, velocity: number, durMs: number, when: number, nowAudioTime: number) {
    const deltaMs = Math.max(0, (when - nowAudioTime) * 1000);
    const midiTimestamp = performance.now() + deltaMs;

    midiManager.sendNoteOn(channel, note, velocity, midiTimestamp);
    midiManager.sendNoteOff(channel, note, midiTimestamp + durMs);
  }
}

export const styPlaybackEngine = new StyPlaybackEngine();
