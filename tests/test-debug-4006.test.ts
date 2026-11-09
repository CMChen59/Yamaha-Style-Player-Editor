import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('Deep Inspect 4006 Main A', () => {
  it('inspects Main A details', () => {
    const filePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');

    console.log('=== 4006_SX900.T547.sty Overview ===');
    console.log('Division (PPQ):', parsed.division);
    console.log('BPM:', parsed.bpm);
    console.log('TimeSignature:', parsed.timeSignature);
    console.log('hasCasm:', parsed.hasCasm);
    console.log('hasOts:', parsed.hasOts);

    const mainA = parsed.sections.find(s => s.name.toLowerCase() === 'main a')!;
    console.log('\n=== Main A Section ===');
    console.log('startTick:', mainA.startTick, 'endTick:', mainA.endTick, 'measureCount:', mainA.measureCount);
    console.log('initialControllers in Main A:', JSON.stringify(mainA.initialControllers, null, 2));

    console.log('\n=== CASM Entries in Main A ===');
    const casmEntries = parsed.casmEntries?.['main a'] || [];
    for (const e of casmEntries) {
      console.log(`SrcCh: ${e.srcCh} -> DestCh: ${e.destCh} (${e.partName}):`);
      console.log(`  chordRoot: ${e.chordRoot}, chordType: ${e.chordType}`);
      console.log(`  NTR: ${e.ntr}, NTT: ${e.ntt}`);
      console.log(`  hiKey: ${e.hiKey}, lowLimit: ${e.lowLimit}, highLimit: ${e.highLimit}`);
      console.log(`  retriggerRule: ${e.retriggerRule}`);
    }

    console.log('\n=== All MIDI Events in Main A (Tick range: ' + mainA.startTick + ' ~ ' + mainA.endTick + ') ===');
    const allEvents: any[] = [];
    for (const [trkIdx, trk] of parsed.tracks.entries()) {
      let curTick = 0;
      for (const ev of trk.events) {
        curTick += ev.delta;
        if (curTick >= mainA.startTick && curTick < mainA.endTick) {
          allEvents.push({
            track: trkIdx,
            absTick: curTick,
            relTick: curTick - mainA.startTick,
            channel: ev.channel,
            type: ev.type,
            controller: ev.controller,
            value: ev.value,
            program: ev.program,
            note: ev.noteNumber,
            vel: ev.velocity,
          });
        }
      }
    }

    // Breakdown
    const controllersByCh: Record<number, any[]> = {};
    const notesByCh: Record<number, any[]> = {};
    for (const ev of allEvents) {
      const ch = ev.channel ?? -1;
      if (ev.type === 'controlChange' || ev.type === 'programChange') {
        if (!controllersByCh[ch]) controllersByCh[ch] = [];
        controllersByCh[ch].push(ev);
      } else if (ev.type === 'noteOn' && ev.vel > 0) {
        if (!notesByCh[ch]) notesByCh[ch] = [];
        notesByCh[ch].push(ev);
      }
    }

    console.log('\n--- Channels with Notes in Main A ---');
    for (const [ch, list] of Object.entries(notesByCh)) {
      console.log(`Channel ${ch}: ${list.length} note-ons`);
    }

    console.log('\n--- Controllers in Main A ---');
    for (const [ch, list] of Object.entries(controllersByCh)) {
      console.log(`Channel ${ch}: ${list.length} control events:`);
      for (const c of list) {
        if (c.type === 'programChange') {
          console.log(`  RelTick ${c.relTick}: ProgramChange ${c.program}`);
        } else {
          console.log(`  RelTick ${c.relTick}: CC ${c.controller} = ${c.value}`);
        }
      }
    }

    // Check engine part voice info
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
    const voices = styPlaybackEngine.getPartVoices();
    console.log('\n=== StyPlaybackEngine Part Voices for Main A ===');
    for (const [ch, v] of voices.entries()) {
      console.log(`DestCh ${ch} (${ch + 1}): voiceName="${v.voiceName}", category="${v.category}", MSB=${v.msb}, LSB=${v.lsb}, PC=${v.pc}`);
      console.log(`  effectiveVolume=${styPlaybackEngine.getEffectiveChannelVolume(ch)}, pan=${styPlaybackEngine.getChannelPan(ch)}, rev=${styPlaybackEngine.getChannelReverb(ch)}, cho=${styPlaybackEngine.getChannelChorus(ch)}`);
    }
  });
});
