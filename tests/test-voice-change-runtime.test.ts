import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { findYamahaVoice } from '../src/core/data/yamaha-voices';

describe('Test Voice Change Runtime Behavior', () => {
  it('checks if changing voice on Channel 14 persists after selectSection', () => {
    const buf = fs.readFileSync('samples/容易受傷的女人_keyboard.sty');
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const parsed = YamahaParser.parse(u8);

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    expect(styPlaybackEngine.getPartVoices().get(14)?.voiceName).toContain('Vibraphone');

    const bellHeaven = findYamahaVoice(0, 119, 88);
    expect(bellHeaven).toBeDefined();

    // User changes voice on Channel 14 to BellHeaven
    styPlaybackEngine.setChannelVoice(14, bellHeaven!);
    expect(styPlaybackEngine.getPartVoices().get(14)?.voiceName).toContain('BellHeaven');
    expect(styPlaybackEngine.getPartVoices().get(14)?.category).toBe('Pad');

    // Section is selected or re-initialized (e.g. user selects section or loops or plays)
    styPlaybackEngine.selectSection('Intro A');

    // MUST PERSIST! Should NOT revert to Vibraphone!
    expect(styPlaybackEngine.getPartVoices().get(14)?.voiceName).toContain('BellHeaven');
    expect(styPlaybackEngine.getPartVoices().get(14)?.category).toBe('Pad');
  });
});
