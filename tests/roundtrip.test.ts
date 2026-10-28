import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';

describe('步驟 1.3: 無損重構器二進位極限驗證 (Round-trip Verification)', () => {
  const samplesDir = path.resolve(__dirname, '../samples');

  const testFiles = [
    { name: '4006_SX900.T547.sty', format: 'STY' as const },
    { name: '4006-1_PAD.PAD', format: 'PAD' as const },
    { name: '4006-2_PAD.PAD', format: 'PAD' as const },
  ];

  for (const file of testFiles) {
    it(`檔案 [${file.name}] 應能 100% 二進位無損重構 (Byte-level identical)`, () => {
      const filePath = path.join(samplesDir, file.name);
      const originalBuffer = new Uint8Array(fs.readFileSync(filePath));

      // 1. 解析
      const parsed = YamahaParser.parse(originalBuffer, file.format);

      // 2. 重構寫出
      const reconstructedBuffer = YamahaWriter.write(parsed);

      // 3. 驗證檔案大小完全相同
      expect(reconstructedBuffer.length).toBe(originalBuffer.length);

      // 4. 逐字節 (Byte-by-byte) 深度比對
      let diffIndex = -1;
      for (let i = 0; i < originalBuffer.length; i++) {
        if (originalBuffer[i] !== reconstructedBuffer[i]) {
          diffIndex = i;
          break;
        }
      }

      if (diffIndex !== -1) {
        throw new Error(
          `檔案 ${file.name} 在 offset ${diffIndex} (0x${diffIndex.toString(16)}) 存在差異！` +
          `原始: 0x${originalBuffer[diffIndex].toString(16)}, 重構: 0x${reconstructedBuffer[diffIndex].toString(16)}`
        );
      }

      expect(diffIndex).toBe(-1);

      // 5. 將重構結果再次解析，驗證結構與標籤依然完好無損
      const reParsed = YamahaParser.parse(reconstructedBuffer, file.format);
      expect(reParsed.tracks.length).toBe(parsed.tracks.length);
      expect(reParsed.sections.length).toBe(parsed.sections.length);
      expect(reParsed.customChunks.length).toBe(parsed.customChunks.length);
      expect(reParsed.hasCasm).toBe(parsed.hasCasm);
    });
  }
});
