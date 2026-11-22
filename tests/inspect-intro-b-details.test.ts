import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Deep inspection of Intro B start in 1122-06 vs Yamaha Official vs MIDI', () => {
  it('analyzes Intro B start', () => {
    const f06 = new Uint8Array(fs.readFileSync('tests/1122-06-clean.sty'));
    const parsed06 = YamahaParser.parse(f06, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const parsedOff = YamahaParser.parse(fOff, 'STY');

    const midiBuf = fs.readFileSync('容易受伤的女人.mid');
    const parsedMidi = YamahaParser.parse(new Uint8Array(midiBuf));
    const ppq = parsedMidi.division || 96;

    const ib06 = parsed06.sections.find(s => s.name === 'Intro B')!;
    const ibOff = parsedOff.sections.find(s => s.name === 'Intro B')!;

    console.log(`Intro B in 1122-06: startTick=${ib06.startTick}, endTick=${ib06.endTick}, bars=${(ib06.endTick! - ib06.startTick)/(1920*4)}`);
    console.log(`Intro B in Yamaha Official: startTick=${ibOff.startTick}, endTick=${ibOff.endTick}, bars=${(ibOff.endTick! - ibOff.startTick)/(1920*4)}`);

    // Dump all events in Bar 1 & 2 of Intro B in 1122-06
    console.log('\n=== 1122-06 INTRO B: BAR 1 & 2 EVENTS ===');
    let t = 0;
    parsed06.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= ib06.startTick && t < ib06.startTick + 1920 * 8) {
        const rel = t - ib06.startTick;
        const bar = Math.floor(rel / (1920 * 4)) + 1;
        const bt = Math.floor((rel % (1920 * 4)) / 1920) + 1;
        const tk = rel % 1920;
        if (ev.type === 'noteOn' && (ev as any).velocity > 0) {
          console.log(`[1122-06] Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) {
          if (ev.channel === 11 || ev.channel === 9) {
            console.log(`[1122-06] Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} NoteOff ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)})`);
          }
        } else if (ev.type === 'controlChange') {
          if ((ev as any).controller === 11 || (ev as any).controller === 1 || (ev as any).controller === 7) {
            console.log(`[1122-06] Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} CC${(ev as any).controller} val=${(ev as any).value}`);
          }
        } else if (ev.type === 'programChange') {
          console.log(`[1122-06] Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} PC ${(ev as any).programNumber}`);
        }
      }
    });

    // Dump all events in Bar 1 & 2 of Intro B in Yamaha Official
    console.log('\n=== YAMAHA OFFICIAL INTRO B: BAR 1 & 2 EVENTS ===');
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= ibOff.startTick && t < ibOff.startTick + 1920 * 8) {
        const rel = t - ibOff.startTick;
        const bar = Math.floor(rel / (1920 * 4)) + 1;
        const bt = Math.floor((rel % (1920 * 4)) / 1920) + 1;
        const tk = rel % 1920;
        if (ev.type === 'noteOn') {
          console.log(`[Yamaha]  Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        } else if (ev.type === 'controlChange') {
          if ((ev as any).controller === 11 || (ev as any).controller === 1 || (ev as any).controller === 7) {
            console.log(`[Yamaha]  Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} CC${(ev as any).controller} val=${(ev as any).value}`);
          }
        } else if (ev.type === 'programChange') {
          console.log(`[Yamaha]  Bar ${bar} Bt ${bt}.${tk.toString().padStart(4, '0')} (rel=${rel}): Ch ${ev.channel} PC ${(ev as any).programNumber}`);
        }
      }
    });

    // Check MIDI around Bar 25 ~ 27 (PPQ = 96, 1 bar = 384 ticks)
    console.log('\n=== MIDI EVENTS AROUND BAR 25 ~ 27 (ticks 9216 ~ 10368) ===');
    parsedMidi.tracks.forEach((trk, trkIdx) => {
      let tM = 0;
      trk.events.forEach(ev => {
        tM += ev.delta;
        if (tM >= 24 * 384 && tM < 27 * 384) {
          const bar = Math.floor(tM / 384) + 1;
          const bt = Math.floor((tM % 384) / 96) + 1;
          const tk = tM % 96;
          if (ev.type === 'noteOn' && (ev as any).velocity > 0) {
            console.log(`[MIDI Trk ${trkIdx} Ch ${ev.channel}] Bar ${bar} Bt ${bt}.${tk} (tick=${tM}): Note ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
          }
        }
      });
    });

    // Compare CASM rules for Intro B in both files
    console.log('\n=== CASM RULES FOR INTRO B ===');
    console.log('1122-06:');
    CasmModifier.extractPartRules(parsed06, 'Intro B').forEach(r => {
      console.log(`  Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });
    console.log('Yamaha Official:');
    CasmModifier.extractPartRules(parsedOff, 'Intro B').forEach(r => {
      console.log(`  Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}, hiKey=${r.hiKey}`);
    });
  });
});

function noteName(n: number) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const oct = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${oct}`;
}
