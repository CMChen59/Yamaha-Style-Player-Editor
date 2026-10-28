/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 動態伴奏通道 (Chord 2, Pad, Phrase 1, Phrase 2) 擴展與 SFF2 CASM 匯出驗證測試
 */

import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { StyleNoteEvent, StyleSectionConfig } from '../src/core/models/style-types';
import { AVAILABLE_CHORD_TRACK_CONFIGS } from '../src/creator/chord-roll-lite';
import { YAMAHA_SX920_CHORD_VOICES } from '../src/creator/chord-voices';
import { YAMAHA_SX920_BASS_VOICES } from '../src/creator/bass-voices';
import { YAMAHA_SX920_DRUM_KITS } from '../src/creator/drum-kits';

describe('V2 Creator: 動態伴奏通道擴展與 7~8 軌完整伴奏 SFF2 .STY 驗證', () => {
  it('1. AVAILABLE_CHORD_TRACK_CONFIGS 包含完整 4 組擴展通道 (Ch 13 ~ Ch 16) 且符合 SFF2 規範', () => {
    const keys = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    for (const key of keys) {
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[key];
      expect(cfg).toBeDefined();
      expect(cfg.canRemove).toBe(true);
      expect(cfg.channel).toBeGreaterThanOrEqual(12); // Ch 13 ~ 16 (0-indexed 12 ~ 15)
      expect(cfg.channel).toBeLessThanOrEqual(15);
      expect(cfg.panelCh).toBe(cfg.channel + 1);
    }

    expect(AVAILABLE_CHORD_TRACK_CONFIGS.Chord2.channel).toBe(12); // Ch 13
    expect(AVAILABLE_CHORD_TRACK_CONFIGS.Pad.channel).toBe(13); // Ch 14
    expect(AVAILABLE_CHORD_TRACK_CONFIGS.Phrase1.channel).toBe(14); // Ch 15
    expect(AVAILABLE_CHORD_TRACK_CONFIGS.Phrase2.channel).toBe(15); // Ch 16
  });

  it('2. 能同時匯出主鼓組 (Ch 10)、貝斯 (Ch 11)、和弦 1 (Ch 12)、和弦 2 (Ch 13)、氛圍墊音 (Ch 14)、裝飾短句 1 (Ch 15) 與短句 2 (Ch 16) 之 SFF2 CASM .STY 檔案', () => {
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4; // 1920
    const ticksPer16th = Math.round(ticksPerBar / 16); // 120

    const notes: StyleNoteEvent[] = [
      // 鼓組 (Ch 10 / index 9)
      { partId: 'Rhythm2', channel: 9, note: 36, startTick: 0, durationTick: 96, velocity: 100 },
      { partId: 'Rhythm2', channel: 9, note: 38, startTick: ticksPerBeat * 2, durationTick: 96, velocity: 100 },

      // 貝斯 (Ch 11 / index 10)
      { partId: 'Bass', channel: 10, note: 36, startTick: 0, durationTick: 240, velocity: 100 },
      { partId: 'Bass', channel: 10, note: 43, startTick: ticksPerBeat * 2, durationTick: 240, velocity: 100 },

      // 和弦 1 (Ch 12 / index 11) - 鋼琴柱狀和弦
      { partId: 'Chord1', channel: 11, note: 60, startTick: 0, durationTick: 360, velocity: 100 },
      { partId: 'Chord1', channel: 11, note: 64, startTick: 0, durationTick: 360, velocity: 100 },
      { partId: 'Chord1', channel: 11, note: 67, startTick: 0, durationTick: 360, velocity: 100 },

      // 和弦 2 (Ch 13 / index 12) - 民謠吉他刷弦
      { partId: 'Chord2', channel: 12, note: 48, startTick: 0, durationTick: 200, velocity: 90 },
      { partId: 'Chord2', channel: 12, note: 64, startTick: ticksPer16th * 2, durationTick: 200, velocity: 95 },

      // 氛圍墊音 (Ch 14 / index 13) - Pad 長音鋪底
      { partId: 'Pad', channel: 13, note: 60, startTick: 0, durationTick: ticksPerBar, velocity: 70 },
      { partId: 'Pad', channel: 13, note: 67, startTick: 0, durationTick: ticksPerBar, velocity: 70 },

      // 裝飾短句 1 (Ch 15 / index 14) - 銅管樂句
      { partId: 'Phrase1', channel: 14, note: 72, startTick: ticksPerBeat * 3, durationTick: 180, velocity: 105 },

      // 裝飾短句 2 (Ch 16 / index 15) - 薩克斯風尾音修飾
      { partId: 'Phrase2', channel: 15, note: 69, startTick: ticksPerBeat * 3 + ticksPer16th * 2, durationTick: 180, velocity: 100 },
    ];

    const kit = YAMAHA_SX920_DRUM_KITS[0];
    const bass = YAMAHA_SX920_BASS_VOICES[0];
    const chord1 = YAMAHA_SX920_CHORD_VOICES[0]; // Concert Grand
    const chord2 = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'steel-guitar') || YAMAHA_SX920_CHORD_VOICES[1];
    const pad = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'warm-pad') || YAMAHA_SX920_CHORD_VOICES[2];
    const phrase1 = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'pop-brass') || YAMAHA_SX920_CHORD_VOICES[3];
    const phrase2 = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'tenor-sax') || YAMAHA_SX920_CHORD_VOICES[4];

    const sections: StyleSectionConfig[] = [
      {
        name: 'Main A',
        bars: 4,
        notes,
      },
    ];

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TEST_FULL_7_CHANNELS',
      bpm: 128,
      timeSignature: { numerator: 4, denominator: 4 },
      division,
      sections,
      parts: {
        Rhythm2: { msb: kit.msb, lsb: kit.lsb, pc: kit.pc },
        Bass: { msb: bass.msb, lsb: bass.lsb, pc: bass.pc },
        Chord1: { msb: chord1.msb, lsb: chord1.lsb, pc: chord1.pc },
        Chord2: { msb: chord2.msb, lsb: chord2.lsb, pc: chord2.pc },
        Pad: { msb: pad.msb, lsb: pad.lsb, pc: pad.pc },
        Phrase1: { msb: phrase1.msb, lsb: phrase1.lsb, pc: phrase1.pc },
        Phrase2: { msb: phrase2.msb, lsb: phrase2.lsb, pc: phrase2.pc },
      },
      injectCasm: true,
    });

    // 序列化為二進位 .STY
    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(binaryBytes).toBeInstanceOf(Uint8Array);
    expect(binaryBytes.length).toBeGreaterThan(500);

    // 以 YamahaParser 反向解析驗收
    const reParsed = YamahaParser.parse(binaryBytes);
    expect(reParsed.format).toBe('STY');
    expect(reParsed.hasCasm).toBe(true);

    // 驗收 CASM 區塊是否存在且完整
    const casmChunk = reParsed.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    expect(casmChunk!.data.length).toBeGreaterThan(100);

    // 驗收所有 7 個聲部皆正確寫入
    const track0 = reParsed.tracks[0];
    const noteEvents = track0.events.filter(e => e.type === 'noteOn');
    expect(noteEvents.length).toBeGreaterThanOrEqual(notes.length);

    // 檢查是否有包含各通道的音符
    const channelsInNotes = new Set(noteEvents.map(e => e.channel));
    expect(channelsInNotes.has(9)).toBe(true);  // Ch 10 Rhythm 2
    expect(channelsInNotes.has(10)).toBe(true); // Ch 11 Bass
    expect(channelsInNotes.has(11)).toBe(true); // Ch 12 Chord 1
    expect(channelsInNotes.has(12)).toBe(true); // Ch 13 Chord 2
    expect(channelsInNotes.has(13)).toBe(true); // Ch 14 Pad
    expect(channelsInNotes.has(14)).toBe(true); // Ch 15 Phrase 1
    expect(channelsInNotes.has(15)).toBe(true); // Ch 16 Phrase 2
  });
});
