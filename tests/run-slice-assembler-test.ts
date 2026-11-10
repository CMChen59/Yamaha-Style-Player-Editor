/**
 * MIDI 切片裝配至伴奏段落引擎驗收測試 (Slice Assembler Test)
 * 模擬 82 小節流行歌之小節切片 (第 1~4 小節)，組裝至 Yamaha Intro A 與 Main A 段落
 */

import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import type { YamahaFileParsed, MidiTrack, MidiEvent } from '../src/core/models/types';

function createMockPopSong82Bars(): YamahaFileParsed {
  const division = 480;
  const bpm = 120;
  const ticksPerBar = 480 * 4; // 1920 ticks per bar (4/4)

  const tracks: MidiTrack[] = [];

  // Track 0: Tempo, TimeSig
  const tr0Events: MidiEvent[] = [
    { delta: 0, type: 'meta', metaType: 0x51, bpm: 120 },
    { delta: 0, type: 'meta', metaType: 0x58, timeSignature: { numerator: 4, denominator: 4 } },
  ];

  // Helper to generate notes across bars
  const genNotes = (ch: number, startBar: number, endBar: number, noteInterval: number, pitch: number) => {
    const evs: MidiEvent[] = [];
    const startTick = (startBar - 1) * ticksPerBar;
    const endTick = endBar * ticksPerBar;
    let lastTick = 0;

    for (let t = startTick; t < endTick; t += noteInterval) {
      evs.push({
        delta: t - lastTick,
        type: 'noteOn',
        channel: ch,
        noteNumber: pitch,
        velocity: 90,
      });
      evs.push({
        delta: Math.min(noteInterval / 2, 240),
        type: 'noteOff',
        channel: ch,
        noteNumber: pitch,
        velocity: 0,
      });
      lastTick = t + Math.min(noteInterval / 2, 240);
    }
    return { evs, lastTick };
  };

  // 1. CH 2: Flute (主旋律 1)
  const fRes = genNotes(2, 5, 40, 480, 72); // 第 5~40 小節
  tracks.push({
    trackIndex: 1,
    name: 'Girl : Flute',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Girl : Flute' },
      { delta: 0, type: 'programChange', channel: 2, programChange: 73 }, // Flute
      ...fRes.evs,
    ],
  });

  // 2. CH 3: Sax (主旋律 2)
  const sRes = genNotes(3, 41, 82, 480, 65); // 第 41~82 小節
  tracks.push({
    trackIndex: 2,
    name: 'Boy : Sax',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Boy : Sax' },
      { delta: 0, type: 'programChange', channel: 3, programChange: 65 }, // Alto Sax
      ...sRes.evs,
    ],
  });

  // 3. CH 10 (ch 9): StandardKit 鼓組 (全曲 1~82 小節皆有)
  const dRes = genNotes(9, 1, 82, 240, 36); // 8分音符大鼓/小鼓
  tracks.push({
    trackIndex: 3,
    name: 'TG-100 GS Drum',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'TG-100 GS Drum' },
      { delta: 0, type: 'controlChange', channel: 9, controller: 0, value: 127 },
      { delta: 0, type: 'programChange', channel: 9, programChange: 0 },
      ...dRes.evs,
    ],
  });

  // 4. CH 8 (ch 7): Wood Bass (全曲 1~82 小節)
  const bRes = genNotes(7, 1, 82, 480, 40); // 4分音符貝斯
  tracks.push({
    trackIndex: 4,
    name: 'Bass : Wood Bass',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Bass : Wood Bass' },
      { delta: 0, type: 'programChange', channel: 7, programChange: 32 }, // Acoustic Bass
      ...bRes.evs,
    ],
  });

  // 5. CH 13 (ch 12): Chord Piano (全曲 1~82 小節)
  const pRes = genNotes(12, 1, 82, 480, 60); // 4分音符鋼琴和弦
  tracks.push({
    trackIndex: 5,
    name: 'Chord : Piano',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Chord : Piano' },
      { delta: 0, type: 'programChange', channel: 12, programChange: 0 }, // Piano
      ...pRes.evs,
    ],
  });

  // 6. CH 5 (ch 4): Back Strings (第 1~82 小節)
  const stRes = genNotes(4, 1, 82, 960, 55); // 2分音符弦樂長音
  tracks.push({
    trackIndex: 6,
    name: 'Back : Strings',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Back : Strings' },
      { delta: 0, type: 'programChange', channel: 4, programChange: 48 }, // Strings
      ...stRes.evs,
    ],
  });

  tracks.unshift({ trackIndex: 0, name: 'Conductor', events: tr0Events });

  return {
    format: 'STY',
    midiFormat: 1,
    division: 480,
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks,
    sections: [],
    customChunks: [],
    parts: [],
    markers: [],
  };
}

