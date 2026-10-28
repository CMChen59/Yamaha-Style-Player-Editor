/**
 * Yamaha Style 伴奏風格跨風格相容性檢測器 (Style Compatibility Checker)
 * 用於在跨風格混血拼貼 (Cross-Style Remixing) 與聲部組裝時，
 * 自動檢測來源風格與目標風格的拍號 (Time Signature)、速度 (BPM)、解析度 (PPQ) 與段落小節長度相容性，
 * 提供繁體中文的即時警示 (Warnings) 與音樂性調整建議 (Advisories)。
 */

import type { YamahaFileParsed } from '../models/types';
import { StyleRemixer } from './style-remixer';

export interface StyleCompatibilityReport {
  isCompatible: boolean;
  isTimeSignatureCompatible: boolean;
  srcTimeSig: string;
  destTimeSig: string;
  isBpmCompatible: boolean;
  srcBpm: number;
  destBpm: number;
  bpmDiff: number;
  isDivisionCompatible: boolean;
  srcDivision: number;
  destDivision: number;
  warnings: string[];
  advisories: string[];
  summaryMessage: string;
}

export class StyleCompatibilityChecker {
  /**
   * 格式化拍號為人類可讀字串 (例如 "4/4", "3/4", "6/8")
   */
  public static formatTimeSignature(sig?: { numerator: number; denominator: number }): string {
    if (!sig || !sig.numerator || !sig.denominator) return '4/4';
    return `${sig.numerator}/${sig.denominator}`;
  }

  /**
   * 深度檢測來源風格與目標風格的相容性
   */
  public static checkCompatibility(
    srcParsed: YamahaFileParsed,
    destParsed: YamahaFileParsed,
    srcSectionName?: string,
    destSectionName?: string
  ): StyleCompatibilityReport {
    const warnings: string[] = [];
    const advisories: string[] = [];

    // 1. 拍號檢測 (Time Signature)
    const srcSig = srcParsed.timeSignature || { numerator: 4, denominator: 4 };
    const destSig = destParsed.timeSignature || { numerator: 4, denominator: 4 };
    const srcTimeSigStr = this.formatTimeSignature(srcSig);
    const destTimeSigStr = this.formatTimeSignature(destSig);

    const isTimeSignatureCompatible =
      srcSig.numerator === destSig.numerator && srcSig.denominator === destSig.denominator;

    if (!isTimeSignatureCompatible) {
      warnings.push(
        `拍號不相符：來源風格為 ${srcTimeSigStr} 拍，目標風格為 ${destTimeSigStr} 拍。拍子重音與小節結構不同，直接拼貼可能造成小節錯位或節奏重音不合！`
      );
    }

    // 2. 速度檢測 (BPM)
    const srcBpm = Math.round(srcParsed.bpm || 120);
    const destBpm = Math.round(destParsed.bpm || 120);
    const bpmDiff = Math.abs(srcBpm - destBpm);
    const isBpmCompatible = bpmDiff <= 15;

    if (bpmDiff > 30) {
      warnings.push(
        `速度差異過大：來源風格速度為 ${srcBpm} BPM，目標風格速度為 ${destBpm} BPM (相差 ${bpmDiff} BPM)。拼貼後音符將以目標速度播放，風格韻律 (Groove) 可能產生顯著變化。`
      );
    } else if (bpmDiff > 15) {
      advisories.push(
        `速度差異提示：來源速度 ${srcBpm} BPM vs 目標速度 ${destBpm} BPM (相差 ${bpmDiff} BPM)。組裝後將統一採用目標伴奏速度。`
      );
    }

    // 3. 解析度檢測 (Division / PPQ)
    const srcDivision = srcParsed.division || 480;
    const destDivision = destParsed.division || 480;
    const isDivisionCompatible = srcDivision === destDivision;

    if (!isDivisionCompatible) {
      advisories.push(
        `解析度轉換：來源為 ${srcDivision} PPQ，目標為 ${destDivision} PPQ。組裝引擎將自動按比例縮放 Delta Ticks 保持對齊。`
      );
    }

    // 4. 段落長度小節數檢測 (若有指定段落)
    if (srcSectionName && destSectionName) {
      const srcRange = StyleRemixer.getSectionTickRange(srcParsed, srcSectionName);
      const destRange = StyleRemixer.getSectionTickRange(destParsed, destSectionName);

      if (srcRange && destRange) {
        if (srcRange.measureCount < destRange.measureCount) {
          advisories.push(
            `段落長度差異：來源段落 [${srcSectionName}] (${srcRange.measureCount} 小節) 短於目標 [${destSectionName}] (${destRange.measureCount} 小節)。將自動採用「小節循環填滿 (Loop to Fill)」補足長度。`
          );
        } else if (srcRange.measureCount > destRange.measureCount) {
          advisories.push(
            `段落長度差異：來源段落 [${srcSectionName}] (${srcRange.measureCount} 小節) 長於目標 [${destSectionName}] (${destRange.measureCount} 小節)。超出部分將於段落末端安全截斷。`
          );
        }
      }
    }

    // 綜合相容性判定
    const isCompatible = isTimeSignatureCompatible && bpmDiff <= 30;

    let summaryMessage = '✅ 拍號與速度相容';
    if (!isTimeSignatureCompatible) {
      summaryMessage = `⚠️ 拍號不符 (${srcTimeSigStr} vs ${destTimeSigStr})`;
    } else if (bpmDiff > 30) {
      summaryMessage = `⚠️ 速度差異較大 (差 ${bpmDiff} BPM)`;
    } else if (bpmDiff > 15) {
      summaryMessage = `ℹ️ 速度小幅差異 (差 ${bpmDiff} BPM)`;
    }

    return {
      isCompatible,
      isTimeSignatureCompatible,
      srcTimeSig: srcTimeSigStr,
      destTimeSig: destTimeSigStr,
      isBpmCompatible,
      srcBpm,
      destBpm,
      bpmDiff,
      isDivisionCompatible,
      srcDivision,
      destDivision,
      warnings,
      advisories,
      summaryMessage,
    };
  }
}
