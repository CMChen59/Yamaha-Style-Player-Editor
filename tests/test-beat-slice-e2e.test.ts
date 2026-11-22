import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { MidiSongAnalyzer } from '../src/core/parser/midi-song-analyzer';
import { MidiSliceAssembler } from '../src/core/writer/midi-slice-assembler';
import { MidiPartAssignMatrix } from '../src/core/writer/midi-part-assign-matrix';

describe('任務 2-4C: 智慧起音自動偵測與拍級切片 E2E 實戰驗證', () => {
  const midiPath = 'C:/Users/CM/.gemini/antigravity/brain/efa7139d-39ef-488e-b2d4-677174e8485e/.user_uploaded/media_1795267226707_f0b6a50c.mid';
  const buf = fs.readFileSync(midiPath);
  const parsed = YamahaParser.parse(new Uint8Array(buf));
  const analysis = MidiSongAnalyzer.analyze(parsed, '容易受伤的女人.mid');

  it('1. 驗證 MidiSongAnalyzer 成功偵測到第 1 小節第 3 拍起音 (2 拍弱起偏移)', () => {
    expect(analysis.firstNoteTick).toBe(192);
    expect(analysis.firstNoteBar).toBe(1);
    expect(analysis.firstNoteBeat).toBe(3);
    expect(analysis.leadInOffsetBeats).toBe(2);
    expect(analysis.leadInOffsetTicks).toBe(192);
  });

  it('2. 裝配 Intro A (第 1 ~ 5 小節，startBeat = 3)：開頭 0 秒等待，第 5 節吉他收尾完整不被腰斬', () => {
    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, { sourceParsed: parsed, startBar: 1, endBar: 5 });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 1,
      endBar: 5,
      startBeat: 3,
      targetSection: 'Intro A',
      mappingPlan: plan,
      chordMode: 'ORIGINAL_PASS_THROUGH',
    });

    expect(result.success).toBe(true);
    expect(result.startBeat).toBe(3);
    expect(result.totalBars).toBe(5);

    // 檢查目標段落音符
    const introA = result.styleParsed.sections.find(s => s.name === 'Intro A')!;
    expect(introA).toBeDefined();

    // 收集目標段落音符
    const notes: any[] = [];
    result.styleParsed.tracks.forEach(trk => {
      let t = 0;
      trk.events.forEach(ev => {
        t += ev.delta;
        if (t >= introA.startTick && t < introA.endTick!) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            notes.push({ tickRel: t - introA.startTick, note: ev.noteNumber, vel: ev.velocity, ch: ev.channel });
          }
        }
      });
    });

    console.log(`Intro A (startBeat=3) extracted ${notes.length} notes`);
    expect(notes.length).toBeGreaterThan(0);

    // 第一顆音符必須在 tickRel = 0 (伴奏第 1 拍第 1 個 Tick 就直接發聲，零等待！)
    const firstRelTick = Math.min(...notes.map(n => n.tickRel));
    expect(firstRelTick).toBe(0);

    // 並且在 tickRel = 0 發聲的音符正是 Sax 旋律的 7 音 (Note 83, B5)
    const notesAtZero = notes.filter(n => n.tickRel === 0);
    expect(notesAtZero.some(n => n.note === 83)).toBe(true);

    // 檢查第 5 小節 (最後一小節，30720 ~ 38400 ticks) 木吉他收尾音是否完整存在 (不被腰斬)
    const notesInLastBar = notes.filter(n => n.tickRel >= 30720 && n.tickRel < 38400);
    console.log(`Intro A last bar notes count: ${notesInLastBar.length}`);
    expect(notesInLastBar.length).toBeGreaterThanOrEqual(10);
  });

  it('3. 裝配 Main A (第 6 ~ 13 小節，startBeat = 3)：第 1 拍即為純淨 C 和弦 + C 貝斯，半小節和弦完美對齊 C-Em, Am-Em, Dm-Am, 結尾不丟失', () => {
    const plan = MidiPartAssignMatrix.createAutoMappingPlan(analysis, { sourceParsed: parsed, startBar: 6, endBar: 13 });

    const result = MidiSliceAssembler.assembleSliceToSection({
      sourceParsed: parsed,
      analysis,
      startBar: 6,
      endBar: 13,
      startBeat: 3,
      targetSection: 'Main A',
      mappingPlan: plan,
      chordMode: 'CM7_MAJOR',
    });

    expect(result.success).toBe(true);
    expect(result.startBeat).toBe(3);
    expect(result.totalBars).toBe(8);

    // 檢查 detectedChordsByBar
    console.log('Main A detected chords with startBeat=3:');
    result.detectedChordsByBar?.forEach(c => console.log(`  Bar ${c.bar}: ${c.chordName}`));

    // 第一小節必須是 C-Em (或純 C)
    expect(result.detectedChordsByBar?.[0].chordName).toBe('C-Em');
    // 第二小節必須是 Am-Em
    expect(result.detectedChordsByBar?.[1].chordName).toBe('Am-Em');
    // 第三小節必須是 Dm-Am
    expect(result.detectedChordsByBar?.[2].chordName).toBe('Dm-Am');

    // 檢查目標段落音符
    const mainA = result.styleParsed.sections.find(s => s.name === 'Main A')!;
    const notes: any[] = [];
    result.styleParsed.tracks.forEach(trk => {
      let t = 0;
      trk.events.forEach(ev => {
        t += ev.delta;
        if (t >= mainA.startTick && t < mainA.endTick!) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            notes.push({ tickRel: t - mainA.startTick, note: ev.noteNumber, vel: ev.velocity, ch: ev.channel });
          }
        }
      });
    });

    // 第 1 拍 (tickRel = 0) 必須有 Bass (Channel 10, Note 36 C2)!
    const bassAtZero = notes.filter(n => n.tickRel === 0 && n.ch === 10);
    expect(bassAtZero.length).toBeGreaterThan(0);
    expect(bassAtZero[0].note % 12).toBe(0); // C 音 (36)

    // 檢查第 8 小節 (最後一小節，53760 ~ 61440 ticks) 伴奏音符飽滿，主歌伴奏不丟失
    const notesInLastBar = notes.filter(n => n.tickRel >= 53760 && n.tickRel < 61440);
    console.log(`Main A last bar notes count: ${notesInLastBar.length}`);
    expect(notesInLastBar.length).toBeGreaterThan(15);
  });
});
