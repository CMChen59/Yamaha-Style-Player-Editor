import { BinaryReader } from './midi-reader';
import type {
  YamahaFileParsed,
  MidiTrack,
  MidiEvent,
  YamahaSection,
  YamahaTrackInfo,
  YamahaCustomChunk,
} from '../models/types';

// Yamaha 標準 8 個伴奏聲部映射 (MIDI Channel 9~16，即 0-indexed 8~15)
const CHANNEL_TO_PART_NAME: Record<number, string> = {
  8: 'Sub Rhythm (Rhythm 1)',
  9: 'Main Rhythm (Rhythm 2)',
  10: 'Bass',
  11: 'Chord 1',
  12: 'Chord 2',
  13: 'Pad',
  14: 'Phrase 1',
  15: 'Phrase 2',
};

// Yamaha SFF1 傳統伴奏聲部映射 (MIDI Channel 1~8，即 0-indexed 0~7)
const SFF1_CHANNEL_TO_PART_NAME: Record<number, string> = {
  0: 'Sub Rhythm (Rhythm 1)',
  1: 'Bass',
  2: 'Chord 1',
  3: 'Chord 2',
  4: 'Pad',
  5: 'Phrase 1',
  6: 'Phrase 2',
  7: 'Extra Part',
};

// Pad 聲部映射 (Pad 1~4 通常使用特定 Channel)
const PAD_CHANNEL_NAME: Record<number, string> = {
  0: 'Pad 1',
  1: 'Pad 2',
  2: 'Pad 3',
  3: 'Pad 4',
  8: 'Pad Drum 1',
  9: 'Pad Drum 2',
};

