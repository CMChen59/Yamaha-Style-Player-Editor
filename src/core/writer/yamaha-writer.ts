import { BinaryWriter } from './binary-writer';
import { YamahaPadModifier } from './pad-modifier';
import { YamahaParser } from '../parser/yamaha-parser';
import type { YamahaFileParsed } from '../models/types';

export interface ExportValidationResult {
  success: boolean;
  bytes: Uint8Array;
  fileSize: number;
  format: 'STY' | 'PAD';
  midiFormat: number;
  division: number;
  trackCount: number;
  sectionCount: number;
  totalNotes: number;
  hasCasm: boolean;
  casmSize?: number;
  customChunks: Array<{ id: string; size: number }>;
  warnings: string[];
}

export interface PreExportInspection {
  format: 'STY' | 'PAD';
  midiFormat: number;
  division: number;
  trackCount: number;
  sectionCount: number;
  sectionNames: string[];
  totalNotes: number;
  hasCasm: boolean;
  casmSize?: number;
  customChunks: Array<{ id: string; size: number }>;
  warnings: string[];
  emptySections: string[];
  customMuteSectionsCount?: number;
  customMutePartsCount?: number;
}

export class YamahaWriter {
  /**
   * 匯出前全域結構巡檢與統計分析 (Pre-export Inspection)
   */
  public static inspectPreExport(
    parsed: YamahaFileParsed,
    muteState?: Record<string, Record<number, boolean>>
  ): PreExportInspection {
    const format = parsed.format;
    const warnings: string[] = [];
    const emptySections: string[] = [];
    const sectionNames = parsed.sections.map(s => s.name);

    // 1. 計算總音符數 (NoteOn events with velocity > 0)
    let totalNotes = 0;
    for (const track of parsed.tracks) {
      if (track.events) {
        for (const ev of track.events) {
          if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
            totalNotes++;
          }
        }
      }
    }

    // 2. STY 專屬檢查
    if (format === 'STY') {
      // 檢查各段落音符數
      const track0 = parsed.tracks[0];
      if (track0 && track0.events) {
        for (const sec of parsed.sections) {
          if (sec.startTick !== undefined && sec.endTick !== undefined) {
            let curTick = 0;
            let secNotes = 0;
            for (const ev of track0.events) {
              curTick += ev.delta;
              if (curTick >= sec.startTick && curTick < sec.endTick) {
                if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
                  secNotes++;
                }
              }
            }
            if (secNotes === 0) {
              emptySections.push(sec.name);
            }
          }
        }
      }

      if (emptySections.length > 0) {
        warnings.push(`伴奏段落 [${emptySections.join(', ')}] 目前音符數為 0，匯出後此段落將處於靜音無聲狀態。`);
      }

