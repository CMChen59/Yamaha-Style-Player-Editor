/**
 * Yamaha Style 伴奏風格 (.STY) 二進位合成引擎 (Style Synthesizer)
 * 負責從零構建或由外部 MIDI 軌道合成 100% 符合 Yamaha SFF2 / PSR-SX920 原廠伴奏格式規範的 Style 檔案
 */

import { BinaryWriter } from './binary-writer';
import { YamahaPadModifier } from './pad-modifier';
import { YamahaWriter } from './yamaha-writer';
import type {
  YamahaFileParsed,
  MidiTrack,
  MidiEvent,
  YamahaSection,
  YamahaTrackInfo,
  YamahaCustomChunk,
} from '../models/types';
import {
  DEFAULT_STYLE_PARTS,
  type StylePartId,
  type StylePartConfig,
  type StyleSectionConfig,
  type NewStyleProjectOptions,
} from '../models/style-types';

export class YamahaStyleSynthesizer {
  /**
   * 建立全新標準 Yamaha Style (.sty) 伴奏專案
   * 依據 Yamaha 原廠規範，Style 檔案一律採用 SMF 0 (Format 0) 單軌架構，
   * 8 個伴奏聲部（MIDI Channel 9~16，0-indexed 8~15）與曲式段落標記全數於 Track 0 依時序交織排列。
   */
  public static createBlankStyle(options?: NewStyleProjectOptions): YamahaFileParsed {
    const styleName = options?.styleName?.trim() || 'New Style';
    const bpm = Math.max(30, Math.min(300, options?.bpm ?? 120));
    const timeSig = options?.timeSignature ?? { numerator: 4, denominator: 4 };
    const division = options?.division ?? 1920;

    const ticksPerBeat = division;
    const ticksPerBar = Math.round(ticksPerBeat * timeSig.numerator * (4 / timeSig.denominator));

    // 1. 定義伴奏曲式段落 (預設: Main A 4小節, Fill In AA 1小節, Main B 4小節, Ending A 2小節)
    const defaultSections: StyleSectionConfig[] = options?.sections ?? [
      { name: 'Main A', bars: 4 },
      { name: 'Fill In AA', bars: 1 },
      { name: 'Main B', bars: 4 },
      { name: 'Ending A', bars: 2 },
    ];

    // 2. 準備 8 個伴奏聲部設定 (合併預設與自訂參數)
    const partKeys: StylePartId[] = ['Rhythm1', 'Rhythm2', 'Bass', 'Chord1', 'Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    const activeParts: StylePartConfig[] = partKeys.map((k) => {
      const def = DEFAULT_STYLE_PARTS[k];
      const custom = options?.parts?.[k];
      const merged = {
        ...def,
        ...custom,
      };

      // Yamaha Arranger 伴奏音軌安全音色庫映射 (XG Mode Compatibility)
      // 實體琴 (PSR-SX920/SX900/Genos) 伴奏合成引擎 (SMF 0, Ch 9~16) 在 SInt 接收 XG On 後，
      // 音軌必須遵循標準 XG Bank 規範：
      // - 鼓組 (Ch 8, 9): MSB 127, LSB 0
      // - 樂器 (Ch 10~15): MSB 0, LSB 0 (若使用面板專用庫如 LSB 112/116 會導致實體琴拋出 Data has not been loaded properly)
      if (merged.channel === 8 || merged.channel === 9) {
        merged.msb = 127;
        merged.lsb = 0;
      } else {
        if (merged.msb >= 100 || merged.lsb >= 100 || merged.lsb !== 0) {
          merged.msb = 0;
          merged.lsb = 0;
        }
      }

      return merged;
    });

    // 3. 收集帶有絕對 Tick 的事件清單
    interface AbsEvent {
      absTick: number;
      priority: number; // 相同 Tick 時的排序權重
      event: MidiEvent;
    }
    const absEvents: AbsEvent[] = [];

