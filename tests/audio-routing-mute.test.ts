/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 電腦端音效自動靜音 (Web Audio Mute on MIDI Connected) 測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DrumSynth, drumSynth } from '../src/creator/drum-synth';
import { BassSynth, bassSynth } from '../src/creator/bass-synth';
import { ChordSynth, chordSynth } from '../src/creator/chord-synth';
import { setComputerAudioMuted, isComputerAudioMuted } from '../src/creator/audio-routing';

describe('V2 Creator: 電腦端 Web Audio 智慧靜音控制', () => {
  beforeEach(() => {
    setComputerAudioMuted(false);
  });

  it('1. 預設狀態下電腦端合成器未靜音', () => {
    expect(isComputerAudioMuted()).toBe(false);
    expect(DrumSynth.isMuted()).toBe(false);
    expect(BassSynth.isMuted()).toBe(false);
    expect(ChordSynth.isMuted()).toBe(false);
  });

  it('2. 當呼叫 setComputerAudioMuted(true) 時，全體鼓組、貝斯與所有和弦合成器實例同步靜音', () => {
    setComputerAudioMuted(true);
    expect(isComputerAudioMuted()).toBe(true);
    expect(DrumSynth.isMuted()).toBe(true);
    expect(BassSynth.isMuted()).toBe(true);
    expect(ChordSynth.isMuted()).toBe(true);

    // 額外動態建立的 ChordSynth 實例亦繼承靜音設定
    const customChordSynth = new ChordSynth();
    expect(ChordSynth.isMuted()).toBe(true);
  });

  it('3. 當呼叫 setComputerAudioMuted(false) 時，全體合成器立即解除靜音恢復電腦發聲', () => {
    setComputerAudioMuted(true);
    expect(isComputerAudioMuted()).toBe(true);

    setComputerAudioMuted(false);
    expect(isComputerAudioMuted()).toBe(false);
    expect(DrumSynth.isMuted()).toBe(false);
    expect(BassSynth.isMuted()).toBe(false);
    expect(ChordSynth.isMuted()).toBe(false);
  });
});
