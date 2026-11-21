import { describe, it } from 'vitest';
import fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

function mapAmNoteToCTemplateMinor(noteNumber: number): number {
  const octave = Math.floor(noteNumber / 12);
  const pc = noteNumber % 12;

  // Exact 1-to-1 minor degree mapping:
  // In Am: Tonic = A (pc 9)
  // 6 (A, pc 9)   -> 1 (C, pc 0)
  // b7 (Bb, pc 10)-> b2 (Db, pc 1)
  // 7 (B, pc 11)  -> 2 (D, pc 2)
  // 1 (C, pc 0)   -> b3 (Eb, pc 3 -> mapped to E/pc 4 so Yamaha lowers to Eb in minor)
  // #1 (C#, pc 1) -> 3 (E, pc 4)
  // 2 (D, pc 2)   -> 4 (F, pc 5)
  // #2 (Eb, pc 3) -> #4 (F#, pc 6)
  // 3 (E, pc 4)   -> 5 (G, pc 7)
  // 4 (F, pc 5)   -> b6 (Ab, pc 8)  <-- FIXED from 9 to 8!
  // #4 (F#, pc 6) -> 6 (A, pc 9)    <-- 9 is distinct from 8!
  // 5 (G, pc 7)   -> b7 (Bb, pc 10) <-- FIXED from 11 to 10!
  // #5 (G#, pc 8) -> 7 (B, pc 11)   <-- 11 is distinct from 10!

  const map: Record<number, number> = {
    9: 0,   // A -> C
    10: 1,  // Bb -> Db
    11: 2,  // B -> D
    0: 4,   // C -> E
    1: 4,   // C# -> E
    2: 5,   // D -> F
    3: 6,   // Eb -> F#
    4: 7,   // E -> G
    5: 8,   // F -> Ab (Note 4 in score)
    6: 9,   // F# -> A (Note #4 in score)
    7: 10,  // G -> Bb (Note 5 in score)
    8: 11   // G# -> B (Note #5 in score)
  };

  const newPc = map[pc];
  let targetNote = octave * 12 + newPc;
  if (pc >= 9 && newPc <= 2) {
    targetNote += 12; // A4 (69) -> C5 (72)
  }
  return targetNote;
}

describe('Generate corrected Minor C-template Multi Pad', () => {
  it('converts 2010-1_PAD.PAD with accurate minor scale mapping', () => {
    const raw = fs.readFileSync('D:/Keyboard/節奏檔/空港/2010-1_PAD.PAD');
    const p = YamahaParser.parse(raw, 'PAD');

    // Strip ALL non-ASCII text from Track 0
    p.tracks[0].events = p.tracks[0].events.filter(e => {
      if (e.text) {
        if (/[^\x00-\x7F]/.test(e.text)) {
          return false;
        }
      }
      return true;
    });

    // Set Pad Names and Settings using YamahaPadModifier (Pure English / ASCII, NO Chinese)
    YamahaPadModifier.setPadName(p, 1, 'Strings Pad');
    YamahaPadModifier.setPadName(p, 2, 'AirPort Lead 1');
    YamahaPadModifier.setPadName(p, 3, 'AirPort Pipe 2');
    YamahaPadModifier.setPadName(p, 4, 'Intro Arp');

    for (let i = 1; i <= 4; i++) {
      YamahaPadModifier.setPadChordMatch(p, i, true);
      YamahaPadModifier.setPadRepeat(p, i, false);
      YamahaPadModifier.setPadIcon(p, i, 'S809');
    }

    // Transform notes in tracks 1 to 4 and REBUILD rawChunk!
    for (let trk = 1; trk <= 4; trk++) {
      p.tracks[trk].events.forEach(e => {
        if ((e.type === 'noteOn' || e.type === 'noteOff') && e.noteNumber !== undefined) {
          e.noteNumber = mapAmNoteToCTemplateMinor(e.noteNumber);
        }
      });
      YamahaPadModifier.rebuildTrackRawChunk(p.tracks[trk]);
    }
    YamahaPadModifier.rebuildTrackRawChunk(p.tracks[0]);

    const outBytes = YamahaWriter.write(p);

    // Save to workspace samples/
    const outPath = 'samples/2010_Intro_CM_Minor_Fixed.PAD';
    fs.writeFileSync(outPath, Buffer.from(outBytes));
    console.log('Successfully saved', outPath, 'size:', outBytes.byteLength);

    // Verify notes
    const verify = YamahaParser.parse(Buffer.from(outBytes), 'PAD');
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

    console.log('\n=== VERIFY TRACK 2 ALL NOTES ===');
    let curTick = 0;
    const ppq = verify.division;
    verify.tracks[2].events.forEach(e => {
      curTick += e.delta;
      if (e.type === 'noteOn' && (e.velocity ?? 0) > 0) {
        const bar = (curTick / (ppq * 4) + 1).toFixed(2);
        const name = names[(e.noteNumber ?? 0) % 12] + Math.floor((e.noteNumber ?? 0) / 12 - 1);
        console.log(`  bar=${bar} note=${e.noteNumber}(${name}) vel=${e.velocity}`);
      }
    });
  });
});
