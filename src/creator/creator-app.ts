/**
 * Yamaha PSR-SX920 專注創作台 (V2 核心版)
 * 主控入口程式碼 (Creator App)
 * 支援多伴奏段落編輯 (Main A, Main B, Fill In 等)、段落一鍵複製、
 * C 大調和弦防呆導引、Yamaha 原廠鼓組/貝斯/和弦音色選擇、USB 實體琴 Web MIDI 即時發聲監聽
 */

import { DrumStepGrid } from './drum-step-grid';
import { drumSynth } from './drum-synth';
import { YAMAHA_SX920_DRUM_KITS, type YamahaDrumKitPreset } from './drum-kits';
import { PianoRollLite } from './piano-roll-lite';
import { bassSynth } from './bass-synth';
import { YAMAHA_SX920_BASS_VOICES, type YamahaBassPreset } from './bass-voices';
import { ChordRollLite, AVAILABLE_CHORD_TRACK_CONFIGS } from './chord-roll-lite';
import { chordSynth } from './chord-synth';
import { YAMAHA_SX920_CHORD_VOICES, type YamahaChordPreset } from './chord-voices';
import { setComputerAudioMuted } from './audio-routing';
import { getSharedAudioContext } from './shared-audio-context';
import { searchYamahaVoices, type YamahaVoice, type VoiceCategory } from '../core/data/yamaha-voices';
import { midiManager } from '../core/audio/midi-manager';
import { YamahaTemplateStyleSynthesizer, type TemplateSectionInput } from '../core/writer/template-style-synthesizer';
import { YamahaPadSynthesizer } from '../core/writer/pad-synthesizer';
import { YamahaPadModifier } from '../core/writer/pad-modifier';
import { YamahaWriter } from '../core/writer/yamaha-writer';
import { MixerPanel, type MixerChannelInfo } from './mixer-panel';
import { SectionPresetsEngine, type GeneratedSectionPattern } from './section-presets-engine';
import { StyLoader, resolveExactChordVoice, resolveExactBassVoice, resolveExactDrumKit } from './sty-loader';

export type CreatorMode = 'STY' | 'PAD';

export interface SectionPreset {
  id: string;
  label: string;
  defaultBars: number;
}

export const STY_SECTION_PRESETS: SectionPreset[] = [
  { id: 'Main A', label: 'Main A (主要伴奏 1 - 主歌)', defaultBars: 4 },
  { id: 'Main B', label: 'Main B (主要伴奏 2 - 副歌)', defaultBars: 4 },
  { id: 'Main C', label: 'Main C (主要伴奏 3 - 強烈)', defaultBars: 4 },
  { id: 'Main D', label: 'Main D (主要伴奏 4 - 高潮)', defaultBars: 4 },
  { id: 'Fill In AA', label: 'Fill In AA (過門 A - 1小節)', defaultBars: 1 },
  { id: 'Fill In BB', label: 'Fill In BB (過門 B - 1小節)', defaultBars: 1 },
  { id: 'Fill In CC', label: 'Fill In CC (過門 C - 1小節)', defaultBars: 1 },
  { id: 'Fill In DD', label: 'Fill In DD (過門 D - 1小節)', defaultBars: 1 },
  { id: 'Break', label: 'Break (過門暫停 - 1小節)', defaultBars: 1 },
  { id: 'Intro A', label: 'Intro A (前奏 A - 計拍/短引子)', defaultBars: 4 },
  { id: 'Intro B', label: 'Intro B (前奏 B - 流行和弦前奏)', defaultBars: 4 },
  { id: 'Intro C', label: 'Intro C (前奏 C - 華麗長版大前奏)', defaultBars: 8 },
  { id: 'Ending A', label: 'Ending A (尾奏 A - 俐落大鈸收束)', defaultBars: 2 },
  { id: 'Ending B', label: 'Ending B (尾奏 B - 樂團漸慢大收尾)', defaultBars: 4 },
  { id: 'Ending C', label: 'Ending C (尾奏 C - 抒情溫柔淡出終止)', defaultBars: 4 },
];

export const PAD_SECTION_PRESETS: SectionPreset[] = [
  { id: 'Pad 1', label: 'Pad 1 (多功能打擊板 1)', defaultBars: 2 },
  { id: 'Pad 2', label: 'Pad 2 (多功能打擊板 2)', defaultBars: 2 },
  { id: 'Pad 3', label: 'Pad 3 (多功能打擊板 3)', defaultBars: 2 },
  { id: 'Pad 4', label: 'Pad 4 (多功能打擊板 4)', defaultBars: 2 },
];

export interface RealNoteMeta {
  velocity: number;
  durationMs: number;
  durationTicks?: number;
  offsetMs?: number;      // 掃弦微時差 (毫秒)
  offsetTicks?: number;   // 掃弦微時差 (Ticks)
  sourceChannel?: number; // 原始 MIDI 通道 (例如 8 為 Rhythm 1, 9 為 Rhythm 2)
}

export interface SectionStore {
  name: string;
  bars: number;
  drumPattern: Map<number, boolean[]>;
  bassPattern: Map<number, number>;
  chordPattern: Map<number, Set<number>>;
  dynamicPatterns?: Record<string, Map<number, Set<number>>>;

  // ✨ 真實音樂表現力數據 (相容升級)
  drumMeta?: Map<string, RealNoteMeta>;      // `${note}_${step}` -> RealNoteMeta
  bassMeta?: Map<number, RealNoteMeta>;      // step -> RealNoteMeta
  chordMeta?: Map<string, RealNoteMeta>;     // `${note}_${step}` -> RealNoteMeta
  dynamicMeta?: Record<string, Map<string, RealNoteMeta>>; // partId -> `${note}_${step}` -> RealNoteMeta
  ccEvents?: Array<{ channel: number; controller: number; value: number; step: number; relTick?: number }>;
  pitchBendEvents?: Array<{ channel: number; value: number; step: number; relTick?: number }>;

  // ✨ 100% 原檔 Bank MSB/LSB/PC 無損定址映射 (段落專屬音色)
  sectionVoices?: Record<number, { msb: number; lsb: number; pc: number; name?: string }>;
}

export interface DynamicChordTrack {
  partId: 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2';
  container: HTMLElement;
  roll: ChordRollLite;
  selectedVoice: YamahaChordPreset;
}

export interface CreatorState {
  mode: CreatorMode;
  bpm: number;
  totalBars: number;
  isPlaying: boolean;
  activePlayTrack: string | null;
  currentSection: string;
  selectedRhythm1Kit?: YamahaDrumKitPreset;
  selectedDrumKit: YamahaDrumKitPreset;
  selectedBassVoice: YamahaBassPreset;
  selectedChordVoice: YamahaChordPreset;
  isMidiConnected: boolean;
  midiRoutingMode: 'standard' | 'direct_ch1';
  computerAudioMuted: boolean;
}

export class CreatorApp {
  private state: CreatorState = {
    mode: 'STY',
    bpm: 120,
    totalBars: 4,
    isPlaying: false,
    activePlayTrack: null,
    currentSection: 'Main A',
    selectedRhythm1Kit: YAMAHA_SX920_DRUM_KITS.find(k => k.id === 'cuban-kit') || YAMAHA_SX920_DRUM_KITS[0],
    selectedDrumKit: YAMAHA_SX920_DRUM_KITS[0], // 預設 Standard Kit 1
    selectedBassVoice: YAMAHA_SX920_BASS_VOICES[0], // 預設 Finger Bass
    selectedChordVoice: YAMAHA_SX920_CHORD_VOICES[0], // 預設 Concert Grand
    isMidiConnected: false,
    midiRoutingMode: 'standard',
    computerAudioMuted: false,
  };

  private drumGrid: DrumStepGrid | null = null;
  private bassRoll: PianoRollLite | null = null;
  private chordRoll: ChordRollLite | null = null;
  private dynamicTracks: Map<string, DynamicChordTrack> = new Map();
  private mixerPanel: MixerPanel | null = null;
  private mutedChannels: Set<string> = new Set();
  private soloChannels: Set<string> = new Set();
  private playbackTimer: any = null;
  private nextStepAudioTime: number = 0;
  private visualQueue: Array<{ step: number; time: number }> = [];
  private rafId: number | null = null;
  private currentPlayStep: number = 0;
  private chainedAuditionMode: 'intro-to-main' | 'main-to-ending' | null = null;
  private chainedTimer: any = null;
  private soloAuditionMode: boolean = false;
  private soloAuditionTimer: any = null;

  // 伴奏混音台參數緩存 (包含獨立副鼓組 Rhythm 1 與動態聲部黃金配比)
  private rhythm1Mixer = { volume: 90, pan: 64, reverb: 40, chorus: 0 };
  private dynamicMixerDefaults: Record<string, { volume: number; pan: number; reverb: number; chorus: number }> = {
    Chord2: { volume: 85, pan: 76, reverb: 50, chorus: 40 },
    Pad: { volume: 80, pan: 64, reverb: 75, chorus: 50 },
    Phrase1: { volume: 85, pan: 44, reverb: 60, chorus: 20 },
    Phrase2: { volume: 80, pan: 84, reverb: 60, chorus: 30 },
  };

  // 多段落狀態記憶庫 (Section Name -> SectionStore)
  private sections: Map<string, SectionStore> = new Map();

  // 載入的現有 .STY 原始檔案資料 (用於保留 CASM/OTS/SysEx/其他未修改段落)
  private loadedBaseStyleBytes: Uint8Array | null = null;
  private loadedStyleFileName: string | null = null;

  constructor() {
    this.initElements();
    this.initSectionSelector();
    this.initMidi();
    this.bindEvents();
    this.updateUI();
  }

  private initElements() {
    console.log('🎹 Yamaha PSR-SX920 Creator App V2 初始化啟動...');
    const drumContainer = document.getElementById('step-grid-container');
    if (drumContainer) {
      this.drumGrid = new DrumStepGrid(
        drumContainer,
        this.state.totalBars,
        () => this.onPatternModified(),
        (note, vel) => this.sendMidiDrumTrigger(note, vel),
        (res) => this.onGlobalResolutionChange(res),
        (sig) => this.onGlobalTimeSignatureChange(sig),
        (kitId) => this.onDrumKitChange(kitId),
        this.state.selectedDrumKit.id,
        () => this.toggleSoloPlay('drum')
      );
    }

    const bassContainer = document.getElementById('bass-roll-container');
    if (bassContainer) {
      this.bassRoll = new PianoRollLite(
        bassContainer,
        this.state.totalBars,
        () => this.onPatternModified(),
        (note, vel) => this.sendMidiBassTrigger(note, vel),
        (voiceId) => this.onBassVoiceChange(voiceId),
        this.state.selectedBassVoice.id,
        () => this.toggleSoloPlay('bass'),
        () => this.openVoiceSearchModal('bass')
      );
    }

    const chordContainer = document.getElementById('chord-roll-container');
    if (chordContainer) {
      this.chordRoll = new ChordRollLite(
        chordContainer,
        this.state.totalBars,
        () => this.onPatternModified(),
        (note, vel) => this.sendMidiChordTrigger(note, vel),
        (voiceId) => this.onChordVoiceChange(voiceId),
        this.state.selectedChordVoice.id,
        () => this.toggleSoloPlay('chord'),
        () => this.openVoiceSearchModal('chord')
      );
    }

    // 初始化預設 Main A
    this.sections.set('Main A', {
      name: 'Main A',
      bars: 4,
      drumPattern: new Map(),
      bassPattern: new Map(),
      chordPattern: new Map(),
      dynamicPatterns: {},
    });

    // 初始化合成器聲音模型
    chordSynth.setVoice(this.state.selectedChordVoice);
    bassSynth.setVoice(this.state.selectedBassVoice);

    this.updateAddChannelButtonsUI();

    // 初始化視覺化伴奏混音台
    const mixerContainer = document.getElementById('mixer-panel-container');
    if (mixerContainer) {
      this.mixerPanel = new MixerPanel(mixerContainer, {
        onVolumeChange: (id, vol) => this.onMixerVolumeChange(id, vol),
        onPanChange: (id, pan) => this.onMixerPanChange(id, pan),
        onReverbChange: (id, rev) => this.onMixerReverbChange(id, rev),
        onChorusChange: (id, cho) => this.onMixerChorusChange(id, cho),
        onMuteToggle: (id, muted) => this.onMixerMuteToggle(id, muted),
        onSoloToggle: (id, solo) => this.onMixerSoloToggle(id, solo),
        onTrackPlayToggle: (id) => this.onMixerTrackPlayToggle(id),
        onPlayAllToggle: () => this.togglePlay(),
        onResetDefaults: () => this.resetMixerToGoldenDefaults(),
        onPanic: () => this.panicMixer(),
        onVisibilityChange: (vis) => this.updateMixerButtonState(vis),
      });
      this.refreshMixerChannels();
    }
  }

  /**
   * 滾動至新增伴奏音軌面板並給予閃爍高亮反饋
   */
  public scrollToAddChannelPanel() {
    const panel = document.getElementById('panel-add-channel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.remove('panel-pulse-highlight');
      void panel.offsetWidth; // 強制重繪
      panel.classList.add('panel-pulse-highlight');
      this.setStatus('💡 請在下方點選要新增的伴奏聲部 (Chord 2, Pad, Phrase 1, Phrase 2)');
    }
  }

  /**
   * 動態新增伴奏音軌 (Chord 2, Pad, Phrase 1, Phrase 2)
   */
  public addDynamicTrack(partId: 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2') {
    if (this.dynamicTracks.has(partId)) return;

    const dynamicContainer = document.getElementById('dynamic-tracks-container');
    if (!dynamicContainer) return;

    const config = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
    if (!config) return;

    const trackContainer = document.createElement('section');
    trackContainer.id = `track-${partId.toLowerCase()}-container`;
    trackContainer.className = 'sequencer-panel piano-roll-panel';
    dynamicContainer.appendChild(trackContainer);

    const initVoice = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === config.defaultVoiceId) || YAMAHA_SX920_CHORD_VOICES[0];

    const roll = new ChordRollLite(
      trackContainer,
      this.state.totalBars,
      () => this.onPatternModified(),
      (note, vel) => this.sendMidiDynamicTrackTrigger(partId, note, vel),
      (voiceId) => this.onDynamicTrackVoiceChange(partId, voiceId),
      initVoice.id,
      () => this.toggleSoloPlay(partId),
      () => this.openVoiceSearchModal(partId),
      {
        ...config,
        onRemoveTrack: () => this.removeDynamicTrack(partId),
      }
    );

    // 同步當前拍號與網格解析度
    const currentRes = this.drumGrid?.getResolution() || '1/16';
    const currentSig = this.drumGrid?.getTimeSignatureType() || '4/4';
    roll.setResolution(currentRes);
    roll.setTimeSignature(currentSig);

    // 若當前段落記憶庫中有此軌 Pattern，予以還原
    const currentStore = this.sections.get(this.state.currentSection);
    if (currentStore?.dynamicPatterns && currentStore.dynamicPatterns[partId]) {
      roll.setPatternData(currentStore.dynamicPatterns[partId]);
    }

    // 設定原廠黃金配比預設音量、聲相與效果器
    const dynSynth = roll.getSynth();
    if (partId === 'Chord2') {
      dynSynth.setVolume(85);
      dynSynth.setPan(76); // R12
      dynSynth.setReverb(50);
      dynSynth.setChorus(40);
    } else if (partId === 'Pad') {
      dynSynth.setVolume(80);
      dynSynth.setPan(64); // C
      dynSynth.setReverb(75);
      dynSynth.setChorus(50);
    } else if (partId === 'Phrase1') {
      dynSynth.setVolume(85);
      dynSynth.setPan(44); // L20
      dynSynth.setReverb(60);
      dynSynth.setChorus(20);
    } else if (partId === 'Phrase2') {
      dynSynth.setVolume(80);
      dynSynth.setPan(84); // R20
      dynSynth.setReverb(60);
      dynSynth.setChorus(30);
    }

    const dynTrack: DynamicChordTrack = {
      partId,
      container: trackContainer,
      roll,
      selectedVoice: initVoice,
    };
    this.dynamicTracks.set(partId, dynTrack);

    // 若已連線實體琴，同步發送音色切換與混音設定
    if (this.state.isMidiConnected) {
      midiManager.sendVoiceChange(config.channel, {
        msb: initVoice.msb,
        lsb: initVoice.lsb,
        pc: initVoice.pc,
      });
      midiManager.sendMixerControllers(config.channel, {
        volume: dynSynth.getVolume(),
        pan: dynSynth.getPan(),
        reverb: dynSynth.getReverb(),
        chorus: dynSynth.getChorus(),
      });
    }

    this.refreshMixerChannels();
    this.updateAddChannelButtonsUI();
    this.updateSectionSummary();
    this.refreshSectionOptions();

    trackContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.setStatus(`✓ 已啟用【${config.title}】(Channel ${config.panelCh})！預設音色為【${initVoice.name}】。`);
  }

  /**
   * 移除動態伴奏音軌
   */
  public removeDynamicTrack(partId: string) {
    const track = this.dynamicTracks.get(partId);
    if (!track) return;
    const config = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
    const trackTitle = config ? config.title : partId;

    if (track.roll.hasNotes()) {
      const ok = confirm(`確定要移除【${trackTitle}】音軌嗎？\n該軌道目前編寫的音符將會被清除。`);
      if (!ok) return;
    }

    if (this.state.isPlaying && this.state.activePlayTrack === partId) {
      this.pause();
    }

    track.container.remove();
    this.dynamicTracks.delete(partId);
    this.mutedChannels.delete(partId);
    this.soloChannels.delete(partId);
    this.applyMixerAudioStates();
    this.refreshMixerChannels();

    // 同步清空各段落中此音軌的 Pattern
    this.sections.forEach(s => {
      if (s.dynamicPatterns && s.dynamicPatterns[partId]) {
        delete s.dynamicPatterns[partId];
      }
    });

    this.updateAddChannelButtonsUI();
    this.updateSectionSummary();
    this.refreshSectionOptions();
    this.setStatus(`✓ 已移除【${trackTitle}】伴奏音軌。`);
  }

  /**
   * 更新新增聲部按鈕的顯示狀態
   */
  private updateAddChannelButtonsUI() {
    const parts = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    let addedCount = 0;
    for (const p of parts) {
      const btn = document.getElementById(`btn-add-ch-${p.toLowerCase()}`);
      const isAdded = this.dynamicTracks.has(p);
      if (btn) {
        if (isAdded) {
          btn.style.display = 'none';
          addedCount++;
        } else {
          btn.style.display = 'inline-flex';
        }
      }
    }

    const panelNotice = document.getElementById('add-channel-notice');
    if (panelNotice) {
      if (addedCount === parts.length) {
        panelNotice.textContent = '🌟 已啟用 PSR-SX920 全部 8 個伴奏通道 (Ch 9 ~ Ch 16)！';
        panelNotice.style.color = '#38bdf8';
      } else {
        panelNotice.textContent = `PSR-SX920 完整具備 8 個伴奏通道。目前已啟用 ${3 + addedCount}/8 個聲部，點擊按鈕可隨時增減！`;
        panelNotice.style.color = '#94a3b8';
      }
    }
  }

  /**
   * 動態軌道音色切換處理
   */
  private onDynamicTrackVoiceChange(partId: string, voiceId: string) {
    const track = this.dynamicTracks.get(partId);
    if (!track) return;
    const found = YAMAHA_SX920_CHORD_VOICES.find(c => c.id === voiceId);
    if (found) {
      track.selectedVoice = found;
      track.roll.getSynth().setVoice(found);
      this.mixerPanel?.updateVoiceName(partId, found.name);
      const config = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
      if (this.state.isMidiConnected && config) {
        midiManager.sendVoiceChange(config.channel, {
          msb: found.msb,
          lsb: found.lsb,
          pc: found.pc,
        });
      }
      this.setStatus(`✓ 已切換【${config?.title || partId}】音色為【${found.name}】(琴端: PC ${found.panelPc}, Bank ${found.msb}-${found.lsb})`);
    }
  }

  /**
   * 發送動態伴奏音軌的 Web MIDI 音符觸發 (支援 SFF2/SFF1 雙向鏡像廣播)
   */
  private sendMidiDynamicTrackTrigger(partId: string, note: number, velocity: number = 100, durMs: number = 350, _sourceCh?: number, midiTimestamp?: number) {
    if (this.isChannelEffectiveMuted(partId)) return;
    if (midiTimestamp === undefined) {
      this.mixerPanel?.triggerVuMeter(partId, velocity);
    }
    if (this.state.isMidiConnected) {
      const config = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
      if (config) {
        const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : config.channel;
        if (midiTimestamp !== undefined) {
          midiManager.sendNoteOn(ch, note, velocity, midiTimestamp);
          midiManager.sendNoteOff(ch, note, midiTimestamp + durMs);
        } else {
          midiManager.sendNoteOn(ch, note, velocity);
          setTimeout(() => {
            midiManager.sendNoteOff(ch, note);
          }, durMs);
        }
      }
    }
  }

  /**
   * 鼓組切換處理
   */
  private onDrumKitChange(kitId: string) {
    const found = YAMAHA_SX920_DRUM_KITS.find(k => k.id === kitId);
    if (found) {
      this.state.selectedDrumKit = found;
      this.syncDrumKitToKeyboard();
      this.mixerPanel?.updateVoiceName('drum', found.name);
      this.setStatus(`✓ 已切換鼓組【${found.name}】(琴端代碼: PC ${found.panelPc}, Bank ${found.msb}-${found.lsb})`);
    }
  }

  /**
   * 貝斯音色切換處理
   */
  private onBassVoiceChange(voiceId: string) {
    const found = YAMAHA_SX920_BASS_VOICES.find(b => b.id === voiceId);
    if (found) {
      this.state.selectedBassVoice = found;
      bassSynth.setVoice(found);
      this.syncBassVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('bass', found.name);
      this.setStatus(`✓ 已切換貝斯【${found.name}】(琴端代碼: PC ${found.panelPc}, Bank ${found.msb}-${found.lsb})`);
    }
  }

  /**
   * 和弦音色切換處理
   */
  private onChordVoiceChange(voiceId: string) {
    const found = YAMAHA_SX920_CHORD_VOICES.find(c => c.id === voiceId);
    if (found) {
      this.state.selectedChordVoice = found;
      chordSynth.setVoice(found);
      this.syncChordVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('chord', found.name);
      this.setStatus(`✓ 已切換和弦【${found.name}】(琴端代碼: PC ${found.panelPc}, Bank ${found.msb}-${found.lsb})`);
    }
  }

  /**
   * 初始化段落切換下拉選單與複製對話盒
   */
  private initSectionSelector() {
    this.refreshSectionOptions();

    const selectSection = document.getElementById('select-current-section') as HTMLSelectElement | null;
    selectSection?.addEventListener('change', () => {
      this.switchSection(selectSection.value);
    });

    // 複製段落按鈕
    const btnCopy = document.getElementById('btn-copy-section') as HTMLButtonElement | null;
    btnCopy?.addEventListener('click', () => {
      this.openCopyModal();
    });

    // 關閉複製彈窗
    const btnCloseCopy = document.getElementById('btn-close-copy-modal');
    btnCloseCopy?.addEventListener('click', () => {
      this.closeCopyModal();
    });
  }

  /**
   * 更新段落選項清單 (STY 段落 vs PAD 段落)
   */
  private refreshSectionOptions() {
    const selectSection = document.getElementById('select-current-section') as HTMLSelectElement | null;
    if (!selectSection) return;

    selectSection.innerHTML = '';
    const presets = this.state.mode === 'STY' ? STY_SECTION_PRESETS : PAD_SECTION_PRESETS;

    for (const item of presets) {
      const opt = document.createElement('option');
      opt.value = item.id;
      const hasNotes = this.checkSectionHasNotes(item.id);
      opt.textContent = `${item.label}${hasNotes ? ' ★' : ''}`;
      if (item.id === this.state.currentSection) {
        opt.selected = true;
      }
      selectSection.appendChild(opt);
    }
  }

  /**
   * 檢查某個段落是否已有編寫音符
   */
  private checkSectionHasNotes(secName: string): boolean {
    if (secName === this.state.currentSection) {
      let hasDynamic = false;
      for (const track of this.dynamicTracks.values()) {
        if (track.roll.hasNotes()) {
          hasDynamic = true;
          break;
        }
      }
      return (
        (this.drumGrid?.hasNotes() ?? false) ||
        (this.bassRoll?.hasNotes() ?? false) ||
        (this.chordRoll?.hasNotes() ?? false) ||
        hasDynamic
      );
    }
    const store = this.sections.get(secName);
    if (!store) return false;
    let hasDrums = false;
    store.drumPattern.forEach(arr => {
      if (arr.some(b => b)) hasDrums = true;
    });
    const hasBass = store.bassPattern.size > 0;
    let hasChord = false;
    if (store.chordPattern) {
      for (const set of store.chordPattern.values()) {
        if (set && set.size > 0) {
          hasChord = true;
          break;
        }
      }
    }
    let hasDynamic = false;
    if (store.dynamicPatterns) {
      for (const pat of Object.values(store.dynamicPatterns)) {
        for (const set of pat.values()) {
          if (set && set.size > 0) {
            hasDynamic = true;
            break;
          }
        }
        if (hasDynamic) break;
      }
    }
    return hasDrums || hasBass || hasChord || hasDynamic;
  }

  /**
   * 將當前畫面的鼓、貝斯與和弦 Pattern 存入 Store
   */
  private saveCurrentSectionToStore() {
    if (!this.drumGrid || !this.bassRoll || !this.chordRoll) return;

    const dynamicPatterns: Record<string, Map<number, Set<number>>> = {};
    this.dynamicTracks.forEach((track, partId) => {
      dynamicPatterns[partId] = track.roll.getPatternData();
    });

    const existing = this.sections.get(this.state.currentSection);

    this.sections.set(this.state.currentSection, {
      name: this.state.currentSection,
      bars: this.state.totalBars,
      drumPattern: this.drumGrid.getPatternData(),
      bassPattern: this.bassRoll.getPatternData(),
      chordPattern: this.chordRoll.getPatternData(),
      dynamicPatterns,
      drumMeta: existing?.drumMeta,
      bassMeta: existing?.bassMeta,
      chordMeta: existing?.chordMeta,
      dynamicMeta: existing?.dynamicMeta,
      ccEvents: existing?.ccEvents,
      pitchBendEvents: existing?.pitchBendEvents,
      sectionVoices: existing?.sectionVoices,
    });
  }

  /**
   * 切換編輯段落 (例如由 Main A 切換至 Main B)
   * @param newSectionName 目標段落名稱
   * @param preservePlayback 是否在切換時維持播放狀態 (用於實境連鎖試聽無縫切換)
   * @param forceReload 是否強制重新載入當前段落資料至 UI (例如載入外部 STY 檔案後)
   */
  public switchSection(newSectionName: string, preservePlayback: boolean = false, forceReload: boolean = false) {
    if (this.state.currentSection === newSectionName && !forceReload) return;

    if (this.state.isPlaying && !preservePlayback) {
      this.stop();
    }

    // 1. 若非強制重新載入，先暫存當前段落至 Store
    if (!forceReload) {
      this.saveCurrentSectionToStore();
    }

    // 2. 切換段落標識
    this.state.currentSection = newSectionName;

    // 3. 獲取或建立目標段落
    let store = this.sections.get(newSectionName);
    if (!store) {
      const presets = this.state.mode === 'STY' ? STY_SECTION_PRESETS : PAD_SECTION_PRESETS;
      const foundPreset = presets.find(p => p.id === newSectionName);
      const defaultBars = foundPreset ? foundPreset.defaultBars : 4;

      store = {
        name: newSectionName,
        bars: defaultBars,
        drumPattern: new Map(),
        bassPattern: new Map(),
        chordPattern: new Map(),
        dynamicPatterns: {},
      };

      // 若為前奏 (Intro) 或尾奏 (Ending)，自動預載智慧音樂樣板，避免新段落為完全空白空音
      const currentStepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
      if (newSectionName === 'Intro A') {
        const autoIntro = SectionPresetsEngine.generateIntroHarmonic(defaultBars, currentStepsPerBar);
        store.drumPattern = autoIntro.drumPattern;
        store.bassPattern = autoIntro.bassPattern;
        store.chordPattern = autoIntro.chordPattern;
      } else if (newSectionName === 'Intro B') {
        const autoIntro = SectionPresetsEngine.generateIntroCountIn(defaultBars, currentStepsPerBar);
        store.drumPattern = autoIntro.drumPattern;
        store.bassPattern = autoIntro.bassPattern;
        store.chordPattern = autoIntro.chordPattern;
      } else if (newSectionName === 'Intro C') {
        const autoIntro = SectionPresetsEngine.generateIntroHarmonic(defaultBars, currentStepsPerBar);
        store.drumPattern = autoIntro.drumPattern;
        store.bassPattern = autoIntro.bassPattern;
        store.chordPattern = autoIntro.chordPattern;
      } else if (newSectionName === 'Ending A') {
        const autoEnding = SectionPresetsEngine.generateEndingPunch(defaultBars, currentStepsPerBar);
        store.drumPattern = autoEnding.drumPattern;
        store.bassPattern = autoEnding.bassPattern;
        store.chordPattern = autoEnding.chordPattern;
      } else if (newSectionName === 'Ending B') {
        const autoEnding = SectionPresetsEngine.generateEndingClimax(defaultBars, currentStepsPerBar);
        store.drumPattern = autoEnding.drumPattern;
        store.bassPattern = autoEnding.bassPattern;
        store.chordPattern = autoEnding.chordPattern;
      } else if (newSectionName === 'Ending C') {
        const autoEnding = SectionPresetsEngine.generateEndingSoft(defaultBars, currentStepsPerBar);
        store.drumPattern = autoEnding.drumPattern;
        store.bassPattern = autoEnding.bassPattern;
        store.chordPattern = autoEnding.chordPattern;
      } else if (newSectionName === 'Break') {
        const autoBreak = SectionPresetsEngine.generateBreakPattern(defaultBars, currentStepsPerBar);
        store.drumPattern = autoBreak.drumPattern;
        store.bassPattern = autoBreak.bassPattern;
        store.chordPattern = autoBreak.chordPattern;
      }

      this.sections.set(newSectionName, store);
    }

    // 4. 同步更新小節數與網格
    this.state.totalBars = store.bars;
    if (!preservePlayback) {
      this.currentPlayStep = 0;
      this.drumGrid?.setPlayheadStep(null);
      this.bassRoll?.setPlayheadStep(null);
      this.chordRoll?.setPlayheadStep(null);
      this.dynamicTracks.forEach(t => t.roll.setPlayheadStep(null));
    }
    const selectBars = document.getElementById('select-bars') as HTMLSelectElement | null;
    if (selectBars) {
      this.ensureBarsOptionExists(selectBars, store.bars);
      selectBars.value = store.bars.toString();
    }

    const selectSection = document.getElementById('select-current-section') as HTMLSelectElement | null;
    if (selectSection) {
      selectSection.value = newSectionName;
    }

    this.drumGrid?.setTotalBars(store.bars);
    this.bassRoll?.setTotalBars(store.bars);
    this.chordRoll?.setTotalBars(store.bars);

    this.drumGrid?.setPatternData(store.drumPattern);
    this.bassRoll?.setPatternData(store.bassPattern);
    this.chordRoll?.setPatternData(store.chordPattern || new Map());

    // 同步更新所有已啟用的動態伴奏音軌
    this.dynamicTracks.forEach((track, partId) => {
      track.roll.setTotalBars(store.bars);
      const pat = store.dynamicPatterns?.[partId] || new Map();
      track.roll.setPatternData(pat);
    });

    // ✨ 若該段落有專屬音色定義 (sectionVoices)，同步更新軟體 UI (軌道音色/合成器/混音台) 與實體琴端
    if (store.sectionVoices) {
      // 1. 和弦 1 (Chord 1 / Ch 12, SFF2 11)
      if (store.sectionVoices[11]) {
        const sv = store.sectionVoices[11];
        const voice = resolveExactChordVoice(sv.msb, sv.lsb, sv.pc, 'Guitar');
        this.state.selectedChordVoice = voice;
        this.chordRoll?.setVoice(voice);
        this.chordRoll?.getSynth().setVoice(voice);
        this.mixerPanel?.updateVoiceName('chord', voice.name);
      }

      // 2. 貝斯 (Bass / Ch 11, SFF2 10 vs SFF1 1)
      const bassSv = store.sectionVoices[10] || store.sectionVoices[1];
      if (bassSv) {
        const voice = resolveExactBassVoice(bassSv.msb, bassSv.lsb, bassSv.pc);
        this.state.selectedBassVoice = voice;
        this.bassRoll?.setVoice(voice);
        bassSynth.setVoice(voice);
        this.mixerPanel?.updateVoiceName('bass', voice.name);
      }

      // 3. 鼓組 (Rhythm 2 / Ch 10, SFF2 9)
      if (store.sectionVoices[9]) {
        const sv = store.sectionVoices[9];
        const kit = resolveExactDrumKit(sv.msb, sv.lsb, sv.pc);
        this.state.selectedDrumKit = kit;
        this.drumGrid?.setSelectedDrumKit(kit.id);
        this.mixerPanel?.updateVoiceName('drum', kit.name);
      }

      // 4. 動態伴奏軌 (Chord 2: 12, Pad: 13, Phrase 1: 14, Phrase 2: 15)
      const dynChannelMap: Record<string, number> = {
        Chord2: 12,
        Pad: 13,
        Phrase1: 14,
        Phrase2: 15,
      };
      this.dynamicTracks.forEach((track, partId) => {
        const destCh = dynChannelMap[partId];
        if (destCh && store!.sectionVoices && store!.sectionVoices[destCh]) {
          const sv = store!.sectionVoices[destCh];
          const defCat = partId === 'Phrase1' ? 'Guitar' : (partId === 'Pad' ? 'Pad' : 'Strings');
          const voice = resolveExactChordVoice(sv.msb, sv.lsb, sv.pc, defCat);
          track.selectedVoice = voice;
          track.roll.setVoice(voice);
          track.roll.getSynth().setVoice(voice);
          this.mixerPanel?.updateVoiceName(partId, voice.name);
        }
      });

      // 5. 若已連接 USB 實體琴，同步切換琴端專屬音色
      if (this.state.isMidiConnected) {
        for (const [chStr, v] of Object.entries(store.sectionVoices)) {
          const ch = parseInt(chStr, 10);
          midiManager.sendVoiceChange(ch, {
            msb: v.msb,
            lsb: v.lsb,
            pc: v.pc,
          });
        }
      }
    }

    // 6. 即時動態連動混音台：更新各軌道音色名稱、有音符(ACTIVE) / 空白(SILENT) 狀態與清空殘留 VU 燈號
    this.refreshMixerChannels();
    this.mixerPanel?.clearAllVuMeters();

    this.updateUI();
    if (!preservePlayback) {
      this.setStatus(`✓ 已切換至【${newSectionName}】段落 (${store.bars} 小節)`);
    }
  }

  /**
   * 開啟「複製此段到...」彈窗
   */
  private openCopyModal() {
    const modal = document.getElementById('modal-copy-section');
    const sourceLabel = document.getElementById('modal-source-sec-name');
    const list = document.getElementById('modal-target-sections-list');
    if (!modal || !list) return;

    if (sourceLabel) sourceLabel.textContent = this.state.currentSection;
    list.innerHTML = '';

    const presets = this.state.mode === 'STY' ? STY_SECTION_PRESETS : PAD_SECTION_PRESETS;
    const targets = presets.filter(p => p.id !== this.state.currentSection);

    for (const t of targets) {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.style.padding = '8px 12px';
      btn.style.fontSize = '0.85rem';
      btn.style.textAlign = 'left';
      btn.style.display = 'flex';
      btn.style.justifyContent = 'space-between';
      btn.style.alignItems = 'center';

      const hasNotes = this.checkSectionHasNotes(t.id);
      btn.innerHTML = `
        <span>📄 ${t.id}</span>
        <span style="font-size: 0.72rem; color: ${hasNotes ? '#f59e0b' : '#64748b'};">${hasNotes ? '(有音符)' : '(空白)'}</span>
      `;

      btn.addEventListener('click', () => {
        this.copyCurrentSectionTo(t.id);
        this.closeCopyModal();
      });

      list.appendChild(btn);
    }

    modal.style.display = 'flex';
  }

  private closeCopyModal() {
    const modal = document.getElementById('modal-copy-section');
    if (modal) modal.style.display = 'none';
  }

  private currentVoiceSearchTarget: string = 'chord';

  public openVoiceSearchModal(target: string) {
    this.currentVoiceSearchTarget = target;
    const modal = document.getElementById('modal-voice-search');
    const input = document.getElementById('input-voice-search-keyword') as HTMLInputElement | null;
    const catSelect = document.getElementById('select-voice-search-category') as HTMLSelectElement | null;
    const title = modal?.querySelector('h3') as HTMLElement | null;

    if (!modal) return;

    if (title) {
      if (target === 'chord') {
        title.innerHTML = '<span>🔍</span> 伴奏和弦 (Chord 1 / Ch 12) - Yamaha SX920 原廠 2,300+ 音色資料庫檢索';
      } else if (target === 'bass') {
        title.innerHTML = '<span>🔍</span> 伴奏貝斯 (Bass / Ch 11) - Yamaha SX920 原廠 2,300+ 音色資料庫檢索';
      } else {
        const dynCfg = AVAILABLE_CHORD_TRACK_CONFIGS[target];
        title.innerHTML = `<span>🔍</span> ${dynCfg?.title || target} (Ch ${dynCfg?.panelCh || ''}) - Yamaha SX920 原廠 2,300+ 音色資料庫檢索`;
      }
    }

    if (input) {
      input.value = '';
    }

    if (catSelect) {
      if (target === 'bass') catSelect.value = 'Bass';
      else if (target === 'Pad') catSelect.value = 'Pad';
      else if (target === 'Phrase1' || target === 'Phrase2') catSelect.value = 'Brass';
      else catSelect.value = 'ALL';
    }

    modal.style.display = 'flex';
    input?.focus();
    this.renderVoiceSearchResults();
  }

  public closeVoiceSearchModal() {
    const modal = document.getElementById('modal-voice-search');
    if (modal) modal.style.display = 'none';
  }

  private renderVoiceSearchResults() {
    const input = document.getElementById('input-voice-search-keyword') as HTMLInputElement | null;
    const catSelect = document.getElementById('select-voice-search-category') as HTMLSelectElement | null;
    const list = document.getElementById('voice-search-results-list');
    if (!list) return;

    const keyword = input?.value.trim() || '';
    const category = (catSelect?.value || 'ALL') as VoiceCategory | 'ALL';

    const results = searchYamahaVoices(keyword, category, 'ALL');
    list.innerHTML = '';

    if (results.length === 0) {
      list.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: #94a3b8; font-size: 0.9rem;">
          🔍 找不到符合「${keyword}」的音色，請嘗試更簡短的關鍵字（如 CFX, Strum, Clean, Sax, Bass）或切換分類。
        </div>
      `;
      return;
    }

    // 限制顯示前 80 筆提升渲染流暢度
    const displayLimit = 80;
    const toRender = results.slice(0, displayLimit);

    const headerInfo = document.createElement('div');
    headerInfo.style.cssText = 'padding: 4px 6px; font-size: 0.78rem; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 4px;';
    headerInfo.innerHTML = `
      <span>共找到 <strong style="color: #38bdf8;">${results.length}</strong> 個原廠音色</span>
      ${results.length > displayLimit ? `<span style="color: #f59e0b;">(僅顯示前 ${displayLimit} 筆，請輸入關鍵字縮小範圍)</span>` : ''}
    `;
    list.appendChild(headerInfo);

    toRender.forEach(v => {
      const item = document.createElement('div');
      item.className = 'voice-picker-item';
      item.style.cursor = 'pointer';

      let typeBadge = '';
      if (v.type && v.type !== 'Standard' && v.type !== 'Legacy') {
        typeBadge = `<span style="font-size: 0.68rem; padding: 1px 5px; border-radius: 3px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 700;">${v.type}</span>`;
      }

      const icon = this.getVoiceCategoryIcon(v.category);
      let isSelected = false;
      if (this.currentVoiceSearchTarget === 'chord') {
        isSelected = (this.state.selectedChordVoice.msb === v.msb && this.state.selectedChordVoice.lsb === v.lsb && this.state.selectedChordVoice.pc === v.pc);
      } else if (this.currentVoiceSearchTarget === 'bass') {
        isSelected = (this.state.selectedBassVoice.msb === v.msb && this.state.selectedBassVoice.lsb === v.lsb && this.state.selectedBassVoice.pc === v.pc);
      } else {
        const dynTrack = this.dynamicTracks.get(this.currentVoiceSearchTarget);
        if (dynTrack) {
          isSelected = (dynTrack.selectedVoice.msb === v.msb && dynTrack.selectedVoice.lsb === v.lsb && dynTrack.selectedVoice.pc === v.pc);
        }
      }

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
          <span style="font-size: 1.3rem;">${icon}</span>
          <div style="min-width: 0; display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 600; color: ${isSelected ? '#38bdf8' : '#f1f5f9'}; font-size: 0.88rem;">${v.name}</span>
              ${typeBadge}
              ${v.chineseName ? `<span style="font-size: 0.76rem; color: #94a3b8;">${v.chineseName}</span>` : ''}
            </div>
            <div style="font-size: 0.73rem; color: #64748b; display: flex; gap: 10px;">
              <span>琴端 PC: <strong style="color: #cbd5e1;">${v.pc + 1}</strong></span>
              <span>Bank: <strong style="color: #cbd5e1;">${v.msb}-${v.lsb}</strong></span>
              <span>類別: ${v.category}</span>
            </div>
          </div>
        </div>
        <button class="btn-picker-add" style="margin-left: 8px; font-size: 0.8rem; padding: 4px 10px; white-space: nowrap;">
          ${isSelected ? '已選用 ✓' : '套用'}
        </button>
      `;

      item.addEventListener('click', () => {
        this.applyVoiceSearchResult(v);
      });

      list.appendChild(item);
    });
  }

  private getVoiceCategoryIcon(cat: string): string {
    switch (cat) {
      case 'Piano': return '🎹';
      case 'E.Piano': return '⚡';
      case 'Guitar': return '🎸';
      case 'Bass': return '🎸';
      case 'Strings': return '🎻';
      case 'Brass': return '🎺';
      case 'Saxophone': return '🎷';
      case 'Organ': return '🎼';
      case 'Accordion': return '🪗';
      case 'Pad': return '🌌';
      case 'Choir': return '👥';
      case 'Synth': return '🎛️';
      case 'Woodwind': return '🪈';
      default: return '🎵';
    }
  }

  private applyVoiceSearchResult(voice: YamahaVoice) {
    if (this.currentVoiceSearchTarget === 'chord') {
      const id = `voice-${voice.msb}-${voice.lsb}-${voice.pc}`;
      let preset = YAMAHA_SX920_CHORD_VOICES.find(c => c.msb === voice.msb && c.lsb === voice.lsb && c.pc === voice.pc);
      if (!preset) {
        preset = {
          id,
          name: voice.chineseName ? `${voice.name} (${voice.chineseName})` : voice.name,
          panelPc: voice.pc + 1,
          pc: voice.pc,
          msb: voice.msb,
          lsb: voice.lsb,
          icon: this.getVoiceCategoryIcon(voice.category),
          category: (['Piano', 'E.Piano', 'Guitar', 'Strings', 'Brass', 'Saxophone', 'Organ', 'Accordion', 'Pad', 'Choir', 'Synth'].includes(voice.category) ? voice.category : 'Synth') as any,
          categoryLabel: `🔍 自選 / ${voice.category}`,
          description: voice.chineseName || voice.name,
        };
        YAMAHA_SX920_CHORD_VOICES.push(preset);
      }
      this.state.selectedChordVoice = preset;
      chordSynth.setVoice(preset);
      this.chordRoll?.setVoice(preset);
      this.syncChordVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('chord', preset.name);
      this.setStatus(`✓ 已自音色庫套用和弦音色【${preset.name}】(琴端: PC ${preset.panelPc}, Bank ${preset.msb}-${preset.lsb})`);
    } else if (this.currentVoiceSearchTarget === 'bass') {
      const id = `voice-${voice.msb}-${voice.lsb}-${voice.pc}`;
      let preset = YAMAHA_SX920_BASS_VOICES.find(b => b.msb === voice.msb && b.lsb === voice.lsb && b.pc === voice.pc);
      if (!preset) {
        const cat = (voice.category === 'Synth' ? 'Synth' : (voice.name.toLowerCase().includes('acoustic') || voice.name.toLowerCase().includes('upright')) ? 'Acoustic' : 'Electric') as any;
        preset = {
          id,
          name: voice.chineseName ? `${voice.name} (${voice.chineseName})` : voice.name,
          panelPc: voice.pc + 1,
          pc: voice.pc,
          msb: voice.msb,
          lsb: voice.lsb,
          icon: '🎸',
          category: cat,
          description: voice.chineseName || voice.name,
        };
        YAMAHA_SX920_BASS_VOICES.push(preset);
      }
      this.state.selectedBassVoice = preset;
      bassSynth.setVoice(preset);
      this.bassRoll?.setVoice(preset);
      this.syncBassVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('bass', preset.name);
      this.setStatus(`✓ 已自音色庫套用貝斯音色【${preset.name}】(琴端: PC ${preset.panelPc}, Bank ${preset.msb}-${preset.lsb})`);
    } else {
      const id = `voice-${voice.msb}-${voice.lsb}-${voice.pc}`;
      let preset = YAMAHA_SX920_CHORD_VOICES.find(c => c.msb === voice.msb && c.lsb === voice.lsb && c.pc === voice.pc);
      if (!preset) {
        preset = {
          id,
          name: voice.chineseName ? `${voice.name} (${voice.chineseName})` : voice.name,
          panelPc: voice.pc + 1,
          pc: voice.pc,
          msb: voice.msb,
          lsb: voice.lsb,
          icon: this.getVoiceCategoryIcon(voice.category),
          category: (['Piano', 'E.Piano', 'Guitar', 'Strings', 'Brass', 'Saxophone', 'Organ', 'Accordion', 'Pad', 'Choir', 'Synth'].includes(voice.category) ? voice.category : 'Synth') as any,
          categoryLabel: `🔍 自選 / ${voice.category}`,
          description: voice.chineseName || voice.name,
        };
        YAMAHA_SX920_CHORD_VOICES.push(preset);
      }
      const dynTrack = this.dynamicTracks.get(this.currentVoiceSearchTarget);
      if (dynTrack) {
        dynTrack.selectedVoice = preset;
        dynTrack.roll.getSynth().setVoice(preset);
        dynTrack.roll.setVoice(preset);
        this.mixerPanel?.updateVoiceName(this.currentVoiceSearchTarget, preset.name);
        const config = AVAILABLE_CHORD_TRACK_CONFIGS[this.currentVoiceSearchTarget];
        if (this.state.isMidiConnected && config) {
          midiManager.sendVoiceChange(config.channel, {
            msb: preset.msb,
            lsb: preset.lsb,
            pc: preset.pc,
          });
        }
        this.setStatus(`✓ 已自音色庫套用【${config?.title || this.currentVoiceSearchTarget}】音色【${preset.name}】(琴端: PC ${preset.panelPc}, Bank ${preset.msb}-${preset.lsb})`);
      }
    }

    this.closeVoiceSearchModal();
  }

  /**
   * 複製當前段落的鼓組、貝斯與和弦至目標段落
   */
  public copyCurrentSectionTo(targetSectionName: string) {
    if (this.state.currentSection === targetSectionName) return;

    this.saveCurrentSectionToStore();
    const currentStore = this.sections.get(this.state.currentSection);
    if (!currentStore) return;

    // 複製鼓組
    const drumCopy = new Map<number, boolean[]>();
    currentStore.drumPattern.forEach((arr, note) => drumCopy.set(note, [...arr]));

    // 複製貝斯
    const bassCopy = new Map(currentStore.bassPattern);

    // 複製和弦
    const chordCopy = new Map<number, Set<number>>();
    if (currentStore.chordPattern) {
      currentStore.chordPattern.forEach((set, k) => chordCopy.set(k, new Set(set)));
    }

    // 複製動態音軌
    const dynamicCopies: Record<string, Map<number, Set<number>>> = {};
    if (currentStore.dynamicPatterns) {
      for (const [partId, pat] of Object.entries(currentStore.dynamicPatterns)) {
        const copyMap = new Map<number, Set<number>>();
        pat.forEach((notes, step) => copyMap.set(step, new Set(notes)));
        dynamicCopies[partId] = copyMap;
      }
    }

    // 針對 Fill In 自動將小節調整為 1 小節以符合原廠規範
    let targetBars = currentStore.bars;
    if (targetSectionName.startsWith('Fill')) {
      targetBars = 1;
    }

    this.sections.set(targetSectionName, {
      name: targetSectionName,
      bars: targetBars,
      drumPattern: drumCopy,
      bassPattern: bassCopy,
      chordPattern: chordCopy,
      dynamicPatterns: dynamicCopies,
      sectionVoices: currentStore.sectionVoices ? { ...currentStore.sectionVoices } : undefined,
    });

    this.refreshSectionOptions();
    this.updateSectionSummary();

    if (confirm(`✨ 成功將【${this.state.currentSection}】複製到【${targetSectionName}】！\n\n是否立即切換到【${targetSectionName}】進行微調？`)) {
      const selectSection = document.getElementById('select-current-section') as HTMLSelectElement | null;
      if (selectSection) selectSection.value = targetSectionName;
      this.switchSection(targetSectionName);
    } else {
      this.setStatus(`✓ 已將【${this.state.currentSection}】複製到【${targetSectionName}】`);
    }
  }

  /**
   * 當使用者切換網格解析度 (1/16 vs 1/8) 時，全曲（鼓組、貝斯、和弦與所有聲部）同步更新
   */
  private onGlobalResolutionChange(res: import('./drum-step-grid').GridResolution) {
    this.bassRoll?.setResolution(res);
    this.chordRoll?.setResolution(res);
    this.dynamicTracks.forEach(t => t.roll.setResolution(res));
    if (this.state.isPlaying) {
      this.restartPlaybackTimer();
    }
    this.saveCurrentSectionToStore();
    this.setStatus(`✓ 全曲（鼓組、貝斯、和弦與所有聲部）網格解析度已同步切換為【${res === '1/16' ? '1/16 (16分音符，細緻)' : '1/8 (8分音符，簡潔)'}】`);
  }

  /**
   * 當使用者切換拍號 (4/4, 3/4, 6/8) 時，全曲（鼓組、貝斯、和弦與所有聲部）同步更新
   */
  private onGlobalTimeSignatureChange(sig: import('./drum-step-grid').TimeSignatureType) {
    this.bassRoll?.setTimeSignature(sig);
    this.chordRoll?.setTimeSignature(sig);
    this.dynamicTracks.forEach(t => t.roll.setTimeSignature(sig));
    if (this.state.isPlaying) {
      this.restartPlaybackTimer();
    }
    this.saveCurrentSectionToStore();
    this.setStatus(`✓ 全曲（鼓組、貝斯、和弦與所有聲部）拍號已同步切換為【${sig} 拍】`);
  }

  /**
   * 初始化 Web MIDI 與 PSR-SX920 埠口連線偵測
   */
  private async initMidi() {
    const labelMidi = document.getElementById('label-midi-status');

    if (!midiManager.isSupported()) {
      if (labelMidi) labelMidi.textContent = '琴端發聲: 瀏覽器不支援 MIDI';
      return;
    }

    try {
      await midiManager.requestAccess();
      this.updateMidiUIState();

      (navigator as any).requestMIDIAccess().then((access: any) => {
        access.onstatechange = () => {
          this.updateMidiUIState();
        };
      });
    } catch (err) {
      console.warn('Web MIDI 初始化受限:', err);
      if (labelMidi) labelMidi.textContent = '琴端發聲: 點擊授權連線';
    }
  }

  private updateMidiUIState() {
    const btnMidi = document.getElementById('btn-midi-connect');
    const labelMidi = document.getElementById('label-midi-status');
    const outputDevice = midiManager.getSelectedOutput();
    const hasOut = outputDevice !== null;

    if (hasOut && outputDevice) {
      this.state.isMidiConnected = true;
      btnMidi?.classList.add('connected');
      if (labelMidi) {
        labelMidi.textContent = `🎹 琴端即時發聲: ${outputDevice.name} 🟢`;
      }
      btnMidi?.setAttribute('title', `已連線實體琴 [${outputDevice.name}]，點擊可開啟發聲設定與通道診斷`);
      // 當實體琴連線時，預設自動將電腦 Web Audio 發聲靜音，純由琴端喇叭發聲，避免重音延遲
      if (!this.state.computerAudioMuted) {
        this.setComputerAudioMute(true);
      }
      midiManager.wakeUpAllChannels();
      this.syncDrumKitToKeyboard();
      this.syncBassVoiceToKeyboard();
      this.syncChordVoiceToKeyboard();
      this.dynamicTracks.forEach((t, partId) => {
        const config = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
        if (config) {
          midiManager.sendVoiceChange(config.channel, {
            msb: t.selectedVoice.msb,
            lsb: t.selectedVoice.lsb,
            pc: t.selectedVoice.pc,
          });
        }
      });
      this.syncMixerControllersToKeyboard();
      this.setStatus(`✓ 已連線 PSR-SX920 [${outputDevice.name}]，鼓點、貝斯、和弦與所有聲部將同步直接由琴端喇叭發聲！`);
    } else {
      this.state.isMidiConnected = false;
      btnMidi?.classList.remove('connected');
      if (labelMidi) {
        labelMidi.textContent = '🎹 琴端發聲: 未連線 (點擊重試)';
      }
      btnMidi?.setAttribute('title', '請以 USB 線連接 PSR-SX920 與電腦，並點擊此處嘗試連線');
      // 實體琴未連線時，自動恢復電腦端發聲
      if (this.state.computerAudioMuted) {
        this.setComputerAudioMute(false);
      }
    }
  }

  private setComputerAudioMute(muted: boolean) {
    this.state.computerAudioMuted = muted;
    setComputerAudioMuted(muted);
    this.updateComputerAudioUI();
  }

  private toggleComputerAudioMute() {
    this.setComputerAudioMute(!this.state.computerAudioMuted);
    if (this.state.computerAudioMuted) {
      this.setStatus('🔇 電腦端發聲已靜音（聲音純由 PSR-SX920 琴端喇叭輸出，零回音）');
    } else {
      this.setStatus('🔊 電腦端發聲已開啟（電腦喇叭與 PSR-SX920 琴端同時發聲）');
    }
  }

  private updateComputerAudioUI() {
    const btn = document.getElementById('btn-toggle-computer-audio');
    const label = document.getElementById('label-computer-audio');
    const modalBtn = document.getElementById('btn-modal-toggle-pc-audio');
    const modalDesc = document.getElementById('modal-pc-audio-desc');

    if (this.state.computerAudioMuted) {
      if (btn) {
        btn.classList.add('muted-active');
        btn.setAttribute('title', '電腦 Web Audio 目前已靜音（由 PSR-SX920 琴端發聲）。點擊可切換為雙重發聲。');
      }
      if (label) {
        label.textContent = '電腦: 🔇 已靜音 (琴端發聲)';
      }
      if (modalBtn) {
        modalBtn.textContent = '🔇 電腦目前已靜音 (由琴端發聲)';
        modalBtn.style.color = '#38bdf8';
        modalBtn.style.borderColor = '#38bdf8';
      }
      if (modalDesc) {
        modalDesc.textContent = '✓ 電腦 Web Audio 已自動靜音，所有音效均由 PSR-SX920 琴端高傳真喇叭輸出，完美避免雙重發聲延遲！';
      }
    } else {
      if (btn) {
        btn.classList.remove('muted-active');
        btn.setAttribute('title', '電腦 Web Audio 目前發聲中。點擊可切換靜音（純由 PSR-SX920 發聲）。');
      }
      if (label) {
        label.textContent = '電腦: 🔊 發聲中';
      }
      if (modalBtn) {
        modalBtn.textContent = '🔊 電腦目前發聲中 (雙重發聲)';
        modalBtn.style.color = '#34d399';
        modalBtn.style.borderColor = '#34d399';
      }
      if (modalDesc) {
        modalDesc.textContent = '電腦喇叭與實體琴同時發聲中（若聽到回音或重音，請點擊右側按鈕靜音電腦）。';
      }
    }
  }

  private openMidiSettingsModal() {
    const modal = document.getElementById('modal-midi-settings');
    if (!modal) return;
    this.populateMidiOutputSelect();

    const radios = document.querySelectorAll<HTMLInputElement>('input[name="radio-midi-routing"]');
    radios.forEach(r => {
      r.checked = (r.value === this.state.midiRoutingMode);
    });

    modal.style.display = 'flex';
  }

  private closeMidiSettingsModal() {
    const modal = document.getElementById('modal-midi-settings');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  private populateMidiOutputSelect() {
    const select = document.getElementById('select-midi-output-device') as HTMLSelectElement | null;
    if (!select) return;

    const outputs = midiManager.getAvailableOutputs();
    const current = midiManager.getSelectedOutput();
    select.innerHTML = '';

    if (outputs.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '未偵測到 MIDI 輸出埠口 (請確認 USB 線已連接琴端)';
      select.appendChild(opt);
      select.disabled = true;
    } else {
      select.disabled = false;
      outputs.forEach(port => {
        const opt = document.createElement('option');
        opt.value = port.id;
        opt.textContent = port.name ? `${port.name} (${port.id})` : `MIDI 設備 (${port.id})`;
        if (current && current.id === port.id) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }
  }

  private syncDrumKitToKeyboard() {
    if (this.state.isMidiConnected) {
      const kit = this.state.selectedDrumKit;
      midiManager.sendVoiceChange(9, {
        msb: kit.msb,
        lsb: kit.lsb,
        pc: kit.pc,
      });
      // 同步鏡像至 SFF1 鼓組通道 (Ch 7 / MIDI Ch 8)
      midiManager.sendVoiceChange(7, {
        msb: kit.msb,
        lsb: kit.lsb,
        pc: kit.pc,
      });
    }
  }

  private syncBassVoiceToKeyboard() {
    if (this.state.isMidiConnected) {
      const bass = this.state.selectedBassVoice;
      midiManager.sendVoiceChange(10, {
        msb: bass.msb,
        lsb: bass.lsb,
        pc: bass.pc,
      });
      // 同步鏡像至 SFF1 貝斯通道 (Ch 1 / MIDI Ch 2)
      midiManager.sendVoiceChange(1, {
        msb: bass.msb,
        lsb: bass.lsb,
        pc: bass.pc,
      });
    }
  }

  private syncChordVoiceToKeyboard() {
    if (this.state.isMidiConnected) {
      const chord = this.state.selectedChordVoice;
      midiManager.sendVoiceChange(11, {
        msb: chord.msb,
        lsb: chord.lsb,
        pc: chord.pc,
      });
      // 同步鏡像至 SFF1 和弦 1 通道 (Ch 2 / MIDI Ch 3)
      midiManager.sendVoiceChange(2, {
        msb: chord.msb,
        lsb: chord.lsb,
        pc: chord.pc,
      });
    }
  }

  private triggerDrumSound(note: number, velocity: number = 100, durMs: number = 80, sourceChannel: number = 9, when?: number, midiTimestamp?: number) {
    drumSynth.playNote(note, velocity, when);
    this.sendMidiDrumTrigger(note, velocity, durMs, sourceChannel, midiTimestamp);
    if (midiTimestamp === undefined) {
      if (sourceChannel === 8 || sourceChannel === 0) {
        this.mixerPanel?.triggerVuMeter('rhythm1', velocity);
      } else {
        this.mixerPanel?.triggerVuMeter('drum', velocity);
      }
    }
  }

  private triggerBassSound(note: number, velocity: number = 100, durMs: number = 240, sourceCh?: number, when?: number, midiTimestamp?: number) {
    bassSynth.playNote(note, velocity, durMs, when);
    this.sendMidiBassTrigger(note, velocity, durMs, sourceCh, midiTimestamp);
    if (midiTimestamp === undefined) {
      this.mixerPanel?.triggerVuMeter('bass', velocity);
    }
  }

  private triggerChordSound(note: number, velocity: number = 100, durMs: number = 350, sourceCh?: number, when?: number, midiTimestamp?: number) {
    chordSynth.playNote(note, velocity, durMs, when);
    this.sendMidiChordTrigger(note, velocity, durMs, sourceCh, midiTimestamp);
    if (midiTimestamp === undefined) {
      this.mixerPanel?.triggerVuMeter('chord', velocity);
    }
  }

  private sendMidiDrumTrigger(note: number, velocity: number = 100, durMs: number = 80, sourceChannel: number = 9, midiTimestamp?: number) {
    if (this.isChannelEffectiveMuted('drum')) return;
    if (this.state.isMidiConnected) {
      const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : (sourceChannel === 8 ? 8 : 9);
      if (midiTimestamp !== undefined) {
        midiManager.sendNoteOn(ch, note, velocity, midiTimestamp);
        midiManager.sendNoteOff(ch, note, midiTimestamp + durMs);
      } else {
        midiManager.sendNoteOn(ch, note, velocity);
        setTimeout(() => {
          midiManager.sendNoteOff(ch, note);
        }, durMs);
      }
    }
  }

  private sendMidiBassTrigger(note: number, velocity: number = 100, durMs: number = 240, _sourceCh?: number, midiTimestamp?: number) {
    if (this.isChannelEffectiveMuted('bass')) return;
    if (this.state.isMidiConnected) {
      const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : 10;
      if (midiTimestamp !== undefined) {
        midiManager.sendNoteOn(ch, note, velocity, midiTimestamp);
        midiManager.sendNoteOff(ch, note, midiTimestamp + durMs);
      } else {
        midiManager.sendNoteOn(ch, note, velocity);
        setTimeout(() => {
          midiManager.sendNoteOff(ch, note);
        }, durMs);
      }
    }
  }

  private sendMidiChordTrigger(note: number, velocity: number = 100, durMs: number = 350, _sourceCh?: number, midiTimestamp?: number) {
    if (this.isChannelEffectiveMuted('chord')) return;
    if (this.state.isMidiConnected) {
      const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : 11;
      if (midiTimestamp !== undefined) {
        midiManager.sendNoteOn(ch, note, velocity, midiTimestamp);
        midiManager.sendNoteOff(ch, note, midiTimestamp + durMs);
      } else {
        midiManager.sendNoteOn(ch, note, velocity);
        setTimeout(() => {
          midiManager.sendNoteOff(ch, note);
        }, durMs);
      }
    }
  }

  private onPatternModified() {
    this.saveCurrentSectionToStore();
    this.refreshSectionOptions();
    this.updateSectionSummary();
    this.mixerPanel?.updateSectionActivity(this.getSectionChannelActivity());

    const hasDrum = this.drumGrid?.hasNotes() ?? false;
    const hasBass = this.bassRoll?.hasNotes() ?? false;
    const hasChord = this.chordRoll?.hasNotes() ?? false;
    let hasDynamic = false;
    for (const track of this.dynamicTracks.values()) {
      if (track.roll.hasNotes()) {
        hasDynamic = true;
        break;
      }
    }

    if (hasDrum || hasBass || hasChord || hasDynamic) {
      const activePartNames: string[] = [];
      if (hasDrum) activePartNames.push('鼓組');
      if (hasBass) activePartNames.push('貝斯');
      if (hasChord) activePartNames.push('和弦 1');
      this.dynamicTracks.forEach((t, partId) => {
        if (t.roll.hasNotes()) {
          const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
          activePartNames.push(cfg?.title || partId);
        }
      });
      this.setStatus(`【${this.state.currentSection}】已更新 (包含音符聲部: ${activePartNames.join(', ')})，可點擊【全部播放】試聽！`);
    } else {
      this.setStatus(`【${this.state.currentSection}】空白。請在上方安排鼓點，或在下方安排貝斯與和弦。`);
    }
  }

  private bindEvents() {
    const btnSty = document.getElementById('btn-mode-sty') as HTMLButtonElement | null;
    const btnPad = document.getElementById('btn-mode-pad') as HTMLButtonElement | null;

    btnSty?.addEventListener('click', () => this.setMode('STY'));
    btnPad?.addEventListener('click', () => this.setMode('PAD'));

    const btnMidi = document.getElementById('btn-midi-connect');
    btnMidi?.addEventListener('click', async () => {
      if (!midiManager.isSupported()) {
        alert('您的瀏覽器不支援 Web MIDI API，建議使用 Google Chrome 或 Microsoft Edge。');
        return;
      }
      try {
        await midiManager.requestAccess();
        this.updateMidiUIState();
      } catch (err) {
        console.warn('MIDI 存取授權失敗:', err);
      }
      this.openMidiSettingsModal();
    });

    // MIDI 設定與診斷彈窗控制
    document.getElementById('btn-close-midi-modal')?.addEventListener('click', () => {
      this.closeMidiSettingsModal();
    });
    document.getElementById('btn-close-midi-modal-bottom')?.addEventListener('click', () => {
      this.closeMidiSettingsModal();
    });
    document.getElementById('modal-midi-settings')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-midi-settings')) {
        this.closeMidiSettingsModal();
      }
    });

    const selectMidiDevice = document.getElementById('select-midi-output-device') as HTMLSelectElement | null;
    selectMidiDevice?.addEventListener('change', () => {
      const val = selectMidiDevice.value;
      if (val) {
        midiManager.selectOutput(val);
        this.updateMidiUIState();
      }
    });

    document.getElementById('btn-reconnect-midi')?.addEventListener('click', async () => {
      this.setStatus('正在重新掃描 USB MIDI 設備...');
      await midiManager.requestAccess();
      this.populateMidiOutputSelect();
      this.updateMidiUIState();
      this.setStatus('✓ 已重新整理 MIDI 設備清單！');
    });

    document.getElementById('btn-test-ch1-piano')?.addEventListener('click', () => {
      midiManager.playTestChime(0);
      this.setStatus('🔔 已向 PSR-SX920 發送 Ch 1 大鋼琴測試琶音 (CC7=115, CC11=127)');
    });
    document.getElementById('btn-test-ch10-drums')?.addEventListener('click', () => {
      midiManager.playTestDrums(9);
      this.setStatus('🥁 已向 PSR-SX920 發送 Ch 10 標準鼓組節奏測試音 (CC7=115, CC11=127)');
    });
    document.getElementById('btn-test-ch11-bass')?.addEventListener('click', () => {
      midiManager.playTestBass(10);
      this.setStatus('🎸 已向 PSR-SX920 發送 Ch 11 貝斯低音測試音 (CC7=115, CC11=127)');
    });
    document.getElementById('btn-test-ch12-chord')?.addEventListener('click', () => {
      midiManager.playTestChord(11);
      this.setStatus('🎹 已向 PSR-SX920 發送 Ch 12 和弦試聽測試音 (CC7=115, CC11=127)');
    });

    const routingRadios = document.querySelectorAll<HTMLInputElement>('input[name="radio-midi-routing"]');
    routingRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.state.midiRoutingMode = radio.value as 'standard' | 'direct_ch1';
          if (this.state.midiRoutingMode === 'direct_ch1') {
            this.setStatus('✓ 已啟用【直通主聲部模式 (Direct to Ch 1)】：所有聲部強制映射至 Channel 1，琴端無需調整設定即可發聲！');
          } else {
            this.setStatus('✓ 已啟用【標準伴奏 8 通道模式】：鼓(Ch10)、貝斯(Ch11)、和弦(Ch12...)獨立多軌發聲。');
          }
        }
      });
    });

    // 電腦端 Web Audio 靜音/發聲切換按鈕 (頂部欄與彈窗)
    document.getElementById('btn-toggle-computer-audio')?.addEventListener('click', () => {
      this.toggleComputerAudioMute();
    });
    document.getElementById('btn-modal-toggle-pc-audio')?.addEventListener('click', () => {
      this.toggleComputerAudioMute();
    });

    const inputBpm = document.getElementById('input-bpm') as HTMLInputElement | null;
    inputBpm?.addEventListener('change', () => {
      const val = parseInt(inputBpm.value, 10);
      if (!isNaN(val) && val >= 40 && val <= 260) {
        this.state.bpm = val;
        this.setStatus(`速度設定為 ${this.state.bpm} BPM`);
        if (this.state.isPlaying) {
          this.restartPlaybackTimer();
        }
      }
    });

    document.getElementById('btn-bpm-half')?.addEventListener('click', () => {
      const newBpm = Math.max(40, Math.round(this.state.bpm / 2));
      this.state.bpm = newBpm;
      if (inputBpm) inputBpm.value = newBpm.toString();
      this.setStatus(`速度減半切換為 ${this.state.bpm} BPM`);
      if (this.state.isPlaying) this.restartPlaybackTimer();
    });

    document.getElementById('btn-bpm-double')?.addEventListener('click', () => {
      const newBpm = Math.min(260, Math.round(this.state.bpm * 2));
      this.state.bpm = newBpm;
      if (inputBpm) inputBpm.value = newBpm.toString();
      this.setStatus(`速度倍增切換為 ${this.state.bpm} BPM`);
      if (this.state.isPlaying) this.restartPlaybackTimer();
    });

    const selectBars = document.getElementById('select-bars') as HTMLSelectElement | null;
    selectBars?.addEventListener('change', () => {
      if (selectBars.value === 'custom') {
        const input = prompt('請輸入自訂小節數 (1 ~ 32)：', this.state.totalBars.toString());
        if (input !== null) {
          const num = parseInt(input.trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= 32) {
            this.setSectionBars(num);
            return;
          } else {
            alert('小節數請輸入介於 1 到 32 之間的整數。');
          }
        }
        // 若使用者取消或輸入無效，恢復原先選取
        selectBars.value = this.state.totalBars.toString();
        return;
      }

      const val = parseInt(selectBars.value, 10);
      if (!isNaN(val)) {
        this.setSectionBars(val);
      }
    });

    const btnPlay = document.getElementById('btn-play-toggle') as HTMLButtonElement | null;
    btnPlay?.addEventListener('click', () => {
      this.togglePlay();
    });

    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement | null;
    btnStop?.addEventListener('click', () => {
      this.stop();
    });

    const btnExport = document.getElementById('btn-export-file') as HTMLButtonElement | null;
    btnExport?.addEventListener('click', () => {
      this.exportFile();
    });

    // 載入現有 .STY 伴奏檔案按鈕與隱藏式檔案選取器
    const btnLoadSty = document.getElementById('btn-load-sty-file') as HTMLButtonElement | null;
    const inputLoadSty = document.getElementById('input-load-sty-file') as HTMLInputElement | null;

    btnLoadSty?.addEventListener('click', () => {
      if (inputLoadSty) {
        inputLoadSty.value = ''; // 允許連續載入同名檔案
        inputLoadSty.click();
      }
    });

    inputLoadSty?.addEventListener('change', () => {
      const file = inputLoadSty.files?.[0];
      if (file) {
        this.loadStyFile(file);
      }
    });

    // 支援檔案拖曳至視窗任意處直接載入
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && /\.(sty|prs|bsp|sst|mid)$/i.test(file.name)) {
        this.loadStyFile(file);
      }
    });

    // 快捷跳轉至新增聲部操作區
    document.getElementById('btn-quick-add-track-nav')?.addEventListener('click', () => {
      this.scrollToAddChannelPanel();
    });

    // 視覺化混音台開關按鈕
    const btnToggleMixer = document.getElementById('btn-toggle-mixer');
    btnToggleMixer?.addEventListener('click', () => {
      if (this.mixerPanel) {
        const isVis = this.mixerPanel.toggle();
        if (isVis) {
          document.getElementById('mixer-panel-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.setStatus('🎛️ 混音台已開啟：可直接推動直立推桿調整各聲部音量與立體聲聲相');
        } else {
          this.setStatus('混音台已收合。');
        }
      }
    });

    // 動態新增伴奏聲部按鈕 (Chord 2, Pad, Phrase 1, Phrase 2)
    document.getElementById('btn-add-ch-chord2')?.addEventListener('click', () => {
      this.addDynamicTrack('Chord2');
    });
    document.getElementById('btn-add-ch-pad')?.addEventListener('click', () => {
      this.addDynamicTrack('Pad');
    });
    document.getElementById('btn-add-ch-phrase1')?.addEventListener('click', () => {
      this.addDynamicTrack('Phrase1');
    });
    document.getElementById('btn-add-ch-phrase2')?.addEventListener('click', () => {
      this.addDynamicTrack('Phrase2');
    });

    // 原廠音色資料庫搜尋彈窗事件
    const btnCloseVoiceSearch = document.getElementById('btn-close-voice-search');
    btnCloseVoiceSearch?.addEventListener('click', () => {
      this.closeVoiceSearchModal();
    });

    const modalVoiceSearch = document.getElementById('modal-voice-search');
    modalVoiceSearch?.addEventListener('click', (e) => {
      if (e.target === modalVoiceSearch) {
        this.closeVoiceSearchModal();
      }
    });

    const inputVoiceKeyword = document.getElementById('input-voice-search-keyword');
    inputVoiceKeyword?.addEventListener('input', () => {
      this.renderVoiceSearchResults();
    });

    const selectVoiceCategory = document.getElementById('select-voice-search-category');
    selectVoiceCategory?.addEventListener('change', () => {
      this.renderVoiceSearchResults();
    });
  }

  public setMode(mode: CreatorMode) {
    if (this.state.isPlaying) this.stop();
    this.saveCurrentSectionToStore();

    this.state.mode = mode;

    const btnSty = document.getElementById('btn-mode-sty');
    const btnPad = document.getElementById('btn-mode-pad');
    const btnExport = document.getElementById('btn-export-file');

    if (mode === 'STY') {
      btnSty?.classList.add('active');
      btnPad?.classList.remove('active');
      if (btnExport) btnExport.textContent = '🚀 匯出為 .STY';
      this.state.currentSection = 'Main A';
    } else {
      btnPad?.classList.add('active');
      btnSty?.classList.remove('active');
      if (btnExport) btnExport.textContent = '🚀 匯出為 .PAD';
      this.state.currentSection = 'Pad 1';
    }

    this.refreshSectionOptions();
    this.switchSection(this.state.currentSection);
    this.setStatus(`已切換為【${mode === 'STY' ? 'STY 伴奏風格製作' : 'PAD 多功能打擊板插音製作'}】模式`);
  }

  public toggleSoloPlay(track: string) {
    if (this.state.isPlaying && this.state.activePlayTrack === track) {
      this.pause();
    } else {
      this.play(track);
    }
  }

  private togglePlay() {
    if (this.state.isPlaying && this.state.activePlayTrack === 'all') {
      this.pause();
    } else {
      this.play('all');
    }
  }

  private play(track: string = 'all') {
    this.stopChainedAudition();
    this.stopSoloAudition();
    this.state.isPlaying = true;
    this.state.activePlayTrack = track;
    this.updatePlayButtonsUI();

    const midiMsg = this.state.isMidiConnected ? ' (琴端同步發聲中)' : '';
    let trackName = '全曲聲部';
    if (track === 'drum') trackName = '鼓組 (Solo)';
    else if (track === 'bass') trackName = '貝斯 (Solo)';
    else if (track === 'chord') trackName = '和弦 1 (Solo)';
    else if (this.dynamicTracks.has(track)) {
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[track];
      trackName = `${cfg?.title || track} (Solo)`;
    }

    this.setStatus(`▶ 正在播放【${this.state.currentSection}】${trackName} (${this.state.bpm} BPM)${midiMsg}...`);
    this.startPlaybackTimer();
  }

  private pause() {
    this.stopChainedAudition();
    this.stopSoloAudition();
    this.state.isPlaying = false;
    this.stopPlaybackTimer();
    if (this.state.isMidiConnected) {
      midiManager.panicAllChannels();
    }
    this.updatePlayButtonsUI();
    this.setStatus('已暫停。再次點擊【播放】從暫停點繼續。');
  }

  private stop() {
    this.stopChainedAudition();
    this.stopSoloAudition();
    this.state.isPlaying = false;
    this.state.activePlayTrack = null;
    this.stopPlaybackTimer();
    this.currentPlayStep = 0;
    this.drumGrid?.setPlayheadStep(null);
    this.bassRoll?.setPlayheadStep(null);
    this.chordRoll?.setPlayheadStep(null);
    this.dynamicTracks.forEach(t => t.roll.setPlayheadStep(null));
    this.mixerPanel?.clearAllVuMeters();
    if (this.state.isMidiConnected) {
      midiManager.panicAllChannels();
    }
    this.updatePlayButtonsUI();
    this.setStatus('⏹ 已停止。回到第 1 小節起點。');
  }

  private updatePlayButtonsUI() {
    const isPlaying = this.state.isPlaying;
    const track = this.state.activePlayTrack;

    // 頂部全部播放按鈕
    const btnPlay = document.getElementById('btn-play-toggle');
    if (btnPlay) {
      if (isPlaying && track === 'all') {
        btnPlay.innerHTML = '<span>⏸</span> 暫停全部';
        btnPlay.style.background = '#f59e0b';
      } else {
        btnPlay.innerHTML = '<span>▶</span> 全部播放';
        btnPlay.style.background = 'var(--accent-green)';
      }
    }

    // 軌道獨立播放按鈕狀態
    this.drumGrid?.setSoloPlayState(isPlaying && track === 'drum');
    this.bassRoll?.setSoloPlayState(isPlaying && track === 'bass');
    this.chordRoll?.setSoloPlayState(isPlaying && track === 'chord');
    this.dynamicTracks.forEach((t, partId) => {
      t.roll.setSoloPlayState(isPlaying && track === partId);
    });

    // 混音台全曲與各聲部試聽按鈕狀態連動同步
    this.mixerPanel?.setPlayAllState(isPlaying && track === 'all');
    this.mixerPanel?.setTrackPlaying('rhythm1', isPlaying && track === 'rhythm1');
    this.mixerPanel?.setTrackPlaying('drum', isPlaying && track === 'drum');
    this.mixerPanel?.setTrackPlaying('bass', isPlaying && track === 'bass');
    this.mixerPanel?.setTrackPlaying('chord', isPlaying && track === 'chord');
    this.dynamicTracks.forEach((_, partId) => {
      this.mixerPanel?.setTrackPlaying(partId, isPlaying && track === partId);
    });
  }

  private getStepIntervalMs(): number {
    const stepsPerBeat = this.drumGrid?.getStepsPerBeat() || 4;
    return (60 / this.state.bpm / stepsPerBeat) * 1000;
  }

  /**
   * 核心發聲排程引擎：依據步進點發送具備真實力度 (Velocity)、發音時值 (Duration)、
   * 掃弦微時差 (Strumming Offset) 與連續表情控制 (CC 11 / Pitch Bend) 之音符。
   * 支援 Lookahead 雙時鐘預排引擎 (when: Web Audio 精確硬體時間戳，midiTimestamp: Web MIDI 高精確度驅動排程)。
   */
  private playAuditionStep(currentStep: number, stepIntervalMs: number, targetSecName?: string, when?: number, midiTimestamp?: number) {
    const secName = targetSecName || this.state.currentSection;
    const store = this.sections.get(secName);

    const playTrack = this.state.activePlayTrack;
    const playRhythm1 = playTrack === 'all' || playTrack === 'rhythm1';
    const playDrum = playTrack === 'all' || playTrack === 'drum';
    const playBass = playTrack === 'all' || playTrack === 'bass';
    const playChord = playTrack === 'all' || playTrack === 'chord';

    // 只有在非預排模式 (例如手動步進/單擊試聽) 時才在此處立即更新 DOM 游標；
    // 在 Lookahead 播放模式下，DOM 游標由獨立的 requestAnimationFrame 迴圈跟隨實體發聲時脈精確更新。
    if (when === undefined) {
      this.drumGrid?.setPlayheadStep((playDrum || playRhythm1) ? currentStep : null);
      this.bassRoll?.setPlayheadStep(playBass ? currentStep : null);
      this.chordRoll?.setPlayheadStep(playChord ? currentStep : null);
    }

    // 1. 即時推送該步進的連續控制器事件 (CC 11 Expression, CC 1 Mod, CC 64 Sustain 等)
    if (this.state.isMidiConnected && store?.ccEvents) {
      for (const cc of store.ccEvents) {
        if (cc.step === currentStep) {
          const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : cc.channel;
          midiManager.sendControlChange(ch, cc.controller, cc.value, midiTimestamp);
        }
      }
    }

    // 2. 即時推送該步進的滑音輪事件 (Pitch Bend)
    if (this.state.isMidiConnected && store?.pitchBendEvents) {
      for (const pb of store.pitchBendEvents) {
        if (pb.step === currentStep) {
          const ch = this.state.midiRoutingMode === 'direct_ch1' ? 0 : pb.channel;
          midiManager.sendPitchBend(ch, pb.value, midiTimestamp);
        }
      }
    }

    // 3. 動態伴奏音軌 (Chord 2, Pad, Phrase 1, Phrase 2)
    this.dynamicTracks.forEach((t, partId) => {
      const playThis = playTrack === 'all' || playTrack === partId;
      if (when === undefined) {
        t.roll.setPlayheadStep(playThis ? currentStep : null);
      }
      if (playThis) {
        const notes = t.roll.getActiveNotesAtStep(currentStep);
        for (const note of notes) {
          const meta = store?.dynamicMeta?.[partId]?.get(`${note}_${currentStep}`);
          const vel = meta?.velocity ?? 90;
          const dur = meta?.durationMs ?? Math.max(120, Math.round(stepIntervalMs * 1.5));
          const offset = meta?.offsetMs ?? 0;
          const srcCh = meta?.sourceChannel;

          if (when !== undefined) {
            const noteWhen = when + (offset / 1000);
            const noteMidiTime = midiTimestamp !== undefined ? midiTimestamp + offset : undefined;
            t.roll.getSynth().playNote(note, vel, dur, noteWhen);
            this.sendMidiDynamicTrackTrigger(partId, note, vel, dur, srcCh, noteMidiTime);
          } else {
            if (offset > 0) {
              setTimeout(() => {
                if (this.state.isPlaying) {
                  t.roll.getSynth().playNote(note, vel, dur);
                  this.sendMidiDynamicTrackTrigger(partId, note, vel, dur, srcCh);
                }
              }, offset);
            } else {
              t.roll.getSynth().playNote(note, vel, dur);
              this.sendMidiDynamicTrackTrigger(partId, note, vel, dur, srcCh);
            }
          }
        }
      }
    });

    // 4. 鼓組 (區分 Ch 8 Rhythm 1 打擊樂與 Ch 9 Rhythm 2 主爵士鼓)
    if (playDrum || playRhythm1) {
      const drumNotes = this.drumGrid?.getActiveNotesAtStep(currentStep) || [];
      for (const note of drumNotes) {
        const meta = store?.drumMeta?.get(`${note}_${currentStep}`);
        const vel = meta?.velocity ?? 100;
        const dur = meta?.durationMs ?? Math.max(30, Math.round(stepIntervalMs * 0.8));
        const sourceCh = meta?.sourceChannel ?? 9;
        const isR1 = sourceCh === 8 || sourceCh === 0;

        if (isR1 && playRhythm1) {
          this.triggerDrumSound(note, vel, dur, sourceCh, when, midiTimestamp);
        } else if (!isR1 && playDrum) {
          this.triggerDrumSound(note, vel, dur, sourceCh, when, midiTimestamp);
        }
      }
    }

    // 5. 貝斯
    if (playBass) {
      const bassNotes = this.bassRoll?.getActiveNotesAtStep(currentStep) || [];
      for (const note of bassNotes) {
        const meta = store?.bassMeta?.get(currentStep);
        const vel = meta?.velocity ?? 100;
        const dur = meta?.durationMs ?? Math.max(80, Math.round(stepIntervalMs * 1.5));
        const srcCh = meta?.sourceChannel;
        this.triggerBassSound(note, vel, dur, srcCh, when, midiTimestamp);
      }
    }

    // 6. 和弦 1
    if (playChord) {
      const chordNotes = this.chordRoll?.getActiveNotesAtStep(currentStep) || [];
      for (const note of chordNotes) {
        const meta = store?.chordMeta?.get(`${note}_${currentStep}`);
        const vel = meta?.velocity ?? 95;
        const dur = meta?.durationMs ?? Math.max(120, Math.round(stepIntervalMs * 1.5));
        const offset = meta?.offsetMs ?? 0;
        const srcCh = meta?.sourceChannel;

        if (when !== undefined) {
          const noteWhen = when + (offset / 1000);
          const noteMidiTime = midiTimestamp !== undefined ? midiTimestamp + offset : undefined;
          this.triggerChordSound(note, vel, dur, srcCh, noteWhen, noteMidiTime);
        } else {
          if (offset > 0) {
            setTimeout(() => {
              if (this.state.isPlaying) {
                this.triggerChordSound(note, vel, dur, srcCh);
              }
            }, offset);
          } else {
            this.triggerChordSound(note, vel, dur, srcCh);
          }
        }
      }
    }
  }

  private startPlaybackTimer() {
    this.stopPlaybackTimer();
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const stepsPerBeat = this.drumGrid?.getStepsPerBeat() || 4;
    const stepDurationSec = 60 / this.state.bpm / stepsPerBeat;
    const stepIntervalMs = stepDurationSec * 1000;

    // 起始預排音訊時間 (給予 40ms 極小安全緩衝，確保首拍不吃音)
    const startTime = (ctx ? ctx.currentTime : 0) + 0.04;
    this.nextStepAudioTime = startTime;
    this.visualQueue = [];

    const lookaheadIntervalMs = 25; // 25ms 輕量週期定時器檢查
    const lookaheadWindowSec = 0.1;  // 100ms 預排發聲視窗

    const schedulerTick = () => {
      if (!this.state.isPlaying) return;
      const currentCtx = getSharedAudioContext();
      if (!currentCtx) return;

      const stepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
      const totalSteps = this.state.totalBars * stepsPerBar;

      // 嚴密防護：防機關槍音符擠壓 (Anti-Bunching Protection)
      // 若瀏覽器分頁切換背景或 JS 主執行緒有延遲，導致排程時間落後實體硬體時間 50ms 以上，
      // 自動向前對齊至硬體時鐘 (當前時間 + 20ms)，徹底防止多拍瞬間連擊機關槍音！
      if (this.nextStepAudioTime < currentCtx.currentTime - 0.05) {
        this.nextStepAudioTime = currentCtx.currentTime + 0.02;
      }

      // Lookahead 預排視窗：只要預排時間落於未來 100ms 之內，精確排程
      while (this.nextStepAudioTime < currentCtx.currentTime + lookaheadWindowSec) {
        const audioTime = this.nextStepAudioTime;
        const deltaMs = Math.max(0, (audioTime - currentCtx.currentTime) * 1000);
        const midiTimestamp = performance.now() + deltaMs;

        this.playAuditionStep(this.currentPlayStep, stepIntervalMs, undefined, audioTime, midiTimestamp);
        this.visualQueue.push({ step: this.currentPlayStep, time: audioTime });

        this.currentPlayStep = (this.currentPlayStep + 1) % totalSteps;
        this.nextStepAudioTime += stepDurationSec;
      }
    };

    schedulerTick();
    this.playbackTimer = setInterval(schedulerTick, lookaheadIntervalMs);

    // 獨立 60fps 視覺游標追蹤迴圈 (與音訊/MIDI 排程解耦，不卡頓、不造成音訊抖動)
    let lastVisualStep: number | null = null;
    const renderVisual = () => {
      if (!this.state.isPlaying) return;
      const currentCtx = getSharedAudioContext();
      const now = currentCtx ? currentCtx.currentTime : 0;

      let currentVisualStep: number | null = null;
      while (this.visualQueue.length > 0 && this.visualQueue[0].time <= now) {
        currentVisualStep = this.visualQueue[0].step;
        this.visualQueue.shift();
      }

      if (currentVisualStep !== null && currentVisualStep !== lastVisualStep) {
        lastVisualStep = currentVisualStep;
        const playTrack = this.state.activePlayTrack;
        const playRhythm1 = playTrack === 'all' || playTrack === 'rhythm1';
        const playDrum = playTrack === 'all' || playTrack === 'drum';
        const playBass = playTrack === 'all' || playTrack === 'bass';
        const playChord = playTrack === 'all' || playTrack === 'chord';

        this.drumGrid?.setPlayheadStep((playDrum || playRhythm1) ? currentVisualStep : null);
        this.bassRoll?.setPlayheadStep(playBass ? currentVisualStep : null);
        this.chordRoll?.setPlayheadStep(playChord ? currentVisualStep : null);
        this.dynamicTracks.forEach((t, partId) => {
          const playThis = playTrack === 'all' || playTrack === partId;
          t.roll.setPlayheadStep(playThis ? currentVisualStep : null);
        });
      }

      this.rafId = requestAnimationFrame(renderVisual);
    };

    this.rafId = requestAnimationFrame(renderVisual);
  }

  private restartPlaybackTimer() {
    if (this.state.isPlaying) {
      this.startPlaybackTimer();
    }
  }

  private stopPlaybackTimer() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.visualQueue = [];
  }

  /**
   * 匯出 STY / PAD 檔案
   */
  private exportFile() {
    this.saveCurrentSectionToStore();

    // 統計當前哪些段落包含音符
    const editedSections: SectionStore[] = [];
    this.sections.forEach(s => {
      let hasDrum = false;
      s.drumPattern.forEach(arr => {
        if (arr.some(b => b)) hasDrum = true;
      });
      const hasBass = s.bassPattern.size > 0;
      let hasChord = false;
      if (s.chordPattern) {
        for (const set of s.chordPattern.values()) {
          if (set && set.size > 0) {
            hasChord = true;
            break;
          }
        }
      }
      if (hasDrum || hasBass || hasChord) {
        editedSections.push(s);
      }
    });

    if (editedSections.length === 0) {
      alert('所有段落目前皆為空白！請先在網格上安排鼓點、貝斯或和弦，再進行匯出。');
      return;
    }

    try {
      this.setStatus('⏳ 正在生成 Yamaha 二進位檔案...');
      const timeSig = this.drumGrid?.getTimeSignatureObject() ?? { numerator: 4, denominator: 4 };
      const chosenKit = this.state.selectedDrumKit;
      const chosenBass = this.state.selectedBassVoice;
      const chosenChord = this.state.selectedChordVoice;

      let binaryBytes: Uint8Array;
      const defaultFilename = this.state.mode === 'STY'
        ? (this.loadedStyleFileName ? this.loadedStyleFileName.replace(/\.(sty|prs|bsp|sst|mid)$/i, '') + '_modified.sty' : `SX920_${chosenKit.id}.sty`)
        : `SX920_${chosenKit.id}.pad`;
      const promptName = prompt('請輸入要匯出的檔案名稱：', defaultFilename);
      if (!promptName) {
        this.setStatus('已取消匯出。');
        return;
      }

      const ext = this.state.mode === 'STY' ? '.sty' : '.pad';
      const finalFilename = promptName.toLowerCase().endsWith(ext) ? promptName : `${promptName}${ext}`;

      if (this.state.mode === 'STY') {
        // 動態伴奏音軌之音色配置
        const dynamicVoices: Record<string, { msb: number; lsb: number; pc: number }> = {};
        this.dynamicTracks.forEach((t, partId) => {
          dynamicVoices[partId] = {
            msb: t.selectedVoice.msb,
            lsb: t.selectedVoice.lsb,
            pc: t.selectedVoice.pc,
          };
        });

        // 整理所有段落之樂音與 Pattern 輸入
        const currentStepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
        const sectionsInput: TemplateSectionInput[] = [];
        this.sections.forEach((store, name) => {
          let curDrum = store.drumPattern;
          let curBass = store.bassPattern;
          let curChord = store.chordPattern;

          // 雙重防護：全新從零創作時，若 Intro 或 Ending 在匯出時為空白（0音符），自動填充智慧範本，避免實體琴輸出死寂空音
          if (!this.loadedBaseStyleBytes) {
            if (name.startsWith('Intro') && !this.checkSectionHasNotes(name)) {
              let autoIntro;
              if (name === 'Intro B') {
                autoIntro = SectionPresetsEngine.generateIntroCountIn(store.bars || 4, currentStepsPerBar);
              } else if (name === 'Intro C') {
                autoIntro = SectionPresetsEngine.generateIntroHarmonic(store.bars || 8, currentStepsPerBar);
              } else {
                autoIntro = SectionPresetsEngine.generateIntroHarmonic(store.bars || 4, currentStepsPerBar);
              }
              curDrum = autoIntro.drumPattern;
              curBass = autoIntro.bassPattern;
              curChord = autoIntro.chordPattern;
              store.drumPattern = curDrum;
              store.bassPattern = curBass;
              store.chordPattern = curChord;
            } else if (name.startsWith('Ending') && !this.checkSectionHasNotes(name)) {
              let autoEnding;
              if (name === 'Ending B') {
                autoEnding = SectionPresetsEngine.generateEndingClimax(store.bars || 4, currentStepsPerBar);
              } else if (name === 'Ending C') {
                autoEnding = SectionPresetsEngine.generateEndingSoft(store.bars || 4, currentStepsPerBar);
              } else {
                autoEnding = SectionPresetsEngine.generateEndingPunch(store.bars || 2, currentStepsPerBar);
              }
              curDrum = autoEnding.drumPattern;
              curBass = autoEnding.bassPattern;
              curChord = autoEnding.chordPattern;
              store.drumPattern = curDrum;
              store.bassPattern = curBass;
              store.chordPattern = curChord;
            } else if (name === 'Break' && !this.checkSectionHasNotes(name)) {
              const autoBreak = SectionPresetsEngine.generateBreakPattern(store.bars || 1, currentStepsPerBar);
              curDrum = autoBreak.drumPattern;
              curBass = autoBreak.bassPattern;
              curChord = autoBreak.chordPattern;
              store.drumPattern = curDrum;
              store.bassPattern = curBass;
              store.chordPattern = curChord;
            }
          }

          sectionsInput.push({
            name,
            bars: store.bars,
            stepsPerBar: currentStepsPerBar,
            drumPattern: curDrum,
            bassPattern: curBass,
            chordPattern: curChord,
            dynamicPatterns: store.dynamicPatterns,
            drumMeta: store.drumMeta,
            bassMeta: store.bassMeta,
            chordMeta: store.chordMeta,
            dynamicMeta: store.dynamicMeta,
            ccEvents: store.ccEvents,
            pitchBendEvents: store.pitchBendEvents,
          });
        });

        // 收集各動態伴奏聲部之當前混音音量、聲相與效果器
        const dynamicMixer: Record<string, { volume: number; pan: number; reverb: number; chorus: number }> = {};
        this.dynamicTracks.forEach((t, partId) => {
          const s = t.roll.getSynth();
          dynamicMixer[partId] = {
            volume: s.getVolume(),
            pan: s.getPan(),
            reverb: s.getReverb(),
            chorus: s.getChorus(),
          };
        });

        // 採用經過實體 Yamaha PSR-SX920 驗證通過的黃金範本進行合成，確保原廠格式 100% 完整相容
        binaryBytes = YamahaTemplateStyleSynthesizer.synthesizeFromTemplate({
          baseTemplateBytes: this.loadedBaseStyleBytes ?? undefined,
          styleName: finalFilename.replace(/\.sty$/i, ''),
          bpm: this.state.bpm,
          timeSignature: timeSig,
          stepsPerBar: currentStepsPerBar,
          drumKit: {
            msb: chosenKit.msb,
            lsb: chosenKit.lsb,
            pc: chosenKit.pc,
          },
          bassVoice: {
            msb: chosenBass.msb,
            lsb: chosenBass.lsb,
            pc: chosenBass.pc,
          },
          chordVoice: {
            msb: chosenChord.msb,
            lsb: chosenChord.lsb,
            pc: chosenChord.pc,
          },
          dynamicVoices,
          sections: sectionsInput,
          mixer: {
            drum: { volume: drumSynth.getVolume(), pan: drumSynth.getPan(), reverb: drumSynth.getReverb(), chorus: drumSynth.getChorus() },
            bass: { volume: bassSynth.getVolume(), pan: bassSynth.getPan(), reverb: bassSynth.getReverb(), chorus: bassSynth.getChorus() },
            chord: { volume: chordSynth.getVolume(), pan: chordSynth.getPan(), reverb: chordSynth.getReverb(), chorus: chordSynth.getChorus() },
            dynamicTracks: dynamicMixer,
          },
        });
      } else {
        // --- 匯出 PAD 多功能打擊板 ---
        const division = 96;
        const ticksPerBar = Math.round(division * timeSig.numerator * (4 / timeSig.denominator));
        const drumEvents = this.drumGrid?.getMidiEvents(ticksPerBar) || [];
        const bassEvents = this.bassRoll?.getMidiEvents(ticksPerBar) || [];
        const chordEvents = this.chordRoll?.getMidiEvents(ticksPerBar) || [];

        const padProject = YamahaPadSynthesizer.createBlankProject({
          projectName: finalFilename.replace(/\.pad$/i, ''),
          bpm: this.state.bpm,
          timeSignature: timeSig,
          division,
          bars: this.state.totalBars,
          pads: [
            {
              name: 'Pad 1 (Drums)',
              icon: 'S815',
              repeat: false,
              chordMatch: false,
              msb: chosenKit.msb,
              lsb: chosenKit.lsb,
              pc: chosenKit.pc,
            },
            {
              name: 'Pad 2 (Bass)',
              icon: 'S813',
              repeat: false,
              chordMatch: true,
              msb: chosenBass.msb,
              lsb: chosenBass.lsb,
              pc: chosenBass.pc,
            },
            {
              name: 'Pad 3 (Chord)',
              icon: 'S809',
              repeat: false,
              chordMatch: true,
              msb: chosenChord.msb,
              lsb: chosenChord.lsb,
              pc: chosenChord.pc,
            },
          ],
        });

        for (const ev of drumEvents) {
          YamahaPadModifier.addNoteEvent(padProject, 1, {
            note: ev.note,
            startTick: ev.startTick,
            durationTick: ev.durationTick,
            velocity: ev.velocity,
          });
        }

        for (const ev of bassEvents) {
          YamahaPadModifier.addNoteEvent(padProject, 2, {
            note: ev.note,
            startTick: ev.startTick,
            durationTick: ev.durationTick,
            velocity: ev.velocity,
          });
        }

        for (const ev of chordEvents) {
          YamahaPadModifier.addNoteEvent(padProject, 3, {
            note: ev.note,
            startTick: ev.startTick,
            durationTick: ev.durationTick,
            velocity: ev.velocity,
          });
        }

        const validation = YamahaWriter.validateAndWrite(padProject);
        binaryBytes = validation.bytes;
      }

      // 觸發瀏覽器下載
      const blob = new Blob([binaryBytes as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const sizeKb = (binaryBytes.length / 1024).toFixed(1);
      const secCount = this.state.mode === 'STY' ? editedSections.length : 1;
      const partCount = 3 + this.dynamicTracks.size;
      const partNames = ['鼓組', '貝斯', '和弦 1', ...Array.from(this.dynamicTracks.values()).map(t => AVAILABLE_CHORD_TRACK_CONFIGS[t.partId]?.title || t.partId)];
      this.setStatus(`✓ 已成功匯出 [${finalFilename}] (${sizeKb} KB，包含 ${secCount} 個段落、${partCount} 個伴奏聲部)！請拷貝至隨身碟插琴驗收。`);
      alert(`🎉 恭喜！檔案 [${finalFilename}] 匯出成功！\n\n- 格式: Yamaha ${this.state.mode === 'STY' ? 'SFF2 伴奏風格 (.STY)' : 'Multi Pad (.PAD)'}\n- 伴奏段落: 已寫入 ${secCount} 個段落\n- 伴奏聲部: 啟用 ${partCount} 軌 (${partNames.join(', ')})\n- 套用鼓組: ${chosenKit.name}\n- 套用貝斯: ${chosenBass.name}\n- 套用和弦: ${chosenChord.name}\n- 檔案大小: ${sizeKb} KB\n- 驗收指引: 請將此檔案複製到隨身碟，插上 PSR-SX920 面板直接按 Start/Stop 試聽！`);
    } catch (err: any) {
      console.error('匯出失敗:', err);
      alert(`❌ 匯出失敗: ${err.message}`);
      this.setStatus(`匯出失敗: ${err.message}`);
    }
  }

  /**
   * 載入使用者上傳的 Yamaha .STY 伴奏風格檔案
   */
  public async loadStyFile(file: File): Promise<void> {
    try {
      this.setStatus(`⏳ 正在讀取並解析伴奏檔案【${file.name}】...`);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const result = StyLoader.loadFromBytes(bytes, file.name);

      // 若正在播放，先停止
      if (this.state.isPlaying) {
        this.stop();
      }

      // 確保處於 STY 模式
      if (this.state.mode !== 'STY') {
        this.setMode('STY');
      }

      // 1. 記憶原始檔案資訊
      this.loadedBaseStyleBytes = bytes;
      this.loadedStyleFileName = file.name;

      // 2. 清理先前開啟的動態伴奏音軌
      const existingPartIds = Array.from(this.dynamicTracks.keys());
      for (const partId of existingPartIds) {
        const track = this.dynamicTracks.get(partId);
        track?.container.remove();
        this.dynamicTracks.delete(partId);
        this.mutedChannels.delete(partId);
        this.soloChannels.delete(partId);
      }

      // 3. 設定 BPM
      this.state.bpm = result.bpm;
      const inputBpm = document.getElementById('input-bpm') as HTMLInputElement | null;
      if (inputBpm) {
        inputBpm.value = result.bpm.toString();
      }

      // 4. 設定拍號
      let targetSig: import('./drum-step-grid').TimeSignatureType = '4/4';
      if (result.timeSignature.numerator === 3 && result.timeSignature.denominator === 4) {
        targetSig = '3/4';
      } else if (result.timeSignature.numerator === 6 && result.timeSignature.denominator === 8) {
        targetSig = '6/8';
      }
      this.drumGrid?.setTimeSignature(targetSig);
      this.onGlobalTimeSignatureChange(targetSig);

      // 5. 設定鼓組音色 (主鼓組 Ch 10 與 副鼓組 Ch 9)
      this.state.selectedDrumKit = result.drumKit;
      this.drumGrid?.setSelectedDrumKit(result.drumKit.id);
      this.syncDrumKitToKeyboard();
      this.mixerPanel?.updateVoiceName('drum', result.drumKit.name);

      if (result.rhythm1Kit) {
        this.state.selectedRhythm1Kit = result.rhythm1Kit;
        this.mixerPanel?.updateVoiceName('rhythm1', result.rhythm1Kit.name);
        if (this.state.isMidiConnected) {
          midiManager.sendVoiceChange(8, {
            msb: result.rhythm1Kit.msb,
            lsb: result.rhythm1Kit.lsb,
            pc: result.rhythm1Kit.pc,
          });
          // 同步鏡像至 SFF1 打擊樂通道 (Ch 0 / MIDI Ch 1)
          midiManager.sendVoiceChange(0, {
            msb: result.rhythm1Kit.msb,
            lsb: result.rhythm1Kit.lsb,
            pc: result.rhythm1Kit.pc,
          });
        }
      }

      // 6. 設定貝斯音色
      this.state.selectedBassVoice = result.bassVoice;
      this.bassRoll?.setVoice(result.bassVoice);
      bassSynth.setVoice(result.bassVoice);
      this.syncBassVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('bass', result.bassVoice.name);

      // 7. 設定和弦 1 音色
      this.state.selectedChordVoice = result.chordVoice;
      this.chordRoll?.setVoice(result.chordVoice);
      chordSynth.setVoice(result.chordVoice);
      this.syncChordVoiceToKeyboard();
      this.mixerPanel?.updateVoiceName('chord', result.chordVoice.name);

      // 8. 動態新增伴奏音軌 (Chord 2, Pad, Phrase 1, Phrase 2)
      for (const partId of result.activeDynamicPartIds) {
        this.addDynamicTrack(partId);
        const dynVoice = result.dynamicVoices[partId];
        if (dynVoice) {
          const dynTrack = this.dynamicTracks.get(partId);
          if (dynTrack) {
            dynTrack.selectedVoice = dynVoice;
            dynTrack.roll.setVoice(dynVoice);
            this.mixerPanel?.updateVoiceName(partId, dynVoice.name);
          }
          if (this.state.isMidiConnected) {
            const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
            if (cfg) {
              midiManager.sendVoiceChange(cfg.channel, {
                msb: dynVoice.msb,
                lsb: dynVoice.lsb,
                pc: dynVoice.pc,
              });
              // 同步鏡像至 SFF1 通道 (例如 12 -> 3, 13 -> 4, 14 -> 5, 15 -> 6)
              const sff1Mirror = cfg.channel - 9;
              if (sff1Mirror >= 0 && sff1Mirror <= 7) {
                midiManager.sendVoiceChange(sff1Mirror, {
                  msb: dynVoice.msb,
                  lsb: dynVoice.lsb,
                  pc: dynVoice.pc,
                });
              }
            }
          }
        }
      }

      // 9. 更新混音台音量、聲相與效果器
      if (result.mixer) {
        for (const [partId, mix] of Object.entries(result.mixer)) {
          if (partId === 'rhythm1') {
            this.rhythm1Mixer.volume = mix.volume;
            this.rhythm1Mixer.pan = mix.pan;
            this.rhythm1Mixer.reverb = mix.reverb;
            this.rhythm1Mixer.chorus = mix.chorus;
            this.mixerPanel?.updateVolume('rhythm1', mix.volume);
            this.mixerPanel?.updatePan('rhythm1', mix.pan);
            this.mixerPanel?.updateReverb('rhythm1', mix.reverb);
            this.mixerPanel?.updateChorus('rhythm1', mix.chorus);
          } else if (partId === 'drum') {
            drumSynth.setVolume(mix.volume);
            drumSynth.setPan(mix.pan);
            drumSynth.setReverb(mix.reverb);
            drumSynth.setChorus(mix.chorus);
            this.mixerPanel?.updateVolume('drum', mix.volume);
            this.mixerPanel?.updatePan('drum', mix.pan);
            this.mixerPanel?.updateReverb('drum', mix.reverb);
            this.mixerPanel?.updateChorus('drum', mix.chorus);
          } else if (partId === 'bass') {
            bassSynth.setVolume(mix.volume);
            bassSynth.setPan(mix.pan);
            bassSynth.setReverb(mix.reverb);
            bassSynth.setChorus(mix.chorus);
            this.mixerPanel?.updateVolume('bass', mix.volume);
            this.mixerPanel?.updatePan('bass', mix.pan);
            this.mixerPanel?.updateReverb('bass', mix.reverb);
            this.mixerPanel?.updateChorus('bass', mix.chorus);
          } else if (partId === 'chord') {
            chordSynth.setVolume(mix.volume);
            chordSynth.setPan(mix.pan);
            chordSynth.setReverb(mix.reverb);
            chordSynth.setChorus(mix.chorus);
            this.mixerPanel?.updateVolume('chord', mix.volume);
            this.mixerPanel?.updatePan('chord', mix.pan);
            this.mixerPanel?.updateReverb('chord', mix.reverb);
            this.mixerPanel?.updateChorus('chord', mix.chorus);
          } else {
            if (this.dynamicMixerDefaults[partId]) {
              this.dynamicMixerDefaults[partId].volume = mix.volume;
              this.dynamicMixerDefaults[partId].pan = mix.pan;
              this.dynamicMixerDefaults[partId].reverb = mix.reverb;
              this.dynamicMixerDefaults[partId].chorus = mix.chorus;
            }
            const dynTrack = this.dynamicTracks.get(partId as any);
            if (dynTrack) {
              const s = dynTrack.roll.getSynth();
              s.setVolume(mix.volume);
              s.setPan(mix.pan);
              s.setReverb(mix.reverb);
              s.setChorus(mix.chorus);
            }
            this.mixerPanel?.updateVolume(partId, mix.volume);
            this.mixerPanel?.updatePan(partId, mix.pan);
            this.mixerPanel?.updateReverb(partId, mix.reverb);
            this.mixerPanel?.updateChorus(partId, mix.chorus);
          }
        }
      }

      // 10. 寫入段落記憶庫
      this.sections = result.sections;

      // 12. 決定優先開啟的段落 (優先 Main A, 若無則選第一個)
      const targetSec = result.sections.has('Main A')
        ? 'Main A'
        : (result.sections.keys().next().value || 'Main A');

      // 更新選單與畫面 (forceReload = true 避免把空畫面回寫到新資料)
      this.refreshSectionOptions();
      this.switchSection(targetSec, false, true);

      // 13. 更新載入按鈕標籤提示
      const btnLoad = document.getElementById('btn-load-sty-file');
      if (btnLoad) {
        const shortName = file.name.length > 18 ? file.name.slice(0, 15) + '...' : file.name;
        btnLoad.innerHTML = `<span>📂</span> ${shortName}`;
        btnLoad.title = `已載入【${file.name}】\n點擊可更換載入其他伴奏檔。\n${result.summary}`;
      }

      this.setStatus(`🎉 成功載入伴奏風格【${file.name}】！${result.summary}`);
      alert(`🎉 成功載入 Yamaha 伴奏檔！\n\n- 檔案名稱: ${file.name}\n- 伴奏段落: 載入 ${result.sections.size} 個段落 (${Array.from(result.sections.keys()).join(', ')})\n- 拍速與拍號: ${result.bpm} BPM / ${result.timeSignature.numerator}/${result.timeSignature.denominator}\n- 鼓組: ${result.drumKit.name}\n- 貝斯: ${result.bassVoice.name}\n- 和弦: ${result.chordVoice.name}\n- 動態聲部: ${result.activeDynamicPartIds.length > 0 ? result.activeDynamicPartIds.join(', ') : '無'}\n\n您現在可直接在網格上修改音符、切換段落、調整混音，完成後點擊「匯出為 .STY」！`);
    } catch (err: any) {
      console.error('載入 STY 失敗:', err);
      alert(`❌ 載入 STY 失敗：${err?.message || err}`);
      this.setStatus(`❌ 載入 STY 失敗: ${err?.message || err}`);
    }
  }

  private updateSectionSummary() {
    const summaryEl = document.getElementById('label-sections-summary');
    if (!summaryEl) return;

    const names: string[] = [];
    const presets = this.state.mode === 'STY' ? STY_SECTION_PRESETS : PAD_SECTION_PRESETS;
    for (const p of presets) {
      if (this.checkSectionHasNotes(p.id)) {
        names.push(p.id);
      }
    }

    if (names.length === 0) {
      summaryEl.textContent = '💡 包含音符段落：無';
    } else {
      summaryEl.textContent = `💡 已包含音符段落：${names.join(', ')}`;
    }
  }

  public setStatus(msg: string) {
    const el = document.getElementById('status-text');
    if (el) {
      el.textContent = msg;
    }
  }

  /**
   * 計算特定段落中各伴奏軌道是否包含實際音符 (用於混音台亮燈與灰顯狀態即時動態連動)
   */
  public getSectionChannelActivity(sectionName?: string): Record<string, boolean> {
    const secName = sectionName || this.state.currentSection;
    const store = this.sections.get(secName);
    const activity: Record<string, boolean> = {
      rhythm1: false,
      drum: false,
      bass: false,
      chord: false,
      Chord2: false,
      Pad: false,
      Phrase1: false,
      Phrase2: false,
    };

    if (!store) {
      activity.drum = this.drumGrid?.hasNotes() || false;
      activity.bass = this.bassRoll?.hasNotes() || false;
      activity.chord = this.chordRoll?.hasNotes() || false;
      const dynKeys: Array<'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'> = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
      dynKeys.forEach(partId => {
        activity[partId] = this.dynamicTracks.get(partId)?.roll.hasNotes() || false;
      });
      return activity;
    }

    // 1. 鼓組 (區分 Rhythm 1 打擊樂與 Rhythm 2 主鼓組)
    if (store.drumPattern && store.drumPattern.size > 0) {
      let hasR1 = false;
      let hasR2 = false;
      for (const [note, steps] of store.drumPattern.entries()) {
        for (let s = 0; s < steps.length; s++) {
          if (steps[s]) {
            const meta = store.drumMeta?.get(`${note}_${s}`);
            if (meta?.sourceChannel === 8 || meta?.sourceChannel === 0) {
              hasR1 = true;
            } else {
              hasR2 = true;
            }
          }
        }
      }
      activity.rhythm1 = hasR1;
      activity.drum = hasR2 || (!hasR1 && store.drumPattern.size > 0);
    }

    // 2. 貝斯 (Bass)
    if (store.bassPattern && store.bassPattern.size > 0) {
      activity.bass = true;
    }

    // 3. 和弦 1 (Chord 1)
    if (store.chordPattern && store.chordPattern.size > 0) {
      for (const notes of store.chordPattern.values()) {
        if (notes && notes.size > 0) {
          activity.chord = true;
          break;
        }
      }
    }

    // 4. 動態伴奏音軌 (Chord 2, Pad, Phrase 1, Phrase 2)
    const dynPartIds: Array<'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'> = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    for (const partId of dynPartIds) {
      const pat = store.dynamicPatterns?.[partId];
      if (pat && pat.size > 0) {
        for (const notes of pat.values()) {
          if (notes && notes.size > 0) {
            activity[partId] = true;
            break;
          }
        }
      } else if (this.dynamicTracks.has(partId) && secName === this.state.currentSection) {
        activity[partId] = this.dynamicTracks.get(partId)!.roll.hasNotes();
      }
    }

    return activity;
  }

  /**
   * 建立當前伴奏混音台通道條資訊清單 (完整 8 軌伴奏通道條 CH 9 ~ CH 16)
   */
  private buildMixerChannelList(): MixerChannelInfo[] {
    const currentStore = this.sections.get(this.state.currentSection);
    const secVoices = currentStore?.sectionVoices;
    const activity = this.getSectionChannelActivity();

    // 1. 副鼓組 / 打擊樂 (Ch 9 Rhythm 1: SFF2 8 vs SFF1 0)
    let r1VoiceName = this.state.selectedRhythm1Kit?.name || 'Percussion Kit';
    if (secVoices && (secVoices[8] || secVoices[0])) {
      const sv = secVoices[8] || secVoices[0];
      r1VoiceName = resolveExactDrumKit(sv.msb, sv.lsb, sv.pc).name;
    }

    // 2. 主鼓組 (Ch 10 Rhythm 2: SFF2 9 vs SFF1 7)
    let drumVoiceName = this.state.selectedDrumKit.name;
    if (secVoices && (secVoices[9] || secVoices[7])) {
      const sv = secVoices[9] || secVoices[7];
      drumVoiceName = resolveExactDrumKit(sv.msb, sv.lsb, sv.pc).name;
    }

    // 3. 貝斯 (Ch 11 Bass: SFF2 10 vs SFF1 1)
    let bassVoiceName = this.state.selectedBassVoice.name;
    if (secVoices && (secVoices[10] || secVoices[1])) {
      const sv = secVoices[10] || secVoices[1];
      bassVoiceName = resolveExactBassVoice(sv.msb, sv.lsb, sv.pc).name;
    }

    // 4. 和弦 1 (Ch 12 Chord 1: SFF2 11 vs SFF1 2)
    let chordVoiceName = this.state.selectedChordVoice.name;
    if (secVoices && (secVoices[11] || secVoices[2])) {
      const sv = secVoices[11] || secVoices[2];
      chordVoiceName = resolveExactChordVoice(sv.msb, sv.lsb, sv.pc, 'Piano').name;
    }

    const list: MixerChannelInfo[] = [
      {
        id: 'rhythm1',
        name: 'Rhythm 1',
        subName: '打擊樂',
        chNumber: 9,
        midiChannel: 8,
        icon: '🪘',
        color: '#0284c7',
        voiceName: r1VoiceName,
        volume: this.rhythm1Mixer.volume,
        pan: this.rhythm1Mixer.pan,
        reverb: this.rhythm1Mixer.reverb,
        chorus: this.rhythm1Mixer.chorus,
        muted: this.mutedChannels.has('rhythm1'),
        solo: this.soloChannels.has('rhythm1'),
        hasNotesInCurrentSection: activity.rhythm1,
      },
      {
        id: 'drum',
        name: 'Rhythm 2',
        subName: '主鼓組',
        chNumber: 10,
        midiChannel: 9,
        icon: '🥁',
        color: '#38bdf8',
        voiceName: drumVoiceName,
        volume: drumSynth.getVolume(),
        pan: drumSynth.getPan(),
        reverb: drumSynth.getReverb(),
        chorus: drumSynth.getChorus(),
        muted: this.mutedChannels.has('drum'),
        solo: this.soloChannels.has('drum'),
        hasNotesInCurrentSection: activity.drum,
      },
      {
        id: 'bass',
        name: 'Bass',
        subName: '貝斯',
        chNumber: 11,
        midiChannel: 10,
        icon: '🎸',
        color: '#10b981',
        voiceName: bassVoiceName,
        volume: bassSynth.getVolume(),
        pan: bassSynth.getPan(),
        reverb: bassSynth.getReverb(),
        chorus: bassSynth.getChorus(),
        muted: this.mutedChannels.has('bass'),
        solo: this.soloChannels.has('bass'),
        hasNotesInCurrentSection: activity.bass,
      },
      {
        id: 'chord',
        name: 'Chord 1',
        subName: '和弦 1',
        chNumber: 12,
        midiChannel: 11,
        icon: '🎹',
        color: '#a855f7',
        voiceName: chordVoiceName,
        volume: chordSynth.getVolume(),
        pan: chordSynth.getPan(),
        reverb: chordSynth.getReverb(),
        chorus: chordSynth.getChorus(),
        muted: this.mutedChannels.has('chord'),
        solo: this.soloChannels.has('chord'),
        hasNotesInCurrentSection: activity.chord,
      },
    ];

    // 動態伴奏音軌 (Chord 2, Pad, Phrase 1, Phrase 2)
    const dynConfigs: Array<{
      partId: 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2';
      sff2Ch: number;
      sff1Ch: number;
      defCat: string;
      color: string;
      defaultVoiceId: string;
    }> = [
      { partId: 'Chord2', sff2Ch: 12, sff1Ch: 3, defCat: 'Guitar', color: '#f97316', defaultVoiceId: 'steel-guitar' },
      { partId: 'Pad', sff2Ch: 13, sff1Ch: 4, defCat: 'Pad', color: '#06b6d4', defaultVoiceId: 'warm-pad' },
      { partId: 'Phrase1', sff2Ch: 14, sff1Ch: 5, defCat: 'Guitar', color: '#eab308', defaultVoiceId: 'pop-brass' },
      { partId: 'Phrase2', sff2Ch: 15, sff1Ch: 6, defCat: 'Strings', color: '#ec4899', defaultVoiceId: 'tenor-sax' },
    ];

    dynConfigs.forEach(({ partId, sff2Ch, sff1Ch, defCat, color, defaultVoiceId }) => {
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
      const dynTrack = this.dynamicTracks.get(partId);

      // 解析音色名稱 (優先自該段落 sectionVoices，其次 dynTrack，再次預設值)
      let voiceName = dynTrack ? dynTrack.selectedVoice.name : '';
      if (secVoices && (secVoices[sff2Ch] || secVoices[sff1Ch])) {
        const sv = secVoices[sff2Ch] || secVoices[sff1Ch];
        voiceName = resolveExactChordVoice(sv.msb, sv.lsb, sv.pc, defCat).name;
      } else if (!voiceName) {
        const found = YAMAHA_SX920_CHORD_VOICES.find(v => v.id === defaultVoiceId);
        voiceName = found ? found.name : defaultVoiceId;
      }

      // 音量與控制參數
      const synth = dynTrack?.roll.getSynth();
      const defs = this.dynamicMixerDefaults[partId] || { volume: 80, pan: 64, reverb: 50, chorus: 30 };
      const vol = synth ? synth.getVolume() : defs.volume;
      const pan = synth ? synth.getPan() : defs.pan;
      const rev = synth ? synth.getReverb() : defs.reverb;
      const cho = synth ? synth.getChorus() : defs.chorus;

      list.push({
        id: partId,
        name: cfg ? cfg.trackId.toUpperCase() : partId,
        subName: cfg ? cfg.title.replace(/\(.*\)/, '').trim() : partId,
        chNumber: cfg ? cfg.panelCh : (partId === 'Phrase2' ? 16 : 15),
        midiChannel: cfg ? cfg.channel : (partId === 'Phrase2' ? 15 : 14),
        icon: cfg ? cfg.icon : '🎵',
        color,
        voiceName,
        volume: vol,
        pan,
        reverb: rev,
        chorus: cho,
        muted: this.mutedChannels.has(partId),
        solo: this.soloChannels.has(partId),
        hasNotesInCurrentSection: activity[partId],
      });
    });

    return list;
  }

  /**
   * 刷新混音台所有通道條顯示
   */
  public refreshMixerChannels() {
    if (this.mixerPanel) {
      this.mixerPanel.setChannels(this.buildMixerChannelList());
    }
  }

  /**
   * 判斷某聲部在當前 Solo/Mute 狀態下是否實質靜音
   */
  public isChannelEffectiveMuted(id: string): boolean {
    if (this.soloChannels.size > 0) {
      if (!this.soloChannels.has(id)) return true;
      return this.mutedChannels.has(id);
    }
    return this.mutedChannels.has(id);
  }

  /**
   * 套用混音台音訊與 MIDI 發聲狀態至各合成器與琴端
   */
  private applyMixerAudioStates() {
    const r1Muted = this.isChannelEffectiveMuted('rhythm1');
    if (this.state.isMidiConnected) {
      midiManager.sendMixerControllers(8, { volume: r1Muted ? 0 : this.rhythm1Mixer.volume });
      midiManager.sendMixerControllers(0, { volume: r1Muted ? 0 : this.rhythm1Mixer.volume });
    }

    const drumMuted = this.isChannelEffectiveMuted('drum');
    drumSynth.setChannelMuted(drumMuted);
    if (this.state.isMidiConnected) {
      midiManager.sendMixerControllers(9, { volume: drumMuted ? 0 : drumSynth.getVolume() });
    }

    const bassMuted = this.isChannelEffectiveMuted('bass');
    bassSynth.setChannelMuted(bassMuted);
    if (this.state.isMidiConnected) {
      midiManager.sendMixerControllers(10, { volume: bassMuted ? 0 : bassSynth.getVolume() });
    }

    const chordMuted = this.isChannelEffectiveMuted('chord');
    chordSynth.setChannelMuted(chordMuted);
    if (this.state.isMidiConnected) {
      midiManager.sendMixerControllers(11, { volume: chordMuted ? 0 : chordSynth.getVolume() });
    }

    const dynKeys: Array<'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'> = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    dynKeys.forEach(partId => {
      const dynMuted = this.isChannelEffectiveMuted(partId);
      const dynTrack = this.dynamicTracks.get(partId);
      if (dynTrack) {
        dynTrack.roll.getSynth().setChannelMuted(dynMuted);
      }
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
      if (this.state.isMidiConnected && cfg) {
        const curVol = dynTrack ? dynTrack.roll.getSynth().getVolume() : (this.dynamicMixerDefaults[partId]?.volume ?? 80);
        midiManager.sendMixerControllers(cfg.channel, { volume: dynMuted ? 0 : curVol });
      }
    });
  }

  /**
   * 同步所有聲部當前混音推桿 (CC 7)、聲相 (CC 10)、殘響 (CC 91) 與合唱 (CC 93) 至實體琴
   */
  public syncMixerControllersToKeyboard() {
    if (!this.state.isMidiConnected) return;

    // Rhythm 1 (Ch 8 & Ch 0)
    const r1Vol = this.isChannelEffectiveMuted('rhythm1') ? 0 : this.rhythm1Mixer.volume;
    midiManager.sendMixerControllers(8, {
      volume: r1Vol,
      pan: this.rhythm1Mixer.pan,
      reverb: this.rhythm1Mixer.reverb,
      chorus: this.rhythm1Mixer.chorus,
    });
    midiManager.sendMixerControllers(0, {
      volume: r1Vol,
      pan: this.rhythm1Mixer.pan,
      reverb: this.rhythm1Mixer.reverb,
      chorus: this.rhythm1Mixer.chorus,
    });

    // Rhythm 2 (Ch 9)
    const drumVol = this.isChannelEffectiveMuted('drum') ? 0 : drumSynth.getVolume();
    midiManager.sendMixerControllers(9, {
      volume: drumVol,
      pan: drumSynth.getPan(),
      reverb: drumSynth.getReverb(),
      chorus: drumSynth.getChorus(),
    });

    // Bass (Ch 10)
    const bassVol = this.isChannelEffectiveMuted('bass') ? 0 : bassSynth.getVolume();
    midiManager.sendMixerControllers(10, {
      volume: bassVol,
      pan: bassSynth.getPan(),
      reverb: bassSynth.getReverb(),
      chorus: bassSynth.getChorus(),
    });

    // Chord 1 (Ch 11)
    const chordVol = this.isChannelEffectiveMuted('chord') ? 0 : chordSynth.getVolume();
    midiManager.sendMixerControllers(11, {
      volume: chordVol,
      pan: chordSynth.getPan(),
      reverb: chordSynth.getReverb(),
      chorus: chordSynth.getChorus(),
    });

    // 動態聲部 (Ch 12 ~ 15)
    const dynKeys: Array<'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'> = ['Chord2', 'Pad', 'Phrase1', 'Phrase2'];
    dynKeys.forEach(partId => {
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[partId];
      if (cfg) {
        const dynTrack = this.dynamicTracks.get(partId);
        const s = dynTrack?.roll.getSynth();
        const defs = this.dynamicMixerDefaults[partId] || { volume: 80, pan: 64, reverb: 50, chorus: 30 };
        const vol = s ? s.getVolume() : defs.volume;
        const pan = s ? s.getPan() : defs.pan;
        const rev = s ? s.getReverb() : defs.reverb;
        const cho = s ? s.getChorus() : defs.chorus;

        midiManager.sendMixerControllers(cfg.channel, {
          volume: this.isChannelEffectiveMuted(partId) ? 0 : vol,
          pan,
          reverb: rev,
          chorus: cho,
        });
      }
    });
  }

  private onMixerVolumeChange(id: string, vol: number) {
    if (id === 'rhythm1') {
      this.rhythm1Mixer.volume = vol;
      if (this.state.isMidiConnected && !this.isChannelEffectiveMuted('rhythm1')) {
        midiManager.sendMixerControllers(8, { volume: vol });
        midiManager.sendMixerControllers(0, { volume: vol });
      }
    } else if (id === 'drum') {
      drumSynth.setVolume(vol);
      if (this.state.isMidiConnected && !this.isChannelEffectiveMuted('drum')) {
        midiManager.sendMixerControllers(9, { volume: vol });
      }
    } else if (id === 'bass') {
      bassSynth.setVolume(vol);
      if (this.state.isMidiConnected && !this.isChannelEffectiveMuted('bass')) {
        midiManager.sendMixerControllers(10, { volume: vol });
      }
    } else if (id === 'chord') {
      chordSynth.setVolume(vol);
      if (this.state.isMidiConnected && !this.isChannelEffectiveMuted('chord')) {
        midiManager.sendMixerControllers(11, { volume: vol });
      }
    } else {
      if (this.dynamicMixerDefaults[id]) {
        this.dynamicMixerDefaults[id].volume = vol;
      }
      const t = this.dynamicTracks.get(id);
      if (t) {
        t.roll.getSynth().setVolume(vol);
      }
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[id];
      if (this.state.isMidiConnected && cfg && !this.isChannelEffectiveMuted(id)) {
        midiManager.sendMixerControllers(cfg.channel, { volume: vol });
      }
    }
  }

  private onMixerPanChange(id: string, pan: number) {
    if (id === 'rhythm1') {
      this.rhythm1Mixer.pan = pan;
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(8, { pan });
        midiManager.sendMixerControllers(0, { pan });
      }
    } else if (id === 'drum') {
      drumSynth.setPan(pan);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(9, { pan });
      }
    } else if (id === 'bass') {
      bassSynth.setPan(pan);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(10, { pan });
      }
    } else if (id === 'chord') {
      chordSynth.setPan(pan);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(11, { pan });
      }
    } else {
      if (this.dynamicMixerDefaults[id]) {
        this.dynamicMixerDefaults[id].pan = pan;
      }
      const t = this.dynamicTracks.get(id);
      if (t) {
        t.roll.getSynth().setPan(pan);
      }
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[id];
      if (this.state.isMidiConnected && cfg) {
        midiManager.sendMixerControllers(cfg.channel, { pan });
      }
    }
  }

  private onMixerReverbChange(id: string, reverb: number) {
    if (id === 'rhythm1') {
      this.rhythm1Mixer.reverb = reverb;
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(8, { reverb });
        midiManager.sendMixerControllers(0, { reverb });
      }
    } else if (id === 'drum') {
      drumSynth.setReverb(reverb);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(9, { reverb });
      }
    } else if (id === 'bass') {
      bassSynth.setReverb(reverb);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(10, { reverb });
      }
    } else if (id === 'chord') {
      chordSynth.setReverb(reverb);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(11, { reverb });
      }
    } else {
      if (this.dynamicMixerDefaults[id]) {
        this.dynamicMixerDefaults[id].reverb = reverb;
      }
      const t = this.dynamicTracks.get(id);
      if (t) {
        t.roll.getSynth().setReverb(reverb);
      }
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[id];
      if (this.state.isMidiConnected && cfg) {
        midiManager.sendMixerControllers(cfg.channel, { reverb });
      }
    }
  }

  private onMixerChorusChange(id: string, chorus: number) {
    if (id === 'rhythm1') {
      this.rhythm1Mixer.chorus = chorus;
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(8, { chorus });
        midiManager.sendMixerControllers(0, { chorus });
      }
    } else if (id === 'drum') {
      drumSynth.setChorus(chorus);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(9, { chorus });
      }
    } else if (id === 'bass') {
      bassSynth.setChorus(chorus);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(10, { chorus });
      }
    } else if (id === 'chord') {
      chordSynth.setChorus(chorus);
      if (this.state.isMidiConnected) {
        midiManager.sendMixerControllers(11, { chorus });
      }
    } else {
      if (this.dynamicMixerDefaults[id]) {
        this.dynamicMixerDefaults[id].chorus = chorus;
      }
      const t = this.dynamicTracks.get(id);
      if (t) {
        t.roll.getSynth().setChorus(chorus);
      }
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[id];
      if (this.state.isMidiConnected && cfg) {
        midiManager.sendMixerControllers(cfg.channel, { chorus });
      }
    }
  }

  private onMixerMuteToggle(id: string, muted: boolean) {
    if (muted) {
      this.mutedChannels.add(id);
    } else {
      this.mutedChannels.delete(id);
    }
    this.applyMixerAudioStates();
  }

  private onMixerSoloToggle(id: string, solo: boolean) {
    if (solo) {
      this.soloChannels.add(id);
    } else {
      this.soloChannels.delete(id);
    }
    this.applyMixerAudioStates();
  }

  public resetMixerToGoldenDefaults() {
    this.rhythm1Mixer = { volume: 90, pan: 64, reverb: 40, chorus: 0 };

    drumSynth.setVolume(100);
    drumSynth.setPan(64);
    drumSynth.setReverb(40);
    drumSynth.setChorus(0);

    bassSynth.setVolume(95);
    bassSynth.setPan(64);
    bassSynth.setReverb(20);
    bassSynth.setChorus(0);

    chordSynth.setVolume(90);
    chordSynth.setPan(52); // L12
    chordSynth.setReverb(65);
    chordSynth.setChorus(20);

    this.dynamicMixerDefaults = {
      Chord2: { volume: 85, pan: 76, reverb: 50, chorus: 40 },
      Pad: { volume: 80, pan: 64, reverb: 75, chorus: 50 },
      Phrase1: { volume: 85, pan: 44, reverb: 60, chorus: 20 },
      Phrase2: { volume: 80, pan: 84, reverb: 60, chorus: 30 },
    };

    if (this.dynamicTracks.has('Chord2')) {
      const t = this.dynamicTracks.get('Chord2')!;
      t.roll.getSynth().setVolume(85);
      t.roll.getSynth().setPan(76); // R12
      t.roll.getSynth().setReverb(50);
      t.roll.getSynth().setChorus(40);
    }
    if (this.dynamicTracks.has('Pad')) {
      const t = this.dynamicTracks.get('Pad')!;
      t.roll.getSynth().setVolume(80);
      t.roll.getSynth().setPan(64); // C
      t.roll.getSynth().setReverb(75);
      t.roll.getSynth().setChorus(50);
    }
    if (this.dynamicTracks.has('Phrase1')) {
      const t = this.dynamicTracks.get('Phrase1')!;
      t.roll.getSynth().setVolume(85);
      t.roll.getSynth().setPan(44); // L20
      t.roll.getSynth().setReverb(60);
      t.roll.getSynth().setChorus(20);
    }
    if (this.dynamicTracks.has('Phrase2')) {
      const t = this.dynamicTracks.get('Phrase2')!;
      t.roll.getSynth().setVolume(80);
      t.roll.getSynth().setPan(84); // R20
      t.roll.getSynth().setReverb(60);
      t.roll.getSynth().setChorus(30);
    }

    this.mutedChannels.clear();
    this.soloChannels.clear();
    this.applyMixerAudioStates();

    if (this.state.isMidiConnected) {
      this.syncMixerControllersToKeyboard();
    }

    this.refreshMixerChannels();
    this.setStatus('✨ 已將所有伴奏聲部重設為 Yamaha PSR-SX920 原廠推薦黃金配比 (含音量、聲相、Reverb 與 Chorus 效果器)！');
  }

  /**
   * 混音台單軌試聽按鈕點擊處理
   */
  private onMixerTrackPlayToggle(trackId: string) {
    if (this.state.isPlaying && this.state.activePlayTrack === trackId) {
      this.pause();
      return;
    }

    // 若該軌處於靜音狀態，貼心自動解除靜音
    if (this.mutedChannels.has(trackId)) {
      this.mutedChannels.delete(trackId);
      this.mixerPanel?.updateMuted(trackId, false);
      this.applyMixerAudioStates();
    }

    let hasNotes = false;
    const act = this.getSectionChannelActivity();
    if (trackId === 'rhythm1') {
      hasNotes = act.rhythm1;
    } else if (trackId === 'drum') {
      hasNotes = act.drum;
    } else if (trackId === 'bass') {
      hasNotes = act.bass;
    } else if (trackId === 'chord') {
      hasNotes = act.chord;
    } else if (act[trackId] !== undefined) {
      hasNotes = act[trackId];
    }

    if (hasNotes) {
      this.toggleSoloPlay(trackId);
    } else {
      this.playTrackDemoPhrase(trackId);
    }
  }

  /**
   * 當軌道尚未輸入音符時，播放快速示範音，讓使用者即時試聽調整後的音量、聲相與效果器
   */
  private playTrackDemoPhrase(trackId: string) {
    if (this.state.isPlaying) {
      this.stop();
    }

    let trackTitle = trackId;
    if (trackId === 'rhythm1') trackTitle = '副鼓 / 打擊樂 (Rhythm 1)';
    else if (trackId === 'drum') trackTitle = '主鼓組 (Rhythm 2)';
    else if (trackId === 'bass') trackTitle = '貝斯 (Bass)';
    else if (trackId === 'chord') trackTitle = '和弦 1 (Chord 1)';
    else if (this.dynamicTracks.has(trackId)) {
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[trackId];
      trackTitle = `${cfg?.title || trackId}`;
    } else if (AVAILABLE_CHORD_TRACK_CONFIGS[trackId]) {
      trackTitle = AVAILABLE_CHORD_TRACK_CONFIGS[trackId].title;
    }

    this.mixerPanel?.setTrackPlaying(trackId, true);

    if (trackId === 'rhythm1') {
      // 依序示範拉丁打擊樂: Tambourine (54) -> Maracas (70) -> Conga (63) -> Claves (75)
      const demoHits = [
        { note: 54, delay: 0 },
        { note: 70, delay: 180 },
        { note: 63, delay: 360 },
        { note: 75, delay: 540 },
      ];
      demoHits.forEach(h => {
        setTimeout(() => {
          this.triggerDrumSound(h.note, 100, 150, 8);
        }, h.delay);
      });
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 750);
    } else if (trackId === 'drum') {
      // 依序示範: Kick -> HiHat -> Snare -> HiHat
      const demoHits = [
        { note: 36, delay: 0 },
        { note: 42, delay: 180 },
        { note: 38, delay: 360 },
        { note: 42, delay: 540 },
      ];
      demoHits.forEach(h => {
        setTimeout(() => {
          this.triggerDrumSound(h.note, 100, 150, 9);
        }, h.delay);
      });
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 750);
    } else if (trackId === 'bass') {
      // 依序示範根音與五度: C2 (36) -> G2 (43) -> C3 (48)
      const bassNotes = [
        { note: 36, delay: 0 },
        { note: 43, delay: 240 },
        { note: 48, delay: 480 },
      ];
      bassNotes.forEach(n => {
        setTimeout(() => {
          this.triggerBassSound(n.note, 100, 220);
        }, n.delay);
      });
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 750);
    } else if (trackId === 'chord') {
      // 示範 C Major 和弦 (C3 48, E3 52, G3 55)
      [48, 52, 55].forEach(note => {
        this.triggerChordSound(note, 100, 600);
      });
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 650);
    } else if (this.dynamicTracks.has(trackId)) {
      // 動態軌道和弦音色示範
      const t = this.dynamicTracks.get(trackId)!;
      [48, 52, 55].forEach(note => {
        t.roll.getSynth().playNote(note, 100, 600);
        this.sendMidiDynamicTrackTrigger(trackId, note, 100, 600);
      });
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 650);
    } else {
      // 若尚未建立動態軌道 DOM，使用通用和弦音色示範並發送 MIDI
      const cfg = AVAILABLE_CHORD_TRACK_CONFIGS[trackId];
      if (cfg) {
        [48, 52, 55].forEach(note => {
          chordSynth.playNote(note, 100, 600);
          this.sendMidiDynamicTrackTrigger(trackId, note, 100, 600);
        });
      }
      setTimeout(() => {
        this.mixerPanel?.setTrackPlaying(trackId, false);
      }, 650);
    }

    this.setStatus(`🔊 已播放【${trackTitle}】試聽示範音（若要循環播放，可在下方編輯區點選音符）`);
  }

  public panicMixer() {
    if (this.state.isPlaying) {
      this.stop();
    }
    if (this.state.isMidiConnected) {
      midiManager.panicAllChannels();
    }
    this.mixerPanel?.clearAllVuMeters();
    this.setStatus('🔇 已發送全聲部防掛音中斷 (Panic) 與即時靜音指令，並重設混音台音量表！');
  }

  private updateMixerButtonState(visible: boolean) {
    const btn = document.getElementById('btn-toggle-mixer');
    if (btn) {
      if (visible) {
        btn.classList.add('active');
        btn.style.background = '#f59e0b';
        btn.style.color = '#0f172a';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'rgba(245, 158, 11, 0.15)';
        btn.style.color = '#f59e0b';
      }
    }
  }

  private updateUI() {
    this.refreshSectionOptions();
    this.updateSectionSummary();
    this.updateComputerAudioUI();
    this.updateAssistantPanel();
  }

  /**
   * 更新前奏 (Intro) 與尾奏 (Ending) 智慧創作引導面板
   */
  private updateAssistantPanel() {
    const panel = document.getElementById('section-assistant-panel');
    if (!panel) return;

    const secName = this.state.currentSection;
    const isIntro = secName.startsWith('Intro');
    const isEnding = secName.startsWith('Ending');
    const isBreak = secName === 'Break';

    if (!isIntro && !isEnding && !isBreak) {
      if (this.chainedAuditionMode) {
        panel.style.display = 'block';
        panel.classList.remove('theme-ending');
        const badge = document.getElementById('assistant-badge');
        const title = document.getElementById('assistant-title');
        const desc = document.getElementById('assistant-desc');
        const barButtonsContainer = document.getElementById('assistant-bar-buttons');
        const presetContainer = document.getElementById('assistant-preset-buttons');
        const auditionContainer = document.getElementById('assistant-audition-buttons');

        if (badge) badge.textContent = `🚀 連鎖實境試聽中 (${this.chainedAuditionMode === 'intro-to-main' ? 'Intro ➜ Main' : 'Main ➜ Ending'})`;
        if (title) title.textContent = `伴奏實境連鎖試聽演奏中`;
        if (desc) desc.textContent = `✨ 完美交棒！目前已無縫進入【${secName} 主歌伴奏】實境試聽中。點擊下方按鈕隨時停止並回到編輯。`;
        if (barButtonsContainer) barButtonsContainer.innerHTML = '';
        if (presetContainer) presetContainer.innerHTML = '';
        if (auditionContainer) {
          auditionContainer.innerHTML = `
            <button id="btn-stop-chained-live" class="btn-assistant-audition active-audition" style="background: #ef4444; border-color: #f87171;">
              <span>⏸</span> 停止實境試聽 (停止播放)
            </button>
          `;
          auditionContainer.querySelector('#btn-stop-chained-live')?.addEventListener('click', () => {
            this.stop();
          });
        }
        return;
      }
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    const badge = document.getElementById('assistant-badge');
    const title = document.getElementById('assistant-title');
    const desc = document.getElementById('assistant-desc');
    const barButtonsContainer = document.getElementById('assistant-bar-buttons');
    const presetContainer = document.getElementById('assistant-preset-buttons');
    const auditionContainer = document.getElementById('assistant-audition-buttons');

    const currentBars = this.state.totalBars;

    if (isIntro) {
      panel.classList.remove('theme-ending');
      if (badge) badge.textContent = `🏁 前奏 (${secName} - ${currentBars} 小節)`;
      if (title) title.textContent = `${secName} 前奏智慧創作助理`;
      if (desc) desc.textContent = '前奏為歌曲開場引子（可自由切換 2/4/8 小節）！您可以使用下方一鍵範本快速生成鼓棒計拍或流行和弦，也可以在下方捲軸自由編輯至 8 小節。';

      if (barButtonsContainer) {
        const standardBars = [2, 4, 8];
        const isCustom = !standardBars.includes(currentBars);
        const customBtnHtml = isCustom ? `<button class="btn-assistant-preset active-bar" data-bar-btn="${currentBars}">${currentBars} 小節 (自訂)</button>` : '';
        barButtonsContainer.innerHTML = `
          <button class="btn-assistant-preset ${currentBars === 2 ? 'active-bar' : ''}" data-bar-btn="2">2 小節 (短引子)</button>
          <button class="btn-assistant-preset ${currentBars === 4 ? 'active-bar' : ''}" data-bar-btn="4">4 小節 (標準)</button>
          <button class="btn-assistant-preset ${currentBars === 8 ? 'active-bar' : ''}" data-bar-btn="8">8 小節 (長版前奏)</button>
          ${customBtnHtml}
          <button id="btn-custom-intro-bars" class="btn-assistant-preset" title="自訂 1 ~ 32 小節長度">✏️ 自訂...</button>
        `;
        barButtonsContainer.querySelectorAll('[data-bar-btn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const b = parseInt(btn.getAttribute('data-bar-btn') || '4', 10);
            this.setSectionBars(b);
          });
        });
        barButtonsContainer.querySelector('#btn-custom-intro-bars')?.addEventListener('click', () => {
          this.promptCustomBars();
        });
      }

      if (presetContainer) {
        presetContainer.innerHTML = `
          <button id="btn-preset-intro-countin" class="btn-assistant-preset" title="第 1 小節 4 拍 Hi-Hat 鼓棒計拍，後續節奏推進交棒主歌">
            🥁 倒數計拍前奏 (Count-in)
          </button>
          <button id="btn-preset-intro-harmonic" class="btn-assistant-preset" title="流行和弦進行引導 (1-6-2-5 或 2-5-1)">
            🎹 流行和弦前奏 (Harmonic)
          </button>
          <button id="btn-preset-intro-from-main" class="btn-assistant-preset" title="以 Main A 主歌為基礎，在開頭插入計拍">
            ✨ 沿用 Main A 開場
          </button>
        `;
        presetContainer.querySelector('#btn-preset-intro-countin')?.addEventListener('click', () => {
          this.applySectionPreset('intro-countin');
        });
        presetContainer.querySelector('#btn-preset-intro-harmonic')?.addEventListener('click', () => {
          this.applySectionPreset('intro-harmonic');
        });
        presetContainer.querySelector('#btn-preset-intro-from-main')?.addEventListener('click', () => {
          this.applySectionPreset('intro-from-main');
        });
      }

      if (auditionContainer) {
        const isSoloActive = this.soloAuditionMode;
        const isChainedActive = this.chainedAuditionMode === 'intro-to-main';
        auditionContainer.innerHTML = `
          <button id="btn-audition-solo-intro" class="btn-assistant-audition btn-solo-audition ${isSoloActive ? 'active-audition' : ''}" title="單獨完整試聽 ${secName} 前奏（共 ${currentBars} 小節），播完自動停止，不串接主歌">
            <span>${isSoloActive ? '⏸' : '▶'}</span> ${isSoloActive ? '停止試聽' : `單獨試聽前奏 (${currentBars}小節)`}
          </button>
          <button id="btn-audition-intro-main" class="btn-assistant-audition ${isChainedActive ? 'active-audition' : ''}" title="完整播放 ${currentBars} 小節前奏，接著自動無縫滑進 Main A 主歌！">
            <span>${isChainedActive ? '⏸' : '🚀'}</span> ${isChainedActive ? '停止試聽' : `試聽前奏接主歌 (${currentBars}小節 ➜ Main)`}
          </button>
        `;
        auditionContainer.querySelector('#btn-audition-solo-intro')?.addEventListener('click', () => {
          this.toggleAuditionSoloSection();
        });
        auditionContainer.querySelector('#btn-audition-intro-main')?.addEventListener('click', () => {
          this.toggleAuditionIntroToMain();
        });
      }
    } else if (isEnding) {
      panel.classList.add('theme-ending');
      if (badge) badge.textContent = `🛑 尾奏 (${secName} - ${currentBars} 小節)`;
      if (title) title.textContent = `${secName} 尾奏智慧創作助理`;
      if (desc) desc.textContent = '尾奏為整首歌曲的終止式收尾！點擊下方範本可一鍵生成俐落大鈸收束或樂團大收尾，演奏完畢後實體琴將自動平穩停止伴奏。';

      if (barButtonsContainer) {
        const standardBars = [2, 4, 8];
        const isCustom = !standardBars.includes(currentBars);
        const customBtnHtml = isCustom ? `<button class="btn-assistant-preset active-bar" data-bar-btn="${currentBars}">${currentBars} 小節 (自訂)</button>` : '';
        barButtonsContainer.innerHTML = `
          <button class="btn-assistant-preset ${currentBars === 2 ? 'active-bar' : ''}" data-bar-btn="2">2 小節 (俐落收尾)</button>
          <button class="btn-assistant-preset ${currentBars === 4 ? 'active-bar' : ''}" data-bar-btn="4">4 小節 (漸慢加長)</button>
          <button class="btn-assistant-preset ${currentBars === 8 ? 'active-bar' : ''}" data-bar-btn="8">8 小節 (長版收束)</button>
          ${customBtnHtml}
          <button id="btn-custom-ending-bars" class="btn-assistant-preset" title="自訂 1 ~ 32 小節長度">✏️ 自訂...</button>
        `;
        barButtonsContainer.querySelectorAll('[data-bar-btn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const b = parseInt(btn.getAttribute('data-bar-btn') || '2', 10);
            this.setSectionBars(b);
          });
        });
        barButtonsContainer.querySelector('#btn-custom-ending-bars')?.addEventListener('click', () => {
          this.promptCustomBars();
        });
      }

      if (presetContainer) {
        presetContainer.innerHTML = `
          <button id="btn-preset-ending-punch" class="btn-assistant-preset" title="第 1 拍大鈸強音 (Crash) + 重擊三和弦定音">
            💥 俐落大鈸收束 (Punch)
          </button>
          <button id="btn-preset-ending-climax" class="btn-assistant-preset" title="狂熱連擊切分節奏 + 雙重 Crash 大鈸震撼結尾">
            🥁 樂團高潮大收尾 (Climax)
          </button>
          <button id="btn-preset-ending-soft" class="btn-assistant-preset" title="輕柔 Ride 鈸與鋼琴分解和弦，安靜收尾">
            🌊 抒情溫柔淡出 (Soft)
          </button>
        `;
        presetContainer.querySelector('#btn-preset-ending-punch')?.addEventListener('click', () => {
          this.applySectionPreset('ending-punch');
        });
        presetContainer.querySelector('#btn-preset-ending-climax')?.addEventListener('click', () => {
          this.applySectionPreset('ending-climax');
        });
        presetContainer.querySelector('#btn-preset-ending-soft')?.addEventListener('click', () => {
          this.applySectionPreset('ending-soft');
        });
      }

      if (auditionContainer) {
        const isSoloActive = this.soloAuditionMode;
        const isChainedActive = this.chainedAuditionMode === 'main-to-ending';
        auditionContainer.innerHTML = `
          <button id="btn-audition-solo-ending" class="btn-assistant-audition btn-solo-audition ${isSoloActive ? 'active-audition' : ''}" title="單獨完整試聽 ${secName} 尾奏（共 ${currentBars} 小節），演奏完畢自動平穩停止，不串接主歌">
            <span>${isSoloActive ? '⏸' : '▶'}</span> ${isSoloActive ? '停止試聽' : `單獨試聽尾奏 (${currentBars}小節)`}
          </button>
          <button id="btn-audition-main-ending" class="btn-assistant-audition ${isChainedActive ? 'active-audition' : ''}" title="先播放 1 小節 Main A 帶出節奏，接著切入 ${secName} 尾奏並自動停止！">
            <span>${isChainedActive ? '⏸' : '🛑'}</span> ${isChainedActive ? '停止試聽' : `試聽主歌接尾奏 (Main A ➜ ${secName})`}
          </button>
        `;
        auditionContainer.querySelector('#btn-audition-solo-ending')?.addEventListener('click', () => {
          this.toggleAuditionSoloSection();
        });
        auditionContainer.querySelector('#btn-audition-main-ending')?.addEventListener('click', () => {
          this.toggleAuditionMainToEnding();
        });
      }
    } else if (isBreak) {
      panel.classList.remove('theme-ending');
      if (badge) badge.textContent = `⚡ 暫停過門 (${secName} - ${currentBars} 小節)`;
      if (title) title.textContent = `Break 暫停過門智慧創作助理`;
      if (desc) desc.textContent = 'Break 為歌曲中的戲劇性留白暫停過門（標準為 1 小節）！第 1 拍重音定音後樂團全體抽離靜音，最後一拍小鼓漸強滾奏加花推進，製造極致爆發力！';

      if (barButtonsContainer) {
        barButtonsContainer.innerHTML = `
          <button class="btn-assistant-preset ${currentBars === 1 ? 'active-bar' : ''}" data-bar-btn="1">1 小節 (標準 Break)</button>
          <button class="btn-assistant-preset ${currentBars === 2 ? 'active-bar' : ''}" data-bar-btn="2">2 小節 (加長過渡)</button>
          <button id="btn-custom-intro-bars" class="btn-assistant-preset" title="自訂 1 ~ 32 小節長度">✏️ 自訂...</button>
        `;
        barButtonsContainer.querySelectorAll('[data-bar-btn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const b = parseInt(btn.getAttribute('data-bar-btn') || '1', 10);
            this.setSectionBars(b);
          });
        });
        barButtonsContainer.querySelector('#btn-custom-intro-bars')?.addEventListener('click', () => {
          this.promptCustomBars();
        });
      }

      if (presetContainer) {
        presetContainer.innerHTML = `
          <button id="btn-preset-break-classic" class="btn-assistant-preset" title="第 1 拍大鈸定音 + 拍 2~3 留白抽離 + 拍 4 小鼓漸強滾奏加花">
            ⚡ 經典留白暫停 (Classic Break)
          </button>
        `;
        presetContainer.querySelector('#btn-preset-break-classic')?.addEventListener('click', () => {
          this.applySectionPreset('break-classic');
        });
      }

      if (auditionContainer) {
        const isSoloActive = this.soloAuditionMode;
        auditionContainer.innerHTML = `
          <button id="btn-audition-solo-break" class="btn-assistant-audition btn-solo-audition ${isSoloActive ? 'active-audition' : ''}" title="單獨完整試聽 Break 暫停過門（共 ${currentBars} 小節）">
            <span>${isSoloActive ? '⏸' : '▶'}</span> ${isSoloActive ? '停止試聽' : `單獨試聽 Break (${currentBars}小節)`}
          </button>
        `;
        auditionContainer.querySelector('#btn-audition-solo-break')?.addEventListener('click', () => {
          this.toggleAuditionSoloSection();
        });
      }
    }
  }

  /**
   * 切換當前段落的小節數 (例如 1~32 小節)
   */
  public setSectionBars(bars: number) {
    this.state.totalBars = bars;
    const selectBars = document.getElementById('select-bars') as HTMLSelectElement | null;
    if (selectBars) {
      this.ensureBarsOptionExists(selectBars, bars);
      selectBars.value = bars.toString();
    }

    this.drumGrid?.setTotalBars(bars);
    this.bassRoll?.setTotalBars(bars);
    this.chordRoll?.setTotalBars(bars);
    this.dynamicTracks.forEach(t => t.roll.setTotalBars(bars));

    this.saveCurrentSectionToStore();
    this.updateSectionSummary();
    this.updateAssistantPanel();

    this.setStatus(`📏 已將【${this.state.currentSection}】長度切換為 ${bars} 小節！可自由編寫至第 ${bars} 小節。`);
  }

  /**
   * 彈出對話框提示使用者自訂小節數 (1 ~ 32)
   */
  public promptCustomBars() {
    const input = prompt('請輸入自訂小節數 (1 ~ 32)：', this.state.totalBars.toString());
    if (input !== null) {
      const num = parseInt(input.trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= 32) {
        this.setSectionBars(num);
      } else {
        alert('小節數請輸入介於 1 到 32 之間的整數。');
      }
    }
  }

  /**
   * 確保 select-bars 下拉選單中存在指定小節數的 option
   */
  private ensureBarsOptionExists(selectBars: HTMLSelectElement, bars: number) {
    const existing = selectBars.querySelector(`option[value="${bars}"]`);
    if (!existing) {
      const customOpt = selectBars.querySelector('option[value="custom"]');
      const opt = document.createElement('option');
      opt.value = bars.toString();
      opt.textContent = `${bars} 小節 (自訂)`;
      if (customOpt) {
        selectBars.insertBefore(opt, customOpt);
      } else {
        selectBars.appendChild(opt);
      }
    }
  }

  /**
   * 套用 Intro 或 Ending 一鍵智慧範本
   */
  public applySectionPreset(presetKey: string) {
    const stepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
    const chosenBars = this.state.totalBars || 4;
    let patternResult: GeneratedSectionPattern | null = null;
    let title = '';

    if (presetKey === 'intro-countin') {
      patternResult = SectionPresetsEngine.generateIntroCountIn(chosenBars, stepsPerBar);
      title = `倒數計拍前奏 (${chosenBars} 小節)`;
    } else if (presetKey === 'intro-harmonic') {
      patternResult = SectionPresetsEngine.generateIntroHarmonic(chosenBars, stepsPerBar);
      title = `流行和弦前奏 (${chosenBars} 小節)`;
    } else if (presetKey === 'intro-from-main') {
      const mainStore = this.sections.get('Main A') || {
        name: 'Main A',
        bars: 4,
        drumPattern: this.drumGrid?.getPatternData() || new Map(),
        bassPattern: this.bassRoll?.getPatternData() || new Map(),
        chordPattern: this.chordRoll?.getPatternData() || new Map(),
      };
      patternResult = SectionPresetsEngine.generateIntroFromMain(mainStore, chosenBars, stepsPerBar);
      title = `沿用 Main A 開場 (${chosenBars} 小節)`;
    } else if (presetKey === 'ending-punch') {
      patternResult = SectionPresetsEngine.generateEndingPunch(chosenBars, stepsPerBar);
      title = `俐落大鈸收束 (${chosenBars} 小節)`;
    } else if (presetKey === 'ending-climax') {
      patternResult = SectionPresetsEngine.generateEndingClimax(chosenBars, stepsPerBar);
      title = `樂團高潮大收尾 (${chosenBars} 小節)`;
    } else if (presetKey === 'ending-soft') {
      patternResult = SectionPresetsEngine.generateEndingSoft(chosenBars, stepsPerBar);
      title = `抒情溫柔淡出 (${chosenBars} 小節)`;
    } else if (presetKey === 'break-classic') {
      patternResult = SectionPresetsEngine.generateBreakPattern(chosenBars, stepsPerBar);
      title = `經典留白暫停 (${chosenBars} 小節)`;
    }

    if (!patternResult) return;

    // 更新總小節數
    this.state.totalBars = patternResult.bars;
    const selectBars = document.getElementById('select-bars') as HTMLSelectElement | null;
    if (selectBars) selectBars.value = patternResult.bars.toString();

    this.drumGrid?.setTotalBars(patternResult.bars);
    this.bassRoll?.setTotalBars(patternResult.bars);
    this.chordRoll?.setTotalBars(patternResult.bars);
    this.dynamicTracks.forEach(t => t.roll.setTotalBars(patternResult!.bars));

    // 套用音符
    this.drumGrid?.setPatternData(patternResult.drumPattern);
    this.bassRoll?.setPatternData(patternResult.bassPattern);
    this.chordRoll?.setPatternData(patternResult.chordPattern);

    // 存入 Store
    this.saveCurrentSectionToStore();
    this.updateSectionSummary();
    this.refreshSectionOptions();
    this.updateAssistantPanel();

    this.setStatus(`✨ 已成功套用【${title}】智慧範本！可在捲軸微調或點擊試聽。`);
  }

  /**
   * 單獨試聽當前段落 (例如單獨試聽 Intro A 或 Ending A，完整播放 1 遍後自動平穩停止，不串接主歌)
   */
  public toggleAuditionSoloSection() {
    if (this.soloAuditionMode) {
      this.stop();
      return;
    }

    this.stop();

    const secName = this.state.currentSection;

    // 若該段落目前為空白（0音符），自動為其套用智慧範本
    if (!this.checkSectionHasNotes(secName)) {
      if (secName.startsWith('Intro')) {
        this.applySectionPreset('intro-harmonic');
      } else if (secName.startsWith('Ending')) {
        this.applySectionPreset('ending-punch');
      }
    }

    this.soloAuditionMode = true;
    this.state.isPlaying = true;
    this.state.activePlayTrack = 'all';
    this.updatePlayButtonsUI();
    this.updateAssistantPanel();

    const stepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
    const totalSteps = this.state.totalBars * stepsPerBar;
    const stepIntervalMs = this.getStepIntervalMs();

    let currentStep = 0;
    this.currentPlayStep = 0;

    const isIntro = secName.startsWith('Intro');
    const isEnding = secName.startsWith('Ending');
    const typeLabel = isIntro ? '前奏' : isEnding ? '尾奏' : '段落';

    this.setStatus(`▶ 正在單獨試聽【${secName} ${typeLabel}】(共 ${this.state.totalBars} 小節)，演奏完畢自動平穩停止...`);

    const tick = () => {
      if (!this.state.isPlaying || !this.soloAuditionMode) {
        this.stopSoloAudition();
        return;
      }

      this.playAuditionStep(currentStep, stepIntervalMs, secName);

      currentStep++;
      if (currentStep >= totalSteps) {
        // 播完 1 遍後自動平穩停止！
        this.stop();
        this.setStatus(`⏹【${secName} ${typeLabel}】單獨試聽完畢，已自動平穩停止！`);
      }
    };

    tick();
    this.soloAuditionTimer = setInterval(tick, stepIntervalMs);
  }

  private stopSoloAudition() {
    if (this.soloAuditionTimer) {
      clearInterval(this.soloAuditionTimer);
      this.soloAuditionTimer = null;
    }
    this.soloAuditionMode = false;
    this.updateAssistantPanel();
  }

  /**
   * 試聽前奏接主歌：Intro (A/B/C) 播放完畢後無縫切入 Main A
   */
  public toggleAuditionIntroToMain() {
    if (this.chainedAuditionMode === 'intro-to-main') {
      this.stop();
      return;
    }

    this.stop();

    const introName = this.state.currentSection.startsWith('Intro') ? this.state.currentSection : 'Intro A';

    // 確保有該 Intro 段落
    let introStore = this.sections.get(introName);
    if (!introStore || !this.checkSectionHasNotes(introName)) {
      this.switchSection(introName);
      if (introName === 'Intro B') {
        this.applySectionPreset('intro-countin');
      } else {
        this.applySectionPreset('intro-harmonic');
      }
      introStore = this.sections.get(introName)!;
    } else if (this.state.currentSection !== introName) {
      this.switchSection(introName);
      introStore = this.sections.get(introName)!;
    } else {
      this.saveCurrentSectionToStore();
      introStore = this.sections.get(introName)!;
    }

    this.chainedAuditionMode = 'intro-to-main';
    this.updateAssistantPanel();
    this.state.isPlaying = true;
    this.state.activePlayTrack = 'all';
    this.updatePlayButtonsUI();

    const stepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
    const introTotalSteps = (introStore.bars || this.state.totalBars || 4) * stepsPerBar;
    const stepIntervalMs = this.getStepIntervalMs();

    let currentPhase: 'intro' | 'main' = 'intro';
    let currentStep = 0;
    this.currentPlayStep = 0;

    this.setStatus(`🚀 正在實境試聽：【${introName} 前奏】(${introStore.bars || 4} 小節) 倒數開場中...`);

    const tick = () => {
      if (!this.state.isPlaying || this.chainedAuditionMode !== 'intro-to-main') {
        this.stopChainedAudition();
        return;
      }

      if (currentPhase === 'intro') {
        this.playAuditionStep(currentStep, stepIntervalMs, introName);

        currentStep++;
        if (currentStep >= introTotalSteps) {
          // 前奏結束，無縫滑入 Main A！
          currentPhase = 'main';
          currentStep = 0;
          this.switchSection('Main A', true);
          this.state.isPlaying = true;
          this.state.activePlayTrack = 'all';
          this.updatePlayButtonsUI();
          this.setStatus(`✨ 完美交棒！已自【${introName}】平滑進入【Main A 主歌伴奏】！`);
        }
      } else {
        const mainBars = this.sections.get('Main A')?.bars || this.state.totalBars || 2;
        const mainTotalSteps = mainBars * stepsPerBar;

        this.playAuditionStep(currentStep, stepIntervalMs, 'Main A');

        currentStep = (currentStep + 1) % mainTotalSteps;
      }
    };

    tick();
    this.chainedTimer = setInterval(tick, stepIntervalMs);
  }

  /**
   * 試聽主歌接尾奏：Main A 播放 1 小節後切入 Ending (A/B/C)，演奏完畢自動平穩停止
   */
  public toggleAuditionMainToEnding() {
    if (this.chainedAuditionMode === 'main-to-ending') {
      this.stop();
      return;
    }

    this.stop();

    const endingName = this.state.currentSection.startsWith('Ending') ? this.state.currentSection : 'Ending A';

    // 確保有該 Ending 段落
    let endingStore = this.sections.get(endingName);
    if (!endingStore || !this.checkSectionHasNotes(endingName)) {
      this.switchSection(endingName);
      if (endingName === 'Ending B') {
        this.applySectionPreset('ending-climax');
      } else if (endingName === 'Ending C') {
        this.applySectionPreset('ending-soft');
      } else {
        this.applySectionPreset('ending-punch');
      }
      endingStore = this.sections.get(endingName)!;
    }

    // 確保切換至 Main A 作為引導
    this.switchSection('Main A');

    this.chainedAuditionMode = 'main-to-ending';
    this.updateAssistantPanel();
    this.state.isPlaying = true;
    this.state.activePlayTrack = 'all';
    this.updatePlayButtonsUI();

    const stepsPerBar = this.drumGrid?.getStepsPerBar() || 16;
    const leadInSteps = stepsPerBar; // 播放 1 小節 Main A 作為引導
    const endingTotalSteps = (endingStore.bars || 2) * stepsPerBar;
    const stepIntervalMs = this.getStepIntervalMs();

    let currentPhase: 'lead-in' | 'ending' = 'lead-in';
    let currentStep = 0;

    this.setStatus(`🛑 正在播放【Main A】引導，準備切入【${endingName} 尾奏】...`);

    const tick = () => {
      if (!this.state.isPlaying || this.chainedAuditionMode !== 'main-to-ending') {
        this.stopChainedAudition();
        return;
      }

      if (currentPhase === 'lead-in') {
        this.playAuditionStep(currentStep, stepIntervalMs, 'Main A');

        currentStep++;
        if (currentStep >= leadInSteps) {
          // 切入 Ending！
          currentPhase = 'ending';
          currentStep = 0;
          this.switchSection(endingName, true);
          this.state.isPlaying = true;
          this.state.activePlayTrack = 'all';
          this.updatePlayButtonsUI();
          this.setStatus(`💥 進入【${endingName} 尾奏】：收束演奏中...`);
        }
      } else {
        this.playAuditionStep(currentStep, stepIntervalMs, endingName);

        currentStep++;
        if (currentStep >= endingTotalSteps) {
          // 尾奏結束，自動平穩停止伴奏！
          this.stop();
          this.setStatus(`⏹【${endingName} 尾奏】演奏結束，伴奏已自動平穩停止！`);
        }
      }
    };

    tick();
    this.chainedTimer = setInterval(tick, stepIntervalMs);
  }

  private stopChainedAudition() {
    if (this.chainedTimer) {
      clearInterval(this.chainedTimer);
      this.chainedTimer = null;
    }
    this.chainedAuditionMode = null;
    this.updateAssistantPanel();
  }
}

// 頁面載入後自動啟動
window.addEventListener('DOMContentLoaded', () => {
  (window as any).creatorApp = new CreatorApp();
});
