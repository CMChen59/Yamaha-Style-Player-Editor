import { describe, it, expect } from 'vitest';
import { detectPadTrackRelations } from '../src/core/data/instrument-sweet-spot';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import type { YamahaFileParsed } from '../src/models/types';

describe('任務 4-1C 模組二：多軌接力全域同進退八度連動與關係偵測', () => {
  it('1. detectPadTrackRelations 能精確識別交錯接力主旋律 (Pad 1 前2拍 + Pad 2 後2拍 + Pad 1 尾2拍)', () => {
    // 假設 480 PPQ，一拍 = 480 ticks
    // Pad 1: 0~960 (第1~2拍) 及 1920~2880 (第5~6拍)
    // Pad 2: 960~1920 (第3~4拍)
    const map = new Map<number, Array<{ startTick: number; durationTick: number }>>();
    map.set(1, [
      { startTick: 0, durationTick: 960 },
      { startTick: 1920, durationTick: 960 },
    ]);
    map.set(2, [
      { startTick: 960, durationTick: 960 },
    ]);

    const rels = detectPadTrackRelations(map);
    expect(rels.length).toBe(1);
    expect(rels[0].type).toBe('HOCKET');
    expect(rels[0].padNums).toEqual([1, 2]);
    expect(rels[0].handoffCount).toBeGreaterThanOrEqual(2);
    expect(rels[0].labelZh).toContain('交錯接力主旋律');
  });

  it('2. detectPadTrackRelations 能精確識別同步合奏/雙軌疊音 (重疊率 > 50%)', () => {
    const map = new Map<number, Array<{ startTick: number; durationTick: number }>>();
    map.set(1, [
      { startTick: 0, durationTick: 1920 },
    ]);
    map.set(2, [
      { startTick: 0, durationTick: 1920 },
    ]);

    const rels = detectPadTrackRelations(map);
    expect(rels.length).toBe(1);
    expect(rels[0].type).toBe('HARMONY_LAYER');
    expect(rels[0].padNums).toEqual([1, 2]);
    expect(rels[0].overlapRatio).toBe(1.0);
    expect(rels[0].labelZh).toContain('同步合奏');
  });

  it('3. 全域同進退鐵律：當 Pad 2 (後半句) 超標時，Pad 1 與 Pad 2 同步降八度，各軌相對音高差 100% 保持不變', () => {
    // 建立一個假的 2 軌 Pad 專案：
    // Pad 1 (前半句): 音域 C5(72) ~ E5(76) (若單獨判斷 +7 為 83 <= 96 不會降八度)
    // Pad 2 (後半句高潮): 音域 G5(79) ~ A6(93) (若單獨判斷 +7 為 100 > 96 會降八度為 -5)
    // 在舊系統：Pad 1 位移 +7，Pad 2 位移 -5，相差 12 半音發生斷層！
    // 在新系統模組二：Pad 2 超標，Pad 1 與 Pad 2 一律同步採 -5 半音！

    const mockParsed: YamahaFileParsed = {
      header: { format: 1, trackCount: 3, division: 480 },
      format: 'PAD',
      division: 480,
      tracks: [
        {
          events: [
            { type: 'text', text: 'CM0000', delta: 0 },
            { type: 'endOfTrack', delta: 0 },
          ],
        },
        {
          // Pad 1
          events: [
            { type: 'programChange', program: 0, delta: 0 },
            { type: 'noteOn', noteNumber: 72, velocity: 100, delta: 0 },
            { type: 'noteOff', noteNumber: 72, velocity: 0, delta: 480 },
            { type: 'noteOn', noteNumber: 76, velocity: 100, delta: 0 },
            { type: 'noteOff', noteNumber: 76, velocity: 0, delta: 480 },
            { type: 'endOfTrack', delta: 0 },
          ],
        },
        {
          // Pad 2
          events: [
            { type: 'programChange', program: 0, delta: 0 },
            { type: 'noteOn', noteNumber: 79, velocity: 100, delta: 960 },
            { type: 'noteOff', noteNumber: 79, velocity: 0, delta: 480 },
            { type: 'noteOn', noteNumber: 93, velocity: 100, delta: 0 },
            { type: 'noteOff', noteNumber: 93, velocity: 0, delta: 480 },
            { type: 'endOfTrack', delta: 0 },
          ],
        },
      ],
      padConfig: {
        names: ['Lead Pt1', 'Lead Pt2', 'Pad 3', 'Pad 4'],
        icons: ['S809', 'S809', 'S809', 'S809'],
        repeatFlags: [false, false, false, false],
        chordMatchFlags: [false, false, false, false],
      },
    };

    const res = YamahaPadModifier.transposePadKey(mockParsed, {
      sourceKey: 'Am',
      targetKey: 'Em', // 向上原本為 +7
      padNumbers: [1, 2],
      maxPitchLimit: 96,
      octaveWrapMode: 'track',
    });

    const pad1Result = res.trackResults.find(t => t.padNum === 1)!;
    const pad2Result = res.trackResults.find(t => t.padNum === 2)!;

    // 核心驗證：全域同進退！Pad 1 與 Pad 2 的位移量必須 100% 相同！
    expect(pad1Result.appliedSemitones).toBe(-5);
    expect(pad2Result.appliedSemitones).toBe(-5);
    expect(pad1Result.appliedSemitones).toBe(pad2Result.appliedSemitones);
    expect(pad1Result.octaveWrapped).toBe(true);
    expect(pad2Result.octaveWrapped).toBe(true);

    // 驗證移調後的音符音程關係：
    // Pad 1 原為 72, 76 ➔ 移調後為 67, 71
    // Pad 2 原為 79, 93 ➔ 移調後為 74, 88
    // 原本 Pad 1 尾音 (76) 到 Pad 2 起音 (79) 差距為 +3 半音
    // 移調後 Pad 1 尾音 (71) 到 Pad 2 起音 (74) 差距依然精準為 +3 半音，旋律完全不斷層！
    const finalPad1 = YamahaPadModifier.extractTrackNotes(mockParsed.tracks[1]);
    const finalPad2 = YamahaPadModifier.extractTrackNotes(mockParsed.tracks[2]);
    expect(finalPad1.map(n => n.note)).toEqual([67, 71]);
    expect(finalPad2.map(n => n.note)).toEqual([74, 88]);
    expect(finalPad2[0].note - finalPad1[1].note).toBe(3);
  });
});
