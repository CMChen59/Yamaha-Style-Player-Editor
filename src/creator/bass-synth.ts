/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 輕量純 Web Audio 類比低音合成器 (Bass Synth)
 * 支援多款貝斯物理模型：電貝斯 (Finger / Pick)、原聲低音大提琴 (Acoustic Upright)、
 * 擊弦貝斯 (Slap) 與合成重低音 (Sub Bass / Synth Bass)
 * 支援獨立音軌立體聲聲相 (StereoPannerNode) 與軌道主音量 (GainNode) 調控。
 */

import { getSharedAudioContext } from './shared-audio-context';

export class BassSynth {
  private static muted: boolean = false;
  private isInstanceMuted: boolean = false;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private volume: number = 95; // 0 ~ 127 (Yamaha PSR-SX920 Bass 預設 95)
  private pan: number = 64;    // 0 ~ 127 (中央 64)
  private reverb: number = 20; // 0 ~ 127 (CC 91 殘響，Yamaha 貝斯預設 20)
  private chorus: number = 0;  // 0 ~ 127 (CC 93 合唱，Yamaha 貝斯預設 0)
  private currentCategory: string = 'Electric';
  private currentVoiceId: string = 'finger-bass';

  public static setMuted(muted: boolean) {
    BassSynth.muted = muted;
  }

  public static isMuted(): boolean {
    return BassSynth.muted;
  }

  public setMuted(muted: boolean) {
    BassSynth.muted = muted;
  }

