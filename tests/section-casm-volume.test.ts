import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine, formatYamahaPan } from '../src/player/sty-playback-engine';

describe('4006 Intro A CASM Volume, Voice, Pan & Effects Resolution Test', () => {
  it('correctly formats Yamaha Pan values', () => {
    expect(formatYamahaPan(64)).toBe('C');
    expect(formatYamahaPan(0)).toBe('L64');
    expect(formatYamahaPan(24)).toBe('L40');
    expect(formatYamahaPan(32)).toBe('L32');
    expect(formatYamahaPan(96)).toBe('R32');
    expect(formatYamahaPan(112)).toBe('R48');
    expect(formatYamahaPan(127)).toBe('R63');
  });

  it('correctly updates channel volumes, voices, pan, reverb and chorus when selecting Intro A in 4006', () => {
    const filePath = path.resolve(__dirname, '../samples/4006_SX900.T547.sty');
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');

    styPlaybackEngine.loadParsed(parsed);
    const success = styPlaybackEngine.selectSection('Intro A');
    expect(success).toBe(true);

    // 驗證 8 大伴奏聲部的真實音量完全與琴端一致：
    expect(styPlaybackEngine.getChannelVolume(8)).toBe(88);  // CH 9  (Rhythm 1)
    expect(styPlaybackEngine.getChannelVolume(9)).toBe(88);  // CH 10 (Rhythm 2)
    expect(styPlaybackEngine.getChannelVolume(10)).toBe(88); // CH 11 (Bass)
    expect(styPlaybackEngine.getChannelVolume(11)).toBe(72); // CH 12 (Chord 1) -> 琴端 72
    expect(styPlaybackEngine.getChannelVolume(12)).toBe(56); // CH 13 (Chord 2) -> 琴端 56 (不再是 100!)
    expect(styPlaybackEngine.getChannelVolume(13)).toBe(88); // CH 14 (Pad) -> 琴端 88
    expect(styPlaybackEngine.getChannelVolume(14)).toBe(72); // CH 15 (Phrase 1) -> 琴端 72
    expect(styPlaybackEngine.getChannelVolume(15)).toBe(64); // CH 16 (Phrase 2) -> 琴端 64

    // 驗證 8 大伴奏聲部的 Pan 聲像完全與琴端一致：
    expect(styPlaybackEngine.getChannelPan(8)).toBe(72);  // CH 9  (Rhythm 1) -> R8
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(8))).toBe('R8');
    expect(styPlaybackEngine.getChannelPan(9)).toBe(64);  // CH 10 (Rhythm 2) -> C
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(9))).toBe('C');
    expect(styPlaybackEngine.getChannelPan(10)).toBe(64); // CH 11 (Bass) -> C
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(10))).toBe('C');
    expect(styPlaybackEngine.getChannelPan(11)).toBe(96); // CH 12 (Chord 1) -> R32
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(11))).toBe('R32');
    expect(styPlaybackEngine.getChannelPan(12)).toBe(24); // CH 13 (Chord 2) -> L40
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(12))).toBe('L40');
    expect(styPlaybackEngine.getChannelPan(13)).toBe(32); // CH 14 (Pad) -> L32
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(13))).toBe('L32');
    expect(styPlaybackEngine.getChannelPan(14)).toBe(112); // CH 15 (Phrase 1) -> R48
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(14))).toBe('R48');
    expect(styPlaybackEngine.getChannelPan(15)).toBe(32); // CH 16 (Phrase 2) -> L32
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(15))).toBe('L32');

    // 驗證 Reverb
    expect(styPlaybackEngine.getChannelReverb(11)).toBe(45); // Chord 1
    expect(styPlaybackEngine.getChannelReverb(12)).toBe(45); // Chord 2
    expect(styPlaybackEngine.getChannelReverb(13)).toBe(72); // Pad
    expect(styPlaybackEngine.getChannelReverb(14)).toBe(72); // Phrase 1
    expect(styPlaybackEngine.getChannelReverb(15)).toBe(72); // Phrase 2

    // 驗證音色也是 100% 吻合：
    const voices = styPlaybackEngine.getPartVoices();
    expect(voices.get(11)?.msb).toBe(104);
    expect(voices.get(11)?.lsb).toBe(1);
    expect(voices.get(11)?.pc).toBe(0); // 1-based: 104-1-1 CFX Concert Grand

    expect(voices.get(12)?.msb).toBe(104);
    expect(voices.get(12)?.lsb).toBe(13);
    expect(voices.get(12)?.pc).toBe(25); // 1-based: 104-13-26 SteelGuitarTwin2

    // 測試動態調整 Pan
    styPlaybackEngine.setChannelPan(11, 64);
    expect(styPlaybackEngine.getChannelPan(11)).toBe(64);
    expect(formatYamahaPan(styPlaybackEngine.getChannelPan(11))).toBe('C');
  });
});
