import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { PitchTransposer } from '../src/core/writer/pitch-transposer';

describe('全聲部動態打擊樂/旋律樂器判定與轉調防護測試', () => {
  it('1. 驗證 4006 Intro A 的 Ch 8 為 Pizzicato Strings (旋律性)，非鼓組，必須跟隨和弦轉調', () => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty'));
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    // Ch 8 是 Pizzicato Strings (Strings 分類)
    const voiceCh8 = styPlaybackEngine.getPartVoices().get(8);
    expect(voiceCh8?.voiceName).toContain('Pizzicato');
    expect(voiceCh8?.category).toBe('Strings');

    // 驗證 isChannelDrum 判定
    expect(styPlaybackEngine.isChannelDrum(8)).toBe(false); // Ch 8 是旋律樂器
    expect(styPlaybackEngine.isChannelDrum(9)).toBe(true);  // Ch 9 是 Pop Drum Kit

    // 原始 C5 音符 (72)
    const origNote = 72;
    const chordAm = ChordTransposer.buildChord('A', 'm');

    // Ch 8 Pizzicato Strings 正常轉調至 A4 (72 - 3 = 69)
    const isDrumCh8 = styPlaybackEngine.isChannelDrum(8);
    const melodicPitch = ChordTransposer.transposeSingleNote(origNote, chordAm, 8, isDrumCh8);
    expect(melodicPitch).toBe(69);
  });

  it('2. 驗證若在 CH 10 (Bass) 或 CH 11 (Chord 1) 設定為打擊樂器，系統自動識別為鼓組並跳過轉調 (保護鼓位)', () => {
    // 模擬在 CH 11 (Chord 1) 設定了 Latin Percussion (拉丁打擊樂，MSB 127, 分類 Drums)
    styPlaybackEngine.setChannelVoice(11, {
      msb: 127,
      lsb: 0,
      pc: 56,
      name: 'Latin Percussion Kit',
      category: 'Drums',
      key: '127-0-56',
    });

    // 驗證 isChannelDrum(11) 自動識別為打擊樂
    expect(styPlaybackEngine.isChannelDrum(11)).toBe(true);

    // 測試移調轉調行為：因為是打擊樂，音高必須嚴格保持原音 (Bypass)
    const origCongaNote = 64; // 低音康加鼓音高
    const chordAm = ChordTransposer.buildChord('A', 'm');

    const isDrumCh11 = styPlaybackEngine.isChannelDrum(11);
    const resultPitch = ChordTransposer.transposeSingleNote(origCongaNote, chordAm, 11, isDrumCh11);
    expect(resultPitch).toBe(64); // 嚴格不轉調，康加鼓位置完全不走音！

    // 同步驗證 PitchTransposer 編輯器移調防護
    const testNotes = [{ noteNumber: 64, velocity: 100, durationTicks: 240 }];
    const transposeRes = PitchTransposer.transposeNotes(testNotes, 3, {
      channel: 11,
      isDrum: styPlaybackEngine.isChannelDrum(11),
    });
    expect(transposeRes.isDrumWarning).toBe(true);
    expect(transposeRes.notes[0].noteNumber).toBe(64);
  });
});
