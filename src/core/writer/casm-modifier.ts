/**
 * Yamaha SFF2 CASM (Chord Audio Style Mapping) 轉調規則解析與微調引擎
 * 依據 Yamaha SFF2 / PSR-SX920 官方 CASM CSEG / Sdec / Ctb2 規範
 */

import { BinaryWriter } from './binary-writer';
import type { YamahaFileParsed, YamahaCustomChunk } from '../models/types';
import { DEFAULT_STYLE_PARTS, type StylePartId } from '../models/style-types';
import { YamahaParser } from '../parser/yamaha-parser';

export type NtrRule = 'Root Transpose' | 'Root Fixed' | 'Guitar';
export type NttRule = 'Bypass' | 'Chord' | 'Bass' | 'Melody' | 'Maj-min' | 'Maj-min (Intro)' | 'Minor';
export type RetriggerRule = 'Stop' | 'Pitch Shift' | 'Retrigger';

/**
 * 【任務 2-4E】單軌 CASM 轉調模式高階分類 (對應 NTR 電梯 + NTT 磁鐵四大經典組合)
 */
export type CasmChannelTranspositionMode =
  | 'FIXED_BYPASS'      // 🔒 固定音高直通 (Root Fixed + Bypass)：左手頻繁換和弦時，右手音高死死釘在原地絕不走音
  | 'TRANSPOSE_MELODY'  // 🎵 旋律音階跟隨 (Root Transpose + Melody)：隨和弦轉調並保護旋律音程與花音 (Phrase 1/2 預設)
  | 'TRANSPOSE_CHORD'   // 🎹 和弦內音吸附 (Root Transpose + Chord)：隨和弦轉調並強力吸附至三和弦/七和弦 (Chord 1/2, Pad 預設)
  | 'TRANSPOSE_BASS'    // 🎸 貝斯根音跟隨 (Root Transpose + Bass)：隨和弦根音與轉位走動 (Bass 預設)
  | 'TRANSPOSE_BYPASS'; // ⚡ 單鍵根音直通 (Root Transpose + Bypass)：僅隨根音平行升降、不吸附音階 (原廠 Intro/Ending 預設)

export interface CasmPartRule {
  channel: number;              // MIDI Channel (8 ~ 15, 對應 Ch 9 ~ 16)
  partId: StylePartId;          // 'Rhythm1', 'Rhythm2', 'Bass', etc.
  partName: string;             // 8-character tag (e.g. 'Rhy1Main', 'BassMain', 'BassIntr', 'Maj-min ')
  ntr: NtrRule;                 // 0 = Root Transpose, 1 = Root Fixed
  ntt: NttRule;                 // 0 = Bypass, 1 = Chord, 2 = Bass, 3 = Melody, 7 = Minor/Maj-min
  noteLowLimit: number;         // 0 ~ 127
  noteHighLimit: number;        // 0 ~ 127
  retriggerRule: RetriggerRule; // RTR: 'Stop', 'Pitch Shift', 'Retrigger'
  isDrum: boolean;
  hiKey?: number;               // 0 ~ 11 (C to B), default 6 (F#), Bass default 5 (F)
  sourceChordRoot?: number;     // 0 ~ 11 (C to B), default 0 (C)
  sourceChordType?: number;     // 0 = Maj, 2 = Maj7, 8 = min, etc. Default 2 for Major, 8 for Minor
}

