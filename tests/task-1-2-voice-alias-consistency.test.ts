import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  YAMAHA_SX920_VOICES,
  LEGACY_VOICE_ALIASES,
  REVERSE_VOICE_ALIASES,
  getLegacyAliasesForVoice,
  resolveYamahaVoiceWithAlias,
  findYamahaVoice,
  searchYamahaVoices,
} from '../src/core/data/yamaha-voices';
import { YAMAHA_SX920_CHORD_VOICES } from '../src/creator/chord-voices';
import { YAMAHA_SX920_BASS_VOICES } from '../src/creator/bass-voices';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { StyPlaybackEngine } from '../src/player/sty-playback-engine';
import { midiManager } from '../src/core/audio/midi-manager';

describe('任務 1-2: PSR-SX920 原廠 2,395 種音色代碼與別名顯示零落差', () => {
  it('1. 雙向別名查找 (LEGACY_VOICE_ALIASES <-> REVERSE_VOICE_ALIASES) 能從 SX920 標準音色反查所有相容舊代碼', () => {
    // CFX Concert Grand: SX920 官方標準 104-21-0 (面板 104-21-1)
    const aliases1Based = getLegacyAliasesForVoice(104, 21, 0, true);
    expect(aliases1Based).toContain('104-1-1');
    expect(aliases1Based).toContain('104-0-1');

    const aliases0Based = getLegacyAliasesForVoice(104, 21, 0, false);
    expect(aliases0Based).toContain('104-1-0');
    expect(aliases0Based).toContain('104-0-0');

    // 驗證所有 LEGACY_VOICE_ALIASES 的目標皆存在於 2,395 原廠資料庫中
    for (const [legacyKey, target] of Object.entries(LEGACY_VOICE_ALIASES)) {
      const exactMatch = YAMAHA_SX920_VOICES.find(
        v => v.msb === target.msb && v.lsb === target.lsb && v.pc === target.pc
      );
      expect(exactMatch, `Alias ${legacyKey} -> ${target.msb}-${target.lsb}-${target.pc} must exist in SX920 DB`).toBeDefined();
      const targetKey = `${target.msb}-${target.lsb}-${target.pc}`;
      expect(REVERSE_VOICE_ALIASES[targetKey]).toContain(legacyKey);
    }
  });

  it('2. resolveYamahaVoiceWithAlias 針對 104-1-0 (面板 104-1-1) 優先回傳 SX920 旗艦面板代碼 104-21-1 並附註相容舊碼', () => {
    const resolved = resolveYamahaVoiceWithAlias(104, 1, 0);
    expect(resolved.voice).toBeDefined();
    expect(resolved.voice?.name).toBe('CFX Concert Grand');
    expect(resolved.msb).toBe(104);
    expect(resolved.lsb).toBe(21);
    expect(resolved.pc).toBe(0);
    expect(resolved.panelCode).toBe('104-21-1');
    expect(resolved.rawMsb).toBe(104);
    expect(resolved.rawLsb).toBe(1);
    expect(resolved.rawPc).toBe(0);
    expect(resolved.rawPanelCode).toBe('104-1-1');
    expect(resolved.isLegacyAlias).toBe(true);
    expect(resolved.legacyCodeLabel).toBe('104-1-1');
    expect(resolved.formattedDisplayWithCode).toContain('CFX Concert Grand');
    expect(resolved.formattedDisplayWithCode).toContain('104-21-1');
    expect(resolved.formattedDisplayWithCode).toContain('相容舊碼 104-1-1');
  });

  it('3. searchYamahaVoices 支援新舊三聯號雙向檢索 (輸入 104-1-1 或 104-21-1 皆置頂命中 CFX Concert Grand)', () => {
    const resLegacy1 = searchYamahaVoices('104-1-1');
    expect(resLegacy1.length).toBeGreaterThan(0);
    expect(resLegacy1[0].name).toBe('CFX Concert Grand');
    expect(resLegacy1[0].msb).toBe(104);
    expect(resLegacy1[0].lsb).toBe(21);
    expect(resLegacy1[0].pc).toBe(0);

    const resCanonical1 = searchYamahaVoices('104-21-1');
    expect(resCanonical1.length).toBeGreaterThan(0);
    expect(resCanonical1[0].name).toBe('CFX Concert Grand');

    // 黃金範本舊版排簫代碼 8-40-76 (1-based) 與 8-40-75 (0-based) 皆能檢索出官方 PanPipes (0-113-75)
    const resPan1 = searchYamahaVoices('8-40-76');
    expect(resPan1.length).toBeGreaterThan(0);
    expect(resPan1[0].name).toBe('PanPipes');
    expect(resPan1[0].msb).toBe(0);
    expect(resPan1[0].lsb).toBe(113);
    expect(resPan1[0].pc).toBe(75);
  });

  it('4. 4006_SX900.T547.sty Main A 的 Chord 1 (Ch 12 / index 11) 解析與發送的 Program Change 100% 一致為 104-21-1', () => {
    const filePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const buf = new Uint8Array(fs.readFileSync(filePath));
    const parsed = YamahaParser.parse(buf, 'STY');

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);
    expect(engine.selectSection('Main A')).toBe(true);

    const chord1Info = engine.getPartVoices().get(11);
    expect(chord1Info).toBeDefined();
    expect(chord1Info?.voiceName).toContain('CFX Concert Grand');
    // UI 與發送的標準代碼必須為 SX920 面板的 104-21-0 (1-based: 104-21-1)
    expect(chord1Info?.msb).toBe(104);
    expect(chord1Info?.lsb).toBe(21);
    expect(chord1Info?.pc).toBe(0);
    expect(chord1Info?.panelCode).toBe('104-21-1');
    // 同時完整保留檔案內的相容舊代碼 104-1-1
    expect(chord1Info?.rawMsb).toBe(104);
    expect(chord1Info?.rawLsb).toBe(1);
    expect(chord1Info?.rawPc).toBe(0);
    expect(chord1Info?.isLegacyAlias).toBe(true);
    expect(chord1Info?.legacyCodeLabel).toBe('104-1-1');

    // 驗證當切換至 MIDI 輸出模式播放時，發送給實體琴的 Program Change 為 104-21-0 (零落差)
    const sentVoices: Array<{ ch: number; voice: { msb: number; lsb: number; pc: number } }> = [];
    const spySendVoice = vi.spyOn(midiManager, 'sendVoiceChange').mockImplementation((ch, v) => {
      sentVoices.push({ ch, voice: v });
    });
    const spyPanic = vi.spyOn(midiManager, 'panicAllChannels').mockImplementation(() => {});
    const spyCC = vi.spyOn(midiManager, 'sendControlChange').mockImplementation(() => {});

    engine.setOutputMode('midi');
    engine.play();
    engine.stop();

    const ch11Sent = sentVoices.find(s => s.ch === 11);
    expect(ch11Sent).toBeDefined();
    expect(ch11Sent?.voice).toEqual({ msb: 104, lsb: 21, pc: 0 });

    spySendVoice.mockRestore();
    spyPanic.mockRestore();
    spyCC.mockRestore();
  });

  it('5. YAMAHA_SX920_CHORD_VOICES 與 YAMAHA_SX920_BASS_VOICES 全數 100% 精確對應官方 2,395 音色庫', () => {
    for (const preset of YAMAHA_SX920_CHORD_VOICES) {
      expect(preset.panelPc).toBe(preset.pc + 1);
      const exact = YAMAHA_SX920_VOICES.find(
        v => v.msb === preset.msb && v.lsb === preset.lsb && v.pc === preset.pc
      );
      expect(
        exact,
        `Chord preset ${preset.id} (${preset.msb}-${preset.lsb}-${preset.pc}) must exist as an exact entry in YAMAHA_SX920_VOICES`
      ).toBeDefined();
    }

    for (const preset of YAMAHA_SX920_BASS_VOICES) {
      expect(preset.panelPc).toBe(preset.pc + 1);
      const found = findYamahaVoice(preset.msb, preset.lsb, preset.pc);
      expect(found).toBeDefined();
      expect(found?.category).toBe('Bass');
    }
  });

  it('6. 全部 2,395 種音色之中文名稱與提示皆為純繁體中文或英文（零簡體字殘留）', () => {
    const simplifiedRegex = /[乐电鸡个两组钟键梦幻声龙驰强闪轻转杆齐卫级缪扬苏兰阶蓝调弯数灵响欧类闭联队开边圆号师钮凯尔图内华丽紧张拨动银鲁摇摆铜渐叠拟诺脉宽长断国劲双纳竖门钢鸣闷扫谣层乌萨乡饱满独迟纯净弹节传体单线朴实艺术贝冲车库续综锯齿络础滤属怀旧带击软胀连迈缓频谱谐贵题镶热涌骑浑无语画气亚云钻兽军绝绿欢见兹变价复荡举讨厌点轮顺锐进运扩农玛雳机兴词极维润关厅赞诗阴间协奋营镲竞争区网远东飞翔荣黄离专优选业经质伞际阳这随发雾时戏肾风跃疯换携稳胶减伙创轨简尘枪叙码却]/;

    for (const v of YAMAHA_SX920_VOICES) {
      expect(simplifiedRegex.test(v.chineseName), `Simplified char found in ${v.name}: ${v.chineseName}`).toBe(false);
      if (v.suitabilityReason) {
        expect(simplifiedRegex.test(v.suitabilityReason), `Simplified char found in reason of ${v.name}: ${v.suitabilityReason}`).toBe(false);
      }
    }

    // 驗證截圖中的 4 款鐘聲音色皆已轉為正統繁體中文
    expect(findYamahaVoice(104, 2, 5)?.chineseName).toBe('DX抒情敘事鐘聲');
    expect(findYamahaVoice(104, 11, 88)?.chineseName).toBe('奇幻鐘聲');
    expect(findYamahaVoice(104, 13, 88)?.chineseName).toBe('烏托邦鐘聲');
    expect(findYamahaVoice(104, 15, 88)?.chineseName).toBe('呼吸鐘聲');
  });
});
