import { describe, it, expect } from 'vitest';
import { MidiPartAssignMatrix, type YamahaPartType } from '../src/core/writer/midi-part-assign-matrix';
import type { MidiSongAnalysis, MidiChannelAnalysis } from '../src/core/parser/midi-song-analyzer';

describe('MidiPartAssignMatrix - 聲部智慧映射與主旋律排除演算法測試', () => {

  /**
   * 建立真實 82 小節華語流行歌的 12 發聲通道特徵 Mock
   */
  function createPopSongMockAnalysis(): MidiSongAnalysis {
    const mockChannels: MidiChannelAnalysis[] = [
      // CH 2: 排笛 (主旋律 A)
      {
        channel: 1,
        displayChannel: 2,
        hasNotes: true,
        noteCount: 151,
        notePercentage: 3.2,
        trackNames: ['Girl : Flute'],
        msb: 0, lsb: 0, pc: 75,
        rawMsb: 0, rawLsb: 0, rawPc: 75,
        panelCode: '0-0-76',
        voiceName: 'PanFlute (排笛)',
        category: 'Woodwind',
        isDrum: false,
        pitchMin: 74, // D5
        pitchMax: 82, // Bb5
        pitchRangeLabel: 'D5 ~ Bb5',
        firstBar: 8,
        lastBar: 78,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 3: 薩克斯風 (主旋律 B)
      {
        channel: 2,
        displayChannel: 3,
        hasNotes: true,
        noteCount: 151,
        notePercentage: 3.2,
        trackNames: ['Boy : Sax'],
        msb: 0, lsb: 0, pc: 65,
        rawMsb: 0, rawLsb: 0, rawPc: 65,
        panelCode: '0-0-66',
        voiceName: 'AltoSax (中音薩克斯風)',
        category: 'Saxophone',
        isDrum: false,
        pitchMin: 62, // D4
        pitchMax: 74, // D5
        pitchRangeLabel: 'D4 ~ D5',
        firstBar: 16,
        lastBar: 78,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 4: 顫音琴 (特色點綴)
      {
        channel: 3,
        displayChannel: 4,
        hasNotes: true,
        noteCount: 26,
        notePercentage: 0.5,
        trackNames: ['Grace : Bell'],
        msb: 0, lsb: 0, pc: 11,
        rawMsb: 0, rawLsb: 0, rawPc: 11,
        panelCode: '0-0-12',
        voiceName: 'Vibraphone (顫音琴)',
        category: 'Percussion',
        isDrum: false,
        pitchMin: 74,
        pitchMax: 85,
        pitchRangeLabel: 'D5 ~ C#6',
        firstBar: 23,
        lastBar: 64,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 5: 合成弦樂 1 (背景鋪底)
      {
        channel: 4,
        displayChannel: 5,
        hasNotes: true,
        noteCount: 332,
        notePercentage: 7.0,
        trackNames: ['Back : Strings'],
        msb: 0, lsb: 0, pc: 50,
        rawMsb: 0, rawLsb: 0, rawPc: 50,
        panelCode: '0-0-51',
        voiceName: 'SynthStrings1 (合成弦樂 1)',
        category: 'Strings',
        isDrum: false,
        pitchMin: 57,
        pitchMax: 74,
        pitchRangeLabel: 'A2 ~ D5',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 6: 鋼弦木吉他 (副節奏)
      {
        channel: 5,
        displayChannel: 6,
        hasNotes: true,
        noteCount: 78,
        notePercentage: 1.6,
        trackNames: ['Leader: ST.Guitar'],
        msb: 0, lsb: 0, pc: 25,
        rawMsb: 0, rawLsb: 0, rawPc: 25,
        panelCode: '0-0-26',
        voiceName: 'SteelGuitar1 (鋼弦木吉他)',
        category: 'Guitar',
        isDrum: false,
        pitchMin: 50,
        pitchMax: 76,
        pitchRangeLabel: 'D3 ~ E5',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 7: 破音電吉他
      {
        channel: 6,
        displayChannel: 7,
        hasNotes: true,
        noteCount: 57,
        notePercentage: 1.2,
        trackNames: ['Inter : EL.Guitar'],
        msb: 0, lsb: 0, pc: 29,
        rawMsb: 0, rawLsb: 0, rawPc: 29,
        panelCode: '0-0-30',
        voiceName: 'Overdriven (破音電吉他)',
        category: 'Guitar',
        isDrum: false,
        pitchMin: 62,
        pitchMax: 89,
        pitchRangeLabel: 'D4 ~ F6',
        firstBar: 60,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 8: 原聲木貝斯 (低音核心)
      {
        channel: 7,
        displayChannel: 8,
        hasNotes: true,
        noteCount: 233,
        notePercentage: 4.9,
        trackNames: ['Bass : Wood Bass'],
        msb: 0, lsb: 0, pc: 32,
        rawMsb: 0, rawLsb: 0, rawPc: 32,
        panelCode: '0-0-33',
        voiceName: 'AcousticBass (原聲木貝斯)',
        category: 'Bass',
        isDrum: false,
        pitchMin: 33,
        pitchMax: 58,
        pitchRangeLabel: 'A1 ~ Bb2',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 10: 標準打擊鼓組 (節奏核心)
      {
        channel: 9,
        displayChannel: 10,
        hasNotes: true,
        noteCount: 1536,
        notePercentage: 32.3,
        trackNames: ['-- TG-100 GS ... StandardKit'],
        msb: 127, lsb: 0, pc: 0,
        rawMsb: 127, rawLsb: 0, rawPc: 0,
        panelCode: '127-0-1',
        voiceName: 'StandardKit (標準鼓組)',
        category: 'Drums',
        isDrum: true,
        pitchMin: 35,
        pitchMax: 57,
        pitchRangeLabel: 'B1 ~ A3',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 11: 爵士電吉他 (節奏吉他)
      {
        channel: 10,
        displayChannel: 11,
        hasNotes: true,
        noteCount: 935,
        notePercentage: 19.6,
        trackNames: ['Left : NL.Guitar'],
        msb: 0, lsb: 0, pc: 26,
        rawMsb: 0, rawLsb: 0, rawPc: 26,
        panelCode: '0-0-27',
        voiceName: 'JazzGuitar (爵士電吉他)',
        category: 'Guitar',
        isDrum: false,
        pitchMin: 45,
        pitchMax: 70,
        pitchRangeLabel: 'A2 ~ Bb4',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
      // CH 13: 平台大鋼琴 (主要和弦)
      {
        channel: 12,
        displayChannel: 13,
        hasNotes: true,
        noteCount: 530,
        notePercentage: 11.1,
        trackNames: ['Chord : Piano'],
        msb: 0, lsb: 0, pc: 0,
        rawMsb: 0, rawLsb: 0, rawPc: 0,
        panelCode: '0-0-1',
        voiceName: 'GrandPiano (平台大鋼琴)',
        category: 'Piano',
        isDrum: false,
        pitchMin: 50,
        pitchMax: 65,
        pitchRangeLabel: 'D2 ~ D4',
        firstBar: 1,
        lastBar: 82,
        volume: 100, pan: 64, reverb: 40, chorus: 0,
        programChangesCount: 1,
      },
    ];

    return {
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
      instrumentCategories: ['Woodwind', 'Saxophone', 'Percussion', 'Strings', 'Guitar', 'Bass', 'Drums', 'Piano'],
    };
  }

  it('1. 智慧主旋律辨識：精準抓出 CH 2 (排笛) 與 CH 3 (薩克斯風) 並預設排除', () => {
    const analysis = createPopSongMockAnalysis();
    const chFlute = analysis.activeChannels.find(c => c.channel === 1)!;
    const chSax = analysis.activeChannels.find(c => c.channel === 2)!;
    const chDrum = analysis.activeChannels.find(c => c.channel === 9)!;
    const chBass = analysis.activeChannels.find(c => c.channel === 7)!;

    const resFlute = MidiPartAssignMatrix.detectMelody(chFlute);
    const resSax = MidiPartAssignMatrix.detectMelody(chSax);
    const resDrum = MidiPartAssignMatrix.detectMelody(chDrum);
    const resBass = MidiPartAssignMatrix.detectMelody(chBass);

    expect(resFlute.isMelody).toBe(true);
    expect(resFlute.confidence).toBeGreaterThanOrEqual(50);

    expect(resSax.isMelody).toBe(true);
    expect(resSax.confidence).toBeGreaterThanOrEqual(50);

    expect(resDrum.isMelody).toBe(false);
    expect(resBass.isMelody).toBe(false);
  });

  it('2. 全曲 8 大伴奏聲部自動映射方案：鼓、貝斯、和弦、鋪底各就各位', () => {
    const analysis = createPopSongMockAnalysis();
    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);

    // 驗證主旋律排除數量 (CH 2, CH 3)
    expect(plan.excludedCount).toBe(2);

    const ch2Assign = plan.assignments.find(a => a.sourceChannel === 1)!;
    const ch3Assign = plan.assignments.find(a => a.sourceChannel === 2)!;
    expect(ch2Assign.isExcluded).toBe(true);
    expect(ch3Assign.isExcluded).toBe(true);

    // 驗證核心聲部指派對照
    // Rhythm 2 必須是 CH 10 (channel index 9)
    expect(plan.partToSourceChannelMap.get('Rhythm2')).toBe(9);

    // Bass 必須是 CH 8 (channel index 7)
    expect(plan.partToSourceChannelMap.get('Bass')).toBe(7);

    // Pad (長音弦樂) 必須是 CH 5 (channel index 4)
    expect(plan.partToSourceChannelMap.get('Pad')).toBe(4);

    // Chord 1 (主要和弦) 必須是鋼琴 CH 13 (channel index 12)
    expect(plan.partToSourceChannelMap.get('Chord1')).toBe(12);

    // Chord 2 (次要和弦) 必須是吉他 CH 11 (channel index 10)
    expect(plan.partToSourceChannelMap.get('Chord2')).toBe(10);

    // Phrase 1 必須指派給顫音琴 CH 4 (channel index 3)
    expect(plan.partToSourceChannelMap.get('Phrase1')).toBe(3);
  });

  it('3. 支援使用者覆寫：若取消排除主旋律，可自由指派至 Phrase 2', () => {
    const analysis = createPopSongMockAnalysis();
    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);

    // 模擬使用者在 UI 打勾取消排除排笛 (CH 2)
    const fluteAssign = plan.assignments.find(a => a.sourceChannel === 1)!;
    fluteAssign.isExcluded = false;
    fluteAssign.targetPart = 'Phrase2';
    fluteAssign.targetChannel = 15; // 0-based Ch 16

    expect(fluteAssign.isExcluded).toBe(false);
    expect(fluteAssign.targetPart).toBe('Phrase2');
    expect(fluteAssign.targetChannel).toBe(15);
  });
});