    // --- Tick 0: 標頭控制項與音色初始化 ---
    // Meta 0x03: 軌道名稱 (固定為 Style Track)
    absEvents.push({
      absTick: 0,
      priority: 1,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x03,
        metaData: new TextEncoder().encode(styleName),
        text: styleName,
      },
    });

    // Meta 0x06: SFF2 標記 (Yamaha Style File Format 2 必要識別標籤)
    absEvents.push({
      absTick: 0,
      priority: 2,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x06,
        metaData: new TextEncoder().encode('SFF2'),
        text: 'SFF2',
      },
    });

    // Meta 0x06: SInt 標記 (Style Initialization 必要識別標籤)
    absEvents.push({
      absTick: 0,
      priority: 3,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x06,
        metaData: new TextEncoder().encode('SInt'),
        text: 'SInt',
      },
    });

    // Meta 0x58: 拍號 (Time Signature)
    const nn = timeSig.numerator;
    const dd = Math.round(Math.log2(timeSig.denominator));
    absEvents.push({
      absTick: 0,
      priority: 4,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x58,
        metaData: new Uint8Array([nn, dd, 24, 8]),
      },
    });

    // Meta 0x51: 速度 (Tempo)
    const microsecPerQuarter = Math.round(60000000 / bpm);
    absEvents.push({
      absTick: 0,
      priority: 5,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x51,
        metaData: new Uint8Array([
          (microsecPerQuarter >> 16) & 0xff,
          (microsecPerQuarter >> 8) & 0xff,
          microsecPerQuarter & 0xff,
        ]),
      },
    });

    // Yamaha 原廠 Style 必要 SysEx 初始化序列 (XG Works Style Header, GM On, XG System On)
    // 確保實體琴 (PSR-SX920/SX900/Genos) 伴奏引擎能正確識別並將音源切換至 XG 伴奏音色庫
    absEvents.push({
      absTick: 0,
      priority: 6,
      event: {
        delta: 0,
        type: 'sysex',
        rawBytes: new Uint8Array([0x43, 0x76, 0x1a, 0x10, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0xf7]),
      },
    });

    absEvents.push({
      absTick: 0,
      priority: 7,
      event: {
        delta: 0,
        type: 'sysex',
        rawBytes: new Uint8Array([0x7e, 0x7f, 0x09, 0x01, 0xf7]),
      },
    });

    const xgTick = Math.max(1, Math.round(ticksPerBar * 0.1));
    absEvents.push({
      absTick: xgTick,
      priority: 8,
      event: {
        delta: 0,
        type: 'sysex',
        rawBytes: new Uint8Array([0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7]),
      },
    });

    const ctrlTick = Math.max(2, Math.round(ticksPerBar * 0.2));
    const msbTick = Math.max(3, Math.round(ticksPerBar * 0.3));
    const lsbTick = Math.max(4, Math.round(ticksPerBar * 0.4));
    const pcTick = Math.max(5, Math.round(ticksPerBar * 0.5));

    // 為 8 個伴奏聲部 (Channel 8~15) 寫入音色切換與混音控制器初始參數
    // 依序分段送出：控制器混音 -> Bank MSB -> Bank LSB -> Program Change
    // 提供琴端硬體 DSP 充足時間完成模式切換與音色庫映射
    for (const p of activeParts) {
      const ch = p.channel;
      // Volume (CC 7)
      absEvents.push({
        absTick: ctrlTick,
        priority: 10,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 7, value: p.volume },
      });
      // Pan (CC 10)
      absEvents.push({
        absTick: ctrlTick,
        priority: 11,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 10, value: p.pan },
      });
      // Expression (CC 11: 127)
      absEvents.push({
        absTick: ctrlTick,
        priority: 12,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 11, value: 127 },
      });
      // Reverb (CC 91)
      absEvents.push({
        absTick: ctrlTick,
        priority: 13,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 91, value: p.reverb },
      });
      // Chorus (CC 93)
      absEvents.push({
        absTick: ctrlTick,
        priority: 14,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 93, value: p.chorus },
      });

      // Bank MSB (CC 0)
      absEvents.push({
        absTick: msbTick,
        priority: 15,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 0, value: p.msb },
      });
      // Bank LSB (CC 32)
      absEvents.push({
        absTick: lsbTick,
        priority: 16,
        event: { delta: 0, type: 'controlChange', channel: ch, controller: 32, value: p.lsb },
      });
      // Program Change
      absEvents.push({
        absTick: pcTick,
        priority: 17,
        event: { delta: 0, type: 'programChange', channel: ch, program: p.pc },
      });
    }

    // --- 排程各曲式段落與音符 ---
    // 依據 Yamaha SFF2 規範，第 1 小節 (Tick 0 ~ ticksPerBar) 固定保留給 SInt (初始化小節)，
    // 所有正式音樂段落 (Main A, Fill In 等) 一律自第 2 小節 (ticksPerBar) 開始排列。
    const sections: YamahaSection[] = [
      { name: 'SFF2', startTick: 0, endTick: 0, measureCount: 0 },
      { name: 'SInt', startTick: 0, endTick: ticksPerBar, measureCount: 1 },
    ];
    let currentSectionStartTick = ticksPerBar;

    for (const sec of defaultSections) {
      const secBars = Math.max(1, sec.bars);
      const secTicks = secBars * ticksPerBar;
      const secEndTick = currentSectionStartTick + secTicks;

      // 寫入段落 Marker (例如 'Main A', 'Fill In AA')
      absEvents.push({
        absTick: currentSectionStartTick,
        priority: 6,
        event: {
          delta: 0,
          type: 'meta',
          metaType: 0x06,
          metaData: new TextEncoder().encode(sec.name),
          text: sec.name,
        },
      });

      sections.push({
        name: sec.name,
        startTick: currentSectionStartTick,
        endTick: secEndTick,
        measureCount: secBars,
      });

      // 寫入該段落內的自訂音符 (若有)
      if (sec.notes && sec.notes.length > 0) {
        for (const n of sec.notes) {
          const noteChannel = n.channel ?? (n.partId ? DEFAULT_STYLE_PARTS[n.partId].channel : 9);
          const onTick = currentSectionStartTick + Math.max(0, n.startTick);
          const dur = Math.max(12, n.durationTick);
          const offTick = onTick + dur;
          const vel = Math.max(1, Math.min(127, n.velocity));

          // Note On
          absEvents.push({
            absTick: onTick,
            priority: 25,
            event: {
              delta: 0,
              type: 'noteOn',
              channel: noteChannel,
              noteNumber: n.note,
              velocity: vel,
            },
          });

          // Note Off
          absEvents.push({
            absTick: offTick,
            priority: 20, // Note-Off 先於同拍的 Note-On 觸發，防止掛音
            event: {
              delta: 0,
              type: 'noteOff',
              channel: noteChannel,
              noteNumber: n.note,
              velocity: 0,
            },
          });
        }
      }

      currentSectionStartTick = secEndTick;
    }

    // --- 結尾小節標記 (End of Track: Meta 0x2F) ---
    absEvents.push({
      absTick: currentSectionStartTick,
      priority: 99,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      },
    });

    // 4. 嚴格時序排序並計算 Delta Times
    absEvents.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.priority - b.priority;
    });

    let prevTick = 0;
    const finalTrackEvents: MidiEvent[] = [];
    for (const item of absEvents) {
      const delta = Math.max(0, item.absTick - prevTick);
      item.event.delta = delta;
      finalTrackEvents.push(item.event);
      prevTick = item.absTick;
    }

    // 5. 編碼 SMF 0 單軌 (Track 0)
    const track0: MidiTrack = {
      trackIndex: 0,
      name: styleName,
      events: finalTrackEvents,
      rawChunk: new Uint8Array(0),
    };
    YamahaPadModifier.rebuildTrackRawChunk(track0);

    // 6. 生成 8 聲部描述結構 (YamahaTrackInfo)
    const parts: YamahaTrackInfo[] = activeParts.map((p) => ({
      trackIndex: 0,
      channel: p.channel,
      partName: p.name,
      bankMsb: p.msb,
      bankLsb: p.lsb,
      programChange: p.pc,
      volume: p.volume,
      pan: p.pan,
      reverb: p.reverb,
      chorus: p.chorus,
    }));

    // 7. 生成 Style 專屬 SFF2 CASM 轉調區塊
    const customChunks: YamahaCustomChunk[] = [];
    if (options?.injectCasm !== false) {
      const secInfoList = defaultSections.map((s) => ({
        name: s.name,
        channels: [8, 9, 10, 11, 12, 13, 14, 15],
      }));
      customChunks.push(this.buildStandardStyleCasm(secInfoList));
    }

    return {
      format: 'STY',
      midiFormat: 0,
      division,
      bpm,
      timeSignature: timeSig,
      sections,
      tracks: [track0],
      parts,
      customChunks,
      hasCasm: customChunks.some((c) => c.id === 'CASM'),
      hasOts: false,
    };
  }

  /**
   * 建立標準 Yamaha Style 專屬 SFF2 CASM (Chord Audio Style Mapping) 轉調區塊
   * SFF2 / PSR-SX920 原廠相容結構
   */
  public static buildStandardStyleCasm(
    sections: Array<{ name: string; channels?: number[] }>
  ): YamahaCustomChunk {
    const writer = new BinaryWriter();

    for (const sec of sections) {
      const csegWriter = new BinaryWriter();

      // 1. Sdec Subchunk (Section Declaration)
      const secBytes = new TextEncoder().encode(sec.name);
      csegWriter.writeString('Sdec');
      csegWriter.writeUint32BE(secBytes.length);
      csegWriter.writeBytes(secBytes);

      // 2. Ctb2 Subchunks (為該段落啟用中的伴奏聲部建立 SFF2 轉調規則)
      const channels = sec.channels ?? [8, 9, 10, 11, 12, 13, 14, 15];

      for (const ch of channels) {
        csegWriter.writeString('Ctb2');
        csegWriter.writeUint32BE(47); // SFF2 Ctb2 標準長度固定為 47 bytes

        const ctbData = new Uint8Array(47);
        // Byte 0: 來源 MIDI 通道
        ctbData[0] = ch & 0x0f;

        // Byte 1~8: 聲部標籤名稱 (8 字元 ASCII)
        let tag = 'PartMain';
        let isDrum = false;
        let isBass = false;

        if (ch === 8) {
          tag = 'Rhy1Main';
          isDrum = true;
        } else if (ch === 9) {
          tag = 'Drum4cc ';
          isDrum = true;
        } else if (ch === 10) {
          tag = 'BassMain';
          isBass = true;
        } else if (ch === 11) {
          tag = 'Chd1Main';
        } else if (ch === 12) {
          tag = 'Chd2Main';
        } else if (ch === 13) {
          tag = 'Pad Main';
        } else if (ch === 14) {
          tag = 'Phr1Main';
        } else if (ch === 15) {
          tag = 'Phr2Main';
        }

        for (let k = 0; k < 8; k++) {
          ctbData[1 + k] = k < tag.length ? tag.charCodeAt(k) : 0x20;
        }

        // Byte 9: 目標 MIDI 通道
        ctbData[9] = ch & 0x0f;
        // Byte 10: 0x00
        ctbData[10] = 0x00;
        // Byte 11: 0x0F
        ctbData[11] = 0x0f;
        // Byte 12: 0xFF
        ctbData[12] = 0xff;
        // Byte 13: 聲部旗標 (鼓組為 0x07, 音高樂器為 0x03)
        ctbData[13] = isDrum ? 0x07 : 0x03;
        // Byte 14~17: 0xFF
        ctbData[14] = 0xff;
        ctbData[15] = 0xff;
        ctbData[16] = 0xff;
        ctbData[17] = 0xff;

        // Byte 18~21: 預設範圍
        ctbData[18] = 0x00;
        ctbData[19] = 0x02;
        ctbData[20] = 0x00;
        ctbData[21] = 0x7f; // Note High Limit = 127

        // Byte 22~25
        ctbData[22] = 0x00;
        ctbData[23] = 0x81;
        ctbData[24] = 0x03;
        ctbData[25] = 0x18;

        // Byte 26~46: 轉調規則 (NTR / NTT)
        if (isDrum) {
          // 鼓組/打擊樂：NTR = 1 (Fixed 固定音高), NTT = 0 (Bypass 繞過轉調)
          ctbData[26] = 0x00;
          ctbData[27] = 0x02;
          ctbData[28] = 0x01; // NTR: 1 (Fixed)
          ctbData[29] = 0x00; // NTT: 0 (Bypass)
          ctbData[30] = 0x07;
          ctbData[31] = 0x00;
          ctbData[32] = 0x7f;
          ctbData[33] = 0x01;
          ctbData[34] = 0x01;
          ctbData[35] = 0x00;
          ctbData[36] = 0x07;
          ctbData[37] = 0x00;
          ctbData[38] = 0x7f;
          ctbData[39] = 0x01;
          ctbData[40] = 0x00;
          ctbData[41] = 0x01;
          ctbData[42] = 0x00;
          ctbData[43] = 0x18;
          ctbData[44] = 0x31;
          ctbData[45] = 0x50;
          ctbData[46] = 0x00;
        } else if (isBass) {
          // 貝斯：NTR = 0 (Root Transpose 根音轉調), NTT = 2 (Bass Table), Low Note = 28 (E1)
          ctbData[26] = 0x00;
          ctbData[27] = 0x02;
          ctbData[28] = 0x00; // NTR: 0 (Root Transpose)
          ctbData[29] = 0x81;
          ctbData[30] = 0x05; // Bass Table
          ctbData[31] = 0x1c; // Low Note Limit: 28 (E1)
          ctbData[32] = 0x28; // High Note Limit: 40
          ctbData[33] = 0x02;
          ctbData[34] = 0x00;
          ctbData[35] = 0x81;
          ctbData[36] = 0x03;
          ctbData[37] = 0x1c;
          ctbData[38] = 0x7f;
          ctbData[39] = 0x02;
          ctbData[40] = 0x00;
          ctbData[41] = 0x00;
          ctbData[42] = 0x00;
          ctbData[43] = 0x00;
          ctbData[44] = 0x00;
          ctbData[45] = 0x00;
          ctbData[46] = 0x00;
        } else {
          // 和弦 / 弦樂 / 裝飾句：NTR = 0 (Root Transpose), NTT = 1 (Chord Table / Melody)
          ctbData[26] = 0x00;
          ctbData[27] = 0x02;
          ctbData[28] = 0x00; // NTR: 0 (Root Transpose)
          ctbData[29] = 0x01; // NTT: 1 (Chord Table)
          ctbData[30] = 0x03;
          ctbData[31] = 0x00; // Low Limit
          ctbData[32] = 0x7f; // High Limit: 127
          ctbData[33] = 0x01;
          ctbData[34] = 0x00;
          ctbData[35] = 0x01;
          ctbData[36] = 0x07;
          ctbData[37] = 0x00;
          ctbData[38] = 0x7f;
          ctbData[39] = 0x01;
          ctbData[40] = 0x00;
          ctbData[41] = 0x00;
          ctbData[42] = 0x00;
          ctbData[43] = 0x00;
          ctbData[44] = 0x00;
          ctbData[45] = 0x00;
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
    return {
      id: 'CASM',
      data: casmData,
      offset: 0,
    };
  }

  /**
   * 取得實際的音樂曲式段落清單 (自動過濾掉 SFF2, SInt 等標頭格式識別標籤)
   */
  public static getMusicalSections(parsed: YamahaFileParsed): YamahaSection[] {
    return parsed.sections.filter(s => s.name !== 'SFF2' && s.name !== 'SInt');
  }

  /**
   * 序列化 YamahaFileParsed 結構為標準 .sty 二進位檔案
   */
  public static serializeToStyleFile(parsed: YamahaFileParsed): Uint8Array {
    return YamahaWriter.write(parsed);
  }
}
