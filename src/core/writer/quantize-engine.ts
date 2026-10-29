/**
 * Yamaha STY 音符網格量化與搖擺律動引擎 (Quantize & Groove Shuffle Engine)
 *
 * 支援功能：
 * 1. 標準網格 (Straight): 1/4, 1/8, 1/16, 1/32
 * 2. 三連音網格 (Triplets): 1/4T, 1/8T, 1/16T
 * 3. 漸進量化強度 (Quantize Strength): 0% ~ 100% (Soft Quantize)
 * 4. 搖擺律動 (Groove Swing / Shuffle): 50% ~ 75% 偶數拍微調
 * 5. 起始位置 (Start Tick / RelTick) 與音符時值 (Duration) 分離或同步量化
 * 6. 邊界保護 (0 ~ TotalTicks) 與最小時值保護
 */

export type QuantizeGridType =
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'
  | '1/4T'
  | '1/8T'
  | '1/16T';

export interface QuantizeOptions {
  grid: QuantizeGridType;
  strength?: number;         // 0 ~ 100 (%), 預設 100 (100 = 完全吸附, 50 = 移動半程)
  swing?: number;            // 50 ~ 75 (%), 預設 50 (50 = 直音無搖擺, 60 = Light Swing, 66.7 = Triplet Shuffle)
  quantizeStarts?: boolean;  // 是否量化起始點 (預設 true)
  quantizeLengths?: boolean; // 是否量化時值長度 (預設 false)
  totalTicks?: number;       // 段落總 Tick 限制 (邊界保護)
  division?: number;         // MIDI PPQ, 預設 480
}

export interface QuantizableNote {
  noteNumber: number;
  startTick?: number;
  relTick?: number;
  durationTicks: number;
  velocity: number;
  [key: string]: any;
}

export class QuantizeEngine {
  /**
   * 取得指定量化格線的基本 Tick 步長
   * @param grid 量化解析度 (1/4 ~ 1/32, 1/4T ~ 1/16T)
   * @param division MIDI PPQ (Ticks per Quarter Note, 預設 480)
   */
  public static getGridStepTicks(grid: QuantizeGridType, division: number = 480): number {
    switch (grid) {
      case '1/4':
        return division; // 1 拍 = 480 ticks
      case '1/8':
        return Math.round(division / 2); // 半拍 = 240 ticks
      case '1/16':
        return Math.round(division / 4); // 1/4 拍 = 120 ticks
      case '1/32':
        return Math.round(division / 8); // 1/8 拍 = 60 ticks
      case '1/4T':
        // 2 拍內三連音 = (division * 2) / 3 = 320 ticks
        return Math.round((division * 2) / 3);
      case '1/8T':
        // 1 拍內三連音 = division / 3 = 160 ticks
        return Math.round(division / 3);
      case '1/16T':
        // 半拍內三連音 = (division / 2) / 3 = 80 ticks
        return Math.round(division / 6);
      default:
        return Math.round(division / 4);
    }
  }

