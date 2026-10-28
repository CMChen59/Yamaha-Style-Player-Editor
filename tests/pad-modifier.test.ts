import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';

describe('步驟 2.1: Pad 屬性與混音編輯雙向同步驗證 (PadModifier Verification)', () => {
  const samplePath = path.resolve(__dirname, '../samples/4006-2_PAD.PAD');

  it('能成功修改 Pad 名稱、Repeat、ChordMatch、Icon、音量與聲相，並無失真保存至新二進位檔案', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 1. 修改 Pad 1 屬性
    YamahaPadModifier.setPadName(parsed, 1, 'Acoustic Guitar');
    YamahaPadModifier.setPadRepeat(parsed, 1, true);
    YamahaPadModifier.setPadChordMatch(parsed, 1, true);
    YamahaPadModifier.setPadIcon(parsed, 1, 'S809');

    // 2. 修改 Pad 1 混音
    YamahaPadModifier.setPadMixing(parsed, 1, {
      volume: 115,
      pan: 80,
      reverb: 45,
      programChange: 25,
    });

    // 3. 修改 Pad 2 屬性與混音
    YamahaPadModifier.setPadName(parsed, 2, 'Finger Bass');
    YamahaPadModifier.setPadRepeat(parsed, 2, false);
    YamahaPadModifier.setPadChordMatch(parsed, 2, true);
    YamahaPadModifier.setPadMixing(parsed, 2, {
      volume: 98,
      pan: 40,
    });

    // 4. 重構寫出新二進位檔
    const modifiedBytes = YamahaWriter.write(parsed);
    expect(modifiedBytes.length).toBeGreaterThan(0);

    // 5. 重新送入 Parser 解析驗證
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    // 驗證 Pad 1
    expect(reParsed.padConfig).toBeDefined();
    expect(reParsed.padConfig?.names[0]).toBe('Acoustic Guitar');
    expect(reParsed.padConfig?.repeatFlags[0]).toBe(true);
    expect(reParsed.padConfig?.chordMatchFlags[0]).toBe(true);
    expect(reParsed.padConfig?.icons[0]).toBe('S809');

    // 驗證 Pad 2
    expect(reParsed.padConfig?.names[1]).toBe('Finger Bass');
    expect(reParsed.padConfig?.repeatFlags[1]).toBe(false);
    expect(reParsed.padConfig?.chordMatchFlags[1]).toBe(true);

    // 驗證 Track 1 混音 Controller
    const trk1Events = reParsed.tracks[1].events;
    const vol1 = trk1Events.find((e) => e.type === 'controlChange' && e.controller === 7)?.value;
    const pan1 = trk1Events.find((e) => e.type === 'controlChange' && e.controller === 10)?.value;
    const rev1 = trk1Events.find((e) => e.type === 'controlChange' && e.controller === 91)?.value;
    const pc1 = trk1Events.find((e) => e.type === 'programChange')?.program;

    expect(vol1).toBe(115);
    expect(pan1).toBe(80);
    expect(rev1).toBe(45);
    expect(pc1).toBe(25);

    // 驗證 Track 2 音量
    const trk2Events = reParsed.tracks[2].events;
    const vol2 = trk2Events.find((e) => e.type === 'controlChange' && e.controller === 7)?.value;
    const pan2 = trk2Events.find((e) => e.type === 'controlChange' && e.controller === 10)?.value;
    expect(vol2).toBe(98);
    expect(pan2).toBe(40);
  });

  it('能成功修改 Pad 音軌中特定音符的力度 (Velocity) 與長度 (Duration)', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 檢查 Pad 1 第一顆音符 (Note 65, Start 4608, Dur 384, Vel 88)
    const success = YamahaPadModifier.updateNoteEvent(
      parsed,
      1,
      { note: 65, startTick: 4608, oldDurationTick: 384 },
      { velocity: 118, durationTick: 192 }
    );
    expect(success).toBe(true);

    // 導出二進位並重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    // 提取 Track 1 音符
    let curTick = 0;
    const trk1 = reParsed.tracks[1];
    let note65OnVel: number | undefined;
    let note65Dur: number | undefined;

    for (const ev of trk1.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber === 65 && ev.velocity && ev.velocity > 0) {
        if (curTick === 4608) {
          note65OnVel = ev.velocity;
        }
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber === 65) {
        if (note65OnVel !== undefined && note65Dur === undefined) {
          note65Dur = curTick - 4608;
        }
      }
    }

    expect(note65OnVel).toBe(118);
    expect(note65Dur).toBe(192);
  });

  it('能成功平移修改音符的起始時間位置 (startTick) 與音高 (note)', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 將 Pad 1 第一顆音符 (Note 65, Start 4608, Dur 384) 移動到 Start 4800，音高改為 67 (G4)
    const success = YamahaPadModifier.updateNoteEvent(
      parsed,
      1,
      { note: 65, startTick: 4608, oldDurationTick: 384 },
      { startTick: 4800, note: 67 }
    );
    expect(success).toBe(true);

    // 導出二進位並重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    let curTick = 0;
    const trk1 = reParsed.tracks[1];
    let note67OnTick: number | undefined;
    let note67OffTick: number | undefined;

    for (const ev of trk1.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber === 67 && ev.velocity && ev.velocity > 0) {
        if (note67OnTick === undefined) {
          note67OnTick = curTick;
        }
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber === 67) {
        if (note67OnTick !== undefined && note67OffTick === undefined) {
          note67OffTick = curTick;
        }
      }
    }

    expect(note67OnTick).toBe(4800);
    // 音長維持 384，所以 Note-Off 應在 4800 + 384 = 5184
    expect(note67OffTick).toBe(5184);
  });

  it('能成功刪除特定音符 (deleteNoteEvent) 並保持時間軸正確性與二進位重構', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 刪除 Pad 1 第一顆音符 (Note 65, Start 4608, Dur 384)
    const success = YamahaPadModifier.deleteNoteEvent(parsed, 1, {
      note: 65,
      startTick: 4608,
      oldDurationTick: 384,
    });
    expect(success).toBe(true);

    // 導出二進位並重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    let curTick = 0;
    const trk1 = reParsed.tracks[1];
    let foundDeletedNote = false;
    let nextNoteStartTick: number | undefined;

    for (const ev of trk1.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        if (ev.noteNumber === 65 && curTick === 4608) {
          foundDeletedNote = true;
        }
        if (nextNoteStartTick === undefined && curTick >= 4992) {
          nextNoteStartTick = curTick;
        }
      }
    }

    expect(foundDeletedNote).toBe(false);
    // 下一顆音符 (Note 64 at 4992) 的時間位置不受影響
    expect(nextNoteStartTick).toBe(4992);
  });

  it('能成功新增全新音符 (addNoteEvent) 並正確排序 Note-On/Off 與導出二進位', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 在 Pad 1 新增一顆 Note 84 (C6), Start 4700, Dur 96, Vel 110
    const success = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 84,
      startTick: 4700,
      durationTick: 96,
      velocity: 110,
    });
    expect(success).toBe(true);

    // 導出二進位並重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    let curTick = 0;
    const trk1 = reParsed.tracks[1];
    let createdNoteOn: { tick: number; vel: number } | undefined;
    let createdNoteOff: { tick: number } | undefined;

    for (const ev of trk1.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber === 84 && (ev.velocity ?? 0) > 0) {
        if (!createdNoteOn) {
          createdNoteOn = { tick: curTick, vel: ev.velocity! };
        }
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber === 84) {
        if (!createdNoteOff) {
          createdNoteOff = { tick: curTick };
        }
      }
    }

    expect(createdNoteOn).toBeDefined();
    expect(createdNoteOn?.tick).toBe(4700);
    expect(createdNoteOn?.vel).toBe(110);
    expect(createdNoteOff).toBeDefined();
    expect(createdNoteOff?.tick).toBe(4700 + 96);
  });

  it('能正確取得與動態擴展 Pad 總小節長度 (getPadBarLength / setPadBarLength)', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 檢查初始長度 (Pad 1 至少 4 或 7 小節)
    const initialLen = YamahaPadModifier.getPadBarLength(parsed, 1);
    expect(initialLen).toBeGreaterThanOrEqual(4);

    // 將 Pad 1 擴展至 8 小節
    const success = YamahaPadModifier.setPadBarLength(parsed, 1, 8);
    expect(success).toBe(true);

    const newLen = YamahaPadModifier.getPadBarLength(parsed, 1);
    expect(newLen).toBe(8);

    // 驗證寫出後重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    const reLen = YamahaPadModifier.getPadBarLength(reParsed, 1);
    expect(reLen).toBe(8);
  });

  it('能精確執行跳小節複製 (例如 1➔3、1➔5) 並驗證音符相對拍點正確', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 將 Pad 1 第 1 小節音符複製到第 3 小節
    const res = YamahaPadModifier.copyPadMeasure(parsed, 1, 1, 3, 'replace');
    expect(res.success).toBe(true);
    expect(res.copiedCount).toBeGreaterThan(0);

    // 驗證二進位寫出重構
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    // 提取重構後 Pad 1 的音符
    let curTick = 0;
    const trk1 = reParsed.tracks[1];
    const notes: { note: number; startTick: number }[] = [];
    for (const ev of trk1.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        notes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }

    const firstTick = Math.min(...notes.map((n) => n.startTick));
    const gridStart = Math.floor(firstTick / 384) * 384;

    // 第 1 小節音符 (StartTick: gridStart ~ gridStart + 384)
    const bar1Notes = notes.filter((n) => n.startTick >= gridStart && n.startTick < gridStart + 384);
    // 第 3 小節音符 (StartTick: gridStart + 768 ~ gridStart + 1152)
    const bar3Notes = notes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);

    expect(bar3Notes.length).toBe(bar1Notes.length);
    // 檢查相對拍點偏移量正好為 2 個小節 (2 * 384 = 768 Ticks)
    for (let i = 0; i < bar1Notes.length; i++) {
      expect(bar3Notes[i].note).toBe(bar1Notes[i].note);
      expect(bar3Notes[i].startTick - bar1Notes[i].startTick).toBe(768);
    }
  });

  it('能精確執行小節插入順移 (copyPadMeasure with insert) 並驗證後續音符向後推移 1 小節且總長度 +1', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    YamahaPadModifier.setPadBarLength(parsed, 1, 4);

    // 取得原始音符
    let curTick = 0;
    const origNotes: { note: number; startTick: number }[] = [];
    for (const ev of parsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        origNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }
    const gridStart = Math.floor(Math.min(...origNotes.map((n) => n.startTick)) / 384) * 384;
    const origBar1Notes = origNotes.filter((n) => n.startTick >= gridStart && n.startTick < gridStart + 384);
    const origBar3Notes = origNotes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);

    // 將第 1 小節插入至第 3 小節 (模式 C: insert)
    const res = YamahaPadModifier.copyPadMeasure(parsed, 1, 1, 3, 'insert');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(5);

    // 驗證寫出後重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    expect(YamahaPadModifier.getPadBarLength(reParsed, 1)).toBe(5);

    curTick = 0;
    const newNotes: { note: number; startTick: number }[] = [];
    for (const ev of reParsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        newNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }

    // 新的第 3 小節應為複製進來的第 1 小節音符
    const newBar3Notes = newNotes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);
    expect(newBar3Notes.length).toBe(origBar1Notes.length);
    for (let i = 0; i < origBar1Notes.length; i++) {
      expect(newBar3Notes[i].note).toBe(origBar1Notes[i].note);
    }

    // 原第 3 小節音符應被順移推後 384 Ticks 成為第 4 小節 (gridStart + 1152 ~ gridStart + 1536)
    const newBar4Notes = newNotes.filter((n) => n.startTick >= gridStart + 1152 && n.startTick < gridStart + 1536);
    expect(newBar4Notes.length).toBe(origBar3Notes.length);
    for (let i = 0; i < origBar3Notes.length; i++) {
      expect(newBar4Notes[i].note).toBe(origBar3Notes[i].note);
      expect(newBar4Notes[i].startTick - origBar3Notes[i].startTick).toBe(384);
    }

    // 關鍵防護驗證：第 2 小節末尾的音符 (Note 76 / E5) 音長維持 48 ticks，絕不因插入小節而向後延伸誤拉長
    curTick = 0;
    let note76Dur = 0;
    const activeMap = new Map<number, number>();
    for (const ev of reParsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        activeMap.set(ev.noteNumber!, curTick);
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const onT = activeMap.get(ev.noteNumber);
        if (onT !== undefined) {
          if (ev.noteNumber === 76 && onT >= gridStart + 384 && onT < gridStart + 768) {
            note76Dur = curTick - onT;
          }
          activeMap.delete(ev.noteNumber);
        }
      }
    }
    expect(note76Dur).toBe(48);
  });

  it('能精確執行小節剪除順移 (deletePadMeasure with ripple) 並驗證後續音符時序自動前移與總小節縮減', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 先設定 Pad 1 為 4 小節
    YamahaPadModifier.setPadBarLength(parsed, 1, 4);
    const initialLen = YamahaPadModifier.getPadBarLength(parsed, 1);
    expect(initialLen).toBe(4);

    // 取得原始音符清單
    let curTick = 0;
    const origNotes: { note: number; startTick: number }[] = [];
    for (const ev of parsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        origNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }
    const gridStart = Math.floor(Math.min(...origNotes.map((n) => n.startTick)) / 384) * 384;
    // 原始第 3 小節與第 4 小節音符
    const origBar3Notes = origNotes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);

    // 執行 Ripple Delete 刪除第 2 小節 (模式 A，預設保持標準 4 小節結構)
    const res = YamahaPadModifier.deletePadMeasure(parsed, 1, 2, 'ripple');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(4);

    // 驗證寫出後重新解析，小節數維持標準 4 小節，第 4 小節成為休止空白
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    expect(YamahaPadModifier.getPadBarLength(reParsed, 1)).toBe(4);

    // 檢查重構後的音符時序
    curTick = 0;
    const newNotes: { note: number; startTick: number }[] = [];
    for (const ev of reParsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        newNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }

    // 原第 3 小節音符應該自動平移 384 Ticks，成為新的第 2 小節 (gridStart + 384 ~ gridStart + 768)
    const newBar2Notes = newNotes.filter((n) => n.startTick >= gridStart + 384 && n.startTick < gridStart + 768);
    expect(newBar2Notes.length).toBe(origBar3Notes.length);
    for (let i = 0; i < origBar3Notes.length; i++) {
      expect(newBar2Notes[i].note).toBe(origBar3Notes[i].note);
      expect(origBar3Notes[i].startTick - newBar2Notes[i].startTick).toBe(384);
    }
  });

  it('能精確執行小節內容清空 (deletePadMeasure with clear) 並驗證後續音符位置與總小節數保持不變', () => {
    const sample1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(sample1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    YamahaPadModifier.setPadBarLength(parsed, 1, 4);

    // 取得原始音符
    let curTick = 0;
    const origNotes: { note: number; startTick: number }[] = [];
    for (const ev of parsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        origNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }
    const gridStart = Math.floor(Math.min(...origNotes.map((n) => n.startTick)) / 384) * 384;
    const origBar3Notes = origNotes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);

    // 執行 Clear Measure 清空第 2 小節 (模式 B)
    const res = YamahaPadModifier.deletePadMeasure(parsed, 1, 2, 'clear');
    expect(res.success).toBe(true);
    expect(res.newTotalBars).toBe(4);

    // 驗證寫出後重新解析
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    expect(YamahaPadModifier.getPadBarLength(reParsed, 1)).toBe(4);

    // 檢查重構後的音符時序
    curTick = 0;
    const newNotes: { note: number; startTick: number }[] = [];
    for (const ev of reParsed.tracks[1].events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        newNotes.push({ note: ev.noteNumber!, startTick: curTick });
      }
    }

    // 第 2 小節應該變成 0 顆音符
    const newBar2Notes = newNotes.filter((n) => n.startTick >= gridStart + 384 && n.startTick < gridStart + 768);
    expect(newBar2Notes.length).toBe(0);

    // 第 3 小節音符位置應該完全不受影響 (保持在原本的 Tick)
    const newBar3Notes = newNotes.filter((n) => n.startTick >= gridStart + 768 && n.startTick < gridStart + 1152);
    expect(newBar3Notes.length).toBe(origBar3Notes.length);
    for (let i = 0; i < origBar3Notes.length; i++) {
      expect(newBar3Notes[i].note).toBe(origBar3Notes[i].note);
      expect(newBar3Notes[i].startTick).toBe(origBar3Notes[i].startTick);
    }
  });

  it('能有效阻擋在相同起始時間與音高重複插入 Note-On 事件 (Duplicate Note Prevention)', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 第一次插入 C4 (60) 在 Tick 2000
    const firstAdd = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 60,
      startTick: 2000,
      durationTick: 96,
      velocity: 100,
    });
    expect(firstAdd).toBe(true);

    // 第二次在同一個 Tick 2000 與相同音高 60 插入，應被防禦機制拒絕
    const duplicateAdd = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 60,
      startTick: 2000,
      durationTick: 96,
      velocity: 100,
    });
    expect(duplicateAdd).toBe(false);

    // 不同音高 (D4: 62) 在相同 Tick 應允許 (和弦/多音)
    const diffPitchAdd = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 62,
      startTick: 2000,
      durationTick: 96,
      velocity: 100,
    });
    expect(diffPitchAdd).toBe(true);

    // 相同音高 (60) 在不同 Tick (2100) 應允許 (連續音)
    const diffTickAdd = YamahaPadModifier.addNoteEvent(parsed, 1, {
      note: 60,
      startTick: 2100,
      durationTick: 96,
      velocity: 100,
    });
    expect(diffTickAdd).toBe(true);
  });

  it('能正確淨化音軌中重複堆疊的 Note-On 與多餘的 Note-Off 事件 (sanitizeTrackDuplicateNotes)', () => {
    const track = {
      header: 'MTrk',
      length: 0,
      events: [
        { delta: 0, type: 'noteOn', noteNumber: 60, velocity: 100 },
        { delta: 0, type: 'noteOn', noteNumber: 60, velocity: 100 }, // 重複 Note-On
        { delta: 96, type: 'noteOff', noteNumber: 60, velocity: 0 },
        { delta: 0, type: 'noteOff', noteNumber: 60, velocity: 0 }, // 多餘 Note-Off
        { delta: 96, type: 'noteOn', noteNumber: 64, velocity: 90 },
        { delta: 96, type: 'noteOff', noteNumber: 64, velocity: 0 },
        { delta: 0, type: 'meta', metaType: 0x2f, data: new Uint8Array(0) },
      ] as any[],
    };

    const sanitized = YamahaPadModifier.sanitizeTrackDuplicateNotes(track);
    expect(sanitized).toBe(true);

    // 驗證重複的 Note-On 與多餘的 Note-Off 被移除
    const noteOns = track.events.filter((e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    const noteOffs = track.events.filter((e) => e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0));

    expect(noteOns.length).toBe(2); // 60 與 64 各一顆
    expect(noteOffs.length).toBe(2);

    // 再次執行淨化應回傳 false (已無需修改)
    const secondSanitize = YamahaPadModifier.sanitizeTrackDuplicateNotes(track);
    expect(secondSanitize).toBe(false);
  });

  it('在包含多個中途音色切換事件的 Pad 音軌中 (如 4006-1 Track 3)，setPadMixing 能全面更新所有 ProgramChange 與 Bank 事件', () => {
    const pad1Path = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(pad1Path));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // Track 3 原有 tick 2, tick 5 (PC 45) 與 tick 3073 (PC 75, LSB 113)
    const originalTrack3 = parsed.tracks[3];
    const initialPcs = originalTrack3.events.filter((e) => e.type === 'programChange');
    expect(initialPcs.length).toBeGreaterThan(1);
    expect(initialPcs.some((e) => e.program === 75)).toBe(true);

    // 修改 Pad 3 音色為 Live! Strings (MSB 8, LSB 33, PC 49)
    YamahaPadModifier.setPadMixing(parsed, 3, {
      bankMsb: 8,
      bankLsb: 33,
      programChange: 49,
    });

    // 驗證 Track 3 內部所有的 Program Change 均已同步更新為 49
    const updatedPcs = originalTrack3.events.filter((e) => e.type === 'programChange');
    expect(updatedPcs.every((e) => e.program === 49)).toBe(true);

    // 驗證所有的 Bank MSB (CC 0) 與 LSB (CC 32) 均已更新為 8 與 33
    const updatedMsbs = originalTrack3.events.filter((e) => e.type === 'controlChange' && e.controller === 0);
    const updatedLsbs = originalTrack3.events.filter((e) => e.type === 'controlChange' && e.controller === 32);
    expect(updatedMsbs.every((e) => e.value === 8)).toBe(true);
    expect(updatedLsbs.every((e) => e.value === 33)).toBe(true);

    // 驗證無損重構與再次解析一致性
    const reBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(reBytes, 'PAD');
    const rePcs = reParsed.tracks[3].events.filter((e) => e.type === 'programChange');
    expect(rePcs.every((e) => e.program === 49)).toBe(true);
  });

  it('能成功以全新音符序列整軌替換 Pad 音符 (replacePadNotes) 並保留原軌音色與控制器', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 原始 Track 1 有音符
    const origNotes = parsed.tracks[1].events.filter((e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(origNotes.length).toBeGreaterThan(0);

    // 準備新錄製的 2 顆音符
    const recordedNotes = [
      { note: 60, velocity: 100, startTick: 0, durationTick: 240 },
      { note: 64, velocity: 90, startTick: 480, durationTick: 240 },
    ];

    const success = YamahaPadModifier.replacePadNotes(parsed, 1, recordedNotes, 2);
    expect(success).toBe(true);

    // 驗證重構二進位檔案後再次解析
    const reBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(reBytes, 'PAD');

    const newNoteOns = reParsed.tracks[1].events.filter((e) => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
    expect(newNoteOns.length).toBe(2);
    expect(newNoteOns[0].noteNumber).toBe(60);
    expect(newNoteOns[1].noteNumber).toBe(64);

    // 驗證原有 Program Change 與 CC 依然保留
    const pcs = reParsed.tracks[1].events.filter((e) => e.type === 'programChange');
    expect(pcs.length).toBeGreaterThan(0);
  });

  it('驗證 PAD 鋼琴卷軸時間軸基準：在循環小節內延遲進場的音符保留第 1 小節休止，不被左移截斷', () => {
    const pad1SamplePath = path.resolve(__dirname, '../public/samples/4006-1_PAD.PAD');
    const rawBuffer = new Uint8Array(fs.readFileSync(pad1SamplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    const explicitBars = YamahaPadModifier.getPadBarLength(parsed, 1);
    expect(explicitBars).toBe(4);

    const division = parsed.division || 96;
    const ticksPerBar = division * 4; // 384 ticks
    const padLoopTicks = explicitBars * ticksPerBar; // 1536

    // 假設音符在第 2 小節 (Tick 384) 才進場
    const firstNoteTick = ticksPerBar; // 384

    // 依據全新對齊邏輯：若音符在前 4 小節內 (firstNoteTick < padLoopTicks)，基準必須為 0 (第 1 小節第 1 拍)
    const gridStartTick = firstNoteTick >= padLoopTicks ? Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar : 0;
    expect(gridStartTick).toBe(0);

    // 驗證第 1 小節為休止空白，音符在畫布上精確定位於第 2 小節
    const noteStartBar = Math.floor((firstNoteTick - gridStartTick) / ticksPerBar) + 1;
    expect(noteStartBar).toBe(2);
  });
});


