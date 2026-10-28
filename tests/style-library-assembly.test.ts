import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleAssembly } from '../src/core/writer/style-assembly';
import { StyleRemixer, type StylePoolEntry } from '../src/core/writer/style-remixer';
import { MidiImporter } from '../src/core/writer/midi-importer';
import { StyleImporter } from '../src/core/writer/style-importer';

describe('整合包 1: 伴奏樣式庫 (Style Pool) 與跨風格混血拼貼測試', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const buffer = fs.readFileSync(sampleStyPath);
  const realSty = YamahaParser.parse(new Uint8Array(buffer), 'STY');

  // 建立由 MIDI 生成的風格作為風格池第二個項目 (標準 SFF2 通道：Bass 位於 Channel 10, 即 Ch 11)
  const demoBytes = MidiImporter.createDemoGrooveMidi();
  const demoAnalysis = StyleImporter.analyzeForStyle(demoBytes, 'pop-groove.mid');
  const synthSty = StyleImporter.synthesizeStyleFromImport(demoAnalysis, {
    projectName: 'Pop Groove',
    bpm: 128,
    targetSection: 'Main A',
    startBar: 1,
    endBar: 4,
    partMappings: [
      { partId: 'Rhythm2', sourceTrackIndex: 4 },
      { partId: 'Bass', sourceTrackIndex: 3 },
      { partId: 'Chord1', sourceTrackIndex: 1 },
    ],
  });

  it('1. 能在記憶體中建立多樣式庫 (Style Pool Map/Array) 並正確管理多個 STY', () => {
    const stylePool: StylePoolEntry[] = [
      { id: 'style-real', name: '4006_SX900.T547.sty', parsed: realSty },
      { id: 'style-synth', name: 'Pop Groove.sty', parsed: synthSty },
    ];

    expect(stylePool.length).toBe(2);
    expect(stylePool[0].parsed.sections.length).toBeGreaterThan(5);
    expect(stylePool[1].parsed.sections.length).toBeGreaterThan(0);

    const names = stylePool.map((s) => s.name);
    expect(names).toContain('4006_SX900.T547.sty');
    expect(names).toContain('Pop Groove.sty');
  });

  it('2. 能自風格庫中的不同 STY 提取聲部，跨風格拼貼至目標 STY (Cross-Style Part Assembly)', () => {
    // 目標伴奏以 realSty 的獨立複本進行組裝
    const targetParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 驗證組裝前 targetParsed Main A 的 Bass (Ch 2 / index 1)
    const overviewBefore = YamahaStyleAssembly.getSectionOverview(targetParsed, 'Main A');
    const bassPartBefore = overviewBefore?.parts.find((p) => p.channel === 1);
    expect(bassPartBefore).toBeDefined();
    expect(bassPartBefore?.noteCount).toBe(34);

    // 來源伴奏取自 synthSty Main A 的 Bass (在標準 SFF2 中位於 channel 10 / Ch 11)
    const synthOverview = YamahaStyleAssembly.getSectionOverview(synthSty, 'Main A');
    const synthBass = synthOverview?.parts.find((p) => p.channel === 10);
    expect(synthBass).toBeDefined();
    const synthBassNotes = synthBass?.noteCount || 0;
    expect(synthBassNotes).toBeGreaterThan(0);

    // 執行跨風格聲部組裝：將 synthSty 的 Bass (Ch 10) 替換拼貼進 targetParsed 的 Main A Bass (Ch 1)
    const assembleResult = YamahaStyleAssembly.assemblePart({
      destParsed: targetParsed,
      destSection: 'Main A',
      destChannel: 1, // target Bass channel
      srcParsed: synthSty,
      srcSection: 'Main A',
      srcChannel: 10, // source synth Bass channel
      copyMode: 'replace',
      loopMode: 'loop',
      copyVoiceParams: true,
    });

    expect(assembleResult.success).toBe(true);
    expect(assembleResult.notesCopied).toBeGreaterThan(0);

    // 檢查組裝後 targetParsed Main A 的 Bass 音符數已更新為來自 synthSty
    const overviewAfter = YamahaStyleAssembly.getSectionOverview(targetParsed, 'Main A');
    const bassPartAfter = overviewAfter?.parts.find((p) => p.channel === 1);
    expect(bassPartAfter?.noteCount).toBe(assembleResult.finalNoteCount);
    expect(bassPartAfter?.noteCount).not.toBe(34); // 已不是原本的 34 音符

    // 驗證其他未替換聲部 (如 Rhythm 2 / Ch 10 / index 9) 音符完好未受影響
    const drumBefore = overviewBefore?.parts.find((p) => p.channel === 9);
    const drumAfter = overviewAfter?.parts.find((p) => p.channel === 9);
    expect(drumAfter?.noteCount).toBe(drumBefore?.noteCount);
  });

  it('3. 支援多聲部跨風格批次拼貼 (Multi-Part Batch Assembly across styles)', () => {
    const targetParsed = YamahaParser.parse(new Uint8Array(buffer), 'STY');

    // 驗證 synthSty 中有音符的通道 (如 channel 9 鼓組, channel 10 低音, channel 11 和弦)
    const synthOverview = YamahaStyleAssembly.getSectionOverview(synthSty, 'Main A');
    const activeChannels = synthOverview?.parts.filter((p) => p.noteCount > 0).map((p) => p.channel) || [];
    expect(activeChannels.length).toBeGreaterThanOrEqual(2);

    // 同時借用 synthSty 的有效通道拼貼至 targetParsed
    const cloneResult = YamahaStyleAssembly.cloneFullSection({
      destParsed: targetParsed,
      destSection: 'Main A',
      srcParsed: synthSty,
      srcSection: 'Main A',
      channels: activeChannels,
      copyMode: 'replace',
      loopMode: 'loop',
      copyVoiceParams: true,
    });

    expect(cloneResult.success).toBe(true);
    expect(cloneResult.channelsCloned).toEqual(activeChannels);
    expect(cloneResult.totalNotesCopied).toBeGreaterThan(0);
  });
});
