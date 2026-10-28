import { describe, it, expect } from 'vitest';
import { MidiImporter } from '../src/core/writer/midi-importer';
import { StyleImporter, type StyleImportOptions, type SampleInjectionOptions } from '../src/core/writer/style-importer';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('整合包 2: 外部 MIDI 樂句採集器與 C 根音校正 (MIDI Section Sampler & C-Root Normalizer)', () => {
  const demoBytes = MidiImporter.createDemoGrooveMidi();

  it('1. 能針對指定小節區間 (startTick ~ endTick) 精準執行調性偵測', () => {
    const analysis = StyleImporter.analyzeForStyle(demoBytes, 'demo_groove.mid');
    const division = analysis.division;
    const ticksPerBar = division * 4;

    // 前 4 小節 (Tick 0 ~ 4 小節)
    const keyRange1 = StyleImporter.detectKeySignature(
      analysis.tracks,
      division,
      0,
      4 * ticksPerBar
    );
    expect(keyRange1.root).toBeDefined();
    expect(typeof keyRange1.semitonesToC).toBe('number');

    // 測試空區間自動回退
    const emptyRangeKey = StyleImporter.detectKeySignature(
      analysis.tracks,
      division,
      999999,
      1000000
    );
    expect(emptyRangeKey.root).toBeDefined();
  });

  it('2. C 根音校正 (C-Root Normalizer) 驗證：非打擊樂平移，鼓組絕對保持原音高', () => {
    const analysis = StyleImporter.analyzeForStyle(demoBytes, 'demo_groove.mid');

    // 假設原曲和弦為 G，指定 rootKeyOverride: 'G' (semitonesToC = -7)
    const options: StyleImportOptions = {
      projectName: 'CRoot_Test_Style',
      bpm: 120,
      startBar: 1,
      endBar: 2,
      targetSection: 'Main A',
      partMappings: [
        { partId: 'Rhythm2', sourceTrackIndex: 4 }, // 鼓組
        { partId: 'Bass', sourceTrackIndex: 3 },    // 貝斯
        { partId: 'Chord1', sourceTrackIndex: 1 },  // 鋼琴和弦
      ],
      normalizeToCRoot: true,
      rootKeyOverride: 'G', // G 轉 C 需向下移調 7 個半音
    };

    const style = StyleImporter.synthesizeStyleFromImport(analysis, options);

    // 取得合成後的音符
    const drumEvents = style.tracks[0].events.filter(
      (e) => e.type === 'noteOn' && e.channel === 9 && (e.velocity ?? 0) > 0
    );
    const bassEvents = style.tracks[0].events.filter(
      (e) => e.type === 'noteOn' && e.channel === 10 && (e.velocity ?? 0) > 0
    );

    // 1. 鼓組 (Ch 9) 音符音高必須與來源完全一致，絕不轉調
    const originalDrumNote = analysis.tracks[4].notes[0].note;
    expect(drumEvents[0].noteNumber).toBe(originalDrumNote);

    // 2. 貝斯 (Ch 10) 必須精確向下移調 7 個半音 (G 轉 C)
    const originalBassNote = analysis.tracks[3].notes[0].note;
    expect(bassEvents[0].noteNumber).toBe(originalBassNote - 7);
  });

  it('3. 樂句注入引擎 (injectSampledSectionIntoStyle) 能精準注入現有伴奏的指定段落', () => {
    // 先建立一個基礎 Style (含 Main A)
    const analysis = StyleImporter.analyzeForStyle(demoBytes, 'demo_groove.mid');
    const baseStyle = StyleImporter.synthesizeStyleFromImport(analysis, {
      projectName: 'BaseStyle',
      targetSection: 'Main A',
      startBar: 1,
      endBar: 4,
      partMappings: [
        { partId: 'Rhythm2', sourceTrackIndex: 4 },
        { partId: 'Bass', sourceTrackIndex: 3 },
      ],
    });

    expect(baseStyle.sections.some((s) => s.name === 'Main A')).toBe(true);

    // 執行樂句採集注入：將第 1~2 小節注入為新段落 'Main B'
    const injectOptions: SampleInjectionOptions = {
      startBar: 1,
      endBar: 2,
      partMappings: [
        { partId: 'Rhythm2', sourceTrackIndex: 4 },
        { partId: 'Bass', sourceTrackIndex: 3 },
        { partId: 'Chord1', sourceTrackIndex: 1 },
      ],
      normalizeToCRoot: true,
      rootKeyOverride: 'C',
      copyMode: 'replace',
    };

    const result = StyleImporter.injectSampledSectionIntoStyle(
      baseStyle,
      'Main B',
      analysis,
      injectOptions
    );

    expect(result.success).toBe(true);
    expect(result.destSection).toBe('Main B');
    expect(result.sampledBars).toBe(2);
    expect(result.notesInjected).toBeGreaterThan(10);
    expect(result.partsUpdated.length).toBe(3);

    // 驗證 baseStyle 現在擁有了 Main B 段落
    expect(baseStyle.sections.some((s) => s.name === 'Main B')).toBe(true);

    // 驗證 Main B 區間內的 Chord 1 (Ch 11) 音符存在
    const chordNotes = baseStyle.tracks[0].events.filter(
      (e) => e.type === 'noteOn' && e.channel === 11 && (e.velocity ?? 0) > 0
    );
    expect(chordNotes.length).toBeGreaterThan(0);
  });

  it('4. 能將外部 MIDI 採集樂句封裝為樣式庫條目 (createStylePoolEntryFromSample)', () => {
    const analysis = StyleImporter.analyzeForStyle(demoBytes, 'demo_groove.mid');

    const poolEntry = StyleImporter.createStylePoolEntryFromSample(analysis, {
      projectName: 'Funky Groove Sample',
      startBar: 1,
      endBar: 4,
      targetSection: 'Main A',
      partMappings: [
        { partId: 'Rhythm2', sourceTrackIndex: 4 },
        { partId: 'Bass', sourceTrackIndex: 3 },
      ],
    });

    expect(poolEntry.id).toContain('pool-sample-');
    expect(poolEntry.name).toBe('Funky Groove Sample.sty');
    expect(poolEntry.parsed.format).toBe('STY');
    const musicalSections = YamahaStyleSynthesizer.getMusicalSections(poolEntry.parsed);
    expect(musicalSections.length).toBe(1);
    expect(musicalSections[0].name).toBe('Main A');
  });

  it('5. 智慧段落嗅探 (Section Scout)：能精準偵測鼓組進場小節並正確推測前奏 (Intro) 與主歌 (Main A)', () => {
    const analysis = StyleImporter.analyzeForStyle(demoBytes, 'demo_groove.mid');
    const scout = StyleImporter.detectSongStructureScout(analysis);

    expect(scout).toBeDefined();
    expect(scout.introRange).toBeDefined();
    expect(scout.introRange.start).toBe(1);
    expect(scout.introRange.bars).toBeGreaterThanOrEqual(1);

    expect(scout.mainRange).toBeDefined();
    expect(scout.mainRange.start).toBe(scout.introRange.end + 1);

    expect(scout.drumEntryDescription).toBeDefined();
    expect(scout.drumEntryDescription.length).toBeGreaterThan(0);
    expect(scout.summary).toBeDefined();
  });

  it('6. 智慧段落嗅探 (Section Scout)：當鼓組延遲至第 5 小節進場時，正確判定 Intro 為 1~4 節、Main A 為 5~12 節', () => {
    const division = 480;
    const ticksPerMeasure = division * 4; // 1920 ticks/bar

    // 構建一個模擬 83 小節歌曲，鼓組在第 5 小節 (tick 4 * 1920 = 7680) 進場
    const mockAnalysis: any = {
      fileName: 'hotel_sorrow.mid',
      division: 480,
      bpm: 88,
      timeSignature: { numerator: 4, denominator: 4 },
      totalMeasures: 83,
      totalTicks: 83 * ticksPerMeasure,
      tracks: [
        {
          trackIndex: 0,
          trackName: 'Drums',
          channel: 9,
          noteCount: 100,
          totalTicks: 83 * ticksPerMeasure,
          notes: [
            // 第一顆大鼓在第 5 小節 (tick 7680)
            { note: 36, velocity: 110, startTick: 7680, durationTick: 240 },
            { note: 38, velocity: 105, startTick: 8160, durationTick: 240 },
          ],
        },
        {
          trackIndex: 1,
          trackName: 'Intro Accordion',
          channel: 0,
          noteCount: 20,
          totalTicks: 83 * ticksPerMeasure,
          notes: [
            // 前奏手風琴第 1~4 小節
            { note: 60, velocity: 80, startTick: 0, durationTick: 960 },
            { note: 64, velocity: 80, startTick: 960, durationTick: 960 },
          ],
        },
      ],
      styleTracks: [
        { trackIndex: 0, detectedCategory: 'drums' },
        { trackIndex: 1, detectedCategory: 'reed' },
      ],
    };

    const scout = StyleImporter.detectSongStructureScout(mockAnalysis);
    expect(scout.firstDrumBar).toBe(5);
    expect(scout.introRange.start).toBe(1);
    expect(scout.introRange.end).toBe(4);
    expect(scout.introRange.bars).toBe(4);

    expect(scout.mainRange.start).toBe(5);
    expect(scout.mainRange.end).toBe(12);
    expect(scout.mainRange.bars).toBe(8);

    expect(scout.drumEntryDescription).toContain('第 5 小節進場');
    expect(scout.drumEntryDescription).toContain('前奏推測為第 1 ~ 4 小節');
  });

  it('7. 邊界與無打擊樂容錯：純鋼琴獨奏無鼓軌時，安全回退標準 4 小節前奏與 8 小節主歌', () => {
    const mockPianoAnalysis: any = {
      fileName: 'piano_solo.mid',
      division: 480,
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      totalMeasures: 32,
      totalTicks: 32 * 1920,
      tracks: [
        {
          trackIndex: 0,
          trackName: 'Piano',
          channel: 0,
          noteCount: 50,
          totalTicks: 32 * 1920,
          notes: [
            { note: 60, velocity: 80, startTick: 0, durationTick: 480 },
          ],
        },
      ],
      styleTracks: [{ trackIndex: 0, detectedCategory: 'piano' }],
    };

    const scout = StyleImporter.detectSongStructureScout(mockPianoAnalysis);
    expect(scout.firstDrumBar).toBeNull();
    expect(scout.introRange.start).toBe(1);
    expect(scout.introRange.end).toBe(4);
    expect(scout.mainRange.start).toBe(5);
    expect(scout.mainRange.end).toBe(12);
    expect(scout.endingRange.end).toBe(32);
    expect(scout.summary.length).toBeGreaterThan(0);
  });
});
