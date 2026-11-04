import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  findYamahaVoice,
  searchYamahaVoices,
  YAMAHA_SX920_VOICES,
  VOICE_CATEGORIES,
  type VoiceCategory,
} from '../src/core/data/yamaha-voices';

describe('任務 1-4: Yamaha PSR-SX920 官方 2,478 行音色資料庫一致性校驗', () => {
  const voiceTxtPath = path.resolve(__dirname, '../docs/references/psr-sx920/Yamaha_PSR-SX920_VoiceList.txt');

  it('官方 VoiceList.txt 文件存在且具備 2,478 行原廠音色腳本', () => {
    expect(fs.existsSync(voiceTxtPath)).toBe(true);
    const content = fs.readFileSync(voiceTxtPath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2400);
  });

  it('資料庫應 100% 完整覆蓋官方 VoiceList.txt 全部 2,395 種原廠樂器', () => {
    const content = fs.readFileSync(voiceTxtPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const officialEntries: Array<{ pc: number; msb: number; lsb: number; rawName: string }> = [];

    const pattern = /\[p[23],\s*(\d+),\s*(\d+),\s*(\d+)\](.*)/;
    for (const line of lines) {
      const match = line.trim().match(pattern);
      if (match) {
        officialEntries.push({
          pc: parseInt(match[1], 10),
          msb: parseInt(match[2], 10),
          lsb: parseInt(match[3], 10),
          rawName: match[4].trim(),
        });
      }
    }

    expect(officialEntries.length).toBe(2395);
    expect(YAMAHA_SX920_VOICES.length).toBe(2395);

    // 驗證每一個原廠三聯號皆可被 findYamahaVoice 精準解析，缺漏率必須為 0！
    let missingCount = 0;
    const missingKeys: string[] = [];
    for (const entry of officialEntries) {
      const found = findYamahaVoice(entry.msb, entry.lsb, entry.pc);
      if (!found) {
        missingCount++;
        missingKeys.push(`${entry.msb}-${entry.lsb}-${entry.pc} (${entry.rawName})`);
      }
    }

    expect(missingCount).toBe(0);
    expect(missingKeys).toEqual([]);
  });

  it('官方音色前綴與 Type 欄位保持 100% 一致性 (S.Art!, Live!, Sweet!, Cool!, MegaVoice)', () => {
    // 抽樣驗證各官方旗艦超音色類別
    const cfx = findYamahaVoice(104, 21, 0); // S.Art CFX ConcertGrand
    expect(cfx).toBeDefined();
    expect(cfx?.type).toBe('S.Art!');
    expect(cfx?.category).toBe('Piano');

    const suitcase = findYamahaVoice(8, 41, 20); // S.Art 70sSuitcaseClean
    expect(suitcase).toBeDefined();
    expect(suitcase?.type).toBe('S.Art!');
    expect(suitcase?.category).toBe('E.Piano');

    const seattle = findYamahaVoice(8, 33, 49); // S.Art SeattleStrings
    expect(seattle).toBeDefined();
    expect(seattle?.type).toBe('S.Art!');
    expect(seattle?.category).toBe('Strings');

    const txWarm = findYamahaVoice(104, 12, 5); // Cool! TX Warm
    expect(txWarm).toBeDefined();
    expect(txWarm?.type).toBe('Cool!');

    const goldenTrumpet = findYamahaVoice(0, 122, 56); // Sweet! GoldenTrumpet2
    expect(goldenTrumpet).toBeDefined();
    expect(goldenTrumpet?.type).toBe('Sweet!');

    const megaNylon = findYamahaVoice(8, 0, 0); // MegaVoice NylonGuitar
    expect(megaNylon).toBeDefined();
    expect(megaNylon?.type).toBe('MegaVoice');
    expect(megaNylon?.category).toBe('Guitar');
  });

  it('全部 2,395 種音色皆具備繁體中文說明且分類合規', () => {
    const validCategories = new Set<VoiceCategory>([
      'Piano', 'E.Piano', 'Organ', 'Accordion', 'Guitar', 'Bass',
      'Strings', 'Brass', 'Saxophone', 'Woodwind', 'Synth', 'Pad',
      'Choir', 'Drums', 'Percussion', 'Legacy',
    ]);

    for (const voice of YAMAHA_SX920_VOICES) {
      expect(voice.id).toBeTruthy();
      expect(voice.name).toBeTruthy();
      expect(voice.chineseName).toBeTruthy();
      expect(validCategories.has(voice.category)).toBe(true);
      expect(voice.icon).toMatch(/^S80[1-9]|S810$/);
    }
  });

  it('歷史與前代三聯號別名對照表 (Legacy Triplet Aliases) 保持完美向下相容', () => {
    // 早期手寫草案 104-1-0 應自動指向官方正式 104-21-0 CFX Concert Grand
    const legacyCfx = findYamahaVoice(104, 1, 0);
    expect(legacyCfx).toBeDefined();
    expect(legacyCfx?.name).toContain('CFX');
    expect(legacyCfx?.msb).toBe(104);
    expect(legacyCfx?.lsb).toBe(21);
    expect(legacyCfx?.pc).toBe(0);

    // 早期 104-0-48 應指向 Kino Strings (104-19-48)
    const legacyKino = findYamahaVoice(104, 0, 48);
    expect(legacyKino).toBeDefined();
    expect(legacyKino?.name).toBe('Kino Strings');

    // 早期 104-1-1 應指向 Pop Grand (104-11-0)
    const legacyPop = findYamahaVoice(104, 1, 1);
    expect(legacyPop).toBeDefined();
    expect(legacyPop?.name).toContain('PopGrand');
  });
});
