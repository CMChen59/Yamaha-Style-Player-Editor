import { describe, it, expect } from 'vitest';
import { YamahaOtsManager } from '../src/core/writer/ots-manager';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import * as fs from 'fs';
import * as path from 'path';

describe('步驟 3.7: Yamaha OTS 與風格標頭封裝 (OTS & Header Manager)', () => {
  it('1. 能建立原廠推薦之 4 組 OTS 預設資料 (OTS 1~4) 且槽位結構完整', () => {
    const defaultOts = YamahaOtsManager.createDefaultOtsData();
    expect(defaultOts.slots.length).toBe(4);

    // OTS 1 驗證
    const slot1 = defaultOts.slots[0];
    expect(slot1.slotIndex).toBe(1);
    expect(slot1.name).toBe('OTS 1');
    expect(slot1.right1.enabled).toBe(true);
    expect(slot1.right1.voiceName).toBe('CFX Concert Grand');
    expect(slot1.right1.msb).toBe(104);
    expect(slot1.right1.lsb).toBe(1);
    expect(slot1.right1.pc).toBe(0);
    expect(slot1.right2.enabled).toBe(false);

    // OTS 2~4 驗證
    expect(defaultOts.slots[1].right1.voiceName).toBe('Vintage EP');
    expect(defaultOts.slots[2].right1.voiceName).toBe('Sweet! Tenor Sax');
    expect(defaultOts.slots[3].right1.voiceName).toBe('Overdriven Lead');
  });

  it('2. 能將 OTS 資料無損編碼為符合 Yamaha 規範的 OTSc Chunk (4 個 MTrk 結構)', () => {
    const defaultOts = YamahaOtsManager.createDefaultOtsData();
    const chunkBytes = YamahaOtsManager.buildOtsChunk(defaultOts);

    expect(chunkBytes).toBeInstanceOf(Uint8Array);
    expect(chunkBytes.length).toBeGreaterThan(100);

    // 檢查包含 4 個 MTrk 標頭
    let mtrkCount = 0;
    for (let i = 0; i < chunkBytes.length - 4; i++) {
      if (
        chunkBytes[i] === 0x4d && // 'M'
        chunkBytes[i + 1] === 0x54 && // 'T'
        chunkBytes[i + 2] === 0x72 && // 'r'
        chunkBytes[i + 3] === 0x6b // 'k'
      ) {
        mtrkCount++;
      }
    }
    expect(mtrkCount).toBe(4);
  });

  it('3. OTS 二進位往返解析測試 (Round-trip Verification)：編碼後再解析能還原全部聲部與控制參數', () => {
    const customOts = YamahaOtsManager.createDefaultOtsData();
    // 修改 OTS 1 的 Right 2 開啟並設定雙音色
    customOts.slots[0].right2.enabled = true;
    customOts.slots[0].right2.volume = 85;
    customOts.slots[0].right2.octave = 1;
    customOts.slots[0].right2.pan = 75;
    customOts.slots[0].right2.reverb = 60;
    customOts.slots[0].right2.chorus = 25;

    // 修改 OTS 4 參數
    customOts.slots[3].right1.octave = -1;
    customOts.slots[3].right1.volume = 110;

    const chunkBytes = YamahaOtsManager.buildOtsChunk(customOts);
    const parsedOts = YamahaOtsManager.parseOtsChunk(chunkBytes);

    expect(parsedOts.slots.length).toBe(4);

    // 驗證 OTS 1
    const pSlot1 = parsedOts.slots[0];
    expect(pSlot1.slotIndex).toBe(1);
    expect(pSlot1.right1.enabled).toBe(true);
    expect(pSlot1.right1.msb).toBe(104);
    expect(pSlot1.right1.lsb).toBe(1);
    expect(pSlot1.right1.pc).toBe(0);

    // 驗證 OTS 1 的 Right 2 雙音色還原
    expect(pSlot1.right2.enabled).toBe(true);
    expect(pSlot1.right2.volume).toBe(85);
    expect(pSlot1.right2.octave).toBe(1);
    expect(pSlot1.right2.pan).toBe(75);
    expect(pSlot1.right2.reverb).toBe(60);
    expect(pSlot1.right2.chorus).toBe(25);

    // 驗證 OTS 4 八度與音量還原
    const pSlot4 = parsedOts.slots[3];
    expect(pSlot4.right1.octave).toBe(-1);
    expect(pSlot4.right1.volume).toBe(110);
  });

  it('4. 能將 OTS 二進位注入至全新合成 Style 並通過 YamahaWriter 匯出與驗證', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({ styleName: 'Test OTS Style', bpm: 128 });
    const defaultOts = YamahaOtsManager.createDefaultOtsData();

    // 注入 OTS
    YamahaOtsManager.injectOrUpdateOts(style, defaultOts);
    expect(style.hasOts).toBe(true);
    expect(style.customChunks.some(c => c.id.trim() === 'OTSc')).toBe(true);

    // 寫入二進位並反向驗證
    const exportResult = YamahaWriter.validateAndWrite(style);
    expect(exportResult.success).toBe(true);

    // 重新用 YamahaParser 解析輸出的二進位
    const reParsed = YamahaParser.parse(exportResult.bytes, 'STY');
    expect(reParsed.hasOts).toBe(true);

    const reExtractedOts = YamahaOtsManager.extractOtsFromParsed(reParsed);
    expect(reExtractedOts.slots.length).toBe(4);
    expect(reExtractedOts.slots[0].right1.voiceName).toBe('CFX Concert Grand');
  });

  it('5. 能讀取並更新風格標頭中繼資料 (Style Title, BPM, TimeSignature, Copyright)', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({ styleName: 'Initial Name', bpm: 110 });

    const initialHeader = YamahaOtsManager.extractStyleHeader(style);
    expect(initialHeader.title).toBe('Initial Name');
    expect(initialHeader.bpm).toBe(110);

    // 更新標頭
    YamahaOtsManager.updateStyleHeader(style, {
      title: 'Golden 80s Disco',
      bpm: 126,
      copyright: 'Copyright (C) 2026 Producer',
    });

    const updatedHeader = YamahaOtsManager.extractStyleHeader(style);
    expect(updatedHeader.title).toBe('Golden 80s Disco');
    expect(updatedHeader.bpm).toBe(126);
    expect(updatedHeader.copyright).toBe('Copyright (C) 2026 Producer');

    // 匯出二進位驗證
    const bytes = YamahaWriter.write(style);
    const reParsed = YamahaParser.parse(bytes, 'STY');
    expect(reParsed.bpm).toBe(126);
    const reHeader = YamahaOtsManager.extractStyleHeader(reParsed);
    expect(reHeader.title).toBe('Golden 80s Disco');
    expect(reHeader.copyright).toBe('Copyright (C) 2026 Producer');
  });

  it('6. 能對真實樣品 (4006_SX900.T547.sty) 注入 OTS 與更新風格標頭並成功匯出', () => {
    const samplePath = path.resolve(__dirname, '../samples/4006_SX900.T547.sty');
    if (!fs.existsSync(samplePath)) return;

    const fileBuf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(fileBuf), 'STY');

    // 原樣品無 OTS
    expect(parsed.hasOts).toBe(false);

    // 注入搖滾樂風 OTS 範本
    const rockPreset = YamahaOtsManager.getGenrePresets().find(p => p.id === 'ROCK')!;
    YamahaOtsManager.injectOrUpdateOts(parsed, { slots: rockPreset.slots });
    expect(parsed.hasOts).toBe(true);

    // 更新標題
    YamahaOtsManager.updateStyleHeader(parsed, {
      title: '4006 Rock Remix',
      copyright: '2026 Yamaha Arranger Master',
    });

    // 匯出二進位
    const result = YamahaWriter.validateAndWrite(parsed);
    expect(result.success).toBe(true);

    // 反向解析驗證
    const reParsed = YamahaParser.parse(result.bytes, 'STY');
    expect(reParsed.hasOts).toBe(true);
    expect(reParsed.hasCasm).toBe(true);

    const ots = YamahaOtsManager.extractOtsFromParsed(reParsed);
    expect(ots.slots[0].right1.voiceName).toBe('Steel Guitar');
    expect(ots.slots[1].right1.voiceName).toBe('Overdriven Guitar');
  });
});
