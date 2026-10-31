import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YamahaParser } from '../src/core/parser/yamaha-parser';
import { YamahaStyleModifier } from '../src/core/writer/style-modifier';
import { styPlaybackEngine } from '../src/player/sty-playback-engine';
import { findYamahaVoice } from '../src/core/data/yamaha-voices';

describe('Incremental CASM CTAB Activation Verification', () => {
  it('啟用 1024_容易受傷的女人.sty 之 Intro A CH 13 後，其餘所有聲部與段落 100% 保持不動', () => {
    const filePath = path.resolve(__dirname, '../public/samples/1024_容易受傷的女人.sty');
    const fileBuf = fs.readFileSync(filePath);
    const parsed = YamahaParser.parse(fileBuf);

    // 1. 驗證啟用前 Intro A 之聲部狀態
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 8)).toBe(false);  // CH 9 Rhythm 1
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 9)).toBe(true);   // CH 10 Rhythm 2
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 10)).toBe(false); // CH 11 Bass
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 11)).toBe(true);  // CH 12 Chord 1
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 12)).toBe(false); // CH 13 Chord 2 (未啟用)
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 13)).toBe(true);  // CH 14 Pad
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 14)).toBe(true);  // CH 15 Phrase 1
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 15)).toBe(true);  // CH 16 Phrase 2

    // 2. 備份其他段落的 CASM 映射表 (確保啟用 Intro A 的軌道不會污染其他段落)
    const origMainACasm = { ...parsed.casmMappings['main a'] };
    const origIntroBCasm = { ...parsed.casmMappings['intro b'] };

    // 3. 啟用 CH 13 (Channel 12, Chord 2)，指定 CFX 鋼琴音色
    const cfxVoice = findYamahaVoice(104, 1, 0)!;
    const res = YamahaStyleModifier.activateSectionChannel(parsed, 'Intro A', 12, cfxVoice);
    expect(res.success).toBe(true);

    // 4. 驗證啟用後 Intro A 之聲部狀態：只有 CH 13 被點亮，CH 9 與 CH 11 依然是 false！
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 8)).toBe(false);  // CH 9 Rhythm 1 (仍為未啟用)
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 9)).toBe(true);   // CH 10 Rhythm 2
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 10)).toBe(false); // CH 11 Bass (仍為未啟用)
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 11)).toBe(true);  // CH 12 Chord 1
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 12)).toBe(true);   // CH 13 Chord 2 (成功啟用！)
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 13)).toBe(true);  // CH 14 Pad
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 14)).toBe(true);  // CH 15 Phrase 1
    expect(YamahaStyleModifier.isSectionChannelActive(parsed, 'Intro A', 15)).toBe(true);  // CH 16 Phrase 2

    // 5. 驗證 Intro A 的 CASM 路由完整性
    const introACasm = parsed.casmMappings['intro a'];
    expect(introACasm['2']).toBe(14); // 來源 2 依然映射至 Phrase 1 (CH 15)！
    expect(introACasm['3']).toBe(15); // 來源 3 依然映射至 Phrase 2 (CH 16)！
    expect(introACasm['5']).toBe(13); // 來源 5 依然映射至 Pad (CH 14)！
    expect(introACasm['6']).toBe(11); // 來源 6 依然映射至 Chord 1 (CH 12)！
    expect(introACasm['12']).toBe(12); // 新增的 12 映射至 12 (CH 13)！

    // 6. 驗證其他段落 (Main A, Intro B) 之 CASM 映射完全沒有被改動
    expect(parsed.casmMappings['main a']).toEqual(origMainACasm);
    expect(parsed.casmMappings['intro b']).toEqual(origIntroBCasm);

    // 7. 載入至播放引擎，驗證聲部音色分配 100% 正確無錯位！
    styPlaybackEngine.loadParsed(parsed);
    styPlaybackEngine.selectSection('Intro A');

    const voices = styPlaybackEngine.getPartVoices();
    // CH 12 (Chord 1 / ch 11): SteelGuitarTwin2 (104-13-25)
    expect(voices.get(11)?.pc).toBe(25);
    expect(voices.get(11)?.msb).toBe(104);
    expect(voices.get(11)?.lsb).toBe(13);

    // CH 13 (Chord 2 / ch 12): CFX Concert Grand (104-1-0) - 新啟用
    expect(voices.get(12)?.pc).toBe(0);
    expect(voices.get(12)?.msb).toBe(104);
    expect(voices.get(12)?.lsb).toBe(1);

    // CH 14 (Pad / ch 13): Cocktail Piano (104-3-0)
    expect(voices.get(13)?.pc).toBe(0);
    expect(voices.get(13)?.msb).toBe(104);
    expect(voices.get(13)?.lsb).toBe(3);

    // CH 15 (Phrase 1 / ch 14): BellHeaven (0-119-88) - 100% 留在 CH 15，絕不跑到 CH 12！
    expect(voices.get(14)?.pc).toBe(88);
    expect(voices.get(14)?.msb).toBe(0);
    expect(voices.get(14)?.lsb).toBe(119);

    // CH 16 (Phrase 2 / ch 15): Warm Pad (0-0-89) - 100% 留在 CH 16！
    expect(voices.get(15)?.pc).toBe(89);
  });
});
