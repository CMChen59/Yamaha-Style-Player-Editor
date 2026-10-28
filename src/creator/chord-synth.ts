/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 多樂器物理諧波和弦合成器 (Chord Synth - Web Audio API)
 * 支援複音 (Polyphony) 與多種樂器家族真實物理合成模型：
 * 鋼琴 (Piano)、電鋼琴 (E.Piano FM)、木/電吉他 (Guitar Pluck)、
 * 弦樂合奏 (Strings Detune)、銅管 (Brass Sweep)、薩克斯風 (Sax)、
 * 風琴 (Organ Drawbar)、手風琴 (Accordion)、氛圍長音 (Pad)、人聲 (Choir)
 */

import { getSharedAudioContext } from './shared-audio-context';

export class ChordSynth {
  private static muted: boolean = false;
  private isInstanceMuted: boolean = false;
  private static sharedCtx: AudioContext | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private volume: number = 90; // 0 ~ 127 (Yamaha PSR-SX920 Chord 1 預設 90)
  private pan: number = 52;    // 0 ~ 127 (Yamaha PSR-SX920 Chord 1 預設 52 = L12)
  private reverb: number = 65; // 0 ~ 127 (CC 91 殘響，Yamaha 鋼琴/和弦預設 65)
  private chorus: number = 20; // 0 ~ 127 (CC 93 合唱，Yamaha 鋼琴/和弦預設 20)
  private currentCategory: string = 'Piano';
  private currentVoiceId: string = 'concert-grand';

  public static setMuted(muted: boolean) {
    ChordSynth.muted = muted;
  }

  public static isMuted(): boolean {
    return ChordSynth.muted;
  }

  public setMuted(muted: boolean) {
    ChordSynth.muted = muted;
  }

