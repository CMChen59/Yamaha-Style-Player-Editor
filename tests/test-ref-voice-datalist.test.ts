import { describe, it, expect } from 'vitest';
import {
  searchYamahaVoices,
  VOICE_CATEGORIES,
  getLegacyAliasesForVoice,
  YAMAHA_SX920_VOICES,
} from '../src/core/data/yamaha-voices';

describe('參考手冊 Tab 4: Yamaha PSR-SX920 完整樂器 Data List 檢索與分類驗證', () => {
  it('官方 Data List 應收錄完整 2,395 種原廠音色', () => {
    expect(YAMAHA_SX920_VOICES.length).toBe(2395);
    const all = searchYamahaVoices('', 'ALL', 'ALL');
    expect(all.length).toBe(2395);
  });

  it('支援 16 大樂器分類精準篩選', () => {
    // 驗證常用分類均能獨立篩選
    const pianos = searchYamahaVoices('', 'Piano', 'ALL');
    const basses = searchYamahaVoices('', 'Bass', 'ALL');
    const guitars = searchYamahaVoices('', 'Guitar', 'ALL');
    const strings = searchYamahaVoices('', 'Strings', 'ALL');
    const drums = searchYamahaVoices('', 'Drums', 'ALL');

    expect(pianos.length).toBeGreaterThan(0);
    expect(basses.length).toBeGreaterThan(0);
    expect(guitars.length).toBeGreaterThan(0);
    expect(strings.length).toBeGreaterThan(0);
    expect(drums.length).toBeGreaterThan(0);

    // 驗證篩選出的樂器類別全部相符
    expect(pianos.every((v) => v.category === 'Piano')).toBe(true);
    expect(basses.every((v) => v.category === 'Bass')).toBe(true);
  });

  it('支援中英文名稱與 MSB-LSB-PC 面板三聯號雙向即時檢索', () => {
    // 檢索旗艦鋼琴 CFX (104-21-1)
    const cfx = searchYamahaVoices('104-21-1', 'ALL', 'ALL');
    expect(cfx.length).toBeGreaterThan(0);
    expect(cfx[0].name).toContain('CFX');

    // 檢索 PanPipes (排簫/排笛)
    const pan = searchYamahaVoices('PanPipes', 'ALL', 'ALL');
    expect(pan.length).toBeGreaterThan(0);
    expect(pan[0].name).toBe('PanPipes');
    expect(pan[0].msb).toBe(0);
    expect(pan[0].lsb).toBe(113);
    expect(pan[0].pc).toBe(75);

    // 檢索相容舊碼 (104-1-1 舊碼應對應至 CFX 104-21-1)
    const aliases = getLegacyAliasesForVoice(104, 21, 0, true);
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases).toContain('104-1-1');
  });
});
