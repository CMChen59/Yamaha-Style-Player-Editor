import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix.ts';
import type { MidiSongAnalysis, MidiChannelAnalysis } from '../src/core/parser/midi-song-analyzer.ts';

const mockChannels: MidiChannelAnalysis[] = [
  { channel: 1, displayChannel: 2, hasNotes: true, noteCount: 151, notePercentage: 3.2, trackNames: ['Girl : Flute'], msb: 0, lsb: 0, pc: 75, rawMsb: 0, rawLsb: 0, rawPc: 75, panelCode: '0-0-76', voiceName: 'PanFlute (排笛)', category: 'Woodwind', isDrum: false, pitchMin: 74, pitchMax: 82, pitchRangeLabel: 'D5 ~ Bb5', firstBar: 8, lastBar: 78, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 2, displayChannel: 3, hasNotes: true, noteCount: 151, notePercentage: 3.2, trackNames: ['Boy : Sax'], msb: 0, lsb: 0, pc: 65, rawMsb: 0, rawLsb: 0, rawPc: 65, panelCode: '0-0-66', voiceName: 'AltoSax (中音薩克斯風)', category: 'Saxophone', isDrum: false, pitchMin: 62, pitchMax: 74, pitchRangeLabel: 'D4 ~ D5', firstBar: 16, lastBar: 78, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 3, displayChannel: 4, hasNotes: true, noteCount: 26, notePercentage: 0.5, trackNames: ['Grace : Bell'], msb: 0, lsb: 0, pc: 11, rawMsb: 0, rawLsb: 0, rawPc: 11, panelCode: '0-0-12', voiceName: 'Vibraphone (顫音琴)', category: 'Percussion', isDrum: false, pitchMin: 74, pitchMax: 85, pitchRangeLabel: 'D5 ~ C#6', firstBar: 23, lastBar: 64, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 4, displayChannel: 5, hasNotes: true, noteCount: 332, notePercentage: 7.0, trackNames: ['Back : Strings'], msb: 0, lsb: 0, pc: 50, rawMsb: 0, rawLsb: 0, rawPc: 50, panelCode: '0-0-51', voiceName: 'SynthStrings1 (合成弦樂 1)', category: 'Strings', isDrum: false, pitchMin: 57, pitchMax: 74, pitchRangeLabel: 'A2 ~ D5', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 5, displayChannel: 6, hasNotes: true, noteCount: 78, notePercentage: 1.6, trackNames: ['Leader: ST.Guitar'], msb: 0, lsb: 0, pc: 25, rawMsb: 0, rawLsb: 0, rawPc: 25, panelCode: '0-0-26', voiceName: 'SteelGuitar1 (鋼弦木吉他)', category: 'Guitar', isDrum: false, pitchMin: 50, pitchMax: 76, pitchRangeLabel: 'D3 ~ E5', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 6, displayChannel: 7, hasNotes: true, noteCount: 57, notePercentage: 1.2, trackNames: ['Inter : EL.Guitar'], msb: 0, lsb: 0, pc: 29, rawMsb: 0, rawLsb: 0, rawPc: 29, panelCode: '0-0-30', voiceName: 'Overdriven (破音電吉他)', category: 'Guitar', isDrum: false, pitchMin: 62, pitchMax: 89, pitchRangeLabel: 'D4 ~ F6', firstBar: 60, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 7, displayChannel: 8, hasNotes: true, noteCount: 233, notePercentage: 4.9, trackNames: ['Bass : Wood Bass'], msb: 0, lsb: 0, pc: 32, rawMsb: 0, rawLsb: 0, rawPc: 32, panelCode: '0-0-33', voiceName: 'AcousticBass (原聲木貝斯)', category: 'Bass', isDrum: false, pitchMin: 33, pitchMax: 58, pitchRangeLabel: 'A1 ~ Bb2', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 9, displayChannel: 10, hasNotes: true, noteCount: 1536, notePercentage: 32.3, trackNames: ['-- TG-100 GS ... StandardKit'], msb: 127, lsb: 0, pc: 0, rawMsb: 127, rawLsb: 0, rawPc: 0, panelCode: '127-0-1', voiceName: 'StandardKit (標準鼓組)', category: 'Drums', isDrum: true, pitchMin: 35, pitchMax: 57, pitchRangeLabel: 'B1 ~ A3', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 10, displayChannel: 11, hasNotes: true, noteCount: 935, notePercentage: 19.6, trackNames: ['Left : NL.Guitar'], msb: 0, lsb: 0, pc: 26, rawMsb: 0, rawLsb: 0, rawPc: 26, panelCode: '0-0-27', voiceName: 'JazzGuitar (爵士電吉他)', category: 'Guitar', isDrum: false, pitchMin: 45, pitchMax: 70, pitchRangeLabel: 'A2 ~ Bb4', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 },
  { channel: 12, displayChannel: 13, hasNotes: true, noteCount: 530, notePercentage: 11.1, trackNames: ['Chord : Piano'], msb: 0, lsb: 0, pc: 0, rawMsb: 0, rawLsb: 0, rawPc: 0, panelCode: '0-0-1', voiceName: 'GrandPiano (平台大鋼琴)', category: 'Piano', isDrum: false, pitchMin: 50, pitchMax: 65, pitchRangeLabel: 'D2 ~ D4', firstBar: 1, lastBar: 82, volume: 100, pan: 64, reverb: 40, chorus: 0, programChangesCount: 1 }
];

