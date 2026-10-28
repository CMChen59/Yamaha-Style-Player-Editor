/**
 * Yamaha PSR-SX920 專注創作台 (V2) 一鍵鋪滿乾淨覆蓋驗證測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PianoRollLite } from '../src/creator/piano-roll-lite';
import { DrumStepGrid } from '../src/creator/drum-step-grid';

describe('V2 Creator: 一鍵鋪滿 4 小節 (Clone First Bar) 徹底覆蓋驗證', () => {
  const originalDoc = (global as any).document;

  beforeEach(() => {
    (global as any).document = {
      createElement: () => ({
        className: '',
        innerHTML: '',
        style: {},
        dataset: {},
        appendChild: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {} },
      }),
    };
  });

  afterEach(() => {
    (global as any).document = originalDoc;
  });

  it('貝斯鋼琴捲軸：第 2 小節原有的殘留音符在一鍵鋪滿後應被徹底清除，與第 1 小節 100% 一致', () => {
    const container = document.createElement('div') as any;
    const pianoRoll = new PianoRollLite(container, 4);

    const stepsPerBar = pianoRoll.getStepsPerBar();
    expect(stepsPerBar).toBe(16);

    // 模擬：
    // 第 1 小節只有 step 0 有音符 (C1=36)
    // 第 2 小節原先有 step 20 (G1=43) 和 step 25 (E1=40)
    const initialPattern = new Map<number, number>();
    initialPattern.set(0, 36);  // Bar 1, step 0
    initialPattern.set(20, 43); // Bar 2, step 4 (舊殘留)
    initialPattern.set(25, 40); // Bar 2, step 9 (舊殘留)

    pianoRoll.setPatternData(initialPattern);

    // 執行一鍵鋪滿第 1 小節
    pianoRoll.cloneFirstBar();

    const resultPattern = pianoRoll.getPatternData();

    // 驗證第 1 小節：step 0 為 36
    expect(resultPattern.get(0)).toBe(36);

    // 驗證第 2 小節：
    // step 16 (Bar 2 第一步) 必須被鋪滿為 36
    expect(resultPattern.get(16)).toBe(36);
    // step 20 與 step 25 必須被徹底清除 (undefined)！
    expect(resultPattern.get(20)).toBeUndefined();
    expect(resultPattern.get(25)).toBeUndefined();

    // 驗證第 3 小節與第 4 小節：
    expect(resultPattern.get(32)).toBe(36);
    expect(resultPattern.get(48)).toBe(36);

    // 總共應該只有 4 個音符 (每小節剛好 1 個，位置分別為 0, 16, 32, 48)
    expect(resultPattern.size).toBe(4);
  });

  it('鼓組步進網格：第 2 小節原有的殘留音符在一鍵鋪滿後應被徹底覆蓋', () => {
    const container = document.createElement('div') as any;
    const drumGrid = new DrumStepGrid(container, 4);
    const stepsPerBar = drumGrid.getStepsPerBar();

    // 模擬：大鼓 (36) 在第 1 小節只在 step 0 有音符，第 2 小節在 step 20 有殘留音符
    const drumPattern = new Map<number, boolean[]>();
    const totalSteps = 4 * stepsPerBar;
    const kickSteps = new Array(totalSteps).fill(false);
    kickSteps[0] = true;
    kickSteps[20] = true; // Bar 2 舊殘留
    drumPattern.set(36, kickSteps);

    drumGrid.setPatternData(drumPattern);

    // 執行一鍵鋪滿
    drumGrid.cloneFirstBar();

    const resultPattern = drumGrid.getPatternData();
    const resultKick = resultPattern.get(36)!;

    // step 0, 16, 32, 48 應為 true
    expect(resultKick[0]).toBe(true);
    expect(resultKick[16]).toBe(true);
    expect(resultKick[32]).toBe(true);
    expect(resultKick[48]).toBe(true);

    // 舊殘留 step 20 必須為 false
    expect(resultKick[20]).toBe(false);
  });
});
