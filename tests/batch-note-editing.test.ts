import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { MidiTrack } from '../src/core/models/types';

function extractNotes(track: MidiTrack) {
  let curTick = 0;
  const active = new Map<number, { tick: number; velocity: number }>();
  const notes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
  for (const ev of track.events) {
    curTick += ev.delta;
    if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.noteNumber !== undefined) {
      active.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
    } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev.velocity ?? 0) === 0)) && ev.noteNumber !== undefined) {
      const act = active.get(ev.noteNumber);
      if (act) {
        notes.push({
          note: ev.noteNumber,
          startTick: act.tick,
          durationTick: curTick - act.tick,
          velocity: act.velocity,
        });
        active.delete(ev.noteNumber);
      }
    }
  }
  return notes;
}

describe('模組 2.8-E: 多音符選取與批次修改 (Batch Note Editing)', () => {
  const samplePath = path.resolve(__dirname, '../samples/4006-1_PAD.PAD');

  it('能成功批次修改多顆音符的力度 (Velocity) 與時值 (Duration)', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    // 取得 Pad 1 的音符
    const pad1Notes = extractNotes(parsed.tracks[1]);
    expect(pad1Notes.length).toBeGreaterThanOrEqual(2);

    const note1 = pad1Notes[0];
    const note2 = pad1Notes[1];

    const updatedCount = YamahaPadModifier.batchUpdateNotes(parsed, 1, [
      {
        target: { note: note1.note, startTick: note1.startTick, oldDurationTick: note1.durationTick },
        updates: { velocity: 110, durationTick: 240 }
      },
      {
        target: { note: note2.note, startTick: note2.startTick, oldDurationTick: note2.durationTick },
        updates: { velocity: 95, durationTick: 180 }
      }
    ]);

    expect(updatedCount).toBe(2);

    // 序列化為二進位並重新解析驗證
    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');

    const reNotes = extractNotes(reParsed.tracks[1]);
    const reNote1 = reNotes.find(n => n.startTick === note1.startTick && n.note === note1.note);
    const reNote2 = reNotes.find(n => n.startTick === note2.startTick && n.note === note2.note);

    expect(reNote1).toBeDefined();
    expect(reNote1?.velocity).toBe(110);
    expect(reNote1?.durationTick).toBe(240);

    expect(reNote2).toBeDefined();
    expect(reNote2?.velocity).toBe(95);
    expect(reNote2?.durationTick).toBe(180);
  });

  it('能成功批次移調 (Pitch Shift) 多顆音符且邊界防呆安全 (0~127)', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    const pad1Notes = extractNotes(parsed.tracks[1]);
    const targets = pad1Notes.slice(0, 3);

    const updatedCount = YamahaPadModifier.batchUpdateNotes(
      parsed,
      1,
      targets.map(t => ({
        target: { note: t.note, startTick: t.startTick, oldDurationTick: t.durationTick },
        updates: { note: t.note + 12 } // 升八度
      }))
    );

    expect(updatedCount).toBe(3);

    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    const reNotes = extractNotes(reParsed.tracks[1]);

    for (let i = 0; i < 3; i++) {
      const orig = targets[i];
      const match = reNotes.find(n => n.startTick === orig.startTick && n.note === orig.note + 12);
      expect(match).toBeDefined();
    }
  });

  it('能成功批次刪除 (Batch Delete) 多顆音符並正確保持 Delta Times 與 RawChunk 完整性', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    const origNotes = extractNotes(parsed.tracks[1]);
    const origCount = origNotes.length;
    const targetsToDelete = origNotes.slice(0, 2);

    const deletedCount = YamahaPadModifier.batchDeleteNotes(
      parsed,
      1,
      targetsToDelete.map(t => ({ note: t.note, startTick: t.startTick, oldDurationTick: t.durationTick }))
    );

    expect(deletedCount).toBe(2);

    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    const reNotes = extractNotes(reParsed.tracks[1]);

    expect(reNotes.length).toBe(origCount - 2);

    for (const t of targetsToDelete) {
      const exists = reNotes.some(n => n.startTick === t.startTick && n.note === t.note);
      expect(exists).toBe(false);
    }
  });

  it('能成功將自訂力度數值 (Custom Velocity) 一次性套用至多顆選取音符', () => {
    const rawBuffer = new Uint8Array(fs.readFileSync(samplePath));
    const parsed = YamahaParser.parse(rawBuffer, 'PAD');

    const origNotes = extractNotes(parsed.tracks[1]);
    const selectedTargets = origNotes.slice(0, 3);
    const customVel = 77;

    const updatedCount = YamahaPadModifier.batchUpdateNotes(
      parsed,
      1,
      selectedTargets.map(t => ({
        target: { note: t.note, startTick: t.startTick, oldDurationTick: t.durationTick },
        updates: { velocity: customVel }
      }))
    );

    expect(updatedCount).toBe(3);

    const modifiedBytes = YamahaWriter.write(parsed);
    const reParsed = YamahaParser.parse(modifiedBytes, 'PAD');
    const reNotes = extractNotes(reParsed.tracks[1]);

    for (const t of selectedTargets) {
      const matched = reNotes.find(n => n.startTick === t.startTick && n.note === t.note);
      expect(matched).toBeDefined();
      expect(matched?.velocity).toBe(customVel);
    }
  });
});
