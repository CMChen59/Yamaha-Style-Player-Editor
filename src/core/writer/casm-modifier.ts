/**
 * Yamaha SFF2 CASM (Chord Audio Style Mapping) 轉調規則解析與微調引擎
 * 依據 Yamaha SFF2 / PSR-SX920 官方 CASM CSEG / Sdec / Ctb2 規範
 */

import { BinaryWriter } from './binary-writer';
import type { YamahaFileParsed, YamahaCustomChunk } from '../models/types';
import { DEFAULT_STYLE_PARTS, type StylePartId } from '../models/style-types';

export type NtrRule = 'Root Transpose' | 'Root Fixed';
export type NttRule = 'Bypass' | 'Chord' | 'Bass' | 'Melody';
export type RetriggerRule = 'Stop' | 'Pitch Shift' | 'Retrigger';

export interface CasmPartRule {
  channel: number;              // MIDI Channel (8 ~ 15, 對應 Ch 9 ~ 16)
  partId: StylePartId;          // 'Rhythm1', 'Rhythm2', 'Bass', etc.
  partName: string;             // 8-character tag (e.g. 'Rhy1Main', 'BassMain')
  ntr: NtrRule;                 // 0 = Root Transpose, 1 = Root Fixed
  ntt: NttRule;                 // 0 = Bypass, 1 = Chord, 2 = Bass, 3 = Melody
  noteLowLimit: number;         // 0 ~ 127
  noteHighLimit: number;        // 0 ~ 127
  retriggerRule: RetriggerRule; // RTR: 'Stop', 'Pitch Shift', 'Retrigger'
  isDrum: boolean;
}

export const CASM_STANDARD_PRESETS: Record<string, { label: string; rules: Partial<Record<StylePartId, Partial<CasmPartRule>>> }> = {
  standard: {
    label: 'Yamaha 原廠推薦標準 (Standard Pop)',
    rules: {
      Rhythm1: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Stop' },
      Rhythm2: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Stop' },
      Bass: { ntr: 'Root Transpose', ntt: 'Bass', noteLowLimit: 28, noteHighLimit: 55, retriggerRule: 'Retrigger' },
      Chord1: { ntr: 'Root Transpose', ntt: 'Chord', noteLowLimit: 36, noteHighLimit: 84, retriggerRule: 'Retrigger' },
      Chord2: { ntr: 'Root Transpose', ntt: 'Chord', noteLowLimit: 36, noteHighLimit: 84, retriggerRule: 'Retrigger' },
      Pad: { ntr: 'Root Transpose', ntt: 'Chord', noteLowLimit: 48, noteHighLimit: 96, retriggerRule: 'Pitch Shift' },
      Phrase1: { ntr: 'Root Transpose', ntt: 'Melody', noteLowLimit: 48, noteHighLimit: 96, retriggerRule: 'Pitch Shift' },
      Phrase2: { ntr: 'Root Transpose', ntt: 'Melody', noteLowLimit: 48, noteHighLimit: 96, retriggerRule: 'Pitch Shift' },
    },
  },
  jazz: {
    label: '爵士豐富和弦 (Jazz & Fusion)',
    rules: {
      Bass: { ntr: 'Root Transpose', ntt: 'Bass', noteLowLimit: 24, noteHighLimit: 60, retriggerRule: 'Retrigger' },
      Chord1: { ntr: 'Root Transpose', ntt: 'Chord', noteLowLimit: 36, noteHighLimit: 96, retriggerRule: 'Retrigger' },
      Chord2: { ntr: 'Root Transpose', ntt: 'Chord', noteLowLimit: 36, noteHighLimit: 96, retriggerRule: 'Retrigger' },
      Phrase1: { ntr: 'Root Transpose', ntt: 'Melody', noteLowLimit: 40, noteHighLimit: 100, retriggerRule: 'Pitch Shift' },
      Phrase2: { ntr: 'Root Transpose', ntt: 'Melody', noteLowLimit: 40, noteHighLimit: 100, retriggerRule: 'Pitch Shift' },
    },
  },
  fixed_all: {
    label: '嚴格原音防走音 (Safe Fixed / Bypass)',
    rules: {
      Phrase1: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Pitch Shift' },
      Phrase2: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Pitch Shift' },
    },
  },
};

