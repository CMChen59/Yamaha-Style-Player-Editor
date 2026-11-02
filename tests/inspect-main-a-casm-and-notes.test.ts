import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('Deep Inspect Main A for 4006 and 容易受傷的女人', () => {
  const files = [
    { name: '4006_SX900.T547.sty', path: 'public/samples/4006_SX900.T547.sty' },
    { name: '容易受傷的女人_keyboard.sty', path: 'samples/容易受傷的女人_keyboard.sty' },
  ];

  for (const item of files) {
    it(`inspects Main A for ${item.name}`, () => {
      if (!fs.existsSync(item.path)) {
        console.log(`File not found: ${item.path}`);
        return;
      }

      console.log(`\n======================================================`);
      console.log(`=== FILE: ${item.name} ===`);
      console.log(`======================================================`);

      const buf = new Uint8Array(fs.readFileSync(item.path));
      const parsed = YamahaParser.parse(buf, 'STY');

      const mainA = parsed.sections.find(s => s.name.toLowerCase() === 'main a');
      if (!mainA) {
        console.log('No Main A found!');
        return;
      }

      console.log(`Main A: startTick=${mainA.startTick}, endTick=${mainA.endTick}, measureCount=${mainA.measureCount}`);

      console.log(`\n--- CASM ENTRIES & MAPPINGS KEYS ---`);
      console.log('casmMappings keys:', Object.keys(parsed.casmMappings || {}));
      console.log('casmEntries keys:', Object.keys(parsed.casmEntries || {}));
      
      const secKey = Object.keys(parsed.casmEntries || {}).find(k => k.toLowerCase() === 'main a');
      const casmEntriesList = secKey ? parsed.casmEntries![secKey] : [];
      console.log(`CASM entries for [${secKey}]: count=${casmEntriesList.length}`);
      for (const entry of casmEntriesList) {
        console.log(`  SrcCh=${entry.sourceChannel} -> DestCh=${entry.destChannel} (${entry.partName}):`);
        console.log(`    NTR=${entry.ntr}, NTT=${entry.ntt}, HighKey=${entry.highKey}, NoteLimit=[${entry.noteLimitLow} ~ ${entry.noteLimitHigh}], RTR=${entry.rtr}`);
        console.log(`    srcRoot=${entry.sourceRoot}, chordType=${entry.chordType}`);
      }

      // 2. Playback Engine Voices for Main A
      styPlaybackEngine.loadParsed(parsed);
      styPlaybackEngine.selectSection('Main A');
      const voices = styPlaybackEngine.getPartVoices();
      console.log(`\n--- ENGINE PART VOICES IN MAIN A ---`);
      for (let ch = 8; ch <= 15; ch++) {
        const v = voices.get(ch);
        const vol = styPlaybackEngine.getChannelVolume(ch);
        const pan = styPlaybackEngine.getChannelPan(ch);
        const rev = styPlaybackEngine.getChannelReverb(ch);
        const cho = styPlaybackEngine.getChannelChorus(ch);
        if (v) {
          console.log(`Channel ${ch} (${ch + 1}): [${v.voiceName}] Category=${v.category} MSB=${v.msb} LSB=${v.lsb} PC=${v.pc} Vol=${vol} Pan=${pan} Rev=${rev} Cho=${cho}`);
        }
      }

      // 3. Notes in Main A by MIDI Channel
      console.log(`\n--- NOTES IN MAIN A BY SOURCE MIDI CHANNEL ---`);
      const tracks = parsed.tracks;
      const notesByCh: Record<number, any[]> = {};

      for (const track of tracks) {
        let curTick = 0;
        for (const ev of track.events) {
          curTick += ev.delta ?? 0;
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            if (curTick >= mainA.startTick && curTick < mainA.endTick) {
              const ch = ev.channel ?? 0;
              if (!notesByCh[ch]) notesByCh[ch] = [];
              notesByCh[ch].push({
                tick: curTick - mainA.startTick,
                note: ev.noteNumber,
                vel: ev.velocity,
              });
            }
          }
        }
      }

      for (const [chStr, nList] of Object.entries(notesByCh)) {
        const ch = parseInt(chStr, 10);
        console.log(`\nMIDI Channel ${ch} (Total Notes: ${nList.length}):`);
        const sampleNotes = nList.slice(0, 8);
        console.log(`  First 8 notes:`, sampleNotes.map(n => `T:${n.tick} N:${n.note} V:${n.vel}`).join(', '));

        const uniqueNotes = Array.from(new Set(nList.map(n => n.note))).sort((a: any, b: any) => a - b);
        console.log(`  Unique pitch set:`, uniqueNotes);

        const casmRule = casmEntriesList.find(e => e.srcCh === ch);
        console.log(`  CASM mapped:`, casmRule ? `DestCh=${casmRule.destCh} (${casmRule.partName}) NTR=${casmRule.ntr} NTT=${casmRule.ntt} chordType=${casmRule.chordType} chordRoot=${casmRule.chordRoot}` : 'NO CASM RULE');

        // Test ChordTransposer on unique notes with C (maj), G (maj), Am
        const cChord = ChordTransposer.buildChord('C', 'maj');
        const gChord = ChordTransposer.buildChord('G', 'maj');
        const amChord = ChordTransposer.buildChord('A', 'm');

        const transposedC = uniqueNotes.map((note: any) => {
          return `${note}->${ChordTransposer.transposeSingleNote(note, cChord, casmRule?.destCh ?? ch, false, 0, 127, casmRule?.ntr, casmRule?.ntt, casmRule?.chordType)}`;
        });
        console.log(`  Transposed under C maj:`, transposedC.join(', '));

        const transposedAm = uniqueNotes.map((note: any) => {
          return `${note}->${ChordTransposer.transposeSingleNote(note, amChord, casmRule?.destCh ?? ch, false, 0, 127, casmRule?.ntr, casmRule?.ntt, casmRule?.chordType)}`;
        });
        console.log(`  Transposed under Am:`, transposedAm.join(', '));
      }
    });
  }
});
