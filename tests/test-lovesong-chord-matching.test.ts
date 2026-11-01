import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('LoveSong Ctb2 chord matching and multi-track arbitration verification', () => {
  it('parses casmEntries with chordType and chordRoot', () => {
    const p = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');
    const buf = fs.readFileSync(p);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    expect(parsed.casmEntries).toBeDefined();
    const mainAEntries = parsed.casmEntries!['main a'];
    expect(mainAEntries).toBeDefined();

    const pianoRt = mainAEntries.find(e => e.srcCh === 2);
    expect(pianoRt).toBeDefined();
    expect(pianoRt!.destCh).toBe(11);
    expect(pianoRt!.chordType).toBe(2); // Major7

    const piano7th = mainAEntries.find(e => e.srcCh === 11);
    expect(piano7th).toBeDefined();
    expect(piano7th!.destCh).toBe(11);
    expect(piano7th!.chordType).toBe(14); // 7th

    const strings7th = mainAEntries.find(e => e.srcCh === 13);
    expect(strings7th).toBeDefined();
    expect(strings7th!.destCh).toBe(13);
    expect(strings7th!.chordType).toBe(14); // 7th
  });

  it('Main A dynamically routes Piano to srcCh=2 on Major, and to srcCh=11 on 7th', () => {
    const p = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');
    const buf = fs.readFileSync(p);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');

    // 1. In C Major:
    const cMaj = ChordTransposer.buildChord('C', 'maj');
    styPlaybackEngine.setAuditionChord(cMaj);

    expect(styPlaybackEngine.getActiveSourceChannel(11, cMaj)).toBe(2); // Piano rt (Major)
    expect(styPlaybackEngine.getActiveSourceChannel(13, cMaj)).toBeUndefined(); // Strings 7th only -> muted in Major!

    const ch11EventsMajor = styPlaybackEngine.getChannelEvents(11);
    expect(ch11EventsMajor.length).toBe(18); // 18 notes of Piano rt
    expect(ch11EventsMajor.every(e => e.noteNumber === 60)).toBe(true); // All Note 60 Middle C!

    const ch13EventsMajor = styPlaybackEngine.getChannelEvents(13);
    expect(ch13EventsMajor.length).toBe(0); // Muted in Major

    // 2. In C7 (Dominant 7th):
    const c7 = ChordTransposer.buildChord('C', '7');
    styPlaybackEngine.setAuditionChord(c7);

    expect(styPlaybackEngine.getActiveSourceChannel(11, c7)).toBe(11); // Piano 7th variation
    expect(styPlaybackEngine.getActiveSourceChannel(13, c7)).toBe(13); // Strings 7th variation

    const ch11Events7th = styPlaybackEngine.getChannelEvents(11);
    expect(ch11Events7th.length).toBe(50); // 50 notes of Piano 7th pattern!

    const ch13Events7th = styPlaybackEngine.getChannelEvents(13);
    expect(ch13Events7th.length).toBe(3); // 3 notes of Strings 7th pattern!
  });

  it('Intro B dynamically routes to Major (srcCh=10~13) on Major, and to Minor (srcCh=1~4) on Minor', () => {
    const p = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');
    const buf = fs.readFileSync(p);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro B');

    // 1. In Major:
    const cMaj = ChordTransposer.buildChord('C', 'maj');
    expect(styPlaybackEngine.getActiveSourceChannel(10, cMaj)).toBe(10); // Bass Major
    expect(styPlaybackEngine.getActiveSourceChannel(11, cMaj)).toBe(11); // Piano Major
    expect(styPlaybackEngine.getActiveSourceChannel(12, cMaj)).toBe(12); // Guitar Major
    expect(styPlaybackEngine.getActiveSourceChannel(13, cMaj)).toBe(13); // Strings Major

    // 2. In Minor:
    const aMin = ChordTransposer.buildChord('A', 'm');
    expect(styPlaybackEngine.getActiveSourceChannel(10, aMin)).toBe(1); // Bass Minor
    expect(styPlaybackEngine.getActiveSourceChannel(11, aMin)).toBe(2); // Piano Minor
    expect(styPlaybackEngine.getActiveSourceChannel(12, aMin)).toBe(3); // Guitar Minor
    expect(styPlaybackEngine.getActiveSourceChannel(13, aMin)).toBe(4); // Strings Minor
  });
});
