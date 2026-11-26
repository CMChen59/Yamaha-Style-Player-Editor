import { describe, it, expect } from 'vitest';
import {
  getSweetSpotProfile,
  decideOctaveRoute,
  evaluateShiftRoute,
  type SweetSpotTrackInput,
} from '../src/core/data/instrument-sweet-spot';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

const mk = (padNum: number, category: string, min: number, max: number, avg: number): SweetSpotTrackInput =>
  ({ padNum, category, pitchMin: min, pitchMax: max, avgPitch: avg });

describe('任務 4-1C 模組一：樂器黃金音域與八度路線決策', () => {
  it('16 大分類黃金音域數值正確，Drums 不適用', () => {
    expect(getSweetSpotProfile('Guitar')!.sweetMax).toBe(81);
    expect(getSweetSpotProfile('Saxophone')!.sweetMax).toBe(86);
    expect(getSweetSpotProfile('Strings')!.sweetMax).toBe(88);
    expect(getSweetSpotProfile('Woodwind')!.sweetMax).toBe(91);
    expect(getSweetSpotProfile('Piano')!.sweetMax).toBe(96);
    expect(getSweetSpotProfile('Drums')).toBeNull();
    expect(getSweetSpotProfile('Unknown')!.sweetMax).toBe(96);
  });

  it('薩克斯風最高音 81：Am→Em (+7) 會衝到 88 超過 D6，改走低八度 (-5)；調性不變', () => {
    const d = decideOctaveRoute([mk(1, 'Saxophone', 64, 81, 72)], 7);
    expect(d.chosen).toBe('down');
    expect(d.semitones).toBe(-5);
    expect((d.semitones + 12) % 12).toBe(7); // 同一目標調性
  });

  it('鋼琴最高音 81：+7 → 88 仍在甜區，維持高八度', () => {
    const d = decideOctaveRoute([mk(1, 'Piano', 64, 81, 72)], 7);
    expect(d.chosen).toBe('up');
    expect(d.semitones).toBe(7);
  });

  it('多軌共用同一路線：任一軌超標則全體改走低八度', () => {
    const d = decideOctaveRoute(
      [mk(1, 'Piano', 60, 76, 68), mk(2, 'Guitar', 64, 79, 70)],
      7
    );
    expect(d.chosen).toBe('down'); // 吉他 79+7=86 > 81
    expect(d.semitones).toBe(-5);
  });

  it('向下路線會過低時維持高八度', () => {
    const d = decideOctaveRoute([mk(1, 'Woodwind', 60, 70, 65)], 7);
    // down: 55 < 60 低於下限 5；up: 77 在甜區 → 維持 up
    expect(d.chosen).toBe('up');
  });

  it('同調性 (0 半音) 不位移', () => {
    const d = decideOctaveRoute([mk(1, 'Guitar', 60, 90, 75)], 0);
    expect(d.semitones).toBe(0);
  });

  it('evaluateShiftRoute 正確計算超高與重心距離', () => {
    const r = evaluateShiftRoute([mk(1, 'Guitar', 60, 80, 70)], 5);
    expect(r.tracks[0].overflow).toBe(4); // 85-81
    expect(r.tracks[0].centerDistance).toBe(7); // |75-68|
  });

  it('recommendSemitoneShift 尊重使用者強制方向', () => {
    const diag: any = {
      tracks: [{
        padNum: 1, musicalType: 'MELODY_INTRO', pitchMin: 64, pitchMax: 81, avgPitch: 72,
        voiceInfo: { category: 'Saxophone' },
      }],
    };
    expect(YamahaPadModifier.recommendSemitoneShift(diag, 'Am', 'Em', 'auto').semitones).toBe(-5);
    expect(YamahaPadModifier.recommendSemitoneShift(diag, 'Am', 'Em', 'up').semitones).toBe(7);
    expect(YamahaPadModifier.recommendSemitoneShift(diag, 'Am', 'Em', 'down').semitones).toBe(-5);
  });

  it('transposePadKey：useSweetSpot 預設關閉維持舊黃金範本 (+7)，開啟後依甜區改走 -5', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { YamahaParser } = await import('../src/core/parser/yamaha-parser');
    const file = path.resolve(__dirname, '../samples/2010-1_PAD.PAD');
    const load = () => YamahaParser.parse(new Uint8Array(fs.readFileSync(file)), 'PAD');
    const legacy = YamahaPadModifier.transposePadKey(load(), { sourceKey: 'Am', targetKey: 'Em' });
    expect(legacy.baseSemitoneShift).toBe(7);
    const smart = YamahaPadModifier.transposePadKey(load(), { sourceKey: 'Am', targetKey: 'Em', useSweetSpot: true });
    expect(smart.baseSemitoneShift).toBe(-5);
    expect(YamahaPadModifier.transposePadKey(load(), { sourceKey: 'Am', targetKey: 'Em', useSweetSpot: true, direction: 'up' }).baseSemitoneShift).toBe(7);
  });
});
