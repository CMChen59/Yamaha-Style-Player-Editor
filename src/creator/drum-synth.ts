/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 極簡零延遲打擊樂合成音效引擎 (Drum Synthesizer)
 * 基於 Web Audio API 實現即時物理建模發聲，無需外掛龐大採樣檔案。
 * 支援獨立音軌立體聲聲相 (StereoPannerNode) 與軌道主音量 (GainNode) 調控。
 */

import { getSharedAudioContext } from './shared-audio-context';

export class DrumSynth {
  private static muted: boolean = false;
  private isInstanceMuted: boolean = false;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private channelGain: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private volume: number = 100; // 0 ~ 127 (Yamaha PSR-SX920 Rhythm 2 預設 100)
  private pan: number = 64;     // 0 ~ 127 (中央 64)
  private reverb: number = 40;  // 0 ~ 127 (CC 91 殘響，Yamaha 鼓組預設 40)
  private chorus: number = 0;   // 0 ~ 127 (CC 93 合唱，Yamaha 鼓組預設 0)

  public static setMuted(muted: boolean) {
    DrumSynth.muted = muted;
  }

  public static isMuted(): boolean {
    return DrumSynth.muted;
  }

  public setMuted(muted: boolean) {
    DrumSynth.muted = muted;
  }

  public setChannelMuted(muted: boolean) {
    this.isInstanceMuted = muted;
    if (this.channelGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = muted ? 0 : (this.volume / 127);
      this.channelGain.gain.cancelScheduledValues(now);
      this.channelGain.gain.setValueAtTime(this.channelGain.gain.value, now);
      this.channelGain.gain.linearRampToValueAtTime(targetGain, now + 0.02);
    }
  }

  public isChannelMuted(): boolean {
    return this.isInstanceMuted;
  }

  constructor() {
    // 延遲初始化，待使用者首次互動啟動 AudioContext
  }

  private ensureContext(): AudioContext {
    const shared = getSharedAudioContext();
    if (shared) {
      if (this.ctx !== shared) {
        this.ctx = shared;
        this.channelGain = null;
        this.pannerNode = null;
        this.buildNoiseBuffer();
      }
      return this.ctx;
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private buildNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 秒白噪音緩衝
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  private getOutputNode(): AudioNode {
    const ctx = this.ensureContext();
    if (!this.channelGain) {
      this.channelGain = ctx.createGain();
      const currentGain = this.isInstanceMuted ? 0 : (this.volume / 127);
      this.channelGain.gain.setValueAtTime(currentGain, ctx.currentTime);

      if (typeof ctx.createStereoPanner === 'function') {
        this.pannerNode = ctx.createStereoPanner();
        const panValue = Math.max(-1, Math.min(1, (this.pan - 64) / 64));
        this.pannerNode.pan.setValueAtTime(panValue, ctx.currentTime);
        this.channelGain.connect(this.pannerNode);
        this.pannerNode.connect(ctx.destination);
      } else {
        this.channelGain.connect(ctx.destination);
      }
    }
    return this.channelGain;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(127, Math.round(vol)));
    if (this.channelGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = this.isInstanceMuted ? 0 : (this.volume / 127);
      this.channelGain.gain.cancelScheduledValues(now);
      this.channelGain.gain.setValueAtTime(this.channelGain.gain.value, now);
      this.channelGain.gain.linearRampToValueAtTime(targetGain, now + 0.02);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setPan(pan: number) {
    this.pan = Math.max(0, Math.min(127, Math.round(pan)));
    if (this.pannerNode && this.ctx) {
      const now = this.ctx.currentTime;
      const panValue = Math.max(-1, Math.min(1, (this.pan - 64) / 64));
      this.pannerNode.pan.cancelScheduledValues(now);
      this.pannerNode.pan.setValueAtTime(this.pannerNode.pan.value, now);
      this.pannerNode.pan.linearRampToValueAtTime(panValue, now + 0.02);
    }
  }

  public getPan(): number {
    return this.pan;
  }

  public setReverb(rev: number) {
    this.reverb = Math.max(0, Math.min(127, Math.round(rev)));
  }

  public getReverb(): number {
    return this.reverb;
  }

  public setChorus(cho: number) {
    this.chorus = Math.max(0, Math.min(127, Math.round(cho)));
  }

  public getChorus(): number {
    return this.chorus;
  }

  /**
   * 播放大鼓 (Kick Drum / MIDI 36)
   */
  public playKick(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.12);

    gainNode.gain.setValueAtTime(gain * 1.0, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gainNode);
    gainNode.connect(this.getOutputNode());

    osc.start(now);
    osc.stop(now + 0.32);
  }

  /**
   * 播放小鼓 (Snare Drum / MIDI 38)
   */
  public playSnare(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    oscGain.gain.setValueAtTime(gain * 0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(this.getOutputNode());
    osc.start(now);
    osc.stop(now + 0.13);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1200, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(gain * 0.8, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.getOutputNode());

      noise.start(now);
      noise.stop(now + 0.22);
    }
  }

  /**
   * 敲框音 (Side Stick / Rimshot / MIDI 37)
   */
  public playRimshot(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);

    gainNode.gain.setValueAtTime(gain * 0.85, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gainNode);
    gainNode.connect(this.getOutputNode());
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * 拍手 (Hand Clap / MIDI 39)
   */
  public playClap(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;
    if (!this.noiseBuffer) return;

    for (let i = 0; i < 3; i++) {
      const offset = i * 0.012;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now + offset);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(gain * (i === 2 ? 0.9 : 0.5), now + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + offset + (i === 2 ? 0.15 : 0.02));

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.getOutputNode());

      noise.start(now + offset);
      noise.stop(now + offset + (i === 2 ? 0.16 : 0.03));
    }
  }

