import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { StyPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Phase 2 Verification: Engine Mixing, Voice Routing & Break Support', () => {
  it('correctly resolves Main A, Ending A and Break for 容易受傷的女人.sty', () => {
    const engine = new StyPlaybackEngine();
    const filePath = fs.existsSync('d:/Keyboard/節奏檔/容易受傷的女人/容易受傷的女人.sty')
      ? 'd:/Keyboard/節奏檔/容易受傷的女人/容易受傷的女人.sty'
      : (fs.existsSync('samples/容易受傷的女人_keyboard.sty') ? 'samples/容易受傷的女人_keyboard.sty' : 'public/samples/1024_容易受傷的女人.sty');
    const buf = fs.readFileSync(filePath);
    const u8 = new Uint8Array(buf);
    const parsed = YamahaParser.parse(u8);

    engine.loadParsed(parsed, u8.buffer);

    // 1. Select Main A
    expect(engine.selectSection('Main A')).toBe(true);
    const mainAParts = engine.getPartVoices();

    // Rh1 (CH 8): Must be a Drum kit (from Part 9 / standard kit), NOT Sitar 0-0-104!
    const rh1 = mainAParts.get(8);
    expect(rh1).toBeDefined();
    expect(rh1!.category).toBe('Drums');
    expect(rh1!.msb).toBe(127);
    expect(rh1!.voiceName).not.toContain('Fi');
    expect(rh1!.voiceName).not.toContain('Sitar');
    expect(engine.getChannelVolume(8)).toBe(100); // Standard factory panel baseline, NOT 80

    // Rh2 (CH 9): Main A start volume 117, Real Drums
    const rh2 = mainAParts.get(9);
    expect(rh2).toBeDefined();
    expect(rh2!.category).toBe('Drums');
    expect(rh2!.msb).toBe(127);
    expect(rh2!.pc).toBe(0); // 127-0-1 Real Drums
    expect(engine.getChannelVolume(9)).toBe(117); // NOT 127!

    // Bass (CH 10): Main A start volume 108, Fretless Bass
    const bass = mainAParts.get(10);
    expect(bass).toBeDefined();
    expect(bass!.pc).toBe(35); // 0-0-36 Fretless Bass
    expect(engine.getChannelVolume(10)).toBe(108); // NOT 127!

    // Chord 1 (CH 11): Main A start volume 90, Nylon Guitar
    const chord1 = mainAParts.get(11);
    expect(chord1).toBeDefined();
    expect(chord1!.pc).toBe(24); // 0-0-25 Nylon Guitar
    expect(engine.getChannelVolume(11)).toBe(90); // NOT 80!

    // Pad (CH 13): Main A start volume 81
    expect(engine.getChannelVolume(13)).toBe(81); // NOT 119!

    // 2. Select Ending A: Channel 0 mapped to Rh1 specifically for this section
    expect(engine.selectSection('Ending A')).toBe(true);
    const endingParts = engine.getPartVoices();
    const endingRh1 = endingParts.get(8);
    expect(endingRh1).toBeDefined();
    expect(endingRh1!.pc).toBe(103); // Sitar 0-0-104
    expect(engine.getChannelVolume(8)).toBe(80); // Ending A volume 80
    expect(engine.getChannelVolume(9)).toBe(127); // Ending A drum volume 127

    // 3. Select Main A again: Verify Rh1 cleanly returns to Drums without pollution
    expect(engine.selectSection('Main A')).toBe(true);
    const mainAAgain = engine.getPartVoices();
    expect(mainAAgain.get(8)!.category).toBe('Drums');
    expect(mainAAgain.get(8)!.msb).toBe(127);
    expect(engine.getChannelVolume(8)).toBe(100);

    // 4. Break / Fill In BA bidirectional matching
    expect(engine.selectSection('Break')).toBe(true);
    expect(engine.getCurrentSection()?.name).toBe('Fill In BA');
    expect(engine.getChannelVolume(10)).toBe(127); // Fill In BA Bass volume
    expect(engine.getChannelVolume(11)).toBe(80);  // Fill In BA Guitar volume

    expect(engine.selectSection('Fill In BA')).toBe(true);
    expect(engine.getCurrentSection()?.name).toBe('Fill In BA');
  });

  it('correctly handles SFF2 native styles like LoveSong and 4006', () => {
    const engine = new StyPlaybackEngine();
    const filePath = 'public/samples/LoveSong.T547.sty';
    const buf = fs.readFileSync(filePath);
    const u8 = new Uint8Array(buf);
    const parsed = YamahaParser.parse(u8);

    engine.loadParsed(parsed, u8.buffer);
    expect(engine.selectSection('Main A')).toBe(true);
    
    // LoveSong has native SFF2 Ch 8 Drum 1
    const parts = engine.getPartVoices();
    const rh1 = parts.get(8);
    expect(rh1).toBeDefined();
    expect(rh1!.category).toBe('Drums');
  });
});
