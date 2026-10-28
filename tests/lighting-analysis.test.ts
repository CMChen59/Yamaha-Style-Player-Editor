import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { StyLoader } from '../src/creator/sty-loader';

describe('Yamaha STY 段落亮燈與資料底層邏輯深度剖析', () => {
  it('剖析 1024_容易受傷的女人.sty 之段落 Marker、音符分佈與琴端實體按鍵亮燈機制', () => {
    const filePath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    const buf = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    console.log('PARSED BPM:', parsed.bpm, 'division:', parsed.division);

    // 檢查 Main A 的鼓組與時鐘
    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    let tCur = 0;
    console.log('=== MAIN A DRUM EVENTS (first 2 bars) ===');
    for (const ev of parsed.tracks[0].events) {
      tCur += ev.delta;
      if (tCur >= mainA.startTick && tCur < mainA.startTick + 1920 * 8) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && (ev.channel === 9 || ev.channel === 8)) {
          const rel = tCur - mainA.startTick;
          const beat = (rel / 1920) + 1;
          console.log(`Tick ${rel} (Beat ${beat.toFixed(2)}): Note ${ev.noteNumber} Vel ${ev.velocity}`);
        }
      }
    }

    console.log('=== 1024_容易受傷的女人.sty 段落詳細清單 ===');
    for (const s of parsed.sections) {
      let noteCount = 0;
      let t = 0;
      const chNotes: Record<number, number> = {};
      for (const ev of parsed.tracks[0].events) {
        t += ev.delta;
        if (t >= s.startTick && (s.endTick === undefined || t < s.endTick)) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
            noteCount++;
            chNotes[ev.channel] = (chNotes[ev.channel] || 0) + 1;
          }
        }
      }
      const chStr = Object.entries(chNotes).map(([ch, n]) => `Ch${ch}:${n}`).join(' ');
      console.log(`段落 [${s.name.padEnd(12)}]: 起始=${s.startTick.toString().padStart(6)}, 結束=${(s.endTick ?? 0).toString().padStart(6)}, 小節數=${s.measureCount ?? 0}, 音符數=${noteCount} (${chStr})`);
    }

    console.log('\n=== PSR-SX920 琴端面板 15 大按鍵亮燈判定 ===');
    const ALL_PANEL_BUTTONS = [
      { id: 'Intro A', label: 'INTRO [I]' },
      { id: 'Intro B', label: 'INTRO [II]' },
      { id: 'Intro C', label: 'INTRO [III]' },
      { id: 'Main A', label: 'MAIN [A]' },
      { id: 'Main B', label: 'MAIN [B]' },
      { id: 'Main C', label: 'MAIN [C]' },
      { id: 'Main D', label: 'MAIN [D]' },
      { id: 'Fill In AA', label: 'AUTO FILL [A->A]' },
      { id: 'Fill In BB', label: 'AUTO FILL [B->B]' },
      { id: 'Fill In CC', label: 'AUTO FILL [C->C]' },
      { id: 'Fill In DD', label: 'AUTO FILL [D->D]' },
      { id: 'Break', altId: 'Fill In BA', label: 'BREAK' },
      { id: 'Ending A', label: 'ENDING [I]' },
      { id: 'Ending B', label: 'ENDING [II]' },
      { id: 'Ending C', label: 'ENDING [III]' }
    ];

    for (const btn of ALL_PANEL_BUTTONS) {
      let sec = parsed.sections.find(s => s.name.toLowerCase() === btn.id.toLowerCase());
      if (!sec && btn.altId) {
        sec = parsed.sections.find(s => s.name.toLowerCase() === btn.altId.toLowerCase());
      }

      if (!sec) {
        console.log(`🔘 面板按鍵 ${btn.label.padEnd(18)}: ❌ 熄滅 (檔案中無此段落 Marker)`);
        continue;
      }

      // 計算該段落是否有音符
      let notes = 0;
      let t = 0;
      for (const ev of parsed.tracks[0].events) {
        t += ev.delta;
        if (t >= sec.startTick && (sec.endTick === undefined || t < sec.endTick)) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) notes++;
        }
      }

      const hasCasm = parsed.casmMappings?.[sec.name.toLowerCase()] !== undefined;

      console.log(`🔘 面板按鍵 ${btn.label.padEnd(18)}: ${notes > 0 ? '🟢 亮燈 (有資料)' : '⚪ 熄滅/半暗 (空段落)'} | Marker: "${sec.name}" | 小節: ${sec.measureCount} | 音符數: ${notes} | CASM設定: ${hasCasm ? 'YES' : 'NO'}`);
    }
  });

  it('深度剖析 Intro A 的 CASM 路由、軌道音符與 CreatorApp 狀態', () => {
    const filePath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    const buf = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    console.log('PARSED BPM:', parsed.bpm, 'division:', parsed.division);

    // 檢查 Main A 的鼓組與時鐘
    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    let tCur = 0;
    console.log('=== MAIN A DRUM EVENTS (first 2 bars) ===');
    for (const ev of parsed.tracks[0].events) {
      tCur += ev.delta;
      if (tCur >= mainA.startTick && tCur < mainA.startTick + 1920 * 8) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && (ev.channel === 9 || ev.channel === 8)) {
          const rel = tCur - mainA.startTick;
          const beat = (rel / 1920) + 1;
          console.log(`Tick ${rel} (Beat ${beat.toFixed(2)}): Note ${ev.noteNumber} Vel ${ev.velocity}`);
        }
      }
    }

    console.log('=== CASM Mappings for all sections ===');
    console.log(parsed.casmMappings);

    const introASec = parsed.sections.find(s => s.name === 'Intro A')!;
    console.log('Intro A section header:', introASec);

    let t = 0;
    const introANotesByCh: Record<number, any[]> = {};
    const introAPCsByCh: Record<number, number> = {};
    const introACCsByCh: Record<number, { msb?: number; lsb?: number }> = {};

    for (const ev of parsed.tracks[0].events) {
      t += ev.delta;
      if (t >= introASec.startTick && (introASec.endTick === undefined || t < introASec.endTick)) {
        if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.channel !== undefined) {
          if (!introANotesByCh[ev.channel]) introANotesByCh[ev.channel] = [];
          introANotesByCh[ev.channel].push({ tick: t, relTick: t - introASec.startTick, note: ev.noteNumber, vel: ev.velocity });
        } else if (ev.type === 'programChange' && ev.channel !== undefined && ev.program !== undefined) {
          introAPCsByCh[ev.channel] = ev.program;
        } else if (ev.type === 'controlChange' && ev.channel !== undefined && (ev.controller === 0 || ev.controller === 32)) {
          if (!introACCsByCh[ev.channel]) introACCsByCh[ev.channel] = {};
          if (ev.controller === 0) introACCsByCh[ev.channel].msb = ev.value;
          if (ev.controller === 32) introACCsByCh[ev.channel].lsb = ev.value;
        }
      }
    }

    const casmIntroA = parsed.casmMappings?.['intro a'];
    console.log('=== INTRO A CHANNEL NOTES & DESTINATIONS ===');
    for (const [chStr, notes] of Object.entries(introANotesByCh)) {
      const ch = parseInt(chStr, 10);
      const dest = casmIntroA ? casmIntroA[ch] : 'none';
      const msb = introACCsByCh[ch]?.msb;
      const lsb = introACCsByCh[ch]?.lsb;
      const pc = introAPCsByCh[ch];
      const noteNums = notes.map(n => n.note);
      const minNote = Math.min(...noteNums);
      const maxNote = Math.max(...noteNums);
      console.log(`Ch ${ch} -> Dest ${dest}: count=${notes.length}, min=${minNote}, max=${maxNote}, notes=[${noteNums.join(', ')}]`);
    }

    // Now load with StyLoader
    const result = StyLoader.loadFromBytes(new Uint8Array(buf), '1024_容易受傷的女人.sty');
    const loadedIntroA = result.sections.get('Intro A');

    console.log('=== LOADED INTRO A IN STYLOADER ===');
    console.log('Intro A bars:', loadedIntroA?.bars);
    console.log('Intro A drumPattern size:', loadedIntroA?.drumPattern.size);
    console.log('Intro A bassPattern size:', loadedIntroA?.bassPattern.size);
    console.log('Intro A chordPattern size:', loadedIntroA?.chordPattern.size);
    let chordNoteCount = 0;
    loadedIntroA?.chordPattern.forEach(s => chordNoteCount += s.size);
    console.log('Intro A chordPattern total notes:', chordNoteCount);
    console.log('Intro A dynamicPatterns:');
    for (const [part, pat] of Object.entries(loadedIntroA?.dynamicPatterns || {})) {
      let cnt = 0;
      (pat as Map<number, Set<number>>).forEach(s => cnt += s.size);
      console.log(`  Part ${part}: ${cnt} notes (pattern keys: ${(pat as any).size})`);
    }
    console.log('Intro A sectionVoices:', loadedIntroA?.sectionVoices);
    console.log('Global dynamicVoices:', result.dynamicVoices);
    console.log('=== ALL SECTIONS VOICES SUMMARY IN STYLOADER ===');
    for (const [secName, secData] of result.sections.entries()) {
      const v11 = secData.sectionVoices?.[11]?.name || 'default';
      const v13 = secData.sectionVoices?.[13]?.name || 'default';
      const v14 = secData.sectionVoices?.[14]?.name || 'default';
      const v15 = secData.sectionVoices?.[15]?.name || 'default';
      console.log(`[${secName.padEnd(12)}]: Ch11(Chd1)=${v11} | Ch13(Pad)=${v13} | Ch14(Phr1)=${v14} | Ch15(Phr2)=${v15}`);
    }
  });
});
