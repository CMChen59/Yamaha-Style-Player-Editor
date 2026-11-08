import { YamahaParser } from '../core/parser/yamaha-parser';
import { styPlaybackEngine, formatYamahaPan } from './sty-playback-engine';
import { midiManager } from '../core/audio/midi-manager';
import type { YamahaFileParsed } from '../core/models/types';
import { getSharedAudioContext } from '../creator/shared-audio-context';
import { SingleTrackEditor } from './single-track-editor';
import { YamahaWriter } from '../core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../core/writer/style-modifier';
import type { PlaybackNoteEvent, PlaybackCCEvent } from './sty-playback-engine';
import { VoicePickerModal } from './voice-picker-modal';
import { SectionCloneModal } from './section-clone-modal';
import { SectionImportModal } from './section-import-modal';
import { AddSectionModal, type AddSectionConfig } from './add-section-modal';
import { NewStyleModal, type NewStyleModalConfig } from './new-style-modal';
import { YamahaStyleSynthesizer } from '../core/writer/style-synthesizer';
import { ChordTransposer, POPULAR_AUDITION_CHORDS, CHORD_TYPE_INTERVALS, type ChordDefinition, type ChordType } from '../core/writer/chord-transposer';
import { findYamahaVoice, type YamahaVoice } from '../core/data/yamaha-voices';

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
  public currentFileName: string = '';
  public activeSectionName: string = '';
  private baseBpm: number = 120;
  private focusedChannel: number = 8; // 預設聚焦 Channel 8 (即面板 CH 9 Rhythm 1)
  private isFxVisible: boolean = true; // 混音盤空間效果器 (Reverb & Chorus) 展開狀態

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
  private midiDrawer!: HTMLElement;
  private selectMidiPort!: HTMLSelectElement;
  private selectMidiInPort!: HTMLSelectElement;
  private btnRefreshMidi!: HTMLButtonElement;
  private btnTestPiano!: HTMLButtonElement;
  private outputCurrentStatus!: HTMLElement;
  private btnExportSty!: HTMLButtonElement;
  private voicePicker!: VoicePickerModal;
  private sectionCloneModal!: SectionCloneModal;
  private btnOpenSectionClone!: HTMLButtonElement;
  private sectionImportModal!: SectionImportModal;
  private btnOpenSectionImport!: HTMLButtonElement;
  private addSectionModal!: AddSectionModal;
  private btnOpenAddSection!: HTMLButtonElement;
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
    this.midiDrawer = document.getElementById('midi-drawer')!;
    this.selectMidiPort = document.getElementById('select-midi-port') as HTMLSelectElement;
    this.selectMidiInPort = document.getElementById('select-midi-in-port') as HTMLSelectElement;
    this.btnRefreshMidi = document.getElementById('btn-refresh-midi') as HTMLButtonElement;
    this.btnTestPiano = document.getElementById('btn-test-piano') as HTMLButtonElement;
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

    this.selectMidiPort.addEventListener('change', () => {
      if (this.selectMidiPort.value) {
        midiManager.selectOutput(this.selectMidiPort.value);
        const name = midiManager.getSelectedOutput()?.name || 'MIDI';
        this.midiStatusPill.textContent = `🟢 已連線: ${name}`;
        this.outputCurrentStatus.textContent = `🎹 當前輸出：實體電子琴 (${name})`;
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

    this.btnTestPiano.addEventListener('click', () => {
      midiManager.playTestChime(0);
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
  }

  private async setOutputMode(mode: 'webaudio' | 'midi') {
    if (mode === 'webaudio') {
      this.btnOutputWebAudio.classList.add('active');
      this.btnOutputMidi.classList.remove('active');
      this.midiDrawer.style.display = 'none';
      this.outputCurrentStatus.textContent = '🔊 當前輸出：電腦喇叭 / 耳機 (Web Audio)';
      styPlaybackEngine.setOutputMode('webaudio');
    } else {
      this.btnOutputMidi.classList.add('active');
      this.btnOutputWebAudio.classList.remove('active');
      this.midiDrawer.style.display = 'flex';
      await this.refreshMidiPorts();
      const selected = midiManager.getSelectedOutput();
      const name = selected?.name || 'PSR-SX920';
      this.outputCurrentStatus.textContent = `🎹 當前輸出：實體電子琴 (${name})`;
      styPlaybackEngine.setOutputMode('midi');
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
        opt.textContent = p.name + (p.isRecommended ? ' (推薦 Yamaha 設備)' : '');
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
      const parsed = YamahaParser.parse(bytes, 'STY');
      this.currentParsed = parsed;
      this.currentFileName = name;
      this.baseBpm = parsed.bpm || 120;

      styPlaybackEngine.loadParsed(parsed);
      this.syncMixerVolumes();
      this.trackEditor?.clearHistory();

      // 更新速度
      this.sliderBpm.value = this.baseBpm.toString();
      this.labelBpmValue.textContent = this.baseBpm.toString();

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
      console.error('解析 STY 伴奏檔失敗:', err);
      alert(`解析伴奏檔失敗: ${err.message}`);
      this.labelStyleTitle.textContent = `解析失敗: ${err.message}`;
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

    // 更新各聲部的真實解析音色名稱
    const voices = styPlaybackEngine.getPartVoices();
    YAMAHA_PARTS.forEach((part) => {
      const voiceEl = document.getElementById(`part-voice-${part.channel}`);
      const info = voices.get(part.channel);
      if (voiceEl && info) {
        voiceEl.textContent = `${info.voiceName} ✏️`;
        voiceEl.title = `${info.voiceName} (Category: ${info.category}, MSB: ${info.msb}, LSB: ${info.lsb}, PC: ${info.pc + 1}) - 點擊更換音色`;
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

    // 更新所有卡片聚焦高亮外框
    YAMAHA_PARTS.forEach((p) => {
      const card = document.getElementById(`card-ch-${p.channel}`);
      if (card) {
        card.classList.toggle('is-focused', p.channel === channel);
      }
    });

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
    const part = YAMAHA_PARTS.find(p => p.channel === this.focusedChannel) || YAMAHA_PARTS[0];
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
    const part = YAMAHA_PARTS.find(p => p.channel === this.focusedChannel) || YAMAHA_PARTS[0];
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
      this.focusedTrackTitle.innerHTML = `CH ${part.channel + 1} - ${part.label} <span class="banner-status-badge active">✅ 已啟用</span>`;
      this.focusedTrackVoice.textContent = voiceInfo?.voiceName || part.defaultName;
      this.focusedTrackMeta.textContent = `本段音符數: ${noteCount} 個 ｜ MIDI 通道: CH ${part.channel + 1} ｜ 類型: ${voiceInfo?.category || 'General'}`;
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
    YAMAHA_PARTS.forEach(p => {
      const btn = document.getElementById(`btn-solo-${p.channel}`);
      btn?.classList.toggle('soloed', currentSolo === p.channel);
    });
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
      const voiceDisplayHtml = isActive
        ? `<div id="part-voice-${part.channel}" class="part-voice clickable-voice" title="點擊開啟 Yamaha 原廠音色庫更換音色">${voiceInfo?.voiceName || part.defaultName} ✏️</div>`
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
    }

    this.trackEditor?.updateSoloPlayState(isPlaying && currentSolo !== null, currentSolo);

    this.updateFocusedBanner();
  }

  private async initMidi() {
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
   * 將單軌編輯器當前的音符即時同步回記憶體中的 STY 結構 (parsed)
   */
  private syncEditorEventsToParsed(channel: number, events: PlaybackNoteEvent[]) {
    if (!this.currentParsed) return;
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
    this.currentFileName = `${config.styleName}.sty`;
    this.baseBpm = config.bpm;
    this.sliderBpm.value = config.bpm.toString();
    this.labelBpmValue.textContent = config.bpm.toString();

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
        return findYamahaVoice(104, 1, 0) || findYamahaVoice(0, 112, 0) || {
          id: 'cfx_grand', name: 'CFX Concert Grand', chineseName: 'CFX 音樂會旗艦三角鋼琴', category: 'Piano', msb: 104, lsb: 1, pc: 0, icon: 'S801'
        };
      case 12: // Chord 2
        return findYamahaVoice(104, 1, 4) || findYamahaVoice(0, 112, 4) || {
          id: 'suitcase_ep', name: 'Suitcase Clean EP', chineseName: '經典電鋼琴 (Suitcase)', category: 'E.Piano', msb: 104, lsb: 1, pc: 4, icon: 'S801'
        };
      case 13: // Pad
        return findYamahaVoice(8, 33, 49) || findYamahaVoice(0, 112, 48) || {
          id: 'live_strings', name: 'Live! Strings', chineseName: '動態現場弦樂團', category: 'Strings', msb: 8, lsb: 33, pc: 49, icon: 'S809'
        };
      case 14: // Phrase 1
        return findYamahaVoice(104, 2, 64) || findYamahaVoice(0, 112, 64) || {
          id: 'sweet_sax', name: 'Sweet! Soprano Sax', chineseName: '高音薩克斯風 (Sweet!)', category: 'Saxophone', msb: 104, lsb: 2, pc: 64, icon: 'S809'
        };
      case 15: // Phrase 2
        return findYamahaVoice(8, 35, 49) || findYamahaVoice(0, 112, 73) || {
          id: 'studio_strings', name: 'Studio Strings', chineseName: '錄音室精緻弦樂', category: 'Strings', msb: 8, lsb: 35, pc: 49, icon: 'S809'
        };
      default:
        return findYamahaVoice(104, 1, 0) || {
          id: 'piano', name: 'Piano', chineseName: '鋼琴', category: 'Piano', msb: 0, lsb: 112, pc: 0, icon: 'S801'
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
    const part = YAMAHA_PARTS.find(p => p.channel === channel) || YAMAHA_PARTS[0];
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
    // 若該聲部尚未啟用，自動走一鍵啟用流程 (自動建立 CASM 轉調規則與控制器快照)
    if (!this.isChannelActive(channel)) {
      this.activateChannel(channel, voice);
      return;
    }

    // 1. 更新播放引擎 (軟體合成器 or 實體 MIDI)
    styPlaybackEngine.setChannelVoice(channel, voice);

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
      voiceEl.textContent = `${name} ✏️`;
      voiceEl.title = `${voice.name} (MSB: ${voice.msb}, LSB: ${voice.lsb}, PC: ${voice.pc + 1}) - 點擊更換音色`;
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
      alert('尚未載入任何 STY 伴奏檔案，請先拖曳或選擇伴奏檔案！');
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
}

// 實例化
new PlayerApp();
