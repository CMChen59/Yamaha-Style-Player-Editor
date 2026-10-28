import { BinaryWriter } from './binary-writer';
import { YamahaPadModifier } from './pad-modifier';
import type {
  YamahaFileParsed,
  MidiTrack,
  MidiEvent,
  YamahaSection,
  YamahaTrackInfo,
  YamahaCustomChunk,
  YamahaPadConfig,
} from '../models/types';

export interface PadTrackConfig {
  name?: string;
  icon?: string;
  repeat?: boolean;
  chordMatch?: boolean;
  msb?: number;
  lsb?: number;
  pc?: number;
  volume?: number;
  pan?: number;
  reverb?: number;
  chorus?: number;
}

export interface NewPadProjectOptions {
  projectName?: string;
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  division?: number;
  bars?: number;
  pads?: PadTrackConfig[];
  injectCasm?: boolean;
}

/**
 * Yamaha Multi Pad 二進位合成器
 * 負責從零構建 100% 符合 Yamaha PSR/Tyros/Genos 規範的全新 PAD 檔案結構
 */
export class YamahaPadSynthesizer {
  /**
   * 建立全新空白 Multi Pad 專案
   */
  public static createBlankProject(options?: NewPadProjectOptions): YamahaFileParsed {
    const projectName = options?.projectName?.trim() || 'untitled';
    const bpm = Math.max(30, Math.min(300, options?.bpm ?? 120));
    const timeSig = options?.timeSignature ?? { numerator: 4, denominator: 4 };
    const division = options?.division ?? 480;
    const defaultBars = Math.max(1, Math.min(64, options?.bars ?? 4));

    const ticksPerBeat = division;
    const ticksPerBar = ticksPerBeat * timeSig.numerator;
    const totalTicks = defaultBars * ticksPerBar;

    // 預設 4 個打擊墊屬性配置
    const defaultPads: Required<PadTrackConfig>[] = [
      {
        name: 'Pad 1',
        icon: 'S809',
        repeat: false,
        chordMatch: false,
        msb: 0,
        lsb: 112,
        pc: 0, // Grand Piano
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
      },
      {
        name: 'Pad 2',
        icon: 'S809',
        repeat: false,
        chordMatch: false,
        msb: 0,
        lsb: 112,
        pc: 48, // Strings
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
      },
      {
        name: 'Pad 3',
        icon: 'S809',
        repeat: false,
        chordMatch: false,
        msb: 0,
        lsb: 112,
        pc: 24, // Acoustic Guitar
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
      },
      {
        name: 'Pad 4',
        icon: 'S809',
        repeat: false,
        chordMatch: false,
        msb: 0,
        lsb: 112,
        pc: 32, // Acoustic Bass
        volume: 100,
        pan: 64,
        reverb: 40,
        chorus: 0,
      },
    ];

    // 合併使用者傳入的 pad 參數
    const padConfigs: Required<PadTrackConfig>[] = defaultPads.map((def, idx) => {
      const userConf = options?.pads?.[idx];
      return {
        name: userConf?.name?.trim() || def.name,
        icon: userConf?.icon?.trim() || def.icon,
        repeat: userConf?.repeat ?? def.repeat,
        chordMatch: userConf?.chordMatch ?? def.chordMatch,
        msb: userConf?.msb ?? def.msb,
        lsb: userConf?.lsb ?? def.lsb,
        pc: userConf?.pc ?? def.pc,
        volume: userConf?.volume ?? def.volume,
        pan: userConf?.pan ?? def.pan,
        reverb: userConf?.reverb ?? def.reverb,
        chorus: userConf?.chorus ?? def.chorus,
      };
    });

    // 1. 建構 Track 0 (導引軌 Conductor Track)
    const track0Events: MidiEvent[] = [];

    // Meta 0x03: 專案名稱
    const nameBytes = new TextEncoder().encode(projectName);
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x03,
      metaData: nameBytes,
      text: projectName,
    });

    // Meta 0x01: Yamaha SFF 簽名 (例如 .u..f..r\n)
    const sffSignatureBytes = new Uint8Array([0x2e, 0x75, 0x2e, 0x2e, 0x66, 0x2e, 0x2e, 0x72, 0x0a]);
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x01,
      metaData: sffSignatureBytes,
      text: '.u..f..r\n',
    });

    // Meta 0x58: 拍號 (Time Signature)
    const denPower = Math.round(Math.log2(timeSig.denominator));
    const timeSigBytes = new Uint8Array([timeSig.numerator, denPower, 24, 8]);
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x58,
      metaData: timeSigBytes,
    });

    // Meta 0x59: 調號 (Key Signature: C Major)
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x59,
      metaData: new Uint8Array([0x00, 0x00]),
    });

    // Meta 0x51: 速度 (Tempo in microseconds per quarter note)
    const microsecondsPerQuarter = Math.round(60000000 / bpm);
    const tempoBytes = new Uint8Array([
      (microsecondsPerQuarter >> 16) & 0xff,
      (microsecondsPerQuarter >> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ]);
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x51,
      metaData: tempoBytes,
    });

    // Meta 0x06: 主音樂區段標籤 ('Main A')
    const mainABytes = new TextEncoder().encode('Main A');
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x06,
      metaData: mainABytes,
      text: 'Main A',
    });

    // 於時間軸終點 (totalTicks) 插入 Yamaha Multi Pad 專屬控制標籤
    const rpText = `RP${padConfigs.map(p => (p.repeat ? '1' : '0')).join('')}`;
    track0Events.push({
      delta: totalTicks,
      type: 'meta',
      metaType: 0x06,
      metaData: new TextEncoder().encode(rpText),
      text: rpText,
    });

    const cmText = `CM${padConfigs.map(p => (p.chordMatch ? '1' : '0')).join('')}`;
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x06,
      metaData: new TextEncoder().encode(cmText),
      text: cmText,
    });

    // Pad 名稱與圖示代碼
    for (let i = 0; i < 4; i++) {
      const nText = `N${i + 1}${padConfigs[i].name}`;
      track0Events.push({
        delta: 0,
        type: 'meta',
        metaType: 0x06,
        metaData: new TextEncoder().encode(nText),
        text: nText,
      });

      const iText = `I${i + 1}${padConfigs[i].icon}`;
      track0Events.push({
        delta: 0,
        type: 'meta',
        metaType: 0x06,
        metaData: new TextEncoder().encode(iText),
        text: iText,
      });
    }

    // Meta 0x2F: Track 0 軌道結尾
    track0Events.push({
      delta: 0,
      type: 'meta',
      metaType: 0x2F,
      metaData: new Uint8Array(0),
    });

    const track0: MidiTrack = {
      trackIndex: 0,
      name: projectName,
      events: track0Events,
      rawChunk: new Uint8Array(0),
    };
    YamahaPadModifier.rebuildTrackRawChunk(track0);

    // 2. 建構 Track 1 ~ 4 (Pad 1 ~ 4 音軌)
    const tracks: MidiTrack[] = [track0];
    const parts: YamahaTrackInfo[] = [];

    for (let i = 0; i < 4; i++) {
      const padNum = i + 1;
      const ch = i; // MIDI 通道 0~3 (對應 Channel 1~4)
      const conf = padConfigs[i];
      const evs: MidiEvent[] = [];

      // Meta 0x03: 軌道名稱固定為 'PAD'
      evs.push({
        delta: 0,
        type: 'meta',
        metaType: 0x03,
        metaData: new TextEncoder().encode('PAD'),
        text: 'PAD',
      });

      // 初始化 CC 控制器與樂器設定
      // Bank MSB (CC 0)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 0, value: conf.msb });
      // Bank LSB (CC 32)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 32, value: conf.lsb });
      // Program Change
      evs.push({ delta: 0, type: 'programChange', channel: ch, program: conf.pc });
      // Volume (CC 7)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 7, value: conf.volume });
      // Pan (CC 10)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 10, value: conf.pan });
      // Reverb Send (CC 91)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 91, value: conf.reverb });
      // Chorus Send (CC 93)
      evs.push({ delta: 0, type: 'controlChange', channel: ch, controller: 93, value: conf.chorus });

      // 在末端小節寫入 Meta 0x2F (End of Track) 鎖定小節長度
      evs.push({
        delta: totalTicks,
        type: 'meta',
        metaType: 0x2F,
        metaData: new Uint8Array(0),
      });

      const padTrack: MidiTrack = {
        trackIndex: padNum,
        name: 'PAD',
        events: evs,
        rawChunk: new Uint8Array(0),
      };
      YamahaPadModifier.rebuildTrackRawChunk(padTrack);
      tracks.push(padTrack);

      parts.push({
        trackIndex: padNum,
        channel: ch,
        partName: `Pad ${padNum}`,
        bankMsb: conf.msb,
        bankLsb: conf.lsb,
        programChange: conf.pc,
        volume: conf.volume,
        pan: conf.pan,
        reverb: conf.reverb,
        chorus: conf.chorus,
      });
    }

    // 3. 組合 YamahaFileParsed
    const sections: YamahaSection[] = [
      {
        name: 'Main A',
        startTick: 0,
        endTick: totalTicks,
        measureCount: defaultBars,
      },
    ];

    const padConfig: YamahaPadConfig = {
      names: padConfigs.map(p => p.name),
      icons: padConfigs.map(p => p.icon),
      repeatFlags: padConfigs.map(p => p.repeat),
      chordMatchFlags: padConfigs.map(p => p.chordMatch),
    };

    const customChunks: YamahaCustomChunk[] = [];
    if (options?.injectCasm) {
      customChunks.push(this.buildStandardPadCasm(['Main A'], [0, 1, 2, 3]));
    }

    return {
      format: 'PAD',
      midiFormat: 1,
      division,
      bpm,
      timeSignature: timeSig,
      sections,
      tracks,
      parts,
      customChunks,
      hasCasm: customChunks.some(c => c.id === 'CASM'),
      hasOts: false,
      padConfig,
    };
  }

  /**
   * 建立標準 Yamaha Multi Pad 專用 CASM (Chord Match 轉調規則) 區塊
   * SFF2 / PSR-SX920 相容結構
   */
  public static buildStandardPadCasm(sectionNames: string[] = ['Main A'], channels: number[] = [0, 1, 2, 3]): YamahaCustomChunk {
    const writer = new BinaryWriter();

    for (const secName of sectionNames) {
      const csegWriter = new BinaryWriter();

      // 1. Sdec Subchunk (Section Declaration)
      const secBytes = new TextEncoder().encode(secName);
      csegWriter.writeString('Sdec');
      csegWriter.writeUint32BE(secBytes.length);
      csegWriter.writeBytes(secBytes);

      // 2. Ctb2 Subchunk (Chord Table for each active channel)
      for (const ch of channels) {
        csegWriter.writeString('Ctb2');
        csegWriter.writeUint32BE(47); // SFF2 Ctb2 標準長度固定為 47 bytes

        const ctbData = new Uint8Array(47);
        // Byte 0: 來源 MIDI 通道
        ctbData[0] = ch & 0x0f;
        // Byte 1~4: 聲部名稱縮寫 (例如 Pad1, Pad2...)
        const pTag = `Pad${ch + 1}`;
        for (let k = 0; k < Math.min(4, pTag.length); k++) {
          ctbData[1 + k] = pTag.charCodeAt(k);
        }
        // Byte 5: Source Root (0 = C)
        ctbData[5] = 0x00;
        // Byte 6: Source Chord Type (0 = Maj)
        ctbData[6] = 0x00;
        // Byte 7: Lower Note Limit
        ctbData[7] = 0x00;
        // Byte 8: Higher Note Limit
        ctbData[8] = 0x7f;
        // Byte 9: NTR (Note Transposition Rule: 0 = Root Trans, 1 = Fixed)
        ctbData[9] = 0x00;
        // Byte 10: NTT (Note Transposition Table: 1 = Melody, 2 = Chord)
        ctbData[10] = 0x01; // Melody

        // 標準預設填充參數
        ctbData[11] = 0x00; // High Key
        ctbData[12] = 0x00; // Note Low Limit
        ctbData[13] = 0x7f; // Note High Limit
        ctbData[14] = 0x01; // Retrigger Rule
        ctbData[15] = 0x00;

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
}
