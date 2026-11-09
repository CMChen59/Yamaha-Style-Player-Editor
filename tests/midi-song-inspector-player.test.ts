import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { StyPlaybackEngine } from '../src/player/sty-playback-engine';

describe('MIDI 音樂檔全景透視與 16 通道原曲直通播放 (MIDI Song Inspector & Direct Player)', () => {
  it('1. 拖入標準 .mid 檔時，應精確解析總小節數、速度 BPM、拍號、時長、發聲通道數與各通道樂器', () => {
    const midBytes = new Uint8Array(fs.readFileSync(path.resolve('public/samples/demo_groove.mid')));
    const parsed = YamahaParser.parse(midBytes, 'STY');
    const analysis = MidiSongAnalyzer.analyze(parsed, 'demo_groove.mid');

    expect(analysis.isGeneralMidiSong).toBe(true);
    expect(analysis.isStyleFile).toBe(false);
    expect(analysis.totalBars).toBe(8);
    expect(analysis.initialBpm).toBe(120);
    expect(analysis.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(analysis.channelsWithNotesCount).toBe(4);
    expect(analysis.totalNotes).toBe(240);

    const chNumbers = analysis.channelsWithNotes.map((c) => c.displayChannel);
    expect(chNumbers).toEqual([1, 2, 3, 10]);

    const ch10 = analysis.channelsWithNotes.find((c) => c.displayChannel === 10)!;
    expect(ch10.isDrum).toBe(true);
    expect(ch10.category).toBe('Drums');
  });

  it('2. 載入標準 .mid 檔時，不應建立任何假預設段落 (如 Main A / Intro A)，且支援 16 通道原調直通與小節區間定位', () => {
    const midBytes = new Uint8Array(fs.readFileSync(path.resolve('public/samples/demo_groove.mid')));
    const parsed = YamahaParser.parse(midBytes, 'STY');
    const initialSectionCount = parsed.sections.length;

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);
    const loaded = engine.loadSongMode(1, 8);

    expect(loaded).toBe(true);
    expect(engine.getIsSongMode()).toBe(true);
    expect(parsed.sections.length).toBe(initialSectionCount);
    expect(engine.getTotalBars()).toBe(8);
    expect(engine.getSectionEvents().length).toBe(240);

    // 測試小節區間選段試聽 (例如只播第 3 ~ 6 小節)
    engine.loadSongMode(3, 6);
    expect(engine.getTotalBars()).toBe(4);
    expect(engine.getSongBarRange()).toEqual({
      startBar: 3,
      endBar: 6,
      totalSongBars: 8,
    });
  });

  it('3. 載入 Yamaha .sty 伴奏檔時，應正確識別為 Style 模式並保留完整伴奏段落', () => {
    const styBytes = new Uint8Array(fs.readFileSync(path.resolve('public/samples/LoveSong.T547.sty')));
    const parsed = YamahaParser.parse(styBytes, 'STY');
    const analysis = MidiSongAnalyzer.analyze(parsed, 'LoveSong.T547.sty');

    expect(analysis.isStyleFile).toBe(true);
    expect(analysis.isGeneralMidiSong).toBe(false);
  });
});
