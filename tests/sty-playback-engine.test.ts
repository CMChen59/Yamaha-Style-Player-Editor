import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { StyPlaybackEngine } from '../src/player/sty-playback-engine';

describe('StyPlaybackEngine: 純 STY 伴奏極速播放引擎測試', () => {
  const loveSongPath = path.resolve(__dirname, '../public/samples/LoveSong.T547.sty');
  const womanPath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
  const sx900Path = path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty');

  it('能正確載入 LoveSong.T547.sty 並提取段落資訊', () => {
    expect(fs.existsSync(loveSongPath)).toBe(true);
    const buf = fs.readFileSync(loveSongPath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);

    expect(engine.getBpm()).toBe(70);
    const sections = engine.getSections();
    expect(sections.length).toBeGreaterThan(5);

    // 驗證包含 Intro B 與 Main A
    const names = sections.map(s => s.name);
    expect(names).toContain('Intro B');
    expect(names).toContain('Main A');
  });

  it('LoveSong Intro B 能精準擷取原始 SFF2 音符事件流並排除 SFF1 重複半音', () => {
    const buf = fs.readFileSync(loveSongPath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);

    const ok = engine.selectSection('Intro B');
    expect(ok).toBe(true);
    expect(engine.getTotalBars()).toBe(4);

    const events: any[] = (engine as any).sectionEvents;
    expect(events.length).toBe(150); // SFF2 純淨 150 顆音符 (非 269 顆衝撞音)

    // 驗證所有事件的相對 Tick 為遞增
    for (let i = 1; i < events.length; i++) {
      expect(events[i].relTick).toBeGreaterThanOrEqual(events[i - 1].relTick);
    }

    // 驗證通道均為標準 8~15
    const channels = new Set(events.map(e => e.channel));
    for (let ch = 0; ch < 8; ch++) {
      expect(channels.has(ch)).toBe(false);
    }
    expect(channels.has(10)).toBe(true); // Bass
    expect(channels.has(11)).toBe(true); // Chord 1
    expect(channels.has(12)).toBe(true); // Chord 2
    expect(channels.has(13)).toBe(true); // Pad
  });

  it('1024_容易受傷的女人.sty: CASM 與自製節奏通道能完整發聲，無漏音', () => {
    if (!fs.existsSync(womanPath)) return;
    const buf = fs.readFileSync(womanPath);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);

    const ok = engine.selectSection('Intro B');
    expect(ok).toBe(true);
    expect(engine.getTotalBars()).toBe(8);

    const events: any[] = (engine as any).sectionEvents;
    // 驗證 Intro B 541 顆音符完整保留，絕不因鼓組在 Ch 9 就遺失其他伴奏聲部！
    expect(events.length).toBe(541);

    // 驗證各聲部完整對應到 Yamaha 標準伴奏目標通道 (8~15)
    const channels = new Set(events.map(e => e.channel));
    expect(channels.has(9)).toBe(true);  // Rhythm 2 (Pop Drum Kit)
    expect(channels.has(10)).toBe(true); // Bass (Fretless Bass 3)
    expect(channels.has(11)).toBe(true); // Chord 1 (SteelGuitarTwin2)
    expect(channels.has(12)).toBe(true); // Chord 2 (SeattleStrings)
    expect(channels.has(13)).toBe(true); // Pad (Cocktail Piano)
    expect(channels.has(14)).toBe(true); // Phrase 1 (DistortionGuitar)
    expect(channels.has(15)).toBe(true); // Phrase 2 (SeattleStrings)

    // 驗證解析出的音色名稱
    const voices = engine.getPartVoices();
    expect(voices.get(10)?.voiceName).toContain('Fretless Bass');
    expect(voices.get(14)?.voiceName).toContain('DistortionGuitar');
    expect(voices.get(11)?.voiceName).toContain('SteelGuitar');
  });

  it('4006_SX900.T547.sty: 自製節奏全聲部正常保留與解構', () => {
    if (!fs.existsSync(sx900Path)) return;
    const buf = fs.readFileSync(sx900Path);
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    const engine = new StyPlaybackEngine();
    engine.loadParsed(parsed);

    const ok = engine.selectSection('Intro B');
    expect(ok).toBe(true);

    const events: any[] = (engine as any).sectionEvents;
    expect(events.length).toBeGreaterThan(100);

    const channels = new Set(events.map(e => e.channel));
    expect(channels.has(10)).toBe(true); // Bass
    expect(channels.has(11)).toBe(true); // Chord 1
    expect(channels.has(12)).toBe(true); // Chord 2
    expect(channels.has(9)).toBe(true);  // Rhythm
  });

  it('能正確調整 BPM、循環模式與聲部靜音獨奏', () => {
    const engine = new StyPlaybackEngine();
    engine.setBpm(140);
    expect(engine.getBpm()).toBe(140);

    engine.setLoop(false);
    expect(engine.getLoop()).toBe(false);

    // 聲部靜音
    engine.setChannelMute(10, true);
    expect(engine.isChannelMuted(10)).toBe(true);
    expect(engine.isChannelMuted(11)).toBe(false);

    // 聲部獨奏 (Solo)
    engine.setChannelSolo(11);
    expect(engine.isChannelMuted(11)).toBe(false); // Solo 軌不被靜音
    expect(engine.isChannelMuted(10)).toBe(true);  // 非 Solo 軌被靜音
    expect(engine.isChannelMuted(9)).toBe(true);

    engine.setChannelSolo(null);
    expect(engine.isChannelMuted(11)).toBe(false);
  });
});
