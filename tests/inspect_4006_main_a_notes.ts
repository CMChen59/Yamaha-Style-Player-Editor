import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

const filePath = path.resolve('public/samples/4006_SX900.T547.sty');
const buf = new Uint8Array(fs.readFileSync(filePath));
const parsed = YamahaParser.parse(buf, 'STY');

styPlaybackEngine.loadParsed(parsed);
styPlaybackEngine.selectSection('Main A');

console.log('Audition Chord:', styPlaybackEngine.getAuditionChord());

// Get raw note events prepared by selectSection
const rawEvents = (styPlaybackEngine as any).rawSectionEvents as any[];
console.log('Total rawSectionEvents in Main A:', rawEvents?.length);

// Group by destination channel
const byDestCh: Record<number, any[]> = {};
for (const ev of rawEvents) {
  if (!byDestCh[ev.channel]) byDestCh[ev.channel] = [];
  byDestCh[ev.channel].push(ev);
}

for (const [ch, list] of Object.entries(byDestCh)) {
  const channel = parseInt(ch, 10);
  console.log(`\n=== DestCh ${channel} (${list.length} notes) ===`);
  const v = styPlaybackEngine.getPartVoices().get(channel);
  console.log(`Voice: ${v?.voiceName} (MSB=${v?.msb}, LSB=${v?.lsb}, PC=${v?.pc}), Vol=${styPlaybackEngine.getEffectiveChannelVolume(channel)}`);
  
  // Print first 10 notes
  console.log('First 10 notes:');
  for (const n of list.slice(0, 10)) {
    console.log(`  relTick=${n.relTick}, note=${n.noteNumber}, vel=${n.velocity}, durTicks=${n.durationTicks}, srcCh=${n.sourceChannel}`);
  }
}