export class YamahaParser {
  /**
   * 解析 STY 或 PAD 二進位資料
   */
  public static parse(buffer: Uint8Array, fallbackFormat: 'STY' | 'PAD' = 'STY'): YamahaFileParsed {
    const reader = new BinaryReader(buffer);

    // 1. 檢查 MThd 標頭
    const headerTag = reader.readString(4);
    if (headerTag !== 'MThd') {
      throw new Error(`無效的 MIDI/Yamaha 檔案標頭: ${headerTag} (預期為 MThd)`);
    }

    const headerLength = reader.readUint32BE();
    if (headerLength < 6) {
      throw new Error(`無效的 MThd 區塊長度: ${headerLength}`);
    }

    const midiFormat = reader.readUint16BE();
    const trackCount = reader.readUint16BE();
    const division = reader.readUint16BE();

    // 跳過多餘的 header 位元組（若長度大於 6）
    if (headerLength > 6) {
      reader.readBytes(headerLength - 6);
    }

    const tracks: MidiTrack[] = [];
    const sections: YamahaSection[] = [];
    const partsMap: Map<number, YamahaTrackInfo> = new Map();
    let bpm = 120;
    let initialBpm: number | null = null;
    let timeSignature = { numerator: 4, denominator: 4 };

    // Yamaha Pad 專屬配置
    const padConfig = {
      names: ['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4'],
      icons: ['', '', '', ''],
      repeatFlags: [false, false, false, false],
      chordMatchFlags: [false, false, false, false],
    };

    // 2. 解析所有的 MTrk
    for (let t = 0; t < trackCount; t++) {
      if (!reader.hasMore(8)) break;

      const trackChunkStart = reader.position;
      const chunkTag = reader.readString(4);
      if (chunkTag !== 'MTrk') {
        // 如果不是 MTrk，說明已經到達 Yamaha 尾部非標準 Chunk
        reader.position = trackChunkStart;
        break;
      }

      const chunkLength = reader.readUint32BE();
      const trackDataStart = reader.position;
      const events: MidiEvent[] = [];
      let trackName: string | undefined;
      let runningStatus: number | undefined;
      let currentTick = 0;

      while (reader.position < trackDataStart + chunkLength && reader.hasMore()) {
        const delta = reader.readVarInt();
        currentTick += delta;

        let statusByte = reader.readUint8();
        if ((statusByte & 0x80) === 0) {
          // Running Status
          if (runningStatus === undefined) {
            throw new Error(`無效的 Running Status，出現在 track ${t}, tick ${currentTick}`);
          }
          reader.position -= 1; // 回退一個 byte
          statusByte = runningStatus;
        } else {
          if (statusByte < 0xf0) {
            runningStatus = statusByte;
          } else {
            runningStatus = undefined; // SysEx 或 Meta 重置 running status
          }
        }

        const eventType = statusByte & 0xf0;
        const channel = statusByte & 0x0f;

        // Meta Events
        if (statusByte === 0xff) {
          const metaType = reader.readUint8();
          const metaLength = reader.readVarInt();
          const metaData = reader.readBytes(metaLength);

          let metaText: string | undefined;
          if ([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07].includes(metaType)) {
            // 文字事件
            metaText = new TextDecoder('latin1').decode(metaData);
          }

          if (metaType === 0x03 && metaText) {
            trackName = metaText;
          }

          // Yamaha Section Marker 通常為 Meta 0x06 (Marker) 或 0x07 (Cue Point)
          if ((metaType === 0x06 || metaType === 0x07) && metaText) {
            const trimmed = metaText.trim();

            // 檢查是否為 Yamaha Pad 專屬控制標籤 (非實際音樂段落)
            if (trimmed.startsWith('RP') && trimmed.length >= 6) {
              // Repeat Flags: 例如 RP0000 ➔ [false, false, false, false]
              padConfig.repeatFlags = [
                trimmed[2] === '1',
                trimmed[3] === '1',
                trimmed[4] === '1',
                trimmed[5] === '1',
              ];
            } else if (trimmed.startsWith('CM') && trimmed.length >= 6) {
              // Chord Match Flags: 例如 CM0000 或 CM1111
              padConfig.chordMatchFlags = [
                trimmed[2] === '1',
                trimmed[3] === '1',
                trimmed[4] === '1',
                trimmed[5] === '1',
              ];
            } else if (/^N[1-4]/.test(trimmed)) {
              // Pad Name: 例如 N1Pad1 ➔ Pad 1 名稱為 'Pad1'
              const padIdx = parseInt(trimmed[1], 10) - 1;
              if (padIdx >= 0 && padIdx < 4) {
                padConfig.names[padIdx] = trimmed.substring(2);
              }
            } else if (/^I[1-4]/.test(trimmed)) {
              // Pad Icon: 例如 I1S809 ➔ Pad 1 圖標代碼為 'S809'
              const padIdx = parseInt(trimmed[1], 10) - 1;
              if (padIdx >= 0 && padIdx < 4) {
                padConfig.icons[padIdx] = trimmed.substring(2);
              }
            } else {
              // 正式音樂段落標記
              sections.push({
                name: trimmed,
                startTick: currentTick,
              });
            }
          }

          // Tempo (0x51)
          if (metaType === 0x51 && metaLength === 3) {
            const microsecondsPerQuarter = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
            const currentBpm = Math.round(60000000 / microsecondsPerQuarter);
            if (initialBpm === null) {
              initialBpm = currentBpm;
            }
            bpm = currentBpm;
          }

          // Time Signature (0x58)
          if (metaType === 0x58 && metaLength >= 2) {
            timeSignature = {
              numerator: metaData[0],
              denominator: Math.pow(2, metaData[1]),
            };
          }

          events.push({
            delta,
            type: 'meta',
            metaType,
            metaData,
            text: metaText,
          });
        } else if (statusByte === 0xf0 || statusByte === 0xf7) {
          // SysEx Events
          const sysexLength = reader.readVarInt();
          const sysexData = reader.readBytes(sysexLength);
          events.push({
            delta,
            type: 'sysex',
            rawBytes: sysexData,
          });
        } else {
          // MIDI Channel Messages
          const partInfo = partsMap.get(channel) || {
            trackIndex: t,
            channel,
            partName: fallbackFormat === 'PAD'
              ? (PAD_CHANNEL_NAME[channel] || `Channel ${channel + 1}`)
              : (CHANNEL_TO_PART_NAME[channel] || SFF1_CHANNEL_TO_PART_NAME[channel] || `Part ${channel + 1}`),
          };

          if (eventType === 0x90 || eventType === 0x80) {
            const noteNumber = reader.readUint8();
            const velocity = reader.readUint8();
            events.push({
              delta,
              type: eventType === 0x90 && velocity > 0 ? 'noteOn' : 'noteOff',
              channel,
              noteNumber,
              velocity,
            });
          } else if (eventType === 0xb0) {
            const controller = reader.readUint8();
            const value = reader.readUint8();

            if (controller === 0) partInfo.bankMsb = value;
            if (controller === 32) partInfo.bankLsb = value;
            if (controller === 7) partInfo.volume = value;
            if (controller === 10) partInfo.pan = value;
            if (controller === 91) partInfo.reverb = value;
            if (controller === 93) partInfo.chorus = value;

            events.push({
              delta,
              type: 'controlChange',
              channel,
              controller,
              value,
            });
          } else if (eventType === 0xc0) {
            const program = reader.readUint8();
            partInfo.programChange = program;
            events.push({
              delta,
              type: 'programChange',
              channel,
              program,
            });
          } else if (eventType === 0xe0) {
            const lsb = reader.readUint8();
            const msb = reader.readUint8();
            events.push({
              delta,
              type: 'pitchBend',
              channel,
              value: (msb << 7) | lsb,
            });
          } else {
            // Polyphonic Aftertouch 或 Channel Aftertouch
            reader.readUint8();
            if (eventType === 0xa0) reader.readUint8();
            events.push({
              delta,
              type: 'other',
              channel,
            });
          }

          partsMap.set(channel, partInfo);
        }
      }

      // 保存 raw chunk 以便無失真重構
      const trackRawChunk = buffer.subarray(trackChunkStart, trackDataStart + chunkLength);
      tracks.push({
        trackIndex: t,
        name: trackName,
        events,
        rawChunk: trackRawChunk,
      });
    }

    // 計算每個 Section 的小節數量與 endTick
    const ticksPerMeasure = division * timeSignature.numerator * (4 / timeSignature.denominator);
    for (let i = 0; i < sections.length; i++) {
      let nextTick = i + 1 < sections.length ? sections[i + 1].startTick : undefined;
      if (nextTick === undefined && tracks[0] && tracks[0].events) {
        let trkEndTick = 0;
        for (const ev of tracks[0].events) {
          trkEndTick += ev.delta;
        }
        if (trkEndTick > sections[i].startTick) {
          nextTick = trkEndTick;
        }
      }
      sections[i].endTick = nextTick;
      if (nextTick !== undefined) {
        sections[i].measureCount = Math.round((nextTick - sections[i].startTick) / ticksPerMeasure);
      }
    }

    // 3. 讀取 MIDI 結束後的專屬非標準 Chunk (CASM, OTS, etc.)
    const customChunks: YamahaCustomChunk[] = [];
    while (reader.hasMore(8)) {
      const chunkOffset = reader.position;
      const chunkId = reader.readString(4);
      const chunkSize = reader.readUint32BE();

      if (reader.position + chunkSize <= reader.length) {
        const chunkData = reader.readBytes(chunkSize);
        customChunks.push({
          id: chunkId,
          data: chunkData,
          offset: chunkOffset,
        });
      } else {
        // 若剩餘不足則將剩餘資料整塊提取
        const remaining = reader.readBytes(reader.length - reader.position);
        customChunks.push({
          id: chunkId,
          data: remaining,
          offset: chunkOffset,
        });
        break;
      }
    }

    const casmChunk = customChunks.find((c) => c.id === 'CASM');
    const hasCasm = !!casmChunk;
    const casmMappings = casmChunk ? YamahaParser.parseCasmMappings(casmChunk.data) : undefined;
    const hasOts = customChunks.some((c) => c.id.trim() === 'OTS' || c.id.trim() === 'OTSc' || c.id.startsWith('OTS'));

    return {
      format: fallbackFormat,
      midiFormat,
      division,
      bpm: initialBpm ?? bpm,
      timeSignature,
      sections,
      tracks,
      parts: Array.from(partsMap.values()).sort((a, b) => a.channel - b.channel),
      customChunks,
      casmMappings,
      hasCasm,
      hasOts,
      padConfig: fallbackFormat === 'PAD' ? padConfig : undefined,
    };
  }

