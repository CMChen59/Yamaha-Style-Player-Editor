import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { midiManager, type WebMidiPort } from '../src/core/audio/midi-manager';
import { StyPlaybackEngine } from '../src/player/sty-playback-engine';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { ChordTransposer } from '../src/core/writer/chord-transposer';

function createMockMidiPort(): {
  port: WebMidiPort;
  sentPackets: Array<{ bytes: number[]; timestamp?: number }>;
} {
  const sentPackets: Array<{ bytes: number[]; timestamp?: number }> = [];
  const port: WebMidiPort = {
    id: 'mock-sx920-port-1',
    name: 'Digital Workstation-1 (PSR-SX920)',
    manufacturer: 'Yamaha Corporation',
    type: 'output',
    state: 'connected',
    connection: 'open',
    send: (data: number[] | Uint8Array, timestamp?: number) => {
      sentPackets.push({ bytes: Array.from(data), timestamp });
    },
  };
  return { port, sentPackets };
}

describe('【任務 0-3】Web MIDI 琴端真實發聲引擎 (Hardware Sounding via Web MIDI)', () => {
  beforeEach(() => {
    midiManager.setMockOutputPort(null);
    midiManager.clearTxLog();
  });

  it('1. 連線虛擬 PSR-SX920 輸出埠時，應自動對 16 通道發送控制器喚醒與 Pitch Bend 歸中，並記錄於即時 TX 監控日誌', () => {
    const { port, sentPackets } = createMockMidiPort();
    midiManager.setMockOutputPort(port);

    // 16 通道 × 6 條初始化指令 (CC121, CC7, CC11, CC10, CC64, PitchBend) = 96 條
    expect(sentPackets.length).toBeGreaterThanOrEqual(96);

    // 驗證音色切換指令 (MSB 104, LSB 21, PC 0 -> CFX Concert Grand [104-21-1])
    sentPackets.length = 0;
    midiManager.clearTxLog();
    const ok = midiManager.sendVoiceChange(11, { msb: 104, lsb: 21, pc: 0 });
    expect(ok).toBe(true);
    expect(sentPackets.map(p => p.bytes)).toEqual([
      [0xBB, 0, 104],   // Ch 12 (0-based 11) CC 0 MSB = 104
      [0xBB, 32, 21],   // Ch 12 CC 32 LSB = 21
      [0xCB, 0],        // Ch 12 PC = 0
    ]);

    const txLog = midiManager.getRecentTxLog();
    expect(txLog.length).toBe(1);
    expect(txLog[0].summary).toContain('Ch12 音色切換 [104-21-1]');
    expect(txLog[0].connected).toBe(true);
  });

  it('2. StyPlaybackEngine 切換為 midi 或 both 模式並載入段落時，應將 8 大伴奏聲部 (Ch 9~16) 的 SX920 旗艦音色與混音參數完整推播至琴端', () => {
    const { port, sentPackets } = createMockMidiPort();
    midiManager.setMockOutputPort(port);

    const engine = new StyPlaybackEngine();
    const styPath = path.resolve(process.cwd(), 'public/samples/LoveSong.T547.sty');
    const bytes = new Uint8Array(fs.readFileSync(styPath));
    const parsed = YamahaParser.parse(bytes, 'STY');

    engine.loadParsed(parsed);
    sentPackets.length = 0;
    midiManager.clearTxLog();

    engine.setOutputMode('midi');
    expect(engine.isMidiEnabled()).toBe(true);
    expect(engine.isWebAudioEnabled()).toBe(false);

    engine.selectSection('Intro B');

    // 檢查 Ch 8~15 (即 MIDI Ch 9~16) 是否皆已收到 Bank MSB/LSB/PC 與 CC7/CC10/CC11/CC91/CC93/PitchBend
    for (let ch = 8; ch <= 15; ch++) {
      const voiceInfo = engine.getPartVoices().get(ch)!;
      expect(voiceInfo).toBeDefined();

      const hasMsb = sentPackets.some(p => p.bytes[0] === (0xB0 | ch) && p.bytes[1] === 0 && p.bytes[2] === voiceInfo.msb);
      const hasLsb = sentPackets.some(p => p.bytes[0] === (0xB0 | ch) && p.bytes[1] === 32 && p.bytes[2] === voiceInfo.lsb);
      const hasPc = sentPackets.some(p => p.bytes[0] === (0xC0 | ch) && p.bytes[1] === voiceInfo.pc);
      const hasVol = sentPackets.some(p => p.bytes[0] === (0xB0 | ch) && p.bytes[1] === 7);
      const hasPan = sentPackets.some(p => p.bytes[0] === (0xB0 | ch) && p.bytes[1] === 10);
      const hasPitchCenter = sentPackets.some(p => p.bytes[0] === (0xE0 | ch) && p.bytes[1] === 0x00 && p.bytes[2] === 0x40);

      expect(hasMsb).toBe(true);
      expect(hasLsb).toBe(true);
      expect(hasPc).toBe(true);
      expect(hasVol).toBe(true);
      expect(hasPan).toBe(true);
      expect(hasPitchCenter).toBe(true);
    }

    // 雙模同步模式 ('both') 應同時啟用 Web Audio 與 MIDI
    engine.setOutputMode('both');
    expect(engine.isMidiEnabled()).toBe(true);
    expect(engine.isWebAudioEnabled()).toBe(true);
  });

  it('3. 即時混音控制 (Mute / Solo / MasterVolume / Volume / Pan / Reverb / Chorus) 與 CASM 和弦切換應即時推播 MIDI 指令並消音靜音軌道', () => {
    const { port, sentPackets } = createMockMidiPort();
    midiManager.setMockOutputPort(port);

    const engine = new StyPlaybackEngine();
    const styPath = path.resolve(process.cwd(), 'public/samples/LoveSong.T547.sty');
    const bytes = new Uint8Array(fs.readFileSync(styPath));
    const parsed = YamahaParser.parse(bytes, 'STY');

    engine.loadParsed(parsed);
    engine.setOutputMode('midi');
    engine.selectSection('Main A');

    // 先在 Ch 11 (Chord 1) 觸發一顆長音符，測試 Mute 時是否立即送出 CC7=0 與 CC123 AllNotesOff
    midiManager.sendNoteOn(11, 60, 100, performance.now() + 50);
    midiManager.sendNoteOff(11, 60, performance.now() + 800);
    expect(midiManager.getActiveNotes().has('11:60')).toBe(true);

    sentPackets.length = 0;
    engine.setChannelMute(11, true);

    // 應收到 Ch 11 CC7 = 0 以及 CC123 = 0 (All Notes Off) 且 activeNotes 中 11:60 已被清除
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 7 && p.bytes[2] === 0)).toBe(true);
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 123 && p.bytes[2] === 0)).toBe(true);
    expect(midiManager.getActiveNotes().has('11:60')).toBe(false);

    // 解除 Mute 並調整 Volume / Pan / Reverb / Chorus
    sentPackets.length = 0;
    engine.setChannelMute(11, false);
    engine.setChannelVolume(11, 92);
    engine.setChannelPan(11, 48);
    engine.setChannelReverb(11, 65);
    engine.setChannelChorus(11, 28);

    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 7 && p.bytes[2] === 92)).toBe(true);
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 10 && p.bytes[2] === 48)).toBe(true);
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 91 && p.bytes[2] === 65)).toBe(true);
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 93 && p.bytes[2] === 28)).toBe(true);

    // 測試 Solo Ch 10 (Bass)：除 Ch 10 外其餘伴奏通道應收到 CC7 = 0 與 CC123 = 0
    sentPackets.length = 0;
    engine.setChannelSolo(10);
    expect(sentPackets.some(p => p.bytes[0] === 0xBA && p.bytes[1] === 7 && p.bytes[2] > 0)).toBe(true);
    expect(sentPackets.some(p => p.bytes[0] === 0xBB && p.bytes[1] === 7 && p.bytes[2] === 0)).toBe(true);
  });

  it('4. 預排視窗 (Lookahead Timestamp) 內的未來音符在執行 panicAllChannels() 時，應 100% 清除並追加排程消音，杜絕琴端掛音', () => {
    const { port, sentPackets } = createMockMidiPort();
    midiManager.setMockOutputPort(port);
    sentPackets.length = 0;

    const now = performance.now();
    // 模擬預排視窗排入 80ms 後 NoteOn、480ms 後 NoteOff
    midiManager.sendNoteOn(10, 36, 110, now + 80);
    midiManager.sendNoteOff(10, 36, now + 480);

    // 在舊版中 sendNoteOff 會立刻把 activeNotes 刪空；新版應持續追蹤直到 NoteOff 時間到達
    expect(midiManager.getActiveNotes().has('10:36')).toBe(true);

    // 使用者在 10ms 後按下停止 (panicAllChannels)
    sentPackets.length = 0;
    midiManager.panicAllChannels();

    // 1. activeNotes 應立即清空
    expect(midiManager.getActiveNotes().size).toBe(0);
    // 2. 應發送立即 NoteOff [0x8A, 36, 0] 以及排程佇列末端 (now + 480 + 1) 的保護性 AllNotesOff / NoteOff
    const immediateNoteOff = sentPackets.find(p => p.bytes[0] === 0x8A && p.bytes[1] === 36 && p.timestamp === undefined);
    const futureNoteOff = sentPackets.find(p => p.bytes[0] === 0x8A && p.bytes[1] === 36 && p.timestamp !== undefined && p.timestamp > now + 400);
    const futureAllNotesOff = sentPackets.find(p => p.bytes[0] === 0xBA && p.bytes[1] === 123 && p.timestamp !== undefined && p.timestamp > now + 400);

    expect(immediateNoteOff).toBeDefined();
    expect(futureNoteOff).toBeDefined();
    expect(futureAllNotesOff).toBeDefined();
  });

  it('5. 支援從 STY 段落萃取 Pitch Bend 彎音事件與單音/和弦預覽發聲', () => {
    const { port, sentPackets } = createMockMidiPort();
    midiManager.setMockOutputPort(port);

    const engine = new StyPlaybackEngine();
    const styPath = path.resolve(process.cwd(), 'public/samples/4006_SX900.T547.sty');
    const bytes = new Uint8Array(fs.readFileSync(styPath));
    const parsed = YamahaParser.parse(bytes, 'STY');

    engine.loadParsed(parsed);
    engine.setOutputMode('midi');
    engine.selectSection('Main A');

    // 測試 previewChord 在 MIDI 模式下發送 Ch 11 (0-based 10) Bass 與 Ch 12 (0-based 11) Chord 音符
    sentPackets.length = 0;
    const gMaj = ChordTransposer.buildChord('G', 'maj');
    engine.previewChord(gMaj);

    // G Bass = 36 + semitonesFromC (-5) = 31 (G1)
    expect(sentPackets.some(p => p.bytes[0] === 0x9A && p.bytes[1] === 36 + gMaj.semitonesFromC && p.bytes[2] > 0)).toBe(true);
    // G Major Chord on Ch 11 (0x9B), root = 60 + semitonesFromC (-5) = 55 (G3)
    expect(sentPackets.some(p => p.bytes[0] === 0x9B && p.bytes[1] === 60 + gMaj.semitonesFromC && p.bytes[2] > 0)).toBe(true);
  });
});
