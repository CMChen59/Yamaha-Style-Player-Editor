import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Deep inspection of Ending A in 1122-06 vs Yamaha Official vs MIDI', () => {
  it('analyzes Ending A start and overall structure', () => {
    const f06 = new Uint8Array(fs.readFileSync('tests/1122-06-clean.sty'));
    const parsed06 = YamahaParser.parse(f06, 'STY');

    const fOff = new Uint8Array(fs.readFileSync('tests/yamaha-official.sty'));
    const parsedOff = YamahaParser.parse(fOff, 'STY');

    const end06 = parsed06.sections.find(s => s.name === 'Ending A')!;
    const endOff = parsedOff.sections.find(s => s.name === 'Ending A')!;

    console.log(`Ending A in 1122-06: bars=${(end06.endTick! - end06.startTick)/(1920*4)}`);
    console.log(`Ending A in Yamaha Official: bars=${(endOff.endTick! - endOff.startTick)/(1920*4)}`);

    // Check all events at rel = 0 in 1122-06
    console.log('\n=== 1122-06 ENDING A REL=0 EVENTS ===');
    let t = 0;
    parsed06.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === end06.startTick) {
        if (ev.type === 'noteOn') {
          console.log(`Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        } else if (ev.type === 'controlChange') {
          console.log(`Ch ${ev.channel} CC ${(ev as any).controller} val=${(ev as any).value}`);
        }
      }
    });

    // Check all events at rel = 0 in Yamaha Official
    console.log('\n=== YAMAHA OFFICIAL ENDING A REL=0 EVENTS ===');
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === endOff.startTick) {
        if (ev.type === 'noteOn') {
          console.log(`Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        } else if (ev.type === 'controlChange') {
          console.log(`Ch ${ev.channel} CC ${(ev as any).controller} val=${(ev as any).value}`);
        }
      }
    });

    // Check Notes in Bar 1 (rel < 1920 * 4) in 1122-06
    console.log('\n=== 1122-06 ENDING A: BAR 1 NOTES (rel < 7680) ===');
    t = 0;
    parsed06.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= end06.startTick && t < end06.startTick + 1920 * 4) {
        const rel = t - end06.startTick;
        if (ev.type === 'noteOn' && (ev as any).velocity > 0) {
          console.log(`rel=${rel.toString().padStart(5, ' ')}: Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) {
          if (rel < 1920) {
            console.log(`rel=${rel.toString().padStart(5, ' ')}: Ch ${ev.channel} NoteOff ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)})`);
          }
        }
      }
    });

    // Check Notes in Bar 1 in Yamaha Official
    console.log('\n=== YAMAHA OFFICIAL ENDING A: BAR 1 NOTES (rel < 7680) ===');
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= endOff.startTick && t < endOff.startTick + 1920 * 4) {
        const rel = t - endOff.startTick;
        if (ev.type === 'noteOn' && (ev as any).velocity > 0) {
          console.log(`rel=${rel.toString().padStart(5, ' ')}: Ch ${ev.channel} NoteOn ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
        }
      }
    });

    // Check Drums in both
    console.log('\n=== CH 9 (DRUMS) FIRST 10 NOTES IN ENDING A: 1122-06 ===');
    let cnt = 0;
    t = 0;
    parsed06.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= end06.startTick && t < end06.endTick) {
        if (ev.channel === 9 && ev.type === 'noteOn' && (ev as any).velocity > 0 && cnt < 10) {
          const rel = t - end06.startTick;
          console.log(`rel=${rel}: Note ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
          cnt++;
        }
      }
    });

    console.log('\n=== CH 9 (DRUMS) FIRST 10 NOTES IN ENDING A: YAMAHA OFFICIAL ===');
    cnt = 0;
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= endOff.startTick && t < endOff.endTick) {
        if (ev.channel === 9 && ev.type === 'noteOn' && (ev as any).velocity > 0 && cnt < 10) {
          const rel = t - endOff.startTick;
          console.log(`rel=${rel}: Note ${(ev as any).noteNumber} (${noteName((ev as any).noteNumber)}) vel=${(ev as any).velocity}`);
          cnt++;
        }
      }
    });

    // Check ghost CC11 in Ending A of 1122-06 and Yamaha Official
    let ghostCC11Count06 = 0;
    t = 0;
    parsed06.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= end06.startTick && t < end06.endTick) {
        if (ev.type === 'controlChange' && (ev as any).controller === 11) {
          ghostCC11Count06++;
        }
      }
    });

    let ghostCC11CountOff = 0;
    t = 0;
    parsedOff.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= endOff.startTick && t < endOff.endTick) {
        if (ev.type === 'controlChange' && (ev as any).controller === 11) {
          ghostCC11CountOff++;
        }
      }
    });

    console.log(`\nEnding A CC11 count in 1122-06: ${ghostCC11Count06}`);
    console.log(`Ending A CC11 count in Yamaha Official: ${ghostCC11CountOff}`);

    // Check CASM rules for Ending A
    console.log('\n=== CASM RULES FOR ENDING A: 1122-06 ===');
    CasmModifier.extractPartRules(parsed06, 'Ending A').forEach(r => {
      console.log(`  Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}`);
    });

    console.log('\n=== CASM RULES FOR ENDING A: YAMAHA OFFICIAL ===');
    CasmModifier.extractPartRules(parsedOff, 'Ending A').forEach(r => {
      console.log(`  Ch ${r.channel} (${r.partId}): NTR=${r.ntr}, NTT=${r.ntt}, Root=${r.sourceChordRoot}, Type=${r.sourceChordType}`);
    });
  });
});

function noteName(n: number) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const oct = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${oct}`;
}