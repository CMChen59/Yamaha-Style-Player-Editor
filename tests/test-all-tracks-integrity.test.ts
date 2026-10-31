import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('全軌道與全段落二進位回寫無損性全面檢驗 (All Tracks & All Sections Export Integrity)', () => {
  it('對所有伴奏段落 (Intro, Main, Fill In, Ending, Break) 與 8 大聲部進行全域同步，100% 確保音符零遺失且零跨軌誤刪', () => {
    const origBuf = fs.readFileSync('samples/容易受傷的女人_keyboard.sty');
    const origParsed = YamahaParser.parse(new Uint8Array(origBuf.buffer, origBuf.byteOffset, origBuf.byteLength));

    // 1. 統計原始檔案中所有段落、所有 MIDI 通道的音符分佈基準線
    interface SectionChannelStats {
      section: string;
      channel: number;
      count: number;
    }
    const origStats: Record<string, Record<number, number>> = {};

    for (const sec of origParsed.sections) {
      if (!sec.endTick || sec.endTick <= sec.startTick) continue;
      const secMap: Record<number, number> = {};
      let cur = 0;
      for (const ev of origParsed.tracks[0].events) {
        cur += ev.delta;
        if (cur >= sec.startTick && cur < sec.endTick) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            secMap[ev.channel!] = (secMap[ev.channel!] || 0) + 1;
          }
        }
      }
      origStats[sec.name.toLowerCase()] = secMap;
    }

    console.log('=== 原始 STY 各段落真實 MIDI 音符分佈 ===');
    for (const [secName, map] of Object.entries(origStats)) {
      console.log(`段落 [${secName}]:`, map);
    }

    // 2. 針對「每一個段落」，依序進入該段落並模擬匯出同步
    for (const testSec of origParsed.sections) {
      if (!testSec.endTick || testSec.endTick <= testSec.startTick) continue;

      // 每次測試從全新的 parsed 開始
      const parsed = YamahaParser.parse(new Uint8Array(origBuf.buffer, origBuf.byteOffset, origBuf.byteLength));
      styPlaybackEngine.loadParsed(parsed);
      const ok = styPlaybackEngine.selectSection(testSec.name);
      if (!ok) continue;

      const secNameLower = testSec.name.toLowerCase();
      const casmSecMap = parsed.casmMappings?.[secNameLower]
        || parsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];

      // 執行 8 大聲部全域回寫
      for (let ch = 8; ch <= 15; ch++) {
        const events = styPlaybackEngine.getChannelEvents(ch);
        YamahaStyleModifier.replaceSectionChannelNotes(
          parsed,
          testSec.name,
          ch,
          events
        );
        const vol = styPlaybackEngine.getChannelVolume(ch);
        YamahaStyleModifier.setPartMixing(parsed, ch, { volume: vol });

        if (casmSecMap) {
          for (const [srcStr, dst] of Object.entries(casmSecMap)) {
            if (dst === ch) {
              const srcCh = parseInt(srcStr, 10);
              YamahaStyleModifier.setPartMixing(parsed, srcCh, { volume: vol });
            }
          }
        }
      }

      // 驗證二進位匯出與反向解析
      const exportResult = YamahaWriter.validateAndWrite(parsed);
      expect(exportResult.success).toBe(true);

      const reParsed = YamahaParser.parse(exportResult.bytes);
      const reSec = reParsed.sections.find(s => s.name.toLowerCase() === secNameLower)!;
      expect(reSec).toBeDefined();

      // 統計匯出後該段落的音符
      const afterMap: Record<number, number> = {};
      let cur = 0;
      for (const ev of reParsed.tracks[0].events) {
        cur += ev.delta;
        if (cur >= reSec.startTick && cur < reSec.endTick!) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            afterMap[ev.channel!] = (afterMap[ev.channel!] || 0) + 1;
          }
        }
      }

      // 比對音符分佈：每一軌的音符數必須 100% 完全相符！
      const expectedMap = origStats[secNameLower];
      expect(afterMap).toEqual(expectedMap);
    }

    console.log('✅ 所有段落、所有聲部音符全面檢驗 100% 通過！');
  });
});
