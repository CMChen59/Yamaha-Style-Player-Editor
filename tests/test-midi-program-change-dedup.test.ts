import { describe, it, expect } from 'vitest';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { YamahaFileParsed } from '../src/core/types/yamaha-types';

describe('MidiSongAnalyzer: Program Change Deduplication & Redundant Filter', () => {
  it('應該在同通道連續發送相同音色時自動去重，避免第 1 小節冗餘重置導致假性換樂器', () => {
    // 模擬類似使用者遇到的情況：CH 2 在第 1 小節先後送出兩次 PC 26 (Jazz Guitar)
    const mockMidi: YamahaFileParsed = {
      midiFormat: 1,
      division: 480,
      bpm: 120,
      sections: [],
      tracks: [
        {
          name: 'Track 1 (Setup & Notes)',
          events: [
            // 第 1 小節 tick 0: PC 26
            { delta: 0, type: 'programChange', channel: 1, program: 26 },
            // 第 1 小節 tick 120: 重複送出 PC 26
            { delta: 120, type: 'programChange', channel: 1, program: 26 },
            // 第 1 小節 tick 0 音符
            { delta: 0, type: 'noteOn', channel: 1, noteNumber: 36, velocity: 90 },
            { delta: 240, type: 'noteOff', channel: 1, noteNumber: 36, velocity: 0 },
          ],
        },
      ],
      parts: [],
    };

    const analysis = MidiSongAnalyzer.analyze(mockMidi, 'test-redundant-pc.mid');
    const ch2 = analysis.activeChannels.find((c) => c.channel === 1);

    expect(ch2).toBeDefined();
    // 驗證去重後 programChangesCount 為 1，而非 2
    expect(ch2?.programChangesCount).toBe(1);
    expect(ch2?.programChangeTimeline.length).toBe(1);
    expect(ch2?.programChangeTimeline[0].voiceName).toContain('JazzGuitar');
  });

  it('應該正確識別真正的曲中換樂器 (第 1 小節 JazzGuitar ➔ 第 17 小節 FingerBass)', () => {
    // 480 ticks/beat * 4 beats = 1920 ticks/bar
    // 第 17 小節 tick = 16 * 1920 = 30720
    const mockMidi: YamahaFileParsed = {
      midiFormat: 1,
      division: 480,
      bpm: 120,
      sections: [],
      tracks: [
        {
          name: 'Track 1',
          events: [
            // 第 1 小節 tick 0: PC 26 (Jazz Guitar)
            { delta: 0, type: 'programChange', channel: 1, program: 26 },
            // 第 1 小節重複發送一次 PC 26
            { delta: 120, type: 'programChange', channel: 1, program: 26 },
            // 第 17 小節切換至 PC 33 (FingerBass / Electric Bass)
            { delta: 30600, type: 'programChange', channel: 1, program: 33 },
            // 第 17 小節音符
            { delta: 0, type: 'noteOn', channel: 1, noteNumber: 36, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 36, velocity: 0 },
          ],
        },
      ],
      parts: [],
    };

    const analysis = MidiSongAnalyzer.analyze(mockMidi, 'test-real-pc-change.mid');
    const ch2 = analysis.activeChannels.find((c) => c.channel === 1);

    expect(ch2).toBeDefined();
    // 驗證去重後僅保留 2 個實質音色節點
    expect(ch2?.programChangesCount).toBe(2);
    expect(ch2?.programChangeTimeline.length).toBe(2);
    expect(ch2?.programChangeTimeline[0].bar).toBe(1);
    expect(ch2?.programChangeTimeline[0].voiceName).toContain('JazzGuitar');
    expect(ch2?.programChangeTimeline[1].bar).toBe(17);
    expect(ch2?.programChangeTimeline[1].voiceName).toContain('FingerBass');
  });

  it('應該支援曲中多次往返換樂器與連續重複過濾 (A -> A -> B -> B -> A)', () => {
    // 1920 ticks/bar
    // Bar 1: PC 26
    // Bar 1: PC 26 (重複)
    // Bar 9 (15360): PC 33
    // Bar 9 (15360): PC 33 (重複)
    // Bar 17 (30720): PC 26 (換回)
    const mockMidi: YamahaFileParsed = {
      midiFormat: 1,
      division: 480,
      bpm: 120,
      sections: [],
      tracks: [
        {
          name: 'Track 1',
          events: [
            { delta: 0, type: 'programChange', channel: 1, program: 26 },
            { delta: 100, type: 'programChange', channel: 1, program: 26 },
            { delta: 15260, type: 'programChange', channel: 1, program: 33 },
            { delta: 0, type: 'programChange', channel: 1, program: 33 },
            { delta: 15360, type: 'programChange', channel: 1, program: 26 },
            { delta: 0, type: 'noteOn', channel: 1, noteNumber: 40, velocity: 80 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 40, velocity: 0 },
          ],
        },
      ],
      parts: [],
    };

    const analysis = MidiSongAnalyzer.analyze(mockMidi, 'test-oscillating-pc.mid');
    const ch2 = analysis.activeChannels.find((c) => c.channel === 1);

    expect(ch2).toBeDefined();
    expect(ch2?.programChangesCount).toBe(3);
    expect(ch2?.programChangeTimeline.length).toBe(3);
    expect(ch2?.programChangeTimeline[0].bar).toBe(1);
    expect(ch2?.programChangeTimeline[0].voiceName).toContain('JazzGuitar');
    expect(ch2?.programChangeTimeline[1].bar).toBe(9);
    expect(ch2?.programChangeTimeline[1].voiceName).toContain('FingerBass');
    expect(ch2?.programChangeTimeline[2].bar).toBe(17);
    expect(ch2?.programChangeTimeline[2].voiceName).toContain('JazzGuitar');
  });

  it('若存在使用者本機 MIDI 檔，應驗證去重後各通道不再全員假性換樂器', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { YamahaParser } = await import('../src/core/parser/yamaha-parser');

    const testFiles = ['MIDI/償還.mid', 'MIDI/月亮代表我的心.mid'];
    for (const f of testFiles) {
      const fullPath = path.resolve(process.cwd(), f);
      if (!fs.existsSync(fullPath)) continue;

      const buf = fs.readFileSync(fullPath);
      const parsed = YamahaParser.parse(new Uint8Array(buf));
      const analysis = MidiSongAnalyzer.analyze(parsed, f);

      // 驗證去重後，通道不會出現「第 1 小節 A ➔ 第 1 小節 A」的假性換樂器
      for (const ch of analysis.activeChannels) {
        if (ch.programChangeTimeline && ch.programChangeTimeline.length > 1) {
          for (let i = 1; i < ch.programChangeTimeline.length; i++) {
            const prev = ch.programChangeTimeline[i - 1];
            const curr = ch.programChangeTimeline[i];
            // 驗證相鄰兩個節點絕不為相同樂器且同小節
            const isIdentical = prev.msb === curr.msb && prev.lsb === curr.lsb && prev.pc === curr.pc;
            expect(isIdentical).toBe(false);
          }
        }
      }
    }
  });
});
