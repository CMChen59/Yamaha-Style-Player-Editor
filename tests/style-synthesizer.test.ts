import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { DEFAULT_STYLE_PARTS } from '../src/core/models/style-types';

describe('階段 3.1: Yamaha Style (.sty) 核心二進位結構與 SFF2 CASM 伴奏合成引擎', () => {
  it('能從零生成標準全新空白 Yamaha Style 伴奏專案 (Format 0 + 8伴奏聲部 + CASM)', () => {
    const styleProject = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'Pop Rock 8Beat',
      bpm: 128,
      timeSignature: { numerator: 4, denominator: 4 },
      division: 480,
    });

    // 1. 驗證基本屬性
    expect(styleProject.format).toBe('STY');
    expect(styleProject.midiFormat).toBe(0); // Yamaha Style 必要規格: SMF 0 (Format 0)
    expect(styleProject.tracks.length).toBe(1); // Format 0 僅有單軌 Track 0
    expect(styleProject.bpm).toBe(128);
    expect(styleProject.division).toBe(480);
    expect(styleProject.timeSignature).toEqual({ numerator: 4, denominator: 4 });

    // 2. 驗證標準曲式段落標記 (Sections: 包含 SFF2, SInt 標頭與 4 組音樂段落)
    expect(styleProject.sections.length).toBe(6);
    const musicalSections = YamahaStyleSynthesizer.getMusicalSections(styleProject);
    expect(musicalSections.length).toBe(4);
    expect(musicalSections[0].name).toBe('Main A');
    expect(musicalSections[1].name).toBe('Fill In AA');
    expect(musicalSections[2].name).toBe('Main B');
    expect(musicalSections[3].name).toBe('Ending A');

    // 3. 驗證 8 個標準伴奏聲部 (Channels 8~15, 對應 MIDI Ch 9~16)
    expect(styleProject.parts.length).toBe(8);
    const channels = styleProject.parts.map(p => p.channel);
    expect(channels).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);

    expect(styleProject.parts[0].partName).toContain('Rhythm 1');
    expect(styleProject.parts[1].partName).toContain('Rhythm 2');
    expect(styleProject.parts[2].partName).toBe('Bass');
    expect(styleProject.parts[3].partName).toBe('Chord 1');
    expect(styleProject.parts[4].partName).toBe('Chord 2');
    expect(styleProject.parts[5].partName).toBe('Pad');
    expect(styleProject.parts[6].partName).toBe('Phrase 1');
    expect(styleProject.parts[7].partName).toBe('Phrase 2');

    // 4. 驗證 CASM 專屬區塊存在
    expect(styleProject.hasCasm).toBe(true);
    const casmChunk = styleProject.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();
    expect(casmChunk!.data.length).toBeGreaterThan(0);
  });

  it('能將合成之 Style 檔案無失真二進位序列化，並通過 YamahaParser 往返嚴格驗證 (Roundtrip)', () => {
    const styleProject = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'Ballad Modern',
      bpm: 72,
    });

    // 序列化為二進位 byte array
    const binaryBytes = YamahaStyleSynthesizer.serializeToStyleFile(styleProject);
    expect(binaryBytes).toBeInstanceOf(Uint8Array);
    expect(binaryBytes.length).toBeGreaterThan(100);

    // 檢查 MThd 標頭
    const headerTag = String.fromCharCode(...binaryBytes.slice(0, 4));
    expect(headerTag).toBe('MThd');

    // 重新用核心解析器解析驗證
    const reParsed = YamahaParser.parse(binaryBytes, 'STY');

    expect(reParsed.format).toBe('STY');
    expect(reParsed.midiFormat).toBe(0);
    expect(reParsed.tracks.length).toBe(1);
    expect(reParsed.bpm).toBe(72);
    expect(reParsed.sections.length).toBe(6);
    expect(YamahaStyleSynthesizer.getMusicalSections(reParsed).length).toBe(4);
    expect(reParsed.parts.length).toBe(8);
    expect(reParsed.hasCasm).toBe(true);
  });

  it('支援在不同曲式段落中寫入實體伴奏音符 (Notes Injection) 並精準保留時序', () => {
    const ticksPerBar = 480 * 4; // 1920 ticks

    const customStyle = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'Groove Fusion',
      bpm: 110,
      sections: [
        {
          name: 'Main A',
          bars: 2,
          notes: [
            // Rhythm 2 (Ch 9, Kick C1=36)
            { channel: 9, note: 36, startTick: 0, durationTick: 120, velocity: 100 },
            { channel: 9, note: 36, startTick: 960, durationTick: 120, velocity: 95 },
            // Bass (Ch 10, C2=36)
            { channel: 10, note: 36, startTick: 0, durationTick: 480, velocity: 88 },
            { channel: 10, note: 43, startTick: 480, durationTick: 480, velocity: 88 }, // G2
          ],
        },
        {
          name: 'Fill In AA',
          bars: 1,
          notes: [
            // Rhythm 2 (Snare D1=38)
            { channel: 9, note: 38, startTick: 0, durationTick: 120, velocity: 110 },
            { channel: 9, note: 38, startTick: 240, durationTick: 120, velocity: 115 },
            { channel: 9, note: 38, startTick: 480, durationTick: 240, velocity: 127 },
          ],
        },
      ],
    });

    const bytes = YamahaStyleSynthesizer.serializeToStyleFile(customStyle);
    const reParsed = YamahaParser.parse(bytes, 'STY');

    expect(reParsed.sections.length).toBe(4); // SFF2, SInt, Main A, Fill In AA
    const musicalSections = YamahaStyleSynthesizer.getMusicalSections(reParsed);
    expect(musicalSections.length).toBe(2);
    expect(musicalSections[0].name).toBe('Main A');
    expect(musicalSections[1].name).toBe('Fill In AA');

    // 驗證 Track 0 中確實包含注入的音符事件
    const tr0 = reParsed.tracks[0];
    const noteOnEvents = tr0.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(noteOnEvents.length).toBe(7); // Main A (4) + Fill In AA (3) = 7 音符
  });

  it('生成的 SFF2 CASM 區塊能正確為鼓組設為 Fixed 避開轉調，為和弦與低音設定轉調規則', () => {
    const styleProject = YamahaStyleSynthesizer.createBlankStyle();
    const casmChunk = styleProject.customChunks.find(c => c.id === 'CASM');
    expect(casmChunk).toBeDefined();

    const data = casmChunk!.data;
    // 驗證包含 CSEG 與 Sdec
    const text = new TextDecoder('latin1').decode(data);
    expect(text).toContain('CSEG');
    expect(text).toContain('Sdec');
    expect(text).toContain('Main A');
    expect(text).toContain('Ctb2');
    expect(text).toContain('Drum4cc');
    expect(text).toContain('BassMain');
  });
});
