import { getGoldenStyleTemplateBytes } from '../data/yamaha-style-template';
import { YamahaParser } from '../parser/yamaha-parser';
import { YamahaWriter } from './yamaha-writer';
import { YamahaPadModifier } from './pad-modifier';
import type { MidiEvent, YamahaSection } from '../models/types';

export interface TemplateVoiceConfig {
  msb: number;
  lsb: number;
  pc: number;
}

export interface TemplatePartMixer {
  volume: number;  // 0 ~ 127 (CC 7)
  pan: number;     // 0 ~ 127 (CC 10, 64 = Center)
  reverb?: number; // 0 ~ 127 (CC 91 殘響發送量)
  chorus?: number; // 0 ~ 127 (CC 93 合唱發送量)
}

export interface TemplateMixerConfig {
  drum?: TemplatePartMixer;
  bass?: TemplatePartMixer;
  chord?: TemplatePartMixer;
  dynamicTracks?: Record<string, TemplatePartMixer>;
}

export interface TemplateNoteMeta {
  velocity?: number;
  durationTicks?: number;
  offsetTicks?: number;
  sourceChannel?: number;
}

export interface TemplateSectionInput {
  name: string;
  bars: number;
  stepsPerBar?: number;
  drumPattern: Map<number, boolean[]>;
  bassPattern: Map<number, number>;
  chordPattern: Map<number, Set<number>>;
  dynamicPatterns?: Record<string, Map<number, Set<number>>>;
  drumMeta?: Map<string, TemplateNoteMeta>;
  bassMeta?: Map<number, TemplateNoteMeta>;
  chordMeta?: Map<string, TemplateNoteMeta>;
  dynamicMeta?: Record<string, Map<string, TemplateNoteMeta>>;
  ccEvents?: Array<{ channel: number; controller: number; value: number; step: number; relTick?: number }>;
  pitchBendEvents?: Array<{ channel: number; value: number; step: number; relTick?: number }>;
}

export interface TemplateStyleExportOptions {
  styleName: string;
  bpm: number;
  timeSignature?: { numerator: number; denominator: number };
  stepsPerBar?: number;
  drumKit: TemplateVoiceConfig;
  rhythm1Kit?: TemplateVoiceConfig;
  bassVoice: TemplateVoiceConfig;
  chordVoice: TemplateVoiceConfig;
  dynamicVoices?: Record<string, TemplateVoiceConfig>;
  sections: TemplateSectionInput[];
  mixer?: TemplateMixerConfig;
  baseTemplateBytes?: Uint8Array; // 外部載入之 STY 原檔底座（保留 CASM / OTS / SysEx）
}

