import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Inspect CASM CTAB Source Chords', () => {
  it('parses CTAB source chord and rules for 4006 Intro A', () => {
    const buf = fs.readFileSync(path.resolve(__dirname, '../public/samples/4006_SX900.T547.sty'));
    const parsed = YamahaParser.parse(new Uint8Array(buf), 'STY');

    const casmChunk = parsed.customChunks.find(c => c.id === 'CASM');
    if (!casmChunk) return;

    const data = casmChunk.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    while (pos <= data.length - 8) {
      const tag = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
      const len = view.getUint32(pos + 4);
      if (tag === 'CSEG') {
        const csegEnd = Math.min(data.length, pos + 8 + len);
        let csegPos = pos + 8;
        let currentSections: string[] = [];

        while (csegPos <= csegEnd - 8) {
          const subTag = String.fromCharCode(data[csegPos], data[csegPos + 1], data[csegPos + 2], data[csegPos + 3]);
          const subLen = view.getUint32(csegPos + 4);
          if (subTag === 'Sdec') {
            let sdecStr = '';
            for (let k = 0; k < subLen; k++) sdecStr += String.fromCharCode(data[csegPos + 8 + k]);
            currentSections = sdecStr.split(/[\x00,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
          } else if (subTag === 'Ctb2' || subTag === 'CTAB') {
            const srcCh = data[csegPos + 8];
            const destCh = data[csegPos + 8 + 9];
            // CTAB internal structure:
            // byte 0: srcCh
            // byte 1: name (8 bytes)
            // byte 9: destCh
            // Let's print out all bytes in this CTAB subchunk!
            if (currentSections.includes('intro a')) {
              const hex = Array.from(data.slice(csegPos + 8, csegPos + 8 + subLen)).map(b => b.toString(16).padStart(2, '0')).join(' ');
              console.log(`[Intro A] CTAB subLen=${subLen}, srcCh=${srcCh}, destCh=${destCh}`);
              console.log(`  Raw bytes: ${hex}`);

              // In Yamaha SFF CASM:
              // After destCh (byte 9), what are the bytes?
              // byte 10: Source Chord Root / Type?
              // byte 11: NTR (0=Root Transpose, 1=Root Fixed)
              // byte 12: NTT (0=Bypass, 1=Melody, 2=Chord, 3=Bass, 4=Melodic, 5=Harmonic)
              // byte 13: High Key
              // byte 14: Note Limit Low
              // byte 15: Note Limit High
              // byte 16: RTR
              console.log(`  Byte 10..18:`, Array.from(data.slice(csegPos + 8 + 10, csegPos + 8 + 20)));
            }
          }
          csegPos += 8 + subLen;
        }
        pos = csegEnd;
      } else {
        pos += 8 + len;
      }
    }
  });
});
