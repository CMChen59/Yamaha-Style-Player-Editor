/**
 * Yamaha PSR-SX920 Style & Pad Web Audio Audition Engine
 * 提供瀏覽器端即時發聲、多軌合成器、音符排程與走帶監聽
 */

import { midiManager } from './midi-manager';

export interface NoteEvent {
  note: number;
  velocity: number;
  startTick: number;
  durationTick: number;
}

export interface ChannelAudioParams {
  volume?: number;       // 0 ~ 127 (CC 7)
  pan?: number;          // 0 ~ 127, 64 is center (CC 10)
  reverb?: number;       // 0 ~ 127 (CC 91)
  chorus?: number;       // 0 ~ 127 (CC 93)
  instrumentId?: string; // 預設樂器 ID (例如 'grand-piano', 'strings', 'pizzicato')
  msb?: number;          // Bank MSB (CC 0)
  lsb?: number;          // Bank LSB (CC 32)
  pc?: number;           // Program Change 0 ~ 127
  channel?: number;      // MIDI 通道 0 ~ 15
  isDrum?: boolean;      // 是否為打擊樂軌道 (Channel 10)
}

export interface PlaybackOptions {
  bpm: number;           // 每分鐘拍數 (預設 120)
  division: number;      // PPQ (預設 96)
  beatsPerBar?: number;  // 每小節拍數 (預設 4)
  loop: boolean;         // 是否循環播放 (對應 Yamaha Repeat 屬性)
  gridStartTick: number; // 小節起點基準 Tick
  totalTicks: number;    // 總播放長度 (小節數 * 每小節 Tick 數)
  channelParams?: ChannelAudioParams;
  startOffsetTick?: number; // 支援自指定 Tick / 小節起跳播放
  onProgress?: (state: PlaybackState) => void;
  onEnded?: () => void;
}

export interface PlaybackState {
  currentTick: number;
  relTick: number;
  currentBar: number;
  currentBeat: number;
  progress: number;      // 0.0 ~ 1.0
  activeNoteNumbers: number[];
}

/**
 * 2.8-A 疊錄伴奏監聽音軌項目 (Backing Track Item)
 */
export interface BackingTrackItem {
  padNum: number;
  notes: NoteEvent[];
  channelParams?: ChannelAudioParams;
  totalTicks?: number;
}

/**
 * 2.8-A 疊錄伴奏播放配置 (Backing Track Options)
 */
export interface BackingTrackOptions {
  bpm: number;
  division?: number;
  volumeRatio?: number; // 0.0 ~ 1.0 (預設 0.6)
  loop?: boolean;
  beatsPerBar?: number;
  startOffsetTick?: number; // 支援自指定 Tick / 小節起跳播放
  enableActiveNotesDetection?: boolean; // 預設 true；全曲長篇播放可設為 false 避免高頻暴力掃描
  onProgress?: (state: PlaybackState) => void;
  onEnded?: () => void;
}

/**
 * 將 MIDI 音符編號轉換為頻率 (Hz)
 * A4 (69) = 440 Hz
 */
export function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * 計算 Tick 與秒數的互相換算
 */
export function ticksToSeconds(ticks: number, bpm: number, division: number): number {
  const secondsPerBeat = 60 / Math.max(1, bpm);
  return (ticks / Math.max(1, division)) * secondsPerBeat;
}

export function secondsToTicks(seconds: number, bpm: number, division: number): number {
  const secondsPerBeat = 60 / Math.max(1, bpm);
  return (seconds / secondsPerBeat) * division;
}

/**
 * 簡易脈衝殘響 (Impulse Response) 緩衝區生成
 */
function createReverbBuffer(ctx: AudioContext, duration: number = 1.2, decay: number = 2.0): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let c = 0; c < 2; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const n = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      channelData[i] = n;
    }
  }
  return buffer;
}

interface ActiveVoiceHandle {
  endTime: number;
  isDrum: boolean;
  stop: (time: number) => void;
  cleanup: () => void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private convolver: ConvolverNode | null = null;
  private chorusInput: GainNode | null = null;
  private isInitialized = false;

  // 播放走帶狀態
  private isCurrentlyPlaying = false;
  private currentPadNum: number | null = null;
  private animFrameId: number | null = null;
  private playbackStartTime: number = 0;
  private playbackOptions: PlaybackOptions | null = null;
  private scheduledNotes: NoteEvent[] = [];
  private activeVoices: ActiveVoiceHandle[] = [];

  // 防聲音重疊與排程隔離機制
  private playbackSessionId = 0;
  private scheduledTimerIds: any[] = [];
  private currentPadGain: GainNode | null = null;
  private activeOscillators: Set<OscillatorNode | AudioBufferSourceNode> = new Set();

  // 2.8-A 疊錄伴奏音軌專用匯流排與狀態
  private backingGain: GainNode | null = null;
  private backingTimerIds: any[] = [];
  private backingPlaybackSessionId: number = 0;
  private isBackingPlaying: boolean = false;
  private backingStartTime: number = 0;
  private activeBackingVoices: ActiveVoiceHandle[] = [];
  private backingVolume: number = 0.6;
  private backingAnimFrameId: number | null = null;

