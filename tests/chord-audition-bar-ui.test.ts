import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ChordTransposer, POPULAR_AUDITION_CHORDS } from '../src/core/writer/chord-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';

describe('虛擬左手和弦轉調測試條 UI 結構與邏輯整合測試', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  let htmlContent: string;

  beforeEach(() => {
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
    styPlaybackEngine.resetAuditionChord();
  });

  it('1. index.html 包含完整的和弦測試條 HTML 結構與主要元素 ID', () => {
    expect(htmlContent).toContain('id="chord-audition-bar"');
    expect(htmlContent).toContain('id="chord-pills-row"');
    expect(htmlContent).toContain('id="current-chord-name"');
    expect(htmlContent).toContain('id="current-chord-detail"');
    expect(htmlContent).toContain('id="select-chord-root"');
    expect(htmlContent).toContain('id="select-chord-type"');
    expect(htmlContent).toContain('id="btn-apply-custom-chord"');
    expect(htmlContent).toContain('id="btn-reset-chord"');
  });

  it('2. 包含專屬 CSS 樣式定義與高亮發光效果', () => {
    expect(htmlContent).toContain('.chord-audition-bar');
    expect(htmlContent).toContain('.chord-pill');
    expect(htmlContent).toContain('.chord-pill.is-active-chord');
    expect(htmlContent).toContain('.current-chord-badge');
  });

  it('3. 模擬點擊和弦快捷鍵切換至 Am 並驗證引擎狀態與描述', () => {
    const chordAm = ChordTransposer.buildChord('A', 'm');
    styPlaybackEngine.setAuditionChord(chordAm);

    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('Am');
    const desc = ChordTransposer.getChordDescription(chordAm);
    expect(desc).toContain('小三和弦');
    expect(desc).toContain('-3');
  });

  it('4. 自由組合自訂和弦 (如 G + 7 = G7)', () => {
    const chordG7 = ChordTransposer.buildChord('G', '7');
    styPlaybackEngine.setAuditionChord(chordG7);

    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('G7');
    expect(styPlaybackEngine.getAuditionChord().root).toBe('G');
    expect(styPlaybackEngine.getAuditionChord().type).toBe('7');
    const desc = ChordTransposer.getChordDescription(chordG7);
    expect(desc).toContain('屬七');
  });

  it('5. 一鍵重設原調功能回到基準 C', () => {
    styPlaybackEngine.setAuditionChord(ChordTransposer.buildChord('F', 'maj'));
    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('F');

    styPlaybackEngine.resetAuditionChord();
    expect(styPlaybackEngine.getAuditionChord().displayName).toBe('C');
    expect(styPlaybackEngine.getAuditionChord().root).toBe('C');
  });

  it('6. POPULAR_AUDITION_CHORDS 提供 12 款最常見流行和弦', () => {
    expect(POPULAR_AUDITION_CHORDS.length).toBe(12);
    const names = POPULAR_AUDITION_CHORDS.map(c => c.displayName);
    expect(names).toContain('C (原調)');
    expect(names).toContain('Am');
    expect(names).toContain('Dm');
    expect(names).toContain('G');
    expect(names).toContain('G7');
    expect(names).toContain('F');
  });
});