      // CASM 區塊檢查
      const casmChunk = parsed.customChunks.find(c => c.id.trim() === 'CASM');
      if (!casmChunk && !parsed.hasCasm) {
        warnings.push('檔案未包含 Yamaha CASM 和弦轉調控制區塊（若原始檔案無 CASM 則不影響原樣播放）。');
      }
    } else {
      // PAD 檢查
      if (totalNotes === 0) {
        warnings.push('所有 Multi Pad 軌道目前音符數皆為 0。');
      }
    }

    let customMuteSectionsCount = 0;
    let customMutePartsCount = 0;
    if (muteState) {
      for (const chMap of Object.values(muteState)) {
        const count = Object.values(chMap).filter(Boolean).length;
        if (count > 0) {
          customMuteSectionsCount++;
          customMutePartsCount += count;
        }
      }
    }

    const casmChunk = parsed.customChunks.find(c => c.id.trim() === 'CASM');
    const customChunks = parsed.customChunks.map(c => ({ id: c.id.trim(), size: c.data.length }));

    return {
      format,
      midiFormat: parsed.midiFormat,
      division: parsed.division,
      trackCount: parsed.tracks.length,
      sectionCount: parsed.sections.length,
      sectionNames,
      totalNotes,
      hasCasm: parsed.hasCasm || !!casmChunk,
      casmSize: casmChunk ? casmChunk.data.length : undefined,
      customChunks,
      warnings,
      emptySections,
      customMuteSectionsCount,
      customMutePartsCount,
    };
  }

  /**
   * 確保所有音軌皆有最新且合法的 MTrk rawChunk 與 EndOfTrack
   */
  public static prepareTracks(parsed: YamahaFileParsed): void {
    for (const track of parsed.tracks) {
      if (!track.events || track.events.length === 0) {
        track.events = [{ delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) }];
        YamahaPadModifier.rebuildTrackRawChunk(track);
        continue;
      }

      // 檢查末端是否包含 EndOfTrack
      const lastEv = track.events[track.events.length - 1];
      const hasEndOfTrack = lastEv.type === 'meta' && lastEv.metaType === 0x2f;
      if (!hasEndOfTrack) {
        track.events.push({ delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) });
        YamahaPadModifier.rebuildTrackRawChunk(track);
      } else if (!track.rawChunk || track.rawChunk.length === 0) {
        YamahaPadModifier.rebuildTrackRawChunk(track);
      }
    }
  }

  /**
   * 將解析後的結構無損重構為二進位 Buffer
   */
  public static write(parsed: YamahaFileParsed): Uint8Array {
    this.prepareTracks(parsed);

    const writer = new BinaryWriter();

    // 1. 寫入 MThd 標頭
    writer.writeString('MThd');
    writer.writeUint32BE(6); // MThd 標準長度固定為 6 bytes
    writer.writeUint16BE(parsed.midiFormat);
    writer.writeUint16BE(parsed.tracks.length);
    writer.writeUint16BE(parsed.division);

    // 2. 寫入各軌 MTrk (使用無損保留的 rawChunk)
    for (const track of parsed.tracks) {
      if (track.rawChunk && track.rawChunk.length > 0) {
        writer.writeBytes(track.rawChunk);
      } else {
        throw new Error(`Track ${track.trackIndex} 缺少 rawChunk，無法進行無損重構`);
      }
    }

    // 3. 寫入 Yamaha 專屬自訂區塊 (CASM, OTS, etc.)
    for (const chunk of parsed.customChunks) {
      writer.writeString(chunk.id.padEnd(4, ' '));
      writer.writeUint32BE(chunk.data.length);
      writer.writeBytes(chunk.data);
    }

    return writer.toUint8Array();
  }

  /**
   * 步驟 3.5: 二進位完整性校驗與安全匯出 (Validate & Write with Round-trip Self-Check)
   */
  public static validateAndWrite(parsed: YamahaFileParsed): ExportValidationResult {
    const inspection = this.inspectPreExport(parsed);
    const bytes = this.write(parsed);

    // 執行反向重新解析驗證 (Round-trip Verification)
    let reParsed: YamahaFileParsed;
    try {
      reParsed = YamahaParser.parse(bytes, parsed.format);
    } catch (parseErr: any) {
      throw new Error(`二進位反向驗證解析失敗: ${parseErr.message}`);
    }

    if (reParsed.tracks.length !== parsed.tracks.length) {
      throw new Error(`二進位驗證失敗: 音軌數量不符 (原始: ${parsed.tracks.length}, 匯出反解析: ${reParsed.tracks.length})`);
    }

    if (reParsed.division !== parsed.division) {
      throw new Error(`二進位驗證失敗: PPQ 解析度不符 (原始: ${parsed.division}, 匯出反解析: ${reParsed.division})`);
    }

    if (reParsed.customChunks.length !== parsed.customChunks.length) {
      throw new Error(`二進位驗證失敗: Yamaha 自訂區塊數量不符 (原始: ${parsed.customChunks.length}, 匯出反解析: ${reParsed.customChunks.length})`);
    }

    if (parsed.format === 'STY') {
      const origCasm = parsed.customChunks.find(c => c.id.trim() === 'CASM');
      const reCasm = reParsed.customChunks.find(c => c.id.trim() === 'CASM');
      if (origCasm && !reCasm) {
        throw new Error('二進位驗證失敗: CASM 伴奏轉調控制區塊遺失！');
      }
      if (origCasm && reCasm && origCasm.data.length !== reCasm.data.length) {
        throw new Error(`二進位驗證失敗: CASM 區塊長度不一致 (原始: ${origCasm.data.length}, 重構: ${reCasm.data.length})`);
      }

      const origOts = parsed.customChunks.find(c => c.id.trim() === 'OTS' || c.id.trim() === 'OTSc' || c.id.startsWith('OTS'));
      const reOts = reParsed.customChunks.find(c => c.id.trim() === 'OTS' || c.id.trim() === 'OTSc' || c.id.startsWith('OTS'));
      if (origOts && !reOts) {
        throw new Error('二進位驗證失敗: OTS 右手音色設定區塊遺失！');
      }
      if (origOts && reOts && origOts.data.length !== reOts.data.length) {
        throw new Error(`二進位驗證失敗: OTS 區塊長度不一致 (原始: ${origOts.data.length}, 重構: ${reOts.data.length})`);
      }
    }

    return {
      success: true,
      bytes,
      fileSize: bytes.length,
      format: parsed.format,
      midiFormat: parsed.midiFormat,
      division: parsed.division,
      trackCount: parsed.tracks.length,
      sectionCount: parsed.sections.length,
      totalNotes: inspection.totalNotes,
      hasCasm: inspection.hasCasm,
      casmSize: inspection.casmSize,
      customChunks: inspection.customChunks,
      warnings: inspection.warnings,
    };
  }
}
