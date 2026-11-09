import { describe, it, expect } from 'vitest';
import { decodeMidiText } from '../src/core/parser/yamaha-parser';

describe('decodeMidiText 智慧編碼辨識', () => {
  it('應該正確解析純 ASCII 標記 (如 Section Markers 或 Pad 指令)', () => {
    const asciiBytes = new TextEncoder().encode('Main A');
    expect(decodeMidiText(asciiBytes)).toBe('Main A');

    const padCmd = new TextEncoder().encode('RP0000');
    expect(decodeMidiText(padCmd)).toBe('RP0000');
  });

  it('應該正確解析標準 UTF-8 中文標記', () => {
    const utf8Bytes = new TextEncoder().encode('前奏 A 段 (現代流行)');
    expect(decodeMidiText(utf8Bytes)).toBe('前奏 A 段 (現代流行)');
  });

  it('應該正確解析 Big5 繁體中文標記 (解決台灣/香港早期 MIDI 亂碼問題)', () => {
    // '林' in Big5 is 0xAA 0x4C (以前被 latin1 解碼為 ªL)
    const big5Lin = new Uint8Array([0x4d, 0x69, 0x64, 0x69, 0x20, 0xaa, 0x4c]);
    const decoded = decodeMidiText(big5Lin);
    expect(decoded).toContain('林');
    expect(decoded).not.toContain('ªL');
  });

  it('應該安全處理空字節與空陣列', () => {
    expect(decodeMidiText(new Uint8Array([]))).toBe('');
    expect(decodeMidiText(null as any)).toBe('');
  });
});
