/**
 * Yamaha PSR-SX920 專注創作台 (V2) 鼓組步進器與 STY/PAD 匯出驗證測試
 */

import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { StyleNoteEvent } from '../src/core/models/style-types';

describe('V2 Creator: 打擊樂步進網格與 STY/PAD 二進位匯出驗證', () => {
  it('1. 能將標準 4 拍鼓點正確打包為合法的 Yamaha SFF2 .STY 伴奏風格檔案', () => {
    const division = 480;
    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * 4; // 1920
    const ticksPer16th = Math.round(ticksPerBar / 16); // 120

    // 模擬 1 小節流行鼓點：
    // 大鼓 (Kick, 36): Beat 1 (step 0), Beat 3 (step 8)
    // 小鼓 (Snare, 38): Beat 2 (step 4), Beat 4 (step 12)
    // 閉鈸 (Hi-Hat, 42): 8 分音符 (step 0, 2, 4, 6, 8, 10, 12, 14)
    const bar1Events: Array<{ note: number; step: number }> = [
      { note: 36, step: 0 },
      { note: 36, step: 8 },
      { note: 38, step: 4 },
      { note: 38, step: 12 },
      { note: 42, step: 0 },
      { note: 42, step: 2 },
      { note: 42, step: 4 },
      { note: 42, step: 6 },
      { note: 42, step: 8 },
      { note: 42, step: 10 },
      { note: 42, step: 12 },
      { note: 42, step: 14 },
    ];

    // 模擬一鍵鋪滿 4 小節 (Clone to 4 bars)
    const totalBars = 4;
    const styleNotes: StyleNoteEvent[] = [];
    for (let bar = 0; bar < totalBars; bar++) {
      for (const ev of bar1Events) {
        const startTick = (bar * 16 + ev.step) * ticksPer16th;
        styleNotes.push({
          partId: 'Rhythm2',
          channel: 9, // MIDI Channel 10
          note: ev.note,
          startTick,
          durationTick: 96,
          velocity: 100,
        });
      }
    }

    // 調用合成引擎構建 SFF2 STY
    const parsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'V2_TestGroove',
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
      injectCasm: true,
    });

    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(parsed);
    expect(binaryBytes.length).toBeGreaterThan(500);

    // 反向解析驗證二進位合法性
    const reParsed = YamahaParser.parse(binaryBytes, 'STY');
    expect(reParsed.format).toBe('STY');
    expect(reParsed.division).toBe(480);
    expect(reParsed.hasCasm).toBe(true);

    // 驗證段落包含 SFF2, SInt, Main A
    const secNames = reParsed.sections.map(s => s.name);
    expect(secNames).toContain('SFF2');
    expect(secNames).toContain('SInt');
    expect(secNames).toContain('Main A');

    // 驗證 Main A 段落存在且有音符
    const mainA = reParsed.sections.find(s => s.name === 'Main A');
    expect(mainA).toBeDefined();

    // 驗證軌道中包含 Channel 10 (ch 9) 的打擊樂事件
    const noteEvents = reParsed.tracks[0].events.filter(e => e.type === 'noteOn' && e.channel === 9);
    expect(noteEvents.length).toBe(bar1Events.length * totalBars);
  });

  it('2. 能將打擊樂點位正確打包為 PSR-SX920 專用 .PAD 多功能打擊板檔案', () => {
    const division = 96;
    const padProject = YamahaPadSynthesizer.createBlankProject({
      projectName: 'Test_DrumPad',
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      division,
      bars: 2,
      pads: [
        {
          name: 'Pad 1',
          icon: 'S815',
          repeat: false,
          chordMatch: false,
          msb: 127,
          lsb: 0,
          pc: 0,
        },
      ],
    });

    // 加入大鼓和小鼓音符
    YamahaPadModifier.addNoteEvent(padProject, 1, {
      note: 36,
      startTick: 0,
      durationTick: 48,
      velocity: 100,
    });
    YamahaPadModifier.addNoteEvent(padProject, 1, {
      note: 38,
      startTick: 96,
      durationTick: 48,
      velocity: 100,
    });

    const validation = YamahaWriter.validateAndWrite(padProject);
    expect(validation.success).toBe(true);
    expect(validation.bytes.length).toBeGreaterThan(100);

    // 反向解析驗證
    const reParsed = YamahaParser.parse(validation.bytes, 'PAD');
    expect(reParsed.format).toBe('PAD');
    expect(reParsed.tracks.length).toBeGreaterThanOrEqual(1);
  });
});
