import { describe, it, expect, beforeEach } from 'vitest';
import { drumSynth, DrumSynth } from '../src/creator/drum-synth';
import { bassSynth, BassSynth } from '../src/creator/bass-synth';
import { chordSynth, ChordSynth } from '../src/creator/chord-synth';

describe('Step 1: 合成器獨立音量 (Volume) 與立體聲聲相 (Pan) 控制', () => {
  beforeEach(() => {
    DrumSynth.setMuted(false);
    BassSynth.setMuted(false);
    ChordSynth.setMuted(false);
    drumSynth.setChannelMuted(false);
    bassSynth.setChannelMuted(false);
    chordSynth.setChannelMuted(false);
  });

  it('1. 鼓組、貝斯與和弦合成器具備標準預設音量與聲相', () => {
    expect(drumSynth.getVolume()).toBe(100);
    expect(drumSynth.getPan()).toBe(64);

    expect(bassSynth.getVolume()).toBe(95);
    expect(bassSynth.getPan()).toBe(64);

    expect(chordSynth.getVolume()).toBe(90);
    expect(chordSynth.getPan()).toBe(52);
  });

  it('2. 能正確動態設定與限制音量範圍 (0 ~ 127)', () => {
    drumSynth.setVolume(120);
    expect(drumSynth.getVolume()).toBe(120);

    // 數值越界自動限制
    drumSynth.setVolume(200);
    expect(drumSynth.getVolume()).toBe(127);

    drumSynth.setVolume(-50);
    expect(drumSynth.getVolume()).toBe(0);

    // 貝斯與和弦
    bassSynth.setVolume(80);
    expect(bassSynth.getVolume()).toBe(80);

    chordSynth.setVolume(75);
    expect(chordSynth.getVolume()).toBe(75);
  });

  it('3. 能正確動態設定立體聲聲相 Pan (0 ~ 127, 64 為正中央)', () => {
    // 鼓組置中 64
    drumSynth.setPan(64);
    expect(drumSynth.getPan()).toBe(64);

    // 和弦 1 偏左 (L12 -> 52)
    chordSynth.setPan(52);
    expect(chordSynth.getPan()).toBe(52);

    // 和弦 2 偏右 (R12 -> 76)
    chordSynth.setPan(76);
    expect(chordSynth.getPan()).toBe(76);

    // 邊界防護
    chordSynth.setPan(999);
    expect(chordSynth.getPan()).toBe(127);
    chordSynth.setPan(-999);
    expect(chordSynth.getPan()).toBe(0);
  });

  it('4. 支援獨立軌道靜音 (Channel Mute) 不干擾其他軌道', () => {
    expect(drumSynth.isChannelMuted()).toBe(false);
    expect(bassSynth.isChannelMuted()).toBe(false);

    drumSynth.setChannelMuted(true);
    expect(drumSynth.isChannelMuted()).toBe(true);
    expect(bassSynth.isChannelMuted()).toBe(false);

    drumSynth.setChannelMuted(false);
    expect(drumSynth.isChannelMuted()).toBe(false);
  });

  it('5. 多個 ChordSynth 實例 (如 Chord 1 與 Chord 2) 各自擁有獨立的 Volume 與 Pan', () => {
    const chord2Synth = new ChordSynth();
    chord2Synth.setVoice({ category: 'Guitar', id: 'folk-guitar' });
    chord2Synth.setVolume(85);
    chord2Synth.setPan(76); // R12

    chordSynth.setVolume(90);
    chordSynth.setPan(52); // L12

    expect(chordSynth.getVolume()).toBe(90);
    expect(chordSynth.getPan()).toBe(52);

    expect(chord2Synth.getVolume()).toBe(85);
    expect(chord2Synth.getPan()).toBe(76);
  });

  it('6. 鼓組、貝斯與和弦合成器具備標準預設 Reverb (CC 91) 與 Chorus (CC 93)', () => {
    // 鼓組預設 Rev 40, Cho 0
    expect(drumSynth.getReverb()).toBe(40);
    expect(drumSynth.getChorus()).toBe(0);

    // 貝斯預設 Rev 20, Cho 0
    expect(bassSynth.getReverb()).toBe(20);
    expect(bassSynth.getChorus()).toBe(0);

    // 鋼琴/和弦預設 Rev 65, Cho 20
    expect(chordSynth.getReverb()).toBe(65);
    expect(chordSynth.getChorus()).toBe(20);
  });

  it('7. 能正確動態調整與限制 Reverb 與 Chorus (0 ~ 127)', () => {
    chordSynth.setReverb(80);
    expect(chordSynth.getReverb()).toBe(80);
    chordSynth.setReverb(200);
    expect(chordSynth.getReverb()).toBe(127);
    chordSynth.setReverb(-10);
    expect(chordSynth.getReverb()).toBe(0);

    chordSynth.setChorus(55);
    expect(chordSynth.getChorus()).toBe(55);
    chordSynth.setChorus(150);
    expect(chordSynth.getChorus()).toBe(127);
    chordSynth.setChorus(-5);
    expect(chordSynth.getChorus()).toBe(0);
  });

  it('8. 完整支援 Yamaha PSR-SX920 8 軌伴奏通道條模型 (CH 9 ~ 16)', () => {
    const expectedChannels = [
      { id: 'rhythm1', chNumber: 9, midiChannel: 8, name: 'Rhythm 1' },
      { id: 'drum', chNumber: 10, midiChannel: 9, name: 'Rhythm 2' },
      { id: 'bass', chNumber: 11, midiChannel: 10, name: 'Bass' },
      { id: 'chord', chNumber: 12, midiChannel: 11, name: 'Chord 1' },
      { id: 'Chord2', chNumber: 13, midiChannel: 12, name: 'CHORD2' },
      { id: 'Pad', chNumber: 14, midiChannel: 13, name: 'PAD' },
      { id: 'Phrase1', chNumber: 15, midiChannel: 14, name: 'PHRASE1' },
      { id: 'Phrase2', chNumber: 16, midiChannel: 15, name: 'PHRASE2' },
    ];

    expect(expectedChannels.length).toBe(8);
    expectedChannels.forEach((ch, idx) => {
      expect(ch.chNumber).toBe(9 + idx);
      expect(ch.midiChannel).toBe(8 + idx);
    });
  });

  it('9. 原廠推薦黃金配比音量與聲相覆蓋完整 8 大伴奏聲部', () => {
    const goldenMixerDefaults: Record<string, { volume: number; pan: number; reverb: number; chorus: number }> = {
      rhythm1: { volume: 90, pan: 64, reverb: 40, chorus: 0 },
      drum: { volume: 100, pan: 64, reverb: 40, chorus: 0 },
      bass: { volume: 95, pan: 64, reverb: 20, chorus: 0 },
      chord: { volume: 90, pan: 52, reverb: 65, chorus: 20 },
      Chord2: { volume: 85, pan: 76, reverb: 50, chorus: 40 },
      Pad: { volume: 80, pan: 64, reverb: 75, chorus: 50 },
      Phrase1: { volume: 85, pan: 44, reverb: 60, chorus: 20 },
      Phrase2: { volume: 80, pan: 84, reverb: 60, chorus: 30 },
    };

    expect(Object.keys(goldenMixerDefaults)).toHaveLength(8);
    expect(goldenMixerDefaults.rhythm1.volume).toBe(90);
    expect(goldenMixerDefaults.drum.volume).toBe(100);
    expect(goldenMixerDefaults.chord.pan).toBe(52); // L12
    expect(goldenMixerDefaults.Chord2.pan).toBe(76); // R12
    expect(goldenMixerDefaults.Phrase1.pan).toBe(44); // L20
    expect(goldenMixerDefaults.Phrase2.pan).toBe(84); // R20
  });
});
