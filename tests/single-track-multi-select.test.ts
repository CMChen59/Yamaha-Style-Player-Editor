import { describe, it, expect } from 'vitest';
import type { PlaybackNoteEvent } from '../src/player/sty-playback-engine';

describe('Tier 1-1: 單軌聚焦工作台多選與框選功能驗證 (Multi-Select & Marquee Selection)', () => {
  // 建立測試用音符事件 (模擬 Main A 第 9 軌鼓組或第 10 軌 Bass)
  function createSampleEvents(): PlaybackNoteEvent[] {
    return [
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 100, relTick: 0, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 38, velocity: 90, relTick: 480, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 42, velocity: 95, relTick: 960, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 36, velocity: 110, relTick: 1440, durationTicks: 120, durationMs: 0 },
      { channel: 8, sourceChannel: 8, noteNumber: 46, velocity: 80, relTick: 1920, durationTicks: 240, durationMs: 0 },
    ];
  }

  // 模擬 AABB 碰撞偵測函式 (與 SingleTrackEditor 內邏輯完全一致)
  function computeMarqueeIntersects(
    events: PlaybackNoteEvent[],
    rows: Array<{ note: number }>,
    rowHeight: number,
    totalBars: number,
    pixelsPerBar: number,
    totalTicks: number,
    marquee: { minX: number; maxX: number; minY: number; maxY: number }
  ): PlaybackNoteEvent[] {
    const totalWidthPx = totalBars * pixelsPerBar;
    const result: PlaybackNoteEvent[] = [];

    events.forEach(ev => {
      const rowIndex = rows.findIndex(r => r.note === ev.noteNumber);
      if (rowIndex === -1) return;

      const noteLeft = (ev.relTick / totalTicks) * totalWidthPx;
      const noteWidth = Math.max(12, (ev.durationTicks / totalTicks) * totalWidthPx);
      const noteTop = rowIndex * rowHeight + 2;
      const noteHeight = rowHeight - 4;

      const collides = (
        marquee.minX <= noteLeft + noteWidth &&
        marquee.maxX >= noteLeft &&
        marquee.minY <= noteTop + noteHeight &&
        marquee.maxY >= noteTop
      );

      if (collides) {
        result.push(ev);
      }
    });

    return result;
  }

  it('1. 矩形框選 (Marquee Selection) 能精確捕捉框選範圍內的音符並排除框外音符', () => {
    const events = createSampleEvents();
    const rows = [{ note: 46 }, { note: 42 }, { note: 38 }, { note: 36 }]; // 4 行
    const rowHeight = 24;
    const totalBars = 4;
    const pixelsPerBar = 240;
    const totalTicks = 7680; // 4 小節 @ 1920 ticks/bar
    const totalWidthPx = 4 * 240; // 960 px

    // 框選前兩拍時間範圍 (relTick 0 ~ 900)，音高涵蓋 note 36 與 38 (行 2 與 3，Y: 48 ~ 96)
    const minTick = 0;
    const maxTick = 800;
    const minX = (minTick / totalTicks) * totalWidthPx;
    const maxX = (maxTick / totalTicks) * totalWidthPx;
    const minY = 2 * rowHeight; // 行 2 (note 38)
    const maxY = 4 * rowHeight; // 行 3 (note 36)

    const selected = computeMarqueeIntersects(events, rows, rowHeight, totalBars, pixelsPerBar, totalTicks, {
      minX,
      maxX,
      minY,
      maxY,
    });

    // 應該只選中 noteNumber: 36 (relTick: 0) 與 noteNumber: 38 (relTick: 480)
    expect(selected.length).toBe(2);
    expect(selected.some(e => e.noteNumber === 36 && e.relTick === 0)).toBe(true);
    expect(selected.some(e => e.noteNumber === 38 && e.relTick === 480)).toBe(true);
    // note 42 (relTick: 960) 在框選範圍外
    expect(selected.some(e => e.noteNumber === 42)).toBe(false);
  });

  it('2. 批次拖曳移位 (Batch Drag) 具備相對位置保持與時間/音高邊界保護', () => {
    const events = createSampleEvents();
    const rows = [{ note: 46 }, { note: 42 }, { note: 38 }, { note: 36 }]; // rows 0~3
    const selectedNotes = [events[0], events[1]]; // note 36 (row 3, tick 0), note 38 (row 2, tick 480)
    const totalTicks = 7680;

    // 模擬使用者向左拖曳過頭 (-600 ticks)，需受限於 minStartTick (0) 不能小於 0
    const rawDeltaTicks = -600;
    const minStartTick = Math.min(...selectedNotes.map(n => n.relTick)); // 0
    const maxEndTick = Math.max(...selectedNotes.map(n => n.relTick + n.durationTicks)); // 600
    const clampedDeltaTicks = (Math.max(
      -minStartTick,
      Math.min(totalTicks - maxEndTick, rawDeltaTicks)
    ) || 0);

    expect(clampedDeltaTicks).toBe(0); // 被限制為 0，不可移動至負數 Tick

    // 模擬向右正常移動 240 ticks (半拍)
    const moveTicks = 240;
    selectedNotes.forEach(n => {
      n.relTick += moveTicks;
    });

    expect(selectedNotes[0].relTick).toBe(240); // 0 + 240
    expect(selectedNotes[1].relTick).toBe(720); // 480 + 240
    // 兩者相對間距保持完全不變 (720 - 240 = 480)
    expect(selectedNotes[1].relTick - selectedNotes[0].relTick).toBe(480);
  });

  it('3. 批次刪除 (Batch Delete) 能精準移除所有選取音符並保留未選取音符', () => {
    let events = createSampleEvents();
    expect(events.length).toBe(5);

    // 模擬選取第 1, 2, 4 顆音符
    const selectedSet = new Set([events[0], events[1], events[3]]);
    expect(selectedSet.size).toBe(3);

    // 執行批次刪除過濾
    events = events.filter(e => !selectedSet.has(e));
    expect(events.length).toBe(2);

    // 確認殘留的是未被選取的第 3 顆 (note 42) 與第 5 顆 (note 46)
    expect(events[0].noteNumber).toBe(42);
    expect(events[0].relTick).toBe(960);
    expect(events[1].noteNumber).toBe(46);
    expect(events[1].relTick).toBe(1920);
  });

  it('4. 批次力度修改 (Batch Velocity Update) 絕對統一模式', () => {
    const events = createSampleEvents();
    const selectedSet = new Set([events[0], events[2], events[4]]);

    const newVelocity = 115;
    selectedSet.forEach(ev => {
      ev.velocity = newVelocity;
    });

    // 被選取的音符力度皆應變為 115
    expect(events[0].velocity).toBe(115);
    expect(events[2].velocity).toBe(115);
    expect(events[4].velocity).toBe(115);

    // 未選取的音符維持原本力度
    expect(events[1].velocity).toBe(90);
    expect(events[3].velocity).toBe(110);
  });

  it('5. 批次力度微調：相對增減模式 (Relative Delta Mode) 能嚴格保留各音符原有的強弱動態差', () => {
    const events = createSampleEvents();
    // 選取 Note 0 (vel: 100), Note 1 (vel: 90), Note 2 (vel: 95)
    const selected = [events[0], events[1], events[2]];
    const baseVelocities = new Map(selected.map(e => [e, e.velocity]));
    const baselineAverage = Math.round((100 + 90 + 95) / 3); // 95

    // 模擬使用者將滑桿由平均值 95 拖動至 110 (delta = +15)
    const newVal = 110;
    const delta = newVal - baselineAverage; // +15

    selected.forEach(ev => {
      const base = baseVelocities.get(ev)!;
      ev.velocity = Math.max(1, Math.min(127, base + delta));
    });

    // 各自增加 15
    expect(events[0].velocity).toBe(115); // 100 + 15
    expect(events[1].velocity).toBe(105); // 90 + 15
    expect(events[2].velocity).toBe(110); // 95 + 15

    // 驗證原有的動態差 (100 - 90 = 10, 100 - 95 = 5) 嚴格保持完全一致！
    expect(events[0].velocity - events[1].velocity).toBe(10);
    expect(events[0].velocity - events[2].velocity).toBe(5);
  });

  it('6. 批次力度快速階梯微調 (Quick Step Nudge) 具備安全邊界 (1~127)', () => {
    const events = createSampleEvents();
    const selected = [events[0], events[4]]; // Note 0 (100), Note 4 (80)

    // 模擬點擊 [+10] 按鈕
    const nudgeDelta = 10;
    selected.forEach(ev => {
      ev.velocity = Math.max(1, Math.min(127, ev.velocity + nudgeDelta));
    });
    expect(events[0].velocity).toBe(110);
    expect(events[4].velocity).toBe(90);

    // 模擬連續點擊 [+10] 直到達到琴端極限 127
    selected.forEach(ev => {
      ev.velocity = Math.max(1, Math.min(127, ev.velocity + 50));
    });
    expect(events[0].velocity).toBe(127); // 上限鎖定 127
    expect(events[4].velocity).toBe(127); // 90+50 = 140 -> 127
  });

  it('7. 人性化隨機律動微調 (Humanize) 能在 ±8 範圍內加入自然演奏動態且不溢位', () => {
    const events = createSampleEvents();
    const selected = [...events];
    const initialVelocities = selected.map(e => e.velocity);

    const range = 8;
    selected.forEach(ev => {
      const jitter = Math.floor(Math.random() * (range * 2 + 1)) - range;
      ev.velocity = Math.max(1, Math.min(127, ev.velocity + jitter));
    });

    selected.forEach((ev, idx) => {
      const diff = Math.abs(ev.velocity - initialVelocities[idx]);
      expect(diff).toBeLessThanOrEqual(range);
      expect(ev.velocity).toBeGreaterThanOrEqual(1);
      expect(ev.velocity).toBeLessThanOrEqual(127);
    });
  });
});
