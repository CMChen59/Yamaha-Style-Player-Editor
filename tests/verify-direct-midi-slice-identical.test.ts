import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';

describe('Verify that re-slicing from MIDI produces the exact same clean results', () => {
  it('assembles Intro B and Ending A directly from MIDI through core engine', () => {
    const midiBuf = fs.readFileSync('容易受伤的女人.mid');
    const sourceParsed = YamahaParser.parse(new Uint8Array(midiBuf));
    const analysis = MidiSongAnalyzer.analyze(sourceParsed);

    const fTpl = new Uint8Array(fs.readFileSync('samples/CHINA Ballad.T547.sty'));
    const styleParsed = YamahaParser.parse(fTpl, 'STY');

    // Assemble Intro B from Bar 26 to 33
    const mappingIntroB = MidiPartAssignMatrix.createAutoMappingPlan(analysis, { sourceParsed, startBar: 26, endBar: 33 });
    const resIntroB = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed,
      baseStyleParsed: styleParsed,
      startBar: 26,
      endBar: 33,
      targetSection: 'Intro B',
      mappingPlan: mappingIntroB,
      analysis,
      chordMode: 'ORIGINAL_PASS_THROUGH'
    });

    // Assemble Ending A from Bar 66 to 72 into the same styleParsed
    const mappingEndingA = MidiPartAssignMatrix.createAutoMappingPlan(analysis, { sourceParsed, startBar: 66, endBar: 72 });
    const resEndingA = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed,
      baseStyleParsed: resIntroB.styleParsed,
      startBar: 66,
      endBar: 72,
      targetSection: 'Ending A',
      mappingPlan: mappingEndingA,
      analysis,
      chordMode: 'ORIGINAL_PASS_THROUGH'
    });

    const finalStyleParsed = resEndingA.styleParsed;

    // Now inspect finalStyleParsed:
    const ibSec = finalStyleParsed.sections.find(s => s.name === 'Intro B')!;
    const endSec = finalStyleParsed.sections.find(s => s.name === 'Ending A')!;

    // 1. Intro B checks:
    let ibNote49AtRel0 = 0;
    let ibGhostCC11 = 0;
    let t = 0;
    finalStyleParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= ibSec.startTick && t < ibSec.endTick) {
        if (t === ibSec.startTick && ev.type === 'noteOn' && ev.channel === 9 && (ev as any).noteNumber === 49) {
          ibNote49AtRel0++;
        }
        if (t > ibSec.startTick && ev.type === 'controlChange' && (ev as any).controller === 11) {
          ibGhostCC11++;
        }
      }
    });

    console.log(`Direct MIDI Slice - Intro B Note 49 at rel=0: ${ibNote49AtRel0}`);
    console.log(`Direct MIDI Slice - Intro B Ghost CC11 count: ${ibGhostCC11}`);
    expect(ibNote49AtRel0).toBe(0);
    expect(ibGhostCC11).toBe(0);

    // 2. Ending A checks:
    let endNote69AtRel0 = 0;
    let endGhostCC11 = 0;
    t = 0;
    finalStyleParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= endSec.startTick && t < endSec.endTick) {
        if (t === endSec.startTick && ev.type === 'noteOn' && ev.channel === 14 && (ev as any).noteNumber === 69) {
          endNote69AtRel0++;
        }
        if (t > endSec.startTick && ev.type === 'controlChange' && (ev as any).controller === 11) {
          endGhostCC11++;
        }
      }
    });

    console.log(`Direct MIDI Slice - Ending A Note 69 at rel=0: ${endNote69AtRel0}`);
    console.log(`Direct MIDI Slice - Ending A Ghost CC11 count: ${endGhostCC11}`);
    expect(endNote69AtRel0).toBe(0);
    expect(endGhostCC11).toBe(0);
  });
});