  /**
   * 解析 CASM / Ctb2 / CTAB 區塊，提取各段落之原始軌道 (Source Channel) 到伴奏聲部 (Destination Part Channel) 的精確路由表
   */
  public static parseCasmMappings(casmData: Uint8Array): Record<string, Record<number, number>> {
    const sectionMappings: Record<string, Record<number, number>> = {};
    if (casmData.length < 8) return sectionMappings;
    const view = new DataView(casmData.buffer, casmData.byteOffset, casmData.byteLength);
    let pos = 0;

    while (pos <= casmData.length - 8) {
      const tag = String.fromCharCode(casmData[pos], casmData[pos + 1], casmData[pos + 2], casmData[pos + 3]);
      const len = view.getUint32(pos + 4);
      if (tag === 'CSEG') {
        const csegEnd = Math.min(casmData.length, pos + 8 + len);
        let csegPos = pos + 8;
        const currentSections: string[] = [];
        const mappings: Record<number, number> = {};

        while (csegPos <= csegEnd - 8) {
          const subTag = String.fromCharCode(casmData[csegPos], casmData[csegPos + 1], casmData[csegPos + 2], casmData[csegPos + 3]);
          const subLen = view.getUint32(csegPos + 4);
          if (subTag === 'Sdec') {
            let sdecStr = '';
            for (let k = 0; k < subLen; k++) {
              sdecStr += String.fromCharCode(casmData[csegPos + 8 + k]);
            }
            const names = sdecStr.split(/[\x00,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
            currentSections.push(...names);
          } else if (subTag === 'Ctb2' || subTag === 'CTAB') {
            const srcCh = casmData[csegPos + 8];
            const destCh = casmData[csegPos + 8 + 9];
            if (srcCh !== undefined && destCh !== undefined && destCh >= 8 && destCh <= 15) {
              mappings[srcCh] = destCh;
            }
          }
          csegPos += 8 + subLen;
        }

        for (const sec of currentSections) {
          sectionMappings[sec] = { ...(sectionMappings[sec] || {}), ...mappings };
        }
        pos = csegEnd;
      } else {
        pos += 8 + len;
      }
    }

    return sectionMappings;
  }
}