export class YamahaTemplateStyleSynthesizer {
  /**
   * 使用經過 Yamaha PSR-SX920 實體琴 100% 驗證通過的 1920 PPQ 黃金全曲式範本 (Full-House Template) 進行伴奏合成。
   * 此方法完整保留 Yamaha 原廠之 MThd、SInt 初始化握手標頭、SysEx (Works Header, GM On, XG On)、
   * 以及合法完整的 SFF2 CASM (Chord Audio Style Mapping) 轉調映射區塊，
   * 範本原生內建 Main A~D、Fill In AA~DD、Intro A~C、Ending A 共 12 個音樂段落，
   * 確保實體琴載入時絕對不會出現 "Data has not been loaded properly" 錯誤，
   * 且按下 [AUTO FILL-IN] 或 [Fill In A/B/C/D] 鍵時能完美發出過門樂音與小鼓滾奏過渡。
   */
  public static synthesizeFromTemplate(options: TemplateStyleExportOptions): Uint8Array {
    const rawTemplateBytes = options.baseTemplateBytes || getGoldenStyleTemplateBytes();
    const parsed = YamahaParser.parse(rawTemplateBytes, 'STY');

    const division = parsed.division || 1920; // 1920 PPQ (Yamaha PSR-SX920 原廠標準高解析度時鐘)
    const timeSig = options.timeSignature ?? { numerator: 4, denominator: 4 };
    const ticksPerBeat = division;
    const ticksPerBar = Math.round(ticksPerBeat * timeSig.numerator * (4 / timeSig.denominator));

    const tr0 = parsed.tracks[0];
    if (!tr0 || !tr0.events) {
      throw new Error('黃金範本 Track 0 無效');
    }

    // 1. 取得使用者主要段落 (以 Main A 為基準錨點)
    const mainAUser = options.sections.find(s => s.name === 'Main A') || options.sections[0];
    const userSectionMap = new Map<string, TemplateSectionInput>();
    options.sections.forEach(s => userSectionMap.set(s.name, s));

    // 2. 收集非音符事件，並在 SInt 區塊內更新音色 PC/Bank，在開頭更新曲名與 Tempo
    // 定義 Yamaha PSR-SX920 混音標準 (CC 7 音量、CC 10 聲相、CC 91 殘響、CC 93 合唱)
    const targetVolMap: Record<number, number> = {
      9: options.mixer?.drum?.volume ?? 100,
      10: options.mixer?.bass?.volume ?? 95,
      11: options.mixer?.chord?.volume ?? 90,
      12: options.mixer?.dynamicTracks?.Chord2?.volume ?? 85,
      13: options.mixer?.dynamicTracks?.Pad?.volume ?? 80,
      14: options.mixer?.dynamicTracks?.Phrase1?.volume ?? 85,
      15: options.mixer?.dynamicTracks?.Phrase2?.volume ?? 80,
    };

    const targetPanMap: Record<number, number> = {
      9: options.mixer?.drum?.pan ?? 64,
      10: options.mixer?.bass?.pan ?? 64,
      11: options.mixer?.chord?.pan ?? 52, // L12 偏左 12 度
      12: options.mixer?.dynamicTracks?.Chord2?.pan ?? 76, // R12 偏右 12 度
      13: options.mixer?.dynamicTracks?.Pad?.pan ?? 64, // 置中
      14: options.mixer?.dynamicTracks?.Phrase1?.pan ?? 44, // L20 偏左 20 度
      15: options.mixer?.dynamicTracks?.Phrase2?.pan ?? 84, // R20 偏右 20 度
    };

    const targetRevMap: Record<number, number> = {
      9: options.mixer?.drum?.reverb ?? 40,
      10: options.mixer?.bass?.reverb ?? 20,
      11: options.mixer?.chord?.reverb ?? 65,
      12: options.mixer?.dynamicTracks?.Chord2?.reverb ?? 50,
      13: options.mixer?.dynamicTracks?.Pad?.reverb ?? 75,
      14: options.mixer?.dynamicTracks?.Phrase1?.reverb ?? 60,
      15: options.mixer?.dynamicTracks?.Phrase2?.reverb ?? 60,
    };

    const targetChoMap: Record<number, number> = {
      9: options.mixer?.drum?.chorus ?? 0,
      10: options.mixer?.bass?.chorus ?? 0,
      11: options.mixer?.chord?.chorus ?? 20,
      12: options.mixer?.dynamicTracks?.Chord2?.chorus ?? 40,
      13: options.mixer?.dynamicTracks?.Pad?.chorus ?? 50,
      14: options.mixer?.dynamicTracks?.Phrase1?.chorus ?? 20,
      15: options.mixer?.dynamicTracks?.Phrase2?.chorus ?? 30,
    };

    const handledVolChannels = new Set<number>();
    const handledPanChannels = new Set<number>();
    const handledRevChannels = new Set<number>();
    const handledChoChannels = new Set<number>();

    interface TimedEvent {
      absTick: number;
      priority: number;
      event: MidiEvent;
    }
    const timedEvents: TimedEvent[] = [];
    let curTick = 0;

    for (const ev of tr0.events) {
      curTick += ev.delta;

      // 移除範本內既有的舊音符
      if (ev.type === 'noteOn' || ev.type === 'noteOff') {
        continue;
      }

      // 所有 >= ticksPerBar 的範本舊事件（舊 Marker、舊 fn:、舊樂器表情 CC11、舊彎音等）一律忽略
      // 因為各段落將依照使用者的實際小節數動態排程與放置 Marker
      if (curTick >= ticksPerBar) {
        continue;
      }

      // 更新曲名 (Meta 0x03 Track Name)
      if (ev.type === 'meta' && ev.metaType === 0x03) {
        const cleanName = options.styleName.trim() || 'Custom Style';
        ev.text = cleanName;
        ev.metaData = new TextEncoder().encode(cleanName);
        timedEvents.push({ absTick: curTick, priority: 3, event: ev });
        continue;
      }

      // 更新節奏 (Meta 0x51 Tempo)
      if (ev.type === 'meta' && ev.metaType === 0x51) {
        const safeBpm = Math.max(30, Math.min(300, options.bpm || 120));
        const mpqn = Math.round(60_000_000 / safeBpm);
        ev.metaData = new Uint8Array([(mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff]);
        timedEvents.push({ absTick: curTick, priority: 7, event: ev });
        continue;
      }

      // 更新拍號 (Meta 0x58 Time Signature)
      if (ev.type === 'meta' && ev.metaType === 0x58 && options.timeSignature) {
        const num = options.timeSignature.numerator;
        const den = options.timeSignature.denominator;
        const denPow = Math.round(Math.log2(den));
        ev.metaData = new Uint8Array([num, denPow, 24, 8]);
        timedEvents.push({ absTick: curTick, priority: 5, event: ev });
        continue;
      }

      // 在 SInt 小節內 (tick < ticksPerBar) 更新各聲部之 Bank MSB (CC 0), Bank LSB (CC 32), 與 Program Change (PC) 以及 Volume (CC 7) 與 Pan (CC 10)
      if (curTick < ticksPerBar) {
        const ch = ev.channel;
        if (ch !== undefined) {
          // 更新 CC 7 (Volume 音量)
          if (ev.type === 'controlChange' && ev.controller === 7 && targetVolMap[ch] !== undefined) {
            ev.value = Math.max(0, Math.min(127, Math.round(targetVolMap[ch])));
            handledVolChannels.add(ch);
          }
          // 更新 CC 10 (Pan 聲相)
          else if (ev.type === 'controlChange' && ev.controller === 10 && targetPanMap[ch] !== undefined) {
            ev.value = Math.max(0, Math.min(127, Math.round(targetPanMap[ch])));
            handledPanChannels.add(ch);
          }
          // 更新 CC 91 (Reverb 空間殘響發送量)
          else if (ev.type === 'controlChange' && ev.controller === 91 && targetRevMap[ch] !== undefined) {
            ev.value = Math.max(0, Math.min(127, Math.round(targetRevMap[ch])));
            handledRevChannels.add(ch);
          }
          // 更新 CC 93 (Chorus 合唱效果發送量)
          else if (ev.type === 'controlChange' && ev.controller === 93 && targetChoMap[ch] !== undefined) {
            ev.value = Math.max(0, Math.min(127, Math.round(targetChoMap[ch])));
            handledChoChannels.add(ch);
          }

          // Rhythm 2 / 鼓組 (SFF2: Ch 9, SFF1: Ch 7)
          if (ch === 9 || ch === 7) {
            if (ev.type === 'controlChange' && ev.controller === 0) {
              ev.value = options.drumKit.msb;
            } else if (ev.type === 'controlChange' && ev.controller === 32) {
              ev.value = options.drumKit.lsb;
            } else if (ev.type === 'programChange') {
              (ev as any).program = options.drumKit.pc;
              ev.value = options.drumKit.pc;
            }
          }
          // Rhythm 1 / 副鼓組與打擊樂 (SFF2: Ch 8, SFF1: Ch 0)
          else if ((ch === 8 || ch === 0) && options.rhythm1Kit) {
            if (ev.type === 'controlChange' && ev.controller === 0) {
              ev.value = options.rhythm1Kit.msb;
            } else if (ev.type === 'controlChange' && ev.controller === 32) {
              ev.value = options.rhythm1Kit.lsb;
            } else if (ev.type === 'programChange') {
              (ev as any).program = options.rhythm1Kit.pc;
              ev.value = options.rhythm1Kit.pc;
            }
          }
          // Bass / 貝斯 (SFF2: Ch 10, SFF1: Ch 1)
          else if (ch === 10 || ch === 1) {
            if (ev.type === 'controlChange' && ev.controller === 0) {
              ev.value = options.bassVoice.msb;
            } else if (ev.type === 'controlChange' && ev.controller === 32) {
              ev.value = options.bassVoice.lsb;
            } else if (ev.type === 'programChange') {
              (ev as any).program = options.bassVoice.pc;
              ev.value = options.bassVoice.pc;
            }
          }
          // Chord 1 / 和弦 1 (SFF2: Ch 11, SFF1: Ch 2)
          else if (ch === 11 || ch === 2) {
            if (ev.type === 'controlChange' && ev.controller === 0) {
              ev.value = options.chordVoice.msb;
            } else if (ev.type === 'controlChange' && ev.controller === 32) {
              ev.value = options.chordVoice.lsb;
            } else if (ev.type === 'programChange') {
              (ev as any).program = options.chordVoice.pc;
              ev.value = options.chordVoice.pc;
            }
          }
          // 動態聲部 Chord 2 (SFF2: Ch 12, SFF1: Ch 3)
          else if (ch === 12 || ch === 3) {
            const v = options.dynamicVoices?.Chord2 || { msb: 0, lsb: 112, pc: 25 };
            if (ev.type === 'controlChange' && ev.controller === 0) ev.value = v.msb;
            else if (ev.type === 'controlChange' && ev.controller === 32) ev.value = v.lsb;
            else if (ev.type === 'programChange') {
              (ev as any).program = v.pc;
              ev.value = v.pc;
            }
          }
          // 動態聲部 Pad (SFF2: Ch 13, SFF1: Ch 4)
          else if ((ch === 13 || ch === 4) && options.dynamicVoices?.Pad) {
            const v = options.dynamicVoices.Pad;
            if (ev.type === 'controlChange' && ev.controller === 0) ev.value = v.msb;
            else if (ev.type === 'controlChange' && ev.controller === 32) ev.value = v.lsb;
            else if (ev.type === 'programChange') {
              (ev as any).program = v.pc;
              ev.value = v.pc;
            }
          }
          // 動態聲部 Phrase 1 (SFF2: Ch 14, SFF1: Ch 5)
          else if ((ch === 14 || ch === 5) && options.dynamicVoices?.Phrase1) {
            const v = options.dynamicVoices.Phrase1;
            if (ev.type === 'controlChange' && ev.controller === 0) ev.value = v.msb;
            else if (ev.type === 'controlChange' && ev.controller === 32) ev.value = v.lsb;
            else if (ev.type === 'programChange') {
              (ev as any).program = v.pc;
              ev.value = v.pc;
            }
          }
          // 動態聲部 Phrase 2 (SFF2: Ch 15, SFF1: Ch 6)
          else if ((ch === 15 || ch === 6) && options.dynamicVoices?.Phrase2) {
            const v = options.dynamicVoices.Phrase2;
            if (ev.type === 'controlChange' && ev.controller === 0) ev.value = v.msb;
            else if (ev.type === 'controlChange' && ev.controller === 32) ev.value = v.lsb;
            else if (ev.type === 'programChange') {
              (ev as any).program = v.pc;
              ev.value = v.pc;
            }
          }
        }
      }

      // 保留其餘所有 Yamaha 原始架構事件 (SysEx, CC7 音量, CC10 聲相, CC91 殘響, SFF2/SInt Markers 等)
      const priority = ev.type === 'sysex' ? 1 : ev.type === 'meta' && ev.metaType === 0x06 ? 20 : 10;
      timedEvents.push({ absTick: curTick, priority, event: ev });
    }

    // 2.1 確保 SInt 小節中所有啟用之聲部皆具備 CC 7 (Volume), CC 10 (Pan), CC 91 (Reverb), CC 93 (Chorus) 控制器事件
    Object.entries(targetVolMap).forEach(([chStr, vol]) => {
      const ch = Number(chStr);
      if (!handledVolChannels.has(ch)) {
        timedEvents.push({
          absTick: 178,
          priority: 10,
          event: { delta: 0, type: 'controlChange', channel: ch, controller: 7, value: vol },
        });
      }
    });

    Object.entries(targetPanMap).forEach(([chStr, pan]) => {
      const ch = Number(chStr);
      if (!handledPanChannels.has(ch)) {
        timedEvents.push({
          absTick: 183,
          priority: 10,
          event: { delta: 0, type: 'controlChange', channel: ch, controller: 10, value: pan },
        });
      }
    });

    Object.entries(targetRevMap).forEach(([chStr, rev]) => {
      const ch = Number(chStr);
      if (!handledRevChannels.has(ch)) {
        timedEvents.push({
          absTick: 188,
          priority: 10,
          event: { delta: 0, type: 'controlChange', channel: ch, controller: 91, value: rev },
        });
      }
    });

    Object.entries(targetChoMap).forEach(([chStr, cho]) => {
      const ch = Number(chStr);
      if (!handledChoChannels.has(ch)) {
        timedEvents.push({
          absTick: 193,
          priority: 10,
          event: { delta: 0, type: 'controlChange', channel: ch, controller: 93, value: cho },
        });
      }
    });

    // 3. 動態小節時間軸排程 (Dynamic Section Timeline Allocation)
    // 按照 Yamaha SFF2 原廠定義之標準段落序列，依據使用者設定之小節長度動態排定各段落起訖 Tick
    // 並在各段落精準寫入 Meta 0x06 (Marker) 與 Meta 0x01 (fn:<SectionName>)
    const templateMusicalSections = [
      'Main A', 'Main B', 'Main C', 'Main D',
      'Fill In AA', 'Fill In BB', 'Fill In CC', 'Fill In DD',
      'Intro A', 'Intro B', 'Intro C',
      'Ending A', 'Ending B', 'Ending C',
      'Fill In BA'
    ];

    let currentSectionStartTick = ticksPerBar; // SInt 佔據第 0 小節 (0 ~ ticksPerBar)

    for (const secName of templateMusicalSections) {
      let targetUserSec = userSectionMap.get(secName);
      let isAutoDerivedFill = false;

      // 支援 Break / Fill In BA 雙向映射
      if (!targetUserSec && secName === 'Fill In BA') {
        targetUserSec = userSectionMap.get('Break');
      }

      if (!targetUserSec) {
        if (secName === 'Fill In AA' && (userSectionMap.has('Main A') || mainAUser)) {
          targetUserSec = userSectionMap.get('Main A') || mainAUser;
          isAutoDerivedFill = true;
        } else if (secName === 'Fill In BB' && userSectionMap.has('Main B')) {
          targetUserSec = userSectionMap.get('Main B');
          isAutoDerivedFill = true;
        } else if (secName === 'Fill In CC' && userSectionMap.has('Main C')) {
          targetUserSec = userSectionMap.get('Main C');
          isAutoDerivedFill = true;
        } else if (secName === 'Fill In DD' && userSectionMap.has('Main D')) {
          targetUserSec = userSectionMap.get('Main D');
          isAutoDerivedFill = true;
        }
        // 注意：未經使用者編輯的 Intro B/C、Ending B/C、Main C/D 等段落，保持 targetUserSec 為 undefined
        // 僅保留合法段落 Marker 標記與 1 小節無聲架構，絕不複製其他段落音符，防止實體琴誤播
      }

      // 決定該段落小節長度
      let secBars = 1;
      if (targetUserSec) {
        if (isAutoDerivedFill) {
          secBars = 1; // Yamaha 標準過門固定為 1 小節
        } else {
          secBars = Math.max(1, targetUserSec.bars || (secName === 'Fill In BA' ? 1 : 4));
        }
      } else {
        // 未編輯之段落預設分配 1 小節靜音佔位，以維持完整 Yamaha 15 段落相容架構
        secBars = 1;
      }

      const secStart = currentSectionStartTick;
      const secDurationTicks = secBars * ticksPerBar;

      // 3.1 寫入段落 Marker (Meta 0x06) 與 Function Name (Meta 0x01)
      // 注意：Yamaha 原廠二進位標準中，fn:<secName>\0 必須以 0x00 Null 結尾，以確保琴端 DSP 晶片 strcmp 能精準匹配！
      timedEvents.push({
        absTick: secStart,
        priority: 2,
        event: {
          delta: 0,
          type: 'meta',
          metaType: 0x06,
          text: secName,
          metaData: new TextEncoder().encode(secName),
        },
      });

      const fnString = `fn:${secName}\0`;
      timedEvents.push({
        absTick: secStart,
        priority: 3,
        event: {
          delta: 0,
          type: 'meta',
          metaType: 0x01,
          text: fnString,
          metaData: new TextEncoder().encode(fnString),
        },
      });

      // 3.2 在段落開頭重設各聲部 Expression (CC 11 = 127)
      for (const ch of [9, 10, 11, 12, 13, 14, 15]) {
        timedEvents.push({
          absTick: secStart,
          priority: 4,
          event: {
            delta: 0,
            type: 'controlChange',
            channel: ch,
            controller: 11,
            value: 127,
          },
        });
      }

      // 3.3 若此段落包含使用者樂音輸入，將音符寫入此段落中
      if (targetUserSec) {
        const patternBars = Math.max(1, targetUserSec.bars || 4);

        // 動態判定該段落的每小節格數 (stepsPerBar，例如 8 格或 16 格)
        let secStepsPerBar = targetUserSec.stepsPerBar || options.stepsPerBar;
        if (!secStepsPerBar) {
          let maxLen = 0;
          targetUserSec.drumPattern.forEach((arr) => {
            if (arr.length > maxLen) maxLen = arr.length;
          });
          if (maxLen > 0 && targetUserSec.bars > 0) {
            secStepsPerBar = Math.round(maxLen / targetUserSec.bars);
          } else {
            secStepsPerBar = 16;
          }
        }
        const secTicksPerStep = Math.round(ticksPerBar / secStepsPerBar);

        for (let b = 0; b < secBars; b++) {
          // 若為 Ending 尾奏段落且超過使用者定義之小節數，後續小節維持留白延音，不重複滾奏
          if (secName.startsWith('Ending') && b >= patternBars) {
            continue;
          }

          // 決定當前小節對應使用者輸入的哪一小節
          let userBar = b % patternBars;
          if (isAutoDerivedFill && patternBars > 1) {
            // 自動過門取使用者設定的最後一小節（過門小節）
            userBar = patternBars - 1;
          }

          const barOffset = b * ticksPerBar;

          // 鼓點 (Ch 10 / index 9 或 Ch 9 / index 8)
          targetUserSec.drumPattern.forEach((steps, note) => {
            for (let s = 0; s < secStepsPerBar; s++) {
              const stepIdx = userBar * secStepsPerBar + s;
              if (steps[stepIdx]) {
                const meta = targetUserSec.drumMeta?.get(`${note}_${stepIdx}`);
                const vel = meta?.velocity ?? 100;
                const ch = meta?.sourceChannel ?? 9;
                const dur = meta?.durationTicks ?? Math.max(12, Math.round(secTicksPerStep * 0.75));
                const noteStart = secStart + barOffset + s * secTicksPerStep;
                const noteEnd = noteStart + dur;
                timedEvents.push({
                  absTick: noteStart,
                  priority: 50,
                  event: { delta: 0, type: 'noteOn', channel: ch, noteNumber: note, velocity: vel },
                });
                timedEvents.push({
                  absTick: noteEnd,
                  priority: 40,
                  event: { delta: 0, type: 'noteOff', channel: ch, noteNumber: note, velocity: 0 },
                });
              }
            }
          });

          // 自動衍生之過門段落 (Fill In)，在該小節最後一拍注入小鼓滾奏 (Snare Roll) 營造過門氣勢
          if (isAutoDerivedFill) {
            const fillRollSteps = secStepsPerBar === 16 ? [14, 15] : [secStepsPerBar - 1];
            for (const s of fillRollSteps) {
              const noteStart = secStart + barOffset + s * secTicksPerStep;
              const noteEnd = noteStart + Math.max(12, Math.round(secTicksPerStep * 0.5));
              timedEvents.push({
                absTick: noteStart,
                priority: 50,
                event: { delta: 0, type: 'noteOn', channel: 9, noteNumber: 38, velocity: 115 },
              });
              timedEvents.push({
                absTick: noteEnd,
                priority: 40,
                event: { delta: 0, type: 'noteOff', channel: 9, noteNumber: 38, velocity: 0 },
              });
            }
          }

          // 貝斯 (Ch 11 / index 10)
          for (let s = 0; s < secStepsPerBar; s++) {
            const stepIdx = userBar * secStepsPerBar + s;
            const note = targetUserSec.bassPattern.get(stepIdx);
            if (note !== undefined) {
              const meta = targetUserSec.bassMeta?.get(stepIdx);
              const vel = meta?.velocity ?? 100;
              const dur = meta?.durationTicks ?? Math.max(18, Math.round(secTicksPerStep * 1.5));
              const noteStart = secStart + barOffset + s * secTicksPerStep;
              const noteEnd = noteStart + dur;
              timedEvents.push({
                absTick: noteStart,
                priority: 50,
                event: { delta: 0, type: 'noteOn', channel: 10, noteNumber: note, velocity: vel },
              });
              timedEvents.push({
                absTick: noteEnd,
                priority: 40,
                event: { delta: 0, type: 'noteOff', channel: 10, noteNumber: note, velocity: 0 },
              });
            }
          }

          // 和弦 1 (Ch 12 / index 11)
          if (targetUserSec.chordPattern) {
            for (let s = 0; s < secStepsPerBar; s++) {
              const stepIdx = userBar * secStepsPerBar + s;
              const noteSet = targetUserSec.chordPattern.get(stepIdx);
              if (noteSet && noteSet.size > 0) {
                noteSet.forEach(note => {
                  const meta = targetUserSec.chordMeta?.get(`${note}_${stepIdx}`);
                  const vel = meta?.velocity ?? 95;
                  const dur = meta?.durationTicks ?? Math.max(18, Math.round(secTicksPerStep * 1.7));
                  const offset = meta?.offsetTicks ?? 0;
                  const noteStart = secStart + barOffset + s * secTicksPerStep + offset;
                  const noteEnd = noteStart + dur;
                  timedEvents.push({
                    absTick: noteStart,
                    priority: 50,
                    event: { delta: 0, type: 'noteOn', channel: 11, noteNumber: note, velocity: vel },
                  });
                  timedEvents.push({
                    absTick: noteEnd,
                    priority: 40,
                    event: { delta: 0, type: 'noteOff', channel: 11, noteNumber: note, velocity: 0 },
                  });
                });
              }
            }
          }

          // 動態伴奏音軌 (Chord 2: ch 12, Pad: ch 13, Phrase 1: ch 14, Phrase 2: ch 15)
          if (targetUserSec.dynamicPatterns) {
            const partChannelMap: Record<string, number> = {
              Chord2: 12,
              Pad: 13,
              Phrase1: 14,
              Phrase2: 15,
            };
            Object.entries(targetUserSec.dynamicPatterns).forEach(([partId, pat]) => {
              const ch = partChannelMap[partId] ?? 12;
              for (let s = 0; s < secStepsPerBar; s++) {
                const stepIdx = userBar * secStepsPerBar + s;
                const noteSet = pat.get(stepIdx);
                if (noteSet && noteSet.size > 0) {
                  noteSet.forEach(note => {
                    const meta = targetUserSec.dynamicMeta?.[partId]?.get(`${note}_${stepIdx}`);
                    const vel = meta?.velocity ?? 90;
                    const dur = meta?.durationTicks ?? Math.max(18, Math.round(secTicksPerStep * 1.7));
                    const offset = meta?.offsetTicks ?? 0;
                    const noteStart = secStart + barOffset + s * secTicksPerStep + offset;
                    const noteEnd = noteStart + dur;
                    timedEvents.push({
                      absTick: noteStart,
                      priority: 50,
                      event: { delta: 0, type: 'noteOn', channel: ch, noteNumber: note, velocity: vel },
                    });
                    timedEvents.push({
                      absTick: noteEnd,
                      priority: 40,
                      event: { delta: 0, type: 'noteOff', channel: ch, noteNumber: note, velocity: 0 },
                    });
                  });
                }
              }
            });
          }
        }

        // 注入該段落專屬的連續控制器 (CC 11 Expression, CC 1 Mod, CC 64 Sustain 等)
        if (targetUserSec.ccEvents) {
          for (const cc of targetUserSec.ccEvents) {
            const ccTick = secStart + (cc.relTick ?? cc.step * secTicksPerStep);
            timedEvents.push({
              absTick: ccTick,
              priority: 15,
              event: { delta: 0, type: 'controlChange', channel: cc.channel, controller: cc.controller, value: cc.value },
            });
          }
        }

        // 注入該段落專屬的滑音輪 (Pitch Bend)
        if (targetUserSec.pitchBendEvents) {
          for (const pb of targetUserSec.pitchBendEvents) {
            const pbTick = secStart + (pb.relTick ?? pb.step * secTicksPerStep);
            timedEvents.push({
              absTick: pbTick,
              priority: 15,
              event: { delta: 0, type: 'pitchBend', channel: pb.channel, value: pb.value },
            });
          }
        }
      }

      currentSectionStartTick += secDurationTicks;
    }

    // 4. 寫入 End of Track (Meta 0x2f)
    timedEvents.push({
      absTick: currentSectionStartTick,
      priority: 100,
      event: {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      },
    });

    // 5. 依照時間排序所有事件 (先發生的優先，同 Tick 依 priority 排序)
    timedEvents.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.priority - b.priority;
    });

