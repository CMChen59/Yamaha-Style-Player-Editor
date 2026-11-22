import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaPadModifier } from '../src/core/writer/pad-modifier';
import { CasmModifier } from '../src/core/writer/casm-modifier';

describe('Generate 1122-06.sty: Eliminate Main C/D Bleed Crash Cymbal & Fix Pad CASM NTT', () => {
  it('cleans Main C/D boundary bleed and optimizes CASM', () => {
    const f05 = new Uint8Array(fs.readFileSync('tests/1122-05-clean.sty'));
    const parsed = YamahaParser.parse(f05, 'STY');

    const mainA = parsed.sections.find(s => s.name === 'Main A')!;
    const mainB = parsed.sections.find(s => s.name === 'Main B')!;
    const mainC = parsed.sections.find(s => s.name === 'Main C')!;
    const mainD = parsed.sections.find(s => s.name === 'Main D')!;
    const introB = parsed.sections.find(s => s.name === 'Intro B')!;
    const endingA = parsed.sections.find(s => s.name === 'Ending A')!;

    // 1. Identify bleed note events to remove:
    // Main C:
    // - NoteOn at startTick: Ch 9 Note 49 vel 112, Ch 11 Note 60 vel 85
    // - NoteOff: Ch 9 Note 49 at rel=1200, Ch 11 Note 60 at rel=320
    // Main D:
    // - NoteOn at startTick: Ch 9 Note 49 vel 110
    // - NoteOff: Ch 9 Note 49 at rel=6000

    let curTick = 0;
    const keptEvents: any[] = [];
    let removedCount = 0;

    parsed.tracks[0].events.forEach(ev => {
      curTick += ev.delta;

      let isBleed = false;
      const relC = curTick - mainC.startTick;
      const relD = curTick - mainD.startTick;

      // Check Main C
      if (curTick >= mainC.startTick && curTick < mainC.endTick) {
        if (relC === 0) {
          if (ev.type === 'noteOn' && ev.channel === 9 && (ev as any).noteNumber === 49 && (ev as any).velocity === 112) {
            isBleed = true;
          }
          if (ev.type === 'noteOn' && ev.channel === 11 && (ev as any).noteNumber === 60 && (ev as any).velocity === 85) {
            isBleed = true;
          }
        } else if (relC === 320) {
          if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) && ev.channel === 11 && (ev as any).noteNumber === 60) {
            isBleed = true;
          }
        } else if (relC === 1200) {
          if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) && ev.channel === 9 && (ev as any).noteNumber === 49) {
            isBleed = true;
          }
        }
      }

      // Check Main D
      if (curTick >= mainD.startTick && curTick < mainD.endTick) {
        if (relD === 0) {
          if (ev.type === 'noteOn' && ev.channel === 9 && (ev as any).noteNumber === 49 && (ev as any).velocity === 110) {
            isBleed = true;
          }
        } else if (relD === 6000) {
          if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && (ev as any).velocity === 0)) && ev.channel === 9 && (ev as any).noteNumber === 49) {
            isBleed = true;
          }
        }
      }

      if (isBleed) {
        removedCount++;
        console.log(`[Removed Bleed] tick=${curTick} type=${ev.type} Ch=${ev.channel} Note=${(ev as any).noteNumber} vel=${(ev as any).velocity}`);
      } else {
        keptEvents.push({ ev, absTick: curTick });
      }
    });

    console.log(`Total bleed events removed: ${removedCount}`);
    expect(removedCount).toBe(6); // 2 NoteOn + 2 NoteOff for Main C, 1 NoteOn + 1 NoteOff for Main D

    // Reconstruct delta ticks
    let prevTick = 0;
    const newEvents: any[] = [];
    keptEvents.forEach(item => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      newEvents.push({ ...item.ev, delta });
    });

    parsed.tracks[0].events = newEvents;
    YamahaPadModifier.rebuildTrackRawChunk(parsed.tracks[0]);

    // 2. Optimize CASM: Set Ch 14 NTT = Chord in Main C and Main D, Ch 15 NTT = Chord in Main B
    const rulesC = CasmModifier.extractPartRules(parsed, 'Main C');
    const ch14RuleC = rulesC.find(r => r.channel === 14);
    if (ch14RuleC) {
      ch14RuleC.ntt = 'Chord';
      CasmModifier.injectOrUpdateSectionCasmRule(parsed, 'Main C', 14, ch14RuleC);
    }

    const rulesD = CasmModifier.extractPartRules(parsed, 'Main D');
    const ch14RuleD = rulesD.find(r => r.channel === 14);
    if (ch14RuleD) {
      ch14RuleD.ntt = 'Chord';
      CasmModifier.injectOrUpdateSectionCasmRule(parsed, 'Main D', 14, ch14RuleD);
    }

    const rulesB = CasmModifier.extractPartRules(parsed, 'Main B');
    const ch15RuleB = rulesB.find(r => r.channel === 15);
    if (ch15RuleB) {
      ch15RuleB.ntt = 'Chord';
      CasmModifier.injectOrUpdateSectionCasmRule(parsed, 'Main B', 15, ch15RuleB);
    }

    // 3. Export to tests/1122-06-clean.sty
    const exportedBytes = YamahaWriter.write(parsed);
    fs.writeFileSync('tests/1122-06-clean.sty', exportedBytes);
    console.log(`Exported 1122-06-clean.sty (${exportedBytes.length} bytes) to tests!`);

    // 4. Verify the newly generated file
    const verifyParsed = YamahaParser.parse(new Uint8Array(fs.readFileSync('tests/1122-06-clean.sty')), 'STY');
    const secC = verifyParsed.sections.find(s => s.name === 'Main C')!;
    const secD = verifyParsed.sections.find(s => s.name === 'Main D')!;

    // Verify Main C rel = 0 has NO Note 49 and NO Note 60 on Ch 11
    let t = 0;
    let mainCRel0Notes: string[] = [];
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === secC.startTick && ev.type === 'noteOn' && (ev as any).velocity > 0) {
        mainCRel0Notes.push(`Ch${ev.channel}:${(ev as any).noteNumber}`);
      }
    });
    console.log(`Verified Main C rel=0 notes: ${mainCRel0Notes.join(', ')}`);
    expect(mainCRel0Notes.includes('Ch9:49')).toBe(false);
    expect(mainCRel0Notes.includes('Ch11:60')).toBe(false);

    // Verify Main D rel = 0 has NO Note 49
    t = 0;
    let mainDRel0Notes: string[] = [];
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t === secD.startTick && ev.type === 'noteOn' && (ev as any).velocity > 0) {
        mainDRel0Notes.push(`Ch${ev.channel}:${(ev as any).noteNumber}`);
      }
    });
    console.log(`Verified Main D rel=0 notes: ${mainDRel0Notes.join(', ')}`);
    expect(mainDRel0Notes.includes('Ch9:49')).toBe(false);

    // Verify CASM NTT = Chord
    const verifyRulesC = CasmModifier.extractPartRules(verifyParsed, 'Main C');
    expect(verifyRulesC.find(r => r.channel === 14)?.ntt).toBe('Chord');

    const verifyRulesD = CasmModifier.extractPartRules(verifyParsed, 'Main D');
    expect(verifyRulesD.find(r => r.channel === 14)?.ntt).toBe('Chord');

    // Verify Intro B & Ending A remain 100% intact
    const verifyRulesIB = CasmModifier.extractPartRules(verifyParsed, 'Intro B');
    expect(verifyRulesIB.find(r => r.channel === 15)?.sourceChordRoot).toBe(0);

    const verifyRulesEA = CasmModifier.extractPartRules(verifyParsed, 'Ending A');
    expect(verifyRulesEA.find(r => r.channel === 10)?.sourceChordRoot).toBe(0);

    let introBCC1 = 0;
    let introBGhostCC11 = 0;
    t = 0;
    verifyParsed.tracks[0].events.forEach(ev => {
      t += ev.delta;
      if (t >= introB.startTick && t < introB.endTick) {
        if (ev.type === 'controlChange' && ev.controller === 11 && t > introB.startTick) introBGhostCC11++;
        if (ev.type === 'controlChange' && ev.controller === 1 && ev.channel === 15) introBCC1++;
      }
    });
    expect(introBCC1).toBe(152);
    expect(introBGhostCC11).toBe(0);
  });
});
