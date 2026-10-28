import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import type { MidiEvent, YamahaFileParsed } from '../src/core/models/types';

const userDownloads = path.join(process.env.USERPROFILE || '', 'Downloads');
const inputPath = path.join(userDownloads, 'edited_伤心酒店 Style.sty');
const outputPath = path.join(userDownloads, 'fixed_伤心酒店 Style.sty');

console.log('Reading:', inputPath);
const buf = fs.readFileSync(inputPath);
const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

console.log('Original sections:');
for (const s of parsed.sections) {
  console.log(`  ${s.name.padEnd(12)} startTick=${s.startTick} endTick=${s.endTick} bars=${s.measureCount}`);
}

const ticksPerBeat = parsed.division;
const ticksPerMeasure = Math.round(ticksPerBeat * parsed.timeSignature.numerator * (4 / parsed.timeSignature.denominator));
console.log(`Ticks per measure at PPQ ${parsed.division} (${parsed.timeSignature.numerator}/${parsed.timeSignature.denominator}): ${ticksPerMeasure}`);

// 1. Shift all non-SInt/non-SFF2 section markers and musical events by 1 measure
// SInt measure is tick 0 to ticksPerMeasure
const tr0 = parsed.tracks[0];
const oldEvents = tr0.events;

// Separate setup events from musical / section events
// Absolute ticks
let curTick = 0;
interface AbsEvent {
  absTick: number;
  priority: number;
  event: MidiEvent;
}
const absList: AbsEvent[] = [];

// Yamaha Style Header SysEx (F0 43 76 1A 10 01 01 01 01 01 01 01 01 F7)
const sysexStyleHeader: MidiEvent = {
  delta: 0,
  type: 'sysex',
  rawBytes: new Uint8Array([0x43, 0x76, 0x1a, 0x10, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xf7]),
};

// GM On (F0 7E 7F 09 01 F7)
const sysexGmOn: MidiEvent = {
  delta: 0,
  type: 'sysex',
  rawBytes: new Uint8Array([0x7e, 0x7f, 0x09, 0x01, 0xf7]),
};

// XG System On (F0 43 10 4C 00 00 7E 00 F7)
const sysexXgOn: MidiEvent = {
  delta: 0,
  type: 'sysex',
  rawBytes: new Uint8Array([0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]),
};

absList.push({ absTick: 0, priority: 1, event: sysexStyleHeader });
absList.push({ absTick: 0, priority: 2, event: sysexGmOn });
absList.push({ absTick: Math.round(ticksPerMeasure * 0.1), priority: 3, event: sysexXgOn });

// Voice overrides:
// Bass (ch 10): Finger Bass (MSB 0, LSB 0, PC 33)
// Chord 1 (ch 11): Grand Piano (MSB 0, LSB 0, PC 0)
// Chord 2 (ch 12): Steel/Nylon Guitar (MSB 0, LSB 0, PC 24)
// Pad (ch 13): Strings (MSB 0, LSB 0, PC 48 or 51)
// Phrase 1 (ch 14): Woodwind / Flute (MSB 0, LSB 0, PC 73 or 75)
// Phrase 2 (ch 15): Saxophone (MSB 0, LSB 0, PC 65)
// Drums (ch 8, 9): Standard Drums (MSB 127, LSB 0, PC 0)

for (let i = 0; i < oldEvents.length; i++) {
  const ev = oldEvents[i];
  curTick += ev.delta;

  if (curTick === 0) {
    // Tick 0 meta events or setup events
    if (ev.type === 'meta' && (ev.metaType === 0x06 || ev.metaType === 0x03 || ev.metaType === 0x58 || ev.metaType === 0x51)) {
      if (ev.text === 'SFF2' || ev.text === 'SInt' || ev.metaType === 0x03 || ev.metaType === 0x58 || ev.metaType === 0x51) {
        absList.push({ absTick: 0, priority: 10, event: ev });
        continue;
      }
      // If it's a section marker at tick 0 (like Intro A), shift it to ticksPerMeasure!
      absList.push({ absTick: ticksPerMeasure, priority: 20, event: ev });
      continue;
    }

    // CC 32 (Bank LSB): If ch >= 10 and value === 112, fix to 0!
    if (ev.type === 'controlChange' && ev.controller === 32) {
      const ch = ev.channel ?? 0;
      const isDrum = ch === 8 || ch === 9;
      const fixedVal = isDrum ? 0 : 0; // Standard XG bank LSB is 0
      absList.push({
        absTick: Math.round(ticksPerMeasure * 0.4),
        priority: 15,
        event: { ...ev, value: fixedVal },
      });
      continue;
    }

    // CC 0 (Bank MSB)
    if (ev.type === 'controlChange' && ev.controller === 0) {
      const ch = ev.channel ?? 0;
      const isDrum = ch === 8 || ch === 9;
      const fixedVal = isDrum ? 127 : 0;
      absList.push({
        absTick: Math.round(ticksPerMeasure * 0.3),
        priority: 14,
        event: { ...ev, value: fixedVal },
      });
      continue;
    }

    // Program Change
    if (ev.type === 'programChange') {
      absList.push({
        absTick: Math.round(ticksPerMeasure * 0.5),
        priority: 16,
        event: ev,
      });
      continue;
    }

    // Controllers (Volume CC7, Pan CC10, Expression CC11, Reverb CC91, Chorus CC93)
    if (ev.type === 'controlChange') {
      absList.push({
        absTick: Math.round(ticksPerMeasure * 0.2),
        priority: 12,
        event: ev,
      });
      continue;
    }
  }

  // Musical events / Section markers > 0: Shift by 1 measure!
  const shiftedTick = curTick + ticksPerMeasure;
  absList.push({
    absTick: shiftedTick,
    priority: ev.type === 'meta' && ev.metaType === 0x06 ? 20 : (ev.type === 'noteOff' ? 40 : 50),
    event: ev,
  });
}

