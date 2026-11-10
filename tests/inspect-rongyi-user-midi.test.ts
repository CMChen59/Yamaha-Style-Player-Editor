import { describe, it } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Inspect 容易受伤的女人.mid vs 1024_容易受傷的女人.sty', () => {
  it('analyzes bars 24 to 36 of the MIDI file and compares with STY', () => {
    const midiPath = './容易受伤的女人.mid';
    expect(fs.existsSync(midiPath)).toBe(true);

    const buf = fs.readFileSync(midiPath);
    const parsed = YamahaParser.parse(buf, 'MID');

    console.log('=== MIDI INFO ===');
    console.log('Division (PPQ):', parsed.division);
    console.log('BPM:', parsed.bpm);
    console.log('TimeSig:', parsed.timeSignature);

    const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');
    console.log('\n=== CHANNEL SUMMARY ===');
    for (const ch of analysis.activeChannels) {
      console.log(`Ch ${ch.channel} (Ch ${ch.channel + 1}): voice=${ch.voiceName} (${ch.bankMsb}-${ch.bankLsb}-${ch.programChange}), notes=${ch.totalNotes}, category=${ch.suggestedCategory}, role=${ch.suggestedRole}`);
    }

    const ticksPerBeat = parsed.division || 480;
    const beatsPerBar = (parsed.timeSignature?.numerator ?? 4);
    const ticksPerBar = ticksPerBeat * beatsPerBar;

    console.log(`\n=== BARS 24 to 36 DETAILS (ticksPerBar=${ticksPerBar}) ===`);

    for (let ch = 0; ch < 16; ch++) {
      const chEvents: any[] = [];
      let absTick = 0;

      for (const trk of parsed.tracks) {
        absTick = 0;
        for (const ev of trk.events) {
          absTick += ev.delta;
          if (ev.channel !== ch) continue;

          const bar = Math.floor(absTick / ticksPerBar) + 1;
          if (bar >= 24 && bar <= 36) {
            chEvents.push({ bar, absTick, ...ev });
          }
        }
      }

      if (chEvents.length === 0) continue;

      const noteOnEvents = chEvents.filter(e => e.type === 'noteOn' && e.velocity > 0);
      const ccEvents = chEvents.filter(e => e.type === 'controller');
      const pcEvents = chEvents.filter(e => e.type === 'programChange' || e.program !== undefined);

      if (noteOnEvents.length === 0 && ccEvents.length === 0 && pcEvents.length === 0) continue;

      console.log(`\n--- Channel ${ch} (Ch ${ch + 1}) ---`);
      if (pcEvents.length > 0) {
        console.log(`  Program Changes:`, pcEvents.map(e => `Bar ${e.bar}: PC=${e.program ?? e.programChange}`));
      }

      for (let b = 24; b <= 36; b++) {
        const bNotes = noteOnEvents.filter(e => e.bar === b);
        const bCCs = ccEvents.filter(e => e.bar === b);

        const vels = bNotes.map(e => e.velocity);
        const avgVel = vels.length ? Math.round(vels.reduce((a,b)=>a+b,0)/vels.length) : 0;
        const pitches = bNotes.map(e => e.noteNumber);

        const ccInfo = bCCs.map(c => `CC${c.controllerType}=${c.value}`).join(', ');

        if (bNotes.length > 0 || bCCs.length > 0) {
          console.log(`  Bar ${b}: notes=${bNotes.length} (vels: avg=${avgVel}, [${vels.join(',')}]) pitches=[${pitches.join(',')}] ${ccInfo ? `| CC: ${ccInfo}` : ''}`);
        }
      }
    }

    // Now inspect 1024_容易受傷的女人.sty
    const styPath = 'public/samples/1024_容易受傷的女人.sty';
    if (fs.existsSync(styPath)) {
      console.log('\n=== 1024_容易受傷的女人.sty DETAILED SECTIONS INSPECTION ===');
      const styBuf = fs.readFileSync(styPath);
      const styParsed = YamahaParser.parse(styBuf, 'STY');
      const ticksPerBeat = styParsed.division || 480;
      const ticksPerBar = ticksPerBeat * 4; // 1920

      // Inspect Intro B of 1024_容易受傷的女人.sty in detail:
      const introBSec = styParsed.sections.find(s => s.name === 'Intro B');
      if (introBSec) {
        console.log('\n=== 1024_容易受傷的女人.sty Intro B Tracks & Notes ===');
        const notesByCh = new Map<number, any[]>();
        for (const trk of styParsed.tracks) {
          let absTick = 0;
          for (const ev of trk.events) {
            absTick += ev.delta;
            if (absTick >= introBSec.startTick && absTick < (introBSec.endTick ?? Infinity)) {
              if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
                if (!notesByCh.has(ev.channel)) notesByCh.set(ev.channel, []);
                notesByCh.get(ev.channel)!.push({ ...ev, absTick, relTick: absTick - introBSec.startTick });
              }
            }
          }
        }
        for (const [ch, notes] of notesByCh.entries()) {
          const p = styParsed.parts.find(pt => pt.channel === ch);
          const vels = notes.map(n => n.velocity);
          const avgVel = Math.round(vels.reduce((a,b)=>a+b,0)/vels.length);
          const pitches = Array.from(new Set(notes.map(n => n.noteNumber))).sort((a,b)=>a-b);
          console.log(`  Ch ${ch} (${p?.partName ?? 'unknown'}, voice=${p?.voiceName}): ${notes.length} notes, avgVel=${avgVel}, pitches=[${pitches.slice(0, 10).join(',')}]`);
        }
      }

      // Inspect Main A of 1024_容易受傷的女人.sty in detail:
      const mainASec = styParsed.sections.find(s => s.name === 'Main A');
      if (mainASec) {
        console.log('\n=== 1024_容易受傷的女人.sty Main A Tracks & Notes ===');
        const notesByCh = new Map<number, any[]>();
        for (const trk of styParsed.tracks) {
          let absTick = 0;
          for (const ev of trk.events) {
            absTick += ev.delta;
            if (absTick >= mainASec.startTick && absTick < (mainASec.endTick ?? Infinity)) {
              if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
                if (!notesByCh.has(ev.channel)) notesByCh.set(ev.channel, []);
                notesByCh.get(ev.channel)!.push({ ...ev, absTick, relTick: absTick - mainASec.startTick });
              }
            }
          }
        }
        for (const [ch, notes] of notesByCh.entries()) {
          const p = styParsed.parts.find(pt => pt.channel === ch);
          const vels = notes.map(n => n.velocity);
          const avgVel = Math.round(vels.reduce((a,b)=>a+b,0)/vels.length);
          const pitches = Array.from(new Set(notes.map(n => n.noteNumber))).sort((a,b)=>a-b);
          console.log(`  Ch ${ch} (${p?.partName ?? 'unknown'}, voice=${p?.voiceName}): ${notes.length} notes, avgVel=${avgVel}, pitches=[${pitches.slice(0, 10).join(',')}]`);
        }
      }
    }
  });
});
