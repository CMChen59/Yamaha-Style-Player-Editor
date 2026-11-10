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

    // 檢查寫入 Intro A 段落的所有 Note 事件通道必須 100% 落在 Yamaha 伴奏標準 8~15 通道內，絕不殘留來源 MIDI 通道 (0~7)
    let curTick = 0;
    const introNotes: MidiEvent[] = [];
    for (const ev of result.styleParsed.tracks[0].events) {
      curTick += ev.delta;
      if (curTick >= introSec!.startTick && curTick < introSec!.endTick) {
        if ((ev.type === 'noteOn' || ev.type === 'noteOff') && ev.channel !== undefined) {
          introNotes.push(ev);
        }
      }
    }
    expect(introNotes.length).toBeGreaterThan(0);
    for (const ev of introNotes) {
      expect(ev.channel).toBeGreaterThanOrEqual(8);
      expect(ev.channel).toBeLessThanOrEqual(15);
    }
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

  it('應該支援曲中音色切換 (如第 26 小節切換至電吉他) 並在切片時動態抓取當下生效樂器', () => {
    // 建立一個在第 1 小節為 FingerBass (pc 32/33)，但在第 26 小節切換為 Overdriven Guitar (pc 29) 的曲目
    const song = createMockPopSong82Bars();
    const ticksPerBar = 480 * 4;
    const bar26Tick = 25 * ticksPerBar;

    // 在 Track 4 (CH 7: Bass) 插入第 26 小節切換 Program Change 29 (Overdriven Guitar)
    song.tracks[4].events.splice(2, 0, {
      delta: bar26Tick,
      type: 'programChange',
      channel: 7,
      program: 29,
    });

    // 1. 驗證 getEffectiveVoiceAtBar：第 1 小節應為 Bass，第 26 小節應動態嗅探為 Guitar
    const vBar1 = MidiSongAnalyzer.getEffectiveVoiceAtBar(song, 7, 1);
    expect(vBar1.category).toBe('Bass');

    const vBar26 = MidiSongAnalyzer.getEffectiveVoiceAtBar(song, 7, 26);
    expect(vBar26.category).toBe('Guitar');
    expect(vBar26.pc).toBe(29);

    // 2. 驗證切片第 26~33 小節至 Main B 時，伴奏聲部的樂器自動更新為 Overdriven Guitar
    const ana = MidiSongAnalyzer.analyze(song, 'MidSongChange.mid');
    const plan26 = MidiPartAssignMatrix.createAutoMappingPlan(ana, {
      sourceParsed: song,
      startBar: 26,
      endBar: 33,
    });

    const resMainB = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: song,
      analysis: ana,
      startBar: 26,
      endBar: 33,
      targetSection: 'Main B',
      mappingPlan: plan26,
    });

    expect(resMainB.success).toBe(true);
    const guitarPart = resMainB.partDetails.find(p => p.sourceChannel === 7);
    expect(guitarPart).toBeDefined();
    expect(guitarPart?.voiceName.toLowerCase()).toContain('overdriven');
  });

  it('應該在 Main A 切片時自動執行和弦反向正規化 (Harmonic Normalization to C)，將各小節和弦歸一為 C 基準大調', () => {
    const division = 480;
    const ticksPerBar = 480 * 4;

    // 建立 4 小節標準流行進行 (C -> G -> Am -> F)
    // CH 1 (ch 0): Piano
    // CH 2 (ch 1): Bass
    // CH 10 (ch 9): Standard Drums
    const song: YamahaFileParsed = {
      format: 'STY',
      midiFormat: 1,
      division,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [
        {
          trackIndex: 0,
          events: [
            { delta: 0, type: 'meta', metaType: 0x51, bpm: 120 },
            { delta: 0, type: 'meta', metaType: 0x58, timeSignature: { numerator: 4, denominator: 4 } },
          ],
        },
        {
          trackIndex: 1,
          name: 'Piano',
          events: [
            { delta: 0, type: 'programChange', channel: 0, programChange: 0 },
            // Bar 1 (C Major: C4=60, E4=64, G4=67)
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 67, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 67, velocity: 0 },
            // Bar 2 (G Major: G3=55, B3=59, D4=62) -> tick = 1920
            { delta: 1440, type: 'noteOn', channel: 0, noteNumber: 55, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 59, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 62, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 0, noteNumber: 55, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 59, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 62, velocity: 0 },
            // Bar 3 (A Minor: A3=57, C4=60, E4=64) -> tick = 3840
            { delta: 1440, type: 'noteOn', channel: 0, noteNumber: 57, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 0, noteNumber: 57, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0 },
            // Bar 4 (F Major: F3=53, A3=57, C4=60) -> tick = 5760
            { delta: 1440, type: 'noteOn', channel: 0, noteNumber: 53, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 57, velocity: 90 },
            { delta: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 },
            { delta: 480, type: 'noteOff', channel: 0, noteNumber: 53, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 57, velocity: 0 },
            { delta: 0, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
          ],
        },
        {
          trackIndex: 2,
          name: 'Bass',
          events: [
            { delta: 0, type: 'programChange', channel: 1, programChange: 33 },
            // Bar 1: C2 = 36
            { delta: 0, type: 'noteOn', channel: 1, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 36, velocity: 0 },
            // Bar 2: G1 = 31
            { delta: 1440, type: 'noteOn', channel: 1, noteNumber: 31, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 31, velocity: 0 },
            // Bar 3: A1 = 33
            { delta: 1440, type: 'noteOn', channel: 1, noteNumber: 33, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 33, velocity: 0 },
            // Bar 4: F1 = 29
            { delta: 1440, type: 'noteOn', channel: 1, noteNumber: 29, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 1, noteNumber: 29, velocity: 0 },
          ],
        },
        {
          trackIndex: 3,
          name: 'Drums',
          events: [
            { delta: 0, type: 'controlChange', channel: 9, controller: 0, value: 127 },
            { delta: 0, type: 'programChange', channel: 9, programChange: 0 },
            // 4 bars of Kick (36) on beat 1
            { delta: 0, type: 'noteOn', channel: 9, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 9, noteNumber: 36, velocity: 0 },
            { delta: 1440, type: 'noteOn', channel: 9, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 9, noteNumber: 36, velocity: 0 },
            { delta: 1440, type: 'noteOn', channel: 9, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 9, noteNumber: 36, velocity: 0 },
            { delta: 1440, type: 'noteOn', channel: 9, noteNumber: 36, velocity: 100 },
            { delta: 480, type: 'noteOff', channel: 9, noteNumber: 36, velocity: 0 },
          ],
        },
      ],
      sections: [],
      customChunks: [],
      parts: [],
      markers: [],
    };

    const analysis = MidiSongAnalyzer.analyze(song, 'Pop1564.mid');
    const mappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, {
      sourceParsed: song,
      startBar: 1,
      endBar: 4,
    });

    // 1. 切片至 Main A (預設啟用和弦正規化)
    const resMainA = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: song,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Main A',
      mappingPlan,
    });

    expect(resMainA.success).toBe(true);
    expect(resMainA.isHarmonicallyNormalized).toBe(true);
    expect(resMainA.detectedChordsByBar).toBeDefined();
    expect(resMainA.detectedChordsByBar?.length).toBe(4);
    expect(resMainA.detectedChordsByBar?.[0].chordName).toBe('C');
    expect(resMainA.detectedChordsByBar?.[1].chordName).toBe('G');
    expect(resMainA.detectedChordsByBar?.[2].chordName).toBe('Am');
    expect(resMainA.detectedChordsByBar?.[3].chordName).toBe('F');

    // 檢驗 Main A 軌道內的音符：各小節的 Bass (CH 10) 必須全部被歸一化為根音 C (pitch class 0)!
    const mainSec = resMainA.styleParsed.sections.find(s => s.name === 'Main A')!;
    let curTick = 0;
    const bassNotes: number[] = [];
    const drumNotes: number[] = [];

    for (const ev of resMainA.styleParsed.tracks[0].events) {
      curTick += ev.delta;
      if (curTick >= mainSec.startTick && curTick < mainSec.endTick) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          if (ev.channel === 10) { // Bass
            bassNotes.push(ev.noteNumber!);
          } else if (ev.channel === 9) { // Drums
            drumNotes.push(ev.noteNumber!);
          }
        }
      }
    }

    expect(bassNotes.length).toBe(4);
    // 所有 4 小節的 Bass 根音必須 100% 全部歸一為 C (pitchClass 0)
    for (const p of bassNotes) {
      expect(p % 12).toBe(0); // C!
    }

    // 鼓組音符 (Kick = 36) 絕不受移調影響，必須維持原音高 36
    expect(drumNotes.length).toBe(4);
    for (const d of drumNotes) {
      expect(d).toBe(36);
    }

    // 2. 切片至 Intro A (預設直通保留原曲進行，不移調)
    const resIntro = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: song,
      analysis,
      startBar: 1,
      endBar: 4,
      targetSection: 'Intro A',
      mappingPlan,
    });

    expect(resIntro.success).toBe(true);
    expect(resIntro.isHarmonicallyNormalized).toBe(false);

    const introSec = resIntro.styleParsed.sections.find(s => s.name === 'Intro A')!;
    let curIntroTick = 0;
    const introBassNotes: number[] = [];
    for (const ev of resIntro.styleParsed.tracks[0].events) {
      curIntroTick += ev.delta;
      if (curIntroTick >= introSec.startTick && curIntroTick < introSec.endTick) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel === 10) {
          introBassNotes.push(ev.noteNumber!);
        }
      }
    }

    // Intro A 維持原曲進行：C (36) -> G (31) -> A (33) -> F (29)
    expect(introBassNotes.length).toBe(4);
    expect(introBassNotes[0]).toBe(36); // C2
    expect(introBassNotes[1]).toBe(31); // G1
    expect(introBassNotes[2]).toBe(33); // A1
    expect(introBassNotes[3]).toBe(29); // F1
  });
});
