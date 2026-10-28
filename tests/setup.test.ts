import { describe, it, expect } from 'vitest';
import type { YamahaFileMeta } from '../src/core/models/types';

describe('專案工程基底 (Setup & Environment)', () => {
  it('環境能正確載入 TypeScript 類型與 Vitest 測試套件', () => {
    const dummyMeta: YamahaFileMeta = {
      format: 'STY',
      ticksPerQuarterNote: 480,
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      sections: [{ name: 'Main A', startTick: 0, endTick: 1920, measureCount: 1 }],
      tracks: [{ trackIndex: 9, channel: 8, partName: 'Rhythm 1' }],
      hasCasm: true,
      hasOts: false,
    };

    expect(dummyMeta.format).toBe('STY');
    expect(dummyMeta.ticksPerQuarterNote).toBe(480);
    expect(dummyMeta.sections).toHaveLength(1);
  });
});
