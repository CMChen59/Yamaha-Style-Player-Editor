import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Phase 1 Verification: SInt Isolation & Section Initial Controllers', () => {
  it('correctly isolates SInt baseline and captures section initial controllers in 容易受傷的女人.sty', () => {
    const filePath = fs.existsSync('d:/Keyboard/節奏檔/容易受傷的女人/容易受傷的女人.sty')
      ? 'd:/Keyboard/節奏檔/容易受傷的女人/容易受傷的女人.sty'
      : (fs.existsSync('samples/容易受傷的女人_keyboard.sty') ? 'samples/容易受傷的女人_keyboard.sty' : 'public/samples/1024_容易受傷的女人.sty');
    const buf = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    // 1. Verify parsed.parts baseline is NOT polluted by Ending A or Fill In BA
    const ch0 = parsed.parts.find(p => p.channel === 0);
    const ch1 = parsed.parts.find(p => p.channel === 1);
    const ch6 = parsed.parts.find(p => p.channel === 6);
    const ch9 = parsed.parts.find(p => p.channel === 9);

    expect(ch0).toBeDefined();
    // Ch 0 should have its SInt volume (0), NOT Ending A's 80
    expect(ch0!.volume).toBe(0);
    // Ch 0 should be Extra Part 1, NOT Sub Rhythm (Rhythm 1)
    expect(ch0!.partName).toBe('Extra Part 1');

    // Ch 1 (Bass) should have initial volume 108, NOT Fill In BA's 127
    expect(ch1).toBeDefined();
    expect(ch1!.volume).toBe(108);
    expect(ch1!.programChange).toBe(35); // 0-0-36 Fretless Bass

    // Ch 6 (Guitar) should have initial volume 90, NOT Fill In BA's 80
    expect(ch6).toBeDefined();
    expect(ch6!.volume).toBe(90);
    expect(ch6!.programChange).toBe(24); // 0-0-25 Nylon Guitar

    // Ch 9 (Drums) should have initial volume 117, NOT Ending A's 127
    expect(ch9).toBeDefined();
    expect(ch9!.volume).toBe(117);
    expect(ch9!.bankMsb).toBe(127);
    expect(ch9!.programChange).toBe(0); // 127-0-1 Real Drums

    // 2. Verify section initialControllers are accurately extracted
    const mainA = parsed.sections.find(s => s.name === 'Main A');
    expect(mainA).toBeDefined();
    expect(mainA!.initialControllers).toBeDefined();
    expect(mainA!.initialControllers![1]?.volume).toBe(108);
    expect(mainA!.initialControllers![5]?.volume).toBe(81);
    expect(mainA!.initialControllers![6]?.volume).toBe(90);
    expect(mainA!.initialControllers![9]?.volume).toBe(117);

    const endingA = parsed.sections.find(s => s.name === 'Ending A');
    expect(endingA).toBeDefined();
    expect(endingA!.initialControllers).toBeDefined();
    expect(endingA!.initialControllers![0]?.volume).toBe(80);
    expect(endingA!.initialControllers![0]?.programChange).toBe(103); // Sitar 0-0-104
    expect(endingA!.initialControllers![2]?.volume).toBe(119);
    expect(endingA!.initialControllers![9]?.volume).toBe(127);

    const fillInBA = parsed.sections.find(s => s.name === 'Fill In BA');
    expect(fillInBA).toBeDefined();
    expect(fillInBA!.initialControllers).toBeDefined();
    expect(fillInBA!.initialControllers![1]?.volume).toBe(127);
    expect(fillInBA!.initialControllers![5]?.volume).toBe(119);
    expect(fillInBA!.initialControllers![6]?.volume).toBe(80);
    expect(fillInBA!.initialControllers![9]?.volume).toBe(127);
  });

  it('correctly preserves SFF2 files like 4006_SX900.T547.sty', () => {
    const filePath = 'public/samples/4006_SX900.T547.sty';
    const buf = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    expect(parsed.format).toBe('STY');
    expect(parsed.parts.length).toBeGreaterThanOrEqual(8);
    const mainA = parsed.sections.find(s => s.name === 'Main A');
    expect(mainA).toBeDefined();
    expect(mainA!.initialControllers).toBeDefined();
  });
});
