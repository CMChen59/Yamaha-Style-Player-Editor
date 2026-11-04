import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isIntroOrEndingSection } from '../src/core/models/style-types';
import { ChordTransposer } from '../src/core/writer/chord-transposer';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('任務 1-1: Intro / Ending 和弦輪播智慧掛起防呆 (Smart Progression Suspend) 測試套件', () => {
  const samplePath = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');
  const htmlPath = path.resolve(__dirname, '../index.html');

  beforeEach(() => {
    const buf = fs.readFileSync(samplePath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Main A');
    styPlaybackEngine.setChordAutoAdvance(false);
    styPlaybackEngine.resetAuditionChord();
  });

  describe('1. 段落名稱識別工具 isIntroOrEndingSection', () => {
    it('應準確辨識 Intro 與 Ending 各種大小寫與命名變體', () => {
      expect(isIntroOrEndingSection('Intro A')).toBe(true);
      expect(isIntroOrEndingSection('Intro B')).toBe(true);
      expect(isIntroOrEndingSection('intro c')).toBe(true);
      expect(isIntroOrEndingSection('INTRO 1')).toBe(true);
      expect(isIntroOrEndingSection('Ending A')).toBe(true);
      expect(isIntroOrEndingSection('Ending B')).toBe(true);
      expect(isIntroOrEndingSection('ending c')).toBe(true);
      expect(isIntroOrEndingSection('ENDING 3')).toBe(true);
    });

    it('對於 Main、Fill In、Break 或空值應回傳 false', () => {
      expect(isIntroOrEndingSection('Main A')).toBe(false);
      expect(isIntroOrEndingSection('Main B')).toBe(false);
      expect(isIntroOrEndingSection('Fill In AA')).toBe(false);
      expect(isIntroOrEndingSection('Fill In BA')).toBe(false);
      expect(isIntroOrEndingSection('Break')).toBe(false);
      expect(isIntroOrEndingSection(null)).toBe(false);
      expect(isIntroOrEndingSection(undefined)).toBe(false);
      expect(isIntroOrEndingSection('')).toBe(false);
      expect(isIntroOrEndingSection('   ')).toBe(false);
    });
  });

  describe('2. 智慧掛起機制 (Smart Progression Suspend)', () => {
    it('當自動輪播開啟時，切換至 Intro 段落應自動掛起輪播，保護原曲旋律調性', () => {
      // 1. 在 Main A 開啟輪播
      styPlaybackEngine.setChordAutoAdvance(true);
      expect(styPlaybackEngine.getChordAutoAdvance()).toBe(true);
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);
      expect(styPlaybackEngine.isEffectiveChordAutoAdvance()).toBe(true);

      // 2. 切換至 Intro A
      const success = styPlaybackEngine.selectSection('Intro A');
      expect(success).toBe(true);

      // 3. 驗證掛起狀態
      expect(styPlaybackEngine.getChordAutoAdvance()).toBe(true); // 使用者總開關仍為 true
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(true); // 智慧掛起啟動
      expect(styPlaybackEngine.isEffectiveChordAutoAdvance()).toBe(false); // 實際生效狀態為 false
    });

    it('在掛起狀態下，所有小節的 getChordForTick 均保持單一原曲調 (C 調)，不強制轉調', () => {
      styPlaybackEngine.setChordAutoAdvance(true);
      const popChords = ChordTransposer.getProgressionPreset('pop-1564'); // C, G, Am, F
      styPlaybackEngine.setChordProgression(popChords, 'pop-1564');
      styPlaybackEngine.selectSection('Intro A');

      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(true);

      // 4006_SX900 division 1920，每小節 7680 ticks
      const ticksPerBar = 1920 * 4;

      // 驗證第 1、2、3、4 小節均回傳 C (auditionChord)，而非輪播進行中的 G / Am / F
      expect(styPlaybackEngine.getChordForTick(0).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 2).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar * 3).displayName).toBe('C');
    });

    it('當從 Intro 切換回 Main 段落時，系統應自動解除掛起，無縫恢復和弦輪播', () => {
      styPlaybackEngine.setChordAutoAdvance(true);
      const popChords = ChordTransposer.getProgressionPreset('pop-1564');
      styPlaybackEngine.setChordProgression(popChords, 'pop-1564');

      // 進入 Intro A: 自動掛起
      styPlaybackEngine.selectSection('Intro A');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(true);
      expect(styPlaybackEngine.isEffectiveChordAutoAdvance()).toBe(false);

      // 切換回 Main A: 自動解除掛起
      styPlaybackEngine.selectSection('Main A');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);
      expect(styPlaybackEngine.isEffectiveChordAutoAdvance()).toBe(true);

      const ticksPerBar = 1920 * 4;
      // 第 1 小節 C, 第 2 小節 G
      expect(styPlaybackEngine.getChordForTick(0).displayName).toBe('C');
      expect(styPlaybackEngine.getChordForTick(ticksPerBar).displayName).toBe('G');
    });

    it('切換至 Ending 段落時同樣觸發智慧掛起，切換至 Fill In 或 Break 則自動恢復', () => {
      styPlaybackEngine.setChordAutoAdvance(true);

      // 進入 Ending B
      styPlaybackEngine.selectSection('Ending B');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(true);

      // 切換至 Fill In BB
      styPlaybackEngine.selectSection('Fill In BB');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);

      // 再次進入 Ending B
      styPlaybackEngine.selectSection('Ending B');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(true);

      // 切換至 Break
      styPlaybackEngine.selectSection('Break');
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);
    });

    it('使用者在 Intro 段落中手動明確開啟輪播時，系統應尊重使用者覆寫 (User Override)', () => {
      // 1. 先停留在 Intro A
      styPlaybackEngine.selectSection('Intro A');
      styPlaybackEngine.setChordAutoAdvance(false);
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);

      // 2. 使用者在 Intro A 介面上主動打勾「自動輪播」
      styPlaybackEngine.setChordAutoAdvance(true);

      // 3. 系統應尊重手動操作，解除掛起，允許使用者強制輪播
      expect(styPlaybackEngine.getIsProgressionSuspended()).toBe(false);
      expect(styPlaybackEngine.isEffectiveChordAutoAdvance()).toBe(true);
    });
  });

  describe('3. 前端介面 DOM 與 CSS 整合驗證', () => {
    it('index.html 應具備 progression-suspended-badge 原調保護標籤與樣式定義', () => {
      const html = fs.readFileSync(htmlPath, 'utf8');

      // 驗證 DOM 元素
      expect(html).toContain('id="progression-suspended-badge"');
      expect(html).toContain('class="progression-suspended-badge"');
      expect(html).toContain('原調保護中 (輪播暫停)');

      // 驗證 CSS 定義
      expect(html).toContain('.progression-suspended-badge {');
      expect(html).toContain('.progression-cards-container.is-suspended {');
      expect(html).toContain('pulse-suspended-badge');
    });
  });
});
