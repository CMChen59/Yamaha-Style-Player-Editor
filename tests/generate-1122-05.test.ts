import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Generate 1122-05.sty by eliminating boundary bleed notes across all Main sections', () => {
  it('cleanses boundary bleed notes from Main A, B, C, D in 1122-04.sty', () => {
    const f1122 = new Uint8Array(fs.readFileSync('tests/1122-04.sty'));
    const parsed = YamahaParser.parse(f1122, 'STY');

    // 1. Check sections in parsed
    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    const mainB = parsed.sections.find(s => s.name === 'Main B')!;
    const mainC = parsed.sections.find(s => s.name === 'Main C')!;
    const mainD = parsed.sections.find(s => s.name === 'Main D')!;
    const introB = parsed.sections.find(s => s.name === 'Intro B')!;
    const endingA = parsed.sections.find(s => s.name === 'Ending A')!;

    // 2. Identify the exact boundary bleed notes to remove at rel=0 of each section:
    // Main A rel=0: Ch 12 Note 64 (E4) vel 85 (bleed from bar 6 beat 2)
    // Main C rel=0: Ch 11 Note 65 (F4) vel 93, Note 69 (A4) vel 97 (bleed from bar 33 beat 4.5)
    // Main D rel=0: Ch 13 Note 86 (D6) vel 85, Note 88 (E6) vel 85, Ch 11 Note 69 (A4) vel 97 (bleed from bar 41)

    let curTick = 0;
    const keptEvents: any[] = [];
    let removedBleedCount = 0;

    parsed.tracks[0].events.forEach(ev => {
      curTick += ev.delta;

      let isBleedNote = false;
      if (ev.type === 'noteOn' || ev.type === 'noteOff') {
        // Main A check at rel = 0
        if (curTick === mainA.startTick) {
          if (ev.channel === 12 && ev.noteNumber === 64 && (ev.velocity === 85 || ev.type === 'noteOff' || ev.velocity === 0)) {
            isBleedNote = true;
          }
        }
        // Main C check at rel = 0
        if (curTick === mainC.startTick) {
          if (ev.channel === 11 && (ev.noteNumber === 65 || ev.noteNumber === 69)) {
            isBleedNote = true;
          }
        }
        // Main D check at rel = 0
        if (curTick === mainD.startTick) {
          if ((ev.channel === 13 && (ev.noteNumber === 86 || ev.noteNumber === 88)) ||
              (ev.channel === 11 && ev.noteNumber === 69)) {
            isBleedNote = true;
          }
        }
      }

      if (isBleedNote) {
        removedBleedCount++;
        console.log(`Removed bleed event at tick ${curTick}: Ch ${ev.channel} Note ${ev.noteNumber} type=${ev.type}`);
      } else {
        keptEvents.push({ ev, absTick: curTick });
      }
    });

    console.log(`Total bleed events removed: ${removedBleedCount}`);
    expect(removedBleedCount).toBeGreaterThan(0);

    // Reconstruct delta ticks
    let prevTick = 0;
    const newEvents: any[] = [];
    keptEvents.forEach(item => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      newEvents.push({ ...item.ev, delta });
    });

    parsed.tracks[0].events = newEvents;
    YamahaPadModifier.rebuildTrackRawChunk(parsed.tracks[0]);

    // Export 1122-05-clean.sty
    const exportedBytes = YamahaWriter.write(parsed);
    fs.writeFileSync('tests/1122-05-clean.sty', exportedBytes);
    console.log(`Exported 1122-05-clean.sty (${exportedBytes.length} bytes)`);

    // Verify final file
    const verifyParsed = YamahaParser.parse(new Uint8Array(fs.readFileSync('tests/1122-05-clean.sty')), 'STY');
    
    // Check Intro B: CC1 = 152, ghost CC11 = 0, root = 0
    const ibRules = CasmModifier.extractPartRules(verifyParsed, 'Intro B');
    expect(ibRules.find(r => r.channel === 15)?.sourceChordRoot).toBe(0);

    let introBGhostCC11 = 0;
    let introBCC1 = 0;
    let t = 0;
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= introB.startTick && t < introB.endTick) {
        if (ev.type === 'controlChange' && ev.controller === 11 && t > introB.startTick) introBGhostCC11++;
        if (ev.type === 'controlChange' && ev.controller === 1 && ev.channel === 15) introBCC1++;
      }
    });
    expect(introBGhostCC11).toBe(0);
    expect(introBCC1).toBe(152);

    // Check Main A rel=0: Ch 12 has only 1 note (Note 60)
    let mainARel0Notes: any[] = [];
    t = 0;
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === mainA.startTick && ev.type === 'noteOn' && ev.velocity > 0) {
        mainARel0Notes.push({ ch: ev.channel, note: ev.noteNumber, vel: ev.velocity });
      }
    });
    const mainACh12 = mainARel0Notes.filter(n => n.ch === 12);
    expect(mainACh12.length).toBe(1);
    expect(mainACh12[0].note).toBe(60);
    console.log('Main A rel=0 Ch 12 notes:', mainACh12);
  });
});