  public setChannelMuted(muted: boolean) {
    this.isInstanceMuted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = muted ? 0 : (this.volume / 127) * 0.8;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.02);
    }
  }

  public isChannelMuted(): boolean {
    return this.isInstanceMuted;
  }

  constructor() {
    // 延遲至首次點擊時初始化 AudioContext
  }

  public setVoice(voice: { category?: string; id?: string; name?: string }) {
    if (voice.category) {
      this.currentCategory = voice.category;
    }
    if (voice.id) {
      this.currentVoiceId = voice.id;
    }
  }

  private initAudio() {
    const shared = getSharedAudioContext();
    if (shared) {
      if (this.ctx !== shared) {
        this.ctx = shared;
        this.masterGain = null;
        this.pannerNode = null;
      }
    } else if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (!this.ctx) return;
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      const currentGain = this.isInstanceMuted ? 0 : (this.volume / 127) * 0.8;
      this.masterGain.gain.setValueAtTime(currentGain, this.ctx.currentTime);

      if (typeof this.ctx.createStereoPanner === 'function') {
        this.pannerNode = this.ctx.createStereoPanner();
        const panValue = Math.max(-1, Math.min(1, (this.pan - 64) / 64));
        this.pannerNode.pan.setValueAtTime(panValue, this.ctx.currentTime);
        this.masterGain.connect(this.pannerNode);
        this.pannerNode.connect(this.ctx.destination);
      } else {
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(127, Math.round(vol)));
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = this.isInstanceMuted ? 0 : (this.volume / 127) * 0.8;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.02);
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

  private midiToFreq(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  public playNote(note: number, velocity: number = 100, durationMs: number = 240, when?: number) {
    if (BassSynth.muted || this.isInstanceMuted) return;
    // 濾除 Yamaha MegaVoice 雜音/非正常貝斯音 (Bass 正常範圍約 24~84，雜音鍵常 mapped 於 > 96)
    if (note < 18 || note > 96) return;
    this.initAudio();
    if (!this.ctx || !this.masterGain) return;

    const now = when !== undefined ? when : this.ctx.currentTime;
    const freq = this.midiToFreq(note);
    const velRatio = Math.max(0.2, Math.min(1.0, velocity / 127));
    const durSec = Math.max(0.08, durationMs / 1000);
    const disconnectDelayMs = Math.max(50, (now - this.ctx.currentTime + durSec + 0.08) * 1000);

    const isAcoustic = this.currentCategory === 'Acoustic' || this.currentVoiceId.includes('acoustic');
    const isSynth = this.currentCategory === 'Synth' || this.currentVoiceId.includes('sub') || this.currentVoiceId.includes('synth');
    const isSlap = this.currentVoiceId.includes('slap');
    const isPick = this.currentVoiceId.includes('pick');

    if (isAcoustic) {
      // 原聲大提琴貝斯：三角波 + 正弦次重低音，溫暖木箱箱體共鳴 (180Hz)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 0.5, now); // 次低音

      const bodyFilter = this.ctx.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.setValueAtTime(180, now);
      bodyFilter.Q.setValueAtTime(2.0, now);
      bodyFilter.gain.setValueAtTime(4.5, now);

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(Math.min(3200, freq * 6), now);

      const ampGain = this.ctx.createGain();
      ampGain.gain.setValueAtTime(0.0001, now);
      ampGain.gain.linearRampToValueAtTime(velRatio * 0.85, now + 0.015);
      ampGain.gain.exponentialRampToValueAtTime(velRatio * 0.45, now + 0.2);
      ampGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

      osc1.connect(bodyFilter);
      osc2.connect(bodyFilter);
      bodyFilter.connect(lowpass);
      lowpass.connect(ampGain);
      ampGain.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durSec + 0.05);
      osc2.stop(now + durSec + 0.05);

      setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          bodyFilter.disconnect();
          lowpass.disconnect();
          ampGain.disconnect();
        } catch (_) {}
      }, disconnectDelayMs);

    } else if (isSynth) {
      // 合成貝斯 (Sub / Synth Bass)：厚重方波 + 鋸齒波，帶有經典 Moog 24dB 低通濾波器包絡
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(8, now); // 8 cent 微失諧營造肥厚感

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(6.0, now); // 諧振峰值
      const cutoffStart = Math.min(8000, freq * 8 * velRatio);
      const cutoffEnd = Math.max(120, freq * 1.5);
      filter.frequency.setValueAtTime(cutoffStart, now);
      filter.frequency.exponentialRampToValueAtTime(cutoffEnd, now + 0.18);

      const ampGain = this.ctx.createGain();
      ampGain.gain.setValueAtTime(0.0001, now);
      ampGain.gain.linearRampToValueAtTime(velRatio * 0.95, now + 0.008);
      ampGain.gain.exponentialRampToValueAtTime(velRatio * 0.6, now + 0.12);
      ampGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(ampGain);
      ampGain.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durSec + 0.05);
      osc2.stop(now + durSec + 0.05);

      setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          filter.disconnect();
          ampGain.disconnect();
        } catch (_) {}
      }, disconnectDelayMs);

    } else {
      // 電貝斯 (Finger / Pick / Slap)：經典 4 弦電貝斯，雙振盪器 (鋸齒 + 三角)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(isSlap ? 5.5 : isPick ? 4.5 : 3.8, now);

      const cutoffMultiplier = isSlap ? 12 : isPick ? 9 : 7;
      const filterCutoffStart = Math.min(5000, freq * cutoffMultiplier * velRatio);
      const filterCutoffSustain = Math.min(1400, freq * 2.5);
      filter.frequency.setValueAtTime(filterCutoffStart, now);
      filter.frequency.exponentialRampToValueAtTime(filterCutoffSustain, now + (isSlap ? 0.08 : 0.12));

      const ampGain = this.ctx.createGain();
      ampGain.gain.setValueAtTime(0.0001, now);
      ampGain.gain.linearRampToValueAtTime(velRatio * (isSlap ? 1.05 : 0.9), now + 0.005);
      ampGain.gain.exponentialRampToValueAtTime(velRatio * 0.5, now + 0.15);
      ampGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(ampGain);
      ampGain.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durSec + 0.05);
      osc2.stop(now + durSec + 0.05);

      setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          filter.disconnect();
          ampGain.disconnect();
        } catch (_) {}
      }, disconnectDelayMs);
    }
  }
}

export const bassSynth = new BassSynth();