  private createOscillator(): OscillatorNode {
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const osc = this.ctx.createOscillator();
    this.activeOscillators.add(osc);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      this.activeOscillators.delete(osc);
    };
    return osc;
  }

  private createBufferSource(): AudioBufferSourceNode {
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const src = this.ctx.createBufferSource();
    this.activeOscillators.add(src);
    src.onended = () => {
      try { src.disconnect(); } catch {}
      this.activeOscillators.delete(src);
    };
    return src;
  }

  constructor() {
    // 延遲在使用者第一次互動時初始化 Web Audio
  }

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    
    // 主音量與動態壓縮器（防止破音）
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    // 建立輕量立體聲空間混響
    try {
      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = createReverbBuffer(this.ctx, 1.2, 2.5);
    } catch {
      this.convolver = null;
    }

    // 混音主幹線連接：混響
    if (this.convolver) {
      const reverbGain = this.ctx.createGain();
      reverbGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.convolver.connect(reverbGain);
      reverbGain.connect(this.compressor);
    }

    // 2.8-C: 建立輕量立體聲合唱效果器 (CC 93: Stereo Chorus Modulated Delay)
    try {
      this.chorusInput = this.ctx.createGain();

      // 建立左右聲道微延遲 (Delay Lines: L=24ms, R=31ms)
      const delayL = this.ctx.createDelay();
      delayL.delayTime.setValueAtTime(0.024, this.ctx.currentTime);
      const delayR = this.ctx.createDelay();
      delayR.delayTime.setValueAtTime(0.031, this.ctx.currentTime);

      // 建立雙路低頻震盪器 (LFO: ~1.2Hz 與 ~1.5Hz)，進行微頻率失諧震盪 (Chorus Shimmer)
      const lfoL = this.ctx.createOscillator();
      lfoL.type = 'sine';
      lfoL.frequency.setValueAtTime(1.2, this.ctx.currentTime);
      const lfoGainL = this.ctx.createGain();
      lfoGainL.gain.setValueAtTime(0.0025, this.ctx.currentTime); // ~2.5ms 延遲調變深度
      lfoL.connect(lfoGainL);
      lfoGainL.connect(delayL.delayTime);

      const lfoR = this.ctx.createOscillator();
      lfoR.type = 'sine';
      lfoR.frequency.setValueAtTime(1.5, this.ctx.currentTime);
      const lfoGainR = this.ctx.createGain();
      lfoGainR.gain.setValueAtTime(0.003, this.ctx.currentTime); // ~3.0ms 延遲調變深度
      lfoR.connect(lfoGainR);
      lfoGainR.connect(delayR.delayTime);

      // 左右聲道立體聲合併
      const merger = this.ctx.createChannelMerger(2);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);

      this.chorusInput.connect(delayL);
      this.chorusInput.connect(delayR);

      // 合唱濕訊號輸出匯入動態壓縮器
      const chorusOutputGain = this.ctx.createGain();
      chorusOutputGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      merger.connect(chorusOutputGain);
      chorusOutputGain.connect(this.compressor);

      lfoL.start();
      lfoR.start();
    } catch {
      this.chorusInput = null;
    }

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  public getContext(): AudioContext | null {
    if (!this.ctx) this.init();
    return this.ctx;
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  public getPlayingPadNum(): number | null {
    return this.currentPadNum;
  }

  /**
   * 停止當前所有發聲與走帶
   */
  public stop() {
    // 1. 作廢當前播放 Session Token，使所有尚未執行的非同步計時器即刻失效
    this.playbackSessionId++;

    // 2. 清除所有掛載中的 JavaScript 延遲排程 (Note-On / Note-Off)
    for (const tid of this.scheduledTimerIds) {
      clearTimeout(tid);
    }
    this.scheduledTimerIds = [];

    // 3. 取消走帶動畫
    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // 4. Web Audio 節點深度清理與子匯流排切斷
    if (this.ctx) {
      const now = this.ctx.currentTime;

      // 4.1 立即切斷並淡出 Pad 子匯流排，徹底消音並斷開連接
      if (this.currentPadGain) {
        try {
          this.currentPadGain.gain.cancelScheduledValues(now);
          this.currentPadGain.gain.setValueAtTime(this.currentPadGain.gain.value, now);
          this.currentPadGain.gain.linearRampToValueAtTime(0, now + 0.01);
          const oldPadGain = this.currentPadGain;
          setTimeout(() => {
            try { oldPadGain.disconnect(); } catch {}
          }, 25);
        } catch {}
        this.currentPadGain = null;
      }

      // 4.2 停止並斷開所有記錄中的震盪器與音源緩衝
      for (const osc of this.activeOscillators) {
        try {
          (osc as any).stop(now);
        } catch {}
        try {
          osc.disconnect();
        } catch {}
      }
      this.activeOscillators.clear();

      // 4.3 執行所有聲音通道的自定義 stop
      for (const voice of this.activeVoices) {
        try {
          voice.stop(now);
        } catch {}
      }
      this.activeVoices = [];
    }

    // 4.4 停止並清理伴奏音軌
    this.stopBackingTrack();

    // 5. 若 Web MIDI 輸出啟用，對實體琴進行 Panic (熄滅正在發聲的音符 + 全通道斷音)
    midiManager.panicAllChannels();

    this.isCurrentlyPlaying = false;
    const oldPad = this.currentPadNum;
    this.currentPadNum = null;

    if (this.playbackOptions?.onEnded) {
      this.playbackOptions.onEnded();
    }
    this.playbackOptions = null;
    return oldPad;
  }

  // ==========================================
  // Phase 2.8-A: 疊錄伴奏監聽 (Multi-Pad Overdub Backing Track)
  // ==========================================

  /**
   * 取得當前疊錄伴奏是否正在播放中
   */
  public isBackingTrackPlaying(): boolean {
    return this.isBackingPlaying;
  }

  /**
   * 動態調節疊錄伴奏音量比例 (0.0 ~ 1.0)
   */
  public setBackingVolume(ratio: number): void {
    this.backingVolume = Math.max(0, Math.min(1, ratio));
    if (this.backingGain && this.ctx) {
      try {
        this.backingGain.gain.setValueAtTime(this.backingVolume, this.ctx.currentTime);
      } catch {}
    }
  }

  /**
   * 停止當前疊錄伴奏播放並清理資源
   */
  public stopBackingTrack(): void {
    this.backingPlaybackSessionId++;

    for (const tid of this.backingTimerIds) {
      clearTimeout(tid);
    }
    this.backingTimerIds = [];

    if (this.backingAnimFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.backingAnimFrameId);
      this.backingAnimFrameId = null;
    }

    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.backingGain) {
        try {
          this.backingGain.gain.cancelScheduledValues(now);
          this.backingGain.gain.setValueAtTime(this.backingGain.gain.value, now);
          this.backingGain.gain.linearRampToValueAtTime(0, now + 0.01);
          const oldGain = this.backingGain;
          setTimeout(() => {
            try { oldGain.disconnect(); } catch {}
          }, 25);
        } catch {}
        this.backingGain = null;
      }

      for (const voice of this.activeBackingVoices) {
        try {
          voice.stop(now);
        } catch {}
      }
      this.activeBackingVoices = [];
    }

    this.isBackingPlaying = false;
  }

  /**
   * 啟動疊錄伴奏音軌播放 (支援多 Pad 混音與無縫循環)
   */
  public startBackingTrack(tracks: BackingTrackItem[], options: BackingTrackOptions): void {
    this.stopBackingTrack();
    this.init();

    if (!this.ctx || tracks.length === 0) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const validTracks = tracks.filter(t => t.notes && t.notes.length > 0);
    if (validTracks.length === 0) return;

    const sessionId = ++this.backingPlaybackSessionId;
    this.isBackingPlaying = true;

    // 建立伴奏專屬 Gain 節點並銜接至主混音
    if (this.masterGain && this.ctx) {
      this.backingGain = this.ctx.createGain();
      const vol = options.volumeRatio !== undefined ? Math.max(0, Math.min(1, options.volumeRatio)) : this.backingVolume;
      this.backingVolume = vol;
      this.backingGain.gain.setValueAtTime(this.backingVolume, this.ctx.currentTime);
      this.backingGain.connect(this.masterGain);
    }

    const bpm = options.bpm || 120;
    const division = options.division || 480;
    const beatsPerBar = options.beatsPerBar || 4;
    const ticksPerBar = division * beatsPerBar;

    // 計算最長音軌小節數作為整組伴奏之循環長度
    let maxTotalTicks = ticksPerBar;
    for (const track of validTracks) {
      if (track.totalTicks && track.totalTicks > 0) {
        maxTotalTicks = Math.max(maxTotalTicks, track.totalTicks);
      } else {
        const lastTick = Math.max(...track.notes.map(n => n.startTick + n.durationTick), 0);
        const bars = Math.max(1, Math.ceil(lastTick / ticksPerBar));
        maxTotalTicks = Math.max(maxTotalTicks, bars * ticksPerBar);
      }
    }

    const loopDurationSec = ticksToSeconds(maxTotalTicks, bpm, division);
    const startOffsetTick = options.startOffsetTick ? Math.max(0, Math.min(options.startOffsetTick, maxTotalTicks - 1)) : 0;
    const startOffsetSec = ticksToSeconds(startOffsetTick, bpm, division);
    this.backingStartTime = this.ctx.currentTime - startOffsetSec;

    // 若 Web MIDI 開啟，為各伴奏音軌發送 Voice Change 與 Mixer Controllers
    if (midiManager.isMidiActive()) {
      for (const track of validTracks) {
        const midiCh = track.channelParams?.channel ?? (track.padNum - 1);
        const params = track.channelParams || {};
        if (params.msb !== undefined || params.lsb !== undefined || params.pc !== undefined) {
          midiManager.sendVoiceChange(midiCh, {
            msb: params.msb ?? 0,
            lsb: params.lsb ?? 0,
            pc: params.pc ?? 0,
          });
        }
        midiManager.sendMixerControllers(midiCh, {
          volume: Math.round(((params.volume ?? 100) * this.backingVolume)),
          pan: params.pan ?? 64,
          reverb: params.reverb ?? 40,
          chorus: params.chorus ?? 0,
        });
      }
    }

    // 將各音軌音符依 startTick 預先排序，確保排程指針能單向推進
    const sortedTracks = validTracks.map((t) => ({
      ...t,
      notes: [...t.notes].sort((a, b) => a.startTick - b.startTick),
    }));

    // Lookahead 排程窗口大小 (1.0 秒前瞻，兼顧極致效能與防爆音)
    const LOOKAHEAD_SEC = 1.0;
    const lookaheadTicks = Math.max(ticksPerBar, secondsToTicks(LOOKAHEAD_SEC, bpm, division));

    const isLoop = options.loop !== false; // 預設循環
    let lastScheduledCycle = 0;
    let scheduledUntilTick = startOffsetTick;

    // 各軌音符排程指針
    const trackNotePointers = new Array(sortedTracks.length).fill(0);

    // 若有 startOffsetTick，先推進指針至起點附近
    if (startOffsetTick > 0) {
      for (let i = 0; i < sortedTracks.length; i++) {
        const notes = sortedTracks[i].notes;
        while (trackNotePointers[i] < notes.length) {
          const n = notes[trackNotePointers[i]];
          if (n.startTick + n.durationTick <= startOffsetTick) {
            trackNotePointers[i]++;
          } else {
            break;
          }
        }
      }
    }

    // Lookahead 窗口排程核心：僅排程從 fromTick 到 toTick 區間內的音符
    const scheduleWindow = (fromTick: number, toTick: number, cycle: number) => {
      if (!this.ctx || this.backingPlaybackSessionId !== sessionId || !this.isBackingPlaying) return;

      const passStartTime = this.backingStartTime + cycle * loopDurationSec;
      const now = this.ctx.currentTime;

      for (let i = 0; i < sortedTracks.length; i++) {
        const track = sortedTracks[i];
        const notes = track.notes;
        const params = track.channelParams || {};
        const midiCh = params.channel ?? (track.padNum - 1);
        let ptr = trackNotePointers[i];

        while (ptr < notes.length) {
          const n = notes[ptr];
          if (n.startTick >= toTick) {
            break; // 超過本次排程窗口，等待下一幀
          }

          if (n.startTick >= fromTick && n.startTick < maxTotalTicks) {
            const noteOffsetSec = ticksToSeconds(n.startTick, bpm, division);
            const noteDurSec = Math.max(ticksToSeconds(n.durationTick, bpm, division), 0.05);
            const noteStartTime = passStartTime + noteOffsetSec;
            const noteStopTime = noteStartTime + noteDurSec;

            if (noteStopTime > now) {
              const effectiveStartTime = Math.max(now, noteStartTime);
              const effectiveDurSec = Math.max(0.02, noteStopTime - effectiveStartTime);

              // Web Audio 觸發 (走專屬 backingGain)
              if (midiManager.isAudioActive()) {
                this.triggerVoice(n.note, n.velocity, effectiveStartTime, effectiveDurSec, params, this.backingGain);
              }

              // Web MIDI 實體琴轉發
              if (midiManager.isMidiActive()) {
                const delayMs = Math.max(0, (effectiveStartTime - now) * 1000);
                const stopDelayMs = Math.max(0, (noteStopTime - now) * 1000);

                const onTimer = setTimeout(() => {
                  if (this.backingPlaybackSessionId !== sessionId || !this.isBackingPlaying) return;
                  midiManager.sendNoteOn(midiCh, n.note, n.velocity);
                }, delayMs);
                this.backingTimerIds.push(onTimer);

                const offTimer = setTimeout(() => {
                  if (this.backingPlaybackSessionId !== sessionId) return;
                  midiManager.sendNoteOff(midiCh, n.note);
                }, stopDelayMs);
                this.backingTimerIds.push(offTimer);
              }
            }
          }
          ptr++;
        }
        trackNotePointers[i] = ptr;
      }
    };

    // 立即排程起播瞬間的第一個 Lookahead 窗口 (極速起播，絕不卡頓)
    const initialTargetTick = Math.min(maxTotalTicks, startOffsetTick + lookaheadTicks);
    scheduleWindow(startOffsetTick, initialTargetTick, 0);
    scheduledUntilTick = initialTargetTick;

    // 啟動伴奏走帶監視器 (每幀平滑前進，持續 Lookahead 排程未來音符)
    const updateBackingLoop = () => {
      if (this.backingPlaybackSessionId !== sessionId || !this.isBackingPlaying || !this.ctx) return;

      const elapsedSec = this.ctx.currentTime - this.backingStartTime;
      const currentCycle = Math.floor(elapsedSec / loopDurationSec);

      if (!isLoop && elapsedSec >= loopDurationSec) {
        this.stopBackingTrack();
        if (options.onEnded) options.onEnded();
        return;
      }

      // 伴奏循環重置：換週時重設指針與窗口
      if (isLoop && currentCycle > lastScheduledCycle) {
        lastScheduledCycle = currentCycle;
        trackNotePointers.fill(0);
        scheduledUntilTick = 0;
      }

      const cycleElapsedSec = elapsedSec % loopDurationSec;
      const relTick = Math.min(secondsToTicks(cycleElapsedSec, bpm, division), maxTotalTicks);
      const currentBar = Math.floor(relTick / ticksPerBar) + 1;
      const tickInBar = relTick % ticksPerBar;
      const currentBeat = Math.floor(tickInBar / division) + 1;
      const progress = Math.max(0, Math.min(1, relTick / maxTotalTicks));

      // 自然清理已過期結束發聲的 voice 節點，防止 activeBackingVoices 無限堆積並降低 GC 負擔
      const now = this.ctx.currentTime;
      if (this.activeBackingVoices.length > 0) {
        const remaining: ActiveVoiceHandle[] = [];
        for (const v of this.activeBackingVoices) {
          if (v.endTime <= now) {
            v.cleanup();
          } else {
            remaining.push(v);
          }
        }
        this.activeBackingVoices = remaining;
      }

      // 持續推進 Lookahead 排程窗口
      const targetTick = Math.min(maxTotalTicks, relTick + lookaheadTicks);
      if (targetTick > scheduledUntilTick) {
        scheduleWindow(scheduledUntilTick, targetTick, currentCycle);
        scheduledUntilTick = targetTick;
      }

      // 步驟 3.4: 即時偵測當前發聲中的音符 (僅在啟用時計算，長篇整曲試聽可設 false 省下 60fps 暴力全表掃描)
      let activeNotesArr: number[] = [];
      if (options.enableActiveNotesDetection !== false) {
        const activeNotes = new Set<number>();
        for (const track of sortedTracks) {
          for (const n of track.notes) {
            if (relTick >= n.startTick && relTick < (n.startTick + n.durationTick)) {
              activeNotes.add(n.note);
            }
          }
        }
        activeNotesArr = Array.from(activeNotes);
      }

      if (options.onProgress) {
        options.onProgress({
          currentTick: relTick,
          relTick,
          currentBar,
          currentBeat,
          progress,
          activeNoteNumbers: activeNotesArr,
        });
      }

      if (this.backingPlaybackSessionId === sessionId && this.isBackingPlaying) {
        this.backingAnimFrameId = requestAnimationFrame(updateBackingLoop);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.backingAnimFrameId = requestAnimationFrame(updateBackingLoop);
    }
  }

  /**
   * 試聽多顆音符 (支援和弦同發與小節短句依時序排程發聲)
   * 包含單次音色切換防抖，杜絕 Yamaha 實體合成器因多重 Program Change 導致之斷音
   */
  public playAuditionPhrase(
    notes: { note: number; startSec: number; durationSec: number; velocity: number }[],
    params: ChannelAudioParams = {}
  ) {
    this.init();
    if (notes.length === 0) return;

    // 清除先前未完成的試聽定時器，避免快速連續點擊時音符重疊混亂
    for (const tid of this.scheduledTimerIds) {
      clearTimeout(tid);
    }
    this.scheduledTimerIds = [];

    const ch = params.channel ?? ((this.currentPadNum ?? 1) - 1);

    // 1. 若 Web MIDI 路由啟用，發送單次音色切換指令 (Bank Select MSB + LSB + PC)
    // 避免多顆音符同時觸發多重 Program Change 造成 Yamaha SX920 合成器引擎重置與斷音
    if (midiManager.isMidiActive()) {
      if (params.msb !== undefined || params.lsb !== undefined || params.pc !== undefined) {
        midiManager.sendVoiceChange(ch, {
          msb: params.msb ?? 0,
          lsb: params.lsb ?? 0,
          pc: params.pc ?? 0,
        });
      }
      if (params.pan !== undefined || params.reverb !== undefined || params.chorus !== undefined) {
        midiManager.sendMixerControllers(ch, {
          pan: params.pan,
          reverb: params.reverb,
          chorus: params.chorus,
        });
      }
    }

    // 2. 排程發聲
    for (const n of notes) {
      const delayMs = Math.max(0, n.startSec * 1000);
      const durSec = Math.max(0.1, Math.min(3.0, n.durationSec));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));

      const timer = setTimeout(() => {
        // Web Audio 路由啟用時發聲
        if (midiManager.isAudioActive() && this.ctx) {
          const now = this.ctx.currentTime;
          this.triggerVoice(n.note, vel, now, durSec, {
            ...params,
            volume: 100, // 通道音量基準固定為 100，動態強弱完全由 note velocity 控制
          });
        }

        // Web MIDI Note-On / Note-Off
        if (midiManager.isMidiActive()) {
          midiManager.sendNoteOn(ch, n.note, vel);
          const offTimer = setTimeout(() => {
            midiManager.sendNoteOff(ch, n.note);
          }, durSec * 1000);
          this.scheduledTimerIds.push(offTimer as any);
        }
      }, delayMs);

      this.scheduledTimerIds.push(timer as any);
    }
  }

  /**
   * 試聽單一音符/音色 (例如在音色庫彈奏預聽)
   */
  public playAuditionNote(note: number = 60, durationSec: number = 0.6, params: ChannelAudioParams = {}) {
    const vel = params.volume ?? 100;
    this.playAuditionPhrase([
      { note, startSec: 0, durationSec, velocity: vel }
    ], params);
  }

  /**
   * 播放錄音節拍器 Click 滴答聲 (Downbeat 第一拍高音 1400Hz, 弱拍 900Hz)
   * 採用 25ms 快速衰減木魚打擊音色，直接輸出至硬體輸出端 (避開主混音壓縮器與殘響，防止與琴聲重疊混濁)
   */
  public playMetronomeClick(isDownbeat: boolean = false, volume: number = 0.5): void {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    const osc = this.createOscillator();
    const gain = this.ctx.createGain();

    // 快速音高滑落打擊感 (Woodblock / Rimshot 衝擊瞬態)
    osc.type = isDownbeat ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 1400 : 900, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 800 : 450, now + 0.025);

    // 25ms 內急速衰減，音質俐落乾淨，不與演奏的音符頻率互相干擾
    gain.gain.setValueAtTime(volume * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    // 直通 ctx.destination，完全獨立於樂器軌道，不吃壓縮器與殘響
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
      this.activeOscillators.delete(osc);
    };
  }

  /**
   * 播放指定音符序列
   */
  public playSequence(
    padNum: number,
    notes: NoteEvent[],
    options: PlaybackOptions
  ) {
    this.stop();
    this.init();

    if (!this.ctx || notes.length === 0) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const sessionId = ++this.playbackSessionId;
    this.isCurrentlyPlaying = true;
    this.currentPadNum = padNum;
    this.playbackOptions = options;
    this.scheduledNotes = notes;

    // 建立本次 Pad 專屬的子匯流排 (Pad Sub-bus Gain)，所有聲音走此節點匯入主混音
    if (this.masterGain && this.ctx) {
      this.currentPadGain = this.ctx.createGain();
      this.currentPadGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.currentPadGain.connect(this.masterGain);
    }

    const bpm = options.bpm || 120;
    const division = options.division || 96;
    const totalTicks = Math.max(options.totalTicks, 1);
    const loopDurationSec = ticksToSeconds(totalTicks, bpm, division);
    const startOffsetTick = options.startOffsetTick ? Math.max(0, Math.min(options.startOffsetTick, totalTicks - 1)) : 0;
    const startOffsetSec = ticksToSeconds(startOffsetTick, bpm, division);

    this.playbackStartTime = this.ctx.currentTime - startOffsetSec;

    // 若 Web MIDI 啟用，在序列開始前預先發送當前 Pad 的音色 (Bank/PC) 與混音 (CC7/CC10/CC91/CC93)
    if (midiManager.isMidiActive()) {
      const midiCh = options.channelParams?.channel ?? (padNum - 1);
      const params = options.channelParams || {};
      if (params.msb !== undefined || params.lsb !== undefined || params.pc !== undefined) {
        midiManager.sendVoiceChange(midiCh, {
          msb: params.msb ?? 0,
          lsb: params.lsb ?? 0,
          pc: params.pc ?? 0,
        });
      }
      midiManager.sendMixerControllers(midiCh, {
        volume: params.volume ?? 100,
        pan: params.pan ?? 64,
        reverb: params.reverb ?? 40,
        chorus: params.chorus ?? 0,
      });
    }

    this.schedulePass(0, loopDurationSec, sessionId);

    // 啟動走帶動畫迴圈
    this.startAnimationLoop(sessionId);
  }

  /**
   * 排程一個循環週期的所有音符
   */
  private schedulePass(cycleIndex: number, loopDurationSec: number, sessionId: number) {
    if (!this.ctx || !this.playbackOptions || this.playbackSessionId !== sessionId || !this.isCurrentlyPlaying) return;

    const bpm = this.playbackOptions.bpm;
    const division = this.playbackOptions.division;
    const gridStartTick = this.playbackOptions.gridStartTick;
    const totalTicks = this.playbackOptions.totalTicks;
    const params = this.playbackOptions.channelParams || {};

    const passStartTime = this.playbackStartTime + cycleIndex * loopDurationSec;

    for (const n of this.scheduledNotes) {
      if (this.playbackSessionId !== sessionId || !this.isCurrentlyPlaying) return;

      const relTick = n.startTick - gridStartTick;
      if (relTick < 0 || relTick >= totalTicks) continue;

      const noteOffsetSec = ticksToSeconds(relTick, bpm, division);
      const noteDurSec = Math.max(ticksToSeconds(n.durationTick, bpm, division), 0.05);

      const noteStartTime = passStartTime + noteOffsetSec;
      const noteStopTime = noteStartTime + noteDurSec;

      const now = this.ctx.currentTime;
      if (noteStopTime <= now) {
        continue; // 此音符在起點前已結束
      }

      const effectiveStartTime = Math.max(now, noteStartTime);
      const effectiveDurSec = Math.max(0.02, noteStopTime - effectiveStartTime);

      // 若 Web Audio 路由開啟：觸發音符發聲
      if (midiManager.isAudioActive()) {
        this.triggerVoice(n.note, n.velocity, effectiveStartTime, effectiveDurSec, params);
      }

      // 若 Web MIDI 路由開啟：轉發至實體琴
      if (midiManager.isMidiActive()) {
        const midiCh = params.channel ?? ((this.currentPadNum ?? 1) - 1);
        const delayMs = Math.max(0, (effectiveStartTime - now) * 1000);
        const stopDelayMs = Math.max(0, (noteStopTime - now) * 1000);

        const onTimer = setTimeout(() => {
          if (this.playbackSessionId !== sessionId || !this.isCurrentlyPlaying) return;
          midiManager.sendNoteOn(midiCh, n.note, n.velocity);
        }, delayMs);
        this.scheduledTimerIds.push(onTimer);

        const offTimer = setTimeout(() => {
          if (this.playbackSessionId !== sessionId) return;
          midiManager.sendNoteOff(midiCh, n.note);
        }, stopDelayMs);
        this.scheduledTimerIds.push(offTimer);
      }
    }
  }

  /**
   * 合成單一音符聲響
   */
  private triggerVoice(
    note: number,
    velocity: number,
    startTime: number,
    durationSec: number,
    params: ChannelAudioParams,
    customBus?: GainNode | null
  ) {
    if (!this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const vol = (params.volume ?? 100) / 127;
    const vel = velocity / 127;
    const isDrum = params.isDrum || (params.pc !== undefined && params.pc >= 120);
    const inst = params.instrumentId || 'grand-piano';
    const isMelody = inst.includes('lead') || inst.includes('melody') || inst.includes('vocal');

    // 聲部音量動態平衡：主旋律賦予充足飽滿度 (0.78)，伴奏聲部維持清晰層次 (0.60)，打擊樂維持俐落重擊 (0.65)
    let baseGain = 0.60;
    if (isDrum) {
      baseGain = 0.65;
    } else if (isMelody) {
      baseGain = 0.78;
    }
    const gainFactor = isDrum
      ? vol * Math.min(1.0, vel * 1.15) * baseGain
      : vol * vel * baseGain;

    // 建立軌道聲道架構 (Gain -> Panner -> Sub-bus / Backing-bus / Master)
    const targetBus = customBus || this.currentPadGain || this.masterGain;
    const channelGain = ctx.createGain();
    channelGain.gain.setValueAtTime(gainFactor, startTime);

    let panner: StereoPannerNode | null = null;
    let revSend: GainNode | null = null;
    let choSend: GainNode | null = null;

    const panVal = ((params.pan ?? 64) - 64) / 64;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), startTime);
      channelGain.connect(panner);
      panner.connect(targetBus);
      if (this.convolver && (params.reverb ?? 40) > 0) {
        revSend = ctx.createGain();
        revSend.gain.setValueAtTime(((params.reverb ?? 40) / 127) * 0.5, startTime);
        panner.connect(revSend);
        revSend.connect(this.convolver);
      }
      if (this.chorusInput && (params.chorus ?? 0) > 0) {
        choSend = ctx.createGain();
        choSend.gain.setValueAtTime(((params.chorus ?? 0) / 127) * 0.65, startTime);
        panner.connect(choSend);
        choSend.connect(this.chorusInput);
      }
    } else {
      channelGain.connect(targetBus);
      if (this.chorusInput && (params.chorus ?? 0) > 0) {
        choSend = ctx.createGain();
        choSend.gain.setValueAtTime(((params.chorus ?? 0) / 127) * 0.65, startTime);
        channelGain.connect(choSend);
        choSend.connect(this.chorusInput);
      }
    }

    const freq = midiToFreq(note);
    if (isDrum) {
      this.synthesizeDrum(note, velocity, startTime, channelGain);
    } else if (isMelody) {
      this.synthesizeLead(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('strings') || inst.includes('kino') || inst.includes('pad')) {
      this.synthesizeStrings(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('pizz')) {
      this.synthesizePizzicato(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('guitar')) {
      this.synthesizeGuitar(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('bass')) {
      this.synthesizeBass(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('brass') || inst.includes('trumpet') || inst.includes('sax')) {
      this.synthesizeBrass(freq, startTime, durationSec, channelGain);
    } else if (inst.includes('flute') || inst.includes('pipe') || inst.includes('woodwind')) {
      this.synthesizeFlute(freq, startTime, durationSec, channelGain);
    } else {
      // 鋼琴與鍵盤類 (Piano default)
      this.synthesizePiano(freq, startTime, durationSec, channelGain);
    }

    const voiceDuration = isDrum ? 1.0 : Math.max(0.2, durationSec + 0.25);
    const endTime = startTime + voiceDuration;

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try { channelGain.disconnect(); } catch {}
      try { if (panner) panner.disconnect(); } catch {}
      try { if (revSend) revSend.disconnect(); } catch {}
      try { if (choSend) choSend.disconnect(); } catch {}
    };

    const voiceEntry: ActiveVoiceHandle = {
      endTime,
      isDrum,
      stop: (t: number) => {
        try {
          channelGain.gain.cancelScheduledValues(t);
          channelGain.gain.setValueAtTime(0, t);
        } catch {}
        cleanup();
      },
      cleanup,
    };

    const targetVoiceList = (customBus && customBus === this.backingGain) ? this.activeBackingVoices : this.activeVoices;
    targetVoiceList.push(voiceEntry);

    // 自然斷開計時器 (保證在聲音尾音結束後立即從 Web Audio 圖譜中斷開)
    const cleanupDelayMs = Math.max(0, (endTime - ctx.currentTime) * 1000 + 40);
    const cleanupTimer = setTimeout(() => {
      cleanup();
    }, cleanupDelayMs);

    if (customBus && customBus === this.backingGain) {
      this.backingTimerIds.push(cleanupTimer);
    } else {
      this.scheduledTimerIds.push(cleanupTimer);
    }
  }

  // --- 樂器聲音物理/諧波合成器 ---

  /** 鋼琴：雙諧波 (正弦基頻 + 三角泛音) 與指數衰減 */
  private synthesizePiano(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc1 = this.createOscillator();
    const osc2 = this.createOscillator();
    const env = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, start);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, start);

    // 擊弦強烈 Attack，隨後自然指數 Decay
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(1.0, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.6, start + 0.15);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.08);

    osc1.connect(env);
    osc2.connect(env);
    env.connect(target);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + dur + 0.1);
    osc2.stop(start + dur + 0.1);
  }

  /** 主旋律 / 主奏 (Lead / Vocal / Melody)：雙震盪器失諧溫暖人聲/主奏質感與平穩 Sustain */
  private synthesizeLead(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc1 = this.createOscillator();
    const osc2 = this.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, start);

    // osc2 帶微幅失諧 (+4 cents)，營造自然人聲/獨奏厚度
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.0025, start);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 3.5, 4500), start);

    // 圓潤起音、飽滿維持 (Sustain)、自然釋音 (Release)
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(0.95, start + 0.02);
    env.gain.setValueAtTime(0.9, start + dur - 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.12);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(target);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + dur + 0.15);
    osc2.stop(start + dur + 0.15);
  }

  /** 弦樂：平滑 Attack、鋸齒波疊合低通濾波 */
  private synthesizeStrings(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc1 = this.createOscillator();
    const osc2 = this.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, start);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.003, start); // 微差失諧 (Detune) 創造豐厚感

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 4, 4500), start);

    // 弦樂柔和起音
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(0.85, start + 0.08);
    env.gain.setValueAtTime(0.85, start + dur - 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.15);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(target);

    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + dur + 0.2);
    osc2.stop(start + dur + 0.2);
  }

  /** 撥弦 (Pizzicato)：極短 Pluck 擊發與快速休止 */
  private synthesizePizzicato(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc = this.createOscillator();
    const env = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    const pluckDur = Math.min(dur, 0.35);
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(1.0, start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, start + pluckDur);

    osc.connect(env);
    env.connect(target);

    osc.start(start);
    osc.stop(start + pluckDur + 0.02);
  }

  /** 吉他：撥弦三角波 + 微量亮部諧波 */
  private synthesizeGuitar(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc = this.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, start);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3.5, start);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, start + dur);

    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(0.9, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.3, start + 0.2);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.05);

    osc.connect(filter);
    filter.connect(env);
    env.connect(target);

    osc.start(start);
    osc.stop(start + dur + 0.08);
  }

  /** 貝斯：低頻 Sine/Triangle 重低音 */
  private synthesizeBass(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc = this.createOscillator();
    const env = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(1.0, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.5, start + 0.15);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.05);

    osc.connect(env);
    env.connect(target);

    osc.start(start);
    osc.stop(start + dur + 0.08);
  }

  /** 銅管/薩克斯風：方波與鋸齒諧波、動態開展濾波器 */
  private synthesizeBrass(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc = this.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, start);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 1.5, start);
    filter.frequency.linearRampToValueAtTime(freq * 4.5, start + 0.08);
    filter.frequency.setValueAtTime(freq * 3.5, start + dur);

    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(0.85, start + 0.04);
    env.gain.setValueAtTime(0.8, start + dur - 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.06);

    osc.connect(filter);
    filter.connect(env);
    env.connect(target);

    osc.start(start);
    osc.stop(start + dur + 0.1);
  }

  /** 長笛/木管：純淨正弦波 + 輕微呼吸氣音 */
  private synthesizeFlute(freq: number, start: number, dur: number, target: AudioNode) {
    if (!this.ctx) return;
    const osc = this.createOscillator();
    const env = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(0.75, start + 0.06);
    env.gain.setValueAtTime(0.75, start + dur - 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.08);

    osc.connect(env);
    env.connect(target);

    osc.start(start);
    osc.stop(start + dur + 0.1);
  }

  /** 打擊樂器 (Drums)：大鼓、小鼓、Hi-Hat、銅鈸、通鼓與拉丁擊樂真實物理合成 */
  private synthesizeDrum(note: number, vel: number, start: number, target: AudioNode) {
    if (!this.ctx) return;
    const velScale = Math.max(0.2, Math.min(1.0, vel / 127));

    if (note === 35 || note === 36) {
      // 1. 大鼓 (Bass Drum / Kick) - 具備開口瞬態 Click 與飽滿低頻 Punch (52~65Hz)
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      // 快速音高掃頻：從 320Hz 瞬態極速下墜至 52Hz，小喇叭或耳機均能清楚辨識敲擊質感
      osc.frequency.setValueAtTime(320, start);
      osc.frequency.exponentialRampToValueAtTime(80, start + 0.035);
      osc.frequency.exponentialRampToValueAtTime(52, start + 0.14);

      env.gain.setValueAtTime(1.25 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.3);

      // 大鼓擊鎚高頻敲擊瞬態 (Beater Click, 2.5kHz)
      this.playNoise(start, 0.015, 2500, target, 0.6 * velScale);
    } else if (note === 37) {
      // 2. 邊音 (Side Stick / Rimshot) - 實心木質敲擊感
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, start);
      osc.frequency.exponentialRampToValueAtTime(440, start + 0.025);

      env.gain.setValueAtTime(0.9 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.05);

      this.playNoise(start, 0.025, 3500, target, 0.7 * velScale);
    } else if (note === 38 || note === 40) {
      // 3. 小鼓 (Snare / Electric Snare) - 鼓腔共鳴 + 響弦金屬白噪音
      const osc = this.createOscillator();
      const oscEnv = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, start);
      osc.frequency.exponentialRampToValueAtTime(120, start + 0.06);

      oscEnv.gain.setValueAtTime(0.9 * velScale, start);
      oscEnv.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(oscEnv);
      oscEnv.connect(target);
      osc.start(start);
      osc.stop(start + 0.16);

      // 響弦噪音 (Snare Wires)
      this.playNoise(start, 0.18, 1500, target, 0.95 * velScale);
    } else if (note === 39) {
      // 4. 拍手聲 (Hand Clap)
      this.playNoise(start, 0.02, 1200, target, 0.7 * velScale);
      this.playNoise(start + 0.012, 0.02, 1200, target, 0.7 * velScale);
      this.playNoise(start + 0.024, 0.12, 1000, target, 0.85 * velScale);
    } else if (note === 42 || note === 44) {
      // 5. 閉合 / 踩鈸 Hi-Hat (Closed / Pedal)
      this.playNoise(start, 0.045, 7500, target, 0.75 * velScale);
    } else if (note === 46) {
      // 6. 開鈸 Hi-Hat (Open) - 泛音金屬細碎殘響
      this.playNoise(start, 0.32, 6500, target, 0.85 * velScale);
    } else if (note === 49 || note === 57) {
      // 7. 碎音銅鈸 (Crash Cymbal 1 & 2) - 爆發力金屬噪音噴濺
      this.playNoise(start, 0.9, 4500, target, 0.9 * velScale);
    } else if (note === 51 || note === 59) {
      // 8. 疊音鈸 (Ride Cymbal 1 & 2) - 金屬清脆叮聲與長泛音
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, start);
      env.gain.setValueAtTime(0.4 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.35);

      this.playNoise(start, 0.65, 5500, target, 0.65 * velScale);
    } else if (note === 52 || note === 55) {
      // 9. 中國鈸 (China) 或 潑音鈸 (Splash)
      const dur = note === 55 ? 0.35 : 0.6;
      this.playNoise(start, dur, 4000, target, 0.85 * velScale);
    } else if (note === 53) {
      // 10. 疊音鈸鐘 (Ride Bell)
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(820, start);
      env.gain.setValueAtTime(0.7 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.45);
    } else if (note === 54 || note === 69 || note === 70) {
      // 11. 鈴鼓 (Tambourine) / 沙錘 (Shaker / Cabasa)
      this.playNoise(start, 0.06, 6800, target, 0.8 * velScale);
    } else if (note === 56) {
      // 12. 牛鈴 (Cowbell) - 雙諧波方波/三角波經典打擊聲
      const osc1 = this.createOscillator();
      const osc2 = this.createOscillator();
      const env = this.ctx.createGain();
      osc1.type = 'square';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(587, start);
      osc2.frequency.setValueAtTime(845, start);

      env.gain.setValueAtTime(0.6 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc1.connect(env);
      osc2.connect(env);
      env.connect(target);
      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + 0.25);
      osc2.stop(start + 0.25);
    } else if (note >= 41 && note <= 50) {
      // 13. 通鼓群 (Low / Mid / High Toms: 41, 43, 45, 47, 48, 50)
      const tomFreqMap: Record<number, number> = {
        41: 130, // Low Floor Tom
        43: 145, // High Floor Tom
        45: 165, // Low Tom
        47: 190, // Low-Mid Tom
        48: 220, // Hi-Mid Tom
        50: 250, // High Tom
      };
      const baseFreq = tomFreqMap[note] || 170;
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, start + 0.16);

      env.gain.setValueAtTime(1.0 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.26);

      // 鼓棒擊皮瞬態
      this.playNoise(start, 0.015, 2000, target, 0.4 * velScale);
    } else {
      // 14. 其它打擊樂 (拉丁 Conga, Bongo 等通用備援)
      const osc = this.createOscillator();
      const env = this.ctx.createGain();
      const f = Math.max(90, Math.min(600, midiToFreq(note)));
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, start + 0.12);

      env.gain.setValueAtTime(0.85 * velScale, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(env);
      env.connect(target);
      osc.start(start);
      osc.stop(start + 0.22);
    }
  }

  /** 白噪音發生器 (用於 Hi-hat, Snare 響弦, 銅鈸) */
  private playNoise(
    start: number,
    dur: number,
    highpassFreq: number,
    target: AudioNode,
    gainLevel: number = 0.7
  ) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(highpassFreq, start);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gainLevel, start);
    env.gain.exponentialRampToValueAtTime(0.001, start + dur);

    noise.connect(filter);
    filter.connect(env);
    env.connect(target);

    noise.start(start);
    noise.stop(start + dur + 0.02);
  }

  /**
   * 走帶動畫與 Tick 追蹤
   */
  private startAnimationLoop(sessionId: number) {
    let lastScheduledCycle = 0;

    const updateLoop = () => {
      if (this.playbackSessionId !== sessionId || !this.isCurrentlyPlaying || !this.ctx || !this.playbackOptions) return;

      const bpm = this.playbackOptions.bpm;
      const division = this.playbackOptions.division;
      const beatsPerBar = this.playbackOptions.beatsPerBar || 4;
      const gridStartTick = this.playbackOptions.gridStartTick;
      const totalTicks = this.playbackOptions.totalTicks;
      const ticksPerBar = division * beatsPerBar;
      const loopDurationSec = ticksToSeconds(totalTicks, bpm, division);

      const elapsedSec = this.ctx.currentTime - this.playbackStartTime;
      const currentCycle = Math.floor(elapsedSec / loopDurationSec);

      // 如果是單次播放且已經超過總長度，停止播放
      if (!this.playbackOptions.loop && elapsedSec >= loopDurationSec) {
        this.stop();
        return;
      }

      // 如果有開循環，且即將邁入下一個循環，提前排程下一個週期的音符
      if (this.playbackOptions.loop && currentCycle > lastScheduledCycle) {
        lastScheduledCycle = currentCycle;
        this.schedulePass(currentCycle, loopDurationSec, sessionId);
      }

      const cycleElapsedSec = elapsedSec % loopDurationSec;
      const relTick = Math.min(secondsToTicks(cycleElapsedSec, bpm, division), totalTicks);
      const currentTick = gridStartTick + relTick;
      const progress = Math.max(0, Math.min(1, relTick / totalTicks));

      const now = this.ctx.currentTime;
      if (this.activeVoices.length > 0) {
        const remaining: ActiveVoiceHandle[] = [];
        for (const v of this.activeVoices) {
          if (v.endTime <= now) {
            v.cleanup();
          } else {
            remaining.push(v);
          }
        }
        this.activeVoices = remaining;
      }

      const currentBar = Math.floor(relTick / ticksPerBar) + 1;
      const tickInBar = relTick % ticksPerBar;
      const currentBeat = Math.floor(tickInBar / division) + 1;

      // 找出當前正在發聲的音符
      const activeNoteNumbers: number[] = [];
      for (const n of this.scheduledNotes) {
        const nRelStart = n.startTick - gridStartTick;
        const nRelEnd = nRelStart + n.durationTick;
        if (relTick >= nRelStart && relTick < nRelEnd) {
          activeNoteNumbers.push(n.note);
        }
      }

      if (this.playbackOptions.onProgress) {
        this.playbackOptions.onProgress({
          currentTick,
          relTick,
          currentBar,
          currentBeat,
          progress,
          activeNoteNumbers,
        });
      }

      if (this.playbackSessionId === sessionId && this.isCurrentlyPlaying) {
        this.animFrameId = requestAnimationFrame(updateLoop);
      }
    };

    this.animFrameId = requestAnimationFrame(updateLoop);
  }

  // --- Web MIDI 支援 (委託至 midiManager) ---

  public getMidiManager() {
    return midiManager;
  }

  public async requestMidiAccess(): Promise<string[]> {
    const res = await midiManager.requestAccess();
    return res.devices.map(d => d.name);
  }

  public selectMidiOutput(nameOrId: string) {
    midiManager.selectOutput(nameOrId);
  }
}

// 導出全域單例引擎實例
export const audioEngine = new AudioEngine();