  /**
   * 計算給定 Tick 在目標格線與搖擺率 (Swing) 下的最接近網格點
   * @param tick 原始 Tick
   * @param grid 量化格線
   * @param division MIDI PPQ
   * @param swing 搖擺率 (50 ~ 75%)
   */
  public static snapTick(
    tick: number,
    grid: QuantizeGridType,
    division: number = 480,
    swing: number = 50
  ): number {
    if (tick <= 0) return 0;

    const clampedSwing = Math.max(50, Math.min(75, swing));

    // 支援 1/16 拍 Swing (最常見於 Funk, R&B, Pop, Hip-hop)
    if (grid === '1/16' && clampedSwing > 50) {
      const step = Math.round(division / 4); // 120
      const pair = step * 2; // 240 (半拍為一個 Swing 循環組)
      const pairIdx = Math.floor(tick / pair);
      const baseTick = pairIdx * pair;

      const p0 = baseTick;
      const p1 = Math.round(baseTick + pair * (clampedSwing / 100));
      const p2 = baseTick + pair;

      const d0 = Math.abs(tick - p0);
      const d1 = Math.abs(tick - p1);
      const d2 = Math.abs(tick - p2);

      const minD = Math.min(d0, d1, d2);
      if (minD === d0) return p0;
      if (minD === d1) return p1;
      return p2;
    }

    // 支援 1/8 拍 Swing (常見於 Blues, Jazz, Shuffle)
    if (grid === '1/8' && clampedSwing > 50) {
      const step = Math.round(division / 2); // 240
      const pair = step * 2; // 480 (一整拍為一個 Swing 循環組)
      const pairIdx = Math.floor(tick / pair);
      const baseTick = pairIdx * pair;

      const p0 = baseTick;
      const p1 = Math.round(baseTick + pair * (clampedSwing / 100));
      const p2 = baseTick + pair;

      const d0 = Math.abs(tick - p0);
      const d1 = Math.abs(tick - p1);
      const d2 = Math.abs(tick - p2);

      const minD = Math.min(d0, d1, d2);
      if (minD === d0) return p0;
      if (minD === d1) return p1;
      return p2;
    }

    // 標準 Straight 或 Triplet 網格對齊
    const step = this.getGridStepTicks(grid, division);
    if (step <= 0) return tick;
    return Math.round(tick / step) * step;
  }

  /**
   * 對單顆音符執行智慧量化
   */
  public static quantizeNote<T extends QuantizableNote>(
    note: T,
    options: QuantizeOptions
  ): T {
    const {
      grid,
      strength = 100,
      swing = 50,
      quantizeStarts = true,
      quantizeLengths = false,
      totalTicks,
      division = 480,
    } = options;

    const clampedStrength = Math.max(0, Math.min(100, strength));
    const step = this.getGridStepTicks(grid, division);
    const minDur = Math.max(12, Math.round(step / 4)); // 最小時值保護

    const origStart = note.startTick !== undefined ? note.startTick : (note.relTick !== undefined ? note.relTick : 0);
    let newStart = origStart;
    let newDur = note.durationTicks;

    // 1. 起始位置量化
    if (quantizeStarts && clampedStrength > 0) {
      const targetStart = this.snapTick(origStart, grid, division, swing);
      const delta = targetStart - origStart;
      newStart = Math.round(origStart + delta * (clampedStrength / 100));
      newStart = Math.max(0, newStart);
    }

    // 2. 音符時值量化
    if (quantizeLengths && clampedStrength > 0) {
      const targetDur = Math.max(step, Math.round(note.durationTicks / step) * step);
      const deltaDur = targetDur - note.durationTicks;
      newDur = Math.max(minDur, Math.round(note.durationTicks + deltaDur * (clampedStrength / 100)));
    }

    // 3. 邊界保護
    if (totalTicks !== undefined && totalTicks > 0) {
      if (newStart >= totalTicks) {
        newStart = Math.max(0, totalTicks - step);
      }
      if (newStart + newDur > totalTicks) {
        newDur = Math.max(minDur, totalTicks - newStart);
      }
    }

    const result: T = {
      ...note,
      durationTicks: newDur,
    };
    if (note.startTick !== undefined) result.startTick = newStart;
    if (note.relTick !== undefined) result.relTick = newStart;
    return result;
  }

  /**
   * 對多顆音符批次執行量化
   * @param notes 欲量化的音符陣列
   * @param options 量化選項
   * @returns 量化後之全新音符陣列 (按 startTick / relTick 升序排列)
   */
  public static quantizeNotes<T extends QuantizableNote>(
    notes: T[],
    options: QuantizeOptions
  ): T[] {
    if (!notes || notes.length === 0) return [];

    const quantized = notes.map(n => this.quantizeNote(n, options));

    // 依照 startTick / relTick 穩定排序
    quantized.sort((a, b) => {
      const aStart = a.startTick !== undefined ? a.startTick : (a.relTick ?? 0);
      const bStart = b.startTick !== undefined ? b.startTick : (b.relTick ?? 0);
      if (aStart !== bStart) return aStart - bStart;
      return a.noteNumber - b.noteNumber;
    });

    return quantized;
  }
}
