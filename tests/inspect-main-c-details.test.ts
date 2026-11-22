import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Deep inspection of Main C in 1122-05 vs Yamaha Official', () => {
  it('inspects Main C notes, controllers, CASM in both files', () => {
    const f05 = new Uint8Array(fs.readFileSync('tests/1122-05-clean.sty'));
    const parsed05 = YamahaParser.parse(f05, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const parsedOff = YamahaParser.parse(fOff, 'STY');

    const sec05 = parsed05.sections.find(s => s.name === 'Main C')!;
    const secOff = parsedOff.sections.find(s => s.name === 'Main C')!;

    console.log('=== CASM RULES FOR MAIN A IN 1122-05 ===');
    const rules05A = CasmModifier.extractPartRules(parsed05, 'Main A');
    rules05A.forEach(r => {
      console.log(`Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });

    console.log('=== CASM RULES FOR MAIN B IN 1122-05 ===');
    const rules05B = CasmModifier.extractPartRules(parsed05, 'Main B');
    rules05B.forEach(r => {
      console.log(`Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });

    console.log('=== CASM RULES FOR MAIN D IN 1122-05 ===');
    const rules05D = CasmModifier.extractPartRules(parsed05, 'Main D');
    rules05D.forEach(r => {
      console.log(`Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });
    const rules05 = CasmModifier.extractPartRules(parsed05, 'Main C');
    rules05.forEach(r => {
      console.log(`Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });

    console.log('\n=== CASM RULES FOR MAIN C IN YAMAHA OFFICIAL ===');
    const rulesOff = CasmModifier.extractPartRules(parsedOff, 'Main C');
    rulesOff.forEach(r => {
      console.log(`Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });

    // Check 1122-01.sty vs 1122-05.sty in Main C
    const f01 = new Uint8Array(fs.readFileSync('tests/1122-01.sty'));
    const parsed01 = YamahaParser.parse(f01, 'STY');
    const sec01 = parsed01.sections.find(s => s.name === 'Main C')!;

    console.log('--- Checking all Note 49 NoteOns in Main C and Main D ---');
    [sec05, parsed05.sections.find(s => s.name === 'Main D')!].forEach(sec => {
      let t = 0;
      parsed05.tracks[0].events.forEach(ev => {
        t += ev.delta;
        if (t >= sec.startTick && t < sec.endTick) {
          const rel = t - sec.startTick;
          if (ev.type === 'noteOn' && (ev as any).velocity > 0 && ev.channel === 9 && (ev as any).noteNumber === 49) {
            console.log(`[${sec.name}] rel=${rel} (Bar ${Math.floor(rel/7680)+1} Bt ${Math.floor((rel%7680)/1920)+1}): Ch 9 Note 49 vel=${(ev as any).velocity}`);
          }
        }
      });
    });
    [sec05, parsed05.sections.find(s => s.name === 'Main D')!].forEach(sec => {
      let t = 0;
      parsed05.tracks[0].events.forEach(ev => {
        t += ev.delta;
        if (t >= sec.startTick && t < sec.endTick) {
          const rel = t - sec.startTick;
          if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) {
            if ((ev.channel === 9 && (ev as any).noteNumber === 49) || (ev.channel === 11 && (ev as any).noteNumber === 60)) {
              console.log(`[${sec.name}] rel=${rel}: Ch ${ev.channel} Note ${(ev as any).noteNumber} type=${ev.type}`);
            }
          }
        }
      });
    });
    const sec05B = parsed05.sections.find(s => s.name === 'Main B')!;
    dumpSectionNotes(parsed05, sec05B, 1);

    console.log('--- Checking Main B Bar 1 Notes in Yamaha Official ---');
    const secOffB = parsedOff.sections.find(s => s.name === 'Main B')!;
    dumpSectionNotes(parsedOff, secOffB, 1);

    // Search the entire MIDI for the drums and bass of Main C to know the exact bar in the MIDI!
    const midiBuf = fs.readFileSync('容易受伤的女人.mid');
    const parsedMidi = YamahaParser.parse(new Uint8Array(midiBuf));
    const ppq = parsedMidi.division || 480;
    console.log(`MIDI division/PPQ: ${ppq}`);

    // Search exact source MIDI ticks for each section in Yamaha Official
    console.log('=== CSEGS IN 1122-05 ===');
    const casmChunk = parsed05.customChunks.find(c => c.id === 'CASM')!;
    const cData = casmChunk.data;
    const v = new DataView(cData.buffer, cData.byteOffset, cData.byteLength);
    let off = 0;
    let csegIdx = 0;
    while (off <= cData.length - 8) {
      const tag = String.fromCharCode(...cData.slice(off, off + 4));
      const len = v.getUint32(off + 4);
      if (tag === 'CSEG') {
        let sub = off + 8;
        const end = off + 8 + len;
        let sdecNames: string[] = [];
        while (sub <= end - 8) {
          const sTag = String.fromCharCode(...cData.slice(sub, sub + 4));
          const sLen = v.getUint32(sub + 4);
          if (sTag === 'Sdec') {
            const sStr = new TextDecoder().decode(cData.slice(sub + 8, sub + 8 + sLen));
            sdecNames = sStr.split(/[\x00,]+/).map(s => s.trim()).filter(Boolean);
          }
          sub += 8 + sLen;
        }
        console.log(`CSEG ${csegIdx++} (len ${len}): sections = [${sdecNames.join(', ')}]`);
      }
      off += 8 + len;
    }
    ['Main A', 'Main B', 'Main C', 'Main D'].forEach(secName => {
      const s05 = parsed05.sections.find(s => s.name === secName)!;
      const sOff = parsedOff.sections.find(s => s.name === secName)!;
      
      const notes05: string[] = [];
      let t = 0;
      parsed05.tracks[0].events.forEach(ev => {
        t += ev.delta;
        if (t === s05.startTick && ev.type === 'noteOn' && (ev as any).velocity > 0) {
          notes05.push(`Ch${ev.channel}:${(ev as any).noteNumber}(${noteName((ev as any).noteNumber)})v${(ev as any).velocity}`);
        }
      });

      const notesOff: string[] = [];
      t = 0;
      parsedOff.tracks[0].events.forEach(ev => {
        t += ev.delta;
        if (t === sOff.startTick && ev.type === 'noteOn' && (ev as any).velocity > 0) {
          notesOff.push(`Ch${ev.channel}:${(ev as any).noteNumber}(${noteName((ev as any).noteNumber)})v${(ev as any).velocity}`);
        }
      });

      console.log(`\n[${secName}]`);
      console.log(`  1122-05: ${notes05.join(', ')}`);
      console.log(`  Yamaha:  ${notesOff.join(', ')}`);
    });
    parsedOff.sections.forEach(sec => {
      if (sec.name === 'SInt' || sec.name === 'SFF2') return;
      // Get the first bass note or drum note in sec
      let firstBass: any = null;
      let tSec = 0;
      parsedOff.tracks[0].events.forEach(ev => {
        tSec += ev.delta;
        if (tSec >= sec.startTick && tSec < sec.endTick) {
          if (!firstBass && ev.type === 'noteOn' && (ev as any).velocity > 0 && ev.channel === 1) {
            firstBass = { rel: tSec - sec.startTick, note: (ev as any).noteNumber, vel: (ev as any).velocity };
          }
        }
      });
      if (firstBass) {
        // Find this note in MIDI
        let matchTicks: number[] = [];
        let tMidi = 0;
        parsedMidi.tracks[0].events.forEach(ev => {
          tMidi += ev.delta;
          if (ev.type === 'noteOn' && ev.channel === 1 && (ev as any).noteNumber === firstBass.note && (ev as any).velocity === firstBass.vel) {
            matchTicks.push(tMidi);
          }
        });
        const barMatches = matchTicks.map(t => {
          const b = Math.floor(t / 384) + 1;
          const bt = Math.floor((t % 384) / 96) + 1;
          const tk = t % 96;
          return `Bar ${b}:${bt}:${tk} (tick ${t})`;
        });
        console.log(`Section "${sec.name}": firstBass note=${firstBass.note} vel=${firstBass.vel} rel=${firstBass.rel} => matches in MIDI: ${barMatches.join(', ')}`);
      }
    });

    // Check Bar 34 in MIDI:
    // What tick is Bar 34? If 0-indexed, bar 33 is the 34th bar: 33 * 4 * ppq.
    const bar34Start = 33 * 4 * ppq;
    const bar34End = 34 * 4 * ppq;
    console.log(`MIDI Bar 34 (1-based Bar 34) ticks: ${bar34Start} ~ ${bar34End}`);

    // Print all noteOn events in Bar 34
    console.log('--- MIDI Bar 34 Notes (tick 12672 ~ 13056) ---');
    parsedMidi.tracks.forEach((trk, idx) => {
      let t = 0;
      trk.events.forEach(ev => {
        t += ev.delta;
        if (ev.type === 'noteOn' && (ev as any).velocity > 0 && t >= bar34Start && t < bar34End) {
          console.log(`  tick=${t} (offset=${t - bar34Start}): Trk ${idx} Ch ${ev.channel} Note ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        }
      });
    });

    // Also print notes at tick 12624 (just before Bar 34)
    console.log('--- MIDI Notes at tick 12624 (Bar 33 Bt 4.5) ---');
    parsedMidi.tracks.forEach((trk, idx) => {
      let t = 0;
      trk.events.forEach(ev => {
        t += ev.delta;
        if (t === 12624 && ev.type === 'noteOn' && (ev as any).velocity > 0) {
          console.log(`  Trk ${idx} Ch ${ev.channel} Note ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        }
      });
    });

    const compLines: string[] = [];
    compLines.push('=== DETAILED EVENT-BY-EVENT COMPARISON: MAIN C BAR 1 & 2 ===');
    
    // Dump 1122-05 Main C
    compLines.push('--- 1122-05 Main C ---');
    let t = 0;
    parsed05.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= sec05.startTick && t < sec05.startTick + 1920 * 8) {
        const rel = t - sec05.startTick;
        const bar = Math.floor(rel / (1920 * 4)) + 1;
        const beat = Math.floor((rel % (1920 * 4)) / 1920) + 1;
        const beatTick = rel % 1920;
        if (ev.type === 'noteOn' && ev.velocity > 0) {
          compLines.push(`[1122-05] Bar ${bar} Bt ${beat}.${beatTick.toString().padStart(4, '0')} (rel=${rel.toString().padStart(5, ' ')}): Ch ${ev.channel.toString().padStart(2, ' ')} Note ${ev.noteNumber.toString().padStart(3, ' ')} (${noteName(ev.noteNumber).padEnd(4, ' ')}) vel=${ev.velocity}`);
        }
      }
    });

    // Dump Yamaha Official Main C
    compLines.push('\n--- Yamaha Official Main C ---');
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= secOff.startTick && t < secOff.startTick + 1920 * 8) {
        const rel = t - secOff.startTick;
        const bar = Math.floor(rel / (1920 * 4)) + 1;
        const beat = Math.floor((rel % (1920 * 4)) / 1920) + 1;
        const beatTick = rel % 1920;
        if (ev.type === 'noteOn' && ev.velocity > 0) {
          compLines.push(`[Yamaha]  Bar ${bar} Bt ${beat}.${beatTick.toString().padStart(4, '0')} (rel=${rel.toString().padStart(5, ' ')}): Ch ${ev.channel.toString().padStart(2, ' ')} Note ${ev.noteNumber.toString().padStart(3, ' ')} (${noteName(ev.noteNumber).padEnd(4, ' ')}) vel=${ev.velocity}`);
        }
      }
    });

    fs.writeFileSync('tests/main-c-bar1-2-comp.txt', compLines.join('\n'));

    console.log('\n=== NOTE EVENTS IN BAR 1 OF MAIN C IN 1122-05 (rel 0 ~ 7680) ===');
    dumpSectionNotes(parsed05, sec05, 1);

    console.log('\n=== NOTE EVENTS IN BAR 1 OF MAIN C IN YAMAHA OFFICIAL (rel 0 ~ 7680) ===');
    dumpSectionNotes(parsedOff, secOff, 1);

    console.log('\n=== YAMAHA OFFICIAL SECTIONS ===');
    parsedOff.sections.forEach(s => {
      console.log(`${s.name}: startTick=${s.startTick}, endTick=${s.endTick}, bars=${(s.endTick! - s.startTick)/1920/4}`);
    });
  });
});

function dumpSectionNotes(parsed: any, section: any, barNum: number) {
  let curTick = 0;
  const barTicks = 1920 * 4;
  const startRel = (barNum - 1) * barTicks;
  const endRel = barNum * barTicks;

  parsed.tracks[0].events.forEach((ev: any) => {
    curTick += ev.delta;
    if (curTick >= section.startTick && curTick < section.endTick) {
      const rel = curTick - section.startTick;
      if (rel >= startRel && rel < endRel) {
        if (ev.type === 'noteOn' && ev.velocity > 0) {
          console.log(`  rel=${rel.toString().padStart(5, ' ')} (Bt ${Math.floor(rel/1920)+1}.${(rel%1920).toString().padStart(4, '0')}): Ch ${ev.channel.toString().padStart(2, ' ')} NoteOn  ${ev.noteNumber} (${noteName(ev.noteNumber)}) vel=${ev.velocity}`);
        }
      }
    }
  });
}

function noteName(n: number) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const oct = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${oct}`;
}
