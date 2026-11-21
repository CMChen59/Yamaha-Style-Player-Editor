import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Yamaha Style fn: Marker and Section Length Regression Test', () => {
  it('correctly parses 4006_SX900 style without creating zero-length sections from fn: tags', () => {
    const f = 'D:/Keyboard/節奏檔/雲中月圓/4006_SX900.T547.sty';
    if (!fs.existsSync(f)) return;

    const buf = fs.readFileSync(f);
    const parsed = YamahaParser.parse(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));

    // Must not contain any section starting with fn:
    const fnSecs = parsed.sections.filter(s => s.name.toLowerCase().startsWith('fn:'));
    expect(fnSecs.length).toBe(0);

    // Main A must have 8 measures and proper endTick
    const mainA = parsed.sections.find(s => s.name === 'Main A');
    expect(mainA).toBeDefined();
    expect(mainA!.measureCount).toBe(8);
    expect(mainA!.startTick).toBe(7680);
    expect(mainA!.endTick).toBe(69120);

    // Full name should be extracted
    expect(mainA!.fullName).toBe('Main A');

    // Engine playback test
    styPlaybackEngine.loadParsed(parsed);
    const success = styPlaybackEngine.selectSection('Main A');
    expect(success).toBe(true);

    const evs = styPlaybackEngine.getSectionEvents();
    expect(evs.length).toBeGreaterThan(0);
  });
});
