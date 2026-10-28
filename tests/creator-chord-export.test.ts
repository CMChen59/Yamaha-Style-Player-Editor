/**
 * Yamaha PSR-SX920 專注創作台 (V2) 和弦伴奏 (Chord 1 / Channel 12) 與 STY/PAD 匯出驗證測試
 */

import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { StyleNoteEvent } from '../src/core/models/style-types';
import { YAMAHA_SX920_BASS_VOICES } from '../src/creator/bass-voices';
import { YAMAHA_SX920_CHORD_VOICES } from '../src/creator/chord-voices';

describe('V2 Creator: 和弦伴奏捲軸 (Chord 1) 與 STY/PAD 二進位匯出驗證', () => {
  it('1. 能將鼓組、貝斯與 C 大調多音和弦 (Chord 1) 正確打包為合法的 Yamaha SFF2 .STY 伴奏風格 (含 Ch 12 Chord CASM)', () => {
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4; // 1920
    const ticksPer16th = Math.round(ticksPerBar / 16); // 120

    // 模擬鼓點：大鼓 (Kick 36) 與小鼓 (Snare 38)
    const drumEvents: Array<{ note: number; step: number }> = [
      { note: 36, step: 0 },
      { note: 36, step: 8 },
      { note: 38, step: 4 },
      { note: 38, step: 12 },
    ];

    // 模擬貝斯音符 (C 大調 Root C1=36 與 Fifth G1=43)
    const bassEvents: Array<{ note: number; step: number }> = [
      { note: 36, step: 0 },
      { note: 43, step: 8 },
    ];

    // 模擬和弦音符：四拍柱狀 C 大調和弦 (C4:60 + E4:64 + G4:67)
    const chordNotesPerBeat = [60, 64, 67];
    const chordSteps = [0, 4, 8, 12]; // 每小節 4 拍正拍

    const totalBars = 4;
    const styleNotes: StyleNoteEvent[] = [];

    for (let bar = 0; bar < totalBars; bar++) {
      const barOffsetTicks = bar * ticksPerBar;

      // 鼓組 (Ch 10 / index 9)
      for (const ev of drumEvents) {
        styleNotes.push({
          partId: 'Rhythm2',
          channel: 9,
          note: ev.note,
          startTick: barOffsetTicks + ev.step * ticksPer16th,
          durationTick: 96,
          velocity: 100,
        });
      }

      // 貝斯 (Ch 11 / index 10)
      for (const ev of bassEvents) {
        styleNotes.push({
          partId: 'Bass',
          channel: 10,
          note: ev.note,
          startTick: barOffsetTicks + ev.step * ticksPer16th,
          durationTick: 110,
          velocity: 100,
        });
      }

      // 和弦 (Ch 12 / index 11) - 複音和弦
      for (const step of chordSteps) {
        for (const note of chordNotesPerBeat) {
          styleNotes.push({
            partId: 'Chord1',
            channel: 11,
            note,
            startTick: barOffsetTicks + step * ticksPer16th,
            durationTick: 180,
            velocity: 100,
          });
        }
      }
    }

    const fingerBass = YAMAHA_SX920_BASS_VOICES[0];
    const concertGrand = YAMAHA_SX920_CHORD_VOICES[0];

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TEST_DRUM_BASS_CHORD',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division,
      sections: [
        {
          name: 'Main A',
          bars: totalBars,
          notes: styleNotes,
        },
      ],
      parts: {
        Rhythm2: {
          msb: 127,
          lsb: 0,
          pc: 0,
        },
        Bass: {
          msb: fingerBass.msb,
          lsb: fingerBass.lsb,
          pc: fingerBass.pc,
        },
        Chord1: {
          msb: concertGrand.msb,
          lsb: concertGrand.lsb,
          pc: concertGrand.pc,
        },
      },
      injectCasm: true,
    });

    // 序列化為二進位 SFF2 檔案
    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(binaryBytes.length).toBeGreaterThan(1000);

    // 二進位解析回驗
    const reParsed = YamahaParser.parse(binaryBytes);
    expect(reParsed.format).toBe('STY');
    expect(reParsed.hasCasm).toBe(true);

    // 驗證 Track 0 中包含鼓組、貝斯與和弦 NoteOn 事件
    const track0Events = reParsed.tracks[0].events;
    const drumNoteOns = track0Events.filter(e => e.type === 'noteOn' && e.channel === 9 && (e.velocity ?? 0) > 0);
    const bassNoteOns = track0Events.filter(e => e.type === 'noteOn' && e.channel === 10 && (e.velocity ?? 0) > 0);
    const chordNoteOns = track0Events.filter(e => e.type === 'noteOn' && e.channel === 11 && (e.velocity ?? 0) > 0);

    expect(drumNoteOns.length).toBe(drumEvents.length * totalBars); // 4 * 4 = 16
    expect(bassNoteOns.length).toBe(bassEvents.length * totalBars); // 2 * 4 = 8
    expect(chordNoteOns.length).toBe(chordSteps.length * chordNotesPerBeat.length * totalBars); // 4 * 3 * 4 = 48

    // 驗證 CASM 中包含 Chd1Main (Ch 12) 轉調規則
    const casmChunk = reParsed.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    const casmText = new TextDecoder('latin1').decode(casmChunk!.data);
    expect(casmText).toContain('Chd1Main');
    expect(casmText).toContain('BassMain');
    expect(casmText).toContain('Drum4cc');
  });

  it('2. 能將和弦伴奏音符匯出至 Multi Pad (.PAD) 的 Pad 3 並啟用 Chord Match 轉調旗標', () => {
    const division = 96;
    const totalBars = 2;

    const concertGrand = YAMAHA_SX920_CHORD_VOICES[0];

    const padProject = YamahaPadSynthesizer.createBlankProject({
      projectName: 'TEST_PAD_CHORD',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division,
      bars: totalBars,
      pads: [
        {
          name: 'Pad 1 (Drums)',
          icon: 'S815',
          repeat: false,
          chordMatch: false,
          msb: 127,
          lsb: 0,
          pc: 0,
        },
        {
          name: 'Pad 2 (Bass)',
          icon: 'S813',
          repeat: false,
          chordMatch: true,
          msb: 0,
          lsb: 112,
          pc: 33,
        },
        {
          name: 'Pad 3 (Chord)',
          icon: 'S809',
          repeat: false,
          chordMatch: true, // 和弦開起和弦轉調
          msb: concertGrand.msb,
          lsb: concertGrand.lsb,
          pc: concertGrand.pc,
        },
      ],
    });

    // 注入 Pad 3 和弦音符 (C4, E4, G4)
    YamahaPadModifier.addNoteEvent(padProject, 3, {
      note: 60,
      startTick: 0,
      durationTick: 90,
      velocity: 100,
    });
    YamahaPadModifier.addNoteEvent(padProject, 3, {
      note: 64,
      startTick: 0,
      durationTick: 90,
      velocity: 100,
    });
    YamahaPadModifier.addNoteEvent(padProject, 3, {
      note: 67,
      startTick: 0,
      durationTick: 90,
      velocity: 100,
    });

    const validation = YamahaWriter.validateAndWrite(padProject);
    expect(validation.success).toBe(true);

    const reParsed = YamahaParser.parse(validation.bytes, 'PAD');
    expect(reParsed.format).toBe('PAD');

    // 驗證 Marker 中包含 Pad 2 與 Pad 3 的 Chord Match 旗標 (CM0110)
    const track0Events = reParsed.tracks[0].events;
    const chordMatchMarker = track0Events.find(e => e.type === 'meta' && e.metaType === 0x06 && e.text?.startsWith('CM'));
    expect(chordMatchMarker).toBeDefined();
    expect(chordMatchMarker?.text).toBe('CM0110');
  });

  it('3. 和弦合成器 (ChordSynth) 能正確響應音色切換，動態改變發聲樂器物理模型', async () => {
    const { chordSynth } = await import('../src/creator/chord-synth');
    const { YAMAHA_SX920_CHORD_VOICES } = await import('../src/creator/chord-voices');

    // 初始預設鋼琴
    expect(chordSynth.getCategory()).toBe('Piano');

    // 切換至民謠吉他
    const steelGuitar = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'steel-guitar');
    expect(steelGuitar).toBeDefined();
    chordSynth.setVoice(steelGuitar!);
    expect(chordSynth.getCategory()).toBe('Guitar');
    expect(chordSynth.getVoiceId()).toBe('steel-guitar');

    // 切換至弦樂
    const strings = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'kino-strings');
    expect(strings).toBeDefined();
    chordSynth.setVoice(strings!);
    expect(chordSynth.getCategory()).toBe('Strings');
    expect(chordSynth.getVoiceId()).toBe('kino-strings');

    // 切換至電鋼琴
    const ep = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'suitcase-ep');
    expect(ep).toBeDefined();
    chordSynth.setVoice(ep!);
    expect(chordSynth.getCategory()).toBe('E.Piano');

    // 切換至銅管
    const brass = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === 'pop-brass');
    expect(brass).toBeDefined();
    chordSynth.setVoice(brass!);
    expect(chordSynth.getCategory()).toBe('Brass');
    expect(chordSynth.getVoiceId()).toBe('pop-brass');
  });
});
