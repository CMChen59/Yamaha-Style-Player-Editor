import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

describe('【第一階段驗收】Multi Pad 調性診斷與固定調性剛體半音平移引擎', () => {
  const sample2010Path = path.resolve(__dirname, '../samples/2010-1_PAD.PAD');
  const sample2011Path = path.resolve(__dirname, '../samples/2011-2_PAD.PAD');
  const verifiedEmPath = path.resolve(__dirname, '../samples/2010_空港_Intro_Em原調.PAD');

  it('1. 自動估算《空港》2010-1_PAD.PAD 與 2011-2_PAD.PAD 之原曲基準調與 4 大型態診斷', () => {
    // 測試 2010-1_PAD.PAD (空港)
    const raw2010 = new Uint8Array(fs.readFileSync(sample2010Path));
    const parsed2010 = YamahaParser.parse(raw2010, 'PAD');
    const diag2010 = YamahaPadModifier.analyzePadProject(parsed2010);

    console.log('=== [2010-1_PAD.PAD 診斷報告] ===');
    console.log('自動估算基準調:', diag2010.estimatedKeyLabelZh, `(${diag2010.keyConfidence}%)`);
    console.log('估算依據:', diag2010.keyDetectionReasonZh);
    diag2010.tracks.forEach((t) => {
      console.log(
        `  Pad ${t.padNum} [${t.name}] | 音色: ${t.voiceInfo.voiceName} (${t.voiceInfo.panelCode}) | ${t.noteCount} 音符 (${t.barLength} 小節) | 音域: ${t.pitchRangeLabel} | 型態: ${t.musicalTypeLabelZh} | 建議 CM=${t.recommendedChordMatch}`
      );
    });

    expect(diag2010.estimatedKey).toBe('Am');
    expect(diag2010.estimatedIsMinor).toBe(true);
    expect(diag2010.hasLongMelody).toBe(true);
    expect(diag2010.tracks[1].musicalType).toBe('MELODY_INTRO');
    expect(diag2010.tracks[1].hasLeadingOrChromaticTone).toBe(true);
    expect(diag2010.tracks[1].recommendedChordMatch).toBe(false);

    // 測試 2011-2_PAD.PAD
    const raw2011 = new Uint8Array(fs.readFileSync(sample2011Path));
    const parsed2011 = YamahaParser.parse(raw2011, 'PAD');
    const diag2011 = YamahaPadModifier.analyzePadProject(parsed2011);

    console.log('\n=== [2011-2_PAD.PAD 診斷報告] ===');
    console.log('自動估算基準調:', diag2011.estimatedKeyLabelZh, `(${diag2011.keyConfidence}%)`);
    console.log('估算依據:', diag2011.keyDetectionReasonZh);
    diag2011.tracks.forEach((t) => {
      console.log(
        `  Pad ${t.padNum} [${t.name}] | 音色: ${t.voiceInfo.voiceName} (${t.voiceInfo.panelCode}) | ${t.noteCount} 音符 (${t.barLength} 小節) | 音域: ${t.pitchRangeLabel} | 型態: ${t.musicalTypeLabelZh} | 建議 CM=${t.recommendedChordMatch}`
      );
    });

    expect(diag2011.estimatedKey).toBe('Am');
    expect(diag2011.tracks[0].musicalType).toBe('SHORT_MOTIF'); // Pad 1: 2 小節 6 音符 E-D-B
    expect(diag2011.tracks[1].musicalType).toBe('EMPTY');       // Pad 2: 0 音符空軌
    expect(diag2011.tracks[2].musicalType).toBe('MELODY_INTRO');// Pad 3: 23 小節長裝飾句
  });

  it('2. 轉換《空港》Am ➔ Em (+7 半音) 與 PSR-SX920 實機驗收完美版 (2010_空港_Intro_Em原調.PAD) 100% 逐顆音符吻合', () => {
    const raw2010 = new Uint8Array(fs.readFileSync(sample2010Path));
    const parsed = YamahaParser.parse(raw2010, 'PAD');

    // 先設定基礎名稱
    YamahaPadModifier.setPadName(parsed, 1, 'Strings');
    YamahaPadModifier.setPadName(parsed, 2, 'Lead 1');
    YamahaPadModifier.setPadName(parsed, 3, 'Pipe 2');
    YamahaPadModifier.setPadName(parsed, 4, 'Arp');

    // 執行固定調性剛體平移：由自動估算之 Am 轉為 Em (帶自訂後綴 'Em原調')
    const res = YamahaPadModifier.transposePadKey(parsed, {
      targetKey: 'Em',
      keySuffixLabel: 'Em原調',
    });

    console.log('\n=== [空港 Am ➔ Em 轉換結果] ===');
    console.log(`基準調: ${res.sourceKey} ➔ 目標調: ${res.targetKey} (位移: +${res.baseSemitoneShift} 半音)`);
    console.log(`Track 0 控制碼: ${res.cmTag}, ${res.rpTag}, 名稱: ${res.padNames.join(' | ')}`);

    expect(res.success).toBe(true);
    expect(res.sourceKey).toBe('Am');
    expect(res.targetKey).toBe('Em');
    expect(res.baseSemitoneShift).toBe(7);
    expect(res.cmTag).toBe('CM0000');
    expect(res.padNames).toEqual([
      'Strings (Em原調)',
      'Lead 1 (Em原調)',
      'Pipe 2 (Em原調)',
      'Arp (Em原調)',
    ]);

    // 匯出二進位並重新解析，與實機驗收基準檔 2010_空港_Intro_Em原調.PAD 逐軌逐顆音符核對
    const outBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(outBytes, 'PAD');
    const verifiedEm = YamahaParser.parse(new Uint8Array(fs.readFileSync(verifiedEmPath)), 'PAD');

    // Track 0 第 1 個事件必須為 CM0000
    expect(reParsed.tracks[0].events[0].text).toBe('CM0000');
    expect(reParsed.tracks[0].events[1].text).toBe('RP0000');

    for (let padNum = 1; padNum <= 4; padNum++) {
      const actualNotes = YamahaPadModifier.extractTrackNotes(reParsed.tracks[padNum]);
      const expectedNotes = YamahaPadModifier.extractTrackNotes(verifiedEm.tracks[padNum]);

      expect(actualNotes.length).toBe(expectedNotes.length);
      for (let i = 0; i < actualNotes.length; i++) {
        expect(actualNotes[i].note).toBe(expectedNotes[i].note);
        expect(actualNotes[i].startTick).toBe(expectedNotes[i].startTick);
        expect(actualNotes[i].durationTick).toBe(expectedNotes[i].durationTick);
        expect(actualNotes[i].velocity).toBe(expectedNotes[i].velocity);
      }
    }
  });

  it('3. 支援使用者手動更改/覆寫「原曲基準調 (sourceKey)」、八度折返防呆與多次連續轉調後綴不重複疊加', () => {
    const raw2011 = new Uint8Array(fs.readFileSync(sample2011Path));
    const parsed = YamahaParser.parse(raw2011, 'PAD');
    const origPad1Notes = YamahaPadModifier.extractTrackNotes(parsed.tracks[1]).map((n) => n.note);

    // 情境 A：使用者手動指定 sourceKey 為 'Am'，轉至 'Cm' (+3 半音)：Pad 1 的 E-D-B 必須精準變成 G-F-D
    const resCm = YamahaPadModifier.transposePadKey(parsed, {
      sourceKey: 'Am',
      targetKey: 'Cm',
    });
    expect(resCm.baseSemitoneShift).toBe(3);
    const pad1NotesCm = YamahaPadModifier.extractTrackNotes(parsed.tracks[1]).map((n) => n.note);
    expect(pad1NotesCm).toEqual(origPad1Notes.map((n) => n + 3));
    expect(resCm.padNames[0]).toBe('Pad 1 (Cm)');

    // 情境 B：使用者手動將已轉為 Cm 的檔案，手動指定 sourceKey 為 'Cm'，再轉至 'Dm' (+2 半音，累計 +5 半音)
    const resDm = YamahaPadModifier.transposePadKey(parsed, {
      sourceKey: 'Cm',
      targetKey: 'Dm',
    });
    expect(resDm.baseSemitoneShift).toBe(2);
    const pad1NotesDm = YamahaPadModifier.extractTrackNotes(parsed.tracks[1]).map((n) => n.note);
    expect(pad1NotesDm).toEqual(origPad1Notes.map((n) => n + 5));
    // 驗證名稱後綴乾淨更新為 (Dm)，不會疊加成 Pad 1 (Cm) (Dm)
    expect(resDm.padNames[0]).toBe('Pad 1 (Dm)');
  });

  it('4. 【第二階段驗收】單軌獨立勾選移調、複製軌道 (clonePadTrack)、清空軌道 (clearPadTrackNotes)、小節數與混音圖示修改', () => {
    const raw2011 = new Uint8Array(fs.readFileSync(sample2011Path));
    const parsed = YamahaParser.parse(raw2011, 'PAD');

    // 1. 將 Pad 1 (6 音符) 複製到原本是空軌的 Pad 2
    const cloneRes = YamahaPadModifier.clonePadTrack(parsed, 1, 2);
    expect(cloneRes.success).toBe(true);
    expect(cloneRes.copiedNoteCount).toBe(6);
    expect(YamahaPadModifier.extractTrackNotes(parsed.tracks[2]).length).toBe(6);

    // 2. 僅勾選 Pad 2 參與移調 (padNumbers: [2])，從 Am 轉至 Cm (+3 半音)，驗證 Pad 1 維持原音高不動！
    const origPad1 = YamahaPadModifier.extractTrackNotes(parsed.tracks[1]).map(n => n.note);
    YamahaPadModifier.transposePadKey(parsed, {
      sourceKey: 'Am',
      targetKey: 'Cm',
      padNumbers: [2],
    });
    const afterPad1 = YamahaPadModifier.extractTrackNotes(parsed.tracks[1]).map(n => n.note);
    const afterPad2 = YamahaPadModifier.extractTrackNotes(parsed.tracks[2]).map(n => n.note);
    expect(afterPad1).toEqual(origPad1); // Pad 1 完全未動
    expect(afterPad2).toEqual(origPad1.map(n => n + 3)); // Pad 2 精準 +3 半音

    // 3. 修改 Pad 2 圖示、殘響 (CC91)、合唱 (CC93) 與小節長度
    YamahaPadModifier.setPadIcon(parsed, 2, 'S810');
    YamahaPadModifier.setPadMixing(parsed, 2, { reverb: 85, chorus: 42 });
    YamahaPadModifier.setPadBarLength(parsed, 2, 8);

    const diagAfterMix = YamahaPadModifier.analyzePadProject(parsed);
    expect(diagAfterMix.tracks[1].icon).toBe('S810');
    expect(diagAfterMix.tracks[1].mixing.reverb).toBe(85);
    expect(diagAfterMix.tracks[1].mixing.chorus).toBe(42);
    expect(diagAfterMix.tracks[1].barLength).toBe(8);

    // 4. 清空 Pad 2 音符
    YamahaPadModifier.clearPadTrackNotes(parsed, 2);
    expect(YamahaPadModifier.extractTrackNotes(parsed.tracks[2]).length).toBe(0);
  });
});
