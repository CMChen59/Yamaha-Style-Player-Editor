import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { findYamahaVoice } from '../src/core/data/yamaha-voices';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { CasmModifier } from '../src/core/writer/casm-modifier';
import { SingleTrackEditor } from '../src/player/single-track-editor';

describe('Plan A: 空白軌道一鍵啟用 (Add Track & Auto CASM) 核心測試', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');

  it('1. 正確識別原本未使用的空白聲部 (isSectionChannelActive)', () => {
    const fileBuf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(fileBuf);

    // 在 LoveSong 中，CH 16 (Channel 15 - Phrase 2) 全曲皆未被使用 (無音符、無音色、無 CASM)
    const isActiveBefore = YamahaStyleModifier.isSectionChannelActive(parsed, 'Main A', 15);
    expect(isActiveBefore).toBe(false);

    // CH 10 (Channel 9 - Rhythm 2) 與 CH 11 (Channel 10 - Bass) 原本是有音符的
    const isBassActive = YamahaStyleModifier.isSectionChannelActive(parsed, 'Main A', 10);
    expect(isBassActive).toBe(true);
  });

  it('2. 啟用空白聲部：自動注入音色、控制器快照與 SFF2 CASM 轉調規則', () => {
    const fileBuf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(fileBuf);

    // 取得 CFX 鋼琴音色
    const pianoVoice = findYamahaVoice(104, 1, 0) || {
      id: 'cfx_grand',
      name: 'CFX Concert Grand',
      chineseName: 'CFX 音樂會旗艦三角鋼琴',
      category: 'Piano',
      msb: 104,
      lsb: 1,
      pc: 0,
      icon: 'S801',
    };

    // 啟用 CH 12 (Channel 11 - Chord 1)
    const result = YamahaStyleModifier.activateSectionChannel(
      parsed,
      'Main A',
      11,
      pianoVoice,
      { volume: 100, pan: 64, reverb: 40, chorus: 0 }
    );

    expect(result.success).toBe(true);
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Main A', 11)).toBe(true);

    // 驗證 parsed.parts 中已登錄 Channel 11
    const part11 = parsed.parts.find((p) => p.channel === 11);
    expect(part11).toBeDefined();
    expect(part11?.programChange).toBe(0);
    expect(part11?.bankMsb).toBe(104);

    // 驗證 CASM 映射表已更新
    expect(parsed.hasCasm).toBe(true);
    expect(parsed.casmMappings).toBeDefined();
    expect(parsed.casmMappings!['main a'][11]).toBe(11);

    // 驗證 CASM 二進位規則為 Chord 模式
    const rules = CasmModifier.extractPartRules(parsed, 'Main A');
    const rule11 = rules.find((r) => r.channel === 11);
    expect(rule11).toBeDefined();
    expect(rule11?.ntt).toBe('Chord');
    expect(rule11?.ntr).toBe('Root Transpose');
  });

  it('3. 在新啟用的聲部寫入音符後，能順利被 StyPlaybackEngine 解析與播放', () => {
    const fileBuf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(fileBuf);

    const saxVoice = findYamahaVoice(104, 2, 64) || {
      id: 'sweet_sax',
      name: 'Sweet! Soprano Sax',
      chineseName: '高音薩克斯風',
      category: 'Saxophone',
      msb: 104,
      lsb: 2,
      pc: 64,
      icon: 'S809',
    };

    // 啟用 CH 15 (Channel 14 - Phrase 1，在部分段落可能是空白的)
    YamahaStyleModifier.activateSectionChannel(parsed, 'Main A', 14, saxVoice);

    // 寫入 2 個測試音符 (C4, E4)
    const testNotes = [
      { noteNumber: 60, relTick: 0, durationTicks: 480, velocity: 100, sourceChannel: 14 },
      { noteNumber: 64, relTick: 480, durationTicks: 480, velocity: 95, sourceChannel: 14 },
    ];
    YamahaStyleModifier.replaceSectionChannelNotes(parsed, 'Main A', 14, testNotes);

    // 載入至播放引擎
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');

    const ch14Events = styPlaybackEngine.getChannelEvents(14);
    expect(ch14Events.length).toBe(2);
    expect(ch14Events[0].noteNumber).toBe(60);
    expect(ch14Events[1].noteNumber).toBe(64);

    // 驗證音色資訊已成功掛載
    const voiceInfo = styPlaybackEngine.getPartVoices().get(14);
    expect(voiceInfo).toBeDefined();
    expect(voiceInfo?.category).toBe('Saxophone');
  });

  it('4. 啟用新聲部並寫入音符後，匯出成二進位 STY 能通過 100% 嚴格驗證', () => {
    const fileBuf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(fileBuf);

    const guitarVoice = findYamahaVoice(104, 8, 24) || {
      id: 'concert_guitar',
      name: 'Concert Guitar',
      chineseName: '民謠吉他',
      category: 'Guitar',
      msb: 104,
      lsb: 8,
      pc: 24,
      tags: ['Guitar'],
    };

    YamahaStyleModifier.activateSectionChannel(parsed, 'Main A', 12, guitarVoice);

    // 寫入吉他刷奏音符
    const guitarNotes = [
      { noteNumber: 52, relTick: 0, durationTicks: 240, velocity: 90, sourceChannel: 12 },
      { noteNumber: 55, relTick: 0, durationTicks: 240, velocity: 85, sourceChannel: 12 },
      { noteNumber: 60, relTick: 0, durationTicks: 240, velocity: 88, sourceChannel: 12 },
    ];
    YamahaStyleModifier.replaceSectionChannelNotes(parsed, 'Main A', 12, guitarNotes);

    // 進行二進位編碼與反解析驗證
    const exportResult = YamahaWriter.validateAndWrite(parsed);
    expect(exportResult.success).toBe(true);
    expect(exportResult.bytes).toBeInstanceOf(Uint8Array);
    expect(exportResult.bytes.length).toBeGreaterThan(1000);

    // 重新解析匯出之二進位 STY
    const reParsed = YamahaParser.parse(exportResult.bytes);
    expect(reParsed.hasCasm).toBe(true);

    const reActive = YamahaStyleModifier.isSectionChannelActive(reParsed, 'Main A', 12);
    expect(reActive).toBe(true);
  });

  it('5. SingleTrackEditor 支援未啟用聲部偵測與自動觸發啟用回呼', () => {
    let activateRequestedCh = -1;

    if (typeof (global as any).window === 'undefined') {
      (global as any).window = { addEventListener: () => {} };
    }
    if (typeof (global as any).document === 'undefined') {
      (global as any).document = {
        createElement: (tag: string) => ({
          tagName: tag.toUpperCase(),
          className: '',
          id: '',
          style: { setProperty: () => {} },
          appendChild: (c: any) => c,
          querySelector: () => null,
          querySelectorAll: () => [],
          addEventListener: () => {},
        }),
      };
    }

    const mockContainer: any = {
      innerHTML: '',
      style: { setProperty: () => {} },
      appendChild: (el: any) => el,
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    const editor = new SingleTrackEditor(mockContainer);
    editor.setOnRequestActivate((ch) => {
      activateRequestedCh = ch;
    });

    // 載入未啟用聲部 (Channel 15, isActive = false)
    editor.loadTrack(
      15,
      'Phrase 2',
      '#f97316',
      [],
      1920,
      4,
      480,
      { numerator: 4, denominator: 4 },
      null,
      false
    );

    expect(editor.isChannelActive).toBe(false);

    // 當開啟步進錄音時，自動請求啟用該聲部
    editor.toggleStepRecording(true);
    expect(activateRequestedCh).toBe(15);
    expect(editor.isChannelActive).toBe(true);
  });
});
