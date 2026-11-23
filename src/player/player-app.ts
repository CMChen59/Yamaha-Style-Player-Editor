import { YamahaParser } from '../core/parser/yamaha-parser';
import { MidiSongAnalyzer, type MidiSongAnalysis } from '../core/parser/midi-song-analyzer';
import { styPlaybackEngine, formatYamahaPan } from './sty-playback-engine';
import { midiManager } from '../core/audio/midi-manager';
import type { YamahaFileParsed } from '../core/models/types';
import { getSharedAudioContext } from '../creator/shared-audio-context';
import { SingleTrackEditor } from './single-track-editor';
import { YamahaWriter } from '../core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../core/writer/style-modifier';
import { YamahaPadModifier, PAD_KEY_LIST, PAD_ICON_LIST, type PadProjectDiagnosis } from '../core/writer/pad-modifier';
import { YamahaPadSynthesizer } from '../core/writer/pad-synthesizer';
import type { PlaybackNoteEvent, PlaybackCCEvent, PlaybackOutputMode } from './sty-playback-engine';
import { VoicePickerModal } from './voice-picker-modal';
import { SectionCloneModal } from './section-clone-modal';
import { SectionImportModal } from './section-import-modal';
import { AddSectionModal, type AddSectionConfig } from './add-section-modal';
import { NewStyleModal, type NewStyleModalConfig } from './new-style-modal';
import { MidiSliceAssignModal, type MidiSliceAssignConfig } from './midi-slice-assign-modal';
import { MidiSliceAssembler, type MidiSliceAssembleResult } from '../core/writer/midi-slice-assembler';
import { YamahaStyleSynthesizer } from '../core/writer/style-synthesizer';
import { ChordTransposer, POPULAR_AUDITION_CHORDS, CHORD_TYPE_INTERVALS, type ChordDefinition, type ChordType } from '../core/writer/chord-transposer';
import { findYamahaVoice, type YamahaVoice } from '../core/data/yamaha-voices';
import {
  MidiPartAssignMatrix,
  YAMAHA_ARRANGER_PARTS,
  type SongPartMappingPlan,
  type YamahaPartType
} from '../core/writer/midi-part-assign-matrix';

// Yamaha 標準 8 伴奏聲部定義
interface PartDef {
  channel: number;       // 0-indexed (8~15)
  label: string;         // 'Rhythm 1', 'Bass', etc.
  defaultName: string;   // 預設名稱
  color: string;         // 代表色
}

const YAMAHA_PARTS: PartDef[] = [
  { channel: 8, label: 'Rhythm 1', defaultName: 'Sub Drums', color: '#f59e0b' },
  { channel: 9, label: 'Rhythm 2', defaultName: 'Main Drums', color: '#ef4444' },
  { channel: 10, label: 'Bass', defaultName: 'Finger Bass', color: '#3b82f6' },
  { channel: 11, label: 'Chord 1', defaultName: 'Piano / Guitar', color: '#10b981' },
  { channel: 12, label: 'Chord 2', defaultName: 'E.Piano / Brass', color: '#06b6d4' },
  { channel: 13, label: 'Pad', defaultName: 'Strings / Pad', color: '#8b5cf6' },
  { channel: 14, label: 'Phrase 1', defaultName: 'Lead / Arp 1', color: '#ec4899' },
  { channel: 15, label: 'Phrase 2', defaultName: 'Lead / Arp 2', color: '#f97316' },
];

export class PlayerApp {
  public currentParsed: YamahaFileParsed | null = null;
  public currentSongAnalysis: MidiSongAnalysis | null = null;
  public currentFileName: string = '';
  public activeSectionName: string = '';
  private baseBpm: number = 120;
  private focusedChannel: number = 8; // 預設聚焦 Channel 8 (即面板 CH 9 Rhythm 1)
  private isFxVisible: boolean = true; // 混音盤空間效果器 (Reverb & Chorus) 展開狀態

  // 📊 標準 MIDI 音樂檔全景透視面板元件
  private midiInspectorPanel: HTMLElement | null = null;
  private midiKpiGrid: HTMLElement | null = null;
  private midiChGrid: HTMLElement | null = null;
  private midiChSectionTitle: HTMLElement | null = null;
  private midiMarkersSummary: HTMLElement | null = null;
  private inputMidiStartBar: HTMLInputElement | null = null;
  private inputMidiEndBar: HTMLInputElement | null = null;
  private labelMidiTotalBarsHint: HTMLElement | null = null;
  private btnApplyMidiBarRange: HTMLButtonElement | null = null;
  private btnStopMidiBarRange: HTMLButtonElement | null = null;
  private btnTogglePartMatrix: HTMLButtonElement | null = null;
  private partAssignMatrixPanel: HTMLElement | null = null;
  private isPartMatrixVisible: boolean = false;
  private currentPartMappingPlan: SongPartMappingPlan | null = null;
  private chordAuditionBar: HTMLElement | null = null;
  private sectionMatrixPanel: HTMLElement | null = null;
  private mixerPanel: HTMLElement | null = null;

  // UI Elements
  private dropZone!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private sectionButtonsContainer!: HTMLElement;
  private currentSecNameBadge!: HTMLElement;
  private inputCustomBars!: HTMLInputElement;
  private btnApplyCustomBars!: HTMLButtonElement;
  private btnPlay!: HTMLButtonElement;
  private btnPlaySolo!: HTMLButtonElement;
  private btnStop!: HTMLButtonElement;
  private btnLoop!: HTMLButtonElement;
  private sliderBpm!: HTMLInputElement;
  private labelBpmValue!: HTMLElement;
  private sliderMasterVol!: HTMLInputElement;
  private labelMasterVolValue!: HTMLElement;
  private btnMasterVolReset!: HTMLButtonElement;
  private labelPosition!: HTMLElement;
  private labelStyleTitle!: HTMLElement;
  private labelStyleInfo!: HTMLElement;
  private mixerContainer!: HTMLElement;
  private midiStatusPill!: HTMLElement;

  // 🎯 聚焦聲部資訊橫幅 (Phase 1 聚焦聯動)
  private focusedTrackBanner!: HTMLElement;
  private focusedTrackTitle!: HTMLElement;
  private focusedTrackVoice!: HTMLElement;
  private focusedTrackMeta!: HTMLElement;
  private btnBannerSolo!: HTMLButtonElement;
  private btnBannerMute!: HTMLButtonElement;

  // 🎹 單軌專注編輯工作台 (Phase 2 & 3: 展開音符、拍子、樂器、力度拉桿與數字輸入)
  private trackEditor!: SingleTrackEditor;

  // 聲音輸出控制
  private btnOutputWebAudio!: HTMLButtonElement;
  private btnOutputMidi!: HTMLButtonElement;
  private btnOutputBoth: HTMLButtonElement | null = null;
  private midiDrawer!: HTMLElement;
  private selectMidiPort!: HTMLSelectElement;
  private selectMidiInPort!: HTMLSelectElement;
  private btnRefreshMidi!: HTMLButtonElement;
  private btnSyncMidiParts: HTMLButtonElement | null = null;
  private btnTestPiano!: HTMLButtonElement;
  private btnTestMidiDrums: HTMLButtonElement | null = null;
  private btnTestMidiBass: HTMLButtonElement | null = null;
  private btnTestMidiChord: HTMLButtonElement | null = null;
  private btnMidiPanic: HTMLButtonElement | null = null;
  private midiTxLed: HTMLElement | null = null;
  private midiTxLogText: HTMLElement | null = null;
  private midiSysexBadge: HTMLElement | null = null;
  private txLedTimer: ReturnType<typeof setTimeout> | null = null;
  private outputCurrentStatus!: HTMLElement;
  private btnExportSty!: HTMLButtonElement;
  private voicePicker!: VoicePickerModal;
  private sectionCloneModal!: SectionCloneModal;
  private btnOpenSectionClone!: HTMLButtonElement;
  private sectionImportModal!: SectionImportModal;
  private btnOpenSectionImport!: HTMLButtonElement;
  private addSectionModal!: AddSectionModal;
  private btnOpenAddSection!: HTMLButtonElement;
  private midiSliceAssignModal!: MidiSliceAssignModal;
  private btnOpenSliceModal: HTMLButtonElement | null = null;
  private btnReturnToMidi: HTMLButtonElement | null = null;
  private currentlyAuditionMutedChannels: number[] = [];
  private workingStyleParsed: YamahaFileParsed | null = null;
  private sourceSongParsed: YamahaFileParsed | null = null;
  private sourceSongAnalysis: MidiSongAnalysis | null = null;
  private sourceSongFileName: string = '';
  private newStyleModal!: NewStyleModal;
  private btnOpenNewStyle!: HTMLButtonElement;
  // 🎹 虛擬和弦轉調測試元件
  private chordPillsContainer!: HTMLElement;
  private labelCurrentChordName!: HTMLElement;
  private labelCurrentChordDetail!: HTMLElement;
  private selectChordRoot!: HTMLSelectElement;
  private selectChordType!: HTMLSelectElement;
  private btnApplyCustomChord!: HTMLButtonElement;
  private btnResetChord!: HTMLButtonElement;
  // 🔄 多小節和弦進行輪播元件
  private toggleChordAutoAdvance!: HTMLInputElement;
  private selectChordProgressionPreset!: HTMLSelectElement;
  private progressionCardsContainer!: HTMLElement;
  private btnResetProgression!: HTMLButtonElement;
  // 🎹 Multi Pad (.PAD) 調性平移與 4 軌修改工作台元件
  private padStudioPanel: HTMLElement | null = null;
  private padStudioCmBadge: HTMLElement | null = null;
  private btnExportPadFile: HTMLButtonElement | null = null;
  private padAutoKeyBadge: HTMLElement | null = null;
  private padKeyReasonText: HTMLElement | null = null;
  private selectPadSourceKey: HTMLSelectElement | null = null;
  private selectPadTargetKey: HTMLSelectElement | null = null;
  private selectPadShiftDir: HTMLSelectElement | null = null;
  private inputPadKeySuffix: HTMLInputElement | null = null;
  private padShiftPreviewBadge: HTMLElement | null = null;
  private btnApplyPadTranspose: HTMLButtonElement | null = null;
  private padCardsGrid: HTMLElement | null = null;
  private padStudioStatusMsg: HTMLElement | null = null;
  private currentPadDiagnosis: PadProjectDiagnosis | null = null;
  private initialPadDiagnosis: PadProjectDiagnosis | null = null;
  private originalPadTrackNotes: Map<number, Array<{ note: number; startTick: number; durationTick: number; velocity: number }>> = new Map();
  private selectedPadNumsForTranspose: Set<number> = new Set([1, 2, 3, 4]);
  private currentPadTotalSemitoneShift: number = 0;
  private lastTransposedKeySuffix: string = '';
  private userPreferredTargetKey: string | null = null;

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  private init() {
    this.bindDomElements();
    this.setupEventListeners();
    this.setupEngineCallbacks();
    this.setupChordAuditionBar();
    this.renderMixer();

    const editorEl = document.getElementById('single-track-editor')!;
    this.trackEditor = new SingleTrackEditor(editorEl);
    this.trackEditor.setOnEventsChanged((channel, events) => {
      this.updateFocusedBanner();
      this.syncEditorEventsToParsed(channel, events);
    });
    this.trackEditor.setOnCCEventsChanged((channel, controller, events) => {
      this.syncEditorCCEventsToParsed(channel, controller, events);
    });
    this.trackEditor.setOnRequestSwitchChannel((channel) => {
      this.setFocusedChannel(channel);
    });
    this.trackEditor.setOnOpenVoicePicker((channel) => {
      this.openVoicePickerForChannel(channel);
    });
    this.trackEditor.setOnRequestActivate((channel) => {
      if (!this.isChannelActive(channel)) {
        this.activateChannel(channel);
      }
    });
    this.trackEditor.setOnToggleSoloPlay((channel) => {
      this.toggleSoloPlay(channel);
    });

    this.voicePicker = new VoicePickerModal();
    this.sectionCloneModal = new SectionCloneModal();
    this.sectionImportModal = new SectionImportModal();
    this.addSectionModal = new AddSectionModal();
    this.newStyleModal = new NewStyleModal();
    this.midiSliceAssignModal = new MidiSliceAssignModal();

    this.setFocusedChannel(8); // 預設聚焦 CH 9 Rhythm 1
    this.initMidi();

    // 自動嘗試載入 LoveSong 示範檔案
    this.loadSampleByUrl('/samples/LoveSong.T547.sty', 'LoveSong.T547.sty');
  }

  private bindDomElements() {
    this.dropZone = document.getElementById('drop-zone')!;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.sectionButtonsContainer = document.getElementById('section-buttons')!;
    this.currentSecNameBadge = document.getElementById('current-sec-name-badge')!;
    this.inputCustomBars = document.getElementById('input-custom-bars') as HTMLInputElement;
    this.btnApplyCustomBars = document.getElementById('btn-apply-custom-bars') as HTMLButtonElement;
    this.btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
    this.btnPlaySolo = document.getElementById('btn-play-solo') as HTMLButtonElement;
    this.btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    this.btnLoop = document.getElementById('btn-loop') as HTMLButtonElement;
    this.sliderBpm = document.getElementById('slider-bpm') as HTMLInputElement;
    this.labelBpmValue = document.getElementById('bpm-value')!;
    this.sliderMasterVol = document.getElementById('slider-master-vol') as HTMLInputElement;
    this.labelMasterVolValue = document.getElementById('master-vol-val')!;
    this.btnMasterVolReset = document.getElementById('btn-master-vol-reset') as HTMLButtonElement;
    this.labelPosition = document.getElementById('label-position')!;
    this.labelStyleTitle = document.getElementById('style-title')!;
    this.labelStyleInfo = document.getElementById('style-info')!;
    this.mixerContainer = document.getElementById('mixer-grid')!;
    this.midiStatusPill = document.getElementById('midi-status-pill')!;
    this.btnExportSty = document.getElementById('btn-export-sty') as HTMLButtonElement;
    this.btnReturnToMidi = document.getElementById('btn-return-to-midi') as HTMLButtonElement | null;
    this.btnOpenAddSection = document.getElementById('btn-open-add-section') as HTMLButtonElement;
    this.btnOpenSectionClone = document.getElementById('btn-open-section-clone') as HTMLButtonElement;
    this.btnOpenSectionImport = document.getElementById('btn-open-section-import') as HTMLButtonElement;
    this.btnOpenNewStyle = document.getElementById('btn-open-new-style') as HTMLButtonElement;

    // 🎯 聚焦聲部資訊橫幅元件
    this.focusedTrackBanner = document.getElementById('focused-track-banner')!;
    this.focusedTrackTitle = document.getElementById('focused-track-title')!;
    this.focusedTrackVoice = document.getElementById('focused-track-voice')!;
    this.focusedTrackMeta = document.getElementById('focused-track-meta')!;
    this.btnBannerSolo = document.getElementById('btn-banner-solo') as HTMLButtonElement;
    this.btnBannerMute = document.getElementById('btn-banner-mute') as HTMLButtonElement;

    // 聲音輸出控制元件
    this.btnOutputWebAudio = document.getElementById('btn-output-webaudio') as HTMLButtonElement;
    this.btnOutputMidi = document.getElementById('btn-output-midi') as HTMLButtonElement;
    this.btnOutputBoth = document.getElementById('btn-output-both') as HTMLButtonElement | null;
    this.midiDrawer = document.getElementById('midi-drawer')!;
    this.selectMidiPort = document.getElementById('select-midi-port') as HTMLSelectElement;
    this.selectMidiInPort = document.getElementById('select-midi-in-port') as HTMLSelectElement;
    this.btnRefreshMidi = document.getElementById('btn-refresh-midi') as HTMLButtonElement;
    this.btnSyncMidiParts = document.getElementById('btn-sync-midi-parts') as HTMLButtonElement | null;
    this.btnTestPiano = document.getElementById('btn-test-piano') as HTMLButtonElement;
    this.btnTestMidiDrums = document.getElementById('btn-test-midi-drums') as HTMLButtonElement | null;
    this.btnTestMidiBass = document.getElementById('btn-test-midi-bass') as HTMLButtonElement | null;
    this.btnTestMidiChord = document.getElementById('btn-test-midi-chord') as HTMLButtonElement | null;
    this.btnMidiPanic = document.getElementById('btn-midi-panic') as HTMLButtonElement | null;
    this.midiTxLed = document.getElementById('midi-tx-led');
    this.midiTxLogText = document.getElementById('midi-tx-log-text');
    this.midiSysexBadge = document.getElementById('midi-sysex-badge');
    this.outputCurrentStatus = document.getElementById('output-current-status')!;

    // 🎹 虛擬和弦轉調測試元件綁定
    this.chordPillsContainer = document.getElementById('chord-pills-row')!;
    this.labelCurrentChordName = document.getElementById('current-chord-name')!;
    this.labelCurrentChordDetail = document.getElementById('current-chord-detail')!;
    this.selectChordRoot = document.getElementById('select-chord-root') as HTMLSelectElement;
    this.selectChordType = document.getElementById('select-chord-type') as HTMLSelectElement;
    this.btnApplyCustomChord = document.getElementById('btn-apply-custom-chord') as HTMLButtonElement;
    this.btnResetChord = document.getElementById('btn-reset-chord') as HTMLButtonElement;

    // 🔄 多小節和弦進行輪播元件綁定
    this.toggleChordAutoAdvance = document.getElementById('toggle-chord-auto-advance') as HTMLInputElement;
    this.selectChordProgressionPreset = document.getElementById('select-chord-progression-preset') as HTMLSelectElement;
    this.progressionCardsContainer = document.getElementById('progression-cards-container')!;
    this.btnResetProgression = document.getElementById('btn-reset-progression') as HTMLButtonElement;

    // 📊 MIDI 音樂檔全景透視元件綁定
    this.midiInspectorPanel = document.getElementById('midi-song-inspector-panel');
    this.midiKpiGrid = document.getElementById('midi-kpi-grid');
    this.midiChGrid = document.getElementById('midi-ch-grid');
    this.midiChSectionTitle = document.getElementById('midi-ch-section-title');
    this.midiMarkersSummary = document.getElementById('midi-markers-summary');
    this.inputMidiStartBar = document.getElementById('input-midi-start-bar') as HTMLInputElement | null;
    this.inputMidiEndBar = document.getElementById('input-midi-end-bar') as HTMLInputElement | null;
    this.labelMidiTotalBarsHint = document.getElementById('label-midi-total-bars-hint');
    this.btnApplyMidiBarRange = document.getElementById('btn-apply-midi-bar-range') as HTMLButtonElement | null;
    this.btnStopMidiBarRange = document.getElementById('btn-stop-midi-bar-range') as HTMLButtonElement | null;
    this.btnTogglePartMatrix = document.getElementById('btn-toggle-part-matrix') as HTMLButtonElement | null;
    this.partAssignMatrixPanel = document.getElementById('part-assign-matrix-panel');
    this.btnOpenSliceModal = document.getElementById('btn-open-slice-modal') as HTMLButtonElement | null;
    this.chordAuditionBar = document.getElementById('chord-audition-bar');
    this.sectionMatrixPanel = document.getElementById('section-matrix-panel');
    this.mixerPanel = document.getElementById('mixer-panel');

    // 🎹 Multi Pad (.PAD) 工作台元件綁定
    this.padStudioPanel = document.getElementById('pad-studio-panel');
    this.padStudioCmBadge = document.getElementById('pad-studio-cm-badge');
    this.btnExportPadFile = document.getElementById('btn-export-pad-file') as HTMLButtonElement | null;
    this.padAutoKeyBadge = document.getElementById('pad-auto-key-badge');
    this.padKeyReasonText = document.getElementById('pad-key-reason-text');
    this.selectPadSourceKey = document.getElementById('select-pad-source-key') as HTMLSelectElement | null;
    this.selectPadTargetKey = document.getElementById('select-pad-target-key') as HTMLSelectElement | null;
    this.selectPadShiftDir = document.getElementById('select-pad-shift-dir') as HTMLSelectElement | null;
    this.inputPadKeySuffix = document.getElementById('input-pad-key-suffix') as HTMLInputElement | null;
    this.padShiftPreviewBadge = document.getElementById('pad-shift-preview-badge');
    this.btnApplyPadTranspose = document.getElementById('btn-apply-pad-transpose') as HTMLButtonElement | null;
    this.padCardsGrid = document.getElementById('pad-cards-grid');
    this.padStudioStatusMsg = document.getElementById('pad-studio-status-msg');
    this.initPadStudioControls();
  }

