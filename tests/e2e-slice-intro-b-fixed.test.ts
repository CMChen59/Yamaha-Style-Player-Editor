import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';

describe('End-to-End slice Intro B verification', () => {
  it('slices Bars 26~33 of 容易受伤的女人.mid into Intro B and verifies ghost CC11 elimination', () => {
    const midiPath = 'C:/Users/CM/.gemini/antigravity/brain/efa7139d-39ef-488e-b2d4-677174e8485e/.user_uploaded/media_1795267226707_f0b6a50c.mid';
    const parsedMidi = YamahaParser.parse(new Uint8Array(fs.readFileSync(midiPath)));
    const analysis = MidiSongAnalyzer.analyze(parsedMidi, '容易受伤的女人.mid');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      startBar: 26,
      endBar: 33,
      targetSection: 'Intro B',
      sourceParsed: parsedMidi,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsedMidi,
      analysis,
      startBar: 26,
      endBar: 33,
      targetSection: 'Intro B',
      mappingPlan: plan,
      chordMode: 'ORIGINAL_PASS_THROUGH',
    });

    const styleParsed = result.styleParsed;
    const introB = styleParsed.sections.find(s => s.name === 'Intro B')!;

    let ghostCC11Count = 0;
    let initialCC11Count = 0;
    let pitchBendCount = 0;
    let cc1Count = 0;
    let curTick = 0;

    styleParsed.tracks[0].events.forEach(ev => {
      curTick += ev.delta;
      if (curTick >= introB.startTick && curTick < introB.endTick) {
        if (ev.type === 'controlChange' && ev.controller === 11) {
          if (curTick === introB.startTick) {
            initialCC11Count++;
          } else {
            ghostCC11Count++;
          }
        } else if (ev.type === 'pitchBend') {
          pitchBendCount++;
        } else if (ev.type === 'controlChange' && ev.controller === 1) {
          cc1Count++;
        }
      }
    });

    console.log(`\n=== Verification Results ===`);
    console.log(`Initial CC11 = 127 events at startTick: ${initialCC11Count}`);
    console.log(`Ghost CC11 fadeout events inside Intro B: ${ghostCC11Count}`);
    console.log(`Real PitchBend events copied from MIDI: ${pitchBendCount}`);
    console.log(`Real CC1 (Modulation) events copied from MIDI: ${cc1Count}`);

    expect(ghostCC11Count).toBe(0);
    expect(initialCC11Count).toBe(7);
    expect(pitchBendCount).toBe(0); // 原始 MIDI 無彎音，舊範本幽靈彎音全數被乾淨清除！
    expect(cc1Count).toBe(152); // 原始 MIDI 之 152 個吉他搖桿顫音 (Modulation) 100% 完整繼承！
  });
});
