/**
 * Yamaha Style OTS (One Touch Setting) 與風格標頭管理器 (OTS & Header Manager)
 * 負責 SFF2/SFF1 伴奏風格中 'OTSc' 二進位區塊之解析、重構、PSR-SX920 原廠音色庫對應
 * 以及風格中繼資料（標題、樂風、BPM、拍號、版權）之完整維護。
 */

import { BinaryReader } from '../parser/midi-reader';
import { BinaryWriter } from './binary-writer';
import { YamahaPadModifier } from './pad-modifier';
import { findYamahaVoice } from '../data/yamaha-voices';
import type { YamahaFileParsed } from '../models/types';
import type {
  OtsVoiceSetting,
  OtsSlotConfig,
  StyleOtsData,
  StyleHeaderMetadata,
  OtsPreset,
} from '../models/ots-types';

export class YamahaOtsManager {
  /**
   * 建立預設的單一聲部音色配置
   */
  public static createDefaultVoiceSetting(
    voiceName: string,
    chineseName: string,
    msb: number,
    lsb: number,
    pc: number,
    enabled: boolean = false,
    volume: number = 100,
    pan: number = 64,
    reverb: number = 40,
    chorus: number = 0,
    octave: number = 0
  ): OtsVoiceSetting {
    return {
      voiceName,
      chineseName,
      msb,
      lsb,
      pc,
      volume,
      pan,
      reverb,
      chorus,
      octave,
      enabled,
    };
  }

  /**
   * 建立 Yamaha 原廠標準 4 組出廠 OTS 設定 (OTS 1 ~ 4)
   * 預設採用 PSR-SX920 旗艦旗標音色（CFX 三角鋼琴、Vintage EP、Tenor Sax、Overdriven Lead 等）
   */
  public static createDefaultOtsData(): StyleOtsData {
    return {
      slots: [
        // OTS 1: 適合 Intro 與 Main A (清脆鋼琴 + 弦樂備選)
        {
          slotIndex: 1,
          name: 'OTS 1',
          right1: this.createDefaultVoiceSetting(
            'CFX Concert Grand',
            'CFX 音樂會旗艦三角鋼琴',
            104,
            1,
            0,
            true, // Right 1 預設開啟
            100,
            64,
            40,
            0,
            0
          ),
          right2: this.createDefaultVoiceSetting(
            'Kino Strings',
            '電影大片史詩弦樂',
            104,
            2,
            48,
            false, // Right 2 預設關閉（可勾選雙音色）
            75,
            64,
            50,
            0,
            0
          ),
        },
        // OTS 2: 適合 Main B (復古電鋼琴 + 溫暖墊音)
        {
          slotIndex: 2,
          name: 'OTS 2',
          right1: this.createDefaultVoiceSetting(
            'Vintage EP',
            '經典手提箱復古電鋼琴',
            104,
            10,
            4,
            true,
            95,
            64,
            40,
            20,
            0
          ),
          right2: this.createDefaultVoiceSetting(
            'Warm Pad',
            '溫暖合成背景墊音',
            104,
            1,
            89,
            false,
            70,
            64,
            45,
            10,
            0
          ),
        },
        // OTS 3: 適合 Main C (次中音薩克斯風 + 抒情管風琴)
        {
          slotIndex: 3,
          name: 'OTS 3',
          right1: this.createDefaultVoiceSetting(
            'Sweet! Tenor Sax',
            '次中音薩克斯風 (Sweet!)',
            104,
            1,
            66,
            true,
            100,
            64,
            40,
            0,
            0
          ),
          right2: this.createDefaultVoiceSetting(
            'Ballad Organ',
            '抒情拉桿管風琴',
            104,
            5,
            16,
            false,
            75,
            64,
            35,
            0,
            0
          ),
        },
        // OTS 4: 適合 Main D / 高潮副歌 (電吉他主奏 / 流行銅管)
        {
          slotIndex: 4,
          name: 'OTS 4',
          right1: this.createDefaultVoiceSetting(
            'Overdriven Lead',
            '超載主奏電吉他',
            104,
            1,
            80,
            true,
            100,
            64,
            45,
            15,
            0
          ),
          right2: this.createDefaultVoiceSetting(
            'Pop Brass',
            '流行銅管合奏群',
            104,
            1,
            61,
            false,
            90,
            64,
            40,
            0,
            0
          ),
        },
      ],
    };
  }

