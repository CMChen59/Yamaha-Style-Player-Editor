import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  midiToFreq,
  ticksToSeconds,
  secondsToTicks,
  AudioEngine,
} from '../src/core/audio/audio-engine';

describe('Web Audio 試聽引擎單元測試 (Audio Engine)', () => {
  it('midiToFreq 頻率計算符合十二平均律標準', () => {
    // A4 (MIDI 69) = 440 Hz
    expect(midiToFreq(69)).toBeCloseTo(440.0, 1);

    // A5 (MIDI 81) = 880 Hz
    expect(midiToFreq(81)).toBeCloseTo(880.0, 1);

    // A3 (MIDI 57) = 220 Hz
    expect(midiToFreq(57)).toBeCloseTo(220.0, 1);

    // Middle C (C4, MIDI 60) ≈ 261.63 Hz
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('ticksToSeconds 與 secondsToTicks 能精確互換換算', () => {
    const bpm = 120;
    const division = 96; // PPQ

    // 在 120 BPM 下，1 拍 = 0.5 秒 = 96 Ticks
    const oneBeatSec = ticksToSeconds(96, bpm, division);
    expect(oneBeatSec).toBeCloseTo(0.5, 4);

    const backToTicks = secondsToTicks(oneBeatSec, bpm, division);
    expect(backToTicks).toBeCloseTo(96, 2);

    // 1 小節 (4 拍 = 384 Ticks) = 2.0 秒
    const oneBarSec = ticksToSeconds(384, bpm, division);
    expect(oneBarSec).toBeCloseTo(2.0, 4);

    // 換個不同速度 (140 BPM, 480 PPQ)
    const customSec = ticksToSeconds(480, 140, 480);
    expect(customSec).toBeCloseTo(60 / 140, 4);
  });

  describe('AudioEngine 生命週期與狀態管理', () => {
    let engine: AudioEngine;

    beforeEach(() => {
      engine = new AudioEngine();
    });

    afterEach(() => {
      engine.stop();
    });

    it('預設未播放狀態為 idle', () => {
      expect(engine.isPlaying()).toBe(false);
      expect(engine.getPlayingPadNum()).toBeNull();
      expect(engine.isBackingTrackPlaying()).toBe(false);
    });

    it('呼叫 stop() 在無播放時能安全返回', () => {
      expect(() => engine.stop()).not.toThrow();
      expect(engine.isPlaying()).toBe(false);
      expect(engine.isBackingTrackPlaying()).toBe(false);
    });

    it('2.8-A: 疊錄伴奏音量調節與安全停止 (Backing Track Lifecycle)', () => {
      expect(() => engine.setBackingVolume(0.8)).not.toThrow();
      expect(() => engine.setBackingVolume(-0.5)).not.toThrow();
      expect(() => engine.setBackingVolume(1.5)).not.toThrow();

      // 在無音頻環境呼叫 stopBackingTrack 能安全退出
      expect(() => engine.stopBackingTrack()).not.toThrow();
      expect(engine.isBackingTrackPlaying()).toBe(false);

      // 當傳入空音軌清單時，startBackingTrack 不會拋錯且維持非播放狀態
      engine.startBackingTrack([], { bpm: 120 });
      expect(engine.isBackingTrackPlaying()).toBe(false);
    });

    it('2.8-E: playAuditionPhrase 多音符短句與和弦試聽安全穩定 (Multi-Note & Chord Audition)', () => {
      // 1. 空清單安全返回
      expect(() => engine.playAuditionPhrase([])).not.toThrow();

      // 2. 和弦音符 (多顆同時同拍起音) 呼叫安全無拋錯
      expect(() => {
        engine.playAuditionPhrase([
          { note: 60, startSec: 0, durationSec: 0.5, velocity: 80 },
          { note: 64, startSec: 0, durationSec: 0.5, velocity: 85 },
          { note: 67, startSec: 0, durationSec: 0.5, velocity: 90 },
        ], { channel: 0, msb: 104, lsb: 1, pc: 0 });
      }).not.toThrow();

      // 3. 單音 playAuditionNote 能安全調用
      expect(() => {
        engine.playAuditionNote(62, 0.4, { channel: 0, msb: 104, lsb: 1, pc: 0, volume: 100 });
      }).not.toThrow();

      // 4. 調用 stop() 清理定時器
      expect(() => engine.stop()).not.toThrow();
    });
  });
});
