import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Deep inspection of Bar 1 (Beat 1, 2, 3, 4) in Main A, B, C, D in 1122-07 vs Yamaha Official', () => {
  it('dumps and compares Bar 1 vs Bar 2, Beat 1 vs Beat 2/3', () => {
    const f07 = new Uint8Array(fs.readFileSync('tests/1122-07-clean.sty'));
    const parsed07 = YamahaParser.parse(f07, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const parsedOff = YamahaParser.parse(fOff, 'STY');

    const sections = ['Main A', 'Main B', 'Main C', 'Main D'];

    for (const secName of sections) {
      const s07 = parsed07.sections.find(s => s.name === secName)!;
      const sOff = parsedOff.sections.find(s => s.name === secName)!;

      console.log(`\n=======================================================`);
      console.log(`=== ${secName.toUpperCase()}: BAR 1 vs BAR 2 BEAT-BY-BEAT ===`);
      console.log(`=======================================================`);

      console.log(`\n>>> [1122-07] ${secName} Bar 1:`);
      dumpBarBeats(parsed07, s07.startTick, 1, '1122-07');
      console.log(`\n>>> [1122-07] ${secName} Bar 2:`);
      dumpBarBeats(parsed07, s07.startTick + 1920 * 4, 2, '1122-07');

      console.log(`\n>>> [Yamaha Official] ${secName} Bar 1:`);
      dumpBarBeats(parsedOff, sOff.startTick, 1, 'Yamaha');
      console.log(`\n>>> [Yamaha Official] ${secName} Bar 2:`);
      dumpBarBeats(parsedOff, sOff.startTick + 1920 * 4, 2, 'Yamaha');
    }

    console.log(`\n=======================================================`);
    console.log(`=== ORIGINAL MIDI BAR 6 to 14 (Main A) INSPECTION ===`);
    console.log(`=======================================================`);
    const fMidi = new Uint8Array(fs.readFileSync('容易受伤的女人.mid'));
    const parsedMidi = YamahaParser.parse(fMidi, 'MIDI');
    console.log('MIDI PPQ:', parsedMidi.division);
    const midiPPQ = parsedMidi.division;
    // Bar 6 in 480 PPQ is from tick 5 * 4 * 480 = 9600 to 6 * 4 * 480 = 11520
    for (let bar = 6; bar <= 7; bar++) {
      const bStart = (bar - 1) * 4 * midiPPQ;
      const bEnd = bar * 4 * midiPPQ;
      console.log(`\n--- MIDI Bar ${bar} (tick ${bStart} to ${bEnd}) ---`);
      for (let ch = 0; ch < 16; ch++) {
        let t = 0;
        const notes: string[] = [];
        parsedMidi.tracks.forEach(tr => {
          t = 0;
          tr.events.forEach((ev: any) => {
            t += ev.delta;
            if (t >= bStart && t < bEnd && ev.channel === ch && ev.type === 'noteOn' && ev.velocity > 0) {
              const rel = t - bStart;
              const bt = Math.floor(rel / midiPPQ) + 1;
              const tk = rel % midiPPQ;
              notes.push(`${noteName(ev.noteNumber)}(v${ev.velocity})@bt${bt}.${tk}`);
            }
          });
        });
        if (notes.length > 0) {
          console.log(`  Ch ${ch.toString().padStart(2)}: ${notes.join(', ')}`);
        }
      }
    }
  });
});

