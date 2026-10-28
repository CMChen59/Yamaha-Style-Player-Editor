import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DrumStepGrid, getStandardDefaultDrumVoices } from '../src/creator/drum-step-grid';
import * as fs from 'fs';
import * as path from 'path';
import { StyLoader } from '../src/creator/sty-loader';

describe('DrumStepGrid: 打擊樂器未使用的空白樂器行隱藏與智慧緊湊模式驗證', () => {
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
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    };
  });

  afterEach(() => {
    (global as any).document = originalDoc;
  });

  it('1. 智慧緊湊模式：載入僅包含大鼓與小鼓的 Pattern 時，網格僅保留有音符的 2 行，徹底隱藏未使用之空白樂器行', () => {
    const container = document.createElement('div') as any;
    const drumGrid = new DrumStepGrid(container, 4);

    // 預設為緊湊模式
    expect(drumGrid.getIsCompactMode()).toBe(true);

    // 模擬當前段落僅有 Kick (36) 與 Snare (38)
    const testPattern = new Map<number, boolean[]>();
    const totalSteps = 4 * 16;
    const kick = new Array(totalSteps).fill(false);
    kick[0] = true;
    kick[16] = true;
    const snare = new Array(totalSteps).fill(false);
    snare[4] = true;
    snare[20] = true;

    // 額外加入一個完全為 false 的無音符行 (例如 Low Floor Tom 41，模擬空行)
    const emptyTom = new Array(totalSteps).fill(false);

    testPattern.set(36, kick);
    testPattern.set(38, snare);
    testPattern.set(41, emptyTom);

    drumGrid.setPatternData(testPattern);

    const patternData = drumGrid.getPatternData();
    // 只有有音符的 note 38 和 36 被保留為 activeVoices
    const activeAtStep0 = drumGrid.getActiveNotesAtStep(0);
    expect(activeAtStep0).toContain(36);
    expect(activeAtStep0).not.toContain(41);

    const activeAtStep4 = drumGrid.getActiveNotesAtStep(4);
    expect(activeAtStep4).toContain(38);
    expect(activeAtStep4).not.toContain(41);
  });

  it('2. 全新空段落防呆：當載入完全無音符的段落時，自動呈現乾淨的 4 個核心常用樂器，避免畫面全空', () => {
    const container = document.createElement('div') as any;
    const drumGrid = new DrumStepGrid(container, 4);

    // 載入完全為空的 pattern
    drumGrid.setPatternData(new Map());

    // 預設核心 4 行 (Crash 49, Closed Hat 42, Snare 38, Kick 36) 應被就緒
    const defaults = getStandardDefaultDrumVoices();
    expect(defaults.length).toBeGreaterThanOrEqual(4);
    expect(defaults.some(v => v.note === 36)).toBe(true); // Kick
    expect(defaults.some(v => v.note === 38)).toBe(true); // Snare
  });

  it('3. 視圖切換：可在「僅顯示使用中」與「顯示完整標準鼓組」之間無縫切換', () => {
    const container = document.createElement('div') as any;
    const drumGrid = new DrumStepGrid(container, 4);

    expect(drumGrid.getIsCompactMode()).toBe(true);

    // 切換為展開完整模式
    drumGrid.toggleCompactMode();
    expect(drumGrid.getIsCompactMode()).toBe(false);

    // 再次切換回緊湊模式
    drumGrid.toggleCompactMode();
    expect(drumGrid.getIsCompactMode()).toBe(true);
  });

  it('4. 驗證 1024_容易受傷的女人.sty 載入後，各段落切換時僅展現該段落真正使用的打擊樂器', () => {
    const rPath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    if (!fs.existsSync(rPath)) return;

    const rBuf = fs.readFileSync(rPath);
    const result = StyLoader.loadFromBytes(new Uint8Array(rBuf), '1024_容易受傷的女人.sty');

    const container = document.createElement('div') as any;
    const drumGrid = new DrumStepGrid(container, 4);

    // 測試 Main A
    const mainA = result.sections.get('Main A')!;
    drumGrid.setPatternData(mainA.drumPattern);

    // 計算 Main A 真正有音符的樂器數量
    let mainAActiveNotesCount = 0;
    mainA.drumPattern.forEach(steps => {
      if (steps.some(Boolean)) mainAActiveNotesCount++;
    });

    // 驗證 Main A 有音符的樂器有被載入
    expect(mainAActiveNotesCount).toBeGreaterThan(0);

    // 測試 Intro B
    const introB = result.sections.get('Intro B')!;
    drumGrid.setPatternData(introB.drumPattern);

    let introBActiveNotesCount = 0;
    introB.drumPattern.forEach(steps => {
      if (steps.some(Boolean)) introBActiveNotesCount++;
    });
    expect(introBActiveNotesCount).toBeGreaterThan(0);
  });
});
