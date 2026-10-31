import { describe, it, expect } from 'vitest';
import {
  searchYamahaVoices,
  findYamahaVoice,
} from '../src/core/data/yamaha-voices';

describe('Yamaha 原廠音色三聯號 (MSB-LSB-PC) 智慧檢索與琴端 1-based 相容測試', () => {
  it('輸入 0-119-8 (輸入過程前綴匹配) 能立即顯示 BellHeaven 與 SuperDarkPad，不會出現空結果', () => {
    const results = searchYamahaVoices('0-119-8');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.name === 'BellHeaven')).toBe(true);
    expect(results.some(r => r.name === 'SuperDarkPad')).toBe(true);
  });

  it('輸入 0-119-89 (琴端顯示 1-based) 能精確命中 BellHeaven (Pad)，且置於首位', () => {
    const results = searchYamahaVoices('0-119-89');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const topMatch = results[0];
    expect(topMatch.name).toBe('BellHeaven');
    expect(topMatch.category).toBe('Pad');
    expect(topMatch.msb).toBe(0);
    expect(topMatch.lsb).toBe(119);
    expect(topMatch.pc).toBe(88); // 0-based MIDI PC is 88, 1-based screen is 89
  });

  it('輸入 0-119-89 亦同時相容 MIDI 底層 0-based 數值 SuperDarkPad', () => {
    const results = searchYamahaVoices('0-119-89');
    const darkPad = results.find(r => r.name === 'SuperDarkPad');
    expect(darkPad).toBeDefined();
    expect(darkPad?.msb).toBe(0);
    expect(darkPad?.lsb).toBe(119);
    expect(darkPad?.pc).toBe(89);
  });

  it('輸入 0-119 或 0-119- 能列出該 Bank 的所有原廠音色', () => {
    const res1 = searchYamahaVoices('0-119');
    const res2 = searchYamahaVoices('0-119-');
    expect(res1.length).toBe(28);
    expect(res2.length).toBe(28);
    expect(res1.some(r => r.name === 'BellHeaven')).toBe(true);
  });

  it('即使當前分類被限制在 Percussion (如顫音琴)，三聯號查詢 0-119-89 或 0-119-8 仍能穿透檢索出 Pad 音色', () => {
    const results = searchYamahaVoices('0-119-89', 'Percussion');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('BellHeaven');
    expect(results.some(r => r.name === 'SuperDarkPad')).toBe(true);
  });

  it('輸入 0-0-12 (琴端顯示 1-based) 能精確命中 Vibraphone (顫音琴)', () => {
    const results = searchYamahaVoices('0-0-12');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('Vibraphone');
    expect(results[0].category).toBe('Percussion');
    expect(results[0].msb).toBe(0);
    expect(results[0].lsb).toBe(0);
    expect(results[0].pc).toBe(11); // 0-based MIDI PC is 11, 1-based screen is 12
  });

  it('輸入 0-119-88 (MIDI 0-based) 亦能正確搜尋到 BellHeaven', () => {
    const results = searchYamahaVoices('0-119-88');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.name === 'BellHeaven')).toBe(true);
  });

  it('支援空格分隔三聯號格式 "0 119 89"', () => {
    const results = searchYamahaVoices('0 119 89');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('BellHeaven');
  });
});
