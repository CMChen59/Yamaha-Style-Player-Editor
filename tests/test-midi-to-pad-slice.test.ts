import { describe, it, expect } from 'vitest';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import type { YamahaFileParsed, MidiTrack } from '../src/core/models/types';

/**
 * 建構一份模擬真實商業規格 (1920 PPQ) 的多通道 MIDI 歌曲，用於驗證【任務 4-1B】擷取至 Multi Pad
 */
function createMockHighResMidiSong(): YamahaFileParsed {
  const division = 1920; // 1 拍 = 1920 ticks, 1 小節 (4/4) = 7680 ticks
  const ticksPerBar = division * 4;

  // Track 0: Tempo & Time Signature
  const track0: MidiTrack = {
    rawChunk: new Uint8Array(0),
    events: [
      { delta: 0, type: 'meta', metaType: 0x58, metaData: new Uint8Array([4, 2, 24, 8]) },
      { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) },
    ],
  };

  // Track 1 (Channel 0): 排笛主奏 (0-113-74 => 面板 0-113-75 PanPipes)
  // - 在第 1 小節末尾 (tick 7000) 有一顆跨界延續到第 2 小節 (tick 8000) 的前段殘留音 (Note 60) -> 擷取第 2~5 小節時必須被過濾！
  // - 在第 2~5 小節 (tick 7680 ~ 38400) 有一段含和聲導音 G#(68)->A(69) 與花音 F#(66) 的 Am 旋律
  const track1: MidiTrack = {
    rawChunk: new Uint8Array(0),
    events: [
      { delta: 0, type: 'controlChange', channel: 0, controller: 0, value: 0 },
      { delta: 0, type: 'controlChange', channel: 0, controller: 32, value: 113 },
      { delta: 0, type: 'programChange', channel: 0, program: 75 }, // PanPipes (0-based 0-113-75 => 面板 0-113-76)
      { delta: 0, type: 'controlChange', channel: 0, controller: 7, value: 108 },
      { delta: 0, type: 'controlChange', channel: 0, controller: 10, value: 60 },
      { delta: 0, type: 'controlChange', channel: 0, controller: 91, value: 72 },
      // 跨界殘留音：第 1 小節 tick 7000 按下，第 2 小節 tick 8000 放開
      { delta: 7000, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 },
      // 第 2 小節起點 (tick 7680)：正式旋律音 A4 (69)
      { delta: 680, type: 'noteOn', channel: 0, noteNumber: 69, velocity: 100 },
      { delta: 320, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 }, // tick 8000 跨界音結束
      { delta: 1600, type: 'noteOff', channel: 0, noteNumber: 69, velocity: 0 }, // tick 9600 (dur = 1920)
      // 接下來演歌旋律音：B4(71), C5(72), D5(74), E5(76), F#5(78), G#5(80), A5(81), E5(76), C5(72), A4(69)
      { delta: 0, type: 'controlChange', channel: 0, controller: 11, value: 115 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 71, velocity: 95 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 71, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 72, velocity: 98 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 72, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 74, velocity: 100 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 74, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 76, velocity: 102 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 76, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 78, velocity: 104 }, // F#5
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 78, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 80, velocity: 106 }, // G#5 (導音)
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 80, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 81, velocity: 110 }, // A5
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 81, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 76, velocity: 96 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 76, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 72, velocity: 92 },
      { delta: 1920, type: 'noteOff', channel: 0, noteNumber: 72, velocity: 0 },
      { delta: 0, type: 'noteOn', channel: 0, noteNumber: 69, velocity: 105 },
      { delta: 3840, type: 'noteOff', channel: 0, noteNumber: 69, velocity: 0 },
      { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) },
    ],
  };

  // Track 2 (Channel 9): 標準鼓組 (第 2~3 小節共 8 顆 Hi-Hat 鼓點)
  const drumEvents: any[] = [
    { delta: 0, type: 'controlChange', channel: 9, controller: 0, value: 127 },
    { delta: 0, type: 'controlChange', channel: 9, controller: 32, value: 0 },
    { delta: 0, type: 'programChange', channel: 9, program: 0 },
    { delta: ticksPerBar, type: 'noteOn', channel: 9, noteNumber: 42, velocity: 85 },
    { delta: 960, type: 'noteOff', channel: 9, noteNumber: 42, velocity: 0 },
  ];
  for (let i = 1; i < 8; i++) {
    drumEvents.push({ delta: 960, type: 'noteOn', channel: 9, noteNumber: 42, velocity: 80 });
    drumEvents.push({ delta: 960, type: 'noteOff', channel: 9, noteNumber: 42, velocity: 0 });
  }
  drumEvents.push({ delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) });

  const track2: MidiTrack = {
    rawChunk: new Uint8Array(0),
    events: drumEvents,
  };

  return {
    format: 'SMF1',
    division,
    bpm: 108,
    timeSignature: { numerator: 4, denominator: 4 },
    sections: [],
    casm: null,
    ots: [],
    tracks: [track0, track1, track2],
  };
}