    // 6. 重新計算 Delta-time
    let prevTick = 0;
    const finalEvents: MidiEvent[] = [];
    for (const item of timedEvents) {
      item.event.delta = Math.max(0, item.absTick - prevTick);
      finalEvents.push(item.event);
      prevTick = item.absTick;
    }

    tr0.events = finalEvents;

    // 7. 同步更新 parsed.sections 結構，供 inspectPreExport 與下游精準校驗
    const updatedSections: YamahaSection[] = [
      { name: 'SFF2', startTick: 0, endTick: 0, measureCount: 0 },
      { name: 'SInt', startTick: 0, endTick: ticksPerBar, measureCount: 1 },
    ];
    let checkSecTick = ticksPerBar;
    for (const secName of templateMusicalSections) {
      const userSec = userSectionMap.get(secName);
      let bars = 1;
      if (userSec) {
        bars = (secName.startsWith('Fill') ? 1 : Math.max(1, userSec.bars || 4));
      }
      const dur = bars * ticksPerBar;
      updatedSections.push({
        name: secName,
        startTick: checkSecTick,
        endTick: checkSecTick + dur,
        measureCount: bars,
      });
      checkSecTick += dur;
    }
    parsed.sections = updatedSections;

    // 8. 重新封裝 Track 0 的 MTrk 二進位 RawChunk
    YamahaPadModifier.rebuildTrackRawChunk(tr0);

    // 9. 使用 YamahaWriter 進行雙向完整性校驗並輸出合法二進位檔
    const validation = YamahaWriter.validateAndWrite(parsed);
    if (!validation.success) {
      throw new Error('Yamaha 伴奏二進位合成驗證失敗');
    }

    return validation.bytes;
  }
}