  private setupEventListeners() {
    // Tier 2-1: 段落小節長度調整快捷按鈕
    document.querySelectorAll('.btn-sec-bar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bars = parseInt((btn as HTMLElement).dataset.bars || '4', 10);
        this.resizeCurrentSection(bars);
      });
    });

    if (this.btnOpenAddSection) {
      this.btnOpenAddSection.addEventListener('click', () => {
        this.openAddSectionModal();
      });
    }

    if (this.btnOpenSectionClone) {
      this.btnOpenSectionClone.addEventListener('click', () => {
        this.openSectionCloneModal();
      });
    }

    if (this.btnOpenSectionImport) {
      this.btnOpenSectionImport.addEventListener('click', () => {
        this.openSectionImportModal();
      });
    }

    if (this.btnOpenNewStyle) {
      this.btnOpenNewStyle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNewStyleModal();
      });
    }

    if (this.btnApplyCustomBars) {
      this.btnApplyCustomBars.addEventListener('click', () => {
        const val = parseInt(this.inputCustomBars.value, 10);
        if (!isNaN(val) && val >= 1 && val <= 32) {
          this.resizeCurrentSection(val);
        } else {
          alert('請輸入有效的小節數 (1 ~ 32)');
        }
      });
    }

    if (this.inputCustomBars) {
      this.inputCustomBars.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.btnApplyCustomBars.click();
        }
      });
    }

    // 檔案拖曳與點選
    this.dropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
    });

    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    });

    // 示範曲快速按鈕
    document.querySelectorAll('.sample-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const file = target.getAttribute('data-file');
        if (file) {
          this.loadSampleByUrl(`/samples/${file}`, file);
        }
      });
    });

    // 播放主控
    this.btnPlay.addEventListener('click', () => {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }

      if (styPlaybackEngine.getIsPlaying() && styPlaybackEngine.getChannelSolo() === null) {
        styPlaybackEngine.stop();
        this.updatePlayStateUI();
      } else {
        // 全曲模式：解除任何 Solo，全軌發聲
        styPlaybackEngine.setChannelSolo(null);
        this.syncMixerSoloButtons();
        styPlaybackEngine.play();
        this.updatePlayStateUI();
      }
    });

    // 🎧 單軌獨奏播放
    this.btnPlaySolo.addEventListener('click', () => {
      this.toggleSoloPlay();
    });

    this.btnStop.addEventListener('click', () => {
      styPlaybackEngine.stop();
      this.updatePlayStateUI();
      this.trackEditor?.updatePlayhead(0);
      const totalBars = styPlaybackEngine.getTotalBars();
      this.labelPosition.textContent = `小節 01 / ${totalBars.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
    });

    // 焦點橫幅快捷按鈕
    this.btnBannerSolo.addEventListener('click', () => {
      const currentSolo = styPlaybackEngine.getChannelSolo();
      const nextSolo = currentSolo === this.focusedChannel ? null : this.focusedChannel;
      styPlaybackEngine.setChannelSolo(nextSolo);
      this.syncMixerSoloButtons();
      this.updatePlayStateUI();
    });

    this.focusedTrackVoice.style.cursor = 'pointer';
    this.focusedTrackVoice.title = '點擊開啟 Yamaha 原廠音色庫更換音色';
    this.focusedTrackVoice.addEventListener('click', () => {
      this.openVoicePickerForChannel(this.focusedChannel);
    });

    this.btnBannerMute.addEventListener('click', () => {
      const isMuted = styPlaybackEngine.isChannelMuted(this.focusedChannel);
      styPlaybackEngine.setChannelMute(this.focusedChannel, !isMuted);
      const cardBtn = document.getElementById(`btn-mute-${this.focusedChannel}`);
      if (cardBtn) cardBtn.classList.toggle('muted', !isMuted);
      this.updateFocusedBanner();
    });

    this.btnLoop.addEventListener('click', () => {
      const current = styPlaybackEngine.getLoop();
      styPlaybackEngine.setLoop(!current);
      this.btnLoop.classList.toggle('active', !current);
      this.btnLoop.textContent = !current ? '🔁 循環: 開啟' : '➡️ 循環: 單次';
    });

    // 全域總音量調整
    this.sliderMasterVol.addEventListener('input', () => {
      const val = parseInt(this.sliderMasterVol.value, 10);
      this.labelMasterVolValue.textContent = `${val}%`;
      styPlaybackEngine.setMasterVolume(val);
    });

    this.btnMasterVolReset.addEventListener('click', () => {
      this.sliderMasterVol.value = '100';
      this.labelMasterVolValue.textContent = '100%';
      styPlaybackEngine.setMasterVolume(100);
    });

    // 速度調整
    this.sliderBpm.addEventListener('input', () => {
      const val = parseInt(this.sliderBpm.value, 10);
      this.labelBpmValue.textContent = val.toString();
      styPlaybackEngine.setBpm(val);
    });

    document.getElementById('btn-bpm-minus-10')?.addEventListener('click', () => this.adjustBpm(-10));
    document.getElementById('btn-bpm-minus-1')?.addEventListener('click', () => this.adjustBpm(-1));
    document.getElementById('btn-bpm-plus-1')?.addEventListener('click', () => this.adjustBpm(1));
    document.getElementById('btn-bpm-plus-10')?.addEventListener('click', () => this.adjustBpm(10));
    document.getElementById('btn-bpm-reset')?.addEventListener('click', () => {
      this.sliderBpm.value = this.baseBpm.toString();
      this.labelBpmValue.textContent = this.baseBpm.toString();
      styPlaybackEngine.setBpm(this.baseBpm);
    });

    // 聲音輸出模式切換
    this.btnOutputWebAudio.addEventListener('click', () => {
      this.setOutputMode('webaudio');
    });

    this.btnOutputMidi.addEventListener('click', async () => {
      await this.setOutputMode('midi');
    });

    this.btnOutputBoth?.addEventListener('click', async () => {
      await this.setOutputMode('both');
    });

    this.selectMidiPort.addEventListener('change', () => {
      if (this.selectMidiPort.value) {
        midiManager.selectOutput(this.selectMidiPort.value);
        const name = midiManager.getSelectedOutput()?.name || 'MIDI';
        this.midiStatusPill.textContent = `🟢 已連線: ${name}`;
        this.midiStatusPill.classList.add('connected');
        const mode = styPlaybackEngine.getOutputMode();
        this.outputCurrentStatus.textContent = mode === 'both'
          ? `⚡ 當前輸出：雙模同步 (電腦 + ${name})`
          : `🎹 當前輸出：實體電子琴 (${name})`;
        styPlaybackEngine.syncAllPartsToMidi({ panicFirst: false, resetExpression: !styPlaybackEngine.getIsPlaying() });
      }
    });

    this.selectMidiInPort?.addEventListener('change', () => {
      if (this.selectMidiInPort.value) {
        midiManager.selectInput(this.selectMidiInPort.value);
      }
    });

    this.btnRefreshMidi.addEventListener('click', async () => {
      await this.refreshMidiPorts();
    });

    this.btnSyncMidiParts?.addEventListener('click', () => {
      styPlaybackEngine.syncAllPartsToMidi({ panicFirst: false, resetExpression: !styPlaybackEngine.getIsPlaying() });
    });

    this.btnTestPiano.addEventListener('click', () => {
      midiManager.playTestChime(0);
    });

    this.btnTestMidiDrums?.addEventListener('click', () => {
      midiManager.playTestDrums(9);
    });

    this.btnTestMidiBass?.addEventListener('click', () => {
      midiManager.playTestBass(10);
    });

    this.btnTestMidiChord?.addEventListener('click', () => {
      midiManager.playTestChord(11);
    });

    this.btnMidiPanic?.addEventListener('click', () => {
      midiManager.panicAllChannels();
    });

    // ✨ 空間效果 (Reverb & Chorus) 展開/收合開關
    const btnToggleFx = document.getElementById('btn-toggle-fx');
    btnToggleFx?.addEventListener('click', () => {
      this.isFxVisible = !this.isFxVisible;
      btnToggleFx.classList.toggle('active', this.isFxVisible);
      const fxGroups = this.mixerContainer.querySelectorAll('.part-fx-group');
      fxGroups.forEach((grp) => {
        grp.classList.toggle('collapsed', !this.isFxVisible);
      });
    });

    // 💾 匯出 STY 伴奏檔案
    this.btnExportSty.addEventListener('click', () => {
      this.exportCurrentStyle();
    });

    // 🔙 返回 MIDI 原曲繼續切片
    this.btnReturnToMidi?.addEventListener('click', () => {
      this.switchToMidiSongMode();
    });

    // 🎯 MIDI 音樂檔小節區間試聽定位器事件
    this.btnApplyMidiBarRange?.addEventListener('click', () => {
      if (!this.currentSongAnalysis || !styPlaybackEngine.getIsSongMode()) return;
      const total = this.currentSongAnalysis.totalBars;
      const s = Math.max(1, Math.min(total, parseInt(this.inputMidiStartBar?.value || '1', 10) || 1));
      const e = Math.max(s, Math.min(total, parseInt(this.inputMidiEndBar?.value || String(total), 10) || total));
      this.applyMidiSongBarRange(s, e, true);
    });

    this.btnStopMidiBarRange?.addEventListener('click', (e) => {
      e.stopPropagation();
      styPlaybackEngine.stop();
      this.updatePlayStateUI();
      this.trackEditor?.updatePlayhead(0);
      if (this.currentSongAnalysis) {
        const s = parseInt(this.inputMidiStartBar?.value || '1', 10) || 1;
        const total = this.currentSongAnalysis.totalBars;
        const eBar = parseInt(this.inputMidiEndBar?.value || String(total), 10) || total;
        this.labelPosition.textContent = `小節 ${s.toString().padStart(2, '0')} / ${eBar.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
      }
    });

    // 🔍 伴奏映射指派總表面板切換開關
    this.btnTogglePartMatrix?.addEventListener('click', () => {
      this.isPartMatrixVisible = !this.isPartMatrixVisible;
      if (this.partAssignMatrixPanel) {
        this.partAssignMatrixPanel.style.display = this.isPartMatrixVisible ? 'block' : 'none';
      }
      if (this.btnTogglePartMatrix) {
        this.btnTogglePartMatrix.classList.toggle('active', this.isPartMatrixVisible);
        this.btnTogglePartMatrix.innerHTML = this.isPartMatrixVisible
          ? `<span>✖ 收合伴奏映射指派總表</span>`
          : `<span>🔍 檢視伴奏映射指派總表 (Part Assign Matrix)</span>`;
      }
      if (this.isPartMatrixVisible && this.currentSongAnalysis) {
        this.renderPartAssignMatrix(this.currentSongAnalysis);
      }
    });

    // ✂️ 開啟小節切片指派至伴奏段落彈窗
    this.btnOpenSliceModal?.addEventListener('click', () => {
      if (!this.currentSongAnalysis || !styPlaybackEngine.getIsSongMode()) {
        alert('請先拖入或開啟一般 MIDI 音樂檔以進行小節切片！');
        return;
      }
      const total = this.currentSongAnalysis.totalBars;
      const s = Math.max(1, Math.min(total, parseInt(this.inputMidiStartBar?.value || '1', 10) || 1));
      const e = Math.max(s, Math.min(total, parseInt(this.inputMidiEndBar?.value || String(total), 10) || total));

      this.midiSliceAssignModal.open(
        this.currentSongAnalysis,
        s,
        e,
        null, // 每次切片重新依據當前選定小節動態嗅探生效樂器
        (sliceConfig) => {
          this.handleMidiSliceAssignConfirm(sliceConfig);
        },
        (isSoloAccomp, excludedChannels) => {
          this.handleAccompAudition(isSoloAccomp, excludedChannels);
        },
        this.currentParsed || undefined
      );
    });

    document.querySelectorAll('#midi-quick-range-btns .midi-locator-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.currentSongAnalysis || !styPlaybackEngine.getIsSongMode()) return;
        const total = this.currentSongAnalysis.totalBars;
        const range = (btn as HTMLElement).getAttribute('data-range') || 'all';
        if (range === 'all') {
          this.applyMidiSongBarRange(1, total, true);
        } else if (range === '1-4') {
          this.applyMidiSongBarRange(1, Math.min(total, 4), true);
        } else if (range === '1-8') {
          this.applyMidiSongBarRange(1, Math.min(total, 8), true);
        } else if (range === '1-16') {
          this.applyMidiSongBarRange(1, Math.min(total, 16), true);
        }
      });
    });
  }

  private async setOutputMode(mode: PlaybackOutputMode) {
    this.btnOutputWebAudio.classList.toggle('active', mode === 'webaudio');
    this.btnOutputMidi.classList.toggle('active', mode === 'midi');
    this.btnOutputBoth?.classList.toggle('active', mode === 'both');

    if (mode === 'webaudio') {
      this.midiDrawer.style.display = 'none';
      this.outputCurrentStatus.textContent = '🔊 當前輸出：電腦喇叭 / 耳機 (Web Audio)';
      styPlaybackEngine.setOutputMode('webaudio');
    } else {
      this.midiDrawer.style.display = 'flex';
      await this.refreshMidiPorts();
      const selected = midiManager.getSelectedOutput();
      const name = selected?.name || 'PSR-SX920 (等待接線)';
      this.outputCurrentStatus.textContent = mode === 'both'
        ? `⚡ 當前輸出：雙模同步 (電腦 + ${name})`
        : `🎹 當前輸出：實體電子琴 (${name})`;
      styPlaybackEngine.setOutputMode(mode);
    }
  }

  private async refreshMidiPorts() {
    if (!midiManager.isSupported()) {
      this.midiStatusPill.textContent = '❌ 瀏覽器不支援 Web MIDI';
      return;
    }
    await midiManager.requestAccess();
    const ports = midiManager.getAvailableOutputs();
    this.selectMidiPort.innerHTML = '';

    if (this.midiSysexBadge) {
      const hasOut = midiManager.getSelectedOutput() !== null;
      const sysexStr = midiManager.hasSysex() ? 'XG/GM SysEx 已啟用' : '標準 MIDI 模式';
      this.midiSysexBadge.textContent = hasOut ? `🟢 實體琴連線 (${sysexStr})` : `🟡 離線監控中 (${sysexStr})`;
    }

    if (ports.length === 0) {
      this.midiStatusPill.textContent = '⚪ 未偵測到 MIDI 設備';
      this.midiStatusPill.classList.remove('connected');
      const opt = document.createElement('option');
      opt.textContent = '無可用 MIDI 設備 (請接上 USB 線)';
      opt.disabled = true;
      opt.selected = true;
      this.selectMidiPort.appendChild(opt);
    } else {
      const selected = midiManager.getSelectedOutput();
      ports.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
                const isPort1 = /(?:port\s*1|workstation\s*1|-1\b|\b1\b)/i.test(p.name);
        const isPort2 = /(?:port\s*2|workstation\s*2|-2\b|\b2\b)/i.test(p.name);
        let portTag = '';
        if (isPort1) portTag = ' (Port 1 · 推薦主動脈 / 全 16 軌 Song)';
        else if (isPort2) portTag = ' (Port 2 · 伴奏模式)';
        else if (p.isRecommended) portTag = ' (推薦 Yamaha 設備)';
        opt.textContent = p.name + portTag;
        if (selected && selected.id === p.id) {
          opt.selected = true;
        }
        this.selectMidiPort.appendChild(opt);
      });
      const name = selected?.name || ports[0].name;
      this.midiStatusPill.textContent = `🟢 已連線: ${name}`;
      this.midiStatusPill.classList.add('connected');
    }

    // 更新實體琴鍵 MIDI 輸入埠
    if (this.selectMidiInPort) {
      const inPorts = midiManager.getAvailableInputs();
      this.selectMidiInPort.innerHTML = '';
      if (inPorts.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '無可用 MIDI 輸入設備';
        opt.disabled = true;
        opt.selected = true;
        this.selectMidiInPort.appendChild(opt);
      } else {
        const selectedIn = midiManager.getSelectedInput();
        inPorts.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name + (p.isRecommended ? ' (推薦 Yamaha 琴鍵輸入)' : '');
          if (selectedIn && selectedIn.id === p.id) {
            opt.selected = true;
          }
          this.selectMidiInPort.appendChild(opt);
        });
      }
    }
  }

  private adjustBpm(delta: number) {
    const current = parseInt(this.sliderBpm.value, 10);
    const next = Math.max(40, Math.min(260, current + delta));
    this.sliderBpm.value = next.toString();
    this.labelBpmValue.textContent = next.toString();
    styPlaybackEngine.setBpm(next);
  }

  private setupEngineCallbacks() {
    styPlaybackEngine.setOnTick((bar, beat, tick, totalBars) => {
      const barStr = bar.toString().padStart(2, '0');
      const totalStr = totalBars.toString().padStart(2, '0');
      const tickStr = tick.toString().padStart(6, '0');
      this.labelPosition.textContent = `小節 ${barStr} / ${totalStr} | 拍 ${beat.toFixed(1)} | Tick ${tickStr}`;
      this.trackEditor?.updatePlayhead(tick);
    });

    // 發聲活動 LED
    styPlaybackEngine.setOnActivity((channels) => {
      channels.forEach((ch) => {
        const led = document.getElementById(`led-ch-${ch}`);
        if (led) {
          led.classList.add('flash');
          setTimeout(() => led.classList.remove('flash'), 120);
        }
      });
    });

    // 播放狀態變更監聽 (當單次播完自動停止或手動停止時，同步刷新按鈕狀態)
    styPlaybackEngine.setOnPlayStateChange(() => {
      this.updatePlayStateUI();
    });

    // 全曲 / 單段落單次播完 (On Ended) 自動歸零重設指針與小節顯示
    styPlaybackEngine.setOnEnded(() => {
      this.updatePlayStateUI();
      this.trackEditor?.updatePlayhead(0);
      const totalBars = styPlaybackEngine.getTotalBars();
      this.labelPosition.textContent = `小節 01 / ${totalBars.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
    });
  }

  private async loadSampleByUrl(url: string, name: string) {
    try {
      this.labelStyleTitle.textContent = `載入示範伴奏: ${name}...`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      this.parseAndLoadBytes(new Uint8Array(arrayBuffer), name);
    } catch (e: any) {
      console.warn('載入示範曲失敗:', e);
      this.labelStyleTitle.textContent = `請選擇或拖曳 STY 伴奏檔案至上方`;
    }
  }

  private async loadFile(file: File) {
    this.labelStyleTitle.textContent = `讀取檔案: ${file.name}...`;
    const buf = await file.arrayBuffer();
    this.parseAndLoadBytes(new Uint8Array(buf), file.name);
  }

  private parseAndLoadBytes(bytes: Uint8Array, name: string) {
    try {
      const isPadFile = /\.pad$/i.test(name.trim());
      const parsed = YamahaParser.parse(bytes, isPadFile ? 'PAD' : 'STY');
      const analysis = MidiSongAnalyzer.analyze(parsed, name);
      this.currentParsed = parsed;
      this.currentSongAnalysis = analysis;
      this.currentFileName = name;
      this.baseBpm = analysis.initialBpm || parsed.bpm || 120;
      this.lastTransposedKeySuffix = '';

      styPlaybackEngine.loadParsed(parsed);
      this.syncMixerVolumes();
      this.trackEditor?.clearHistory();

      // 更新速度
      this.sliderBpm.value = this.baseBpm.toString();
      this.labelBpmValue.textContent = this.baseBpm.toString();

      // 1. 判斷是否為 Yamaha Multi Pad (.PAD) 檔案
      if (isPadFile || parsed.format === 'PAD') {
        parsed.format = 'PAD';
        if (this.btnReturnToMidi) this.btnReturnToMidi.style.display = 'none';
        if (this.padStudioPanel) this.padStudioPanel.style.display = 'flex';
        if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'none';
        if (this.chordAuditionBar) this.chordAuditionBar.style.display = 'none';
        if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = 'none';
        if (this.mixerPanel) this.mixerPanel.style.display = 'none';
        if (this.btnExportSty) {
          this.btnExportSty.style.display = '';
          this.btnExportSty.innerHTML = '<span>💾</span><span>匯出 .PAD 檔案</span>';
        }

        this.activeSectionName = '__MIDI_SONG__';
        styPlaybackEngine.loadSongMode(1, Math.max(1, analysis.totalBars));

        const diag = YamahaPadModifier.analyzePadProject(parsed);
        this.currentPadDiagnosis = diag;
        this.initialPadDiagnosis = diag;
        this.currentPadTotalSemitoneShift = 0;

        // 保存載入時的原始 4 軌音符基準快照，確保每次切換原調/目標調皆從原始音高精準計算，絕不重複疊加或竄改原調下拉選單
        this.originalPadTrackNotes.clear();
        this.selectedPadNumsForTranspose.clear();
        for (let padNum = 1; padNum <= 4; padNum++) {
          const notes = YamahaPadModifier.extractTrackNotes(parsed.tracks[padNum]);
          this.originalPadTrackNotes.set(padNum, notes.map(n => ({ ...n })));
          const trkDiag = diag.tracks[padNum - 1];
          // 預設勾選所有非鼓組且有音符之軌道參與移調
          if (trkDiag && trkDiag.noteCount > 0 && trkDiag.musicalType !== 'DRUM_SFX') {
            this.selectedPadNumsForTranspose.add(padNum);
          }
        }
        if (this.selectedPadNumsForTranspose.size === 0) {
          [1, 2, 3, 4].forEach(n => this.selectedPadNumsForTranspose.add(n));
        }

        this.labelStyleTitle.textContent = `🎹 ${name} (Yamaha Multi Pad 插音檔)`;
        const cmStr = `CM${(parsed.padConfig?.chordMatchFlags || [false, false, false, false]).map(f => (f ? '1' : '0')).join('')}`;
        const rpStr = `RP${(parsed.padConfig?.repeatFlags || [false, false, false, false]).map(f => (f ? '1' : '0')).join('')}`;
        this.labelStyleInfo.textContent = `格式: Multi Pad SMF1 (5 軌) ｜ 自動估算基準調: ${diag.estimatedKeyLabelZh} ｜ 控制碼: ${cmStr} / ${rpStr} ｜ 速度: ${this.baseBpm} BPM ｜ 總小節: ${analysis.totalBars} 小節 ｜ 總音符: ${analysis.totalNotes} 顆`;

        // 預填原曲基準調 (使用者可隨時手動更改) 與預設目標調 (若使用者先前已選擇目標調則自動記憶保留)
        if (this.selectPadSourceKey) {
          this.selectPadSourceKey.value = diag.estimatedKey;
        }
        if (this.selectPadTargetKey) {
          const defaultTarget = (this.userPreferredTargetKey && PAD_KEY_LIST.some(k => k.key === this.userPreferredTargetKey))
            ? this.userPreferredTargetKey
            : (diag.estimatedKey === 'Am' ? 'Em' : 'Am');
          this.selectPadTargetKey.value = defaultTarget;
          if (this.inputPadKeySuffix) this.inputPadKeySuffix.value = defaultTarget;
        }

        const firstActivePad = diag.tracks.find(t => t.noteCount > 0);
        this.focusedChannel = firstActivePad ? firstActivePad.channel : 0;

        this.renderPadStudioDashboard();
        this.setFocusedChannel(this.focusedChannel);
        this.labelPosition.textContent = `小節 01 / ${Math.max(1, analysis.totalBars).toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
        this.updatePlayStateUI();
        return;
      }

      if (this.padStudioPanel) this.padStudioPanel.style.display = 'none';
      if (this.btnExportSty) {
        this.btnExportSty.innerHTML = '<span>💾</span><span>匯出 STY 伴奏檔</span>';
      }

      // 2. 判斷是否為標準 MIDI 音樂檔 (非 Yamaha STY 伴奏檔)
      if (analysis.isGeneralMidiSong) {
        this.sourceSongParsed = parsed;
        this.sourceSongAnalysis = analysis;
        this.sourceSongFileName = name;
        if (this.btnReturnToMidi) this.btnReturnToMidi.style.display = 'none';

        this.activeSectionName = '__MIDI_SONG__';
        styPlaybackEngine.loadSongMode(1, analysis.totalBars);

        // 切換介面為「MIDI 音樂檔全景透視與 16 通道直播模式」（不建立假段落）
        if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'flex';
        if (this.chordAuditionBar) this.chordAuditionBar.style.display = 'none';
        if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = 'none';
        if (this.mixerPanel) this.mixerPanel.style.display = 'none';
        if (this.btnExportSty) this.btnExportSty.style.display = 'none';

        this.labelStyleTitle.textContent = `🎼 ${name} (標準 MIDI 音樂檔)`;
        const tempoStr = analysis.hasTempoChanges
          ? `${analysis.initialBpm} BPM (曲中變速 ${analysis.minBpm}~${analysis.maxBpm} BPM)`
          : `${analysis.initialBpm} BPM`;
        this.labelStyleInfo.textContent = `格式: SMF Format ${analysis.midiFormat} (${analysis.trackCount} 軌) ｜ 總小節: ${analysis.totalBars} 小節 (${analysis.formattedDuration}) ｜ 速度: ${tempoStr} ｜ 拍號: ${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator} ｜ 發聲通道: ${analysis.channelsWithNotesCount} 個 CH ｜ 總音符: ${analysis.totalNotes.toLocaleString()} 顆`;

        const firstActiveCh = analysis.channelsWithNotes[0]?.channel ?? analysis.activeChannels[0]?.channel ?? 0;
        this.focusedChannel = firstActiveCh;

        this.renderMidiSongInspector(analysis);
        this.setFocusedChannel(firstActiveCh);
        this.labelPosition.textContent = `小節 01 / ${analysis.totalBars.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
        this.updatePlayStateUI();
        return;
      }

      // Yamaha STY 伴奏檔模式：顯示伴奏段落矩陣、虛擬和弦轉調與 8 大伴奏混音盤
      if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'none';
      if (this.chordAuditionBar) this.chordAuditionBar.style.display = '';
      if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = '';
      if (this.mixerPanel) this.mixerPanel.style.display = '';
      if (this.btnExportSty) this.btnExportSty.style.display = '';

      // 更新樣式資訊
      this.labelStyleTitle.textContent = `🎵 ${name}`;
      const hasSff2 = parsed.tracks.some(t => t.events.some(e => e.channel !== undefined && e.channel >= 8 && e.channel <= 15));
      this.labelStyleInfo.textContent = `格式: ${hasSff2 ? 'SFF2 (現代高音質)' : 'SFF1'} | 初始速度: ${parsed.bpm} BPM | 拍號: ${parsed.timeSignature.numerator}/${parsed.timeSignature.denominator} | PPQ: ${parsed.division} | 段落數: ${parsed.sections.length}`;

      // 渲染段落按鈕
      this.renderSectionButtons();

      // 預設選擇 Intro B (若有) 或 Main A
      const sections = styPlaybackEngine.getSections();
      const defaultSec = sections.find(s => s.name.toLowerCase() === 'intro b')
        || sections.find(s => s.name.toLowerCase() === 'main a')
        || sections[0];

      if (defaultSec) {
        this.selectSection(defaultSec.name);
      }

      this.updatePlayStateUI();
    } catch (err: any) {
      console.error('解析檔案失敗:', err);
      alert(`解析檔案失敗: ${err.message}`);
      this.labelStyleTitle.textContent = `解析失敗: ${err.message}`;
    }
  }

  private getChannelPartDef(channel: number): PartDef {
    if (!styPlaybackEngine.getIsSongMode()) {
      const found = YAMAHA_PARTS.find(p => p.channel === channel);
      if (found) return found;
    }
    const chAnalysis = this.currentSongAnalysis?.activeChannels.find(c => c.channel === channel);
    const trkLabel = chAnalysis?.trackNames[0] || (channel === 9 ? 'Drum Kit (打擊鼓組)' : `MIDI 通道 ${channel + 1}`);
    const palette = [
      '#38bdf8', '#10b981', '#f59e0b', '#a855f7',
      '#ec4899', '#06b6d4', '#3b82f6', '#84cc16',
      '#f97316', '#ef4444', '#6366f1', '#14b8a6',
      '#eab308', '#d946ef', '#0ea5e9', '#fb7185'
    ];
    return {
      channel,
      label: trkLabel,
      defaultName: chAnalysis?.voiceName || `MIDI CH ${channel + 1}`,
      color: palette[channel % palette.length],
    };
  }

  private applyMidiSongBarRange(startBar: number, endBar: number, autoPlay: boolean = false) {
    if (!this.currentSongAnalysis || !styPlaybackEngine.getIsSongMode()) return;
    styPlaybackEngine.loadSongMode(startBar, endBar);
    if (this.inputMidiStartBar) this.inputMidiStartBar.value = String(startBar);
    if (this.inputMidiEndBar) this.inputMidiEndBar.value = String(endBar);

    const total = this.currentSongAnalysis.totalBars;
    document.querySelectorAll('#midi-quick-range-btns .midi-locator-btn').forEach((btn) => {
      const r = (btn as HTMLElement).getAttribute('data-range');
      const isMatch =
        (r === 'all' && startBar === 1 && endBar === total) ||
        (r === '1-4' && startBar === 1 && endBar === Math.min(total, 4)) ||
        (r === '1-8' && startBar === 1 && endBar === Math.min(total, 8)) ||
        (r === '1-16' && startBar === 1 && endBar === Math.min(total, 16));
      btn.classList.toggle('active', isMatch);
    });

    this.labelPosition.textContent = `小節 ${startBar.toString().padStart(2, '0')} / ${endBar.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;
    this.updateFocusedBanner();
    this.refreshTrackEditor();

    if (autoPlay) {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
      styPlaybackEngine.play();
      this.updatePlayStateUI();
    }
  }

  private renderMidiSongInspector(analysis: MidiSongAnalysis) {
    if (!this.midiKpiGrid || !this.midiChGrid) return;

    // 1. 渲染 5 張頂部關鍵指標卡 (Summary KPI Cards)
    const tempoMain = `${analysis.initialBpm} BPM`;
    const tempoSub = analysis.hasTempoChanges
      ? `曲中變速：${analysis.minBpm} ~ ${analysis.maxBpm} BPM (共 ${analysis.tempoEvents.length} 處速度標記)`
      : `全曲恆定速度 (無中途變速事件)`;

    const chListStr = analysis.channelsWithNotes.map(c => `CH${c.displayChannel}`).join(', ') || '無';
    const catListStr = analysis.instrumentCategories.length > 0
      ? analysis.instrumentCategories.join(' · ')
      : '尚未指定';

    const uniqueVoiceNames = Array.from(
      new Set(analysis.channelsWithNotes.map(c => c.voiceName.split(' (')[0]))
    );
    const voiceSummaryMain = `${uniqueVoiceNames.length} 種樂器音色`;
    const voiceSummarySub = uniqueVoiceNames.slice(0, 4).join('、') + (uniqueVoiceNames.length > 4 ? ` 等` : '');

    this.midiKpiGrid.innerHTML = `
      <div class="midi-kpi-card">
        <div class="midi-kpi-label">📏 總小節數與播放時長</div>
        <div class="midi-kpi-value" style="color: #38bdf8;">共 ${analysis.totalBars} 小節 <span style="font-size: 0.92rem; font-weight: 600; color: #94a3b8;">(${analysis.formattedDuration})</span></div>
        <div class="midi-kpi-sub">總長度 ${analysis.totalTicks.toLocaleString()} Ticks ｜ 每小節 ${analysis.ticksPerBar} Ticks</div>
      </div>
      <div class="midi-kpi-card">
        <div class="midi-kpi-label">⏱️ 音樂速度 (Tempo)</div>
        <div class="midi-kpi-value" style="color: #34d399;">${tempoMain}</div>
        <div class="midi-kpi-sub">${tempoSub}</div>
      </div>
      <div class="midi-kpi-card">
        <div class="midi-kpi-label">🎼 拍號 · 調性 · 檔案規格</div>
        <div class="midi-kpi-value" style="color: #fbbf24;">${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator} 拍 <span style="font-size: 0.85rem; font-weight: 600; color: #fde68a;">· ${analysis.keySignatureLabel.split(' ')[0]} ${analysis.keySignatureLabel.split(' ')[1] || ''}</span></div>
        <div class="midi-kpi-sub">SMF Format ${analysis.midiFormat} (${analysis.trackCount} 音軌) ｜ 解析度 ${analysis.division} PPQ</div>
      </div>
      <div class="midi-kpi-card">
        <div class="midi-kpi-label">🎹 發聲通道與總音符數</div>
        <div class="midi-kpi-value" style="color: #c084fc;">${analysis.channelsWithNotesCount} 個發聲通道 <span style="font-size: 0.88rem; font-weight: 600; color: #d8b4fe;">(${analysis.totalNotes.toLocaleString()} 顆音符)</span></div>
        <div class="midi-kpi-sub">活躍通道：${chListStr}</div>
      </div>
      <div class="midi-kpi-card">
        <div class="midi-kpi-label">🎷 使用樂器種類總覽</div>
        <div class="midi-kpi-value" style="color: #fb7185;">${voiceSummaryMain}</div>
        <div class="midi-kpi-sub" title="${uniqueVoiceNames.join('、')}">類別：${catListStr} (${voiceSummarySub || '無'})</div>
      </div>
    `;

    // 2. 更新小節區間試聽定位器
    if (this.inputMidiStartBar) {
      this.inputMidiStartBar.max = String(analysis.totalBars);
      this.inputMidiStartBar.value = '1';
    }
    if (this.inputMidiEndBar) {
      this.inputMidiEndBar.max = String(analysis.totalBars);
      this.inputMidiEndBar.value = String(analysis.totalBars);
    }
    if (this.labelMidiTotalBarsHint) {
      this.labelMidiTotalBarsHint.textContent = `小節 (全曲共 ${analysis.totalBars} 小節 · 不建立預設假段落)`;
    }

    // 3. 更新通道標題與內嵌段落標記摘要
    if (this.midiChSectionTitle) {
      this.midiChSectionTitle.textContent = `🎛️ 發聲通道與使用樂器明細 (共 ${analysis.channelsWithNotesCount} 個發聲通道 / 總計 ${analysis.activeChannels.length} 個配置通道)`;
    }
    if (this.midiMarkersSummary) {
      if (analysis.songMarkers.length > 0) {
        const previewMarkers = analysis.songMarkers.slice(0, 6).map(m => `[第${m.bar}小節: ${m.text}]`).join(' ');
        this.midiMarkersSummary.textContent = `📍 曲內標記 (${analysis.songMarkers.length}): ${previewMarkers}`;
      } else {
        this.midiMarkersSummary.textContent = `💡 點擊任意通道卡片即可切換下方單軌音符捲軸，或直接獨奏/靜音/換音色`;
      }
    }

    // 4. 渲染各通道明細卡片 (優先顯示有音符的通道)
    this.midiChGrid.innerHTML = '';
    const channelsToRender = analysis.channelsWithNotes.length > 0
      ? analysis.channelsWithNotes
      : analysis.activeChannels;

    channelsToRender.forEach((chInfo) => {
      const partDef = this.getChannelPartDef(chInfo.channel);
      const liveVoice = styPlaybackEngine.getPartVoices().get(chInfo.channel);
      const voiceDisplay = liveVoice ? liveVoice.voiceName : chInfo.voiceName;
      const codeDisplay = liveVoice ? (liveVoice.panelCode || `${liveVoice.msb}-${liveVoice.lsb}-${liveVoice.pc + 1}`) : chInfo.panelCode;

      const card = document.createElement('div');
      card.id = `card-ch-${chInfo.channel}`;
      card.className = `midi-ch-card ${chInfo.channel === this.focusedChannel ? 'is-focused' : ''}`;
      card.style.setProperty('--part-accent', partDef.color);

      const catIcon = chInfo.isDrum
        ? '🥁'
        : chInfo.category === 'Percussion'
        ? '🔔'
        : chInfo.category === 'Bass' || chInfo.category.includes('Guitar')
        ? '🎸'
        : chInfo.category.includes('Strings')
        ? '🎻'
        : chInfo.category.includes('Brass') || chInfo.category.includes('Sax') || chInfo.category.includes('Woodwind')
        ? '🎷'
        : '🎹';
      const trkNameBadge = chInfo.trackNames.length > 0 ? chInfo.trackNames.join(' / ') : (chInfo.isDrum ? 'Drums / Percussion' : chInfo.category);
      const barSpanText = chInfo.firstBar !== null && chInfo.lastBar !== null
        ? `第 ${chInfo.firstBar} ~ ${chInfo.lastBar} 小節`
        : '無音符';

      const isMuted = styPlaybackEngine.isChannelMuted(chInfo.channel);
      const isSolo = styPlaybackEngine.getChannelSolo() === chInfo.channel;
      const curVol = styPlaybackEngine.getChannelVolume(chInfo.channel);
      const curPan = styPlaybackEngine.getChannelPan(chInfo.channel);

      card.innerHTML = `
        <div class="midi-ch-header">
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0; flex: 1;">
            <span class="midi-ch-badge" style="border-color: ${partDef.color}; color: ${partDef.color};">CH ${chInfo.displayChannel}</span>
            <span style="font-size: 0.85rem; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;" title="${trkNameBadge}">${trkNameBadge}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #7dd3fc; font-weight: 600; white-space: nowrap;">${chInfo.noteCount.toLocaleString()} 音符 (${chInfo.notePercentage}%)</span>
            <div id="led-ch-${chInfo.channel}" class="activity-led"></div>
          </div>
        </div>

        <button type="button" id="part-voice-${chInfo.channel}" class="midi-ch-voice-btn" title="點擊開啟 Yamaha 2,395 原廠音色庫更換此通道樂器">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${catIcon} ${voiceDisplay}</span>
          <span style="font-size: 0.72rem; color: #38bdf8; flex-shrink: 0; white-space: nowrap;">[${codeDisplay}] ✏️</span>
        </button>

        <div class="midi-ch-bar-track" title="音符佔全曲比例: ${chInfo.notePercentage}%">
          <div class="midi-ch-bar-fill" style="width: ${Math.max(3, Math.min(100, chInfo.notePercentage))}%;"></div>
        </div>

        <div class="midi-ch-meta-row">
          <div class="midi-ch-meta-line">
            <span>📍 區間: <strong style="color: #cbd5e1;">${barSpanText}</strong></span>
            <span>🎵 音域: <strong style="color: #cbd5e1;">${chInfo.pitchRangeLabel}</strong></span>
          </div>
          <div class="midi-ch-meta-line" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
            <span>🏷️ 類別: <strong style="color: #cbd5e1;">${chInfo.category}</strong></span>
            ${chInfo.programChangesCount > 1 ? `
              <span style="color: #f59e0b; font-size: 0.72rem; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; white-space: nowrap; cursor: help;"
                title="${chInfo.programChangeTimeline && chInfo.programChangeTimeline.length > 1 ? chInfo.programChangeTimeline.map(p => `第 ${p.bar} 小節: ${p.voiceName}`).join(' ➔ ') : `更換過 ${chInfo.programChangesCount} 次音色`}">
                ⚡ 曲中換樂器 (${chInfo.programChangesCount})
              </span>
            ` : ''}
          </div>
        </div>

        <div class="midi-ch-footer">
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" id="btn-mute-${chInfo.channel}" class="mixer-btn btn-mute ${isMuted ? 'muted' : ''}" style="flex: 1;">Mute</button>
            <button type="button" id="btn-solo-${chInfo.channel}" class="mixer-btn btn-solo ${isSolo ? 'soloed' : ''}" style="flex: 1;">Solo</button>
            <button type="button" class="mixer-btn" data-focus-ch="${chInfo.channel}" style="flex: 1.4; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #6ee7b7; white-space: nowrap;" title="在下方單軌編輯器展開此通道音符捲軸">🎹 展開音符</button>
          </div>

          <div class="midi-ch-sliders">
            <div class="part-vol-wrap">
              <span class="ctrl-sub-label">VOL</span>
              <input type="range" id="vol-${chInfo.channel}" class="part-vol-slider" min="0" max="127" value="${curVol}">
              <span id="vol-txt-${chInfo.channel}" class="vol-badge">${curVol}</span>
            </div>
            <div class="part-pan-wrap">
              <span class="ctrl-sub-label">PAN</span>
              <input type="range" id="pan-${chInfo.channel}" class="part-pan-slider" min="0" max="127" value="${curPan}">
              <span id="pan-txt-${chInfo.channel}" class="pan-badge">${formatYamahaPan(curPan)}</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.setFocusedChannel(chInfo.channel);
      });

      const voiceBtn = card.querySelector(`#part-voice-${chInfo.channel}`);
      voiceBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openVoicePickerForChannel(chInfo.channel);
      });

      const btnMute = card.querySelector(`#btn-mute-${chInfo.channel}`) as HTMLButtonElement | null;
      btnMute?.addEventListener('click', (e) => {
        e.stopPropagation();
        const muted = styPlaybackEngine.isChannelMuted(chInfo.channel);
        styPlaybackEngine.setChannelMute(chInfo.channel, !muted);
        btnMute.classList.toggle('muted', !muted);
        if (this.focusedChannel === chInfo.channel) {
          this.updateFocusedBanner();
        }
      });

      const btnSolo = card.querySelector(`#btn-solo-${chInfo.channel}`) as HTMLButtonElement | null;
      btnSolo?.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentSolo = styPlaybackEngine.getChannelSolo();
        const nextSolo = currentSolo === chInfo.channel ? null : chInfo.channel;
        styPlaybackEngine.setChannelSolo(nextSolo);
        this.setFocusedChannel(chInfo.channel);
        this.syncMixerSoloButtons();
        this.updatePlayStateUI();
      });

      const btnFocus = card.querySelector(`[data-focus-ch="${chInfo.channel}"]`);
      btnFocus?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFocusedChannel(chInfo.channel);
        document.getElementById('focused-track-banner')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      const sliderVol = card.querySelector(`#vol-${chInfo.channel}`) as HTMLInputElement | null;
      sliderVol?.addEventListener('click', (e) => e.stopPropagation());
      sliderVol?.addEventListener('input', (e) => {
        e.stopPropagation();
        const vol = parseInt(sliderVol.value, 10);
        styPlaybackEngine.setChannelVolume(chInfo.channel, vol);
        const txt = card.querySelector(`#vol-txt-${chInfo.channel}`);
        if (txt) txt.textContent = String(vol);
      });

      const sliderPan = card.querySelector(`#pan-${chInfo.channel}`) as HTMLInputElement | null;
      sliderPan?.addEventListener('click', (e) => e.stopPropagation());
      sliderPan?.addEventListener('input', (e) => {
        e.stopPropagation();
        const pan = parseInt(sliderPan.value, 10);
        styPlaybackEngine.setChannelPan(chInfo.channel, pan);
        const txt = card.querySelector(`#pan-txt-${chInfo.channel}`);
        if (txt) txt.textContent = formatYamahaPan(pan);
      });

      this.midiChGrid!.appendChild(card);
    });

    // 5. 若伴奏映射總表處於開啟狀態，同步重新渲染總表
    if (this.isPartMatrixVisible) {
      this.renderPartAssignMatrix(analysis);
    }
  }

  /**
   * 渲染 Yamaha 8 大伴奏聲部映射指派總表 (Part Assign Matrix)
   * 採用以「樂器名稱與音樂角色為主、原 MIDI Ch 為輔助備註」的直覺排版
   */
  private renderPartAssignMatrix(analysis: MidiSongAnalysis) {
    if (!this.partAssignMatrixPanel) return;

    if (!this.currentPartMappingPlan) {
      this.currentPartMappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);
    }
    const plan = this.currentPartMappingPlan;

    const availableChannels = analysis.activeChannels.filter(c => c.hasNotes && c.noteCount > 0);

    // 建立 8 伴奏聲部卡片 HTML
    const partsCardsHtml = YAMAHA_ARRANGER_PARTS.map((pDef) => {
      const currentSrcCh = plan.partToSourceChannelMap.get(pDef.part);
      const matchedAssignment = currentSrcCh !== undefined
        ? plan.assignments.find(a => a.sourceChannel === currentSrcCh)
        : null;

      const voiceDisplay = matchedAssignment ? matchedAssignment.voiceName : '未指派 (此伴奏聲部靜音)';
      const trackDisplay = matchedAssignment && matchedAssignment.trackNames.length > 0
        ? matchedAssignment.trackNames.join(' / ')
        : (matchedAssignment ? '原曲音軌' : '無');
      const catIcon = pDef.part.includes('Rhythm') ? '🥁' : (pDef.part === 'Bass' ? '🎸' : (pDef.part.includes('Chord') ? '🎹' : (pDef.part === 'Pad' ? '🎻' : '🎷')));

      // 下拉選單選項 (以「樂器名稱」為主，「(CH x)」為小括號備註)
      const optionsHtml = [
        `<option value="-1" ${currentSrcCh === undefined ? 'selected' : ''}>-- 靜音此聲部 (未指派) --</option>`,
        ...availableChannels.map((ch) => {
          const isSelected = currentSrcCh === ch.channel;
          const trkLabel = ch.trackNames[0] ? ` · ${ch.trackNames[0]}` : '';
          return `<option value="${ch.channel}" ${isSelected ? 'selected' : ''}>${ch.voiceName} (${ch.displayChannel}軌${trkLabel}) [${ch.noteCount}音符]</option>`;
        })
      ].join('');

      return `
        <div class="part-assign-card" style="--part-accent: ${this.getChannelPartDef(pDef.channel).color};">
          <div class="part-assign-top">
            <span class="part-target-label">${catIcon} ${pDef.nameZh}</span>
            <span class="part-role-desc">${pDef.defaultRole}</span>
          </div>

          <div class="part-source-box">
            <div class="part-source-voice" title="${voiceDisplay}">
              <span>${voiceDisplay}</span>
            </div>
            <div class="part-source-meta">
              <span>來源軌道: <strong style="color: #cbd5e1;">${trackDisplay}</strong></span>
              <span style="color: #64748b;">${matchedAssignment ? `(原曲 CH ${matchedAssignment.displaySourceChannel} · ${matchedAssignment.noteCount}音符)` : ''}</span>
            </div>
          </div>

          <select class="part-source-select" data-target-part="${pDef.part}" title="自由變更此 Yamaha 伴奏聲部的樂器來源">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    // 建立被排除之主旋律清單 HTML
    const excludedList = plan.assignments.filter(a => a.isExcluded);
    const excludedRowsHtml = excludedList.length > 0
      ? excludedList.map((a) => {
          return `
            <div class="melody-item-row">
              <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span style="font-weight: 700; color: #fca5a5;">${a.voiceName}</span>
                <span style="color: #94a3b8;">· 軌道: ${a.trackNames.join(' / ') || '無'}</span>
                <span style="color: #64748b;">(原曲 CH ${a.displaySourceChannel} · ${a.noteCount} 音符)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <span style="font-size: 0.7rem; color: #f87171; background: rgba(239, 68, 68, 0.15); padding: 1px 6px; border-radius: 4px;">
                  ${a.melodyInfo.reasons[0] || '偵測為主旋律'} (${a.melodyInfo.confidence}%)
                </span>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; cursor: pointer; color: #38bdf8;">
                  <input type="checkbox" class="chk-include-melody" data-channel="${a.sourceChannel}" title="打勾取消排除，強制納入伴奏聲部供指派">
                  <span>納入伴奏</span>
                </label>
              </div>
            </div>
          `;
        }).join('')
      : `<div style="font-size: 0.74rem; color: #94a3b8; padding: 4px 0;">全曲各軌皆判定為常規伴奏樂器，無自動排除項目。</div>`;

    this.partAssignMatrixPanel.innerHTML = `
      <div class="part-matrix-header">
        <div class="part-matrix-title">
          <span>🎼 Yamaha 8 大伴奏聲部映射對照總表 (Part Assign Matrix)</span>
          <span class="part-matrix-badge">已指派 ${plan.assignedCount} 聲部 / 排除 ${plan.excludedCount} 旋律軌</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-reset-part-mapping" class="midi-locator-btn" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); color: #cbd5e1;" title="恢復演算法最佳化自動分配建議">🔄 恢復自動建議</button>
        </div>
      </div>

      <div class="part-matrix-grid">
        ${partsCardsHtml}
      </div>

      <div class="melody-excluded-box">
        <div class="melody-excluded-title">
          <span>🎤 智慧偵測主旋律（已預設排除於伴奏之外，避免伴奏複唱主唱旋律）</span>
        </div>
        ${excludedRowsHtml}
      </div>
    `;

    // 綁定下拉選單切換事件
    this.partAssignMatrixPanel.querySelectorAll('.part-source-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const selectEl = e.target as HTMLSelectElement;
        const targetPart = selectEl.getAttribute('data-target-part') as YamahaPartType;
        const newSrcCh = parseInt(selectEl.value, 10);

        if (newSrcCh === -1) {
          plan.partToSourceChannelMap.delete(targetPart);
          const old = plan.assignments.find(a => a.targetPart === targetPart);
          if (old) {
            old.targetPart = null;
            old.targetChannel = null;
          }
        } else {
          // 若該來源已被指派給其他聲部，先解開舊聲部
          for (const [p, ch] of plan.partToSourceChannelMap.entries()) {
            if (ch === newSrcCh) {
              plan.partToSourceChannelMap.delete(p);
            }
          }
          const assign = plan.assignments.find(a => a.sourceChannel === newSrcCh);
          if (assign) {
            assign.isExcluded = false;
            MidiPartAssignMatrix['bindPart'](assign, targetPart, plan.partToSourceChannelMap);
          }
        }
        plan.assignedCount = plan.partToSourceChannelMap.size;
        this.renderPartAssignMatrix(analysis);
      });
    });

    // 綁定取消排除主旋律 Checkbox 事件
    this.partAssignMatrixPanel.querySelectorAll('.chk-include-melody').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const inputEl = e.target as HTMLInputElement;
        const ch = parseInt(inputEl.getAttribute('data-channel') || '-1', 10);
        const assign = plan.assignments.find(a => a.sourceChannel === ch);
        if (assign) {
          assign.isExcluded = !inputEl.checked;
          plan.excludedCount = plan.assignments.filter(a => a.isExcluded).length;
          this.renderPartAssignMatrix(analysis);
        }
      });
    });

    // 綁定恢復預設建議按鈕
    const btnReset = this.partAssignMatrixPanel.querySelector('#btn-reset-part-mapping');
    btnReset?.addEventListener('click', () => {
      this.currentPartMappingPlan = MidiPartAssignMatrix.createAutoMappingPlan(analysis);
      this.renderPartAssignMatrix(analysis);
    });
  }

  /**
   * 處理純伴奏試聽開關 (暫時 Mute 排除的主旋律通道)
   */
  private handleAccompAudition(isSoloAccomp: boolean, excludedChannels: number[]) {
    if (!styPlaybackEngine.getIsSongMode()) return;
    if (isSoloAccomp) {
      // 記錄正在被伴奏試聽靜音的通道
      this.currentlyAuditionMutedChannels = [...excludedChannels];
      // 靜音所有主旋律軌與未指派軌
      for (const ch of excludedChannels) {
        styPlaybackEngine.setChannelMute(ch, true);
        const btnMute = document.getElementById(`btn-mute-${ch}`);
        btnMute?.classList.add('muted');
      }
      // 確保播放引擎處於播放狀態
      if (!styPlaybackEngine.getIsPlaying()) {
        const ctx = getSharedAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        styPlaybackEngine.play();
        this.updatePlayStateUI();
      }
    } else {
      // 停止播放並恢復原曲各軌發聲
      if (styPlaybackEngine.getIsPlaying()) {
        styPlaybackEngine.stop();
        this.updatePlayStateUI();
      }
      this.restoreAuditionMutedChannels();
    }
  }

  /**
   * 解除純伴奏試聽時被暫時靜音的軌道，恢復原本發聲狀態
   */
  private restoreAuditionMutedChannels() {
    if (this.currentlyAuditionMutedChannels.length > 0) {
      for (const ch of this.currentlyAuditionMutedChannels) {
        styPlaybackEngine.setChannelMute(ch, false);
        const btnMute = document.getElementById(`btn-mute-${ch}`);
        btnMute?.classList.remove('muted');
      }
      this.currentlyAuditionMutedChannels = [];
    }
  }

  /**
   * 確定執行小節切片指派確認，並啟動【第 3 階段】切片裝配引擎
   */
  private handleMidiSliceAssignConfirm(config: MidiSliceAssignConfig) {
    if (!this.currentParsed || !this.currentSongAnalysis) return;

    try {
      const result = MidiSliceAssembler.assembleSliceToSection({
        sourceParsed: this.currentParsed,
        analysis: this.currentSongAnalysis,
        startBar: config.startBar,
        endBar: config.endBar,
        startBeat: config.startBeat,
        endBeat: config.endBeat,
        targetSection: config.targetSection,
        mappingPlan: config.mappingPlan,
        baseStyleParsed: this.workingStyleParsed,
        styleName: `${this.currentFileName.replace(/\.[^/.]+$/, '')}_Arranger`,
        chordMode: config.chordMode,
        normalizeChordsToC: config.normalizeChordsToC,
      });

      this.workingStyleParsed = result.styleParsed;
      this.showSliceAssembleResultModal(result);
    } catch (err: any) {
      console.error('切片裝配失敗:', err);
      alert(`切片裝配失敗: ${err.message || err}`);
    }
  }

  /**
   * 顯示小節切片裝配成功導航對話框
   */
  private showSliceAssembleResultModal(result: MidiSliceAssembleResult) {
    // 移除舊的 Modal (若存在)
    const existing = document.getElementById('slice-assemble-result-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'slice-assemble-result-backdrop';
    backdrop.className = 'add-section-backdrop';
    backdrop.style.display = 'flex';

    const partRowsHtml = result.partDetails.map(p => {
      const icon = p.part.includes('Rhythm') ? '🥁' : (p.part === 'Bass' ? '🎸' : (p.part.includes('Chord') ? '🎹' : (p.part === 'Pad' ? '🎻' : '🎷')));
      const isSilent = p.noteCount === 0;
      const badgeHtml = isSilent
        ? `<span style="color: #94a3b8; font-size: 0.72rem; background: rgba(148, 163, 184, 0.12); border: 1px dashed rgba(148, 163, 184, 0.3); padding: 2px 7px; border-radius: 4px;">💤 此區間未進場 (0 音符)</span>`
        : `<span style="color: #10b981; font-size: 0.75rem; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 7px; border-radius: 4px;">🎯 ${p.noteCount} 音符</span>`;

      return `
        <div style="background: ${isSilent ? 'rgba(30, 41, 59, 0.4)' : 'rgba(30, 41, 59, 0.8)'}; border: 1px solid ${isSilent ? 'rgba(100, 116, 139, 0.2)' : 'rgba(56, 189, 248, 0.25)'}; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; opacity: ${isSilent ? 0.75 : 1};">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1rem;">${icon}</span>
            <span style="font-weight: 700; color: ${isSilent ? '#94a3b8' : '#f8fafc'}; font-size: 0.8rem;">${p.part}</span>
            <span style="font-size: 0.74rem; color: #38bdf8;">(Yamaha CH ${p.targetChannel + 1})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: ${isSilent ? '#94a3b8' : '#cbd5e1'}; font-size: 0.75rem;">${p.voiceName}</span>
            ${badgeHtml}
          </div>
        </div>
      `;
    }).join('');

    backdrop.innerHTML = `
      <div class="add-section-modal" style="max-width: 620px;" role="dialog" aria-modal="true">
        <div class="as-modal-header">
          <div class="as-header-left">
            <span class="as-header-icon">🎉</span>
            <div>
              <div class="as-header-title">小節切片裝配成功！</div>
              <div class="as-header-sub">已成功將小節音符寫入 Yamaha 伴奏段落【${result.targetSection}】</div>
            </div>
          </div>
          <button type="button" class="as-btn-close" id="btn-close-slice-result">✕</button>
        </div>

        <div class="as-modal-body" style="gap: 12px;">
          <!-- 統計摘要卡片 -->
          <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">🎯 目標伴奏段落</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #10b981;">${result.targetSection} (共 ${result.totalBars} 小節)</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">✂️ 來源小節區間</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: #38bdf8;">第 ${result.startBar} ~ ${result.endBar} 小節</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">🎼 提取音符總計</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">${result.totalNotesExtracted} 顆音符 (${result.assembledPartsCount} 聲部)</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">🎹 和弦模式</div>
              <div style="font-size: 0.88rem; font-weight: 700; color: ${result.chordMode === 'CM_MINOR' ? '#38bdf8' : (result.chordMode === 'CM7_MAJOR' ? '#c084fc' : '#34d399')};">
                ${result.chordMode === 'CM_MINOR' ? '🎯 Cm 小調基準 (SFF2)' : (result.chordMode === 'CM7_MAJOR' ? '✅ CM7 大調基準' : '直通原曲進行 (Bypass)')}
              </div>
            </div>
          </div>
          ${result.detectedChordsByBar && result.detectedChordsByBar.length > 0 ? `
            <div style="font-size: 0.72rem; color: #c4b5fd; background: rgba(139, 92, 246, 0.1); border: 1px dashed rgba(139, 92, 246, 0.3); padding: 5px 10px; border-radius: 6px;">
              🔍 <strong>各小節原曲和弦反向歸一化路徑：</strong> ${result.detectedChordsByBar.map(c => `第${c.bar}小節 [${c.chordName}] ➔ C (${c.shiftToC >= 0 ? '+' : ''}${c.shiftToC})`).join(' · ')}
            </div>
          ` : ''}

          <!-- 伴奏聲部裝配明細 -->
          <div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">
              🎹 各伴奏聲部提取配置 (已自動注入 SFF2 CASM 轉調與原廠音色)：
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
              ${partRowsHtml}
            </div>
          </div>

          <div style="font-size: 0.72rem; color: #94a3b8; background: rgba(56, 189, 248, 0.08); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #38bdf8; line-height: 1.5;">
            💡 <strong>所有切片段落皆會自動累積整合於同一個 STY 伴奏檔中！</strong><br>
            • <strong>「▶ 進入伴奏模式試聽」</strong>：可立刻試聽當前段落與測試和弦轉調；試聽後隨時點擊右上角<strong>「🔙 返回 MIDI 原曲繼續切片」</strong>繼續組裝。<br>
            • <strong>「✂️ 繼續切片其他段落」</strong>：直接留在原曲視圖，選取其他小節繼續裝配 Main B、Fill In 或 Intro 等段落。<br>
            • <strong>「💾 匯出 STY 檔」</strong>：隨時將目前所有已切片段落打包匯出為標準 Yamaha 伴奏檔。
          </div>
        </div>

        <div class="as-modal-footer" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="btn-result-continue-slice" class="as-btn-cancel" style="background: rgba(148, 163, 184, 0.15); border: 1px solid rgba(148, 163, 184, 0.3); color: #cbd5e1;">
            ✂️ 繼續切片其他段落
          </button>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" id="btn-result-export-sty" class="midi-locator-btn" style="background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #fde68a;">
              💾 匯出 STY 檔
            </button>
            <button type="button" id="btn-result-play-style" class="as-btn-confirm" style="background: linear-gradient(135deg, #10b981, #059669); border: none;">
              ▶ 進入伴奏模式試聽
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeModal = () => {
      backdrop.remove();
    };

    backdrop.querySelector('#btn-close-slice-result')?.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // 繼續切片其他段落
    backdrop.querySelector('#btn-result-continue-slice')?.addEventListener('click', () => {
      closeModal();
    });

    // 匯出 STY 檔
    backdrop.querySelector('#btn-result-export-sty')?.addEventListener('click', () => {
      closeModal();
      this.exportWorkingStyle();
    });

    // 進入伴奏模式試聽
    backdrop.querySelector('#btn-result-play-style')?.addEventListener('click', () => {
      closeModal();
      this.switchToAssembledStyleMode(result.targetSection);
    });
  }

  /**
   * 切換至組裝中的 STY 伴奏風格模式並選定指定段落試聽
   */
  private switchToAssembledStyleMode(targetSection: string) {
    if (!this.workingStyleParsed) return;

    // 停止當前任何播放
    styPlaybackEngine.stop();

    this.currentParsed = this.workingStyleParsed;
    this.currentSongAnalysis = null;
    this.currentFileName = `${(this.workingStyleParsed as any).styleName || 'Arranger'}.sty`;
    this.baseBpm = this.workingStyleParsed.bpm || 120;

    styPlaybackEngine.loadParsed(this.workingStyleParsed);
    this.syncMixerVolumes();
    this.trackEditor?.clearHistory();

    // 更新介面元素可見度 (切換為 Yamaha STY 伴奏模式)
    if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'none';
    if (this.chordAuditionBar) this.chordAuditionBar.style.display = '';
    if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = '';
    if (this.mixerPanel) this.mixerPanel.style.display = '';
    if (this.btnExportSty) this.btnExportSty.style.display = '';
    if (this.btnReturnToMidi) this.btnReturnToMidi.style.display = this.sourceSongParsed ? 'inline-flex' : 'none';

    this.labelStyleTitle.textContent = `🎵 ${this.currentFileName} (由 MIDI 切片裝配)`;
    this.labelStyleInfo.textContent = `格式: SFF2 伴奏風格 | 速度: ${this.baseBpm} BPM | 拍號: ${this.workingStyleParsed.timeSignature.numerator}/${this.workingStyleParsed.timeSignature.denominator} | 段落數: ${this.workingStyleParsed.sections.length} 個段落`;

    this.sliderBpm.value = this.baseBpm.toString();
    this.labelBpmValue.textContent = this.baseBpm.toString();

    // 渲染段落按鈕並選取剛剛切片組裝的段落
    this.renderSectionButtons();
    this.selectSection(targetSection);
    this.updatePlayStateUI();
  }

  /**
   * 從伴奏模式切回原來的 MIDI 原曲模式，方便繼續切片其他段落
   */
  private switchToMidiSongMode() {
    if (!this.sourceSongParsed || !this.sourceSongAnalysis) return;

    styPlaybackEngine.stop();

    this.currentParsed = this.sourceSongParsed;
    this.currentSongAnalysis = this.sourceSongAnalysis;
    this.currentFileName = this.sourceSongFileName;
    this.baseBpm = this.sourceSongAnalysis.initialBpm || 120;

    styPlaybackEngine.loadParsed(this.sourceSongParsed);
    this.syncMixerVolumes();
    this.trackEditor?.clearHistory();

    this.activeSectionName = '__MIDI_SONG__';
    const s = Math.max(1, parseInt(this.inputMidiStartBar?.value || '1', 10) || 1);
    const e = Math.max(s, parseInt(this.inputMidiEndBar?.value || String(this.sourceSongAnalysis.totalBars), 10) || this.sourceSongAnalysis.totalBars);
    styPlaybackEngine.loadSongMode(s, e);

    // 切換為 MIDI 音樂檔模式介面
    if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'flex';
    if (this.chordAuditionBar) this.chordAuditionBar.style.display = 'none';
    if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = 'none';
    if (this.mixerPanel) this.mixerPanel.style.display = 'none';
    if (this.btnExportSty) this.btnExportSty.style.display = 'none';
    if (this.btnReturnToMidi) this.btnReturnToMidi.style.display = 'none';

    this.labelStyleTitle.textContent = `🎼 ${this.sourceSongFileName} (標準 MIDI 音樂檔)`;
    const tempoStr = this.sourceSongAnalysis.hasTempoChanges
      ? `${this.sourceSongAnalysis.initialBpm} BPM (曲中變速 ${this.sourceSongAnalysis.minBpm}~${this.sourceSongAnalysis.maxBpm} BPM)`
      : `${this.sourceSongAnalysis.initialBpm} BPM`;
    this.labelStyleInfo.textContent = `格式: SMF Format ${this.sourceSongAnalysis.midiFormat} ｜ 總小節: ${this.sourceSongAnalysis.totalBars} 小節 ｜ 速度: ${tempoStr} ｜ 拍號: ${this.sourceSongAnalysis.timeSignature.numerator}/${this.sourceSongAnalysis.timeSignature.denominator}`;

    this.sliderBpm.value = this.baseBpm.toString();
    this.labelBpmValue.textContent = this.baseBpm.toString();

    this.renderMidiSongInspector(this.sourceSongAnalysis);
    this.updatePlayStateUI();
  }

  /**
   * 匯出當前組裝中的伴奏風格檔
   */
  private exportWorkingStyle() {
    const target = this.workingStyleParsed || this.currentParsed;
    if (!target) {
      alert('目前尚無可匯出的伴奏風格資料！');
      return;
    }
    try {
      const bytes = YamahaWriter.write(target);
      const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(target as any).styleName || 'Arranger'}.sty`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('匯出 STY 失敗:', err);
      alert(`匯出 STY 失敗: ${err.message || err}`);
    }
  }

  private renderSectionButtons() {
    this.sectionButtonsContainer.innerHTML = '';
    const sections = styPlaybackEngine.getSections();

    // 依 Yamaha Arranger 邏輯分組排序 (含 Break / Fill In BA)
    const orderPriority = [
      'intro a', 'intro b', 'intro c',
      'main a', 'main b', 'main c', 'main d',
      'fill in aa', 'fill in bb', 'fill in cc', 'fill in dd', 'break', 'fill in ba',
      'ending a', 'ending b', 'ending c',
    ];

    const sorted = [...sections].sort((a, b) => {
      const idxA = orderPriority.indexOf(a.name.toLowerCase());
      const idxB = orderPriority.indexOf(b.name.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.startTick - b.startTick;
    });

    sorted.forEach((sec) => {
      const btn = document.createElement('button');
      btn.className = 'section-btn';
      btn.setAttribute('data-section', sec.name);

      let displayName = sec.name;
      if (sec.name.toLowerCase() === 'fill in ba') {
        displayName = 'Break (Fill In BA)';
      }

      const isMain = sec.name.toLowerCase().startsWith('main');
      const isIntro = sec.name.toLowerCase().startsWith('intro');
      const isEnding = sec.name.toLowerCase().startsWith('ending');
      const isBreak = sec.name.toLowerCase() === 'fill in ba' || sec.name.toLowerCase() === 'break';

      let badgeClass = 'badge-other';
      if (isMain) badgeClass = 'badge-main';
      if (isIntro) badgeClass = 'badge-intro';
      if (isEnding) badgeClass = 'badge-ending';
      if (isBreak) badgeClass = 'badge-break';

      btn.innerHTML = `
        <span class="sec-badge ${badgeClass}">${displayName}</span>
        <span class="sec-bars">${sec.measureCount ?? 1} 小節</span>
      `;

      btn.addEventListener('click', () => {
        this.selectSection(sec.name);
      });

      this.sectionButtonsContainer.appendChild(btn);
    });
  }

  private selectSection(name: string) {
    if (this.activeSectionName !== name) {
      this.trackEditor?.clearHistory();
    }
    this.activeSectionName = name;
    styPlaybackEngine.selectSection(name);

    document.querySelectorAll('.section-btn').forEach((b) => {
      const sec = b.getAttribute('data-section');
      b.classList.toggle('active', sec?.toLowerCase() === name.toLowerCase());
    });

    // 更新各聲部的真實解析音色名稱與 SX920 面板代碼（含相容舊代碼標註）
    const voices = styPlaybackEngine.getPartVoices();
    YAMAHA_PARTS.forEach((part) => {
      const voiceEl = document.getElementById(`part-voice-${part.channel}`);
      const info = voices.get(part.channel);
      if (voiceEl && info) {
        const codeBadge = info.isLegacyAlias && info.legacyCodeLabel
          ? `${info.msb}-${info.lsb}-${info.pc + 1} · 舊碼 ${info.legacyCodeLabel}`
          : `${info.msb}-${info.lsb}-${info.pc + 1}`;
        voiceEl.textContent = `${info.voiceName} [${codeBadge}] ✏️`;
        voiceEl.title = `${info.voiceName} (Category: ${info.category}, SX920 面板: ${info.msb}-${info.lsb}-${info.pc + 1}${info.isLegacyAlias && info.legacyCodeLabel ? `, 檔案相容舊碼: ${info.legacyCodeLabel}` : ''}) - 點擊更換音色`;
      }
    });

    const totalBars = styPlaybackEngine.getTotalBars();
    this.labelPosition.textContent = `小節 01 / ${totalBars.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;

    // 依段落同步混音台音量滑桿與數值
    this.renderMixer();
    this.syncMixerVolumes();
    this.syncSectionResizeUI();
    this.renderProgressionCards();
    if (styPlaybackEngine.getIsProgressionSuspended()) {
      this.updateChordAuditionUI(styPlaybackEngine.getAuditionChord());
    }

    // 更新當前聚焦聲部的音符統計與資訊
    this.updateFocusedBanner();
    this.refreshTrackEditor();
  }

  public setFocusedChannel(channel: number) {
    this.focusedChannel = channel;

    // 更新所有卡片聚焦高亮外框 (支援 0~15 全 16 通道)
    for (let c = 0; c <= 15; c++) {
      const card = document.getElementById(`card-ch-${c}`);
      if (card) {
        card.classList.toggle('is-focused', c === channel);
      }
    }

    // 若當前正處於 Solo 模式播放中，切換聚焦卡牌時同步切換 Solo 發聲聲部 (Seamless Live Solo)
    if (styPlaybackEngine.getIsPlaying() && styPlaybackEngine.getChannelSolo() !== null) {
      styPlaybackEngine.setChannelSolo(channel);
      this.syncMixerSoloButtons();
    }

    this.updateFocusedBanner();
    this.updatePlayStateUI();
    this.refreshTrackEditor();
  }

  private refreshTrackEditor() {
    if (!this.trackEditor) return;
    const part = this.getChannelPartDef(this.focusedChannel);
    const events = styPlaybackEngine.getChannelEvents(this.focusedChannel);
    const totalTicks = styPlaybackEngine.getTotalSectionTicks();
    const totalBars = styPlaybackEngine.getTotalBars();
    const division = this.currentParsed?.division || 480;
    const timeSig = this.currentParsed?.timeSignature || { numerator: 4, denominator: 4 };
    const voiceInfo = styPlaybackEngine.getPartVoices().get(this.focusedChannel) || null;
    const isActive = this.isChannelActive(this.focusedChannel);
    const ccEvents = styPlaybackEngine.getChannelCCEvents(this.focusedChannel);

    this.trackEditor.loadTrack(
      this.focusedChannel,
      part.label,
      part.color,
      events,
      totalTicks,
      totalBars,
      division,
      timeSig,
      voiceInfo,
      isActive,
      ccEvents
    );
  }

  public updateFocusedBanner() {
    const part = this.getChannelPartDef(this.focusedChannel);
    const voiceInfo = styPlaybackEngine.getPartVoices().get(part.channel);
    const noteCount = styPlaybackEngine.getChannelEvents(part.channel).length;
    const isActive = this.isChannelActive(part.channel);

    this.focusedTrackBanner.style.setProperty('--part-accent', part.color);

    if (!isActive) {
      this.focusedTrackTitle.innerHTML = `CH ${part.channel + 1} - ${part.label} <span class="banner-status-badge inactive">⚪ 未啟用 (空白聲部)</span>`;
      this.focusedTrackVoice.innerHTML = `<button id="btn-banner-activate" class="banner-activate-btn" title="為此聲部挑選樂器音色並自動建立 CASM 伴奏轉調規則">➕ 立即啟用此聲部 (挑選樂器)</button>`;
      this.focusedTrackMeta.textContent = `本段音符數: 0 個 ｜ 狀態: 尚未配置 Yamaha 音色與 CASM 轉調規則 ｜ 點擊「立即啟用」或開始錄音即可自動建立`;

      const btnAct = this.focusedTrackVoice.querySelector('#btn-banner-activate');
      btnAct?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openVoicePickerForChannel(part.channel);
      });
    } else {
      const codeBadge = voiceInfo
        ? (voiceInfo.isLegacyAlias && voiceInfo.legacyCodeLabel
            ? `${voiceInfo.msb}-${voiceInfo.lsb}-${voiceInfo.pc + 1} · 相容舊碼 ${voiceInfo.legacyCodeLabel}`
            : `${voiceInfo.msb}-${voiceInfo.lsb}-${voiceInfo.pc + 1}`)
        : '';
      const modeTag = styPlaybackEngine.getIsSongMode() ? 'MIDI 原曲通道' : '已啟用';
      this.focusedTrackTitle.innerHTML = `CH ${part.channel + 1} - ${part.label} <span class="banner-status-badge active">✅ ${modeTag}</span>`;
      this.focusedTrackVoice.textContent = voiceInfo
        ? `${voiceInfo.voiceName} [${codeBadge}]`
        : part.defaultName;
      this.focusedTrackMeta.textContent = `區間音符數: ${noteCount} 個 ｜ MIDI 通道: CH ${part.channel + 1} ｜ 類型: ${voiceInfo?.category || 'General'}${codeBadge ? ` ｜ 三聯號: ${codeBadge}` : ''}`;
    }

    // 更新橫幅上的獨奏與靜音按鈕狀態
    const isMuted = styPlaybackEngine.isChannelMuted(part.channel);
    this.btnBannerMute.classList.toggle('active-mute', isMuted);
    this.btnBannerMute.textContent = isMuted ? '🔊 取消靜音' : '🔇 靜音此軌';

    const isSolo = styPlaybackEngine.getChannelSolo() === part.channel;
    this.btnBannerSolo.classList.toggle('active-solo', isSolo);
    this.btnBannerSolo.textContent = isSolo ? '⏹ 解除獨奏' : '🎧 獨奏此軌 (Solo)';
  }

  private syncMixerSoloButtons() {
    const currentSolo = styPlaybackEngine.getChannelSolo();
    for (let c = 0; c <= 15; c++) {
      const btn = document.getElementById(`btn-solo-${c}`);
      btn?.classList.toggle('soloed', currentSolo === c);
    }
    this.updateFocusedBanner();
  }

  /**
   * 🎹 初始化虛擬左手和弦轉調測試條 (Virtual Chord Audition Bar)
   */
  private setupChordAuditionBar() {
    if (!this.chordPillsContainer) return;

    // 1. 動態渲染常用流行和弦快捷按鈕
    this.chordPillsContainer.innerHTML = '';
    const currentChord = styPlaybackEngine.getAuditionChord();

    POPULAR_AUDITION_CHORDS.forEach((chord) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'chord-pill';
      pill.dataset.chordName = chord.displayName;
      pill.textContent = chord.displayName;
      if (chord.displayName === currentChord.displayName) {
        pill.classList.add('is-active-chord');
      }

      pill.addEventListener('click', () => {
        if (styPlaybackEngine.getChordAutoAdvance()) {
          // 自動輪播模式：指派和弦至當前選定編輯之小節卡片
          const selectedBar = styPlaybackEngine.getSelectedProgressionBarIndex();
          styPlaybackEngine.setChordForProgressionBar(selectedBar, chord);
          if (this.selectChordProgressionPreset) {
            this.selectChordProgressionPreset.value = 'custom';
          }
          this.renderProgressionCards();
          styPlaybackEngine.previewChord(chord);
        } else {
          // 單和弦全段試聽模式
          styPlaybackEngine.setAuditionChord(chord);
          styPlaybackEngine.previewChord(chord);
        }
      });

      this.chordPillsContainer.appendChild(pill);
    });

    // 2. 自由組合和弦套用
    if (this.btnApplyCustomChord) {
      this.btnApplyCustomChord.addEventListener('click', () => {
        const root = this.selectChordRoot?.value || 'C';
        const type = (this.selectChordType?.value || 'maj') as ChordType;
        const customChord = ChordTransposer.buildChord(root, type);
        if (styPlaybackEngine.getChordAutoAdvance()) {
          const selectedBar = styPlaybackEngine.getSelectedProgressionBarIndex();
          styPlaybackEngine.setChordForProgressionBar(selectedBar, customChord);
          if (this.selectChordProgressionPreset) {
            this.selectChordProgressionPreset.value = 'custom';
          }
          this.renderProgressionCards();
          styPlaybackEngine.previewChord(customChord);
        } else {
          styPlaybackEngine.setAuditionChord(customChord);
          styPlaybackEngine.previewChord(customChord);
        }
      });
    }

    // 3. 一鍵重設回 C 原調
    if (this.btnResetChord) {
      this.btnResetChord.addEventListener('click', () => {
        styPlaybackEngine.resetAuditionChord();
      });
    }

    // 4. 監聽播放引擎和弦切換事件，自動同步更新 UI
    styPlaybackEngine.onChordChange((chord) => {
      this.updateChordAuditionUI(chord);
    });

    // 5. 初始化多小節和弦進行輪播控制 (Chord Progression Auto-Advance)
    this.setupChordProgressionControls();

    // 初始化當前顯示
    this.updateChordAuditionUI(currentChord);
  }

  /**
   * 🔄 初始化多小節和弦進行輪播控制 (Chord Progression Auto-Advance)
   */
  private setupChordProgressionControls() {
    if (this.toggleChordAutoAdvance) {
      this.toggleChordAutoAdvance.checked = styPlaybackEngine.getChordAutoAdvance();
      this.toggleChordAutoAdvance.addEventListener('change', () => {
        const enabled = this.toggleChordAutoAdvance.checked;
        styPlaybackEngine.setChordAutoAdvance(enabled);
        this.renderProgressionCards();
        if (!enabled) {
          this.updateChordAuditionUI(styPlaybackEngine.getAuditionChord());
        }
      });
    }

    if (this.selectChordProgressionPreset) {
      this.selectChordProgressionPreset.value = styPlaybackEngine.getChordProgressionPresetId();
      this.selectChordProgressionPreset.addEventListener('change', () => {
        const presetId = this.selectChordProgressionPreset.value;
        if (presetId !== 'custom') {
          const chords = ChordTransposer.getProgressionPreset(presetId);
          styPlaybackEngine.setChordProgression(chords, presetId);
          this.renderProgressionCards();
        }
      });
    }

    if (this.btnResetProgression) {
      this.btnResetProgression.addEventListener('click', () => {
        const defaultPresetId = 'pop-1564';
        const chords = ChordTransposer.getProgressionPreset(defaultPresetId);
        styPlaybackEngine.setChordProgression(chords, defaultPresetId);
        if (this.selectChordProgressionPreset) {
          this.selectChordProgressionPreset.value = defaultPresetId;
        }
        this.renderProgressionCards();
      });
    }

    // 監聽播放進程輪播即時更新
    styPlaybackEngine.onProgressionBarChange((barIndex, chord) => {
      const isEffective = styPlaybackEngine.isEffectiveChordAutoAdvance();
      const cards = this.progressionCardsContainer?.querySelectorAll('.progression-bar-card');
      cards?.forEach((card) => {
        const idx = parseInt((card as HTMLElement).dataset.barIndex || '-1', 10);
        card.classList.toggle('is-playing-card', isEffective && idx === barIndex);
      });

      if (barIndex >= 0 && isEffective) {
        if (this.labelCurrentChordName) {
          this.labelCurrentChordName.textContent = `${chord.displayName} (第 ${barIndex + 1} 小節)`;
        }
        if (this.labelCurrentChordDetail) {
          this.labelCurrentChordDetail.textContent = `${ChordTransposer.getChordDescription(chord)} · 自動輪播中`;
        }
        // 同步高亮對應的 chord-pill
        const pills = this.chordPillsContainer?.querySelectorAll('.chord-pill');
        pills?.forEach((p) => {
          const pillEl = p as HTMLElement;
          pillEl.classList.toggle('is-active-chord', pillEl.dataset.chordName === chord.displayName);
        });
      }
    });

    // 初始渲染卡片
    this.renderProgressionCards();
  }

  /**
   * 渲染小節和弦進行軌跡卡片
   */
  private renderProgressionCards() {
    if (!this.progressionCardsContainer) return;
    this.progressionCardsContainer.innerHTML = '';

    const totalBars = Math.max(1, styPlaybackEngine.getTotalBars());
    const selectedBar = styPlaybackEngine.getSelectedProgressionBarIndex();
    const isSuspended = styPlaybackEngine.getIsProgressionSuspended();

    // 更新原調保護掛起標籤與容器樣式
    const suspendedBadge = document.getElementById('progression-suspended-badge');
    if (suspendedBadge) {
      suspendedBadge.style.display = isSuspended ? 'inline-flex' : 'none';
    }
    this.progressionCardsContainer.classList.toggle('is-suspended', isSuspended);

    // 更新下方操作提示說明
    const hintEl = document.getElementById('progression-hint-text');
    if (hintEl) {
      if (isSuspended) {
        hintEl.innerHTML = `🛡️ <strong>【原調保護已啟動】</strong>：目前為前奏/尾奏段落，系統已自動掛起和弦輪播以保護原曲旋律；切換回 Main 段落時將自動無縫恢復！`;
      } else {
        hintEl.textContent = `🎯 正在編輯【第 ${selectedBar + 1} 小節】：可直接在卡片上下拉選取，或點擊上方 12 顆和弦按鈕立即替換！`;
      }
    }

    const commonChords = [
      'C', 'Dm', 'Em', 'F', 'G', 'Am', 'G7', 'C7',
      'Bb', 'Dm7', 'Cmaj7', 'Fmaj7', 'Am7', 'Gsus4',
      'D', 'E', 'A', 'Fm', 'Bdim'
    ];

    for (let barIdx = 0; barIdx < totalBars; barIdx++) {
      const chord = styPlaybackEngine.getChordForBar(barIdx);
      const card = document.createElement('div');
      card.className = 'progression-bar-card';
      card.dataset.barIndex = String(barIdx);

      if (barIdx === selectedBar) {
        card.classList.add('is-selected-card');
      }
      if (!isSuspended && styPlaybackEngine.isEffectiveChordAutoAdvance() && barIdx === styPlaybackEngine.getActiveProgressionBar()) {
        card.classList.add('is-playing-card');
      }

      const barNum = document.createElement('div');
      barNum.className = 'card-bar-num';
      barNum.textContent = `第 ${barIdx + 1} 小節`;

      // 支援在卡片上直接下拉切換和弦
      const chordSelect = document.createElement('select');
      chordSelect.className = 'card-chord-select';
      chordSelect.title = `點擊直接更換第 ${barIdx + 1} 小節和弦`;

      const chordList = [...commonChords];
      if (!chordList.includes(chord.displayName)) {
        chordList.push(chord.displayName);
      }

      chordList.forEach((cName) => {
        const opt = document.createElement('option');
        opt.value = cName;
        opt.textContent = cName;
        if (cName === chord.displayName) opt.selected = true;
        chordSelect.appendChild(opt);
      });

      chordSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        const newChord = ChordTransposer.parseChordString(chordSelect.value);
        styPlaybackEngine.setSelectedProgressionBarIndex(barIdx);
        styPlaybackEngine.setChordForProgressionBar(barIdx, newChord);
        if (this.selectChordProgressionPreset) {
          this.selectChordProgressionPreset.value = 'custom';
        }
        this.renderProgressionCards();
        styPlaybackEngine.previewChord(newChord);
      });

      chordSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        if (styPlaybackEngine.getSelectedProgressionBarIndex() !== barIdx) {
          styPlaybackEngine.setSelectedProgressionBarIndex(barIdx);
          this.renderProgressionCards();
        }
      });

      const chordType = document.createElement('div');
      chordType.className = 'card-chord-type';
      chordType.textContent = CHORD_TYPE_INTERVALS[chord.type]?.label.split(' ')[0] || chord.type;

      card.appendChild(barNum);
      card.appendChild(chordSelect);
      card.appendChild(chordType);

      card.addEventListener('click', () => {
        styPlaybackEngine.setSelectedProgressionBarIndex(barIdx);
        this.renderProgressionCards();
        styPlaybackEngine.previewChord(chord);
      });

      this.progressionCardsContainer.appendChild(card);
    }
  }

  /**
   * 同步更新虛擬和弦測試條介面顯示
   */
  private updateChordAuditionUI(chord: ChordDefinition) {
    if (this.labelCurrentChordName) {
      this.labelCurrentChordName.textContent = chord.displayName;
    }
    if (this.labelCurrentChordDetail) {
      this.labelCurrentChordDetail.textContent = ChordTransposer.getChordDescription(chord);
    }

    // 同步更新所有和弦膠囊按鈕狀態
    const pills = this.chordPillsContainer?.querySelectorAll('.chord-pill');
    if (pills) {
      pills.forEach((p) => {
        const pillEl = p as HTMLElement;
        const isActive = pillEl.dataset.chordName === chord.displayName;
        pillEl.classList.toggle('is-active-chord', isActive);
      });
    }

    // 同步下拉選單數值
    if (this.selectChordRoot) {
      this.selectChordRoot.value = chord.root;
    }
    if (this.selectChordType) {
      this.selectChordType.value = chord.type;
    }
  }

  /**
   * 即時同步混音參數至記憶體中的 STY 結構 (Track 0 與 CASM 來源通道)
   */
  private syncPartMixingParam(channel: number, params: { volume?: number; pan?: number; reverb?: number; chorus?: number }) {
    if (!this.currentParsed) return;
    YamahaStyleModifier.setPartMixing(this.currentParsed, channel, params);
    const currentSec = styPlaybackEngine.getCurrentSection();
    if (currentSec) {
      const secNameLower = currentSec.name.toLowerCase();
      const casmSecMap = this.currentParsed.casmMappings?.[secNameLower]
        || this.currentParsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];
      if (casmSecMap) {
        for (const [srcStr, dst] of Object.entries(casmSecMap)) {
          if (dst === channel) {
            const srcCh = parseInt(srcStr, 10);
            YamahaStyleModifier.setPartMixing(this.currentParsed, srcCh, params);
          }
        }
      }
    }
  }

  private renderMixer() {
    this.mixerContainer.innerHTML = '';
    YAMAHA_PARTS.forEach((part) => {
      const isActive = this.isChannelActive(part.channel);
      const card = document.createElement('div');
      card.id = `card-ch-${part.channel}`;
      card.className = `mixer-card ${part.channel === this.focusedChannel ? 'is-focused' : ''} ${!isActive ? 'is-inactive' : ''}`;
      card.style.setProperty('--part-accent', part.color);

      const voiceInfo = styPlaybackEngine.getPartVoices().get(part.channel);
      const codeBadge = voiceInfo
        ? (voiceInfo.isLegacyAlias && voiceInfo.legacyCodeLabel
            ? `${voiceInfo.msb}-${voiceInfo.lsb}-${voiceInfo.pc + 1} · 舊碼 ${voiceInfo.legacyCodeLabel}`
            : `${voiceInfo.msb}-${voiceInfo.lsb}-${voiceInfo.pc + 1}`)
        : '';
      const voiceLabel = voiceInfo ? `${voiceInfo.voiceName} [${codeBadge}]` : part.defaultName;
      const voiceTitle = voiceInfo
        ? `${voiceInfo.voiceName} (Category: ${voiceInfo.category}, SX920 面板: ${voiceInfo.msb}-${voiceInfo.lsb}-${voiceInfo.pc + 1}${voiceInfo.isLegacyAlias && voiceInfo.legacyCodeLabel ? `, 檔案相容舊碼: ${voiceInfo.legacyCodeLabel}` : ''}) - 點擊開啟 Yamaha 原廠音色庫更換音色`
        : '點擊開啟 Yamaha 原廠音色庫更換音色';
      const voiceDisplayHtml = isActive
        ? `<div id="part-voice-${part.channel}" class="part-voice clickable-voice" title="${voiceTitle}">${voiceLabel} ✏️</div>`
        : `<div id="part-voice-${part.channel}" class="part-voice clickable-voice voice-inactive" title="此聲部尚未啟用，點擊挑選樂器音色並自動建立 CASM 伴奏規則">
             <span class="btn-activate-badge">➕ 啟用聲部 (選音色)</span>
           </div>`;

      card.innerHTML = `
        <div class="part-top-bar">
          <span class="channel-pill">CH ${part.channel + 1}</span>
          <span class="focus-badge">🎯 焦點</span>
          ${!isActive ? '<span class="inactive-pill">未啟用</span>' : ''}
          <div id="led-ch-${part.channel}" class="activity-led"></div>
        </div>
        <div class="part-title">${part.label}</div>
        ${voiceDisplayHtml}
        <div class="part-controls">
          <button id="btn-mute-${part.channel}" class="mixer-btn btn-mute">Mute</button>
          <button id="btn-solo-${part.channel}" class="mixer-btn btn-solo">Solo</button>
        </div>
        <div class="part-vol-wrap">
          <span class="ctrl-sub-label">VOL</span>
          <input type="range" id="vol-${part.channel}" class="part-vol-slider" min="0" max="127" value="${styPlaybackEngine.getChannelVolume(part.channel)}">
          <span id="vol-txt-${part.channel}" class="vol-badge">${styPlaybackEngine.getChannelVolume(part.channel)}</span>
        </div>
        <div class="part-pan-wrap">
          <span class="ctrl-sub-label">PAN</span>
          <input type="range" id="pan-${part.channel}" class="part-pan-slider" min="0" max="127" value="${styPlaybackEngine.getChannelPan(part.channel)}">
          <span id="pan-txt-${part.channel}" class="pan-badge" title="雙擊滑桿或數值置中 (C)">${formatYamahaPan(styPlaybackEngine.getChannelPan(part.channel))}</span>
        </div>
        <div class="part-fx-group ${this.isFxVisible ? '' : 'collapsed'}">
          <div class="part-rev-wrap">
            <span class="ctrl-sub-label" title="CC 91 殘響深度 (Reverb Send Depth)">REV</span>
            <input type="range" id="rev-${part.channel}" class="part-rev-slider" min="0" max="127" value="${styPlaybackEngine.getChannelReverb(part.channel)}">
            <span id="rev-txt-${part.channel}" class="rev-badge" title="雙擊重設為 Yamaha 原廠標準殘響值 (40)">${styPlaybackEngine.getChannelReverb(part.channel)}</span>
          </div>
          <div class="part-cho-wrap">
            <span class="ctrl-sub-label" title="CC 93 合唱深度 (Chorus Send Depth)">CHO</span>
            <input type="range" id="cho-${part.channel}" class="part-cho-slider" min="0" max="127" value="${styPlaybackEngine.getChannelChorus(part.channel)}">
            <span id="cho-txt-${part.channel}" class="cho-badge" title="雙擊重設為 Yamaha 原廠標準合唱值 (0)">${styPlaybackEngine.getChannelChorus(part.channel)}</span>
          </div>
        </div>
      `;

      // 點擊卡牌本體即可切換焦點聲部（最多只開一個）
      card.addEventListener('click', () => {
        this.setFocusedChannel(part.channel);
      });

      this.mixerContainer.appendChild(card);

      // 事件綁定
      const btnMute = card.querySelector(`#btn-mute-${part.channel}`) as HTMLButtonElement;
      const btnSolo = card.querySelector(`#btn-solo-${part.channel}`) as HTMLButtonElement;
      const voiceEl = card.querySelector(`#part-voice-${part.channel}`);
      voiceEl?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openVoicePickerForChannel(part.channel);
      });

      const sliderVol = card.querySelector(`#vol-${part.channel}`) as HTMLInputElement;

      btnMute.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMuted = styPlaybackEngine.isChannelMuted(part.channel);
        styPlaybackEngine.setChannelMute(part.channel, !isMuted);
        btnMute.classList.toggle('muted', !isMuted);
        if (this.focusedChannel === part.channel) {
          this.updateFocusedBanner();
        }
      });

      btnSolo.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentSolo = styPlaybackEngine.getChannelSolo();
        const nextSolo = currentSolo === part.channel ? null : part.channel;
        styPlaybackEngine.setChannelSolo(nextSolo);
        this.setFocusedChannel(part.channel);
        this.syncMixerSoloButtons();
        this.updatePlayStateUI();
      });

      sliderVol.addEventListener('click', (e) => e.stopPropagation());
      sliderVol.addEventListener('input', (e) => {
        e.stopPropagation();
        const vol = parseInt(sliderVol.value, 10);
        styPlaybackEngine.setChannelVolume(part.channel, vol);
        const txt = card.querySelector(`#vol-txt-${part.channel}`);
        if (txt) txt.textContent = vol.toString();
      });
      sliderVol.addEventListener('change', (e) => {
        e.stopPropagation();
        const vol = parseInt(sliderVol.value, 10);
        this.syncPartMixingParam(part.channel, { volume: vol });
      });

      const sliderPan = card.querySelector(`#pan-${part.channel}`) as HTMLInputElement;
      const txtPan = card.querySelector(`#pan-txt-${part.channel}`);

      sliderPan.addEventListener('click', (e) => e.stopPropagation());
      sliderPan.addEventListener('input', (e) => {
        e.stopPropagation();
        const pan = parseInt(sliderPan.value, 10);
        styPlaybackEngine.setChannelPan(part.channel, pan);
        if (txtPan) txtPan.textContent = formatYamahaPan(pan);
      });
      sliderPan.addEventListener('change', (e) => {
        e.stopPropagation();
        const pan = parseInt(sliderPan.value, 10);
        this.syncPartMixingParam(part.channel, { pan });
      });

      // 雙擊滑桿或數值徽章一鍵置中 (Center: 64)
      const resetCenter = (e: Event) => {
        e.stopPropagation();
        sliderPan.value = '64';
        styPlaybackEngine.setChannelPan(part.channel, 64);
        if (txtPan) txtPan.textContent = 'C';
        this.syncPartMixingParam(part.channel, { pan: 64 });
      };
      sliderPan.addEventListener('dblclick', resetCenter);
      txtPan?.addEventListener('dblclick', resetCenter);

      // ✨ CC 91 殘響 (Reverb) 控制與重設 (預設 40)
      const sliderRev = card.querySelector(`#rev-${part.channel}`) as HTMLInputElement;
      const txtRev = card.querySelector(`#rev-txt-${part.channel}`);

      sliderRev.addEventListener('click', (e) => e.stopPropagation());
      sliderRev.addEventListener('input', (e) => {
        e.stopPropagation();
        const rev = parseInt(sliderRev.value, 10);
        styPlaybackEngine.setChannelReverb(part.channel, rev);
        if (txtRev) txtRev.textContent = rev.toString();
      });
      sliderRev.addEventListener('change', (e) => {
        e.stopPropagation();
        const rev = parseInt(sliderRev.value, 10);
        this.syncPartMixingParam(part.channel, { reverb: rev });
      });

      const resetReverb = (e: Event) => {
        e.stopPropagation();
        sliderRev.value = '40';
        styPlaybackEngine.setChannelReverb(part.channel, 40);
        if (txtRev) txtRev.textContent = '40';
        this.syncPartMixingParam(part.channel, { reverb: 40 });
      };
      sliderRev.addEventListener('dblclick', resetReverb);
      txtRev?.addEventListener('dblclick', resetReverb);

      // ✨ CC 93 合唱 (Chorus) 控制與重設 (預設 0)
      const sliderCho = card.querySelector(`#cho-${part.channel}`) as HTMLInputElement;
      const txtCho = card.querySelector(`#cho-txt-${part.channel}`);

      sliderCho.addEventListener('click', (e) => e.stopPropagation());
      sliderCho.addEventListener('input', (e) => {
        e.stopPropagation();
        const cho = parseInt(sliderCho.value, 10);
        styPlaybackEngine.setChannelChorus(part.channel, cho);
        if (txtCho) txtCho.textContent = cho.toString();
      });
      sliderCho.addEventListener('change', (e) => {
        e.stopPropagation();
        const cho = parseInt(sliderCho.value, 10);
        this.syncPartMixingParam(part.channel, { chorus: cho });
      });

      const resetChorus = (e: Event) => {
        e.stopPropagation();
        sliderCho.value = '0';
        styPlaybackEngine.setChannelChorus(part.channel, 0);
        if (txtCho) txtCho.textContent = '0';
        this.syncPartMixingParam(part.channel, { chorus: 0 });
      };
      sliderCho.addEventListener('dblclick', resetChorus);
      txtCho?.addEventListener('dblclick', resetChorus);
    });
  }

  private syncMixerVolumes() {
    YAMAHA_PARTS.forEach((part) => {
      const vol = styPlaybackEngine.getChannelVolume(part.channel);
      const slider = this.mixerContainer.querySelector(`#vol-${part.channel}`) as HTMLInputElement | null;
      const txt = this.mixerContainer.querySelector(`#vol-txt-${part.channel}`);
      if (slider) slider.value = vol.toString();
      if (txt) txt.textContent = vol.toString();

      const pan = styPlaybackEngine.getChannelPan(part.channel);
      const sliderPan = this.mixerContainer.querySelector(`#pan-${part.channel}`) as HTMLInputElement | null;
      const txtPan = this.mixerContainer.querySelector(`#pan-txt-${part.channel}`);
      if (sliderPan) sliderPan.value = pan.toString();
      if (txtPan) txtPan.textContent = formatYamahaPan(pan);

      const rev = styPlaybackEngine.getChannelReverb(part.channel);
      const sliderRev = this.mixerContainer.querySelector(`#rev-${part.channel}`) as HTMLInputElement | null;
      const txtRev = this.mixerContainer.querySelector(`#rev-txt-${part.channel}`);
      if (sliderRev) sliderRev.value = rev.toString();
      if (txtRev) txtRev.textContent = rev.toString();

      const cho = styPlaybackEngine.getChannelChorus(part.channel);
      const sliderCho = this.mixerContainer.querySelector(`#cho-${part.channel}`) as HTMLInputElement | null;
      const txtCho = this.mixerContainer.querySelector(`#cho-txt-${part.channel}`);
      if (sliderCho) sliderCho.value = cho.toString();
      if (txtCho) txtCho.textContent = cho.toString();
    });
  }

  public toggleSoloPlay(channel?: number) {
    const ch = channel ?? this.focusedChannel;
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }

    if (styPlaybackEngine.getIsPlaying() && styPlaybackEngine.getChannelSolo() === ch) {
      styPlaybackEngine.stop();
      this.updatePlayStateUI();
    } else {
      if (ch !== this.focusedChannel) {
        this.setFocusedChannel(ch);
      }
      styPlaybackEngine.setChannelSolo(ch);
      this.syncMixerSoloButtons();
      styPlaybackEngine.play();
      this.updatePlayStateUI();
    }
  }

  private updatePlayStateUI() {
    const isPlaying = styPlaybackEngine.getIsPlaying();
    const currentSolo = styPlaybackEngine.getChannelSolo();

    if (isPlaying) {
      if (currentSolo === null) {
        // 全曲合奏播放中
        this.btnPlay.classList.add('playing');
        this.btnPlay.innerHTML = '⏸ 暫停全曲 (Pause)';
        this.btnPlaySolo.classList.remove('playing');
        this.btnPlaySolo.innerHTML = '🎧 僅播此軌 (Solo)';
      } else {
        // 單軌獨奏中
        this.btnPlay.classList.remove('playing');
        this.btnPlay.innerHTML = '▶ 播放全曲 (All)';
        this.btnPlaySolo.classList.add('playing');
        this.btnPlaySolo.innerHTML = '⏸ 暫停獨奏 (Pause)';
      }
    } else {
      this.btnPlay.classList.remove('playing');
      this.btnPlay.innerHTML = '▶ 播放全曲 (All)';
      this.btnPlaySolo.classList.remove('playing');
      this.btnPlaySolo.innerHTML = '🎧 僅播此軌 (Solo)';

      // 播放停止或播畢時，若伴奏切片彈窗正處於純伴奏試聽模式，自動還原按鈕狀態並解除通道靜音
      if (this.midiSliceAssignModal?.getIsAuditioningAccomp()) {
        this.midiSliceAssignModal.resetAuditionState();
      }
      this.restoreAuditionMutedChannels();
    }

    this.trackEditor?.updateSoloPlayState(isPlaying && currentSolo !== null, currentSolo);

    this.updateFocusedBanner();
  }

  private async initMidi() {
    // 綁定即時 MIDI TX 訊號監控器與閃爍指示燈
    midiManager.onTxActivity((entry) => {
      if (this.midiTxLogText) {
        const portTag = entry.connected ? '' : ' [離線預覽]';
        this.midiTxLogText.textContent = `${entry.summary}  [${entry.hexBytes}]${portTag}`;
      }
      if (this.midiTxLed) {
        this.midiTxLed.style.background = entry.connected ? '#10b981' : '#38bdf8';
        this.midiTxLed.style.boxShadow = entry.connected
          ? '0 0 8px rgba(16, 185, 129, 0.9)'
          : '0 0 8px rgba(56, 189, 248, 0.9)';
        if (this.txLedTimer) clearTimeout(this.txLedTimer);
        this.txLedTimer = setTimeout(() => {
          if (this.midiTxLed) {
            this.midiTxLed.style.background = '#475569';
            this.midiTxLed.style.boxShadow = 'none';
          }
        }, 120);
      }
    });

    // 綁定熱插拔自動偵測與重連同步
    midiManager.onDeviceChange(async () => {
      await this.refreshMidiPorts();
      if (styPlaybackEngine.isMidiEnabled() && midiManager.getSelectedOutput()) {
        const name = midiManager.getSelectedOutput()?.name || 'PSR-SX920';
        const mode = styPlaybackEngine.getOutputMode();
        this.outputCurrentStatus.textContent = mode === 'both'
          ? `⚡ 當前輸出：雙模同步 (電腦 + ${name})`
          : `🎹 當前輸出：實體電子琴 (${name})`;
        styPlaybackEngine.syncAllPartsToMidi({ panicFirst: false, resetExpression: !styPlaybackEngine.getIsPlaying() });
      }
    });

    if (!midiManager.isSupported()) {
      this.midiStatusPill.textContent = '❌ 不支援 Web MIDI';
      return;
    }

    try {
      await midiManager.requestAccess();
      await this.refreshMidiPorts();
      const selectedOut = midiManager.getSelectedOutput();
      const selectedIn = midiManager.getSelectedInput();
      if (selectedOut || selectedIn) {
        const outName = selectedOut?.name || '無輸出';
        const inName = selectedIn?.name || '無輸入';
        this.midiStatusPill.textContent = selectedOut
          ? `🟢 已連線: ${outName}`
          : `🟡 輸入已就緒: ${inName}`;
        this.midiStatusPill.classList.add('connected');
      } else {
        this.midiStatusPill.textContent = '⚪ 未偵測到 MIDI 設備';
      }
    } catch {
      this.midiStatusPill.textContent = '⚪ MIDI 權限未開啟';
    }
  }

  /**
   * 將單軌編輯器當前的音符即時同步回記憶體中的 STY 或 PAD 結構 (parsed)
   */
  private syncEditorEventsToParsed(channel: number, events: PlaybackNoteEvent[]) {
    if (!this.currentParsed) return;
    if (this.currentParsed.format === 'PAD') {
      const diag = this.currentPadDiagnosis || YamahaPadModifier.analyzePadProject(this.currentParsed);
      const padTrack = diag.tracks.find(t => t.channel === channel);
      const padNum = padTrack ? padTrack.padNum : (channel + 1);
      if (padNum >= 1 && padNum <= 4) {
        const currentEvents = events.map(e => ({
          note: e.noteNumber,
          startTick: e.relTick,
          durationTick: e.durationTicks,
          velocity: e.velocity,
        }));
        YamahaPadModifier.replacePadNotes(this.currentParsed, padNum, currentEvents);
        // 同步更新原始基準快照 (扣除當前已套用之半音位移)
        this.originalPadTrackNotes.set(
          padNum,
          currentEvents.map(n => ({
            ...n,
            note: Math.max(0, Math.min(127, n.note - this.currentPadTotalSemitoneShift)),
          }))
        );
        this.currentPadDiagnosis = YamahaPadModifier.analyzePadProject(this.currentParsed);
        this.renderPadStudioDashboard();
      }
      return;
    }
    const currentSec = styPlaybackEngine.getCurrentSection()?.name;
    if (!currentSec) return;
    YamahaStyleModifier.replaceSectionChannelNotes(
      this.currentParsed,
      currentSec,
      channel,
      events
    );
  }

  /**
   * 將單軌編輯器 CC 控制器自動化曲線即時同步回記憶體中的 STY 結構 (parsed SMF Track 0)
   */
  private syncEditorCCEventsToParsed(channel: number, controller: number, events: PlaybackCCEvent[]) {
    if (!this.currentParsed) return;
    const currentSec = styPlaybackEngine.getCurrentSection()?.name;
    if (!currentSec) return;
    YamahaStyleModifier.replaceSectionChannelCCEvents(
      this.currentParsed,
      currentSec,
      channel,
      controller,
      events
    );
  }

  /**
   * 匯出完整 STY 伴奏檔並觸發瀏覽器下載
   */
  /**
   * 同步段落小節長度調整控制列的 UI 狀態 (高亮對應按鈕與更新標籤)
   */
  public syncSectionResizeUI() {
    if (!this.currentParsed || !this.activeSectionName) return;
    const currentBars = YamahaStyleModifier.getSectionMeasureCount(this.currentParsed, this.activeSectionName);
    if (this.currentSecNameBadge) {
      this.currentSecNameBadge.textContent = `${this.activeSectionName} (${currentBars}小節)`;
    }
    if (this.inputCustomBars) {
      this.inputCustomBars.value = currentBars.toString();
    }
    document.querySelectorAll('.btn-sec-bar').forEach((btn) => {
      const b = parseInt((btn as HTMLElement).dataset.bars || '0', 10);
      btn.classList.toggle('active', b === currentBars);
    });
  }

  /**
   * 調整當前選取段落之小節長度 (Measure Cut & Extend)
   * 支援循環延伸 (Loop) 與裁切，即時刷新單軌鋼琴捲軸與播放器時鐘
   */
  public resizeCurrentSection(newBars: number) {
    if (!this.currentParsed || !this.activeSectionName) {
      alert('請先載入 STY 伴奏檔案並選取欲調整的段落');
      return;
    }

    const currentBars = YamahaStyleModifier.getSectionMeasureCount(this.currentParsed, this.activeSectionName);
    if (currentBars === newBars) return;

    const ok = YamahaStyleModifier.resizeSectionMeasures(
      this.currentParsed,
      this.activeSectionName,
      newBars
    );

    if (!ok) {
      alert(`調整段落 ${this.activeSectionName} 小節長度失敗，請重試`);
      return;
    }

    // 重新載入播放引擎並刷新介面
    styPlaybackEngine.loadParsed(this.currentParsed);
    this.renderSectionButtons();
    this.selectSection(this.activeSectionName);
  }

  /**
   * 開啟新增伴奏段落彈窗 (Add Section Modal)
   */
  public openAddSectionModal() {
    if (!this.currentParsed) {
      alert('請先載入或建立 STY 伴奏檔案');
      return;
    }
    this.addSectionModal.open(this.currentParsed, (config) => {
      this.addNewSection(config);
    });
  }

  /**
   * 為當前風格新增指定 Yamaha 標準段落 (自動注入 CASM 與可選導引拍)
   */
  public addNewSection(config: AddSectionConfig) {
    if (!this.currentParsed) return;

    const ok = YamahaStyleModifier.createSection(
      this.currentParsed,
      config.sectionName,
      config.bars
    );

    if (!ok) {
      alert(`新增伴奏段落 [${config.sectionName}] 失敗，請重試！`);
      return;
    }

    // 若啟用導引拍，自動在 CH 10 (Rhythm 2, channel index 9) 產生標準 4 拍鼓點打底
    if (config.pilotBeat) {
      const division = this.currentParsed.division || 1920;
      const timeSig = this.currentParsed.timeSignature || { numerator: 4, denominator: 4 };
      const ticksPerBeat = division;
      const ticksPerBar = Math.round(ticksPerBeat * timeSig.numerator * (4 / timeSig.denominator));
      const beatTicks = Math.round(ticksPerBar / timeSig.numerator);

      for (let b = 0; b < config.bars; b++) {
        const barStart = b * ticksPerBar;
        for (let beat = 0; beat < timeSig.numerator; beat++) {
          const beatStart = barStart + beat * beatTicks;
          // 閉鈸 (Closed Hat: 42) 每一拍穩定敲擊
          YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
            note: 42,
            velocity: beat % 2 === 0 ? 80 : 70,
            startTick: beatStart,
            durationTick: Math.round(beatTicks * 0.5),
          });

          // 4/4 拍律動: 1, 3 拍大鼓 (Kick: 36), 2, 4 拍小鼓 (Snare: 38)
          if (timeSig.numerator === 4) {
            if (beat === 0 || beat === 2) {
              YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
                note: 36,
                velocity: 100,
                startTick: beatStart,
                durationTick: Math.round(beatTicks * 0.5),
              });
            } else if (beat === 1 || beat === 3) {
              YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
                note: 38,
                velocity: 95,
                startTick: beatStart,
                durationTick: Math.round(beatTicks * 0.5),
              });
            }
          } else if (timeSig.numerator === 3) {
            if (beat === 0) {
              YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
                note: 36,
                velocity: 100,
                startTick: beatStart,
                durationTick: Math.round(beatTicks * 0.5),
              });
            } else {
              YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
                note: 38,
                velocity: 85,
                startTick: beatStart,
                durationTick: Math.round(beatTicks * 0.5),
              });
            }
          } else {
            if (beat === 0) {
              YamahaStyleModifier.addSectionNote(this.currentParsed, config.sectionName, 9, {
                note: 36,
                velocity: 100,
                startTick: beatStart,
                durationTick: Math.round(beatTicks * 0.5),
              });
            }
          }
        }
      }
    }

    // 重新載入播放引擎以解析最新段落 Marker、CASM 與小節長度
    styPlaybackEngine.loadParsed(this.currentParsed);
    this.renderSectionButtons();
    this.selectSection(config.sectionName);
    this.setFocusedChannel(9); // 自動聚焦 CH 10 Rhythm 2
  }

  /**
   * 開啟跨段落克隆與衍生視窗 (Section Clone Modal)
   */
  public openSectionCloneModal() {
    if (!this.currentParsed) {
      alert('請先載入 STY 伴奏檔案');
      return;
    }

    const currentSec = this.activeSectionName || 'Main A';
    this.sectionCloneModal.open(
      this.currentParsed,
      currentSec,
      (srcSec, targetSec, options) => {
        const result = YamahaStyleModifier.cloneSection(
          this.currentParsed!,
          srcSec,
          targetSec,
          options
        );

        if (!result.success) {
          alert(`段落複製失敗: ${result.message || '未知錯誤'}`);
          return;
        }

        // 重新載入播放引擎以解析最新段落 Marker 與小節長度
        styPlaybackEngine.loadParsed(this.currentParsed!);
        this.renderSectionButtons();
        this.selectSection(targetSec);
        alert(`🎉 已成功將【${srcSec}】複製至【${targetSec}】！\n共複製 ${result.copiedNotesCount} 顆音符，包含 ${result.copiedChannels.length} 個聲部。`);
      }
    );
  }

  /**
   * 開啟跨檔案伴奏段落移植視窗 (Section Import Modal)
   */
  public openSectionImportModal() {
    if (!this.currentParsed) {
      alert('請先載入或建立 STY 伴奏檔案');
      return;
    }

    this.sectionImportModal.open(
      this.currentParsed,
      (sourceParsed, srcSec, options) => {
        const result = YamahaStyleModifier.importSectionFromExternalStyle(
          this.currentParsed!,
          sourceParsed,
          srcSec,
          options
        );

        if (!result.success) {
          alert(`跨檔案段落移植失敗: ${result.message || '未知錯誤'}`);
          return;
        }

        // 重新載入播放引擎以解析最新段落 Marker、CASM 與小節長度
        styPlaybackEngine.loadParsed(this.currentParsed!);
        this.renderSectionButtons();
        this.selectSection(result.targetSection);
        this.renderMixer();
        this.updateFocusedBanner();
        if (result.copiedChannels.length > 0) {
          this.setFocusedChannel(result.copiedChannels[0]);
        }

        const ppqNotice = result.ppqScaled
          ? `\n時間軸自動完成 ${result.sourcePpq} ➔ ${result.targetPpq} PPQ 縮放。`
          : '';

        alert(`🎉 跨檔案段落移植成功！\n已成功將【${srcSec}】移植至【${result.targetSection}】！\n共複製 ${result.copiedNotesCount} 顆音符，涵蓋 ${result.copiedChannels.length} 個伴奏聲部。${ppqNotice}`);
      }
    );
  }

  /**
   * 開啟全新伴奏製作嚮導視窗 (New Style Modal)
   */
  public openNewStyleModal() {
    this.newStyleModal.open((config) => {
      this.createNewStyle(config);
    });
  }

  /**
   * 根據嚮導設定，從無到有建立全新符合 Yamaha SFF2 / PSR-SX920 標準的空白伴奏檔案
   */
  public createNewStyle(config: NewStyleModalConfig) {
    const division = 1920;
    const timeSig = config.timeSignature;
    const ticksPerBeat = division;
    const ticksPerBar = Math.round(ticksPerBeat * timeSig.numerator * (4 / timeSig.denominator));

    // 1. 若勾選了基礎鼓點指引 (Pilot Metronome Beat)，在 Main A 預填基礎節奏打底
    const sectionsWithNotes = config.sections.map((sec) => {
      if (sec.name === 'Main A' && config.pilotBeat) {
        const notes: any[] = [];
        const bars = Math.max(1, sec.bars);
        const beatTicks = Math.round(ticksPerBar / timeSig.numerator);
        for (let b = 0; b < bars; b++) {
          const barStart = b * ticksPerBar;
          for (let beat = 0; beat < timeSig.numerator; beat++) {
            const beatStart = barStart + beat * beatTicks;
            // 閉鈸 (Closed Hat: 42) 每一拍穩定敲擊
            notes.push({
              channel: 9, // Rhythm 2
              note: 42,
              velocity: beat % 2 === 0 ? 80 : 70,
              startTick: beatStart,
              durationTick: Math.round(beatTicks * 0.5),
            });

            // 4/4 拍律動: 1, 3 拍大鼓 (Kick: 36), 2, 4 拍小鼓 (Snare: 38)
            if (timeSig.numerator === 4) {
              if (beat === 0 || beat === 2) {
                notes.push({
                  channel: 9,
                  note: 36,
                  velocity: 100,
                  startTick: beatStart,
                  durationTick: Math.round(beatTicks * 0.5),
                });
              } else if (beat === 1 || beat === 3) {
                notes.push({
                  channel: 9,
                  note: 38,
                  velocity: 95,
                  startTick: beatStart,
                  durationTick: Math.round(beatTicks * 0.5),
                });
              }
            } else if (timeSig.numerator === 3) {
              // 3/4 拍華爾滋: 1 拍大鼓, 2, 3 拍小鼓
              if (beat === 0) {
                notes.push({ channel: 9, note: 36, velocity: 100, startTick: beatStart, durationTick: Math.round(beatTicks * 0.5) });
              } else {
                notes.push({ channel: 9, note: 38, velocity: 85, startTick: beatStart, durationTick: Math.round(beatTicks * 0.5) });
              }
            } else {
              if (beat === 0) {
                notes.push({ channel: 9, note: 36, velocity: 100, startTick: beatStart, durationTick: Math.round(beatTicks * 0.5) });
              }
            }
          }
        }
        return { ...sec, notes };
      }
      return { ...sec };
    });

    // 2. 依據預設配置 8 聲部樂器
    let selectedParts: any = undefined;
    if (config.preset === 'ballad') {
      selectedParts = {
        Rhythm1: { msb: 127, lsb: 0, pc: 89, volume: 85 }, // Pop Kit
        Rhythm2: { msb: 127, lsb: 0, pc: 0, volume: 95 },  // Standard Kit
        Bass: { msb: 0, lsb: 0, pc: 32, volume: 95 },      // Acoustic Bass
        Chord1: { msb: 0, lsb: 0, pc: 0, volume: 90 },     // Grand Piano
        Chord2: { msb: 0, lsb: 0, pc: 4, volume: 85 },     // Electric Piano
        Pad: { msb: 0, lsb: 0, pc: 89, volume: 80 },       // Warm Pad
        Phrase1: { msb: 0, lsb: 0, pc: 64, volume: 85 },   // Soprano Sax
        Phrase2: { msb: 0, lsb: 0, pc: 73, volume: 80 },   // Flute
      };
    } else if (config.preset === 'rock') {
      selectedParts = {
        Rhythm1: { msb: 127, lsb: 0, pc: 16, volume: 90 }, // Rock Kit
        Rhythm2: { msb: 127, lsb: 0, pc: 0, volume: 100 }, // Standard Kit
        Bass: { msb: 0, lsb: 0, pc: 34, volume: 100 },     // Pick Bass
        Chord1: { msb: 0, lsb: 0, pc: 30, volume: 95 },    // Distortion Guitar
        Chord2: { msb: 0, lsb: 0, pc: 27, volume: 90 },    // Clean Guitar
        Pad: { msb: 0, lsb: 0, pc: 18, volume: 85 },       // Rock Organ
        Phrase1: { msb: 0, lsb: 0, pc: 29, volume: 95 },   // Overdriven Guitar
        Phrase2: { msb: 0, lsb: 0, pc: 48, volume: 80 },   // Strings
      };
    }

    // 3. 呼叫 YamahaStyleSynthesizer 生成全新 SFF2 結構
    const newParsed = YamahaStyleSynthesizer.createBlankStyle({
      styleName: config.styleName,
      bpm: config.bpm,
      timeSignature: config.timeSignature,
      division,
      sections: sectionsWithNotes,
      parts: selectedParts,
    });

    // 4. 掛載進播放器與工作台
    this.currentParsed = newParsed;
    this.currentSongAnalysis = MidiSongAnalyzer.analyze(newParsed, `${config.styleName}.sty`);
    this.currentFileName = `${config.styleName}.sty`;
    this.baseBpm = config.bpm;
    this.sliderBpm.value = config.bpm.toString();
    this.labelBpmValue.textContent = config.bpm.toString();

    if (this.midiInspectorPanel) this.midiInspectorPanel.style.display = 'none';
    if (this.chordAuditionBar) this.chordAuditionBar.style.display = '';
    if (this.sectionMatrixPanel) this.sectionMatrixPanel.style.display = '';
    if (this.mixerPanel) this.mixerPanel.style.display = '';
    if (this.btnExportSty) this.btnExportSty.style.display = '';

    // 更新頂部儀表板
    this.labelStyleTitle.textContent = config.styleName;
    const musicalSecs = YamahaStyleSynthesizer.getMusicalSections(newParsed);
    this.labelStyleInfo.textContent = `SFF2 (1920 PPQ) ｜ ${config.bpm} BPM ｜ ${config.timeSignature.numerator}/${config.timeSignature.denominator} 拍 ｜ ${musicalSecs.length} 個段落 ｜ 8 聲部已就緒`;

    // 載入播放引擎
    styPlaybackEngine.loadParsed(newParsed);

    // 渲染段落按鈕
    this.renderSectionButtons();
    const firstSec = musicalSecs.find(s => s.name === 'Main A')?.name || musicalSecs[0]?.name || 'Main A';
    this.selectSection(firstSec);

    // 渲染混音卡牌並預設聚焦 CH 10 Rhythm 2
    this.renderMixer();
    this.setFocusedChannel(9);

    alert(
      `🎉 全新伴奏【${config.styleName}】已成功建立！\n\n` +
      `• 拍號: ${config.timeSignature.numerator}/${config.timeSignature.denominator} 拍\n` +
      `• 速度: ${config.bpm} BPM\n` +
      `• 段落數: ${musicalSecs.length} 個段落\n` +
      `• 規格: Yamaha SFF2 原廠相容 (1920 PPQ + CASM 智慧轉調)\n\n` +
      `💡 說明：8 大伴奏混音盤與單軌鋼琴捲軸已完全就緒，可使用滑鼠繪製或 Web MIDI 實體琴鍵步進錄音！`
    );
  }

  /**
   * 檢查特定聲部在當前段落中是否已啟用
   */
  public isChannelActive(channel: number): boolean {
    if (!this.currentParsed || !this.activeSectionName) return false;
    if (styPlaybackEngine.getIsSongMode()) {
      return styPlaybackEngine.getAllChannelEvents(channel).length > 0 ||
        (this.currentSongAnalysis?.activeChannels.some(c => c.channel === channel) ?? false);
    }
    return YamahaStyleModifier.isSectionChannelActive(this.currentParsed, this.activeSectionName, channel);
  }

  /**
   * 取得特定聲部的 Yamaha 官方推薦預設音色
   */
  public getDefaultVoiceForPart(channel: number): YamahaVoice {
    switch (channel) {
      case 8: // Rhythm 1
        return findYamahaVoice(127, 0, 89) || findYamahaVoice(127, 0, 0) || {
          id: 'pop_kit', name: 'Pop Drum Kit', chineseName: '現代流行電台打擊鼓組', category: 'Drums', msb: 127, lsb: 0, pc: 89, icon: 'S801'
        };
      case 9: // Rhythm 2
        return findYamahaVoice(127, 0, 0) || {
          id: 'std_kit', name: 'Standard Kit 1', chineseName: '標準原廠打擊鼓組', category: 'Drums', msb: 127, lsb: 0, pc: 0, icon: 'S801'
        };
      case 10: // Bass
        return findYamahaVoice(104, 2, 33) || findYamahaVoice(0, 112, 33) || {
          id: 'finger_bass', name: 'Finger Bass', chineseName: '指彈爵士電貝斯', category: 'Bass', msb: 104, lsb: 2, pc: 33, icon: 'S809'
        };
      case 11: // Chord 1
        return findYamahaVoice(104, 21, 0) || findYamahaVoice(0, 122, 0) || {
          id: 'cfx_grand', name: 'CFX Concert Grand', chineseName: 'CFX 音樂會旗艦大三角鋼琴 (Concert Grand)', category: 'Piano', msb: 104, lsb: 21, pc: 0, icon: 'S801'
        };
      case 12: // Chord 2
        return findYamahaVoice(0, 118, 4) || findYamahaVoice(8, 41, 20) || {
          id: 'suitcase_ep', name: 'SuitcaseEP', chineseName: '經典手提箱電鋼琴 (Suitcase EP)', category: 'E.Piano', msb: 0, lsb: 118, pc: 4, icon: 'S801'
        };
      case 13: // Pad
        return findYamahaVoice(8, 33, 49) || findYamahaVoice(0, 112, 48) || {
          id: 'live_strings', name: 'Seattle Strings', chineseName: '西雅圖交響大弦樂團', category: 'Strings', msb: 8, lsb: 33, pc: 49, icon: 'S809'
        };
      case 14: // Phrase 1
        return findYamahaVoice(0, 113, 64) || findYamahaVoice(0, 112, 64) || {
          id: 'sweet_sax', name: 'SopranoSax', chineseName: '甜美高音薩克斯風 (Soprano Sax)', category: 'Saxophone', msb: 0, lsb: 113, pc: 64, icon: 'S809'
        };
      case 15: // Phrase 2
        return findYamahaVoice(8, 35, 49) || findYamahaVoice(0, 112, 73) || {
          id: 'studio_strings', name: 'Studio Strings', chineseName: '錄音室精緻室內弦樂', category: 'Strings', msb: 8, lsb: 35, pc: 49, icon: 'S809'
        };
      default:
        return findYamahaVoice(104, 21, 0) || {
          id: 'cfx_grand', name: 'CFX Concert Grand', chineseName: 'CFX 音樂會旗艦大三角鋼琴 (Concert Grand)', category: 'Piano', msb: 104, lsb: 21, pc: 0, icon: 'S801'
        };
    }
  }

  /**
   * 啟用/新增一個空白未使用的伴奏聲部 (Plan A)
   * 1. 寫入音色、控制器、CASM 伴奏規則
   * 2. 同步播放引擎各項狀態
   * 3. 重新渲染 Mixer 與 Banner
   */
  public activateChannel(channel: number, voice?: YamahaVoice): boolean {
    if (!this.currentParsed || !this.activeSectionName) return false;

    const targetVoice = voice || this.getDefaultVoiceForPart(channel);
    const result = YamahaStyleModifier.activateSectionChannel(
      this.currentParsed,
      this.activeSectionName,
      channel,
      targetVoice
    );

    if (!result.success) return false;

    // 1. 同步播放引擎各項狀態
    styPlaybackEngine.setChannelVoice(channel, targetVoice);
    styPlaybackEngine.setChannelVolume(channel, 100);
    styPlaybackEngine.setChannelPan(channel, 64);
    styPlaybackEngine.setChannelReverb(channel, 40);
    styPlaybackEngine.setChannelChorus(channel, 0);

    // 2. 重新選取當前段落以更新快照與 CASM 路由
    styPlaybackEngine.selectSection(this.activeSectionName);

    // 3. 更新 UI
    this.renderMixer();
    this.updateFocusedBanner();
    this.refreshTrackEditor();

    // 4. 試聽剛啟用的音色樂句
    styPlaybackEngine.previewVoicePhrase(channel, targetVoice);

    return true;
  }

  /**
   * 開啟指定 Channel 的 Yamaha 原廠音色搜尋與選擇視窗 (Voice Picker Modal)
   */
  public openVoicePickerForChannel(channel: number) {
    const part = this.getChannelPartDef(channel);
    const currentVoice = styPlaybackEngine.getPartVoices().get(channel) || null;
    this.voicePicker.open(channel, part.label, currentVoice, (targetCh, selectedVoice) => {
      this.applyVoiceToChannel(targetCh, selectedVoice);
    });
  }

  /**
   * 套用選取的 Yamaha 原廠音色至指定聲部
   * 1. 即時更新播放引擎與合成器 / 琴端 MIDI
   * 2. 即時更新記憶體中的 STY 結構 (Track 0 Bank/Program Change + CASM/OTS 混音)
   * 3. 即時更新面板伴奏小卡與頂部聚焦橫幅 / 單軌編輯器工具列
   * 4. 播放示範試聽樂句 (Audition Phrase)
   */
  public applyVoiceToChannel(channel: number, voice: YamahaVoice) {
    // 若處於 STY 伴奏模式且該聲部尚未啟用，自動走一鍵啟用流程 (自動建立 CASM 轉調規則與控制器快照)
    if (!styPlaybackEngine.getIsSongMode() && !this.isChannelActive(channel)) {
      this.activateChannel(channel, voice);
      return;
    }

    // 1. 更新播放引擎 (軟體合成器 or 實體 MIDI)
    styPlaybackEngine.setChannelVoice(channel, voice);

    if (styPlaybackEngine.getIsSongMode()) {
      // 若為 Multi Pad (.PAD) 模式，同步寫入該 Pad 的二進位 MSB/LSB/PC
      if (this.currentParsed && this.currentParsed.format === 'PAD') {
        const diag = this.currentPadDiagnosis || YamahaPadModifier.analyzePadProject(this.currentParsed);
        const padTrack = diag.tracks.find(t => t.channel === channel);
        const padNum = padTrack ? padTrack.padNum : (channel + 1);
        if (padNum >= 1 && padNum <= 4) {
          YamahaPadModifier.setPadMixing(this.currentParsed, padNum, {
            bankMsb: voice.msb,
            bankLsb: voice.lsb,
            programChange: voice.pc,
          });
          this.currentPadDiagnosis = YamahaPadModifier.analyzePadProject(this.currentParsed);
          this.renderPadStudioDashboard();
        }
      }
      const voiceEl = document.getElementById(`part-voice-${channel}`);
      if (voiceEl) {
        const name = (voice.chineseName && voice.chineseName !== voice.name) ? `${voice.name} (${voice.chineseName})` : voice.name;
        const codeBadge = `${voice.msb}-${voice.lsb}-${voice.pc + 1}`;
        const catIcon = voice.category === 'Drums' ? '🥁' : (voice.category === 'Percussion' ? '🔔' : (voice.category === 'Bass' ? '🎸' : '🎹'));
        voiceEl.innerHTML = `
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${catIcon} ${name}</span>
          <span style="font-size: 0.72rem; color: #38bdf8; flex-shrink: 0; white-space: nowrap;">[${codeBadge}] ✏️</span>
        `;
      }
      if (this.focusedChannel === channel) {
        this.updateFocusedBanner();
        const updatedInfo = styPlaybackEngine.getPartVoices().get(channel) || null;
        this.trackEditor.updateVoiceInfo(updatedInfo);
      }
      styPlaybackEngine.previewVoicePhrase(channel, voice);
      return;
    }

    // 2. 更新記憶體中 STY 的二進位混音配置，確保安全匯出包含新音色
    if (this.currentParsed) {
      YamahaStyleModifier.setPartMixing(this.currentParsed, channel, {
        bankMsb: voice.msb,
        bankLsb: voice.lsb,
        programChange: voice.pc,
      });
      // 同步更新當前段落 CASM 來源通道與首音符控制器快照 (例如 SFF1 Intro A: Src 2 -> Dest 14)
      const currentSec = styPlaybackEngine.getCurrentSection();
      if (currentSec) {
        const secNameLower = currentSec.name.toLowerCase();
        const casmSecMap = this.currentParsed.casmMappings?.[secNameLower]
          || this.currentParsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];

        if (casmSecMap) {
          for (const [srcStr, dst] of Object.entries(casmSecMap)) {
            if (dst === channel) {
              const srcCh = parseInt(srcStr, 10);
              YamahaStyleModifier.setPartMixing(this.currentParsed, srcCh, {
                bankMsb: voice.msb,
                bankLsb: voice.lsb,
                programChange: voice.pc,
              });
              if (currentSec.initialControllers?.[srcCh]) {
                currentSec.initialControllers[srcCh].programChange = voice.pc;
                currentSec.initialControllers[srcCh].bankMsb = voice.msb;
                currentSec.initialControllers[srcCh].bankLsb = voice.lsb;
              }
            }
          }
        }
      }
    }

    // 3. 更新伴奏小卡 UI
    const voiceEl = document.getElementById(`part-voice-${channel}`);
    if (voiceEl) {
      const name = voice.chineseName ? `${voice.name} (${voice.chineseName})` : voice.name;
      const codeBadge = `${voice.msb}-${voice.lsb}-${voice.pc + 1}`;
      voiceEl.textContent = `${name} [${codeBadge}] ✏️`;
      voiceEl.title = `${name} (Category: ${voice.category}, SX920 面板: ${codeBadge}) - 點擊更換音色`;
    }

    // 4. 若當前正聚焦該聲部，更新頂部聚焦橫幅與單軌編輯器標籤
    if (this.focusedChannel === channel) {
      this.updateFocusedBanner();
      const updatedInfo = styPlaybackEngine.getPartVoices().get(channel) || null;
      this.trackEditor.updateVoiceInfo(updatedInfo);
    }

    // 5. 播放試聽音色示範樂句
    styPlaybackEngine.previewVoicePhrase(channel, voice);
  }

  private exportCurrentStyle() {
    if (!this.currentParsed) {
      alert('尚未載入任何檔案，請先拖曳或選擇檔案！');
      return;
    }

    if (this.currentParsed.format === 'PAD') {
      this.exportCurrentPadFile();
      return;
    }

    try {
      // 1. 同步當前段落所有聲部的即時事件與混音音量 (含 CASM 來源通道同步)
      const currentSec = styPlaybackEngine.getCurrentSection()?.name;
      if (currentSec) {
        const secNameLower = currentSec.toLowerCase();
        const casmSecMap = this.currentParsed.casmMappings?.[secNameLower]
          || this.currentParsed.casmMappings?.[secNameLower.replace(/\s+/g, '')];

        for (let ch = 8; ch <= 15; ch++) {
          const events = styPlaybackEngine.getChannelEvents(ch);
          YamahaStyleModifier.replaceSectionChannelNotes(
            this.currentParsed,
            currentSec,
            ch,
            events
          );
          const vol = styPlaybackEngine.getChannelVolume(ch);
          const pan = styPlaybackEngine.getChannelPan(ch);
          const rev = styPlaybackEngine.getChannelReverb(ch);
          const cho = styPlaybackEngine.getChannelChorus(ch);
          const mixParams = { volume: vol, pan, reverb: rev, chorus: cho };
          YamahaStyleModifier.setPartMixing(this.currentParsed, ch, mixParams);

          if (casmSecMap) {
            for (const [srcStr, dst] of Object.entries(casmSecMap)) {
              if (dst === ch) {
                const srcCh = parseInt(srcStr, 10);
                YamahaStyleModifier.setPartMixing(this.currentParsed, srcCh, mixParams);
              }
            }
          }
        }
      }

      // 2. 執行二進位安全匯出與反向完整性驗證 (含 CASM & OTS 校驗)
      const exportResult = YamahaWriter.validateAndWrite(this.currentParsed);

      // 3. 觸發瀏覽器下載
      const blob = new Blob([exportResult.bytes as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = (this.currentFileName || 'YamahaStyle').replace(/\.(sty|prs|sst|mid)$/i, '');
      const downloadName = `${baseName}_edited.sty`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 4. 提供成功回饋
      alert(
        `🎉 伴奏檔匯出成功！\n\n` +
        `檔案名稱: ${downloadName}\n` +
        `檔案大小: ${(exportResult.fileSize / 1024).toFixed(1)} KB\n` +
        `伴奏段落: ${exportResult.sectionCount} 個段落\n` +
        `總音符數: ${exportResult.totalNotes} 個\n` +
        `CASM 和弦轉調區塊: ${exportResult.hasCasm ? '✅ 完整保留 (琴端自動伴奏轉調正常)' : '無'}\n\n` +
        `💡 說明：檔案已下載至電腦，可直接複製存入 USB 隨身碟，插上 PSR-SX920 琴端載入演奏！`
      );
    } catch (err: any) {
      console.error('匯出 STY 失敗:', err);
      alert(`匯出 STY 伴奏檔失敗: ${err.message}`);
    }
  }

  /**
   * 初始化 Multi Pad (.PAD) 調性平移與 4 軌修改工作台控制項與事件
   */
  private initPadStudioControls() {
    if (!this.selectPadSourceKey || !this.selectPadTargetKey) return;

    const optionsHtml = PAD_KEY_LIST.map(
      (k) => `<option value="${k.key}">${k.labelZh}</option>`
    ).join('');
    this.selectPadSourceKey.innerHTML = optionsHtml;
    this.selectPadTargetKey.innerHTML = optionsHtml;
    this.selectPadSourceKey.value = 'Am';
    this.selectPadTargetKey.value = 'Em';

    const onTargetKeyChange = () => {
      if (this.inputPadKeySuffix && this.selectPadTargetKey) {
        this.inputPadKeySuffix.value = this.selectPadTargetKey.value;
      }
      if (this.selectPadTargetKey) {
        this.userPreferredTargetKey = this.selectPadTargetKey.value;
      }
      this.updatePadShiftPreview();
      // 若先前已套用過平移，使用者切換目標調時自動以新目標調重新平移
      if (this.currentPadTotalSemitoneShift !== 0) {
        this.applyPadTransposition();
      }
    };

    const onSourceKeyChange = () => {
      this.updatePadKeyBadge();
      this.updatePadShiftPreview();
      // 若先前已套用過平移，使用者切換基準調時自動以新基準調重新平移
      if (this.currentPadTotalSemitoneShift !== 0) {
        this.applyPadTransposition();
      }
    };

    this.selectPadSourceKey.addEventListener('change', onSourceKeyChange);
    this.selectPadTargetKey.addEventListener('change', onTargetKeyChange);
    this.selectPadShiftDir?.addEventListener('change', () => {
      this.updatePadShiftPreview();
      if (this.currentPadTotalSemitoneShift !== 0) {
        this.applyPadTransposition();
      }
    });

    this.btnApplyPadTranspose?.addEventListener('click', () => {
      this.applyPadTransposition();
    });

    document.getElementById('btn-reset-pad-transpose')?.addEventListener('click', () => {
      this.resetPadToOriginalPitch();
    });

    this.btnExportPadFile?.addEventListener('click', () => {
      this.exportCurrentPadFile();
    });

    const onCreateNewPad = (e: Event) => {
      e.stopPropagation();
      this.createNewBlankMultiPad();
    };
    document.getElementById('btn-create-new-pad')?.addEventListener('click', onCreateNewPad);
    document.getElementById('btn-pad-studio-new')?.addEventListener('click', onCreateNewPad);

    // 常用目標調性一鍵快捷按鈕 (點擊後自動選取目標調並立即套用平移)
    document.querySelectorAll('.pad-quick-key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetKey = (btn as HTMLElement).getAttribute('data-target-key') || 'Em';
        if (this.selectPadTargetKey) {
          this.selectPadTargetKey.value = targetKey;
          this.userPreferredTargetKey = targetKey;
        }
        if (this.inputPadKeySuffix) this.inputPadKeySuffix.value = targetKey;
        this.updatePadShiftPreview();
        this.applyPadTransposition();
      });
    });

    // 半音與八度微調按鈕 (基於當前已套用之位移再增減)
    document.getElementById('btn-pad-semi-minus')?.addEventListener('click', () => {
      this.applyPadTransposition(this.currentPadTotalSemitoneShift - 1);
    });
    document.getElementById('btn-pad-semi-plus')?.addEventListener('click', () => {
      this.applyPadTransposition(this.currentPadTotalSemitoneShift + 1);
    });
    document.getElementById('btn-pad-oct-minus')?.addEventListener('click', () => {
      this.applyPadTransposition(this.currentPadTotalSemitoneShift - 12);
    });
    document.getElementById('btn-pad-oct-plus')?.addEventListener('click', () => {
      this.applyPadTransposition(this.currentPadTotalSemitoneShift + 12);
    });
  }

  /**
   * 建立全新空白 4 軌 Multi Pad (.PAD) 專案並立即切入工作台
   */
  private createNewBlankMultiPad() {
    const blank = YamahaPadSynthesizer.createBlankProject({
      projectName: 'NewMultiPad',
      bpm: 120,
      bars: 4,
      division: 480,
    });
    YamahaPadModifier.syncControlTagsToTrack0(blank);
    const bytes = YamahaWriter.write(blank);
    this.parseAndLoadBytes(bytes, 'NewMultiPad.PAD');
    if (this.padStudioStatusMsg) {
      this.padStudioStatusMsg.textContent = '✨ 已建立全新 4 軌空白 Multi Pad 專案 (預設 4 小節 · 120 BPM · CM0000)，可直接在下方鋼琴捲軸點選創作音符！';
    }
  }

  /**
   * 還原 Multi Pad 所有軌道至載入時的原始音高 (0 半音位移)
   */
  private resetPadToOriginalPitch() {
    if (!this.currentParsed || this.currentParsed.format !== 'PAD') return;
    const wasPlaying = styPlaybackEngine.getIsPlaying();
    styPlaybackEngine.stop();

    for (let padNum = 1; padNum <= 4; padNum++) {
      const origNotes = this.originalPadTrackNotes.get(padNum);
      if (origNotes) {
        YamahaPadModifier.replacePadNotes(this.currentParsed, padNum, origNotes.map(n => ({ ...n })));
      }
    }
    this.currentPadTotalSemitoneShift = 0;
    const srcKey = this.selectPadSourceKey?.value || this.initialPadDiagnosis?.estimatedKey || 'Am';
    this.lastTransposedKeySuffix = srcKey;

    if (this.currentParsed.padConfig) {
      this.currentParsed.padConfig.names = this.currentParsed.padConfig.names.map((rawName, idx) => {
        const baseName = (rawName || `Pad ${idx + 1}`).replace(/\s*\([^)]*\)\s*$/, '').trim();
        return `${baseName} (${srcKey})`;
      });
      YamahaPadModifier.syncControlTagsToTrack0(this.currentParsed);
    }

    const analysis = MidiSongAnalyzer.analyze(this.currentParsed, this.currentFileName);
    this.currentSongAnalysis = analysis;
    this.currentPadDiagnosis = YamahaPadModifier.analyzePadProject(this.currentParsed);

    styPlaybackEngine.loadParsed(this.currentParsed);
    styPlaybackEngine.loadSongMode(1, Math.max(1, analysis.totalBars));

    this.renderPadStudioDashboard();
    this.setFocusedChannel(this.focusedChannel);

    if (this.padStudioStatusMsg) {
      this.padStudioStatusMsg.textContent = `🔄 已還原至原始載入音高 (${srcKey}，0 半音位移)`;
    }
    if (wasPlaying) {
      styPlaybackEngine.play();
    }
  }

  /**
   * 即時計算並更新「原曲基準調 ➔ 目標調性」的半音位移預覽標籤
   */
  private updatePadShiftPreview() {
    if (!this.selectPadSourceKey || !this.selectPadTargetKey || !this.padShiftPreviewBadge) return;
    const srcKey = this.selectPadSourceKey.value || 'Am';
    const dstKey = this.selectPadTargetKey.value || 'Em';
    const dir = (this.selectPadShiftDir?.value as 'auto' | 'up' | 'down') || 'auto';

    // 永遠以原始未移調之最高音計算預覽位移
    const initDiag = this.initialPadDiagnosis || this.currentPadDiagnosis;
    const maxPitches = initDiag
      ? initDiag.tracks.filter(t => t.pitchMax !== null && t.musicalType !== 'DRUM_SFX').map(t => t.pitchMax!)
      : [84];
    const highestPitch = maxPitches.length > 0 ? Math.max(...maxPitches) : 84;

    const shiftInfo = YamahaPadModifier.calculateSemitoneShift(srcKey, dstKey, dir, highestPitch, 96);
    const sign = shiftInfo.semitones > 0 ? `+${shiftInfo.semitones}` : `${shiftInfo.semitones}`;
    const isApplied = this.currentPadTotalSemitoneShift === shiftInfo.semitones && this.lastTransposedKeySuffix !== '';
    this.padShiftPreviewBadge.textContent = isApplied
      ? `✅ 已套用：${srcKey} ➔ ${dstKey} (位移: ${sign} 半音)`
      : `預覽：${srcKey} ➔ ${dstKey} (位移: ${sign} 半音)`;
  }

  /**
   * 即時更新頂部基準調徽章 (若使用者手動覆寫原曲基準調，標示為手動指定)
   */
  private updatePadKeyBadge() {
    if (!this.padAutoKeyBadge) return;
    const initDiag = this.initialPadDiagnosis || this.currentPadDiagnosis;
    if (!initDiag) return;
    const currentSrcKey = this.selectPadSourceKey?.value || initDiag.estimatedKey;
    const estimatedKey = initDiag.estimatedKey;
    const estimatedLabel = initDiag.estimatedKeyLabelZh;
    const conf = initDiag.keyConfidence;

    if (currentSrcKey !== estimatedKey) {
      const srcItem = PAD_KEY_LIST.find(k => k.key === currentSrcKey);
      const srcLabel = srcItem ? srcItem.labelZh : currentSrcKey;
      this.padAutoKeyBadge.textContent = `🎯 手動指定基準調：${srcLabel} ｜ (原始自動估算: ${estimatedLabel} ${conf}%)`;
      this.padAutoKeyBadge.style.color = '#38bdf8';
    } else {
      this.padAutoKeyBadge.textContent = `💡 原始檔案自動估算：${estimatedLabel} (${conf}%)`;
      this.padAutoKeyBadge.style.color = '';
    }
  }

  /**
   * 執行 Multi Pad 固定調性剛體半音平移 (永遠以原始載入音符快照為基準，原曲基準調保持不變、不重複疊加！)
   */
  private applyPadTransposition(customTotalSemitones?: number) {
    if (!this.currentParsed || this.currentParsed.format !== 'PAD') return;

    const srcKey = this.selectPadSourceKey?.value || 'Am';
    const dstKey = this.selectPadTargetKey?.value || 'Em';
    const dir = (this.selectPadShiftDir?.value as 'auto' | 'up' | 'down') || 'auto';
    const suffix = this.inputPadKeySuffix?.value.trim() || dstKey;

    const wasPlaying = styPlaybackEngine.getIsPlaying();
    styPlaybackEngine.stop();

    // 1. 先將 4 軌音符還原至「原始未移調快照」，確保無論按幾次或中途更改原曲基準調，都是從原始音高乾淨計算一次！
    for (let padNum = 1; padNum <= 4; padNum++) {
      const origNotes = this.originalPadTrackNotes.get(padNum);
      if (origNotes) {
        YamahaPadModifier.replacePadNotes(this.currentParsed, padNum, origNotes.map(n => ({ ...n })));
      }
    }

    const selectedPads = Array.from(this.selectedPadNumsForTranspose).sort((a, b) => a - b);
    if (selectedPads.length === 0) {
      alert('請至少勾選 1 個要參與調性平移的 Pad 軌道！');
      return;
    }

    // 2. 從原始音高針對勾選之 Pad 執行單次精準剛體平移 (未勾選之 Pad 保持原始音高不動)
    const res = YamahaPadModifier.transposePadKey(this.currentParsed, {
      sourceKey: srcKey,
      targetKey: dstKey,
      customSemitones: customTotalSemitones,
      direction: dir,
      padNumbers: selectedPads,
      enforceFixedKeyCM0000: true,
      appendKeySuffixToNames: customTotalSemitones === undefined,
      keySuffixLabel: suffix,
    });

    this.currentPadTotalSemitoneShift = res.baseSemitoneShift;
    this.lastTransposedKeySuffix = customTotalSemitones === undefined ? suffix : `${res.baseSemitoneShift > 0 ? '+' : ''}${res.baseSemitoneShift}st`;

    // 3. 重新分析當前音域並載入播放引擎
    const analysis = MidiSongAnalyzer.analyze(this.currentParsed, this.currentFileName);
    this.currentSongAnalysis = analysis;
    this.currentPadDiagnosis = YamahaPadModifier.analyzePadProject(this.currentParsed);

    styPlaybackEngine.loadParsed(this.currentParsed);
    styPlaybackEngine.loadSongMode(1, Math.max(1, analysis.totalBars));

    this.renderPadStudioDashboard();
    this.setFocusedChannel(this.focusedChannel);

    const sign = res.baseSemitoneShift > 0 ? `+${res.baseSemitoneShift}` : `${res.baseSemitoneShift}`;
    const padsLabel = selectedPads.map(n => `Pad ${n}`).join('、');
    if (this.padStudioStatusMsg) {
      this.padStudioStatusMsg.textContent = customTotalSemitones !== undefined
        ? `✅ 已對【${padsLabel}】套用累計微調 ${sign} 半音，Track 0 已鎖定 ${res.cmTag}`
        : `✅ 已將【${padsLabel}】從原曲基準調【${res.sourceKey}】剛體平移至目標調【${res.targetKey}】(${sign} 半音)，鎖定 ${res.cmTag}！`;
    }

    if (wasPlaying) {
      styPlaybackEngine.play();
    }
  }

  /**
   * 渲染 Multi Pad (.PAD) 4 軌視覺化工作台與診斷卡片
   */
  private renderPadStudioDashboard() {
    if (!this.currentParsed || this.currentParsed.format !== 'PAD' || !this.padCardsGrid) return;

    const diag = YamahaPadModifier.analyzePadProject(this.currentParsed);
    this.currentPadDiagnosis = diag;
    const initDiag = this.initialPadDiagnosis || diag;

    const cfg = this.currentParsed.padConfig!;
    const cmStr = `CM${cfg.chordMatchFlags.map(f => (f ? '1' : '0')).join('')}`;
    const rpStr = `RP${cfg.repeatFlags.map(f => (f ? '1' : '0')).join('')}`;

    if (this.padStudioCmBadge) {
      this.padStudioCmBadge.textContent = `Track 0: ${cmStr} · ${rpStr}`;
    }
    this.updatePadKeyBadge();
    if (this.padKeyReasonText) {
      this.padKeyReasonText.textContent = initDiag.keyDetectionReasonZh;
    }

    this.updatePadShiftPreview();

    const padColors = ['#38bdf8', '#f59e0b', '#10b981', '#a855f7'];

    this.padCardsGrid.innerHTML = diag.tracks.map((t, idx) => {
      const color = padColors[idx % padColors.length];
      const isFocused = this.focusedChannel === t.channel;
      const isMuted = styPlaybackEngine.isChannelMuted(t.channel);
      const isSolo = styPlaybackEngine.getChannelSolo() === t.channel;
      const isCheckedForTranspose = this.selectedPadNumsForTranspose.has(t.padNum);

      const typeBadgeColor = t.musicalType === 'MELODY_INTRO'
        ? 'background: rgba(245, 158, 11, 0.18); border: 1px solid rgba(245, 158, 11, 0.45); color: #fcd34d;'
        : (t.musicalType === 'EMPTY'
          ? 'background: rgba(148, 163, 184, 0.12); border: 1px solid rgba(148, 163, 184, 0.25); color: #94a3b8;'
          : 'background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #7dd3fc;');

      const iconOptionsHtml = PAD_ICON_LIST.map(
        (ic) => `<option value="${ic.code}" ${t.icon === ic.code ? 'selected' : ''}>${ic.labelZh}</option>`
      ).join('') + (!PAD_ICON_LIST.some(ic => ic.code === t.icon) ? `<option value="${t.icon}" selected>${t.icon}</option>` : '');

      const cloneTargetOptionsHtml = [1, 2, 3, 4]
        .filter(num => num !== t.padNum)
        .map(num => `<option value="${num}">複製至 Pad ${num}</option>`)
        .join('');

      const conflictWarningHtml = t.hasChordMatchConflict
        ? `<div style="font-size: 0.72rem; color: #fca5a5; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 5px; padding: 4px 8px; margin-top: 4px;">
             ⚠️ <strong>走音風險提示</strong>：此軌為長旋律/含導音，開啟 CM 在琴端會被自然小調削平走音！建議關閉 CM 並用上方【調性平移】。
           </div>`
        : '';

      return `
        <div class="pad-studio-card" data-pad-num="${t.padNum}" data-channel="${t.channel}"
             style="background: rgba(19, 27, 46, 0.92); border: 2px solid ${isFocused ? color : 'rgba(255,255,255,0.1)'}; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.15s; box-shadow: ${isFocused ? `0 0 14px ${color}33` : 'none'}; min-width: 0; overflow: hidden;">
          <!-- 頂部：Pad 編號 + 名稱輸入框 + 參與移調勾選 -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
              <span style="background: ${color}; color: #090d16; font-weight: 800; font-size: 0.76rem; padding: 2px 7px; border-radius: 5px; flex-shrink: 0;">PAD ${t.padNum}</span>
              <input type="text" class="input-pad-card-name" data-pad-num="${t.padNum}" value="${t.name}"
                     style="background: rgba(9, 13, 22, 0.8); border: 1px solid rgba(255,255,255,0.16); color: #f8fafc; font-weight: 700; font-size: 0.82rem; padding: 3px 8px; border-radius: 5px; width: 100%; min-width: 0;"
                     title="直接修改 Track 0 的 N${t.padNum} 名稱標籤" />
            </div>
            <label style="display: flex; align-items: center; gap: 3px; font-size: 0.73rem; color: #fcd34d; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 6px; border-radius: 4px; cursor: pointer; white-space: nowrap;" title="勾選後，執行上方【調性平移】時將平移此 Pad；取消勾選則保持原音高不動">
              <input type="checkbox" class="chk-pad-card-transpose" data-pad-num="${t.padNum}" ${isCheckedForTranspose ? 'checked' : ''} style="accent-color: #f59e0b;" />
              <span>🔀參與移調</span>
            </label>
          </div>

          <!-- 音樂型態診斷、音符統計與音域範圍 -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 0.71rem; padding: 2px 7px; border-radius: 4px; font-weight: 600; ${typeBadgeColor}">
              ${t.musicalTypeLabelZh}
            </span>
            <span style="font-size: 0.72rem; color: #94a3b8;">
              <strong style="color: #cbd5e1;">${t.noteCount}</strong> 音符 · 音域: <strong style="color: #e2e8f0;">${t.pitchRangeLabel}</strong>
            </span>
          </div>

          <!-- 音色選擇按鈕 (點擊開啟 SX920 2,395 音色庫) + 圖示 I1~I4 選擇 -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" class="btn-pad-card-voice" data-channel="${t.channel}"
                    style="flex: 1; min-width: 0; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 6px 9px; color: #f8fafc; font-size: 0.79rem; font-weight: 600; display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left;"
                    title="點擊更換此 Pad 的 Yamaha PSR-SX920 樂器音色 (MSB/LSB/PC)">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">🎹 ${t.voiceInfo.voiceName}</span>
              <span style="font-size: 0.71rem; color: #38bdf8; flex-shrink: 0; margin-left: 4px;">[${t.voiceInfo.panelCode}] ✏️</span>
            </button>
            <select class="select-pad-card-icon" data-pad-num="${t.padNum}"
                    style="width: 92px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.16); color: #cbd5e1; font-size: 0.72rem; padding: 5px 4px; border-radius: 5px; cursor: pointer;"
                    title="設定 Track 0 的 I${t.padNum} 琴端圖示代碼">
              ${iconOptionsHtml}
            </select>
          </div>

          <!-- Repeat (RP) 與 Chord Match (CM) 硬體旗標開關 + 獨奏/靜音 -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; background: rgba(9, 13, 22, 0.55); padding: 6px 8px; border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #cbd5e1; cursor: pointer;" title="切換 Track 0 的 CM 旗標 (長旋律/前奏鐵律建議關閉)">
                <input type="checkbox" class="chk-pad-card-cm" data-pad-num="${t.padNum}" ${t.chordMatch ? 'checked' : ''} style="accent-color: #f59e0b;" />
                <span>🎵 CM跟隨</span>
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #cbd5e1; cursor: pointer;" title="切換 Track 0 的 RP 循環旗標">
                <input type="checkbox" class="chk-pad-card-rp" data-pad-num="${t.padNum}" ${t.repeat ? 'checked' : ''} style="accent-color: #38bdf8;" />
                <span>🔁 Repeat</span>
              </label>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button type="button" class="midi-locator-btn btn-pad-card-solo" data-channel="${t.channel}"
                      style="padding: 2px 8px; font-size: 0.72rem; ${isSolo ? 'background: #f59e0b; color: #090d16; font-weight: 700;' : ''}">
                ${isSolo ? '⏹ 解除獨奏' : '🎧 獨奏'}
              </button>
              <button type="button" class="midi-locator-btn btn-pad-card-mute" data-channel="${t.channel}"
                      style="padding: 2px 8px; font-size: 0.72rem; ${isMuted ? 'background: #ef4444; color: #fff; font-weight: 700;' : ''}">
                ${isMuted ? '🔇 已靜音' : '🔊 發聲'}
              </button>
            </div>
          </div>

          <!-- 混音與空間效果滑桿：音量 (CC7)、相位 (Pan CC10)、殘響 (Rev CC91)、合唱 (Cho CC93) -->
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.73rem; color: #94a3b8; background: rgba(15, 23, 42, 0.55); padding: 6px 8px; border-radius: 6px; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span style="width: 56px; flex-shrink: 0;">音量 CC7:</span>
              <input type="range" class="slider-pad-card-vol" data-pad-num="${t.padNum}" data-channel="${t.channel}" min="0" max="127" value="${t.mixing.volume}" style="flex: 1; width: 100%; min-width: 0; accent-color: ${color};" />
              <span class="label-pad-card-vol" style="width: 26px; flex-shrink: 0; text-align: right; color: #e2e8f0; font-weight: 600;">${t.mixing.volume}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span style="width: 56px; flex-shrink: 0;">相位 Pan:</span>
              <input type="range" class="slider-pad-card-pan" data-pad-num="${t.padNum}" data-channel="${t.channel}" min="0" max="127" value="${t.mixing.pan}" style="flex: 1; width: 100%; min-width: 0; accent-color: ${color};" />
              <span class="label-pad-card-pan" style="width: 26px; flex-shrink: 0; text-align: right; color: #e2e8f0; font-weight: 600;">${formatYamahaPan(t.mixing.pan)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span style="width: 56px; flex-shrink: 0;">殘響 Rev:</span>
              <input type="range" class="slider-pad-card-rev" data-pad-num="${t.padNum}" data-channel="${t.channel}" min="0" max="127" value="${t.mixing.reverb}" style="flex: 1; width: 100%; min-width: 0; accent-color: #38bdf8;" />
              <span class="label-pad-card-rev" style="width: 26px; flex-shrink: 0; text-align: right; color: #e2e8f0; font-weight: 600;">${t.mixing.reverb}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
              <span style="width: 56px; flex-shrink: 0;">合唱 Cho:</span>
              <input type="range" class="slider-pad-card-cho" data-pad-num="${t.padNum}" data-channel="${t.channel}" min="0" max="127" value="${t.mixing.chorus}" style="flex: 1; width: 100%; min-width: 0; accent-color: #a855f7;" />
              <span class="label-pad-card-cho" style="width: 26px; flex-shrink: 0; text-align: right; color: #e2e8f0; font-weight: 600;">${t.mixing.chorus}</span>
            </div>
          </div>

          <!-- 軌道管理工具列：小節長度設定 + 複製至其他 Pad + 清空此 Pad -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 6px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 0.72rem; color: #94a3b8;">📏小節:</span>
              <input type="number" class="input-pad-card-bars" data-pad-num="${t.padNum}" min="1" max="64" value="${t.barLength}"
                     style="width: 44px; background: rgba(9, 13, 22, 0.9); border: 1px solid rgba(255,255,255,0.18); color: #f8fafc; font-size: 0.75rem; padding: 2px 4px; border-radius: 4px; text-align: center;"
                     title="調整此 Pad 的總小節數 (1~64 小節)" />
              <button type="button" class="midi-locator-btn btn-pad-card-apply-bars" data-pad-num="${t.padNum}" style="padding: 2px 6px; font-size: 0.71rem;">套用</button>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <select class="select-pad-card-clone-target" data-pad-num="${t.padNum}"
                      style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.16); color: #cbd5e1; font-size: 0.71rem; padding: 2px 4px; border-radius: 4px;">
                ${cloneTargetOptionsHtml}
              </select>
              <button type="button" class="midi-locator-btn btn-pad-card-clone" data-pad-num="${t.padNum}" style="padding: 2px 6px; font-size: 0.71rem; color: #7dd3fc;" title="將此 Pad 的音符、音色與混音複製到選定的目標 Pad">📋複製</button>
              <button type="button" class="midi-locator-btn btn-pad-card-clear" data-pad-num="${t.padNum}" style="padding: 2px 6px; font-size: 0.71rem; color: #fda4af; border-color: rgba(244,63,94,0.35);" title="一鍵清空此 Pad 的所有音符">🗑️清空</button>
            </div>
          </div>

          ${conflictWarningHtml}
        </div>
      `;
    }).join('');

    // 綁定卡片內各控制項事件
    this.padCardsGrid.querySelectorAll('.pad-studio-card').forEach((cardEl) => {
      cardEl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'SELECT' ||
          target.closest('button') ||
          target.closest('label') ||
          target.closest('select')
        ) {
          return;
        }
        const ch = parseInt((cardEl as HTMLElement).getAttribute('data-channel') || '0', 10);
        this.setFocusedChannel(ch);
        this.renderPadStudioDashboard();
      });
    });

    // 參與移調勾選框
    this.padCardsGrid.querySelectorAll('.chk-pad-card-transpose').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        if (el.checked) {
          this.selectedPadNumsForTranspose.add(padNum);
        } else {
          this.selectedPadNumsForTranspose.delete(padNum);
        }
      });
    });

    // 名稱修改
    this.padCardsGrid.querySelectorAll('.input-pad-card-name').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        YamahaPadModifier.setPadName(this.currentParsed, padNum, el.value);
        if (this.padStudioStatusMsg) {
          this.padStudioStatusMsg.textContent = `✅ 已更新 Pad ${padNum} 名稱為「${el.value.trim()}」`;
        }
      });
    });

    // 圖示代碼 (I1~I4) 修改
    this.padCardsGrid.querySelectorAll('.select-pad-card-icon').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLSelectElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        YamahaPadModifier.setPadIcon(this.currentParsed, padNum, el.value);
        if (this.padStudioStatusMsg) {
          this.padStudioStatusMsg.textContent = `✅ 已更新 Pad ${padNum} 圖示為 ${el.value}`;
        }
      });
    });

    // 更換音色
    this.padCardsGrid.querySelectorAll('.btn-pad-card-voice').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ch = parseInt((btn as HTMLElement).getAttribute('data-channel') || '0', 10);
        this.setFocusedChannel(ch);
        this.openVoicePickerForChannel(ch);
      });
    });

    // CM 與 RP 開關
    this.padCardsGrid.querySelectorAll('.chk-pad-card-cm').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        YamahaPadModifier.setPadChordMatch(this.currentParsed, padNum, el.checked);
        this.renderPadStudioDashboard();
      });
    });

    this.padCardsGrid.querySelectorAll('.chk-pad-card-rp').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        YamahaPadModifier.setPadRepeat(this.currentParsed, padNum, el.checked);
        this.renderPadStudioDashboard();
      });
    });

    // 獨奏與靜音
    this.padCardsGrid.querySelectorAll('.btn-pad-card-solo').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ch = parseInt((btn as HTMLElement).getAttribute('data-channel') || '0', 10);
        this.setFocusedChannel(ch);
        this.toggleSoloPlay(ch);
        this.renderPadStudioDashboard();
      });
    });

    this.padCardsGrid.querySelectorAll('.btn-pad-card-mute').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ch = parseInt((btn as HTMLElement).getAttribute('data-channel') || '0', 10);
        const muted = styPlaybackEngine.isChannelMuted(ch);
        styPlaybackEngine.setChannelMute(ch, !muted);
        if (this.focusedChannel === ch) {
          this.updateFocusedBanner();
        }
        this.renderPadStudioDashboard();
      });
    });

    // 音量 (CC7)、聲像 (CC10)、殘響 (CC91)、合唱 (CC93) 滑桿
    this.padCardsGrid.querySelectorAll('.slider-pad-card-vol').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        const ch = parseInt(el.getAttribute('data-channel') || '0', 10);
        const val = parseInt(el.value, 10);
        styPlaybackEngine.setChannelVolume(ch, val);
        YamahaPadModifier.setPadMixing(this.currentParsed, padNum, { volume: val });
        const lbl = el.parentElement?.querySelector('.label-pad-card-vol');
        if (lbl) lbl.textContent = String(val);
      });
    });

    this.padCardsGrid.querySelectorAll('.slider-pad-card-pan').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        const ch = parseInt(el.getAttribute('data-channel') || '0', 10);
        const val = parseInt(el.value, 10);
        styPlaybackEngine.setChannelPan(ch, val);
        YamahaPadModifier.setPadMixing(this.currentParsed, padNum, { pan: val });
        const lbl = el.parentElement?.querySelector('.label-pad-card-pan');
        if (lbl) lbl.textContent = formatYamahaPan(val);
      });
    });

    this.padCardsGrid.querySelectorAll('.slider-pad-card-rev').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        const ch = parseInt(el.getAttribute('data-channel') || '0', 10);
        const val = parseInt(el.value, 10);
        styPlaybackEngine.setChannelReverb(ch, val);
        YamahaPadModifier.setPadMixing(this.currentParsed, padNum, { reverb: val });
        const lbl = el.parentElement?.querySelector('.label-pad-card-rev');
        if (lbl) lbl.textContent = String(val);
      });
    });

    this.padCardsGrid.querySelectorAll('.slider-pad-card-cho').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        if (!this.currentParsed) return;
        const el = e.target as HTMLInputElement;
        const padNum = parseInt(el.getAttribute('data-pad-num') || '1', 10);
        const ch = parseInt(el.getAttribute('data-channel') || '0', 10);
        const val = parseInt(el.value, 10);
        styPlaybackEngine.setChannelChorus(ch, val);
        YamahaPadModifier.setPadMixing(this.currentParsed, padNum, { chorus: val });
        const lbl = el.parentElement?.querySelector('.label-pad-card-cho');
        if (lbl) lbl.textContent = String(val);
      });
    });

    // 小節長度修改
    this.padCardsGrid.querySelectorAll('.btn-pad-card-apply-bars').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.currentParsed) return;
        const padNum = parseInt((btn as HTMLElement).getAttribute('data-pad-num') || '1', 10);
        const card = (btn as HTMLElement).closest('.pad-studio-card');
        const inp = card?.querySelector('.input-pad-card-bars') as HTMLInputElement | null;
        const newBars = Math.max(1, Math.min(64, parseInt(inp?.value || '4', 10) || 4));
        YamahaPadModifier.setPadBarLength(this.currentParsed, padNum, newBars);
        this.refreshPadStudioEngineAndSnapshots(`📏 已將 Pad ${padNum} 小節長度設為 ${newBars} 小節`);
      });
    });

    // 複製此 Pad 至其他 Pad
    this.padCardsGrid.querySelectorAll('.btn-pad-card-clone').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.currentParsed) return;
        const srcPadNum = parseInt((btn as HTMLElement).getAttribute('data-pad-num') || '1', 10);
        const card = (btn as HTMLElement).closest('.pad-studio-card');
        const sel = card?.querySelector('.select-pad-card-clone-target') as HTMLSelectElement | null;
        const dstPadNum = parseInt(sel?.value || '2', 10);
        const res = YamahaPadModifier.clonePadTrack(this.currentParsed, srcPadNum, dstPadNum);
        if (res.success) {
          const clonedNotes = YamahaPadModifier.extractTrackNotes(this.currentParsed.tracks[dstPadNum]);
          this.originalPadTrackNotes.set(
            dstPadNum,
            clonedNotes.map(n => ({
              ...n,
              note: Math.max(0, Math.min(127, n.note - this.currentPadTotalSemitoneShift)),
            }))
          );
          if (res.copiedNoteCount > 0) {
            this.selectedPadNumsForTranspose.add(dstPadNum);
          }
          this.refreshPadStudioEngineAndSnapshots(`📋 已將 Pad ${srcPadNum} (${res.copiedNoteCount} 顆音符與音色混音) 完整複製至 Pad ${dstPadNum}！`);
        }
      });
    });

    // 清空此 Pad 音符
    this.padCardsGrid.querySelectorAll('.btn-pad-card-clear').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.currentParsed) return;
        const padNum = parseInt((btn as HTMLElement).getAttribute('data-pad-num') || '1', 10);
        YamahaPadModifier.clearPadTrackNotes(this.currentParsed, padNum);
        this.originalPadTrackNotes.set(padNum, []);
        this.selectedPadNumsForTranspose.delete(padNum);
        this.refreshPadStudioEngineAndSnapshots(`🗑️ 已清空 Pad ${padNum} 的所有音符 (成為 0 音符空軌)`);
      });
    });
  }

  /**
   * 內部輔助：當 Pad 小節數、複製或清空軌道變更後，重新同步播放引擎與下方鋼琴捲軸
   */
  private refreshPadStudioEngineAndSnapshots(statusMessage: string) {
    if (!this.currentParsed || this.currentParsed.format !== 'PAD') return;
    const analysis = MidiSongAnalyzer.analyze(this.currentParsed, this.currentFileName);
    this.currentSongAnalysis = analysis;
    this.currentPadDiagnosis = YamahaPadModifier.analyzePadProject(this.currentParsed);

    styPlaybackEngine.loadParsed(this.currentParsed);
    styPlaybackEngine.loadSongMode(1, Math.max(1, analysis.totalBars));

    this.renderPadStudioDashboard();
    this.setFocusedChannel(this.focusedChannel);

    if (this.padStudioStatusMsg) {
      this.padStudioStatusMsg.textContent = statusMessage;
    }
  }

  /**
   * 匯出當前修改或調性平移後的 Multi Pad (.PAD) 檔案
   */
  private exportCurrentPadFile() {
    if (!this.currentParsed || this.currentParsed.format !== 'PAD') {
      alert('目前尚未載入 Multi Pad (.PAD) 檔案！');
      return;
    }

    try {
      // 匯出前防呆同步校驗：檢查當前 UI 下拉選單 (基準調、目標調、方向) 是否與已套用平移狀態一致
      if (this.selectPadSourceKey && this.selectPadTargetKey) {
        const srcKey = this.selectPadSourceKey.value || 'Am';
        const dstKey = this.selectPadTargetKey.value || 'Em';
        const dir = (this.selectPadShiftDir?.value as 'auto' | 'up' | 'down') || 'auto';

        const initDiag = this.initialPadDiagnosis || this.currentPadDiagnosis;
        const maxPitches = initDiag
          ? initDiag.tracks.filter(t => t.pitchMax !== null && t.musicalType !== 'DRUM_SFX').map(t => t.pitchMax!)
          : [84];
        const highestPitch = maxPitches.length > 0 ? Math.max(...maxPitches) : 84;
        const shiftInfo = YamahaPadModifier.calculateSemitoneShift(srcKey, dstKey, dir, highestPitch, 96);
        const expectedSuffix = this.inputPadKeySuffix?.value.trim() || dstKey;

        // 若使用者在介面上變更或指定了目標調 (且不同於基準調)，但尚未點擊套用，或位移狀態不符，在匯出前自動精準套用一次！
        const isShiftSynced = (this.currentPadTotalSemitoneShift === shiftInfo.semitones) &&
                              (this.lastTransposedKeySuffix === expectedSuffix);
        if (!isShiftSynced && (srcKey !== dstKey || this.currentPadTotalSemitoneShift !== 0)) {
          console.log(`[PAD Export] 偵測到 UI 設定 (${srcKey} ➔ ${dstKey}, 位移 ${shiftInfo.semitones}) 與當前套用狀態不一致，匯出前自動執行平移...`);
          this.applyPadTransposition();
        }
      }

      // 確保 Track 0 控制標籤與各軌 rawChunk 最新
      YamahaPadModifier.syncControlTagsToTrack0(this.currentParsed);
      for (const trk of this.currentParsed.tracks) {
        YamahaPadModifier.rebuildTrackRawChunk(trk);
      }

      const bytes = YamahaWriter.write(this.currentParsed);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const baseName = (this.currentFileName || 'MultiPad').replace(/\.pad$/i, '');
      const keyTag = this.lastTransposedKeySuffix || this.selectPadTargetKey?.value || this.selectPadSourceKey?.value || 'Edited';
      const downloadName = `${baseName}_${keyTag}.PAD`;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (this.padStudioStatusMsg) {
        this.padStudioStatusMsg.textContent = `🎉 已成功匯出下載：${downloadName} (${bytes.byteLength} bytes)`;
      }
    } catch (err: any) {
      console.error('匯出 PAD 失敗:', err);
      alert(`匯出 PAD 檔案失敗: ${err.message}`);
    }
  }
}

// 實例化
new PlayerApp();