  /**
   * 官方推薦四大經典樂風 OTS 快速範本清單
   */
  public static getGenrePresets(): OtsPreset[] {
    return [
      {
        id: 'POP',
        name: '🎹 經典流行 (Classic Pop)',
        description: '鋼琴 ➔ 復古電鋼琴 ➔ 次中音薩克斯 ➔ 流行銅管群',
        slots: this.createDefaultOtsData().slots,
      },
      {
        id: 'JAZZ',
        name: '🎷 都會爵士 (Urban Jazz)',
        description: '爵士空心吉他 ➔ 柔音號 ➔ 呼吸薩克斯 ➔ 爵士管風琴',
        slots: [
          {
            slotIndex: 1,
            name: 'OTS 1',
            right1: this.createDefaultVoiceSetting('Jazz Guitar', '爵士空心吉他', 104, 1, 26, true, 96, 64, 35, 10, 0),
            right2: this.createDefaultVoiceSetting('Upright Bass', '原聲爵士低音大提琴', 104, 1, 32, false, 80, 64, 30, 0, -1),
          },
          {
            slotIndex: 2,
            name: 'OTS 2',
            right1: this.createDefaultVoiceSetting('Flugelhorn', '柔音號 (Flugelhorn)', 104, 1, 56, true, 95, 64, 45, 0, 0),
            right2: this.createDefaultVoiceSetting('Vintage EP', '經典手提箱復古電鋼琴', 104, 10, 4, false, 75, 64, 35, 15, 0),
          },
          {
            slotIndex: 3,
            name: 'OTS 3',
            right1: this.createDefaultVoiceSetting('Sweet! Tenor Sax', '次中音薩克斯風 (Sweet!)', 104, 1, 66, true, 100, 64, 40, 0, 0),
            right2: this.createDefaultVoiceSetting('Drawbar Organ', '經典拉桿管風琴', 104, 1, 16, false, 75, 64, 35, 0, 0),
          },
          {
            slotIndex: 4,
            name: 'OTS 4',
            right1: this.createDefaultVoiceSetting('Drawbar Organ', '經典拉桿管風琴', 104, 1, 16, true, 100, 64, 40, 0, 0),
            right2: this.createDefaultVoiceSetting('Pop Brass', '流行銅管合奏群', 104, 1, 61, false, 85, 64, 35, 0, 0),
          },
        ],
      },
      {
        id: 'ROCK',
        name: '🎸 搖滾樂團 (Rock Band)',
        description: '民謠吉他 ➔ 超載電吉他 ➔ 破音吉他主奏 ➔ 搖滾全樂團疊音',
        slots: [
          {
            slotIndex: 1,
            name: 'OTS 1',
            right1: this.createDefaultVoiceSetting('Steel Acoustic', '鋼弦民謠吉他', 104, 1, 25, true, 98, 64, 30, 0, 0),
            right2: this.createDefaultVoiceSetting('Warm Pad', '溫暖合成背景墊音', 104, 1, 89, false, 65, 64, 40, 10, 0),
          },
          {
            slotIndex: 2,
            name: 'OTS 2',
            right1: this.createDefaultVoiceSetting('Overdriven Guitar', '復古超載電吉他', 104, 1, 29, true, 100, 64, 35, 10, 0),
            right2: this.createDefaultVoiceSetting('Rock Organ', '搖滾管風琴', 104, 1, 18, false, 80, 64, 30, 0, 0),
          },
          {
            slotIndex: 3,
            name: 'OTS 3',
            right1: this.createDefaultVoiceSetting('Distortion Lead', '高增益破音吉他主奏', 104, 1, 30, true, 100, 64, 40, 20, 0),
            right2: this.createDefaultVoiceSetting('Pop Brass', '流行銅管合奏群', 104, 1, 61, false, 85, 64, 35, 0, 0),
          },
          {
            slotIndex: 4,
            name: 'OTS 4',
            right1: this.createDefaultVoiceSetting('Heavy Metal Lead', '重金屬電吉他 Solo', 104, 1, 80, true, 102, 64, 45, 15, 0),
            right2: this.createDefaultVoiceSetting('Distortion Lead', '高增益破音吉他主奏', 104, 1, 30, true, 90, 64, 40, 10, 0),
          },
        ],
      },
      {
        id: 'BALLAD',
        name: '🎻 影視史詩 (Symphonic & Ballad)',
        description: 'CFX 旗艦三角鋼琴 ➔ 獨奏長笛 ➔ 雙簧管 ➔ 電影史詩弦樂齊奏',
        slots: [
          {
            slotIndex: 1,
            name: 'OTS 1',
            right1: this.createDefaultVoiceSetting('CFX Concert Grand', 'CFX 音樂會旗艦三角鋼琴', 104, 1, 0, true, 100, 64, 45, 0, 0),
            right2: this.createDefaultVoiceSetting('Kino Strings', '電影大片史詩弦樂', 104, 2, 48, false, 75, 64, 55, 0, 0),
          },
          {
            slotIndex: 2,
            name: 'OTS 2',
            right1: this.createDefaultVoiceSetting('Sweet! Flute', '獨奏長笛 (Sweet!)', 104, 1, 73, true, 95, 64, 45, 0, 0),
            right2: this.createDefaultVoiceSetting('Kino Strings', '電影大片史詩弦樂', 104, 2, 48, false, 70, 64, 50, 0, 0),
          },
          {
            slotIndex: 3,
            name: 'OTS 3',
            right1: this.createDefaultVoiceSetting('Sweet! Oboe', '雙簧管 (Sweet!)', 104, 1, 68, true, 96, 64, 45, 0, 0),
            right2: this.createDefaultVoiceSetting('French Horn', '法國號四重奏', 104, 1, 60, false, 75, 64, 45, 0, 0),
          },
          {
            slotIndex: 4,
            name: 'OTS 4',
            right1: this.createDefaultVoiceSetting('Kino Strings', '電影大片史詩弦樂', 104, 2, 48, true, 100, 64, 55, 0, 0),
            right2: this.createDefaultVoiceSetting('Pop Brass', '流行銅管合奏群', 104, 1, 61, true, 88, 64, 45, 0, 0),
          },
        ],
      },
    ];
  }

