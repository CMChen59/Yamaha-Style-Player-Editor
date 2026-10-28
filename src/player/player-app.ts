import { YamahaParser } from '../core/parser/yamaha-parser';
import { styPlaybackEngine, formatYamahaPan } from './sty-playback-engine';
import { midiManager } from '../core/audio/midi-manager';
import type { YamahaFileParsed } from '../core/models/types';
import { getSharedAudioContext } from '../creator/shared-audio-context';
import { SingleTrackEditor } from './single-track-editor';
import { YamahaWriter } from '../core/writer/yamaha-writer';
import { YamahaStyleModifier } from '../core/writer/style-modifier';
import type { PlaybackNoteEvent } from './sty-playback-engine';

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

  // UI Elements
  private dropZone!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private sectionButtonsContainer!: HTMLElement;
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
  private btnRefreshMidi!: HTMLButtonElement;
  private btnTestPiano!: HTMLButtonElement;
  private outputCurrentStatus!: HTMLElement;
  private btnExportSty!: HTMLButtonElement;

  constructor() {
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  private init() {
    this.bindDomElements();
    this.setupEventListeners();
    this.setupEngineCallbacks();
    this.renderMixer();

    const editorEl = document.getElementById('single-track-editor')!;
    this.trackEditor = new SingleTrackEditor(editorEl);
    this.trackEditor.setOnEventsChanged((channel, events) => {
      this.updateFocusedBanner();
      this.syncEditorEventsToParsed(channel, events);
    });
    this.trackEditor.setOnRequestSwitchChannel((channel) => {
      this.setFocusedChannel(channel);
    });

    this.setFocusedChannel(8); // 預設聚焦 CH 9 Rhythm 1
    this.initMidi();

    // 自動嘗試載入 LoveSong 示範檔案
    this.loadSampleByUrl('/samples/LoveSong.T547.sty', 'LoveSong.T547.sty');
  }

  private bindDomElements() {
    this.dropZone = document.getElementById('drop-zone')!;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.sectionButtonsContainer = document.getElementById('section-buttons')!;
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
    this.btnRefreshMidi = document.getElementById('btn-refresh-midi') as HTMLButtonElement;
    this.btnTestPiano = document.getElementById('btn-test-piano') as HTMLButtonElement;
    this.outputCurrentStatus = document.getElementById('output-current-status')!;
  }

  private setupEventListeners() {
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
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }

      if (styPlaybackEngine.getIsPlaying() && styPlaybackEngine.getChannelSolo() === this.focusedChannel) {
        styPlaybackEngine.stop();
        this.updatePlayStateUI();
      } else {
        // 獨奏模式：鎖定當前聚焦聲部
        styPlaybackEngine.setChannelSolo(this.focusedChannel);
        this.syncMixerSoloButtons();
        styPlaybackEngine.play();
        this.updatePlayStateUI();
      }
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

    this.btnRefreshMidi.addEventListener('click', async () => {
      await this.refreshMidiPorts();
    });

    this.btnTestPiano.addEventListener('click', () => {
      midiManager.playTestChime(0);
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

    // 依 Yamaha Arranger 邏輯分組排序
    const orderPriority = [
      'intro a', 'intro b', 'intro c',
      'main a', 'main b', 'main c', 'main d',
      'fill in aa', 'fill in bb', 'fill in cc', 'fill in dd', 'break',
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

      const isMain = sec.name.toLowerCase().startsWith('main');
      const isIntro = sec.name.toLowerCase().startsWith('intro');
      const isEnding = sec.name.toLowerCase().startsWith('ending');

      let badgeClass = 'badge-other';
      if (isMain) badgeClass = 'badge-main';
      if (isIntro) badgeClass = 'badge-intro';
      if (isEnding) badgeClass = 'badge-ending';

      btn.innerHTML = `
        <span class="sec-badge ${badgeClass}">${sec.name}</span>
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
        voiceEl.textContent = info.voiceName;
        voiceEl.title = `${info.voiceName} (Category: ${info.category}, MSB: ${info.msb}, LSB: ${info.lsb}, PC: ${info.pc + 1})`;
      }
    });

    const totalBars = styPlaybackEngine.getTotalBars();
    this.labelPosition.textContent = `小節 01 / ${totalBars.toString().padStart(2, '0')} | 拍 1.0 | Tick 000000`;

    // 依段落同步混音台音量滑桿與數值
    this.syncMixerVolumes();

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

    this.trackEditor.loadTrack(
      this.focusedChannel,
      part.label,
      part.color,
      events,
      totalTicks,
      totalBars,
      division,
      timeSig,
      voiceInfo
    );
  }

  public updateFocusedBanner() {
    const part = YAMAHA_PARTS.find(p => p.channel === this.focusedChannel) || YAMAHA_PARTS[0];
    const voiceInfo = styPlaybackEngine.getPartVoices().get(part.channel);
    const noteCount = styPlaybackEngine.getChannelEvents(part.channel).length;

    this.focusedTrackBanner.style.setProperty('--part-accent', part.color);
    this.focusedTrackTitle.textContent = `CH ${part.channel + 1} - ${part.label}`;
    this.focusedTrackVoice.textContent = voiceInfo?.voiceName || part.defaultName;
    this.focusedTrackMeta.textContent = `本段音符數: ${noteCount} 個 ｜ MIDI 通道: CH ${part.channel + 1} ｜ 類型: ${voiceInfo?.category || 'General'}`;

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

  private renderMixer() {
    this.mixerContainer.innerHTML = '';
    YAMAHA_PARTS.forEach((part) => {
      const card = document.createElement('div');
      card.id = `card-ch-${part.channel}`;
      card.className = 'mixer-card';
      if (part.channel === this.focusedChannel) {
        card.classList.add('is-focused');
      }
      card.style.setProperty('--part-accent', part.color);

      card.innerHTML = `
        <div class="part-top-bar">
          <span class="channel-pill">CH ${part.channel + 1}</span>
          <span class="focus-badge">🎯 焦點</span>
          <div id="led-ch-${part.channel}" class="activity-led"></div>
        </div>
        <div class="part-title">${part.label}</div>
        <div id="part-voice-${part.channel}" class="part-voice">${part.defaultName}</div>
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
      `;

      // 點擊卡牌本體即可切換焦點聲部（最多只開一個）
      card.addEventListener('click', () => {
        this.setFocusedChannel(part.channel);
      });

      this.mixerContainer.appendChild(card);

      // 事件綁定
      const btnMute = card.querySelector(`#btn-mute-${part.channel}`) as HTMLButtonElement;
      const btnSolo = card.querySelector(`#btn-solo-${part.channel}`) as HTMLButtonElement;
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

      const sliderPan = card.querySelector(`#pan-${part.channel}`) as HTMLInputElement;
      const txtPan = card.querySelector(`#pan-txt-${part.channel}`);

      sliderPan.addEventListener('click', (e) => e.stopPropagation());
      sliderPan.addEventListener('input', (e) => {
        e.stopPropagation();
        const pan = parseInt(sliderPan.value, 10);
        styPlaybackEngine.setChannelPan(part.channel, pan);
        if (txtPan) txtPan.textContent = formatYamahaPan(pan);
      });

      // 雙擊滑桿或數值徽章一鍵置中 (Center: 64)
      const resetCenter = (e: Event) => {
        e.stopPropagation();
        sliderPan.value = '64';
        styPlaybackEngine.setChannelPan(part.channel, 64);
        if (txtPan) txtPan.textContent = 'C';
      };
      sliderPan.addEventListener('dblclick', resetCenter);
      txtPan?.addEventListener('dblclick', resetCenter);
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
    });
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

    this.updateFocusedBanner();
  }

  private async initMidi() {
    if (!midiManager.isSupported()) {
      this.midiStatusPill.textContent = '❌ 不支援 Web MIDI';
      return;
    }

    try {
      await midiManager.requestAccess();
      const selectedOut = midiManager.getSelectedOutput();
      if (selectedOut) {
        const name = selectedOut.name || 'MIDI Output';
        this.midiStatusPill.textContent = `🟢 已連線: ${name}`;
        this.midiStatusPill.classList.add('connected');
      } else {
        this.midiStatusPill.textContent = '⚪ 未偵測到 MIDI 輸出埠';
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
   * 匯出完整 STY 伴奏檔並觸發瀏覽器下載
   */
  private exportCurrentStyle() {
    if (!this.currentParsed) {
      alert('尚未載入任何 STY 伴奏檔案，請先拖曳或選擇伴奏檔案！');
      return;
    }

    try {
      // 1. 同步當前段落所有聲部的即時事件與混音音量
      const currentSec = styPlaybackEngine.getCurrentSection()?.name;
      if (currentSec) {
        for (let ch = 8; ch <= 15; ch++) {
          const events = styPlaybackEngine.getChannelEvents(ch);
          YamahaStyleModifier.replaceSectionChannelNotes(
            this.currentParsed,
            currentSec,
            ch,
            events
          );
          const vol = styPlaybackEngine.getChannelVolume(ch);
          YamahaStyleModifier.setPartMixing(this.currentParsed, ch, { volume: vol });
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