export class CasmModifier {
  /**
   * 取得預設的 8 聲部 CASM 規則清單
   */
  public static getDefaultPartRules(): CasmPartRule[] {
    const partOrder: StylePartId[] = ['Rhythm1', 'Rhythm2', 'Bass', 'Chord1', 'Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    const stdPreset = CASM_STANDARD_PRESETS.standard.rules;

    return partOrder.map((partId) => {
      const partCfg = DEFAULT_STYLE_PARTS[partId];
      const ch = partCfg.channel;
      const isDrum = partId === 'Rhythm1' || partId === 'Rhythm2' || ch === 8 || ch === 9;
      const rulePreset = stdPreset[partId] || {};

      let tag = 'PartMain';
      if (ch === 8) tag = 'Rhy1Main';
      else if (ch === 9) tag = 'Drum4cc ';
      else if (ch === 10) tag = 'BassMain';
      else if (ch === 11) tag = 'Chd1Main';
      else if (ch === 12) tag = 'Chd2Main';
      else if (ch === 13) tag = 'Pad Main';
      else if (ch === 14) tag = 'Phr1Main';
      else if (ch === 15) tag = 'Phr2Main';

      return {
        channel: ch,
        partId,
        partName: tag,
        ntr: rulePreset.ntr ?? (isDrum ? 'Root Fixed' : 'Root Transpose'),
        ntt: rulePreset.ntt ?? (isDrum ? 'Bypass' : partId === 'Bass' ? 'Bass' : 'Chord'),
        noteLowLimit: rulePreset.noteLowLimit ?? (isDrum ? 0 : partId === 'Bass' ? 28 : 36),
        noteHighLimit: rulePreset.noteHighLimit ?? (isDrum ? 127 : partId === 'Bass' ? 55 : 84),
        retriggerRule: rulePreset.retriggerRule ?? (isDrum ? 'Stop' : 'Retrigger'),
        isDrum,
      };
    });
  }

  /**
   * 從 parsed STY 物件解析目前的 CASM 聲部規則
   * 若無 CASM，自動產生預設標準規則
   */
  public static extractPartRules(parsed: YamahaFileParsed): CasmPartRule[] {
    const defaultRules = this.getDefaultPartRules();
    const casmChunk = parsed.customChunks.find((c) => c.id === 'CASM');
    if (!casmChunk || !casmChunk.data || casmChunk.data.length < 16) {
      return defaultRules;
    }

    const data = casmChunk.data;
    const rulesMap = new Map<number, CasmPartRule>();
    defaultRules.forEach((r) => rulesMap.set(r.channel, { ...r }));

    let offset = 0;
    while (offset + 8 <= data.length) {
      const chunkId = String.fromCharCode(...data.slice(offset, offset + 4));
      const chunkSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];

      if (chunkId === 'CSEG') {
        let subOffset = offset + 8;
        const csegEnd = subOffset + chunkSize;

        while (subOffset + 8 <= csegEnd) {
          const subId = String.fromCharCode(...data.slice(subOffset, subOffset + 4));
          const subSize = (data[subOffset + 4] << 24) | (data[subOffset + 5] << 16) | (data[subOffset + 6] << 8) | data[subOffset + 7];

          if (subId === 'Ctb2' && subSize >= 47) {
            const ctb = data.slice(subOffset + 8, subOffset + 8 + subSize);
            const ch = ctb[0] & 0x0f;
            const existing = rulesMap.get(ch);

            if (existing) {
              const ntrByte = ctb[28];
              const nttByte = ctb[29];
              const lowLim = ctb[31];
              const highLim = ctb[32];
              const rtrByte = ctb[33];

              existing.ntr = ntrByte === 1 ? 'Root Fixed' : 'Root Transpose';
              if (nttByte === 0) existing.ntt = 'Bypass';
              else if (nttByte === 2 || ctb[30] === 5) existing.ntt = 'Bass';
              else if (nttByte === 3) existing.ntt = 'Melody';
              else existing.ntt = 'Chord';

              existing.noteLowLimit = lowLim;
              existing.noteHighLimit = highLim;
              existing.retriggerRule = rtrByte === 0 ? 'Stop' : rtrByte === 1 ? 'Pitch Shift' : 'Retrigger';
            }
          }
          subOffset += 8 + subSize;
        }
      }
      offset += 8 + chunkSize;
    }

    return Array.from(rulesMap.values()).sort((a, b) => a.channel - b.channel);
  }

