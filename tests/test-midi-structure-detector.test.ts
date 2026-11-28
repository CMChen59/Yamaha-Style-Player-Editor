import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiStructureDetector } from '../src/core/parser/midi-structure-detector';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('MidiStructureDetector - 樂曲前奏、間奏、尾奏三大直通段落自動辨識與組裝', () => {
  it('1. 精確偵測《容易受傷的女人.mid》之前奏 (Intro A)、間奏 (Intro B)、尾奏 (Ending A)', () => {
    const p = '容易受伤的女人.mid';
    const buf = new Uint8Array(fs.readFileSync(p));
    const parsed = YamahaParser.parse(buf, 'MID');
    const ana = MidiSongAnalyzer.analyze(parsed, p);

    const res = MidiStructureDetector.detectStructure(parsed, ana);
    console.log(`\n=== [${p} 結構辨識結果] ===`);
    console.log(`全曲主唱樂器: ${res.globalMelodyName} (CH ${res.globalMelodyChannel! + 1})`);
    res.simpleSections.forEach(s => {
      console.log(`  [${s.nameZh}] 第 ${s.startBar} 節 (第 ${s.startBeat} 拍) ~ 第 ${s.endBar} 節 (第 ${s.endBeat} 拍) ｜ 長度 ${s.barLength} 節 ｜ 領奏: ${s.leadInstruments.join(', ')} ｜ 模式: ${s.recommendedChordMode}`);
    });

    expect(res.simpleSections.length).toBe(3);

    // 前奏: Bar 1 Beat 3 ~ Bar 5
    const intro = res.simpleSections.find(s => s.targetSection === 'Intro A');
    expect(intro).toBeDefined();
    expect(intro!.startBar).toBe(1);
    expect(intro!.endBar).toBe(5);
    expect(intro!.startBeat).toBe(3);
    expect(intro!.recommendedChordMode).toBe('ORIGINAL_PASS_THROUGH');

    // 間奏 Solo 齊奏: Bar 26 (or 27) ~ 33
    const interlude = res.simpleSections.find(s => s.targetSection === 'Intro B');
    expect(interlude).toBeDefined();
    expect(interlude!.startBar).toBeGreaterThanOrEqual(26);
    expect(interlude!.endBar).toBe(33);
    expect(interlude!.recommendedChordMode).toBe('ORIGINAL_PASS_THROUGH');

    // 尾奏: Bar 67 (or 68) ~ 72
    const ending = res.simpleSections.find(s => s.targetSection === 'Ending A');
    expect(ending).toBeDefined();
    expect(ending!.startBar).toBeGreaterThanOrEqual(67);
    expect(ending!.endBar).toBe(72);
    expect(ending!.recommendedChordMode).toBe('ORIGINAL_PASS_THROUGH');
  });

  it('2. 精確偵測《月亮代表我的心.mid》之三大直通段落', () => {
    const p = 'D:/Keyboard/MIDI/月亮代表我的心.mid';
    if (!fs.existsSync(p)) return;

    const buf = new Uint8Array(fs.readFileSync(p));
    const parsed = YamahaParser.parse(buf, 'MID');
    const ana = MidiSongAnalyzer.analyze(parsed, p);

    const res = MidiStructureDetector.detectStructure(parsed, ana);
    console.log(`\n=== [${p} 結構辨識結果] ===`);
    console.log(`全曲主唱樂器: ${res.globalMelodyName} (CH ${res.globalMelodyChannel! + 1})`);
    res.simpleSections.forEach(s => {
      console.log(`  [${s.nameZh}] 第 ${s.startBar} 節 ~ 第 ${s.endBar} 節 ｜ 長度 ${s.barLength} 節 ｜ 領奏: ${s.leadInstruments.join(', ')} ｜ 模式: ${s.recommendedChordMode}`);
    });

    expect(res.simpleSections.length).toBe(3);

    // 前奏: Bar 1 ~ 4
    const intro = res.simpleSections.find(s => s.targetSection === 'Intro A');
    expect(intro).toBeDefined();
    expect(intro!.startBar).toBe(1);
    expect(intro!.endBar).toBe(4);

    // 間奏: Bar 37 ~ 44 (8 小節鋼琴吉他接力)
    const interlude = res.simpleSections.find(s => s.targetSection === 'Intro B');
    expect(interlude).toBeDefined();
    expect(interlude!.startBar).toBe(37);
    expect(interlude!.endBar).toBe(44);
    expect(interlude!.barLength).toBe(8);

    // 尾奏: Bar 65 ~ 68 (4 小節尾奏)
    const ending = res.simpleSections.find(s => s.targetSection === 'Ending A');
    expect(ending).toBeDefined();
    expect(ending!.startBar).toBe(65);
    expect(ending!.endBar).toBe(68);
    expect(ending!.barLength).toBe(4);
  });

  it('3. 批次自動切片組裝【前奏 + 間奏 + 尾奏】至 Yamaha STY 伴奏檔並生成二進位', () => {
    const p = '容易受伤的女人.mid';
    const buf = new Uint8Array(fs.readFileSync(p));
    const parsed = YamahaParser.parse(buf, 'MID');
    const ana = MidiSongAnalyzer.analyze(parsed, p);

    const struct = MidiStructureDetector.detectStructure(parsed, ana);

    // 執行一鍵批次組裝
    const batchRes = MidiStructureDetector.batchAssembleSections({
      sourceParsed: parsed,
      analysis: ana,
      sectionsToAssemble: struct.simpleSections,
      styleName: 'RongYi_Intro_Interlude_Ending',
    });

    expect(batchRes.assembledResults.length).toBe(3);
    const assembledSections = batchRes.styleParsed.sections?.map(s => s.name) || [];
    console.log('\n組裝後伴奏段落清單:', assembledSections);

    expect(assembledSections).toContain('Intro A');
    expect(assembledSections).toContain('Intro B');
    expect(assembledSections).toContain('Ending A');

    // 驗證能寫入標準 STY 二進位且不拋出例外
    const bytes = YamahaWriter.write(batchRes.styleParsed);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    console.log(`一鍵自動組裝 STY 成功！檔案大小: ${bytes.byteLength} bytes`);
  });
});
