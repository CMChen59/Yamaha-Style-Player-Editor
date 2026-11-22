import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('Sanitize All Sections Event Order & Ghost Controllers for 1122-08', () => {
  it('cleans 1122-07 and verifies event order and ghost CC11 removal', () => {
    const f07 = new Uint8Array(fs.readFileSync('tests/1122-07-clean.sty'));
    const parsed = YamahaParser.parse(f07, 'STY');

    // Run the global sanitizer
    YamahaStyleModifier.sanitizeAllSectionsEventOrderAndControllers(parsed);

    // Save cleaned file
    const outBytes = YamahaWriter.write(parsed);
    fs.writeFileSync('tests/1122-08-clean.sty', outBytes);

    const reParsed = YamahaParser.parse(outBytes, 'STY');
    const sections = ['Main A', 'Main B', 'Main C', 'Main D', 'Intro A', 'Intro B', 'Ending A'];

    for (const secName of sections) {
      const sec = reParsed.sections.find(s => s.name === secName);
      if (!sec) continue;

      const r = { startTick: sec.startTick, endTick: sec.startTick + (sec.measureCount || 1) * 1920 * 4 };

      // 1. Verify that at startTick, NO NoteOn precedes any CC or PC
      let t = 0;
      let seenNoteOnAtRel0 = false;
      let violatedChannelSetupAfterNoteOn = 0;
      let ghostCC11Count = 0;

      reParsed.tracks[0].events.forEach(ev => {
        t += ev.delta;
        if (t === sec.startTick) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            seenNoteOnAtRel0 = true;
          }
          if (seenNoteOnAtRel0) {
            if (ev.type === 'programChange' || (ev.type === 'controlChange' && [0, 32, 7, 10, 11].includes(ev.controller!))) {
              violatedChannelSetupAfterNoteOn++;
              console.error(`Violation in ${secName} at startTick: Controller/PC (${ev.type} ${ev.controller ?? ev.program}) came AFTER NoteOn!`);
            }
          }
        }
        if (t > sec.startTick && t < r.endTick) {
          if (ev.type === 'controlChange' && ev.controller === 11) {
            ghostCC11Count++;
          }
        }
      });

      console.log(`[${secName}] Violated Order Count: ${violatedChannelSetupAfterNoteOn}, Ghost CC11: ${ghostCC11Count}`);
      expect(violatedChannelSetupAfterNoteOn).toBe(0);
      expect(ghostCC11Count).toBe(0);
    }
  });
});