// Sort all events by absolute tick
absList.sort((a, b) => {
  if (a.absTick !== b.absTick) return a.absTick - b.absTick;
  return a.priority - b.priority;
});

// Convert back to deltas
let prevTick = 0;
const newEvents: MidiEvent[] = [];
for (const item of absList) {
  const dt = Math.max(0, item.absTick - prevTick);
  item.event.delta = dt;
  newEvents.push(item.event);
  prevTick = item.absTick;
}

tr0.events = newEvents;
YamahaPadModifier.rebuildTrackRawChunk(tr0);

// Update section timings
const newSections = parsed.sections.map(s => {
  if (s.name === 'SFF2') {
    return { ...s, startTick: 0, endTick: 0, measureCount: 0 };
  }
  if (s.name === 'SInt') {
    return { ...s, startTick: 0, endTick: ticksPerMeasure, measureCount: 1 };
  }
  return {
    ...s,
    startTick: s.startTick + ticksPerMeasure,
    endTick: s.endTick !== undefined ? s.endTick + ticksPerMeasure : undefined,
  };
});
parsed.sections = newSections;

// Update parts config to MSB 0, LSB 0 for non-drum, MSB 127, LSB 0 for drum
parsed.parts = parsed.parts.map(p => {
  const isDrum = p.channel === 8 || p.channel === 9;
  return {
    ...p,
    bankMsb: isDrum ? 127 : 0,
    bankLsb: 0,
  };
});

console.log('\nFixed sections:');
for (const s of parsed.sections) {
  console.log(`  ${s.name.padEnd(12)} startTick=${s.startTick} endTick=${s.endTick} bars=${s.measureCount}`);
}

console.log('\nFixed parts:');
for (const p of parsed.parts) {
  console.log(`  Ch ${p.channel + 1}: ${p.partName.padEnd(24)} Bank=${p.bankMsb}-${p.bankLsb} PC=${p.programChange}`);
}

// Write the fixed file
const validation = YamahaWriter.validateAndWrite(parsed);
fs.writeFileSync(outputPath, Buffer.from(validation.bytes));
fs.writeFileSync('public/samples/fixed_伤心酒店 Style.sty', Buffer.from(validation.bytes));
console.log(`\nSuccessfully written: ${outputPath} (${validation.bytes.length} bytes)`);
console.log(`Also copied to public/samples/fixed_伤心酒店 Style.sty`);

// Verification: Read back and parse
const reReadBuf = fs.readFileSync(outputPath);
const reParsed = YamahaParser.parse(new Uint8Array(reReadBuf), 'STY');
console.log('\n--- Re-read Verification ---');
console.log('Sections:');
for (const s of reParsed.sections) {
  console.log(`  ${s.name.padEnd(12)} startTick=${s.startTick} endTick=${s.endTick} bars=${s.measureCount}`);
}
console.log('Parts:');
for (const p of reParsed.parts) {
  console.log(`  Ch ${p.channel + 1}: ${p.partName.padEnd(24)} Bank=${p.bankMsb}-${p.bankLsb} PC=${p.programChange}`);
}
const tr0Re = reParsed.tracks[0];
const sysexList = tr0Re.events.filter(e => e.type === 'sysex');
console.log('SysEx count:', sysexList.length);
for (const s of sysexList) {
  console.log(`  delta=${s.delta} SysEx: ${Buffer.from((s as any).rawBytes || []).toString('hex')}`);
}
let note1Tick: number | null = null;
let t = 0;
for (const ev of tr0Re.events) {
  t += ev.delta;
  if (ev.type === 'noteOn' && (ev.velocity || 0) > 0 && note1Tick === null) {
    note1Tick = t;
  }
}
console.log('First note at tick:', note1Tick, `(Measure ${Math.floor((note1Tick ?? 0) / ticksPerMeasure) + 1})`);

