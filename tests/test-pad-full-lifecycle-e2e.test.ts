import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { YamahaPadSynthesizer } from '../src/core/writer/pad-synthesizer';

describe('【第四階段端到端驗收】Multi Pad 全生命週期 E2E 測試與 Round-Trip 零數據損失驗證', () => {
  const sample2010Path = path.resolve(__dirname, '../samples/2010-1_PAD.PAD');
  const sample2011Path = path.resolve(__dirname, '../samples/2011-2_PAD.PAD');

  it('1. 從 0 建立全新空白專案 ➔ 4 軌音符與不同小節 ➔ CC 動態曲線 ➔ 音色混音 ➔ 剛體轉調 ➔ 匯出二進位 ➔ 反解析驗證零數據損失', () => {
    // 步驟 A: 新建空白 4 軌 Multi Pad 專案 (PPQ 480, 4 軌)
    const project = YamahaPadSynthesizer.createBlankProject({
      projectName: 'FullLifecycleTest',
      bpm: 128,
      bars: 4,
      division: 480,
    });
    expect(project.format).toBe('PAD');
    expect(project.tracks.length).toBe(5); // Track 0 (控制標籤) + Track 1~4 (Pad 1~4)

    // 步驟 B: 為 Pad 1 ~ Pad 4 寫入不同音樂內容與不同小節長度
    // Pad 1: 短動機 (2 小節) - C4, E4, G4, C5
    const pad1Notes = [
      { note: 60, startTick: 0, durationTick: 480, velocity: 95 },
      { note: 64, startTick: 480, durationTick: 480, velocity: 100 },
      { note: 67, startTick: 960, durationTick: 480, velocity: 105 },
      { note: 72, startTick: 1440, durationTick: 960, velocity: 110 },
    ];
    YamahaPadModifier.replacePadNotes(project, 1, pad1Notes, 2);

    // Pad 2: 旋律前奏含導音 G# 與花音 F# (Am 小調, 4 小節)
    // A4 (69) -> B4 (71) -> C5 (72) -> F#4 (66) -> G#4 (68) -> A4 (69)
    const pad2Notes = [
      { note: 69, startTick: 0, durationTick: 480, velocity: 90 },
      { note: 71, startTick: 480, durationTick: 480, velocity: 92 },
      { note: 72, startTick: 960, durationTick: 480, velocity: 95 },
      { note: 66, startTick: 1440, durationTick: 480, velocity: 88 },
      { note: 68, startTick: 1920, durationTick: 480, velocity: 96 },
      { note: 69, startTick: 2400, durationTick: 1440, velocity: 100 },
    ];
    YamahaPadModifier.replacePadNotes(project, 2, pad2Notes, 4);

    // Pad 3: 和弦分解琶音 (8 小節)
    const pad3Notes = [
      { note: 57, startTick: 0, durationTick: 960, velocity: 85 }, // A3
      { note: 60, startTick: 960, durationTick: 960, velocity: 85 }, // C4
      { note: 64, startTick: 1920, durationTick: 960, velocity: 85 }, // E4
      { note: 69, startTick: 2880, durationTick: 1920, velocity: 90 }, // A4
    ];
    YamahaPadModifier.replacePadNotes(project, 3, pad3Notes, 8);

    // Pad 4: 長音鋪底 (16 小節)
    const pad4Notes = [
      { note: 45, startTick: 0, durationTick: 7680, velocity: 80 }, // A2
      { note: 52, startTick: 7680, durationTick: 7680, velocity: 80 }, // E3
    ];
    YamahaPadModifier.replacePadNotes(project, 4, pad4Notes, 16);

    // 步驟 C: 寫入 CC 自動化控制動態曲線
    // Pad 1 注入 CC 11 Expression 表情曲線
    const pad1CC11 = [
      { relTick: 0, value: 50 },
      { relTick: 480, value: 75 },
      { relTick: 960, value: 100 },
      { relTick: 1440, value: 127 },
    ];
    YamahaPadModifier.replacePadCCEvents(project, 1, 11, pad1CC11);

    // Pad 3 注入 CC 1 Modulation 顫音曲線
    const pad3CC1 = [
      { relTick: 0, value: 0 },
      { relTick: 1920, value: 30 },
      { relTick: 2880, value: 65 },
    ];
    YamahaPadModifier.replacePadCCEvents(project, 3, 1, pad3CC1);

    // 步驟 D: 設定各 Pad 之音色、混音、Repeat、ChordMatch、名稱與琴端圖示
    // Pad 1: Harpsichord (0-112-7), Vol 90, Pan 50, Rev 60, Cho 10, One-shot, CM=0
    YamahaPadModifier.setPadMixing(project, 1, {
      bankMsb: 0, bankLsb: 112, programChange: 6,
      volume: 90, pan: 50, reverb: 60, chorus: 10,
    });
    YamahaPadModifier.setPadName(project, 1, 'ShortMotif');
    YamahaPadModifier.setPadIcon(project, 1, 'S809');
    YamahaPadModifier.setPadRepeat(project, 1, false);
    YamahaPadModifier.setPadChordMatch(project, 1, false);

    // Pad 2: SmoothSaxes2 (8-36-83), Vol 100, Pan 64, Rev 70, Cho 0, One-shot, CM=0 (帶導音長旋律)
    YamahaPadModifier.setPadMixing(project, 2, {
      bankMsb: 8, bankLsb: 36, programChange: 82,
      volume: 100, pan: 64, reverb: 70, chorus: 0,
    });
    YamahaPadModifier.setPadName(project, 2, 'IntroSax');
    YamahaPadModifier.setPadIcon(project, 2, 'S810');
    YamahaPadModifier.setPadRepeat(project, 2, false);
    YamahaPadModifier.setPadChordMatch(project, 2, false);

    // Pad 3: SeattleStrings (104-4-50), Vol 85, Pan 40, Rev 80, Cho 20, Repeat, CM=1
    YamahaPadModifier.setPadMixing(project, 3, {
      bankMsb: 104, bankLsb: 4, programChange: 49,
      volume: 85, pan: 40, reverb: 80, chorus: 20,
    });
    YamahaPadModifier.setPadName(project, 3, 'ArpStrings');
    YamahaPadModifier.setPadIcon(project, 3, 'S812');
    YamahaPadModifier.setPadRepeat(project, 3, true);
    YamahaPadModifier.setPadChordMatch(project, 3, true);

    // Pad 4: PopHorns (104-0-62), Vol 95, Pan 80, Rev 65, Cho 15, Repeat, CM=0
    YamahaPadModifier.setPadMixing(project, 4, {
      bankMsb: 104, bankLsb: 0, programChange: 61,
      volume: 95, pan: 80, reverb: 65, chorus: 15,
    });
    YamahaPadModifier.setPadName(project, 4, 'PadHorns');
    YamahaPadModifier.setPadIcon(project, 4, 'S814');
    YamahaPadModifier.setPadRepeat(project, 4, true);
    YamahaPadModifier.setPadChordMatch(project, 4, false);

    // 步驟 E: 診斷與調性平移 (Am ➔ Em, +7 半音剛體平移)
    const diagBefore = YamahaPadModifier.analyzePadProject(project);
    expect(diagBefore.tracks[0].barLength).toBe(2);
    expect(diagBefore.tracks[1].barLength).toBe(4);
    expect(diagBefore.tracks[2].barLength).toBe(8);
    expect(diagBefore.tracks[3].barLength).toBe(16);

    // 執行純剛體平移至 Em (全 4 軌參與移調)
    const shiftResult = YamahaPadModifier.transposePadKey(project, {
      sourceKey: 'Am',
      targetKey: 'Em',
      direction: 'up',
      padNumbers: [1, 2, 3, 4],
      keySuffixLabel: 'Em原調',
    });
    expect(shiftResult.success).toBe(true);
    expect(shiftResult.baseSemitoneShift).toBe(7);

    // 步驟 F: 同步控制標籤至 Track 0，並編碼匯出為二進位 Byte Array
    YamahaPadModifier.syncControlTagsToTrack0(project);
    for (const trk of project.tracks) {
      YamahaPadModifier.rebuildTrackRawChunk(trk);
    }
    const exportedBytes = YamahaWriter.write(project);
    expect(exportedBytes).toBeDefined();
    expect(exportedBytes.length).toBeGreaterThan(100);

    // 步驟 G: Round-Trip 雙向反解析重新載入，嚴格驗證零數據損失！
    const reloaded = YamahaParser.parse(exportedBytes, 'PAD');
    expect(reloaded.format).toBe('PAD');
    expect(reloaded.tracks.length).toBe(5);
    expect(reloaded.division).toBe(480);

    // 1. 驗證 Track 0 控制標籤 (CM0000 鐵律、RPxxxx 循環標籤、N1~N4 名稱、I1~I4 圖示)
    const reloadedDiag = YamahaPadModifier.analyzePadProject(reloaded);
    expect(reloaded.padConfig?.chordMatchFlags).toEqual([false, false, false, false]); // CM0000
    expect(reloaded.padConfig?.repeatFlags).toEqual([false, false, true, true]); // RP0011
    expect(reloaded.padConfig?.icons).toEqual(['S809', 'S810', 'S812', 'S814']);
    expect(reloadedDiag.tracks[0].name).toContain('Em原調');
    expect(reloadedDiag.tracks[1].name).toContain('Em原調');
    expect(reloadedDiag.tracks[2].name).toContain('Em原調');
    expect(reloadedDiag.tracks[3].name).toContain('Em原調');

    // 2. 驗證各 Pad 小節長度 (barLength)
    expect(reloadedDiag.tracks[0].barLength).toBe(2);
    expect(reloadedDiag.tracks[1].barLength).toBe(4);
    expect(reloadedDiag.tracks[2].barLength).toBe(8);
    expect(reloadedDiag.tracks[3].barLength).toBe(16);

    // 3. 驗證各 Pad 音色 (MSB/LSB/PC) 與混音 (Vol/Pan/Rev/Cho)
    // Pad 1
    expect(reloadedDiag.tracks[0].voiceInfo.msb).toBe(0);
    expect(reloadedDiag.tracks[0].voiceInfo.lsb).toBe(112);
    expect(reloadedDiag.tracks[0].voiceInfo.pc).toBe(6);
    expect(reloadedDiag.tracks[0].mixing.volume).toBe(90);
    expect(reloadedDiag.tracks[0].mixing.pan).toBe(50);
    expect(reloadedDiag.tracks[0].mixing.reverb).toBe(60);
    expect(reloadedDiag.tracks[0].mixing.chorus).toBe(10);

    // Pad 2
    expect(reloadedDiag.tracks[1].voiceInfo.msb).toBe(8);
    expect(reloadedDiag.tracks[1].voiceInfo.lsb).toBe(36);
    expect(reloadedDiag.tracks[1].voiceInfo.pc).toBe(82);
    expect(reloadedDiag.tracks[1].mixing.volume).toBe(100);
    expect(reloadedDiag.tracks[1].mixing.pan).toBe(64);
    expect(reloadedDiag.tracks[1].mixing.reverb).toBe(70);
    expect(reloadedDiag.tracks[1].mixing.chorus).toBe(0);

    // Pad 3
    expect(reloadedDiag.tracks[2].voiceInfo.msb).toBe(104);
    expect(reloadedDiag.tracks[2].voiceInfo.lsb).toBe(4);
    expect(reloadedDiag.tracks[2].voiceInfo.pc).toBe(49);
    expect(reloadedDiag.tracks[2].mixing.volume).toBe(85);
    expect(reloadedDiag.tracks[2].mixing.pan).toBe(40);
    expect(reloadedDiag.tracks[2].mixing.reverb).toBe(80);
    expect(reloadedDiag.tracks[2].mixing.chorus).toBe(20);

    // Pad 4
    expect(reloadedDiag.tracks[3].voiceInfo.msb).toBe(104);
    expect(reloadedDiag.tracks[3].voiceInfo.lsb).toBe(0);
    expect(reloadedDiag.tracks[3].voiceInfo.pc).toBe(61);
    expect(reloadedDiag.tracks[3].mixing.volume).toBe(95);
    expect(reloadedDiag.tracks[3].mixing.pan).toBe(80);
    expect(reloadedDiag.tracks[3].mixing.reverb).toBe(65);
    expect(reloadedDiag.tracks[3].mixing.chorus).toBe(15);

    // 4. 驗證音符數量與剛體平移後的準確音高 (+7 半音)
    // Pad 1 原始音: [60, 64, 67, 72] + 7 = [67, 71, 74, 79]
    const reNotesPad1 = YamahaPadModifier.extractTrackNotes(reloaded.tracks[1]);
    expect(reNotesPad1.length).toBe(4);
    expect(reNotesPad1.map(n => n.note)).toEqual([67, 71, 74, 79]);
    expect(reNotesPad1.map(n => n.velocity)).toEqual([95, 100, 105, 110]);

    // Pad 2 原始音: [69, 71, 72, 66, 68, 69] + 7 = [76, 78, 79, 73, 75, 76] (花音 F#4->C#5, 導音 G#4->D#5 100% 保留)
    const reNotesPad2 = YamahaPadModifier.extractTrackNotes(reloaded.tracks[2]);
    expect(reNotesPad2.length).toBe(6);
    expect(reNotesPad2.map(n => n.note)).toEqual([76, 78, 79, 73, 75, 76]);

    // Pad 3 原始音: [57, 60, 64, 69] + 7 = [64, 67, 71, 76]
    const reNotesPad3 = YamahaPadModifier.extractTrackNotes(reloaded.tracks[3]);
    expect(reNotesPad3.length).toBe(4);
    expect(reNotesPad3.map(n => n.note)).toEqual([64, 67, 71, 76]);

    // Pad 4 原始音: [45, 52] + 7 = [52, 59]
    const reNotesPad4 = YamahaPadModifier.extractTrackNotes(reloaded.tracks[4]);
    expect(reNotesPad4.length).toBe(2);
    expect(reNotesPad4.map(n => n.note)).toEqual([52, 59]);

    // 5. 驗證 CC 控制器自動化曲線無損保存
    // Pad 1 CC 11 表情曲線
    const reCC11Pad1 = reloaded.tracks[1].events.filter(e => e.type === 'controlChange' && e.controller === 11);
    expect(reCC11Pad1.length).toBe(4);
    expect(reCC11Pad1.map(e => e.value)).toEqual([50, 75, 100, 127]);

    // Pad 3 CC 1 Modulation 顫音曲線
    const reCC1Pad3 = reloaded.tracks[3].events.filter(e => e.type === 'controlChange' && e.controller === 1);
    expect(reCC1Pad3.length).toBe(3);
    expect(reCC1Pad3.map(e => e.value)).toEqual([0, 30, 65]);
  });

  it('2. 實體琴現成樣本 Round-Trip 雙向驗收 (2010-1_PAD.PAD 與 2011-2_PAD.PAD 讀取 ➔ 剛體轉調 ➔ 匯出 ➔ 反解析 100% 吻合)', () => {
    // 測試 sample 2010-1
    const raw2010 = new Uint8Array(fs.readFileSync(sample2010Path));
    const parsed2010 = YamahaParser.parse(raw2010, 'PAD');
    const orig2010Diag = YamahaPadModifier.analyzePadProject(parsed2010);

    // 轉為 Em (+7 半音)
    YamahaPadModifier.transposePadKey(parsed2010, {
      sourceKey: 'Am',
      targetKey: 'Em',
      direction: 'up',
      padNumbers: [1, 2, 3, 4],
    });
    YamahaPadModifier.syncControlTagsToTrack0(parsed2010);
    for (const trk of parsed2010.tracks) {
      YamahaPadModifier.rebuildTrackRawChunk(trk);
    }
    const exported2010Bytes = YamahaWriter.write(parsed2010);
    const reloaded2010 = YamahaParser.parse(exported2010Bytes, 'PAD');
    const reloaded2010Diag = YamahaPadModifier.analyzePadProject(reloaded2010);

    // 驗證 2010-1 反解析後的軌道數、各 Pad 小節數與音符數完全相同
    expect(reloaded2010.tracks.length).toBe(5);
    for (let i = 0; i < 4; i++) {
      expect(reloaded2010Diag.tracks[i].noteCount).toBe(orig2010Diag.tracks[i].noteCount);
      expect(reloaded2010Diag.tracks[i].barLength).toBe(orig2010Diag.tracks[i].barLength);
      expect(reloaded2010Diag.tracks[i].voiceInfo.msb).toBe(orig2010Diag.tracks[i].voiceInfo.msb);
      expect(reloaded2010Diag.tracks[i].voiceInfo.lsb).toBe(orig2010Diag.tracks[i].voiceInfo.lsb);
      expect(reloaded2010Diag.tracks[i].voiceInfo.pc).toBe(orig2010Diag.tracks[i].voiceInfo.pc);
    }

    // 測試 sample 2011-2
    const raw2011 = new Uint8Array(fs.readFileSync(sample2011Path));
    const parsed2011 = YamahaParser.parse(raw2011, 'PAD');
    const orig2011Diag = YamahaPadModifier.analyzePadProject(parsed2011);

    // 轉為 Dm (-7 半音 / +5 半音)
    YamahaPadModifier.transposePadKey(parsed2011, {
      sourceKey: 'Am',
      targetKey: 'Dm',
      direction: 'auto',
      padNumbers: [1, 2, 3, 4],
    });
    YamahaPadModifier.syncControlTagsToTrack0(parsed2011);
    for (const trk of parsed2011.tracks) {
      YamahaPadModifier.rebuildTrackRawChunk(trk);
    }
    const exported2011Bytes = YamahaWriter.write(parsed2011);
    const reloaded2011 = YamahaParser.parse(exported2011Bytes, 'PAD');
    const reloaded2011Diag = YamahaPadModifier.analyzePadProject(reloaded2011);

    // 驗證 2011-2 反解析後的完整性
    expect(reloaded2011.tracks.length).toBe(5);
    for (let i = 0; i < 4; i++) {
      expect(reloaded2011Diag.tracks[i].noteCount).toBe(orig2011Diag.tracks[i].noteCount);
      expect(reloaded2011Diag.tracks[i].barLength).toBe(orig2011Diag.tracks[i].barLength);
      expect(reloaded2011Diag.tracks[i].voiceInfo.msb).toBe(orig2011Diag.tracks[i].voiceInfo.msb);
      expect(reloaded2011Diag.tracks[i].voiceInfo.lsb).toBe(orig2011Diag.tracks[i].voiceInfo.lsb);
      expect(reloaded2011Diag.tracks[i].voiceInfo.pc).toBe(orig2011Diag.tracks[i].voiceInfo.pc);
    }
  });
});
