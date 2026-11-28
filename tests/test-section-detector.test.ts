import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';

describe('MidiStructureDetector Prototype Verification', () => {
  it('detects vocal gaps and intro/interlude/ending in 容易受伤的女人.mid', () => {
    const p = '容易受伤的女人.mid';
    const buf = new Uint8Array(fs.readFileSync(p));
    const parsed = YamahaParser.parse(buf, 'MID');
    const ana = MidiSongAnalyzer.analyze(parsed, p);

    // Ch 1 (index 0) is Soprano Sax
    const vCh = ana.channelsWithNotes.find(c => c.channel === 0);
    expect(vCh).toBeDefined();

    // 統計每個小節的主唱音符數
    const ticksPerBar = ana.ticksPerBar;
    const vocalNotesByBar: number[] = new Array(ana.totalBars + 1).fill(0);

    for (const track of parsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (ev.type === 'noteOn' && ev.channel === 0 && (ev.velocity || 0) > 0) {
          const bar = Math.floor(curTick / ticksPerBar) + 1;
          if (bar <= ana.totalBars) {
            vocalNotesByBar[bar]++;
          }
        }
      }
    }

    console.log('容易受傷的女人 - 主唱各小節音符數:');
    for (let b = 1; b <= ana.totalBars; b++) {
      if (vocalNotesByBar[b] > 0 || (b >= 20 && b <= 35) || b <= 8 || b >= 65) {
        console.log(`  Bar ${b}: ${vocalNotesByBar[b]} notes`);
      }
    }

    // 前奏: Bar 1 ~ 5 (主唱在第 6 小節進歌)
    const firstVocalBar = vocalNotesByBar.findIndex((cnt, idx) => idx > 0 && cnt > 0);
    expect(firstVocalBar).toBe(6);

    // 間奏: 在 Bar 20 ~ 40 尋找連續 4 小節以上 0 音符的區間
    let gapStart = -1;
    let gapEnd = -1;
    for (let b = firstVocalBar; b <= ana.totalBars; b++) {
      if (vocalNotesByBar[b] === 0) {
        if (gapStart === -1) gapStart = b;
        gapEnd = b;
      } else {
        if (gapStart !== -1 && (gapEnd - gapStart + 1) >= 4 && gapStart < 60) {
          console.log(`找到間奏區間: Bar ${gapStart} ~ ${gapEnd} (長度 ${gapEnd - gapStart + 1} 小節)`);
          break;
        }
        gapStart = -1;
      }
    }
    expect(gapStart).toBe(27);
    expect(gapEnd).toBe(33);

    // 尾奏: 主唱最後一次發音之後
    let lastVocalBar = 0;
    for (let b = ana.totalBars; b >= 1; b--) {
      if (vocalNotesByBar[b] > 0) {
        lastVocalBar = b;
        break;
      }
    }
    expect(lastVocalBar).toBe(66);
    console.log(`尾奏區間: Bar ${lastVocalBar + 1} ~ ${ana.totalBars} (長度 ${ana.totalBars - lastVocalBar} 小節)`);
    expect(ana.totalBars - lastVocalBar).toBeGreaterThanOrEqual(4);
  });

  it('detects vocal gaps and intro/interlude/ending in 月亮代表我的心.mid', () => {
    const p = 'D:/Keyboard/MIDI/月亮代表我的心.mid';
    if (!fs.existsSync(p)) return;
    const buf = new Uint8Array(fs.readFileSync(p));
    const parsed = YamahaParser.parse(buf, 'MID');
    const ana = MidiSongAnalyzer.analyze(parsed, p);

    // Ch 1 (index 0) is Whistle
    const ticksPerBar = ana.ticksPerBar;
    const vocalNotesByBar: number[] = new Array(ana.totalBars + 1).fill(0);

    for (const track of parsed.tracks) {
      let curTick = 0;
      for (const ev of track.events) {
        curTick += ev.delta;
        if (ev.type === 'noteOn' && ev.channel === 0 && (ev.velocity || 0) > 0) {
          const bar = Math.floor(curTick / ticksPerBar) + 1;
          if (bar <= ana.totalBars) {
            vocalNotesByBar[bar]++;
          }
        }
      }
    }

    console.log('\n月亮代表我的心 - 主唱各小節音符數:');
    for (let b = 1; b <= ana.totalBars; b++) {
      if (vocalNotesByBar[b] > 0 || (b >= 30 && b <= 45) || b <= 6 || b >= 60) {
        console.log(`  Bar ${b}: ${vocalNotesByBar[b]} notes`);
      }
    }
  });
});