  /**
   * 根據聲部微調規則重新建立完整 SFF2 二進位 CASM 結構並注入到 YamahaFileParsed
   */
  public static updateParsedCasm(parsed: YamahaFileParsed, rules: CasmPartRule[]): { success: boolean; message: string } {
    if (!parsed || !parsed.sections || parsed.sections.length === 0) {
      return { success: false, message: '伴奏結構無效，無可用段落' };
    }

    const musicalSections = parsed.sections.filter((s) => s.name !== 'SFF2' && s.name !== 'SInt');
    const sectionsToUse = musicalSections.length > 0 ? musicalSections : parsed.sections;

    const writer = new BinaryWriter();

    for (const sec of sectionsToUse) {
      const csegWriter = new BinaryWriter();

      // 1. Sdec Subchunk (Section Declaration)
      const secBytes = new TextEncoder().encode(sec.name);
      csegWriter.writeString('Sdec');
      csegWriter.writeUint32BE(secBytes.length);
      csegWriter.writeBytes(secBytes);

      // 2. Ctb2 Subchunks (為 8 個伴奏聲部建立 47-byte 規則)
      for (const rule of rules) {
        csegWriter.writeString('Ctb2');
        csegWriter.writeUint32BE(47);

        const ctbData = new Uint8Array(47);
        const ch = rule.channel & 0x0f;
        ctbData[0] = ch; // Source Channel

        // Byte 1~8: Part Name
        const tag = (rule.partName || 'PartMain').padEnd(8, ' ').slice(0, 8);
        for (let k = 0; k < 8; k++) {
          ctbData[1 + k] = tag.charCodeAt(k);
        }

        ctbData[9] = ch;  // Dest Channel
        ctbData[10] = 0x00;
        ctbData[11] = 0x0f;
        ctbData[12] = 0xff;
        ctbData[13] = rule.isDrum ? 0x07 : 0x03; // Flag
        ctbData[14] = 0xff;
        ctbData[15] = 0xff;
        ctbData[16] = 0xff;
        ctbData[17] = 0xff;

        ctbData[18] = 0x00;
        ctbData[19] = 0x02;
        ctbData[20] = 0x00;
        ctbData[21] = 0x7f; // High Limit

        ctbData[22] = 0x00;
        ctbData[23] = 0x81;
        ctbData[24] = 0x03;
        ctbData[25] = 0x18;

        // Byte 26~46: 轉調規則
        ctbData[26] = 0x00;
        ctbData[27] = 0x02;
        ctbData[28] = rule.ntr === 'Root Fixed' ? 0x01 : 0x00; // NTR

        // NTT
        if (rule.ntt === 'Bypass') {
          ctbData[29] = 0x00;
          ctbData[30] = 0x07;
        } else if (rule.ntt === 'Bass') {
          ctbData[29] = 0x81;
          ctbData[30] = 0x05;
        } else if (rule.ntt === 'Melody') {
          ctbData[29] = 0x03;
          ctbData[30] = 0x03;
        } else {
          ctbData[29] = 0x01;
          ctbData[30] = 0x03;
        }

        ctbData[31] = Math.max(0, Math.min(127, rule.noteLowLimit));  // Low Limit
        ctbData[32] = Math.max(0, Math.min(127, rule.noteHighLimit)); // High Limit
        ctbData[33] = rule.retriggerRule === 'Stop' ? 0x00 : rule.retriggerRule === 'Pitch Shift' ? 0x01 : 0x02; // RTR

        // Byte 34~39: 小和弦轉調規則表 (Minor Chord Table)
        if (rule.ntr === 'Root Fixed') {
          ctbData[34] = 0x01; // 小和弦同為 Root Fixed 固定音高，徹底杜絕大小和弦切換時跳八度
          ctbData[35] = rule.ntt === 'Bypass' ? 0x00 : 0x01;
          ctbData[36] = rule.ntt === 'Bypass' ? 0x07 : 0x07;
          ctbData[37] = ctbData[31];
          ctbData[38] = ctbData[32];
          ctbData[39] = ctbData[33];
        } else {
          ctbData[34] = 0x00; // Root Transpose 跟隨根音
          if (rule.ntt === 'Bypass') {
            ctbData[35] = 0x00;
            ctbData[36] = 0x07;
          } else if (rule.ntt === 'Bass') {
            ctbData[35] = 0x81;
            ctbData[36] = 0x03;
          } else if (rule.ntt === 'Melody') {
            ctbData[35] = 0x03;
            ctbData[36] = 0x07;
          } else {
            ctbData[35] = 0x01;
            ctbData[36] = 0x07;
          }
          ctbData[37] = ctbData[31];
          ctbData[38] = ctbData[32];
          ctbData[39] = ctbData[33];
        }

        if (rule.isDrum) {
          ctbData[40] = 0x00;
          ctbData[41] = 0x01;
          ctbData[42] = 0x00;
          ctbData[43] = 0x18;
          ctbData[44] = 0x31;
          ctbData[45] = 0x50;
          ctbData[46] = 0x00;
        }

        csegWriter.writeBytes(ctbData);
      }

      const csegBytes = csegWriter.toUint8Array();
      writer.writeString('CSEG');
      writer.writeUint32BE(csegBytes.length);
      writer.writeBytes(csegBytes);
    }

    const casmData = writer.toUint8Array();
    const existingCasmIdx = parsed.customChunks.findIndex((c) => c.id === 'CASM');
    const newChunk: YamahaCustomChunk = {
      id: 'CASM',
      data: casmData,
      offset: 0,
    };

    if (existingCasmIdx >= 0) {
      parsed.customChunks[existingCasmIdx] = newChunk;
    } else {
      parsed.customChunks.push(newChunk);
    }

    parsed.hasCasm = true;
    return { success: true, message: `成功更新 CASM 轉調規則 (包含 ${sectionsToUse.length} 個段落，${rules.length} 個伴奏聲部)` };
  }
}