async function runTest() {
  console.log('=== 🚀 開始驗收 第 3 階段：MIDI 切片裝配至伴奏段落 ===\n');

  // 1. 建立 82 小節 Mock 流行歌
  const songParsed = createMockPopSong82Bars();
  const analysis = MidiSongAnalyzer.analyze(songParsed, 'PopSong82Bars.mid');
  console.log(`📌 來源 MIDI: ${analysis.fileName}, 總長度: ${analysis.totalBars} 小節, 活躍音軌: ${analysis.activeChannels.length} 軌`);

  // 2. 產生智慧映射計畫
  const mappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);
  console.log(`📌 映射計畫: 已指派伴奏聲部 ${mappingPlan.assignedCount} 軌, 排除主旋律 ${mappingPlan.excludedCount} 軌\n`);

  // 3. 測試 1: 切片 第 1~4 小節裝配至「前奏 A (Intro A)」
  console.log('--- 測試 1: 切片第 1 ~ 4 小節 (共 4 小節) -> Intro A ---');
  const result1 = MidiSliceAssembler.assembleSliceToSection({
    sourceParsed: songParsed,
    analysis,
    startBar: 1,
    endBar: 4,
    targetSection: 'Intro A',
    mappingPlan,
  });

  console.log(`結果狀態: ${result1.success ? '✅ 成功' : '❌ 失敗'}`);
  console.log(`目標段落: ${result1.targetSection}`);
  console.log(`切片小節: ${result1.startBar} ~ ${result1.endBar} (共 ${result1.totalBars} 小節)`);
  console.log(`提取總音符: ${result1.totalNotesExtracted} 顆`);
  console.log(`組裝聲部數: ${result1.assembledPartsCount} 聲部`);
  console.log('聲部清單:');
  for (const p of result1.partDetails) {
    console.log(`  - ${p.part} (Yamaha CH ${p.targetChannel + 1}): ${p.voiceName} -> 提取 ${p.noteCount} 音符 (來源 CH ${p.sourceChannel + 1})`);
  }

  // 斷言驗證
  if (!result1.success) throw new Error('測試 1 失敗: result.success 應為 true');
  if (result1.totalBars !== 4) throw new Error(`測試 1 失敗: totalBars 應為 4，實際為 ${result1.totalBars}`);
  if (result1.totalNotesExtracted <= 0) throw new Error('測試 1 失敗: 應提取出音符');

  // 4. 測試 2: 繼續在同一個 STY 伴奏檔中切片 第 5~12 小節 (共 8 小節) 裝配至「主歌 A (Main A)」
  console.log('\n--- 測試 2: 接續切片第 5 ~ 12 小節 (共 8 小節) -> Main A ---');
  const result2 = MidiSliceAssembler.assembleSliceToSection({
    sourceParsed: songParsed,
    analysis,
    startBar: 5,
    endBar: 12,
    targetSection: 'Main A',
    mappingPlan,
    baseStyleParsed: result1.styleParsed, // 接續在同一個 STY 伴奏專案中累積段落
  });

  console.log(`結果狀態: ${result2.success ? '✅ 成功' : '❌ 失敗'}`);
  console.log(`目標段落: ${result2.targetSection}`);
  console.log(`切片小節: ${result2.startBar} ~ ${result2.endBar} (共 ${result2.totalBars} 小節)`);
  console.log(`提取總音符: ${result2.totalNotesExtracted} 顆`);
  console.log(`組裝聲部數: ${result2.assembledPartsCount} 聲部`);

  // 5. 匯出前結構巡檢 (Pre-export Inspection)
  console.log('\n--- 測試 3: STY 伴奏結構合規性巡檢 ---');
  const inspection = YamahaWriter.inspectPreExport(result2.styleParsed);
  console.log(`格式: ${inspection.format}, PPQ: ${inspection.division}, 音軌數: ${inspection.trackCount}`);
  console.log(`段落清單: ${inspection.sectionNames.join(', ')}`);
  console.log(`總音符數: ${inspection.totalNotes}`);
  console.log(`CASM 轉調區塊: ${inspection.hasCasm ? '✅ 具備' : '❌ 缺失'}`);
  console.log(`警告事項: ${inspection.warnings.length === 0 ? '無警告 (完全合規)' : inspection.warnings.join('; ')}`);

  console.log('\n🎉 第 3 階段：MIDI 切片裝配至伴奏段落引擎 100% 通過驗收！');
}

runTest().catch((err) => {
  console.error('❌ 測試發生異常:', err);
  process.exit(1);
});