function dumpBarBeats(parsed: any, barStartTick: number, barNum: number, label: string) {
  let t = 0;
  const barEndTick = barStartTick + 1920 * 4;
  const eventsByBeat: { [bt: number]: any[] } = { 1: [], 2: [], 3: [], 4: [] };

  parsed.tracks[0].events.forEach((ev: any) => {
    t += ev.delta;
    if (t >= barStartTick && t < barEndTick) {
      const rel = t - barStartTick;
      const bt = Math.floor(rel / 1920) + 1;
      const tk = rel % 1920;
      eventsByBeat[bt].push({ rel, tk, ev });
    }
  });

  for (let b = 1; b <= 4; b++) {
    const list = eventsByBeat[b];
    const summary = list.map(item => {
      const e = item.ev;
      if (e.type === 'noteOn' && e.velocity > 0) {
        return `Ch${e.channel}:${noteName(e.noteNumber)}(v${e.velocity})@tk${item.tk}`;
      } else if (e.type === 'controlChange') {
        if ([1, 7, 10, 11, 64].includes(e.controller)) {
          return `Ch${e.channel}:CC${e.controller}=${e.value}@tk${item.tk}`;
        }
      } else if (e.type === 'programChange') {
        return `Ch${e.channel}:PC=${e.programNumber}@tk${item.tk}`;
      }
      return null;
    }).filter(Boolean);
    console.log(`  Bar ${barNum} Beat ${b} (${list.length} evs): ${summary.join(', ')}`);
  }
}

describe('Inspect exact events at rel=0 for Main A, B, C, D', () => {
  it('dumps order of events at startTick for Main A, B, C, D', () => {
    const f07 = new Uint8Array(fs.readFileSync('tests/1122-07-clean.sty'));
    const p07 = YamahaParser.parse(f07, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const pOff = YamahaParser.parse(fOff, 'STY');

    for (const secName of ['Main A', 'Main B', 'Main C', 'Main D']) {
      const s07 = p07.sections.find(s => s.name === secName)!;
      const sOff = pOff.sections.find(s => s.name === secName)!;

      console.log(`\n======================================================`);
      console.log(`=== EVENT SEQUENCE AT START OF ${secName} ===`);
      console.log(`======================================================`);

      console.log(`--- [Yamaha Official] ${secName} (startTick=${sOff.startTick}) ---`);
      let tOff = 0;
      let orderOff = 0;
      pOff.tracks[0].events.forEach(ev => {
        tOff += ev.delta;
        if (tOff === sOff.startTick) {
          orderOff++;
          let desc = `[#${orderOff}] ch=${ev.channel} type=${ev.type}`;
          if (ev.type === 'noteOn') desc += ` note=${ev.noteNumber} vel=${ev.velocity}`;
          if (ev.type === 'noteOff') desc += ` note=${ev.noteNumber}`;
          if (ev.type === 'controlChange') desc += ` CC${ev.controller}=${ev.value}`;
          if (ev.type === 'programChange') desc += ` PC=${(ev as any).program ?? (ev as any).programNumber}`;
          if (ev.type === 'meta') desc += ` Meta=0x${(ev as any).metaType?.toString(16)} ${(ev as any).text ?? ''}`;
          console.log(`  ${desc}`);
        }
      });
    }
  });
});

function dumpBar1Events(parsed: any, startTick: number, label: string) {
  let t = 0;
  const bar1End = startTick + 1920 * 4;
  parsed.tracks[0].events.forEach((ev: any) => {
    t += ev.delta;
    if (t >= startTick && t < bar1End) {
      const rel = t - startTick;
      const bt = Math.floor(rel / 1920) + 1;
      const tk = rel % 1920;
      const btStr = `Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel.toString().padStart(4, ' ')})`;

      if (ev.type === 'noteOn' && ev.velocity > 0) {
        console.log(`[${label}] ${btStr} Ch ${ev.channel.toString().padStart(2, ' ')} NoteOn  ${ev.noteNumber.toString().padStart(3, ' ')} (${noteName(ev.noteNumber).padEnd(4, ' ')}) vel=${ev.velocity}`);
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
        // console.log(`[${label}] ${btStr} Ch ${ev.channel} NoteOff ${ev.noteNumber}`);
      } else if (ev.type === 'controlChange') {
        if (ev.controller === 11 || ev.controller === 1 || ev.controller === 7 || ev.controller === 10) {
          console.log(`[${label}] ${btStr} Ch ${ev.channel.toString().padStart(2, ' ')} CC${ev.controller.toString().padEnd(3, ' ')} val=${ev.value}`);
        }
      } else if (ev.type === 'programChange') {
        console.log(`[${label}] ${btStr} Ch ${ev.channel.toString().padStart(2, ' ')} PC ${ev.programNumber}`);
      }
    }
  });
}

function noteName(n: number) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const oct = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${oct}`;
}