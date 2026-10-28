import { describe, it, expect } from 'vitest';
import {
  findYamahaVoice,
  searchYamahaVoices,
  YAMAHA_SX920_VOICES,
  VOICE_CATEGORIES,
} from '../src/core/data/yamaha-voices';

describe('Yamaha PSR-SX920 音色資料庫與搜尋引擎測試 (Voice DB)', () => {
  it('資料庫包含各大類別與充沛音色數量', () => {
    expect(YAMAHA_SX920_VOICES.length).toBeGreaterThan(40);
    expect(VOICE_CATEGORIES.length).toBeGreaterThan(10);
  });

  it('能精準識別樣品檔案中的 Pad 3 原廠撥弦 (Bank 0-113, PC 75)', () => {
    const voice = findYamahaVoice(0, 113, 75);
    expect(voice).toBeDefined();
    expect(voice?.name).toBe('Pizzicato Strings');
    expect(voice?.category).toBe('Strings');
    expect(voice?.icon).toBe('S809');
  });

  it('能精準識別樣品檔案中的 Pad 1 弦樂 (Bank 8-33, PC 49)', () => {
    const voice = findYamahaVoice(8, 33, 49);
    expect(voice).toBeDefined();
    expect(voice?.name).toBe('Live! Strings');
    expect(voice?.icon).toBe('S809');
  });

  it('能精準識別 Yamaha 旗艦大鋼琴 CFX (Bank 104-1, PC 0)', () => {
    const voice = findYamahaVoice(104, 1, 0);
    expect(voice).toBeDefined();
    expect(voice?.name).toBe('CFX Concert Grand');
    expect(voice?.category).toBe('Piano');
  });

  it('關鍵字搜尋支援英文模糊搜尋', () => {
    const results = searchYamahaVoices('kino');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Kino Strings')).toBe(true);
  });

  it('關鍵字搜尋支援繁體中文搜尋', () => {
    const results = searchYamahaVoices('大三角鋼琴');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.category === 'Piano')).toBe(true);
  });

  it('分類篩選功能正常運作', () => {
    const guitars = searchYamahaVoices('', 'Guitar');
    expect(guitars.length).toBeGreaterThan(50);
    expect(guitars.every(g => g.category === 'Guitar')).toBe(true);
  });

  it('三聯號數字搜尋', () => {
    const results = searchYamahaVoices('0-113-75');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Pizzicato Strings');
  });

  it('資料庫擴充至 2,000+ 完整 Data List 音色', () => {
    expect(YAMAHA_SX920_VOICES.length).toBeGreaterThan(2000);
  });

  it('支援 Multi Pad 推薦篩選 (RECOMMENDED)', () => {
    const recommended = searchYamahaVoices('', 'ALL', 'RECOMMENDED');
    expect(recommended.length).toBeGreaterThan(100);
    expect(recommended.every(r => r.suitability === 'recommended')).toBe(true);
  });

  it('支援 MegaVoice 專利伴奏音色篩選 (MEGAVOICE)', () => {
    const mega = searchYamahaVoices('', 'ALL', 'MEGAVOICE');
    expect(mega.length).toBeGreaterThan(50);
    expect(mega.every(r => r.type === 'MegaVoice')).toBe(true);
  });

  it('支援避坑警示篩選 (WARNING / OrganFlutes)', () => {
    const warnings = searchYamahaVoices('', 'ALL', 'WARNING');
    expect(warnings.length).toBeGreaterThan(20);
    expect(warnings.every(r => r.suitability === 'warning')).toBe(true);
    expect(warnings[0].suitabilityReason).toContain('避坑警示');
  });
});