  public setChannelMuted(muted: boolean) {
    this.isInstanceMuted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = muted ? 0 : (this.volume / 127) * 0.75;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.02);
    }
  }

  public isChannelMuted(): boolean {
    return this.isInstanceMuted;
  }

  constructor() {
    // 延遲至首次發聲時初始化 AudioContext
  }

  public setVoice(voice: { category?: string; id?: string; name?: string }) {
    if (voice.category) {
      this.currentCategory = voice.category;
    }
    if (voice.id) {
      this.currentVoiceId = voice.id;
    }
  }

  public getCategory(): string {
    return this.currentCategory;
  }

  public getVoiceId(): string {
    return this.currentVoiceId;
  }

  private initAudio() {
    const shared = getSharedAudioContext();
    if (shared) {
      ChordSynth.sharedCtx = shared;
    } else if (!ChordSynth.sharedCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      ChordSynth.sharedCtx = new AudioCtxClass();
    }
    if (this.ctx !== ChordSynth.sharedCtx) {
      this.ctx = ChordSynth.sharedCtx;
      this.masterGain = null;
      this.pannerNode = null;
    }
    if (!this.ctx) return;
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      const currentGain = this.isInstanceMuted ? 0 : (this.volume / 127) * 0.75;
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
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(127, Math.round(vol)));
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = this.isInstanceMuted ? 0 : (this.volume / 127) * 0.75;
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

  /**
   * 播放和弦單音 (支援多音同時呼叫以構成複音和弦)
   * @param note MIDI 音高 (例如 60 = C4, 64 = E4, 67 = G4)
   * @param velocity 力度 (0 ~ 127)
   * @param durationMs 發聲長度 (毫秒)
   */
  public playNote(note: number, velocity: number = 100, durationMs: number = 450, when?: number) {
    if (ChordSynth.muted || this.isInstanceMuted) return;
    // 濾除 Yamaha MegaVoice 特效/雜音鍵 (吉他/琴類的滑弦、打板音常映射於 > 108，軟體振盪器會產生極高頻刺耳聲)
    if (note < 12 || note > 108) return;
    this.initAudio();
    if (!this.ctx || !this.masterGain) return;

    const now = when !== undefined ? when : this.ctx.currentTime;
    const freq = this.midiToFreq(note);
    const velRatio = Math.max(0.15, Math.min(1.0, velocity / 127));
    const durSec = Math.max(0.12, durationMs / 1000);

    const cat = this.currentCategory;

    if (cat === 'Guitar') {
      this.synthesizeGuitar(freq, now, durSec, velRatio);
    } else if (cat === 'E.Piano') {
      this.synthesizeEPiano(freq, now, durSec, velRatio);
    } else if (cat === 'Strings') {
      this.synthesizeStrings(freq, now, durSec, velRatio);
    } else if (cat === 'Brass' || cat === 'Saxophone') {
      this.synthesizeBrass(freq, now, durSec, velRatio, cat === 'Saxophone');
    } else if (cat === 'Organ' || cat === 'Accordion') {
      this.synthesizeOrgan(freq, now, durSec, velRatio);
    } else if (cat === 'Pad') {
      this.synthesizePad(freq, now, durSec, velRatio);
    } else if (cat === 'Choir') {
      this.synthesizeChoir(freq, now, durSec, velRatio);
    } else if (cat === 'Synth') {
      this.synthesizeSynth(freq, now, durSec, velRatio);
    } else {
      // 預設為原聲鋼琴 (Piano)
      this.synthesizePiano(freq, now, durSec, velRatio);
    }
  }

  /**
   * 1. 原聲鋼琴 (Piano): 雙振盪器 + 琴槌擊弦木質低通濾波
   */
  private synthesizePiano(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(1.5, now);
    filter.frequency.setValueAtTime(Math.min(6000, freq * 5 * velRatio), now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(2000, freq * 2), now + 0.15);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.5 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.006);
    noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.45, now + durSec * 0.4);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.25, now);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);

    osc1.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durSec + 0.05);
    osc2.stop(now + durSec + 0.05);

    this.scheduleCleanup([osc1, osc2, osc2Gain, filter, noteGain], durSec + 0.1, now);
  }

  /**
   * 2. 電鋼琴 (E.Piano): 經典 FM 頻率調製 (DX7 / Rhodes) 晶瑩鈴音
   */
  private synthesizeEPiano(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    // Carrier 正弦載波
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, now);

    // Modulator 調製波 (2x 頻率產生典型 DX7 諧波鈴聲)
    const modulator = this.ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(freq * 2, now);

    const modGain = this.ctx.createGain();
    // 調製深度隨力度加強
    const modDepth = freq * 1.8 * velRatio;
    modGain.gain.setValueAtTime(modDepth, now);
    modGain.gain.exponentialRampToValueAtTime(modDepth * 0.15, now + 0.25);
    modGain.gain.exponentialRampToValueAtTime(0.001, now + durSec);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.55 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
    noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.5, now + durSec * 0.5);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    carrier.connect(noteGain);
    noteGain.connect(this.masterGain);

    modulator.start(now);
    carrier.start(now);
    modulator.stop(now + durSec + 0.05);
    carrier.stop(now + durSec + 0.05);

    this.scheduleCleanup([carrier, modulator, modGain, noteGain], durSec + 0.1, now);
  }

  /**
   * 3. 吉他 (Guitar): 鋸齒弦振 + 撥弦濾波 (Pluck Filter Envelope)
   */
  private synthesizeGuitar(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    // 吉他琴弦撥弦濾波器：起音開展至 4.5kHz，快速衰減至木質共振 (1.2kHz)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.0, now);
    filter.frequency.setValueAtTime(Math.min(5000, freq * 6 * velRatio), now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(1500, freq * 2), now + 0.12);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.48 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.004); // 4ms 極速撥弦
    noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.35, now + 0.18);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + durSec + 0.05);

    this.scheduleCleanup([osc, filter, noteGain], durSec + 0.1, now);
  }

  /**
   * 4. 弦樂 (Strings): 雙鋸齒波失諧 (Detune) + 柔和慢起音
   */
  private synthesizeStrings(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, now);

    // 雙波失諧創造大編制弦樂 Chorus 感
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.0035, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(3800, freq * 4), now);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.42 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    // 弦樂柔和慢起音 (50ms)
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.06);
    noteGain.gain.setValueAtTime(peakGain * 0.9, now + Math.max(0.08, durSec - 0.08));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec + 0.12);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durSec + 0.15);
    osc2.stop(now + durSec + 0.15);

    this.scheduleCleanup([osc1, osc2, filter, noteGain], durSec + 0.2, now);
  }

  /**
   * 5. 銅管/薩克斯風 (Brass & Saxophone): 號角開展動態濾波 (Filter Sweep)
   */
  private synthesizeBrass(freq: number, now: number, durSec: number, velRatio: number, isSax: boolean = false) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = isSax ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(isSax ? 2.5 : 1.8, now);
    // 銅管起音瞬間爆發 (Filter Sweep)
    filter.frequency.setValueAtTime(freq * 1.5, now);
    filter.frequency.linearRampToValueAtTime(Math.min(5000, freq * 5), now + 0.04);
    filter.frequency.setValueAtTime(Math.min(3500, freq * 3.5), now + durSec);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.46 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.035);
    noteGain.gain.setValueAtTime(peakGain * 0.85, now + Math.max(0.05, durSec - 0.04));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec + 0.06);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + durSec + 0.08);

    this.scheduleCleanup([osc, filter, noteGain], durSec + 0.12, now);
  }

  /**
   * 6. 風琴 / 手風琴 (Organ & Accordion): 多正弦音栓 (Drawbars) + 恆定 Sustain
   */
  private synthesizeOrgan(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    // 模擬 Hammond Drawbar (8' 基音 + 4' 高八度 + 2' 雙八度)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 4, now);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.38 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    // 快速 Attack (5ms)
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.005);
    // 風琴不衰減，直到 Release
    noteGain.gain.setValueAtTime(peakGain, now + Math.max(0.02, durSec - 0.03));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec + 0.04);

    const mixGain = this.ctx.createGain();
    mixGain.gain.setValueAtTime(0.4, now);

    osc1.connect(noteGain);
    osc2.connect(mixGain);
    osc3.connect(mixGain);
    mixGain.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + durSec + 0.06);
    osc2.stop(now + durSec + 0.06);
    osc3.stop(now + durSec + 0.06);

    this.scheduleCleanup([osc1, osc2, osc3, mixGain, noteGain], durSec + 0.1, now);
  }

  /**
   * 7. 氛圍長音 (Pad): 慢起音 (120ms) + 溫暖低通 + 長釋音
   */
  private synthesizePad(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.002, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2200, freq * 3), now);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.40 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    // 慢起音淡入 (120ms)
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.12);
    noteGain.gain.setValueAtTime(peakGain * 0.9, now + Math.max(0.15, durSec - 0.05));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec + 0.25);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durSec + 0.3);
    osc2.stop(now + durSec + 0.3);

    this.scheduleCleanup([osc1, osc2, filter, noteGain], durSec + 0.35, now);
  }

  /**
   * 8. 人聲合唱 (Choir): 共鳴峰 (Formant) 人聲音色
   */
  private synthesizeChoir(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    // Formant 人聲帶通濾波器 (模擬人聲 "Ah" ~800Hz / 1200Hz)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(400, Math.min(1800, freq * 1.8)), now);
    filter.Q.setValueAtTime(2.2, now);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.48 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.08);
    noteGain.gain.setValueAtTime(peakGain * 0.85, now + Math.max(0.1, durSec - 0.05));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec + 0.15);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + durSec + 0.18);

    this.scheduleCleanup([osc, filter, noteGain], durSec + 0.22, now);
  }

  /**
   * 9. 合成器主奏/和弦 (Synth): 經典類比鋸齒波 + 諧振濾波
   */
  private synthesizeSynth(freq: number, now: number, durSec: number, velRatio: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(3.5, now);
    filter.frequency.setValueAtTime(freq * 6, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.15);

    const noteGain = this.ctx.createGain();
    const peakGain = 0.44 * velRatio;
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
    noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.6, now + 0.15);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + durSec + 0.05);

    this.scheduleCleanup([osc, filter, noteGain], durSec + 0.1, now);
  }

  private scheduleCleanup(nodes: any[], delaySec: number, startTime?: number) {
    const baseTime = startTime !== undefined && this.ctx ? (startTime - this.ctx.currentTime) : 0;
    const totalDelayMs = Math.max(50, (baseTime + delaySec) * 1000);
    setTimeout(() => {
      try {
        nodes.forEach(n => {
          if (n && typeof n.disconnect === 'function') {
            n.disconnect();
          }
        });
      } catch (_) {}
    }, totalDelayMs);
  }

  /**
   * 播放一組完整和弦 (例如 [60, 64, 67])
   */
  public playChord(notes: number[], velocity: number = 100, durationMs: number = 450, when?: number) {
    for (const n of notes) {
      this.playNote(n, velocity, durationMs, when);
    }
  }
}

export const chordSynth = new ChordSynth();
