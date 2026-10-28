import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { StyleRemixer, type StyleRemixOptions } from '../src/core/writer/style-remixer';
import { MidiImporter } from '../src/core/writer/midi-importer';
import { StyleImporter } from '../src/core/writer/style-importer';

describe('Phase 3.3: StyleRemixer 跨 STY 聲部混搭重組精靈引擎', () => {
  const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const sampleStyBuffer = fs.readFileSync(sampleStyPath);
  const realSty = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');

  // 由 Demo MIDI 生成一個合成 Style 作為第二個來源
  const demoBytes = MidiImporter.createDemoGrooveMidi();
  const demoAnalysis = StyleImporter.analyzeForStyle(demoBytes, 'groove.mid');
  const synthSty = StyleImporter.synthesizeStyleFromImport(demoAnalysis, {
    projectName: 'Pop Groove',
    bpm: 120,
    targetSection: 'Main A',
    startBar: 1,
    endBar: 4,
    partMappings: [
      { partId: 'Rhythm2', sourceTrackIndex: 4 },
      { partId: 'Bass', sourceTrackIndex: 3 },
      { partId: 'Chord1', sourceTrackIndex: 1 },
      { partId: 'Phrase1', sourceTrackIndex: 2 },
    ],
  });

  it('能精確提取真實 STY 伴奏中的所有音樂段落與時間區間', () => {
    const sections = StyleRemixer.getMusicalSections(realSty);
    expect(sections.length).toBeGreaterThanOrEqual(10);

    const mainA = sections.find((s) => s.name === 'Main A');
    expect(mainA).toBeDefined();

    const rangeMainA = StyleRemixer.getSectionTickRange(realSty, 'Main A');
    expect(rangeMainA).not.toBeNull();
    expect(rangeMainA!.measureCount).toBeGreaterThan(0);
    expect(rangeMainA!.endTick).toBeGreaterThan(rangeMainA!.startTick);
  });

  it('能從真實 STY 中精準抽取各聲部音符與音色參數', () => {
    // 抽取 4006_SX900 Main A 的鼓組 (Rhythm 2)
    const drumNotes = StyleRemixer.extractSectionPartNotes(realSty, 'Main A', 'Rhythm2');
    expect(drumNotes.length).toBeGreaterThan(0);
    expect(drumNotes[0].startTick).toBeGreaterThanOrEqual(0);

    // 抽取 4006_SX900 Main A 的 Bass (自動解析 SFF 通道)
    const bassNotes = StyleRemixer.extractSectionPartNotes(realSty, 'Main A', 'Bass');
    expect(bassNotes.length).toBeGreaterThan(0);

    // 取得聲部設定 (PC, Bank, Volume)
    const summary = StyleRemixer.getSectionSummary(realSty, 'Main A');
    expect(summary.Rhythm2.noteCount).toBe(drumNotes.length);
    expect(summary.Bass.noteCount).toBe(bassNotes.length);
    expect(summary.Rhythm2.channel).toBe(9);
    expect(summary.Bass.channel).toBe(10);
  });

  it('能將不同 STY 之鼓組、貝斯與和弦跨風格混搭合成為全新的 Yamaha Style', () => {
    // 混搭配置：
    // Style Pool 1: 4006_SX900.T547.sty (真實 PSR-SX900 伴奏)
    // Style Pool 2: synthSty (由外部 MIDI 匯入之風格)
    // Target Main A:
    //   - Rhythm 2: 來自 4006_SX900 (Main A)
    //   - Bass: 來自 synthSty (Main A)
    //   - Chord 1: 來自 synthSty (Main A)
    // Target Intro A:
    //   - Rhythm 2: 來自 4006_SX900 (Intro A)
    //   - Bass: 來自 4006_SX900 (Intro A)
    const remixOptions: StyleRemixOptions = {
      projectName: 'Hybrid SX900 Remix',
      bpm: 124,
      pool: [
        { id: 'style-real', name: '4006_SX900.T547.sty', parsed: realSty },
        { id: 'style-synth', name: 'Pop Groove', parsed: synthSty },
      ],
      sections: [
        {
          targetSectionName: 'Intro A',
          parts: {
            Rhythm2: {
              partId: 'Rhythm2',
              sourceStyleId: 'style-real',
              sourceSectionName: 'Intro A',
            },
            Bass: {
              partId: 'Bass',
              sourceStyleId: 'style-real',
              sourceSectionName: 'Intro A',
            },
          },
        },
        {
          targetSectionName: 'Main A',
          parts: {
            Rhythm2: {
              partId: 'Rhythm2',
              sourceStyleId: 'style-real',
              sourceSectionName: 'Main A',
            },
            Bass: {
              partId: 'Bass',
              sourceStyleId: 'style-synth',
              sourceSectionName: 'Main A',
              transposeShift: 0,
            },
            Chord1: {
              partId: 'Chord1',
              sourceStyleId: 'style-synth',
              sourceSectionName: 'Main A',
            },
          },
        },
      ],
    };

    const remixedParsed = StyleRemixer.remixStyles(remixOptions);

    // 1. 驗證新生成的 Style 結構
    expect(remixedParsed.format).toBe('STY');
    expect(remixedParsed.midiFormat).toBe(0);
    expect(remixedParsed.tracks.length).toBe(1);

    const musicalSections = YamahaStyleSynthesizer.getMusicalSections(remixedParsed);
    expect(musicalSections.length).toBe(2);
    expect(musicalSections.map((s) => s.name)).toEqual(['Intro A', 'Main A']);

    // 2. 驗證 Track 0 中包含兩段落的音符與各聲部通道 (Ch 9 鼓組, Ch 10 貝斯, Ch 11 和弦)
    const track0Notes = remixedParsed.tracks[0].events.filter(
      (e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0
    );
    expect(track0Notes.length).toBeGreaterThan(30);

    const channels = new Set(track0Notes.map((e) => e.channel));
    expect(channels.has(9)).toBe(true);  // Rhythm2
    expect(channels.has(10)).toBe(true); // Bass
    expect(channels.has(11)).toBe(true); // Chord1

    // 3. 驗證 SFF2 CASM 轉調區塊已自動生成
    const casm = remixedParsed.customChunks.find((c) => c.id === 'CASM');
    expect(casm).toBeDefined();

    // 4. 二進位序列化與雙向回讀
    const bytes = YamahaStyleSynthesizer.serializeToStyleFile(remixedParsed);
    expect(bytes.length).toBeGreaterThan(1000);

    const reparsed = YamahaParser.parse(bytes, 'STY');
    expect(reparsed.midiFormat).toBe(0);
    const reparsedSections = YamahaStyleSynthesizer.getMusicalSections(reparsed);
    expect(reparsedSections.length).toBe(2);
    expect(reparsedSections[0].name).toBe('Intro A');
    expect(reparsedSections[1].name).toBe('Main A');
  });
});
