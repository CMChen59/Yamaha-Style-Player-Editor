import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { ChordSynth } from '../src/creator/chord-synth';

describe('Phase 1: 原廠伴奏聲部音量 (CC 7) 與動態表情 (CC 11 Expression) 排程驗證', () => {
  const filePath = path.resolve(__dirname, '../samples/LoveSong.T547.sty');

  it('1. 載入 STY 時能自動萃取原廠伴奏混音音量 (CC 7)，不再全部死板預設為 100', () => {
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');

    styPlaybackEngine.loadParsed(parsed);

    // 驗證原廠混音比例完整被繼承
    expect(styPlaybackEngine.getChannelVolume(8)).toBe(54);  // Rhythm 1 (Sub)
    expect(styPlaybackEngine.getChannelVolume(9)).toBe(62);  // Rhythm 2 (Main)
    expect(styPlaybackEngine.getChannelVolume(10)).toBe(52); // Bass
    expect(styPlaybackEngine.getChannelVolume(11)).toBe(81); // Chord 1
    expect(styPlaybackEngine.getChannelVolume(12)).toBe(79); // Chord 2
    expect(styPlaybackEngine.getChannelVolume(13)).toBe(62); // Pad (原先為 100 導致過吵，現恢復為 62)
    expect(styPlaybackEngine.getChannelVolume(14)).toBe(62); // Phrase 1
  });

  it('2. 選擇 Intro B 段落時能精準萃取 CC 11 Expression 動態曲線事件', () => {
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');
    styPlaybackEngine.loadParsed(parsed);

    const success = styPlaybackEngine.selectSection('Intro B');
    expect(success).toBe(true);

    const ccEvents = styPlaybackEngine.getSectionCCEvents();
    expect(ccEvents.length).toBeGreaterThan(0);

    // 檢驗 Pad (Ch 13) 的 CC 11 事件
    const padCC11 = ccEvents.filter(e => e.channel === 13 && e.controller === 11);
    expect(padCC11.length).toBeGreaterThan(10);

    // 檢驗 Intro B 開頭表情是否為 57 (弱奏)
    const initExpr = styPlaybackEngine.getInitialExpression(13);
    expect(initExpr).toBe(57);

    // 檢驗是否有漸強推升至最高點 (>= 120)
    const maxVal = Math.max(...padCC11.map(e => e.value));
    expect(maxVal).toBeGreaterThanOrEqual(120);

    // 檢驗結尾是否回落
    const lastVal = padCC11[padCC11.length - 1].value;
    expect(lastVal).toBeLessThan(100);
  });

  it('3. ChordSynth 支援動態表情控制器 setExpression / getExpression', () => {
    const synth = new ChordSynth();
    expect(synth.getExpression()).toBe(127);

    synth.setExpression(57);
    expect(synth.getExpression()).toBe(57);

    synth.setExpression(120);
    expect(synth.getExpression()).toBe(120);
  });

  it('4. 全域總音量控制器 (Master Volume) 支援等比例放大與微調', () => {
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');
    styPlaybackEngine.loadParsed(parsed);

    expect(styPlaybackEngine.getMasterVolume()).toBe(100);
    expect(styPlaybackEngine.getEffectiveChannelVolume(13)).toBe(62); // Pad 62 * 1.0 = 62

    // 放大至 125%
    styPlaybackEngine.setMasterVolume(125);
    expect(styPlaybackEngine.getMasterVolume()).toBe(125);
    expect(styPlaybackEngine.getEffectiveChannelVolume(13)).toBe(78); // Pad 62 * 1.25 = 77.5 -> 78
    expect(styPlaybackEngine.getEffectiveChannelVolume(10)).toBe(65); // Bass 52 * 1.25 = 65

    // 縮小至 80%
    styPlaybackEngine.setMasterVolume(80);
    expect(styPlaybackEngine.getEffectiveChannelVolume(13)).toBe(50); // Pad 62 * 0.8 = 49.6 -> 50

    // 重設回 100%
    styPlaybackEngine.setMasterVolume(100);
    expect(styPlaybackEngine.getEffectiveChannelVolume(13)).toBe(62);
  });
});
