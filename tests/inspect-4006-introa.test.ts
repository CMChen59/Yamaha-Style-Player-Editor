import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

describe('Inspect 4006 Intro A', () => {
  it('inspects Intro A parts, notes, channels, and CASM', () => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty'));
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    console.log('Format:', parsed.format);
    const introA = parsed.sections.find(s => s.name === 'Intro A');
    console.log('Intro A range:', introA);
    console.log('CASM intro a:', JSON.stringify(parsed.casmMappings?.['intro a']));

    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    console.log('\n--- StyPlaybackEngine Part Voices for Intro A ---');
    const voices = styPlaybackEngine.getPartVoices();
    for (const [ch, v] of voices.entries()) {
      console.log(`Ch ${ch}: ${v.voiceName} (${v.msb}-${v.lsb}-${v.pc}) Category=${v.category}`);
    }

    // Inspect events in styPlaybackEngine
    // Note: private sectionEvents, but we can inspect parsed notes
    for (let c = 0; c < 16; c++) {
      let count = 0;
      let notes: number[] = [];
      for (const t of parsed.tracks) {
        let tick = 0;
        for (const ev of t.events) {
          tick += ev.delta;
          if (introA && tick >= introA.startTick && tick < introA.endTick) {
            if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel === c) {
              count++;
              notes.push(ev.noteNumber!);
            }
          }
        }
      }
      if (count > 0) {
        console.log(`MIDI Ch ${c}: ${count} notes ->`, notes.slice(0, 10));
      }
    }

    // Also inspect CASM chunk raw details if any
    const casmChunk = parsed.customChunks.find(c => c.id === 'CASM');
    if (casmChunk) {
      console.log('\nCASM Chunk length:', casmChunk.data.length);
    }
  });
});