describe('【任務 4-1B】MIDI 選段單軌快速塞入 Multi Pad (Pad 1~4) 引擎與 Round-Trip 驗收', () => {
  it('1. 擷取 1920 PPQ MIDI 指定通道區間至 480 PPQ Pad：自動縮放時間軸、過濾跨界殘留音、回溯當下音色並診斷型態', () => {
    const midiSong = createMockHighResMidiSong();
    const padProject = YamahaPadSynthesizer.createBlankProject({
      projectName: 'SliceTestPad',
      bpm: midiSong.bpm,
      bars: 4,
      division: 480,
    });

    // 擷取 CH 1 (channel 0) 的第 2 ~ 5 小節 (共 4 小節) 塞入 Pad 1
    const res = YamahaPadModifier.importMidiChannelRangeToPad({
      sourceParsed: midiSong,
      targetPadParsed: padProject,
      sourceChannel: 0,
      targetPadNum: 1,
      startBar: 2,
      endBar: 5,
    });

    expect(res.success).toBe(true);
    expect(res.targetPadNum).toBe(1);
    expect(res.barLength).toBe(4);
    // 跨界殘留音 Note 60 (在 tick 7000 < 7680 按下) 必須被排除，只保留第 2~5 小節內的 11 顆正式旋律音
    expect(res.extractedNoteCount).toBe(11);

    const pad1Notes = YamahaPadModifier.extractTrackNotes(padProject.tracks[1]);
    expect(pad1Notes.length).toBe(11);
    // 第 1 顆音必須是 tick 7680 歸零後的 A4 (69)，且 startTick = 0，durationTick 由 1920 縮放為 480 (1 拍)
    expect(pad1Notes[0].note).toBe(69);
    expect(pad1Notes[0].startTick).toBe(0);
    expect(pad1Notes[0].durationTick).toBe(480);
    // 確認沒有任何 Note 60 殘留
    expect(pad1Notes.some((n) => n.note === 60)).toBe(false);

    // 音色回溯驗證：0-based 0-113-75 (面板 0-113-76 PanPipes)
    expect(res.voiceInfo.msb).toBe(0);
    expect(res.voiceInfo.lsb).toBe(113);
    expect(res.voiceInfo.pc).toBe(75);
    expect(res.voiceInfo.panelCode).toBe('0-113-76');
    expect(res.voiceInfo.voiceName).toContain('PanPipes');

    // 音樂型態與 CM 鐵律驗證：長旋律含導音 G# 與花音 F#，必須為 MELODY_INTRO 且 CM=false
    expect(res.musicalType).toBe('MELODY_INTRO');
    expect(res.chordMatch).toBe(false);
    expect(res.repeat).toBe(false);
    expect(res.padName).toContain('B2-5');
  });

  it('2. 多通道累積塞入 Pad 1 (旋律) 與 Pad 2 (鼓組)，執行固定調性平移 (Am ➔ Em) 後二進位 Round-Trip 100% 零誤差', () => {
    const midiSong = createMockHighResMidiSong();
    const padProject = YamahaPadSynthesizer.createBlankProject({
      projectName: 'MultiSlotPad',
      bpm: 108,
      bars: 4,
      division: 480,
    });

    // Slot 1: 塞入 CH 1 排笛旋律 (第 2~5 小節)
    YamahaPadModifier.importMidiChannelRangeToPad({
      sourceParsed: midiSong,
      targetPadParsed: padProject,
      sourceChannel: 0,
      targetPadNum: 1,
      startBar: 2,
      endBar: 5,
    });

    // Slot 2: 塞入 CH 10 鼓組 (第 2~3 小節)
    const drumRes = YamahaPadModifier.importMidiChannelRangeToPad({
      sourceParsed: midiSong,
      targetPadParsed: padProject,
      sourceChannel: 9,
      targetPadNum: 2,
      startBar: 2,
      endBar: 3,
    });

    expect(drumRes.extractedNoteCount).toBe(8);
    expect(drumRes.musicalType).toBe('DRUM_SFX');
    expect(drumRes.chordMatch).toBe(false);
    expect(drumRes.repeat).toBe(true);

    // 執行固定調性剛體平移 Am ➔ Em (+7 半音)
    const trRes = YamahaPadModifier.transposePadKey(padProject, {
      sourceKey: 'Am',
      targetKey: 'Em',
      direction: 'auto',
    });

    expect(trRes.success).toBe(true);
    expect(trRes.baseSemitoneShift).toBe(7);
    expect(trRes.cmTag).toBe('CM0000');

    // Pad 1 第一顆音應由 A4 (69) 平移 +7 半音至 E5 (76)
    const pad1After = YamahaPadModifier.extractTrackNotes(padProject.tracks[1]);
    expect(pad1After[0].note).toBe(76);

    // Pad 2 鼓組必須被自動跳過保護，維持原本的 Closed Hi-Hat (42) 不變
    const pad2After = YamahaPadModifier.extractTrackNotes(padProject.tracks[2]);
    expect(pad2After.every((n) => n.note === 42)).toBe(true);

    // 二進位寫出並重新解析 (Round-Trip)
    const bytes = YamahaWriter.write(padProject);
    const reparsed = YamahaParser.parse(bytes);
    const diagAfter = YamahaPadModifier.analyzePadProject(reparsed);

    expect(diagAfter.tracks[0].noteCount).toBe(11);
    expect(diagAfter.tracks[0].voiceInfo.panelCode).toBe('0-113-76');
    expect(diagAfter.tracks[1].noteCount).toBe(8);
    expect(diagAfter.tracks[1].musicalType).toBe('DRUM_SFX');
    expect(reparsed.padConfig?.chordMatchFlags).toEqual([false, false, false, false]);
  });
});
