import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

function mapAmNoteToCTemplateMinor(noteNumber: number, m7Compensation: number = 0): number {
  const octave = Math.floor(noteNumber / 12);
  const pc = noteNumber % 12;

  const map: Record<number, number> = {
    9: 0,   // A -> C
    10: 1,  // Bb -> Db
    11: 2,  // B -> D
    0: 4,   // C -> E
    1: 4,   // C# -> E
    2: 5,   // D -> F
    3: 6,   // Eb -> F#
    4: 7,   // E -> G
    5: 8,   // F -> Ab (Note 4 in score - VERIFIED FIXED!)
    6: 9 + m7Compensation,   // F# -> A (+ compensation)
    7: 10,  // G -> Bb
    8: 11 + m7Compensation   // G# -> B (+ compensation)
  };

  const newPc = map[pc] % 12;
  let targetNote = octave * 12 + newPc;
  if (pc >= 9 && newPc <= 2) {
    targetNote += 12;
  }
  return targetNote;
}

describe('Generate Measure 7 Comparison Multi Pad', () => {
  it('creates test file with variations in Measure 7', () => {
    const raw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');

    // Create 4 variations in Pad 1..4:
    // Pad 1: Measure 7 with Standard mapping (B5 / A5)
    // Pad 2: Measure 7 with +1 semitone compensation on G# and F# (C6 / Bb5)
    // Pad 3: Measure 7 with +1 semitone on F# only (B5 / Bb5)
    // Pad 4: All Chord Match = ON with Ab5 in Measure 2 and tested

    const p = YamahaParser.parse(raw, 'PAD');

    // Strip non-ASCII
    p.tracks[0].events = p.tracks[0].events.filter(e => !(e.text && /[^\x00-\x7F]/.test(e.text)));

    YamahaPadModifier.setPadName(p, 1, 'Standard CM (B/A)');
    YamahaPadModifier.setPadName(p, 2, 'Compensated (+1 Semi)');
    YamahaPadModifier.setPadName(p, 3, 'F# Comp Only (B/Bb)');
    YamahaPadModifier.setPadName(p, 4, 'Alt Comp (C/A)');

    for (let i = 1; i <= 4; i++) {
      YamahaPadModifier.setPadChordMatch(p, i, true);
      YamahaPadModifier.setPadRepeat(p, i, false);
      YamahaPadModifier.setPadIcon(p, i, 'S809');
    }

    // Let's create the 4 variations for track 1..4 using track 2's melody!
    // We will copy track 2's melody into all 4 tracks, but with different Measure 7 mappings!
    const baseTrack2Events = JSON.parse(JSON.stringify(p.tracks[2].events));

    for (let pad = 1; pad <= 4; pad++) {
      const trkEvents = JSON.parse(JSON.stringify(baseTrack2Events));
      let comp = 0;
      if (pad === 2) comp = 1; // +1 semitone on both
      if (pad === 3) comp = 0; // special
      if (pad === 4) comp = 0;

      trkEvents.forEach((e: any) => {
        if ((e.type === 'noteOn' || e.type === 'noteOff') && e.noteNumber !== undefined) {
          const pc = e.noteNumber % 12;
          if (pad === 2) {
            // compensate G# and F# by +1
            if (pc === 8) { // G# (80) -> C6 (84)
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber) + 1;
            } else if (pc === 6) { // F# (78) -> Bb5 (82)
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber) + 1;
            } else {
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber);
            }
          } else if (pad === 3) {
            // compensate F# only
            if (pc === 6) {
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber) + 1; // A -> Bb
            } else {
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber);
            }
          } else if (pad === 4) {
            // compensate G# only
            if (pc === 8) {
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber) + 1; // B -> C
            } else {
              e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber);
            }
          } else {
            // Pad 1: standard fixed
            e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber);
          }
        }
      });

      p.tracks[pad].events = trkEvents;
      YamahaPadModifier.rebuildTrackRawChunk(p.tracks[pad]);
    }

    YamahaPadModifier.rebuildTrackRawChunk(p.tracks[0]);

    const outBytes = YamahaWriter.write(p);
    const outPath = 'samples/2010_Intro_Measure7_CompTest.PAD';
    fs.writeFileSync(outPath, Buffer.from(outBytes));
    console.log('Successfully saved', outPath);

    // Print Measure 7 notes for Pad 1..4
    const verify = YamahaParser.parse(Buffer.from(outBytes), 'PAD');
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    for (let pad = 1; pad <= 4; pad++) {
      console.log(`\n--- Pad ${pad} Measure 7 notes ---`);
      let curTick = 0;
      verify.tracks[pad].events.forEach(e => {
        curTick += e.delta;
        if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
          const bar = (curTick / (480 * 4) + 1).toFixed(2);
          if (parseFloat(bar) >= 8.4 && parseFloat(bar) <= 9.0) {
            const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
            console.log(`  bar=${bar} note=${e.noteNumber}(${name})`);
          }
        }
      });
    }
  });
});
