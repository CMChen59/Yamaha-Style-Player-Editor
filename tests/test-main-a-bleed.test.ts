import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';

describe('Verify Main A boundary bleed elimination', () => {
  it('slices Bars 6~13 into Main A and checks rel=0 notes', () => {
    const midiPath = 'C:/Users/CM/.gemini/antigravity/brain/efa7139d-39ef-488e-b2d4-677174e8485e/.user_uploaded/media_1795267226707_f0b6a50c.mid';
    const parsedMidi = YamahaParser.parse(new Uint8Array(fs.readFileSync(midiPath)));
    const analysis = MidiSongAnalyzer.analyze(parsedMidi, '容易受伤的女人.mid');

    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      startBar: 6,
      endBar: 13,
      targetSection: 'Main A',
      sourceParsed: parsedMidi,
    });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsedMidi,
      analysis,
      startBar: 6,
      endBar: 13,
      startBeat: 3,
      targetSection: 'Main A',
      mappingPlan: plan,
      chordMode: 'CM7_MAJOR',
    });

    const styleParsed = result.styleParsed;
    const mainA = styleParsed.sections.find(s => s.name === 'Main A')!;

    let curTick = 0;
    const rel0Notes: any[] = [];
    styleParsed.tracks[0].events.forEach(ev => {
      curTick += ev.delta;
      if (curTick >= mainA.startTick && curTick < mainA.endTick) {
        if (ev.type === 'noteOn' && ev.velocity > 0) {
          const rel = curTick - mainA.startTick;
          if (rel === 0) {
            rel0Notes.push({ ch: ev.channel, note: ev.noteNumber, vel: ev.velocity });
          }
        }
      }
    });

    console.log(`Notes at rel=0 in Main A: ${rel0Notes.length}`);
    rel0Notes.forEach(n => console.log(`  Ch ${n.ch} Note ${n.note} vel ${n.vel}`));

    // In Channel 12 (Guitar): There should be EXACTLY ONE note on Beat 1.0 (Note 60), NOT TWO!
    const ch12Notes = rel0Notes.filter(n => n.ch === 12);
    console.log('Ch 12 (Guitar) notes at rel=0:', ch12Notes);
    expect(ch12Notes.length).toBe(1);
    expect(ch12Notes[0].note).toBe(60); // C4 downbeat!
  });
});
