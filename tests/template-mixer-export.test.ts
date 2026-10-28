import { describe, it, expect } from 'vitest';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Step 2: STY 檔案匯出混音控制器 (CC 7 音量與 CC 10 聲相) 寫入驗證', () => {
  const dummySections = [
    {
      name: 'Main A',
      bars: 2,
      drumPattern: new Map<number, boolean[]>([[36, [true, false, false, false]]]),
      bassPattern: new Map<number, number>([[0, 36]]),
      chordPattern: new Map<number, Set<number>>([[0, new Set([60, 64, 67])]]),
    },
  ];

  it('1. 當傳入客製化混音設定時，SInt 小節內各軌道之 CC 7 與 CC 10 數值被正確精確寫入', () => {
    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'Mixer Custom STY',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      dynamicVoices: {
        Chord2: { msb: 0, lsb: 112, pc: 25 },
      },
      sections: dummySections,
      mixer: {
        drum: { volume: 118, pan: 60, reverb: 45, chorus: 10 },
        bass: { volume: 88, pan: 70, reverb: 25, chorus: 5 },
        chord: { volume: 105, pan: 40, reverb: 70, chorus: 35 },
        dynamicTracks: {
          Chord2: { volume: 75, pan: 80, reverb: 55, chorus: 45 },
        },
      },
    });

    const parsed = YamahaParser.parse(bytes, 'STY');
    expect(parsed.format).toBe('STY');
    expect(parsed.hasCasm).toBe(true);

    const tr0 = parsed.tracks[0];
    const ticksPerBar = 1920 * 4;

    let curTick = 0;
    const volByChannel = new Map<number, number>();
    const panByChannel = new Map<number, number>();
    const revByChannel = new Map<number, number>();
    const choByChannel = new Map<number, number>();

    for (const ev of tr0.events) {
      curTick += ev.delta;
      if (curTick >= ticksPerBar) break;

      if (ev.type === 'controlChange' && ev.channel !== undefined) {
        if (ev.controller === 7) {
          volByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 10) {
          panByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 91) {
          revByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 93) {
          choByChannel.set(ev.channel, ev.value!);
        }
      }
    }

    // 驗證各軌道音量 (CC 7)
    expect(volByChannel.get(9)).toBe(118); // 鼓組
    expect(volByChannel.get(10)).toBe(88); // 貝斯
    expect(volByChannel.get(11)).toBe(105); // 和弦 1
    expect(volByChannel.get(12)).toBe(75); // 和弦 2

    // 驗證各軌道立體聲聲相 (CC 10)
    expect(panByChannel.get(9)).toBe(60); // 鼓組
    expect(panByChannel.get(10)).toBe(70); // 貝斯
    expect(panByChannel.get(11)).toBe(40); // 和弦 1
    expect(panByChannel.get(12)).toBe(80); // 和弦 2

    // 驗證各軌道空間殘響 (CC 91)
    expect(revByChannel.get(9)).toBe(45); // 鼓組
    expect(revByChannel.get(10)).toBe(25); // 貝斯
    expect(revByChannel.get(11)).toBe(70); // 和弦 1
    expect(revByChannel.get(12)).toBe(55); // 和弦 2

    // 驗證各軌道合唱效果 (CC 93)
    expect(choByChannel.get(9)).toBe(10); // 鼓組
    expect(choByChannel.get(10)).toBe(5); // 貝斯
    expect(choByChannel.get(11)).toBe(35); // 和弦 1
    expect(choByChannel.get(12)).toBe(45); // 和弦 2
  });

  it('2. 未傳入 mixer 參數時，自動套用 Yamaha 原廠黃金平衡配比 (如 Chord 1 L12, Chord 2 R12, Rev, Cho)', () => {
    const bytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'Mixer Default STY',
      bpm: 120,
      drumKit: { msb: 127, lsb: 0, pc: 0 },
      bassVoice: { msb: 0, lsb: 0, pc: 33 },
      chordVoice: { msb: 0, lsb: 0, pc: 0 },
      sections: dummySections,
    });

    const parsed = YamahaParser.parse(bytes, 'STY');
    const tr0 = parsed.tracks[0];
    const ticksPerBar = 1920 * 4;

    let curTick = 0;
    const volByChannel = new Map<number, number>();
    const panByChannel = new Map<number, number>();
    const revByChannel = new Map<number, number>();
    const choByChannel = new Map<number, number>();

    for (const ev of tr0.events) {
      curTick += ev.delta;
      if (curTick >= ticksPerBar) break;

      if (ev.type === 'controlChange' && ev.channel !== undefined) {
        if (ev.controller === 7) {
          volByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 10) {
          panByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 91) {
          revByChannel.set(ev.channel, ev.value!);
        } else if (ev.controller === 93) {
          choByChannel.set(ev.channel, ev.value!);
        }
      }
    }

    // 原廠推薦黃金配比
    expect(volByChannel.get(9)).toBe(100);
    expect(volByChannel.get(10)).toBe(95);
    expect(volByChannel.get(11)).toBe(90);
    expect(volByChannel.get(12)).toBe(85);

    expect(panByChannel.get(9)).toBe(64); // 中央
    expect(panByChannel.get(10)).toBe(64); // 中央
    expect(panByChannel.get(11)).toBe(52); // L12
    expect(panByChannel.get(12)).toBe(76); // R12

    expect(revByChannel.get(9)).toBe(40); // 鼓組
    expect(revByChannel.get(10)).toBe(20); // 貝斯
    expect(revByChannel.get(11)).toBe(65); // 和弦 1
    expect(revByChannel.get(12)).toBe(50); // 和弦 2

    expect(choByChannel.get(9)).toBe(0); // 鼓組
    expect(choByChannel.get(10)).toBe(0); // 貝斯
    expect(choByChannel.get(11)).toBe(20); // 和弦 1
    expect(choByChannel.get(12)).toBe(40); // 和弦 2
  });
});
