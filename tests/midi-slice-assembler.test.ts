import { describe, it, expect } from 'vitest';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import type { YamahaFileParsed, MidiTrack, MidiEvent } from '../src/core/models/types';

function createMockPopSong82Bars(): YamahaFileParsed {
  const division = 480;
  const ticksPerBar = 480 * 4;

  const tracks: MidiTrack[] = [];
  const tr0Events: MidiEvent[] = [
    { delta: 0, type: 'meta', metaType: 0x51, bpm: 120 },
    { delta: 0, type: 'meta', metaType: 0x58, timeSignature: { numerator: 4, denominator: 4 } },
  ];

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

  // 1. CH 2: Flute (主旋律 1: 第 5~40 小節)
  const fRes = genNotes(2, 5, 40, 480, 72);
  tracks.push({
    trackIndex: 1,
    name: 'Girl : Flute',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Girl : Flute' },
      { delta: 0, type: 'programChange', channel: 2, programChange: 73 },
      ...fRes.evs,
    ],
  });

  // 2. CH 3: Sax (主旋律 2: 第 41~82 小節)
  const sRes = genNotes(3, 41, 82, 480, 65);
  tracks.push({
    trackIndex: 2,
    name: 'Boy : Sax',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Boy : Sax' },
      { delta: 0, type: 'programChange', channel: 3, programChange: 65 },
      ...sRes.evs,
    ],
  });

  // 3. CH 10 (ch 9): StandardKit 鼓組 (全曲 1~82 小節)
  const dRes = genNotes(9, 1, 82, 240, 36);
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
  const bRes = genNotes(7, 1, 82, 480, 40);
  tracks.push({
    trackIndex: 4,
    name: 'Bass : Wood Bass',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Bass : Wood Bass' },
      { delta: 0, type: 'programChange', channel: 7, programChange: 32 },
      ...bRes.evs,
    ],
  });

  // 5. CH 13 (ch 12): Chord Piano (全曲 1~82 小節)
  const pRes = genNotes(12, 1, 82, 480, 60);
  tracks.push({
    trackIndex: 5,
    name: 'Chord : Piano',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Chord : Piano' },
      { delta: 0, type: 'programChange', channel: 12, programChange: 0 },
      ...pRes.evs,
    ],
  });

  // 6. CH 5 (ch 4): Back Strings (第 1~82 小節)
  const stRes = genNotes(4, 1, 82, 960, 55);
  tracks.push({
    trackIndex: 6,
    name: 'Back : Strings',
    events: [
      { delta: 0, type: 'meta', metaType: 0x03, text: 'Back : Strings' },
      { delta: 0, type: 'programChange', channel: 4, programChange: 48 },
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

describe('MidiSliceAssembler (第 3 階段切片裝配引擎)', () => {
  const songParsed = createMockPopSong82Bars();
  const analysis = MidiSongAnalyzer.analyze(songParsed, 'PopSong82Bars.mid');
  const mappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);

  it('應該成功將第 1~4 小節切片裝配至 Intro A，並自動排除主旋律', () => {
    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: songParsed,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Intro A',
      mappingPlan,
    });

    expect(result.success).toBe(true);
    expect(result.targetSection).toBe('Intro A');
    expect(result.startBar).toBe(1);
    expect(result.endBar).toBe(4);
    expect(result.totalBars).toBe(4);
    expect(result.totalNotesExtracted).toBeGreaterThan(0);
    expect(result.assembledPartsCount).toBeGreaterThanOrEqual(4);

    // 檢查排除的主旋律 (Flute / Sax) 絕未進入伴奏聲部
    const hasFluteOrSax = result.partDetails.some(
      p => p.sourceChannel === 2 || p.sourceChannel === 3
    );
    expect(hasFluteOrSax).toBe(false);

    // 檢查目標伴奏中 Intro A 段落存在且小節數為 4
    const introSec = result.styleParsed.sections.find(s => s.name === 'Intro A');
    expect(introSec).toBeDefined();
    expect(introSec?.measureCount).toBe(4);
  });

  it('應該支援在同一伴奏專案中接續累積段落 (例如接續切片第 5~12 小節至 Main A)', () => {
    // 第一次切片 Intro A
    const resIntro = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: songParsed,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Intro A',
      mappingPlan,
    });

    // 接續切片 Main A (共 8 小節)
    const resMain = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: songParsed,
      analysis,
      startBar: 5,
      endBar: 12,
      targetSection: 'Main A',
      mappingPlan,
      baseStyleParsed: resIntro.styleParsed,
    });

    expect(resMain.success).toBe(true);
    expect(resMain.targetSection).toBe('Main A');
    expect(resMain.totalBars).toBe(8);
    expect(resMain.totalNotesExtracted).toBeGreaterThan(0);

    const mainSec = resMain.styleParsed.sections.find(s => s.name === 'Main A');
    expect(mainSec).toBeDefined();
    expect(mainSec?.measureCount).toBe(8);

    // 結構巡檢：必須具備合規的 CASM 轉調區塊與合規段落標記
    const inspection = YamahaWriter.inspectPreExport(resMain.styleParsed);
    expect(inspection.hasCasm).toBe(true);
    expect(inspection.format).toBe('STY');
    // 確認音樂段落 Intro A 與 Main A 絕不是空白段落
    expect(inspection.emptySections).not.toContain('Intro A');
    expect(inspection.emptySections).not.toContain('Main A');
    expect(inspection.totalNotes).toBeGreaterThan(0);
  });
});
