import { describe, it, expect } from 'vitest';
import { YamahaStyleSynthesizer } from '../src/core/writer/style-synthesizer';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { StyleRemixer } from '../src/core/writer/style-remixer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { resolveAuditionInstrumentId } from '../src/core/data/yamaha-voices';

describe('Phase 4.1: YamahaStyleModifier 伴奏風格 8 聲部混音與音色修改引擎', () => {
  it('能即時修改 STY 聲部的音量、聲相、殘響與合唱參數，並同步至 Track 0 事件與 rawChunk', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'Test Style',
    });

    // 1. 修改 Bass 聲部 (Channel 10) 的混音參數
    const success = YamahaStyleModifier.setPartMixing(style, 10, {
      volume: 115,
      pan: 32, // L32
      reverb: 55,
      chorus: 20,
    });

    expect(success).toBe(true);

    // 驗證 parsed.parts 是否更新
    const bassPart = style.parts.find((p) => p.channel === 10);
    expect(bassPart?.volume).toBe(115);
    expect(bassPart?.pan).toBe(32);
    expect(bassPart?.reverb).toBe(55);
    expect(bassPart?.chorus).toBe(20);

    // 驗證 Track 0 開頭事件是否同步更新
    const events = style.tracks[0].events;
    const volEv = events.find((e) => e.type === 'controlChange' && e.channel === 10 && e.controller === 7);
    const panEv = events.find((e) => e.type === 'controlChange' && e.channel === 10 && e.controller === 10);
    const revEv = events.find((e) => e.type === 'controlChange' && e.channel === 10 && e.controller === 91);
    const choEv = events.find((e) => e.type === 'controlChange' && e.channel === 10 && e.controller === 93);

    expect(volEv?.value).toBe(115);
    expect(panEv?.value).toBe(32);
    expect(revEv?.value).toBe(55);
    expect(choEv?.value).toBe(20);

    // 驗證二進位序列化與回讀雙向相容
    const bytes = YamahaStyleSynthesizer.serializeToStyleFile(style);
    const reparsed = YamahaParser.parse(bytes, 'STY');
    const reparsedBass = reparsed.parts.find((p) => p.channel === 10);
    expect(reparsedBass?.volume).toBe(115);
    expect(reparsedBass?.pan).toBe(32);
    expect(reparsedBass?.reverb).toBe(55);
    expect(reparsedBass?.chorus).toBe(20);
  });

  it('能即時更換 STY 聲部的音色 (Bank MSB/LSB/PC)，且對鼓組聲部執行 Bank MSB 127 強制保護', () => {
    const style = YamahaStyleSynthesizer.createBlankStyle({
      styleName: 'Test Style',
    });

    // 1. 更換 Chord 1 (Channel 11) 為 Grand Piano (Bank 0-112, PC 0)
    YamahaStyleModifier.setPartMixing(style, 11, {
      bankMsb: 0,
      bankLsb: 112,
      programChange: 0,
    });
    const chord1 = style.parts.find((p) => p.channel === 11);
    expect(chord1?.bankMsb).toBe(0);
    expect(chord1?.bankLsb).toBe(112);
    expect(chord1?.programChange).toBe(0);

    // 2. 測試鼓組聲部 (Channel 9, Rhythm 2)：若傳入 bankMsb = 0，自動防護強制鎖定為 127
    YamahaStyleModifier.setPartMixing(style, 9, {
      bankMsb: 0, // 嘗試設為 0
      bankLsb: 0,
      programChange: 8, // Room Kit
    });
    const drumPart = style.parts.find((p) => p.channel === 9);
    expect(drumPart?.bankMsb).toBe(127); // 強制保護
    expect(drumPart?.programChange).toBe(8);

    // 驗證 Track 0 中的 PC 與 CC 0
    const events = style.tracks[0].events;
    const drumPc = events.find((e) => e.type === 'programChange' && e.channel === 9);
    const drumMsb = events.find((e) => e.type === 'controlChange' && e.channel === 9 && e.controller === 0);
    expect(drumPc?.program).toBe(8);
    expect(drumMsb?.value).toBe(127);
  });

  it('能正確更新真實 STY 伴奏中的音色 (包含各段落內部的 Program Change 與 Bank 事件)', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const realSty = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');

    // Intro A 的範圍是 276480 ~ 353280
    const introRange = StyleRemixer.getSectionTickRange(realSty, 'Intro A');
    expect(introRange).not.toBeNull();

    // 檢查更換前的 Pad (Channel 4, 即 Ch 5)：原始 PC 為 49 (Live! Strings)
    const beforeOverride = StyleRemixer.getSectionChannelOverride(realSty, introRange!.startTick, introRange!.endTick, 4);
    expect(beforeOverride.pc).toBe(49);

    // 更換 Channel 4 音色為 Flute (Bank 0-112, PC 73)
    const ok = YamahaStyleModifier.setPartMixing(realSty, 4, {
      bankMsb: 0,
      bankLsb: 112,
      programChange: 73,
    });
    expect(ok).toBe(true);

    // 驗證 parsed.parts 已更新
    const padPart = realSty.parts.find((p) => p.channel === 4);
    expect(padPart?.programChange).toBe(73);
    expect(padPart?.bankMsb).toBe(0);
    expect(padPart?.bankLsb).toBe(112);

    // 驗證 Intro A 內部的 override PC 已被更新為 73，不再殘留舊的 49
    const afterOverride = StyleRemixer.getSectionChannelOverride(realSty, introRange!.startTick, introRange!.endTick, 4);
    expect(afterOverride.pc).toBe(73);
    expect(afterOverride.bankMsb).toBe(0);
    expect(afterOverride.bankLsb).toBe(112);

    // 驗證所有 Track 0 上的 PC 事件在 Ch 4 均已變成 73
    let cur = 0;
    const ch4PcEvents: number[] = [];
    for (const ev of realSty.tracks[0].events) {
      cur += ev.delta;
      if (ev.type === 'programChange' && ev.channel === 4) {
        ch4PcEvents.push(ev.program);
      }
    }
    expect(ch4PcEvents.length).toBeGreaterThanOrEqual(2);
    expect(ch4PcEvents.every((p) => p === 73)).toBe(true);
  });

  it('支援針對單一伴奏段落 (如 Intro A) 進行專屬音色與混音覆寫 (Section-Specific Revoicing)', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const realSty = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');

    const introRange = StyleRemixer.getSectionTickRange(realSty, 'Intro A');
    const mainARange = StyleRemixer.getSectionTickRange(realSty, 'Main A');

    // 僅在 Intro A 中將 Channel 4 (Pad) 改為 PC 25 (Steel Guitar)
    const ok = YamahaStyleModifier.setPartMixing(
      realSty,
      4,
      {
        bankMsb: 0,
        bankLsb: 112,
        programChange: 25,
      },
      { targetSection: 'Intro A' }
    );
    expect(ok).toBe(true);

    // Intro A 內的 override 應為 25
    const introOverride = StyleRemixer.getSectionChannelOverride(realSty, introRange!.startTick, introRange!.endTick, 4);
    expect(introOverride.pc).toBe(25);

    // Track 0 開頭 (Main A 繼承的初始設定) 依然保持原始設定 (PC 49)
    const mainAOverride = StyleRemixer.getSectionChannelOverride(realSty, mainARange!.startTick, mainARange!.endTick, 4);
    // Main A 沒有內部 override，繼承初始設定 49
    expect(mainAOverride.pc).toBeUndefined();
    const padPart = realSty.parts.find((p) => p.channel === 4);
    expect(padPart?.programChange).toBe(25); // part 本身記錄最新狀態
  });

  it('Ch 8 (Ch 9, Sub Rhythm) 允許旋律音色 (如跳躍撥弦 Pizzicato / 鋼琴 / 長笛)，不被強制鎖定為鼓組 MSB 127', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const realSty = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');

    // 1. 驗證 4006 原檔中的 Ch 8 (Sub Rhythm, 螢幕顯示 Ch 9)：
    // 原檔為 Bank 0-113, PC 75 (跳躍撥弦 Pizzicato Strings)，演奏音符 71, 74, 75 等高音旋律跑動
    const resOrig = resolveAuditionInstrumentId(0, 113, 75, 8);
    expect(resOrig.isDrum).toBe(false);
    expect(resOrig.instrumentId).toBe('pizzicato');

    // 2. 將 Ch 8 更換為長笛 (Sweet! Flute, Bank 0-112, PC 73)
    const ok = YamahaStyleModifier.setPartMixing(realSty, 8, {
      bankMsb: 0,
      bankLsb: 112,
      programChange: 73,
    });
    expect(ok).toBe(true);

    const ch8Part = realSty.parts.find((p) => p.channel === 8);
    // Bank MSB 應保持為 0，不可被錯誤的鼓組保護強制修改為 127
    expect(ch8Part?.bankMsb).toBe(0);
    expect(ch8Part?.bankLsb).toBe(112);
    expect(ch8Part?.programChange).toBe(73);

    // 3. 驗證試聽模型精準解析為長笛 (Flute)，而非打擊樂器鼓組
    const resFlute = resolveAuditionInstrumentId(ch8Part!.bankMsb!, ch8Part!.bankLsb!, ch8Part!.programChange!, 8);
    expect(resFlute.isDrum).toBe(false);
    expect(resFlute.instrumentId).toBe('flute');

    // 4. 對照測試：真正的鼓組聲部 Ch 9 (螢幕顯示 Ch 10, Main Rhythm)
    // 若設定為標準鼓組 (127-0-0)
    const resDrum = resolveAuditionInstrumentId(127, 0, 0, 9);
    expect(resDrum.isDrum).toBe(true);
    expect(resDrum.instrumentId).toBe('standard-drum-kit');
  });

  it('步驟 3.2: 能在指定伴奏段落 (Intro A) 中更新單音 (音高/力度/位置/長度) 並無損寫入 Track 0', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');

    const range = StyleRemixer.getSectionTickRange(parsed, 'Intro A');
    expect(range).not.toBeNull();

    // 取 Channel 8 (Sub Rhythm, PC 75 跳躍撥弦)
    const origNotes = StyleRemixer.extractSectionChannelNotes(parsed, range!.startTick, range!.endTick, 8);
    expect(origNotes.length).toBeGreaterThan(0);
    const firstNote = origNotes[0];

    // 更新第一個音符：音高 +2 半音 (70 -> 72), 力度設為 110, 時長拉長 100 ticks
    const target = {
      note: firstNote.note,
      startTick: firstNote.startTick,
      oldDurationTick: firstNote.durationTick,
    };

    const ok = YamahaStyleModifier.updateSectionNote(parsed, 'Intro A', 8, target, {
      note: firstNote.note + 2,
      velocity: 110,
      durationTick: firstNote.durationTick + 100,
    });
    expect(ok).toBe(true);

    // 重新提取驗證
    const updatedNotes = StyleRemixer.extractSectionChannelNotes(parsed, range!.startTick, range!.endTick, 8);
    const updatedFirst = updatedNotes.find(
      (n) => Math.abs(n.startTick - firstNote.startTick) <= 12 && n.note === firstNote.note + 2
    );
    expect(updatedFirst).toBeDefined();
    expect(updatedFirst!.note).toBe(firstNote.note + 2);
    expect(updatedFirst!.velocity).toBe(110);
    expect(updatedFirst!.durationTick).toBe(firstNote.durationTick + 100);
  });

  it('步驟 3.2: 能在指定伴奏段落 (Intro A) 中新增、刪除單音與批次刪除音符', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');
    const range = StyleRemixer.getSectionTickRange(parsed, 'Intro A')!;

    const beforeNotes = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, 8);
    const countBefore = beforeNotes.length;

    // 1. 新增音符在第 1 小節第 1 拍 (tick 0)
    const addOk = YamahaStyleModifier.addSectionNote(parsed, 'Intro A', 8, {
      note: 60, // C4
      startTick: 0,
      durationTick: 480,
      velocity: 96,
    });
    expect(addOk).toBe(true);

    const afterAdd = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, 8);
    expect(afterAdd.length).toBe(countBefore + 1);
    const added = afterAdd.find((n) => n.note === 60 && n.startTick === 0);
    expect(added).toBeDefined();
    expect(added!.velocity).toBe(96);
    expect(added!.durationTick).toBe(480);

    // 2. 刪除該新增音符
    const delOk = YamahaStyleModifier.deleteSectionNote(parsed, 'Intro A', 8, {
      note: 60,
      startTick: 0,
      oldDurationTick: 480,
    });
    expect(delOk).toBe(true);

    const afterDel = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, 8);
    expect(afterDel.length).toBe(countBefore);
  });

  it('步驟 3.2: 能為指定伴奏段落聲部執行一鍵移調 (+/- 12) 與網格節奏量化 (Quantize)', () => {
    const fs = require('fs');
    const path = require('path');
    const sampleStyPath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
    const sampleStyBuffer = fs.readFileSync(sampleStyPath);
    const parsed = YamahaParser.parse(new Uint8Array(sampleStyBuffer), 'STY');
    const range = StyleRemixer.getSectionTickRange(parsed, 'Main A')!;

    // 取 Channel 1 (Bass)
    const bassBefore = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, 1);
    expect(bassBefore.length).toBeGreaterThan(0);
    const minNoteBefore = Math.min(...bassBefore.map((n) => n.note));

    // 1. 全軌 Bass 升八度 (+12)
    const shiftRes = YamahaStyleModifier.shiftSectionOctave(parsed, 'Main A', 1, 1);
    expect(shiftRes.success).toBe(true);
    expect(shiftRes.shiftedCount).toBe(bassBefore.length);

    const bassAfterShift = StyleRemixer.extractSectionChannelNotes(parsed, range.startTick, range.endTick, 1);
    const minNoteAfter = Math.min(...bassAfterShift.map((n) => n.note));
    expect(minNoteAfter).toBe(minNoteBefore + 12);

    // 2. 節奏量化至 1/8 網格
    const qRes = YamahaStyleModifier.quantizeSectionTrack(parsed, 'Main A', 1, '1/8');
    expect(qRes.success).toBe(true);
    expect(qRes.quantizedCount).toBeGreaterThan(0);
  });
});







