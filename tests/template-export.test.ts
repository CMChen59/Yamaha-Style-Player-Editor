import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import type { MidiEvent } from '../src/core/models/types';

describe('Golden Template STY Export', () => {
  it('modifies fixed_伤心酒店 Style.sty with user notes and keeps 100% Yamaha integrity', () => {
    const templateBytes = fs.readFileSync('public/samples/fixed_伤心酒店 Style.sty');
    const parsed = YamahaParser.parse(new Uint8Array(templateBytes), 'STY');

    // 1. Check sections in template
    console.log('Template sections:');
    parsed.sections.forEach(s => {
      console.log(`  ${s.name.padEnd(12)} start=${s.startTick} end=${s.endTick} bars=${s.measureCount}`);
    });

    const division = parsed.division; // 96
    const ticksPerBeat = division;
    const ticksPerBar = division * 4; // 384 ticks per 4/4 bar
    const stepsPerBar = 16;
    const ticksPerStep = ticksPerBar / stepsPerBar; // 24 ticks per 16th note

    // Find Main A range
    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    expect(mainA).toBeDefined();
    console.log(`Main A starts at tick ${mainA.startTick}, ends at ${mainA.endTick}, bars=${mainA.measureCount}`);

    // Create user pattern (4 bars):
    // Bar 0..3: Kick on step 0, 8; Snare on step 4, 12; Bass on step 0; Chord on step 0
    const userNotes: Array<{ ch: number; note: number; startTick: number; durationTick: number; vel: number }> = [];
    for (let bar = 0; bar < 4; bar++) {
      const barTick = bar * ticksPerBar;
      // Kick (Ch 9, idx 9)
      userNotes.push({ ch: 9, note: 36, startTick: barTick, durationTick: 18, vel: 100 });
      userNotes.push({ ch: 9, note: 36, startTick: barTick + 8 * ticksPerStep, durationTick: 18, vel: 100 });
      // Snare
      userNotes.push({ ch: 9, note: 38, startTick: barTick + 4 * ticksPerStep, durationTick: 18, vel: 100 });
      userNotes.push({ ch: 9, note: 38, startTick: barTick + 12 * ticksPerStep, durationTick: 18, vel: 100 });
      // Hi-hat
      for (let s = 0; s < 16; s += 2) {
        userNotes.push({ ch: 9, note: 42, startTick: barTick + s * ticksPerStep, durationTick: 12, vel: 90 });
      }
      // Bass (Ch 10)
      userNotes.push({ ch: 10, note: 36, startTick: barTick, durationTick: 48, vel: 100 });
      // Chord (Ch 11) - C Major (60, 64, 67)
      userNotes.push({ ch: 11, note: 60, startTick: barTick, durationTick: 96, vel: 95 });
      userNotes.push({ ch: 11, note: 64, startTick: barTick, durationTick: 96, vel: 95 });
      userNotes.push({ ch: 11, note: 67, startTick: barTick, durationTick: 96, vel: 95 });
    }

    // Now, in Main A (and Main B, Main C, Main D), replace musical notes with user notes!
    // Since Main A in template is 16 bars (6144 ticks), we loop our 4-bar pattern 4 times to fill 16 bars!
    const targetSections = ['Main A', 'Main B', 'Main C', 'Main D'];
    
    // Separate non-note events from note events
    const tr0 = parsed.tracks[0];
    let curTick = 0;

    interface TimedEvent {
      absTick: number;
      priority: number;
      event: MidiEvent;
    }
    const nonNoteEvents: TimedEvent[] = [];

    for (const ev of tr0.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' || ev.type === 'noteOff') {
        // We will replace notes in Main sections
        continue;
      }
      // If it's tempo or track name, we can update it
      if (ev.type === 'meta' && ev.metaType === 0x51) {
        // 120 BPM = 500,000 microseconds per beat
        const mpqn = Math.round(60000000 / 120);
        ev.metaData = new Uint8Array([(mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff]);
      }
      if (ev.type === 'meta' && ev.metaType === 0x03) {
        ev.text = 'User MyStyle';
        ev.metaData = new TextEncoder().encode('User MyStyle');
      }
      nonNoteEvents.push({ absTick: curTick, priority: 10, event: ev });
    }

    // Add user notes to each Main section
    for (const secName of targetSections) {
      const sec = parsed.sections.find(s => s.name === secName);
      if (!sec) continue;

      const secStart = sec.startTick;
      const secBars = sec.measureCount || 4;
      const userPatternBars = 4;

      for (let b = 0; b < secBars; b++) {
        const userBarIdx = b % userPatternBars;
        const barOffsetInSec = b * ticksPerBar;

        const barNotes = userNotes.filter(n => Math.floor(n.startTick / ticksPerBar) === userBarIdx);
        for (const n of barNotes) {
          const noteStartInBar = n.startTick % ticksPerBar;
          const absStart = secStart + barOffsetInSec + noteStartInBar;
          const absEnd = absStart + n.durationTick;

          // Note On
          nonNoteEvents.push({
            absTick: absStart,
            priority: 50,
            event: {
              delta: 0,
              type: 'noteOn',
              channel: n.ch,
              noteNumber: n.note,
              velocity: n.vel,
            },
          });
          // Note Off
          nonNoteEvents.push({
            absTick: absEnd,
            priority: 40,
            event: {
              delta: 0,
              type: 'noteOff',
              channel: n.ch,
              noteNumber: n.note,
              velocity: 0,
            },
          });
        }
      }
    }

    // Sort all events by absTick
    nonNoteEvents.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.priority - b.priority;
    });

    // Reconstruct delta times
    let prevTick = 0;
    const finalEvents: MidiEvent[] = [];
    for (const item of nonNoteEvents) {
      item.event.delta = Math.max(0, item.absTick - prevTick);
      finalEvents.push(item.event);
      prevTick = item.absTick;
    }

    tr0.events = finalEvents;
    YamahaPadModifier.rebuildTrackRawChunk(tr0);

    // Validate and write
    const result = YamahaWriter.validateAndWrite(parsed);
    expect(result.success).toBe(true);
    expect(result.hasCasm).toBe(true);
    expect(result.totalNotes).toBeGreaterThan(100);

    console.log(`Generated template-based style size: ${result.fileSize} bytes, total notes: ${result.totalNotes}`);
    fs.writeFileSync('public/samples/template_export_test.sty', Buffer.from(result.bytes));
    console.log('Saved to public/samples/template_export_test.sty');
  });
});