const mockAnalysis: MidiSongAnalysis = {
  fileName: 'pop_ballad_82bars.mid',
  midiFormat: 1,
  trackCount: 10,
  division: 480,
  totalTicks: 82 * 1920,
  totalBars: 82,
  durationSeconds: 210,
  formattedDuration: '03:30',
  initialBpm: 75,
  hasTempoChanges: false,
  minBpm: 75,
  maxBpm: 75,
  tempoEvents: [{ tick: 0, bar: 1, bpm: 75 }],
  timeSignature: { numerator: 4, denominator: 4 },
  timeSignatureEvents: [{ tick: 0, bar: 1, numerator: 4, denominator: 4 }],
  keySignatureLabel: 'C Major',
  ticksPerBar: 1920,
  songMarkers: [],
  totalNotes: 4752,
  channelsWithNotesCount: mockChannels.length,
  activeChannels: mockChannels,
  channelsWithNotes: mockChannels,
  instrumentCategories: ['Woodwind', 'Saxophone', 'Percussion', 'Strings', 'Guitar', 'Bass', 'Drums', 'Piano']
};

const plan = MidiPartAssignMatrix.createAutoMappingPlan(mockAnalysis);
console.log('=== 🎉 82 小節流行歌智慧映射演算法驗收結果 ===');
console.log(`總活躍通道: ${plan.totalActiveChannels} 軌`);
console.log(`智慧排除主旋律: ${plan.excludedCount} 軌`);
console.log(`成功指派 Yamaha 伴奏聲部: ${plan.assignedCount} 軌`);
console.log('\n--- 16 通道指派詳情 ---');
for (const a of plan.assignments) {
  if (a.isExcluded) {
    console.log(`CH ${String(a.displaySourceChannel).padStart(2)}: ${a.trackNames[0].padEnd(30)} -> [🚫 智慧排除主旋律] (信心度: ${a.melodyInfo.confidence}%, 原因: ${a.melodyInfo.reasons.join(', ')})`);
  } else {
    console.log(`CH ${String(a.displaySourceChannel).padStart(2)}: ${a.trackNames[0].padEnd(30)} -> [🎯 Yamaha ${a.targetPart} (Ch ${a.targetChannel! + 1})] (樂器: ${a.voiceName})`);
  }
}

// 嚴格斷言驗證
if (plan.excludedCount !== 2) throw new Error('主旋律排除數量不正確');
if (plan.partToSourceChannelMap.get('Rhythm2') !== 9) throw new Error('Rhythm 2 未映射至 CH 10 鼓組');
if (plan.partToSourceChannelMap.get('Bass') !== 7) throw new Error('Bass 未映射至 CH 8 原聲貝斯');
if (plan.partToSourceChannelMap.get('Pad') !== 4) throw new Error('Pad 未映射至 CH 5 長音弦樂');
if (plan.partToSourceChannelMap.get('Chord1') !== 12) throw new Error('Chord 1 未映射至 CH 13 鋼琴');
if (plan.partToSourceChannelMap.get('Chord2') !== 10) throw new Error('Chord 2 未映射至 CH 11 爵士吉他');
if (plan.partToSourceChannelMap.get('Phrase1') !== 3) throw new Error('Phrase 1 未映射至 CH 4 顫音琴');

console.log('\n✅ 全部規則斷言 100% 通過！演算法完全符合 Yamaha 原廠伴奏聲部規範！');
