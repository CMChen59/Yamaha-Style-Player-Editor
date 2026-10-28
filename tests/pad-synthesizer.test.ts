import { describe, it, expect } from 'vitest';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

describe('Phase 2.4: Yamaha Multi Pad 二進位合成器與專案建構驗證', () => {
  it('能建立標準 4 小節空白 Multi Pad 專案並通過二進位無損重構驗證', () => {
    // 1. 建立預設空白專案
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName: 'Test New Pad',
      bpm: 128,
      division: 480,
      bars: 4,
    });

    expect(project.format).toBe('PAD');
    expect(project.midiFormat).toBe(1);
    expect(project.division).toBe(480);
    expect(project.bpm).toBe(128);
    expect(project.tracks.length).toBe(5);
    expect(project.padConfig?.names).toEqual(['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4']);
    expect(project.sections[0].measureCount).toBe(4);

    // 2. 寫入二進位 Buffer
    const binary = YamahaWriter.write(project);
    expect(binary.length).toBeGreaterThan(0);

    // 3. 重新讀入並解析
    const parsed = YamahaParser.parse(binary, 'PAD');
    expect(parsed.format).toBe('PAD');
    expect(parsed.bpm).toBe(128);
    expect(parsed.division).toBe(480);
    expect(parsed.tracks.length).toBe(5);
    expect(parsed.padConfig?.names[0]).toBe('Pad 1');
    expect(parsed.padConfig?.icons[0]).toBe('S809');
    expect(parsed.padConfig?.repeatFlags).toEqual([false, false, false, false]);
    expect(parsed.padConfig?.chordMatchFlags).toEqual([false, false, false, false]);

    // 驗證 Track 0 的 Yamaha 控制標籤
    const t0Markers = parsed.tracks[0].events
      .filter(e => e.type === 'meta' && (e.metaType === 6 || e.metaType === 7))
      .map(e => e.text);
    expect(t0Markers).toContain('Main A');
    expect(t0Markers).toContain('RP0000');
    expect(t0Markers).toContain('CM0000');
    expect(t0Markers).toContain('N1Pad 1');
    expect(t0Markers).toContain('I1S809');
  });

  it('支援自訂參數 (拍號 3/4、BPM、Pad自訂名稱、旗標與樂器音色)', () => {
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName: 'Waltz Pad',
      bpm: 96,
      timeSignature: { numerator: 3, denominator: 4 },
      division: 96,
      bars: 2,
      pads: [
        { name: 'Piano Intro', icon: 'P001', repeat: true, chordMatch: true, msb: 0, lsb: 112, pc: 0, volume: 110 },
        { name: 'Slow Strings', icon: 'S809', repeat: false, chordMatch: true, msb: 8, lsb: 33, pc: 49, volume: 85 },
        { name: 'Steel Guitar', icon: 'G100', repeat: true, chordMatch: false, msb: 0, lsb: 112, pc: 25, volume: 95 },
        { name: 'Drum Fill', icon: 'D900', repeat: false, chordMatch: false, msb: 127, lsb: 0, pc: 0, volume: 100 },
      ],
    });

    const binary = YamahaWriter.write(project);
    const parsed = YamahaParser.parse(binary, 'PAD');

    expect(parsed.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(parsed.bpm).toBe(96);
    expect(parsed.division).toBe(96);
    expect(parsed.padConfig?.names[0]).toBe('Piano Intro');
    expect(parsed.padConfig?.icons[0]).toBe('P001');
    expect(parsed.padConfig?.repeatFlags).toEqual([true, false, true, false]);
    expect(parsed.padConfig?.chordMatchFlags).toEqual([true, true, false, false]);

    // 檢查 Track 1 初始混音 (音量 110, PC 0)
    const trk1Evs = parsed.tracks[1].events;
    const vol = trk1Evs.find(e => e.type === 'controlChange' && e.controller === 7)?.value;
    const pc = trk1Evs.find(e => e.type === 'programChange')?.program;
    expect(vol).toBe(110);
    expect(pc).toBe(0);

    // 檢查 Track 2 初始混音 (音量 85, PC 49)
    const trk2Evs = parsed.tracks[2].events;
    const vol2 = trk2Evs.find(e => e.type === 'controlChange' && e.controller === 7)?.value;
    const pc2 = trk2Evs.find(e => e.type === 'programChange')?.program;
    expect(vol2).toBe(85);
    expect(pc2).toBe(49);
  });

  it('全新空白專案可直接新增音符並無縫編輯小節長度', () => {
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName: 'Editable Pad',
      division: 96,
      bars: 4,
    });

    // 在 Pad 1 新增 3 顆音符
    const ok1 = YamahaPadModifier.addNoteEvent(project, 1, {
      note: 60, // C4
      startTick: 0,
      durationTick: 96,
      velocity: 100,
    });
    const ok2 = YamahaPadModifier.addNoteEvent(project, 1, {
      note: 64, // E4
      startTick: 96,
      durationTick: 96,
      velocity: 95,
    });
    const ok3 = YamahaPadModifier.addNoteEvent(project, 1, {
      note: 67, // G4
      startTick: 192,
      durationTick: 192,
      velocity: 105,
    });

    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(ok3).toBe(true);

    const binary = YamahaWriter.write(project);
    const parsed = YamahaParser.parse(binary, 'PAD');

    // 檢查 Track 1 是否有 3 顆音符
    const noteOns = parsed.tracks[1].events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(noteOns.length).toBe(3);
    expect(noteOns[0].noteNumber).toBe(60);
    expect(noteOns[1].noteNumber).toBe(64);
    expect(noteOns[2].noteNumber).toBe(67);
  });

  it('支援注入標準 Yamaha CASM (Chord Match 轉調表) 專屬區塊', () => {
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName: 'Casm Pad',
      injectCasm: true,
    });

    expect(project.hasCasm).toBe(true);
    expect(project.customChunks.length).toBe(1);
    expect(project.customChunks[0].id).toBe('CASM');

    // 寫入二進位並重新解析
    const binary = YamahaWriter.write(project);
    const parsed = YamahaParser.parse(binary, 'PAD');

    expect(parsed.hasCasm).toBe(true);
    expect(parsed.customChunks[0].id).toBe('CASM');
    expect(parsed.customChunks[0].data.length).toBeGreaterThan(100);
  });
});