  /**
   * 將 StyleOtsData 二進位封裝為符合 Yamaha 規範之 'OTSc' Chunk 內容
   * 包含 4 個標準 MTrk 軌道，每個軌道封裝該 OTS 的聲部 SysEx 控制與 MIDI 控制器事件
   */
  public static buildOtsChunk(otsData: StyleOtsData): Uint8Array {
    const otsWriter = new BinaryWriter();

    for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
      const slot = otsData.slots[slotIdx] || this.createDefaultOtsData().slots[slotIdx];
      const trackWriter = new BinaryWriter();

      // 1. Meta 0x03: 軌道名稱 (OTS 1 ~ OTS 4)
      const trackName = `OTS ${slotIdx + 1}`;
      const nameBytes = new TextEncoder().encode(trackName);
      trackWriter.writeUint8(0x00); // delta
      trackWriter.writeUint8(0xff); // Meta status
      trackWriter.writeUint8(0x03); // Meta Type 0x03
      trackWriter.writeVarInt(nameBytes.length);
      trackWriter.writeBytes(nameBytes);

      // 2. 聲部清單：Part 0 = Right 1, Part 1 = Right 2, Part 2 = Right 3, Part 3 = Left
      const parts: Array<{ partIdx: number; voice: OtsVoiceSetting }> = [
        { partIdx: 0, voice: slot.right1 },
        { partIdx: 1, voice: slot.right2 },
      ];

      if (slot.right3) {
        parts.push({ partIdx: 2, voice: slot.right3 });
      } else {
        // 預設關閉 Right 3
        parts.push({
          partIdx: 2,
          voice: this.createDefaultVoiceSetting('Right 3', '未啟用', 0, 0, 0, false, 0),
        });
      }

      if (slot.left) {
        parts.push({ partIdx: 3, voice: slot.left });
      } else {
        // 預設關閉 Left
        parts.push({
          partIdx: 3,
          voice: this.createDefaultVoiceSetting('Left', '未啟用', 0, 0, 0, false, 0),
        });
      }

      // 3. 依序為每個聲部寫入 Yamaha OTS 專屬 SysEx 與 MIDI CC / PC
      for (const { partIdx, voice } of parts) {
        const isEnabled = voice.enabled ?? (partIdx === 0);
        const vol = Math.max(0, Math.min(127, voice.volume ?? 100));
        const pan = Math.max(0, Math.min(127, voice.pan ?? 64));
        const rev = Math.max(0, Math.min(127, voice.reverb ?? 40));
        const cho = Math.max(0, Math.min(127, voice.chorus ?? 0));
        const oct = Math.max(-2, Math.min(2, voice.octave ?? 0));
        const msb = Math.max(0, Math.min(127, voice.msb ?? 0));
        const lsb = Math.max(0, Math.min(127, voice.lsb ?? 0));
        const pc = Math.max(0, Math.min(127, voice.pc ?? 0));

        // --- SysEx 1: Part On/Off (F0 43 73 01 50 08 [partIdx] 00 [dd] F7) ---
        trackWriter.writeUint8(0x00); // delta
        trackWriter.writeUint8(0xf0); // SysEx
        const sysexOnBytes = new Uint8Array([
          0x43, 0x73, 0x01, 0x50, 0x08, partIdx, 0x00, isEnabled ? 0x7f : 0x00, 0xf7,
        ]);
        trackWriter.writeVarInt(sysexOnBytes.length);
        trackWriter.writeBytes(sysexOnBytes);

        // --- SysEx 2: Octave Shift (F0 43 73 01 50 08 [partIdx] 03 [0x40 + oct] F7) ---
        trackWriter.writeUint8(0x00); // delta
        trackWriter.writeUint8(0xf0);
        const sysexOctBytes = new Uint8Array([
          0x43, 0x73, 0x01, 0x50, 0x08, partIdx, 0x03, (0x40 + oct) & 0x7f, 0xf7,
        ]);
        trackWriter.writeVarInt(sysexOctBytes.length);
        trackWriter.writeBytes(sysexOctBytes);

        // --- SysEx 3: Voice Set Volume (F0 43 73 01 50 08 [partIdx] 04 [vol] F7) ---
        trackWriter.writeUint8(0x00); // delta
        trackWriter.writeUint8(0xf0);
        const sysexVolBytes = new Uint8Array([
          0x43, 0x73, 0x01, 0x50, 0x08, partIdx, 0x04, vol, 0xf7,
        ]);
        trackWriter.writeVarInt(sysexVolBytes.length);
        trackWriter.writeBytes(sysexVolBytes);

        // --- MIDI Channel 控制項 (Channel = partIdx, 0-indexed: 0, 1, 2, 3) ---
        // CC 0 (Bank Select MSB)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(msb);

        // CC 32 (Bank Select LSB)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x20);
        trackWriter.writeUint8(lsb);

        // Program Change
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xc0 | partIdx);
        trackWriter.writeUint8(pc);

        // CC 7 (Volume)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x07);
        trackWriter.writeUint8(vol);

        // CC 10 (Pan)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x0a);
        trackWriter.writeUint8(pan);

        // CC 91 (Reverb)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x5b);
        trackWriter.writeUint8(rev);

        // CC 93 (Chorus)
        trackWriter.writeUint8(0x00);
        trackWriter.writeUint8(0xb0 | partIdx);
        trackWriter.writeUint8(0x5d);
        trackWriter.writeUint8(cho);
      }