export const CASM_STANDARD_PRESETS: Record<string, { label: string; rules: Partial<Record<StylePartId, Partial<CasmPartRule>>> }> = {
  standard: {
    label: 'Yamaha 原廠推薦標準 (Standard Pop)',
    rules: {
      Rhythm1: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Stop' },
      Rhythm2: { ntr: 'Root Fixed', ntt: 'Bypass', noteLowLimit: 0, noteHighLimit: 127, retriggerRule: 'Stop' },
      Bass: { ntr: 'Root Transpose', ntt: 'Bass', noteLowLimit: 28, noteHighLimit: 55, retriggerRule: 'Retrigger', hiKey: 5 },
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
        hiKey: rulePreset.hiKey ?? (partId === 'Bass' ? 5 : 6),
      };
    });
  }

  /**
   * 從 parsed STY 物件解析目前的 CASM 聲部規則
   * 若指定了 targetSection，則專門提取該段落之規則；若無 CASM，自動產生預設標準規則
   */
  public static extractPartRules(parsed: YamahaFileParsed, targetSection?: string): CasmPartRule[] {
    const defaultRules = this.getDefaultPartRules();
    const casmChunk = parsed.customChunks.find((c) => c.id === 'CASM');
    if (!casmChunk || !casmChunk.data || casmChunk.data.length < 16) {
      return defaultRules;
    }

    const data = casmChunk.data;
    const rulesMap = new Map<number, CasmPartRule>();
    defaultRules.forEach((r) => rulesMap.set(r.channel, { ...r }));

    const targetSecLower = targetSection?.trim().toLowerCase();
    const targetSecNoSpace = targetSecLower?.replace(/\s+/g, '');

    let offset = 0;
    while (offset + 8 <= data.length) {
      const chunkId = String.fromCharCode(...data.slice(offset, offset + 4));
      const chunkSize = (data[offset + 4] << 24) | (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];

      if (chunkId === 'CSEG') {
        let subOffset = offset + 8;
        const csegEnd = subOffset + chunkSize;
        let csegMatched = !targetSecLower;

        // 若指定了 targetSection，先檢查 Sdec 標籤
        let isDedicatedSingleSection = false;
        if (targetSecLower) {
          let sdecScan = subOffset;
          while (sdecScan + 8 <= csegEnd) {
            const subId = String.fromCharCode(...data.slice(sdecScan, sdecScan + 4));
            const subSize = (data[sdecScan + 4] << 24) | (data[sdecScan + 5] << 16) | (data[sdecScan + 6] << 8) | data[sdecScan + 7];
            if (subId === 'Sdec') {
              const sStr = new TextDecoder().decode(data.slice(sdecScan + 8, sdecScan + 8 + subSize));
              const names = sStr.split(/[\x00,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
              if (names.some((n) => n === targetSecLower || n.replace(/\s+/g, '') === targetSecNoSpace)) {
                csegMatched = true;
                isDedicatedSingleSection = names.length === 1;
                break;
              }
            }
            sdecScan += 8 + subSize;
          }
        }

        if (csegMatched) {
          const updatedExact = new Set<number>();
          while (subOffset + 8 <= csegEnd) {
            const subId = String.fromCharCode(...data.slice(subOffset, subOffset + 4));
            const subSize = (data[subOffset + 4] << 24) | (data[subOffset + 5] << 16) | (data[subOffset + 6] << 8) | data[subOffset + 7];

            if (subId === 'Ctb2' && subSize >= 47) {
              const ctb = data.slice(subOffset + 8, subOffset + 8 + subSize);
              const srcCh = ctb[0] & 0x0f;
              const destCh = ctb.length >= 10 && ctb[9] >= 8 && ctb[9] <= 15 ? ctb[9] : srcCh;
              const existing = rulesMap.get(destCh);

              // 優先保留同通道 (srcCh === destCh) 的主規則，不被次要來源覆蓋
              if (existing && !updatedExact.has(destCh)) {
                if (srcCh === destCh) {
                  updatedExact.add(destCh);
                }
                const chordRootByte = ctb.length > 18 ? ctb[18] : 0;
                const chordTypeByte = ctb.length > 19 ? ctb[19] : 2;
                const ntrByte = ctb[28];
                const nttByte = ctb[29];
                const hiKeyByte = ctb.length > 30 && ctb[30] <= 11 ? ctb[30] : (existing.partId === 'Bass' ? 5 : 6);
                const lowLim = ctb[31];
                const highLim = ctb[32];
                const rtrByte = ctb[33];

                existing.sourceChordRoot = chordRootByte <= 11 ? chordRootByte : 0;
                existing.sourceChordType = chordTypeByte;
                existing.ntr = ntrByte === 2 ? 'Guitar' : (ntrByte === 1 ? 'Root Fixed' : 'Root Transpose');
                if (nttByte === 0) existing.ntt = 'Bypass';
                else if (nttByte === 7) existing.ntt = 'Minor';
                else if (nttByte === 0x81 || hiKeyByte === 5) existing.ntt = 'Bass';
                else if (nttByte === 3) existing.ntt = 'Melody';
                else existing.ntt = 'Chord';

                existing.hiKey = hiKeyByte;
                existing.noteLowLimit = lowLim;
                existing.noteHighLimit = highLim;
                existing.retriggerRule = rtrByte === 0 ? 'Stop' : rtrByte === 1 ? 'Pitch Shift' : 'Retrigger';
              }
            }
            subOffset += 8 + subSize;
          }
          // 僅當命中專屬單一段落的 CSEG (names.length === 1) 時才提前結束；若為多段落共享 CSEG 則繼續往後掃描是否有獨立剝離後的專屬 CSEG
          if (targetSecLower && isDedicatedSingleSection) break;
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
        const ctbData = CasmModifier.buildCtb2Data(rule);
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
    parsed.casmEntries = YamahaParser.parseCasmEntries(casmData);
    return { success: true, message: `成功更新 CASM 轉調規則 (包含 ${sectionsToUse.length} 個段落，${rules.length} 個伴奏聲部)` };
  }

  /**
   * 建立標準 47-byte 的 Ctb2 規則二進位資料
   */
  public static buildCtb2Data(rule: CasmPartRule, sourceChannel?: number): Uint8Array {
    const ctbData = new Uint8Array(47);
    const srcCh = (sourceChannel !== undefined ? sourceChannel : rule.channel) & 0x0f;
    const destCh = rule.channel & 0x0f;
    ctbData[0] = srcCh; // Source Channel

    // Byte 1~8: Part Name
    const tag = (rule.partName || 'PartMain').padEnd(8, ' ').slice(0, 8);
    for (let k = 0; k < 8; k++) {
      ctbData[1 + k] = tag.charCodeAt(k);
    }

    ctbData[9] = destCh;  // Dest Channel
    ctbData[10] = 0x00;
    ctbData[11] = 0x0f;
    ctbData[12] = 0xff;
    ctbData[13] = rule.isDrum ? 0x07 : 0x03; // Flag
    ctbData[14] = 0xff;
    ctbData[15] = 0xff;
    ctbData[16] = 0xff;
    ctbData[17] = 0xff;

    ctbData[18] = rule.sourceChordRoot !== undefined ? Math.max(0, Math.min(11, rule.sourceChordRoot)) : 0x00;
    ctbData[19] = rule.sourceChordType !== undefined ? rule.sourceChordType : 0x02;
    ctbData[20] = 0x00;
    ctbData[21] = 0x7f; // High Limit

    ctbData[22] = 0x00;
    ctbData[23] = 0x81;
    ctbData[24] = 0x03;
    ctbData[25] = 0x18;

    // Byte 26~46: 轉調規則
    ctbData[26] = 0x00;
    ctbData[27] = 0x02;
    ctbData[28] = rule.ntr === 'Guitar' ? 0x02 : (rule.ntr === 'Root Fixed' ? 0x01 : 0x00); // NTR: 0=Root Trans, 1=Root Fixed, 2=Guitar

    // NTT (Byte 29)
    if (rule.ntt === 'Bypass') {
      ctbData[29] = 0x00;
    } else if (rule.ntt === 'Minor' || rule.ntt === 'Maj-min' || rule.ntt === 'Maj-min (Intro)') {
      ctbData[29] = 0x07;
    } else if (rule.ntt === 'Bass') {
      ctbData[29] = 0x81;
    } else if (rule.ntt === 'Melody') {
      ctbData[29] = 0x03;
    } else {
      ctbData[29] = 0x01;
    }

    // HiKey (Byte 30): 0~11 (C to B). Bass 預設 5 (F)，其餘預設 6 (F#)
    const effectiveHiKey = rule.hiKey !== undefined 
      ? Math.max(0, Math.min(11, rule.hiKey)) 
      : (rule.ntt === 'Bass' ? 5 : 6);
    ctbData[30] = effectiveHiKey;

    ctbData[31] = Math.max(0, Math.min(127, rule.noteLowLimit));  // Low Limit
    ctbData[32] = Math.max(0, Math.min(127, rule.noteHighLimit)); // High Limit
    ctbData[33] = rule.retriggerRule === 'Stop' ? 0x00 : rule.retriggerRule === 'Pitch Shift' ? 0x01 : 0x02; // RTR

    // Byte 34~39: 小和弦轉調規則表 (Minor Chord Table)
    if (rule.ntr === 'Root Fixed') {
      ctbData[34] = 0x01; // 小和弦同為 Root Fixed 固定音高，徹底杜絕大小和弦切換時跳八度
      ctbData[35] = rule.ntt === 'Bypass' ? 0x00 : (rule.ntt === 'Minor' || rule.ntt === 'Maj-min' || rule.ntt === 'Maj-min (Intro)' ? 0x07 : 0x01);
      ctbData[36] = effectiveHiKey;
      ctbData[37] = ctbData[31];
      ctbData[38] = ctbData[32];
      ctbData[39] = ctbData[33];
    } else {
      ctbData[34] = 0x00; // Root Transpose 跟隨根音
      if (rule.ntt === 'Bypass') {
        ctbData[35] = 0x00;
      } else if (rule.ntt === 'Minor' || rule.ntt === 'Maj-min' || rule.ntt === 'Maj-min (Intro)') {
        ctbData[35] = 0x07;
      } else if (rule.ntt === 'Bass') {
        ctbData[35] = 0x81;
      } else if (rule.ntt === 'Melody') {
        ctbData[35] = 0x03;
      } else {
        ctbData[35] = 0x01;
      }
      ctbData[36] = effectiveHiKey;
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

    return ctbData;
  }

  /**
   * 建立包含 8-byte 標頭 ('Ctb2' + len 47) 的 55-byte Ctb2 子區塊
   */
  public static buildCtb2Subchunk(rule: CasmPartRule, sourceChannel?: number): Uint8Array {
    const ctbData = this.buildCtb2Data(rule, sourceChannel);
    const sub = new Uint8Array(8 + 47);
    sub[0] = 'C'.charCodeAt(0);
    sub[1] = 't'.charCodeAt(0);
    sub[2] = 'b'.charCodeAt(0);
    sub[3] = '2'.charCodeAt(0);
    new DataView(sub.buffer).setUint32(4, 47, false);
    sub.set(ctbData, 8);
    return sub;
  }

  /**
   * 針對特定伴奏段落增量注入或更新特定聲部的 CASM (Ctb2) 轉調規則
   * 100% 保持既有 CASM 二進位結構與各段落/聲部的原始路由對應，不干擾其他聲部與段落！
   */
  public static injectOrUpdateSectionCasmRule(
    parsed: YamahaFileParsed,
    sectionName: string,
    channel: number,
    rule: CasmPartRule
  ): { success: boolean; message: string } {
    if (!parsed) return { success: false, message: '伴奏結構無效' };

    let casmChunk = parsed.customChunks.find((c) => c.id === 'CASM');

    // 若原伴奏檔案完全沒有 CASM 區塊，初始化標準 CASM 結構
    if (!casmChunk || !casmChunk.data || casmChunk.data.length < 8) {
      const defaultRules = this.getDefaultPartRules();
      const targetRule = defaultRules.find((r) => r.channel === channel);
      if (targetRule) {
        Object.assign(targetRule, rule);
      }
      this.updateParsedCasm(parsed, defaultRules);
      return { success: true, message: `成功為無 CASM 伴奏檔案建立標準轉調規則` };
    }

    const casmData = casmChunk.data instanceof Uint8Array
      ? casmChunk.data
      : new Uint8Array(Object.values(casmChunk.data || {}));
    casmChunk.data = casmData;

    const view = new DataView(casmData.buffer, casmData.byteOffset, casmData.byteLength);
    const targetSecLower = sectionName.trim().toLowerCase();
    const targetSecNoSpace = targetSecLower.replace(/\s+/g, '');

    // 建立 55-byte 獨立 Ctb2 子區塊
    const ctbSub = this.buildCtb2Subchunk(rule, channel);

    // 掃描所有 CSEG，優先尋找「專屬此段落」的 CSEG (names.length === 1)
    let offset = 0;
    let exactDedicatedCsegOffset = -1;
    let exactDedicatedCsegLen = 0;
    let exactDedicatedExistingCtb2Offset = -1;

    // 備用：若尚未有專屬 CSEG，記錄包含此段落的多段落共享 CSEG (names.length > 1)
    let sharedCsegOffset = -1;
    let sharedCsegLen = 0;
    let sharedSdecOffset = -1;
    let sharedSdecLen = 0;
    let sharedNames: string[] = [];

    while (offset <= casmData.length - 8) {
      const tagStr = String.fromCharCode(...casmData.slice(offset, offset + 4));
      const len = view.getUint32(offset + 4);

      if (tagStr === 'CSEG') {
        const end = offset + 8 + len;
        let sub = offset + 8;
        let csegMatched = false;
        let curSdecOffset = -1;
        let curSdecLen = 0;
        let curNames: string[] = [];
        const ctbOffsets: { offset: number; srcCh: number; destCh: number }[] = [];

        while (sub <= end - 8) {
          const sTag = String.fromCharCode(...casmData.slice(sub, sub + 4));
          const sLen = view.getUint32(sub + 4);

          if (sTag === 'Sdec') {
            curSdecOffset = sub;
            curSdecLen = sLen;
            const sStr = new TextDecoder().decode(casmData.slice(sub + 8, sub + 8 + sLen));
            curNames = sStr.split(/[\x00,]+/).map((s) => s.trim()).filter(Boolean);
            if (curNames.some((n) => n.toLowerCase() === targetSecLower || n.toLowerCase().replace(/\s+/g, '') === targetSecNoSpace)) {
              csegMatched = true;
            }
          } else if (sTag === 'Ctb2' || sTag === 'CTAB') {
            const srcCh = casmData[sub + 8];
            const destCh = casmData[sub + 8 + 9];
            ctbOffsets.push({ offset: sub, srcCh, destCh });
          }
          sub += 8 + sLen;
        }

        if (csegMatched) {
          if (curNames.length === 1) {
            // 找到專屬此段落的 CSEG！
            exactDedicatedCsegOffset = offset;
            exactDedicatedCsegLen = len;
            const exactExisting = ctbOffsets.find((c) => c.srcCh === channel && c.destCh === channel);
            const existing = exactExisting || ctbOffsets.find((c) => c.destCh === channel);
            if (existing) {
              exactDedicatedExistingCtb2Offset = existing.offset;
            }
            break; // 專屬 CSEG 是最佳匹配，直接採用
          } else if (sharedCsegOffset < 0) {
            // 找到包含此段落的共享 CSEG
            sharedCsegOffset = offset;
            sharedCsegLen = len;
            sharedSdecOffset = curSdecOffset;
            sharedSdecLen = curSdecLen;
            sharedNames = curNames;
          }
        }
        offset = end;
      } else {
        offset += 8 + len;
      }
    }

    if (exactDedicatedCsegOffset >= 0) {
      if (exactDedicatedExistingCtb2Offset >= 0) {
        // 該段落專屬 CSEG 內已存在此聲部之 Ctb2 規則：直接原地覆寫 47-byte 內容
        const ctbData = this.buildCtb2Data(rule, channel);
        if (rule.sourceChordRoot === undefined && casmData.length > exactDedicatedExistingCtb2Offset + 8 + 18) {
          ctbData[18] = casmData[exactDedicatedExistingCtb2Offset + 8 + 18];
        }
        if (rule.sourceChordType === undefined && casmData.length > exactDedicatedExistingCtb2Offset + 8 + 19) {
          ctbData[19] = casmData[exactDedicatedExistingCtb2Offset + 8 + 19];
        }
        const updatedData = new Uint8Array(casmData);
        updatedData.set(ctbData, exactDedicatedExistingCtb2Offset + 8);
        casmChunk.data = updatedData;
      } else {
        // 該段落專屬 CSEG 尚未登記此聲部：在目標 CSEG 的末端增量插入 55-byte 之全新 Ctb2 子區塊
        const insertPos = exactDedicatedCsegOffset + 8 + exactDedicatedCsegLen;
        const updatedData = new Uint8Array(casmData.length + ctbSub.length);
        updatedData.set(casmData.slice(0, insertPos), 0);
        updatedData.set(ctbSub, insertPos);
        updatedData.set(casmData.slice(insertPos), insertPos + ctbSub.length);

        // 同步更新該 CSEG 的 32-bit 長度標頭 (+55 bytes)
        const updatedView = new DataView(updatedData.buffer, updatedData.byteOffset, updatedData.byteLength);
        updatedView.setUint32(exactDedicatedCsegOffset + 4, exactDedicatedCsegLen + ctbSub.length, false);
        casmChunk.data = updatedData;
      }
    } else if (sharedCsegOffset >= 0) {
      // 關鍵修復：該段落目前與其他段落共享同一個 CSEG (如 Main A~D, Intro A, Ending A 共享 CSEG 0)。
      // 絕不可直接原地覆寫共享 CSEG，否則會同時竄改其他伴奏段落（如 Main A~D）的和弦與轉調模式！
      // 正確做法：將目標段落自共享 CSEG 中剝離 (自 Sdec 中移除)，並為其獨立建立專屬的全新 CSEG！

      // 1. 自原共享 CSEG 的 Sdec 移除目標段落
      const remainingNames = sharedNames.filter(
        (n) => n.toLowerCase() !== targetSecLower && n.toLowerCase().replace(/\s+/g, '') !== targetSecNoSpace
      );
      const newSdecBytes = new TextEncoder().encode(remainingNames.join(','));
      const oldSdecTotalLen = 8 + sharedSdecLen;
      const newSdecTotalLen = 8 + newSdecBytes.length;

      // 提取原共享 CSEG 中的所有 Ctb2 / 子區塊 (Sdec 之後的全部數據)
      const ctb2DataAfterSdec = casmData.slice(
        sharedSdecOffset + oldSdecTotalLen,
        sharedCsegOffset + 8 + sharedCsegLen
      );

      // 重構修改後的原共享 CSEG (長度調整)
      const newSharedCsegDataLen = newSdecTotalLen + ctb2DataAfterSdec.length;
      const newSharedCsegChunk = new Uint8Array(8 + newSharedCsegDataLen);
      newSharedCsegChunk[0] = 'C'.charCodeAt(0);
      newSharedCsegChunk[1] = 'S'.charCodeAt(0);
      newSharedCsegChunk[2] = 'E'.charCodeAt(0);
      newSharedCsegChunk[3] = 'G'.charCodeAt(0);
      const sharedView = new DataView(newSharedCsegChunk.buffer);
      sharedView.setUint32(4, newSharedCsegDataLen, false);

      // 寫入縮減後的 Sdec
      newSharedCsegChunk[8] = 'S'.charCodeAt(0);
      newSharedCsegChunk[9] = 'd'.charCodeAt(0);
      newSharedCsegChunk[10] = 'e'.charCodeAt(0);
      newSharedCsegChunk[11] = 'c'.charCodeAt(0);
      sharedView.setUint32(12, newSdecBytes.length, false);
      newSharedCsegChunk.set(newSdecBytes, 16);

      // 寫入原有的 Ctb2 數據
      newSharedCsegChunk.set(ctb2DataAfterSdec, 8 + newSdecTotalLen);

      // 2. 為目標段落建立全新的專屬 CSEG
      const dedicatedSecBytes = new TextEncoder().encode(sectionName);
      const dedicatedSdecTotalLen = 8 + dedicatedSecBytes.length;

      // 複製一份原 Ctb2 數據，並在其中將目標 channel 替換為新規則 (若無則追加)
      let dedicatedCtbData = new Uint8Array(ctb2DataAfterSdec);
      let channelFoundInCopy = false;
      let ctbPos = 0;
      while (ctbPos + 8 <= dedicatedCtbData.length) {
        const subId = String.fromCharCode(...dedicatedCtbData.slice(ctbPos, ctbPos + 4));
        const subLen = (dedicatedCtbData[ctbPos + 4] << 24) | (dedicatedCtbData[ctbPos + 5] << 16) | (dedicatedCtbData[ctbPos + 6] << 8) | dedicatedCtbData[ctbPos + 7];
        if (subId === 'Ctb2' && subLen >= 47) {
          const srcCh = dedicatedCtbData[ctbPos + 8];
          const destCh = dedicatedCtbData[ctbPos + 8 + 9];
          if (destCh === channel || (destCh === undefined && (srcCh & 0x0f) === channel)) {
            const newCtbBody = this.buildCtb2Data(rule, channel);
            dedicatedCtbData.set(newCtbBody, ctbPos + 8);
            channelFoundInCopy = true;
            break;
          }
        }
        ctbPos += 8 + subLen;
      }

      if (!channelFoundInCopy) {
        // 若原本沒有此 channel 的 Ctb2，追加一個 Ctb2 子區塊
        const combined = new Uint8Array(dedicatedCtbData.length + ctbSub.length);
        combined.set(dedicatedCtbData, 0);
        combined.set(ctbSub, dedicatedCtbData.length);
        dedicatedCtbData = combined;
      }

      const dedicatedCsegDataLen = dedicatedSdecTotalLen + dedicatedCtbData.length;
      const dedicatedCsegChunk = new Uint8Array(8 + dedicatedCsegDataLen);
      dedicatedCsegChunk[0] = 'C'.charCodeAt(0);
      dedicatedCsegChunk[1] = 'S'.charCodeAt(0);
      dedicatedCsegChunk[2] = 'E'.charCodeAt(0);
      dedicatedCsegChunk[3] = 'G'.charCodeAt(0);
      const dedicatedView = new DataView(dedicatedCsegChunk.buffer);
      dedicatedView.setUint32(4, dedicatedCsegDataLen, false);

      // 寫入專屬 Sdec
      dedicatedCsegChunk[8] = 'S'.charCodeAt(0);
      dedicatedCsegChunk[9] = 'd'.charCodeAt(0);
      dedicatedCsegChunk[10] = 'e'.charCodeAt(0);
      dedicatedCsegChunk[11] = 'c'.charCodeAt(0);
      dedicatedView.setUint32(12, dedicatedSecBytes.length, false);
      dedicatedCsegChunk.set(dedicatedSecBytes, 16);

      // 寫入更新後的專屬 Ctb2
      dedicatedCsegChunk.set(dedicatedCtbData, 8 + dedicatedSdecTotalLen);

      // 3. 拼裝新的 CASM 二進位數據
      const partBefore = casmData.slice(0, sharedCsegOffset);
      const partAfter = casmData.slice(sharedCsegOffset + 8 + sharedCsegLen);
      const totalNewLength = partBefore.length + newSharedCsegChunk.length + partAfter.length + dedicatedCsegChunk.length;

      const finalCasmData = new Uint8Array(totalNewLength);
      let p = 0;
      finalCasmData.set(partBefore, p);
      p += partBefore.length;
      finalCasmData.set(newSharedCsegChunk, p);
      p += newSharedCsegChunk.length;
      finalCasmData.set(partAfter, p);
      p += partAfter.length;
      finalCasmData.set(dedicatedCsegChunk, p);

      casmChunk.data = finalCasmData;
    } else {
      // 該段落尚未有獨立 CSEG：在 CASM 結尾追加全新的 CSEG (含 Sdec 與 Ctb2)
      const secBytes = new TextEncoder().encode(sectionName);
      const sdecLen = secBytes.length;
      const csegDataLen = 8 + sdecLen + ctbSub.length;
      const newCsegChunk = new Uint8Array(8 + csegDataLen);

      // CSEG 標頭
      newCsegChunk[0] = 'C'.charCodeAt(0);
      newCsegChunk[1] = 'S'.charCodeAt(0);
      newCsegChunk[2] = 'E'.charCodeAt(0);
      newCsegChunk[3] = 'G'.charCodeAt(0);
      const csegView = new DataView(newCsegChunk.buffer);
      csegView.setUint32(4, csegDataLen, false);

      // Sdec 子區塊
      newCsegChunk[8] = 'S'.charCodeAt(0);
      newCsegChunk[9] = 'd'.charCodeAt(0);
      newCsegChunk[10] = 'e'.charCodeAt(0);
      newCsegChunk[11] = 'c'.charCodeAt(0);
      csegView.setUint32(12, sdecLen, false);
      newCsegChunk.set(secBytes, 16);

      // Ctb2 子區塊
      newCsegChunk.set(ctbSub, 16 + sdecLen);

      // 附加至 CASM 結尾
      const updatedData = new Uint8Array(casmData.length + newCsegChunk.length);
      updatedData.set(casmData, 0);
      updatedData.set(newCsegChunk, casmData.length);
      casmChunk.data = updatedData;
    }

    parsed.hasCasm = true;
    if (casmChunk.data) {
      parsed.casmEntries = YamahaParser.parseCasmEntries(casmChunk.data);
    }
    return {
      success: true,
      message: `成功為伴奏段落 [${sectionName}] 增量配置 CH ${channel + 1} 之 SFF2 CASM 伴奏規則`,
    };
  }

  /**
   * 【任務 2-4E】查詢指定伴奏段落 (sectionName) 與指定通道 (channel: 8~15) 目前生效的 CASM 聲部規則與高階轉調模式
   */
  public static getSectionChannelRule(
    parsed: YamahaFileParsed,
    sectionName: string,
    channel: number
  ): {
    rule: CasmPartRule;
    mode: CasmChannelTranspositionMode;
    isFixedBypass: boolean;
    labelZh: string;
    shortBadgeZh: string;
  } {
    const rules = this.extractPartRules(parsed, sectionName);
    const found = rules.find((r) => r.channel === channel) || this.getDefaultPartRules().find((r) => r.channel === channel)!;
    const mode = this.resolveTranspositionMode(found);
    const isFixedBypass = mode === 'FIXED_BYPASS';

    let labelZh = '隨和弦轉調 (Root Transpose + Chord)';
    let shortBadgeZh = '🎹 和弦吸附';
    if (mode === 'FIXED_BYPASS') {
      labelZh = '🔒 固定音高直通 (Root Fixed + Bypass · 不隨左手和弦變音)';
      shortBadgeZh = '🔒 固定音高直通';
    } else if (mode === 'TRANSPOSE_MELODY') {
      labelZh = '🎵 旋律音階跟隨 (Root Transpose + Melody · 保護花音)';
      shortBadgeZh = '🎵 旋律跟隨';
    } else if (mode === 'TRANSPOSE_BASS') {
      labelZh = '🎸 貝斯根音跟隨 (Root Transpose + Bass)';
      shortBadgeZh = '🎸 貝斯根音';
    } else if (mode === 'TRANSPOSE_BYPASS') {
      labelZh = '⚡ 單鍵根音直通 (Root Transpose + Bypass · 隨根音平移)';
      shortBadgeZh = '⚡ 根音直通';
    }

    return {
      rule: found,
      mode,
      isFixedBypass,
      labelZh,
      shortBadgeZh,
    };
  }

  /**
   * 由 CasmPartRule 判定高階轉調模式分類
   */
  public static resolveTranspositionMode(rule: CasmPartRule): CasmChannelTranspositionMode {
    if (rule.ntr === 'Root Fixed' && rule.ntt === 'Bypass') {
      return 'FIXED_BYPASS';
    }
    if (rule.ntt === 'Bypass') {
      return 'TRANSPOSE_BYPASS';
    }
    if (rule.ntt === 'Bass') {
      return 'TRANSPOSE_BASS';
    }
    if (rule.ntt === 'Melody') {
      return 'TRANSPOSE_MELODY';
    }
    return 'TRANSPOSE_CHORD';
  }

  /**
   * 【任務 2-4E】一鍵設定指定段落 (sectionName) 與通道 (channel: 8~15) 的 NTR/NTT 轉調模式
   * - 自動遵守「CASM 段落獨立隔離鐵律 (CSEG Section Isolation Rule)」，不干擾其他伴奏段落
   * - 自動同步重新解析 parsed.casmEntries，使播放器虛擬和弦試聽與二進位匯出 100% 即時同步生效
   */
  public static setSectionChannelTranspositionMode(
    parsed: YamahaFileParsed,
    sectionName: string,
    channel: number,
    mode: CasmChannelTranspositionMode
  ): {
    success: boolean;
    updatedRule: CasmPartRule;
    mode: CasmChannelTranspositionMode;
    message: string;
  } {
    const current = this.getSectionChannelRule(parsed, sectionName, channel);
    const updatedRule: CasmPartRule = { ...current.rule };

    if (mode === 'FIXED_BYPASS') {
      updatedRule.ntr = 'Root Fixed';
      updatedRule.ntt = 'Bypass';
      updatedRule.noteLowLimit = 0;
      updatedRule.noteHighLimit = 127;
      updatedRule.sourceChordRoot = 0;
      updatedRule.sourceChordType = 0;
    } else if (mode === 'TRANSPOSE_MELODY') {
      updatedRule.ntr = 'Root Transpose';
      updatedRule.ntt = 'Melody';
      updatedRule.hiKey = 6;
    } else if (mode === 'TRANSPOSE_CHORD') {
      updatedRule.ntr = 'Root Transpose';
      updatedRule.ntt = 'Chord';
      updatedRule.hiKey = 6;
    } else if (mode === 'TRANSPOSE_BASS') {
      updatedRule.ntr = 'Root Transpose';
      updatedRule.ntt = 'Bass';
      updatedRule.hiKey = 5;
    } else if (mode === 'TRANSPOSE_BYPASS') {
      updatedRule.ntr = 'Root Transpose';
      updatedRule.ntt = 'Bypass';
      updatedRule.sourceChordRoot = 0;
      updatedRule.sourceChordType = 0;
    }

    const res = this.injectOrUpdateSectionCasmRule(parsed, sectionName, channel, updatedRule);
    return {
      success: res.success,
      updatedRule,
      mode,
      message: res.message,
    };
  }
}
