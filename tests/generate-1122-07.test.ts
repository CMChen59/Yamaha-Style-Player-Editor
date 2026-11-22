import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Generate 1122-07.sty: Clean Intro B and Ending A Boundary Bleeds, Cymbal Bleed & Ghost CC11', () => {
  it('cleans Intro B and Ending A and exports 1122-07-clean.sty', () => {
    const f06 = new Uint8Array(fs.readFileSync('tests/1122-06-clean.sty'));
    const parsed = YamahaParser.parse(f06, 'STY');

    const introB = parsed.sections.find(s => s.name === 'Intro B')!;
    const endingA = parsed.sections.find(s => s.name === 'Ending A')!;

    // 1. Filter events from Track 0
    let curTick = 0;
    const keptEvents: any[] = [];
    let removedBleedCount = 0;
    let removedGhostCC11Count = 0;

    parsed.tracks[0].events.forEach(ev => {
      curTick += ev.delta;

      let remove = false;

      // Check Intro B
      if (curTick >= introB.startTick && curTick < introB.endTick) {
        const rel = curTick - introB.startTick;
        // Ch 9 Note 49 Crash Cymbal at rel=0
        if (ev.channel === 9 && (ev as any).noteNumber === 49) {
          if (rel === 0 && ev.type === 'noteOn') remove = true;
          if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) remove = true;
        }
        // Ch 11 Notes 69, 72, 76 Am collision at rel=0 (lasting 80~160 ticks)
        if (ev.channel === 11 && [69, 72, 76].includes((ev as any).noteNumber)) {
          if (rel === 0 && ev.type === 'noteOn') remove = true;
          if (rel <= 200 && (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0))) remove = true;
        }
      }

      // Check Ending A
      if (curTick >= endingA.startTick && curTick < endingA.endTick) {
        const rel = curTick - endingA.startTick;
        // Ch 14 Note 69 at rel=0 (lasting 40 ticks)
        if (ev.channel === 14 && (ev as any).noteNumber === 69) {
          if (rel === 0 && ev.type === 'noteOn') remove = true;
          if (rel <= 50 && (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0))) remove = true;
        }
        // Clear all ghost CC11 in Ending A (except we will inject CC11=127 at rel=0)
        if (ev.type === 'controlChange' && (ev as any).controller === 11) {
          remove = true;
          removedGhostCC11Count++;
        }
      }

      if (remove) {
        if (ev.type === 'noteOn' || ev.type === 'noteOff') removedBleedCount++;
      } else {
        keptEvents.push({ ev, absTick: curTick });
      }
    });

    console.log(`Total bleed notes removed: ${removedBleedCount}`);
    console.log(`Total ghost CC11 removed from Ending A: ${removedGhostCC11Count}`);
    expect(removedBleedCount).toBeGreaterThanOrEqual(6); // 1 Cymbal + 3 Am notes + 1 Ch14 note + noteOffs
    expect(removedGhostCC11Count).toBe(819);

    // 2. Ensure each active accompaniment channel has CC11 = 127 at Ending A startTick
    const endingChs = [8, 9, 10, 11, 12, 13, 14, 15];
    endingChs.forEach(ch => {
      keptEvents.push({
        ev: { delta: 0, type: 'controlChange', channel: ch, controller: 11, value: 127 },
        absTick: endingA.startTick,
      });
    });

    // Sort keptEvents by absTick stably
    keptEvents.sort((a, b) => a.absTick - b.absTick);

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

    // Export 1122-07-clean.sty
    const exportedBytes = YamahaWriter.write(parsed);
    fs.writeFileSync('tests/1122-07-clean.sty', exportedBytes);
    console.log(`Exported tests/1122-07-clean.sty (${exportedBytes.length} bytes)`);

    // Verify 1122-07-clean.sty
    const verifyParsed = YamahaParser.parse(new Uint8Array(fs.readFileSync('tests/1122-07-clean.sty')), 'STY');
    const vIntroB = verifyParsed.sections.find(s => s.name === 'Intro B')!;
    const vEndingA = verifyParsed.sections.find(s => s.name === 'Ending A')!;

    // Check Intro B rel=0: No Note 49 on Ch 9, No Notes 69, 72, 76 on Ch 11
    let t = 0;
    let introBNote49 = 0;
    let introBAmCollision = 0;
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === vIntroB.startTick && ev.type === 'noteOn') {
        if (ev.channel === 9 && (ev as any).noteNumber === 49) introBNote49++;
        if (ev.channel === 11 && [69, 72, 76].includes((ev as any).noteNumber)) introBAmCollision++;
      }
    });
    expect(introBNote49).toBe(0);
    expect(introBAmCollision).toBe(0);

    // Check Ending A rel=0: No Note 69 on Ch 14, CC11 count = 8 (one per channel at rel=0)
    t = 0;
    let endingANote69 = 0;
    let endingACC11Count = 0;
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= vEndingA.startTick && t < vEndingA.endTick) {
        if (t === vEndingA.startTick && ev.type === 'noteOn' && ev.channel === 14 && (ev as any).noteNumber === 69) {
          endingANote69++;
        }
        if (ev.type === 'controlChange' && (ev as any).controller === 11) {
          endingACC11Count++;
        }
      }
    });
    expect(endingANote69).toBe(0);
    expect(endingACC11Count).toBe(8); // exactly 8 channels with CC11=127 at startTick
  });
});