      // 4. Meta 0x2F: End of Track (FF 2F 00)
      trackWriter.writeUint8(0x00); // delta
      trackWriter.writeUint8(0xff);
      trackWriter.writeUint8(0x2f);
      trackWriter.writeUint8(0x00);

      const trackPayload = trackWriter.toUint8Array();

      // 5. 封裝為標準 MTrk 塊
      otsWriter.writeString('MTrk');
      otsWriter.writeUint32BE(trackPayload.length);
      otsWriter.writeBytes(trackPayload);
    }

    return otsWriter.toUint8Array();
  }

  /**
   * 從 Yamaha 'OTSc' 或 'OTS ' Chunk 資料中解析 4 組 OTS 設定
   */
  public static parseOtsChunk(chunkData: Uint8Array): StyleOtsData {
    const reader = new BinaryReader(chunkData);
    const slots: OtsSlotConfig[] = [];
    let slotCount = 0;

    while (reader.hasMore(8) && slotCount < 4) {
      const tag = reader.readString(4);
      if (tag !== 'MTrk') {
        // 若不是 MTrk，向前搜索下一個 MTrk 標記
        let found = false;
        while (reader.hasMore(4)) {
          if (
            chunkData[reader.position] === 0x4d && // 'M'
            chunkData[reader.position + 1] === 0x54 && // 'T'
            chunkData[reader.position + 2] === 0x72 && // 'r'
            chunkData[reader.position + 3] === 0x6b // 'k'
          ) {
            reader.position += 4;
            found = true;
            break;
          }
          reader.position += 1;
        }
        if (!found) break;
      }

      const trackLen = reader.readUint32BE();
      const trackEndPos = Math.min(reader.length, reader.position + trackLen);

      slotCount++;
      const currentSlotIndex = slotCount;

      // 預備 4 個聲部暫存器
      const partVoices: OtsVoiceSetting[] = [
        this.createDefaultVoiceSetting('Right 1', '主奏 1', 104, 1, 0, true),
        this.createDefaultVoiceSetting('Right 2', '疊音 2', 104, 2, 48, false),
        this.createDefaultVoiceSetting('Right 3', '主奏 3', 0, 0, 0, false),
        this.createDefaultVoiceSetting('Left', '左手伴奏', 0, 0, 0, false),
      ];

      // 讀取該 MTrk 事件
      let runningStatus: number | undefined;

      while (reader.position < trackEndPos && reader.hasMore()) {
        reader.readVarInt(); // delta
        let statusByte = reader.readUint8();

        if ((statusByte & 0x80) === 0) {
          if (runningStatus === undefined) break;
          reader.position -= 1;
          statusByte = runningStatus;
        } else {
          if (statusByte < 0xf0) {
            runningStatus = statusByte;
          } else {
            runningStatus = undefined;
          }
        }

        const eventType = statusByte & 0xf0;
        const channel = statusByte & 0x0f;

        if (statusByte === 0xff) {
          // Meta Event
          reader.readUint8(); // metaType
          const metaLen = reader.readVarInt();
          reader.readBytes(metaLen);
        } else if (statusByte === 0xf0 || statusByte === 0xf7) {
          // SysEx Event
          const sysexLen = reader.readVarInt();
          const sysex = reader.readBytes(sysexLen);

          // 檢測 Yamaha OTS 專屬 SysEx: 43 73 01 50 08 [partIdx] [sub] [val] F7
          if (
            sysex.length >= 8 &&
            sysex[0] === 0x43 &&
            sysex[1] === 0x73 &&
            sysex[2] === 0x01 &&
            sysex[3] === 0x50 &&
            sysex[4] === 0x08
          ) {
            const pIdx = sysex[5];
            const subCmd = sysex[6];
            const val = sysex[7];

            if (pIdx >= 0 && pIdx < 4) {
              if (subCmd === 0x00) {
                // Part On/Off
                partVoices[pIdx].enabled = val >= 0x40;
              } else if (subCmd === 0x03) {
                // Octave Shift
                partVoices[pIdx].octave = Math.max(-2, Math.min(2, (val & 0x7f) - 0x40));
              } else if (subCmd === 0x04) {
                // Volume
                partVoices[pIdx].volume = val & 0x7f;
              }
            }
          }
        } else if (eventType === 0xb0 && channel < 4) {
          // Control Change
          const ctrl = reader.readUint8();
          const val = reader.readUint8();
          const target = partVoices[channel];

          if (ctrl === 0) target.msb = val;
          else if (ctrl === 32) target.lsb = val;
          else if (ctrl === 7) target.volume = val;
          else if (ctrl === 10) target.pan = val;
          else if (ctrl === 91) target.reverb = val;
          else if (ctrl === 93) target.chorus = val;
        } else if (eventType === 0xc0 && channel < 4) {
          // Program Change
          const prog = reader.readUint8();
          partVoices[channel].pc = prog;
        } else if (eventType === 0x90 || eventType === 0x80) {
          reader.readUint8(); // note
          reader.readUint8(); // vel
        } else if (eventType === 0xe0) {
          reader.readUint8();
          reader.readUint8();
        } else {
          // 其他類型
          if (statusByte >= 0xf0) {
            // 跳過
          } else {
            reader.readUint8();
          }
        }
      }

      // 依據 MSB, LSB, PC 匹配 Yamaha SX920 原廠樂器名稱
      for (const p of partVoices) {
        const matched = findYamahaVoice(p.msb, p.lsb, p.pc);
        if (matched) {
          p.voiceName = matched.name;
          p.chineseName = matched.chineseName;
        } else {
          p.voiceName = `Voice (${p.msb}-${p.lsb}-${p.pc + 1})`;
          p.chineseName = `自訂音色 (${p.msb}-${p.lsb}-${p.pc + 1})`;
        }
      }

      slots.push({
        slotIndex: currentSlotIndex,
        name: `OTS ${currentSlotIndex}`,
        right1: partVoices[0],
        right2: partVoices[1],
        right3: partVoices[2],
        left: partVoices[3],
      });

      reader.position = trackEndPos;
    }

    // 若解析到的槽位不足 4 個，以原廠預設槽位補齊
    const defaultData = this.createDefaultOtsData();
    while (slots.length < 4) {
      const idx = slots.length;
      slots.push(defaultData.slots[idx]);
    }

    return {
      slots: [slots[0], slots[1], slots[2], slots[3]],
    };
  }

  /**
   * 從 YamahaFileParsed 物件中安全提取 OTS 設定
   * 若檔案無 OTS 區塊，則返回原廠標準 4 鍵配置
   */
  public static extractOtsFromParsed(parsed: YamahaFileParsed): StyleOtsData {
    const otsChunk = parsed.customChunks.find(
      (c) => c.id.trim() === 'OTS' || c.id.trim() === 'OTSc' || c.id.startsWith('OTS')
    );

    if (otsChunk && otsChunk.data.length > 0) {
      try {
        return this.parseOtsChunk(otsChunk.data);
      } catch (err) {
        console.warn('解析現有 OTS Chunk 發生異常，回退至預設 OTS 設定:', err);
      }
    }

    return this.createDefaultOtsData();
  }

  /**
   * 將 OTS 設定二進位無損注入或覆蓋寫入 YamahaFileParsed
   */
  public static injectOrUpdateOts(parsed: YamahaFileParsed, otsData: StyleOtsData): void {
    const payload = this.buildOtsChunk(otsData);

    const existingIdx = parsed.customChunks.findIndex(
      (c) => c.id.trim() === 'OTS' || c.id.trim() === 'OTSc' || c.id.startsWith('OTS')
    );

    if (existingIdx >= 0) {
      parsed.customChunks[existingIdx] = {
        id: 'OTSc',
        data: payload,
        offset: parsed.customChunks[existingIdx].offset,
      };
    } else {
      parsed.customChunks.push({
        id: 'OTSc',
        data: payload,
        offset: 0,
      });
    }

    parsed.hasOts = true;
  }

  /**
   * 從 YamahaFileParsed 提取風格標頭與中繼資料 (Style Title, Genre, BPM, 拍號, 版權)
   */
  public static extractStyleHeader(parsed: YamahaFileParsed): StyleHeaderMetadata {
    let title = 'New Style';
    let copyright = '';
    const bpm = parsed.bpm || 120;
    const timeSig = parsed.timeSignature || { numerator: 4, denominator: 4 };

    if (parsed.tracks.length > 0) {
      const track0 = parsed.tracks[0];
      for (const ev of track0.events) {
        if (ev.type === 'meta') {
          if (ev.metaType === 0x03 && ev.text) {
            // 排除 Yamaha 專用標記如 'SFF2' 或 'SInt'
            const txt = ev.text.trim();
            if (txt !== 'SFF2' && txt !== 'SInt' && txt !== 'untitled' && txt !== 'Style Track') {
              title = txt;
            }
          } else if (ev.metaType === 0x02 && ev.text) {
            copyright = ev.text.trim();
          }
        }
      }
    }

    return {
      title,
      genre: 'Pop',
      bpm,
      timeSignature: timeSig,
      copyright,
    };
  }

  /**
   * 更新風格標頭中繼資料並同步重構 Track 0 二進位 rawChunk
   */
  public static updateStyleHeader(
    parsed: YamahaFileParsed,
    metadata: Partial<StyleHeaderMetadata>
  ): void {
    if (parsed.tracks.length === 0) return;

    const track0 = parsed.tracks[0];

    // 1. 更新或插入風格標題 (Meta 0x03)
    if (metadata.title !== undefined) {
      const titleStr = metadata.title.trim() || 'New Style';
      const existingNameIdx = track0.events.findIndex(
        (ev) =>
          ev.type === 'meta' &&
          ev.metaType === 0x03 &&
          ev.text !== 'SFF2' &&
          ev.text !== 'SInt'
      );

      const titleBytes = new TextEncoder().encode(titleStr);
      if (existingNameIdx >= 0) {
        track0.events[existingNameIdx].text = titleStr;
        track0.events[existingNameIdx].metaData = titleBytes;
      } else {
        // 在最前方插入 Track Name 事件
        track0.events.unshift({
          delta: 0,
          type: 'meta',
          metaType: 0x03,
          text: titleStr,
          metaData: titleBytes,
        });
      }
    }

    // 2. 更新或插入版權資訊 (Meta 0x02)
    if (metadata.copyright !== undefined) {
      const copyStr = metadata.copyright.trim();
      const existingCopyIdx = track0.events.findIndex(
        (ev) => ev.type === 'meta' && ev.metaType === 0x02
      );

      const copyBytes = new TextEncoder().encode(copyStr);
      if (existingCopyIdx >= 0) {
        track0.events[existingCopyIdx].text = copyStr;
        track0.events[existingCopyIdx].metaData = copyBytes;
      } else if (copyStr) {
        track0.events.splice(1, 0, {
          delta: 0,
          type: 'meta',
          metaType: 0x02,
          text: copyStr,
          metaData: copyBytes,
        });
      }
    }

    // 3. 更新速度 (Meta 0x51 & parsed.bpm)
    if (metadata.bpm !== undefined) {
      const bpm = Math.max(30, Math.min(300, Math.round(metadata.bpm)));
      parsed.bpm = bpm;
      const microsecPerQuarter = Math.round(60000000 / bpm);
      const tempoBytes = new Uint8Array([
        (microsecPerQuarter >> 16) & 0xff,
        (microsecPerQuarter >> 8) & 0xff,
        microsecPerQuarter & 0xff,
      ]);

      const tempoIdx = track0.events.findIndex((ev) => ev.type === 'meta' && ev.metaType === 0x51);
      if (tempoIdx >= 0) {
        track0.events[tempoIdx].metaData = tempoBytes;
      } else {
        track0.events.splice(2, 0, {
          delta: 0,
          type: 'meta',
          metaType: 0x51,
          metaData: tempoBytes,
        });
      }
    }

    // 4. 更新拍號 (Meta 0x58 & parsed.timeSignature)
    if (metadata.timeSignature !== undefined) {
      parsed.timeSignature = metadata.timeSignature;
      const nn = metadata.timeSignature.numerator;
      const dd = Math.round(Math.log2(metadata.timeSignature.denominator));
      const sigBytes = new Uint8Array([nn, dd, 24, 8]);

      const sigIdx = track0.events.findIndex((ev) => ev.type === 'meta' && ev.metaType === 0x58);
      if (sigIdx >= 0) {
        track0.events[sigIdx].metaData = sigBytes;
      } else {
        track0.events.splice(3, 0, {
          delta: 0,
          type: 'meta',
          metaType: 0x58,
          metaData: sigBytes,
        });
      }
    }

    // 重新編碼 Track 0 的 rawChunk
    YamahaPadModifier.rebuildTrackRawChunk(track0);
  }
}
