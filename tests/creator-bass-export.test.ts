/**
 * Yamaha PSR-SX920 專注創作台 (V2) 貝斯鋼琴捲軸與 STY/PAD 匯出驗證測試
 */

import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { StyleNoteEvent } from '../src/core/models/style-types';
import { YAMAHA_SX920_BASS_VOICES } from '../src/creator/bass-voices';

describe('V2 Creator: 貝斯鋼琴捲軸與 STY/PAD 二進位匯出驗證 (Phase 2)', () => {
  it('1. 能將鼓組與 C 大調貝斯音符正確打包為合法的 Yamaha SFF2 .STY 伴奏風格檔案 (含 Channel 10 Bass CASM)', () => {
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
      { note: 36, step: 0 },  // Beat 1: C1 (Root)
      { note: 43, step: 6 },  // Beat 2 &: G1 (Fifth)
      { note: 36, step: 8 },  // Beat 3: C1 (Root)
      { note: 36, step: 11 }, // Beat 3 &: C1 (Syncopation)
      { note: 43, step: 14 }, // Beat 4 &: G1 (Fifth)
    ];

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
    }

    const fingerBass = YAMAHA_SX920_BASS_VOICES[0]; // Finger Bass: PC 33, Bank 0-112, panel PC 34

    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'TEST_DRUM_BASS',
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

    // 驗證 Track 0 中包含鼓組與貝斯 NoteOn 事件
    const track0Events = reParsed.tracks[0].events;
    const drumNoteOns = track0Events.filter(e => e.type === 'noteOn' && e.channel === 9 && (e.velocity ?? 0) > 0);
    const bassNoteOns = track0Events.filter(e => e.type === 'noteOn' && e.channel === 10 && (e.velocity ?? 0) > 0);

    expect(drumNoteOns.length).toBe(drumEvents.length * totalBars); // 4 * 4 = 16
    expect(bassNoteOns.length).toBe(bassEvents.length * totalBars); // 5 * 4 = 20

    // 驗證 CASM 中包含 Channel 10 (Bass) 轉調規則
    const casmChunk = reParsed.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    // 檢查 CASM 二進位內容中包含 'BassMain' 聲部標籤
    const casmText = new TextDecoder('latin1').decode(casmChunk!.data);
    expect(casmText).toContain('BassMain');
    expect(casmText).toContain('Drum4cc');
  });

  it('2. 能將貝斯音符匯出為 Multi Pad (.PAD) 檔案並啟用 Chord Match 轉調旗標', () => {
    const division = 96;
    const ticksPerBar = division * 4; // 384
    const totalBars = 2;

    const padProject = YamahaPadSynthesizer.createBlankProject({
      projectName: 'TEST_PAD_BASS',
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
          chordMatch: true, // 貝斯開起和弦轉調
          msb: 0,
          lsb: 112,
          pc: 33,
        },
      ],
    });

    // 注入 Pad 2 貝斯音符
    YamahaPadModifier.addNoteEvent(padProject, 2, {
      note: 36, // C1
      startTick: 0,
      durationTick: 90,
      velocity: 100,
    });
    YamahaPadModifier.addNoteEvent(padProject, 2, {
      note: 43, // G1
      startTick: 192,
      durationTick: 90,
      velocity: 100,
    });

    const validation = YamahaWriter.validateAndWrite(padProject);
    expect(validation.success).toBe(true);

    const reParsed = YamahaParser.parse(validation.bytes, 'PAD');
    expect(reParsed.format).toBe('PAD');

    // 驗證 Marker 中包含 Pad 2 的 Chord Match 旗標
    const track0Events = reParsed.tracks[0].events;
    const chordMatchMarker = track0Events.find(e => e.type === 'meta' && e.metaType === 0x06 && e.text?.startsWith('CM'));
    expect(chordMatchMarker).toBeDefined();
    // 依據 CM 格式，Pad 2 為 '1'
    expect(chordMatchMarker?.text).toBe('CM0100');
  });
});
