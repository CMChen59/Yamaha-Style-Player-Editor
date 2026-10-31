import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('End-to-End Export Test for Intro A Chord 1', () => {
  it('loads keyboard style, selects Intro A, performs export, and verifies Chord 1 has all 16 notes', () => {
    const origBuf = fs.readFileSync('samples/容易受傷的女人_keyboard.sty');
    const parsed = YamahaParser.parse(new Uint8Array(origBuf.buffer, origBuf.byteOffset, origBuf.byteLength));
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    // Verify initial playback engine has Chord 1 with 16 notes
    const chord1Events = styPlaybackEngine.getChannelEvents(11);
    expect(chord1Events.length).toBe(16);
    expect(chord1Events[0].sourceChannel).toBe(6);

    // Simulate exportCurrentStyle exactly as PlayerApp does
    const currentSec = styPlaybackEngine.getCurrentSection()?.name;
    expect(currentSec).toBe('Intro A');

    const secNameLower = currentSec!.toLowerCase();
    const casmSecMap = parsed.casmMappings?.[secNameLower]
      || parsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];

    for (let ch = 8; ch <= 15; ch++) {
      const events = styPlaybackEngine.getChannelEvents(ch);
      YamahaStyleModifier.replaceSectionChannelNotes(
        parsed,
        currentSec!,
        ch,
        events
      );
      const vol = styPlaybackEngine.getChannelVolume(ch);
      YamahaStyleModifier.setPartMixing(parsed, ch, { volume: vol });

      if (casmSecMap) {
        for (const [srcStr, dst] of Object.entries(casmSecMap)) {
          if (dst === ch) {
            const srcCh = parseInt(srcStr, 10);
            YamahaStyleModifier.setPartMixing(parsed, srcCh, { volume: vol });
          }
        }
      }
    }

    // Write and validate STY
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.hasCasm).toBe(true);

    // Re-parse exported bytes
    const reParsed = YamahaParser.parse(exportResult.bytes);
    const reIntroA = reParsed.sections.find(s => s.name.toLowerCase() === 'intro a')!;
    expect(reIntroA).toBeDefined();

    // Count notes in Intro A of the re-parsed export
    const noteCounts: Record<number, number> = {};
    let cur = 0;
    for (const ev of reParsed.tracks[0].events) {
      cur += ev.delta;
      if (cur >= reIntroA.startTick && cur < reIntroA.endTick!) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          noteCounts[ev.channel!] = (noteCounts[ev.channel!] || 0) + 1;
        }
      }
    }

    console.log('Exported STY Intro A note counts by MIDI channel:', noteCounts);

    // Chord 1 is mapped from Source Channel 6 by CASM
    // MUST HAVE ALL 16 NOTES!
    expect(noteCounts[6]).toBe(16);
    // Phrase 1 (Ch 2) must have 17 notes
    expect(noteCounts[2]).toBe(17);
    // Phrase 2 (Ch 3) must have 17 notes
    expect(noteCounts[3]).toBe(17);
    // Pad (Ch 5) must have 8 notes
    expect(noteCounts[5]).toBe(8);

    // Now test loading the exported file into styPlaybackEngine and checking Intro A playback
    styPlaybackEngine.loadParsed(reParsed);
    styPlaybackEngine.selectSection('Intro A');

    const rePlaybackChord1 = styPlaybackEngine.getChannelEvents(11);
    expect(rePlaybackChord1.length).toBe(16);
    console.log('Re-loaded Playback Engine Chord 1 events count:', rePlaybackChord1.length);
  });
});
