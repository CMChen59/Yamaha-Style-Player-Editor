import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { StyLoader } from '../src/creator/sty-loader';
import { YamahaTemplateStyleSynthesizer } from '../src/core/writer/template-style-synthesizer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { findYamahaVoice } from '../src/core/data/yamaha-voices';

describe('StyLoader: 實體 STY 伴奏載入與解構驗證', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  it('能正確載入真實 PSR-SX900/SX920 STY 伴奏檔並解構出完整段落與音軌', () => {
    expect(fs.existsSync(samplePath)).toBe(true);
    const buf = fs.readFileSync(samplePath);
    const bytes = new Uint8Array(buf);

    const result = StyLoader.loadFromBytes(bytes, '4006_SX900.T547.sty');

    expect(result.fileName).toBe('4006_SX900.T547.sty');
    expect(result.bpm).toBeGreaterThan(60);
    expect(result.timeSignature.numerator).toBe(4);
    expect(result.timeSignature.denominator).toBe(4);
    expect(result.division).toBeGreaterThan(0);

    // 驗證解析出之段落清單
    expect(result.sections.size).toBeGreaterThan(5);
    expect(result.sections.has('Main A')).toBe(true);
    expect(result.sections.has('Main B')).toBe(true);
    expect(result.sections.has('Intro A')).toBe(true);
    expect(result.sections.has('Break')).toBe(true); // Fill In BA 對應至 Break

    // 檢查 Main A 音符資料
    const mainA = result.sections.get('Main A')!;
    expect(mainA.bars).toBeGreaterThanOrEqual(1);

    // 驗證鼓組點陣圖有打擊點
    let drumNoteCount = 0;
    mainA.drumPattern.forEach(steps => {
      drumNoteCount += steps.filter(Boolean).length;
    });
    expect(drumNoteCount).toBeGreaterThan(0);

    // 驗證貝斯音符
    expect(mainA.bassPattern.size).toBeGreaterThan(0);

    // 驗證和弦音符
    expect(mainA.chordPattern.size).toBeGreaterThan(0);

    // 驗證收集到的打擊樂器清單包含大鼓 (35 或 36) 與打擊樂器
    const hasKick = result.activeDrumNotes.includes(35) || result.activeDrumNotes.includes(36);
    expect(hasKick).toBe(true);
    expect(result.activeDrumNotes.length).toBeGreaterThan(5);

    // 驗證動態伴奏聲部
    console.log('載入成功摘要:', result.summary);
    console.log('動態啟用的聲部:', result.activeDynamicPartIds);

    // 驗證真實音樂表現力數據 (Real Velocity, Duration, CCs, Strumming)
    expect(mainA.drumMeta).toBeDefined();
    expect(mainA.drumMeta!.size).toBeGreaterThan(0);
    const firstDrumMeta = mainA.drumMeta!.values().next().value;
    expect(firstDrumMeta.velocity).toBeGreaterThan(0);
    expect(firstDrumMeta.durationMs).toBeGreaterThan(0);

    expect(mainA.bassMeta).toBeDefined();
    expect(mainA.bassMeta!.size).toBeGreaterThan(0);
    const firstBassMeta = mainA.bassMeta!.values().next().value;
    expect(firstBassMeta.velocity).toBeGreaterThan(0);
    expect(firstBassMeta.durationMs).toBeGreaterThan(0);

    expect(mainA.chordMeta).toBeDefined();
    expect(mainA.chordMeta!.size).toBeGreaterThan(0);

    // 驗證連續控制器事件 (CC 11 Expression, Pitch Bend 等)
    expect(mainA.ccEvents).toBeDefined();
    console.log('Main A CC 表現力事件數量:', mainA.ccEvents?.length);
    console.log('Main A 滑音輪事件數量:', mainA.pitchBendEvents?.length);

    // ✨ 驗證 100% 原檔 Bank MSB/LSB/PC 無損定址與全音色庫精準映射
    // 1. 主鼓組：應為 Pop Drum Kit (Bank 127-0, PC 89)，絕非預設之 Standard Kit 1 (PC 0)
    expect(result.drumKit.pc).toBe(89);
    expect(result.drumKit.msb).toBe(127);
    expect(result.drumKit.lsb).toBe(0);
    expect(result.drumKit.name).toContain('Pop Drum Kit');

    // 2. 貝斯：應為 Finger Bass Live! (Bank 104-2, PC 33)，保留旗艦 S.Art! 身分證
    expect(result.bassVoice.pc).toBe(33);
    expect(result.bassVoice.msb).toBe(104);
    expect(result.bassVoice.lsb).toBe(2);
    expect(result.bassVoice.name).toContain('Finger Bass');

    // 3. 和弦 1：應為 CFX Concert Grand (Bank 104-1, PC 0)
    expect(result.chordVoice.pc).toBe(0);
    expect(result.chordVoice.msb).toBe(104);
    expect(result.chordVoice.lsb).toBe(1);

    // 4. 和弦 2：應為 SteelGuitarTwin2 (Bank 104-13, PC 25)，絕非 GM Steel Guitar (0-0-25)
    expect(result.dynamicVoices.Chord2).toBeDefined();
    expect(result.dynamicVoices.Chord2.pc).toBe(25);
    expect(result.dynamicVoices.Chord2.msb).toBe(104);
    expect(result.dynamicVoices.Chord2.lsb).toBe(13);
    expect(result.dynamicVoices.Chord2.name).toContain('SteelGuitarTwin2');

    // 5. Phrase 2：應為 Warm Pad (Bank 104-0, PC 89)，絕非 GM 0-0-89
    expect(result.dynamicVoices.Phrase2).toBeDefined();
    expect(result.dynamicVoices.Phrase2.pc).toBe(89);
    expect(result.dynamicVoices.Phrase2.msb).toBe(104);
    expect(result.dynamicVoices.Phrase2.lsb).toBe(0);

    // 6. 段落專屬音色切換 (Intro A 專屬切換 FlamencoGuitar2)
    const introA = result.sections.get('Intro A');
    expect(introA).toBeDefined();
    expect(introA?.sectionVoices).toBeDefined();
    expect(introA?.sectionVoices?.[11]).toEqual(expect.objectContaining({
      msb: 8,
      lsb: 34,
      pc: 0,
    }));
  });

  it('載入 STY 後修改音符並透過 TemplateSynthesizer 再度合成，音符成功更新且保留原曲結構', () => {
    const buf = fs.readFileSync(samplePath);
    const bytes = new Uint8Array(buf);
    const result = StyLoader.loadFromBytes(bytes, '4006_SX900.T547.sty');

    const mainA = result.sections.get('Main A')!;
    // 在 Main A 第 1 步進 (step 0) 人工加入一個明顯標記音符 (例如 Ride 51 與 Crash 49)
    if (!mainA.drumPattern.has(49)) {
      mainA.drumPattern.set(49, new Array(mainA.bars * 16).fill(false));
    }
    mainA.drumPattern.get(49)![0] = true;

    // 將解構出的 sections 轉入 TemplateSynthesizer 進行合成
    const sectionsInput = Array.from(result.sections.values()).map(s => ({
      name: s.name,
      bars: s.bars,
      stepsPerBar: 16,
      drumPattern: s.drumPattern,
      bassPattern: s.bassPattern,
      chordPattern: s.chordPattern,
      dynamicPatterns: s.dynamicPatterns,
    }));

    const exportedBytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
      styleName: 'Modified_SX900',
      bpm: result.bpm,
      drumKit: { msb: result.drumKit.msb, lsb: result.drumKit.lsb, pc: result.drumKit.pc },
      rhythm1Kit: result.rhythm1Kit ? { msb: result.rhythm1Kit.msb, lsb: result.rhythm1Kit.lsb, pc: result.rhythm1Kit.pc } : undefined,
      bassVoice: { msb: result.bassVoice.msb, lsb: result.bassVoice.lsb, pc: result.bassVoice.pc },
      chordVoice: { msb: result.chordVoice.msb, lsb: result.chordVoice.lsb, pc: result.chordVoice.pc },
      dynamicVoices: {
        Chord2: result.dynamicVoices.Chord2 ? { msb: result.dynamicVoices.Chord2.msb, lsb: result.dynamicVoices.Chord2.lsb, pc: result.dynamicVoices.Chord2.pc } : undefined,
        Pad: result.dynamicVoices.Pad ? { msb: result.dynamicVoices.Pad.msb, lsb: result.dynamicVoices.Pad.lsb, pc: result.dynamicVoices.Pad.pc } : undefined,
        Phrase1: result.dynamicVoices.Phrase1 ? { msb: result.dynamicVoices.Phrase1.msb, lsb: result.dynamicVoices.Phrase1.lsb, pc: result.dynamicVoices.Phrase1.pc } : undefined,
        Phrase2: result.dynamicVoices.Phrase2 ? { msb: result.dynamicVoices.Phrase2.msb, lsb: result.dynamicVoices.Phrase2.lsb, pc: result.dynamicVoices.Phrase2.pc } : undefined,
      },
      sections: sectionsInput,
    });

    expect(exportedBytes).toBeDefined();
    expect(exportedBytes.length).toBeGreaterThan(10000);

    // 逆向驗證匯出檔案
    const parsedExport = YamahaParser.parse(exportedBytes, 'STY');
    expect(parsedExport.format).toBe('STY');
    expect(parsedExport.division).toBe(1920);

    // 驗證 Main A 中確實包含修改後之 NoteOn
    const tr0 = parsedExport.tracks[0];
    let t = 0;
    let mainACrashFound = false;

    const mainASec = parsedExport.sections.find(s => s.name === 'Main A')!;
    expect(mainASec).toBeDefined();

    for (const ev of tr0.events) {
      t += ev.delta;
      if (t >= mainASec.startTick && (mainASec.endTick === undefined || t < mainASec.endTick)) {
        if (ev.type === 'noteOn' && ev.noteNumber === 49 && (ev.velocity ?? 0) > 0) {
          mainACrashFound = true;
          break;
        }
      }
    }

    expect(mainACrashFound).toBe(true);
  });

  it('能精確解析各段落專屬音色與 Bank MSB/LSB/PC 身分證', () => {
    const buf = fs.readFileSync(samplePath);
    const result = StyLoader.loadFromBytes(new Uint8Array(buf), '4006_SX900.T547.sty');

    // 驗證 Main A 各通道繼承或自訂之音色
    const mainA = result.sections.get('Main A')!;
    expect(mainA).toBeDefined();
    expect(mainA.sectionVoices).toBeDefined();

    // 驗證 Intro A 專屬切換音色 (Ch 11: FlamencoGuitar2 Bank 8-34 PC 0)
    const introA = result.sections.get('Intro A')!;
    expect(introA).toBeDefined();
    expect(introA.sectionVoices).toBeDefined();
    const ch11Voice = introA.sectionVoices?.[11];
    expect(ch11Voice).toBeDefined();
    expect(ch11Voice?.msb).toBe(8);
    expect(ch11Voice?.lsb).toBe(34);
    expect(ch11Voice?.pc).toBe(0);
    expect(ch11Voice?.name).toContain('NylonGuitar');
  });

  it('深度剖析 Intro B 的所有音軌、音符、音色與吉他聲部', () => {
    const buf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    const result = StyLoader.loadFromBytes(new Uint8Array(buf), '4006_SX900.T547.sty');

    const introBSec = parsed.sections.find(s => s.name === 'Intro B')!;
    console.log('--- INTRO B SECTION INFO ---');
    console.log(`Intro B: startTick=${introBSec.startTick}, endTick=${introBSec.endTick}, measureCount=${introBSec.measureCount}`);

    const tr0 = parsed.tracks[0];
    let tick = 0;
    const introBEvents: any[] = [];
    const notesByChannel: Record<number, any[]> = {};
    const ccByChannel: Record<number, any[]> = {};

    for (const ev of tr0.events) {
      tick += ev.delta;
      if (tick >= introBSec.startTick && (introBSec.endTick === undefined || tick < introBSec.endTick)) {
        introBEvents.push({ tick, ...ev });
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
          if (!notesByChannel[ev.channel]) notesByChannel[ev.channel] = [];
          notesByChannel[ev.channel].push({ tick, note: ev.noteNumber, vel: ev.velocity });
        } else if (ev.type === 'controlChange' || ev.type === 'programChange') {
          if (!ccByChannel[ev.channel]) ccByChannel[ev.channel] = [];
          ccByChannel[ev.channel].push({ tick, type: ev.type, controller: (ev as any).controller, val: (ev as any).value ?? (ev as any).program });
        }
      }
    }

    console.log('--- INTRO B CHANNELS WITH NOTES ---');
    for (const [ch, notes] of Object.entries(notesByChannel)) {
      console.log(`Channel ${ch}: ${notes.length} notes, note range: [${Math.min(...notes.map(n => n.note))} ~ ${Math.max(...notes.map(n => n.note))}], vel range: [${Math.min(...notes.map(n => n.vel))} ~ ${Math.max(...notes.map(n => n.vel))}]`);
      console.log(`   Sample notes on Ch ${ch}:`, notes.slice(0, 5));
    }

    console.log('--- DEEP INSPECTION OF 1024_容易受傷的女人.sty ---');
    const rPath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    if (fs.existsSync(rPath)) {
      const rBuf = fs.readFileSync(rPath);
      const rParsed = YamahaParser.parse(new Uint8Array(rBuf), 'STY');
      const rLoaded = StyLoader.loadFromBytes(new Uint8Array(rBuf), '1024_容易受傷的女人.sty');
      
      const rIntroB = rParsed.sections.find(s => s.name === 'Intro B');
      console.log('1024 Intro B parsed section:', rIntroB);
      if (rIntroB) {
        // Collect all events in Intro B
        let t = 0;
        const introEvents: any[] = [];
        for (const ev of rParsed.tracks[0].events) {
          t += ev.delta;
          if (t >= rIntroB.startTick && (rIntroB.endTick === undefined || t < rIntroB.endTick)) {
            introEvents.push({ tick: t, ...ev });
          }
        }
        console.log(`Intro B total events: ${introEvents.length}`);
        
        // Print CC0, CC32, PC, NoteOn for each channel in Intro B
        const chSummary: Record<number, { notes: number; msb?: number; lsb?: number; pc?: number; name?: string }> = {};
        for (const ev of introEvents) {
          if (!chSummary[ev.channel]) chSummary[ev.channel] = { notes: 0 };
          if (ev.type === 'controlChange') {
            if (ev.controller === 0) chSummary[ev.channel].msb = ev.value;
            if (ev.controller === 32) chSummary[ev.channel].lsb = ev.value;
          } else if (ev.type === 'programChange') {
            chSummary[ev.channel].pc = ev.program;
          } else if (ev.type === 'noteOn' && ev.velocity > 0) {
            chSummary[ev.channel].notes++;
          }
        }
        for (const [ch, s] of Object.entries(chSummary)) {
          const v = (s.msb !== undefined && s.lsb !== undefined && s.pc !== undefined)
            ? findYamahaVoice(s.msb, s.lsb, s.pc)
            : undefined;
          console.log(`  Ch ${ch}: notes=${s.notes}, MSB=${s.msb}, LSB=${s.lsb}, PC=${s.pc} (${(s.pc ?? 0) + 1}) => ${v?.name}`);
        }

        const loadedSec = rLoaded.sections.get('Intro B');
        console.log('rLoaded Intro B:', {
          drumNotes: loadedSec?.drumPattern.size,
          bassNotes: loadedSec?.bassPattern.size,
          chordNotes: loadedSec?.chordPattern.size,
          dynamicPhrase1: loadedSec?.dynamicPatterns?.Phrase1.size,
          dynamicChord2: loadedSec?.dynamicPatterns?.Chord2.size,
          sectionVoices: loadedSec?.sectionVoices,
        });
      }

      for (const s of rParsed.sections) {
        console.log(`  Section: ${s.name}, startTick=${s.startTick}, endTick=${s.endTick}`);
      }
      console.log('1024 Parts:');
      for (const p of rParsed.parts) {
        const v = findYamahaVoice(p.bankMsb ?? 0, p.bankLsb ?? 0, p.programChange);
        console.log(`  Part Ch ${p.channel} (${p.name}): MSB=${p.bankMsb}, LSB=${p.bankLsb}, PC=${p.programChange} (${p.programChange + 1}) => ${v?.name}`);
      }

      console.log('1024 track count:', rParsed.tracks.length);
      rParsed.tracks.forEach((tr, idx) => {
        let t = 0;
        for (const ev of tr.events) {
          t += ev.delta;
          if (ev.type === 'programChange') {
            console.log(`Track ${idx} (${tr.name}) tick ${t} Ch ${ev.channel} PC=${ev.program}`);
          }
        }
      });
    }
  });

  it('驗證 1024_容易受傷的女人.sty 之 CASM 路由與 Intro B 破音電吉他 (DistortionGuitar 0-112-031)', () => {
    const rPath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    if (!fs.existsSync(rPath)) return;

    const rBuf = fs.readFileSync(rPath);
    const result = StyLoader.loadFromBytes(new Uint8Array(rBuf), '1024_容易受傷的女人.sty');

    // 1. 驗證 Intro B 存在且小節數正確 (8 小節)
    const introB = result.sections.get('Intro B');
    expect(introB).toBeDefined();
    expect(introB!.bars).toBe(8);

    // 2. 驗證 CASM 將 Channel 2 精準指派至 Phrase 1 (Phr 1)
    expect(introB!.dynamicPatterns?.Phrase1).toBeDefined();
    let phrase1NoteCount = 0;
    introB!.dynamicPatterns!.Phrase1.forEach(set => {
      phrase1NoteCount += set.size;
    });
    // Intro B 包含 46 顆吉他音符 (原軌道共 47 顆 NoteOn)
    expect(phrase1NoteCount).toBeGreaterThanOrEqual(40);

    // 3. 驗證 Phrase 1 的音色為 DistortionGuitar (Bank 0-112, PC 30，琴端顯示 0-112-031)
    expect(introB!.sectionVoices).toBeDefined();
    const ch2Voice = introB!.sectionVoices?.[2];
    expect(ch2Voice).toBeDefined();
    expect(ch2Voice?.msb).toBe(0);
    expect(ch2Voice?.lsb).toBe(112);
    expect(ch2Voice?.pc).toBe(30);
    expect(ch2Voice?.name).toContain('DistortionGuitar');

    // 4. 驗證 CASM 鏡像通道 14 亦同步擁有 DistortionGuitar
    const ch14Voice = introB!.sectionVoices?.[14];
    expect(ch14Voice).toBeDefined();
    expect(ch14Voice?.msb).toBe(0);
    expect(ch14Voice?.lsb).toBe(112);
    expect(ch14Voice?.pc).toBe(30);
    expect(ch14Voice?.name).toContain('DistortionGuitar');

    // 5. 驗證 Channel 6 依 CASM 路由指派至 Chord 1 (SteelGuitarTwin2)
    let chord1NoteCount = 0;
    introB!.chordPattern.forEach(set => chord1NoteCount += set.size);
    expect(chord1NoteCount).toBeGreaterThan(0);
  });
});