  /**
   * 播放閉鈸 (Closed Hi-Hat / MIDI 42)
   */
  public playHiHat(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain * 0.55, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.getOutputNode());

    noise.start(now);
    noise.stop(now + 0.06);
  }

  /**
   * 播放開鈸 (Open Hi-Hat / MIDI 46)
   */
  public playOpenHat(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain * 0.65, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.getOutputNode());

    noise.start(now);
    noise.stop(now + 0.38);
  }

  /**
   * 播放碎音鈸 (Crash Cymbal / MIDI 49)
   */
  public playCrash(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    if (!this.noiseBuffer) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(5500, now);
    filter.Q.value = 1.2;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain * 0.75, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.getOutputNode());

    noise.start(now);
    noise.stop(now + 1.25);
  }

  /**
   * 叮叮鈸 (Ride Cymbal / MIDI 51)
   */
  public playRide(velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    // 金屬鈴聲諧波 + 脆鈸聲
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.setValueAtTime(820, now);
    oscGain.gain.setValueAtTime(gain * 0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(oscGain);
    oscGain.connect(this.getOutputNode());
    osc.start(now);
    osc.stop(now + 0.62);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7000, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(gain * 0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.getOutputNode());
      noise.start(now);
      noise.stop(now + 0.72);
    }
  }

  /**
   * 桶鼓 (Tom / MIDI 41~50)
   */
  public playTom(pitchFreq: number = 110, velocity: number = 100, when?: number) {
    const ctx = this.ensureContext();
    const now = when !== undefined ? when : ctx.currentTime;
    const gain = velocity / 127;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.frequency.setValueAtTime(pitchFreq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(pitchFreq, now + 0.15);

    gainNode.gain.setValueAtTime(gain * 0.85, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gainNode);
    gainNode.connect(this.getOutputNode());

    osc.start(now);
    osc.stop(now + 0.38);
  }

  /**
   * 根據 MIDI 音符號碼觸發對應樂器
   */
  public playNote(note: number, velocity: number = 100, when?: number) {
    if (DrumSynth.muted || this.isInstanceMuted) return;
    switch (note) {
      case 35:
      case 36: // B0/C1 Kick
        this.playKick(velocity, when);
        break;
      case 38: // D1 Snare
      case 40:
        this.playSnare(velocity, when);
        break;
      case 37: // C#1 Rimshot
        this.playRimshot(velocity, when);
        break;
      case 39: // D#1 Clap
        this.playClap(velocity, when);
        break;
      case 42: // F#1 Closed Hat
      case 44:
        this.playHiHat(velocity, when);
        break;
      case 46: // A#1 Open Hat
        this.playOpenHat(velocity, when);
        break;
      case 49: // C#2 Crash Cymbal
      case 57:
        this.playCrash(velocity, when);
        break;
      case 51: // D#2 Ride Cymbal
      case 59:
        this.playRide(velocity, when);
        break;
      case 41:
      case 43:
      case 45: // Low Tom
        this.playTom(90, velocity, when);
        break;
      case 47:
      case 48: // Mid Tom
        this.playTom(125, velocity, when);
        break;
      case 50:
      case 52: // High Tom
        this.playTom(170, velocity, when);
        break;
      case 54:
      case 70: // Tambourine / Maracas
        this.playHiHat(velocity, when);
        break;
      default:
        this.playHiHat(velocity, when);
        break;
    }
  }
}

export const drumSynth = new DrumSynth();
