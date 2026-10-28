/**
 * Yamaha PSR-SX920 專注創作台 (V2)
 * 視覺化伴奏混音台控制面板 (Mixer Panel)
 * 提供 DAW 等級直立式推桿通道條、立體聲聲相 (Pan) 旋鈕、Mute/Solo 開關、
 * 以及原廠黃金配比一鍵重設與 USB MIDI 即時連動功能。
 */

export interface MixerChannelInfo {
  id: string; // 'rhythm1' | 'drum' | 'bass' | 'chord' | 'Chord2' | 'Pad' | 'Phrase1' | 'Phrase2'
  name: string; // 'Rhythm 1' | 'Rhythm 2' | 'Bass' | 'Chord 1' ...
  subName: string; // '打擊樂' | '主鼓組' | '貝斯' | '和弦 1' ...
  chNumber: number; // 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
  midiChannel: number; // 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
  icon: string;
  color: string;
  voiceName: string;
  volume: number; // 0 ~ 127
  pan: number;    // 0 ~ 127 (64 = Center)
  reverb: number; // 0 ~ 127 (CC 91)
  chorus: number; // 0 ~ 127 (CC 93)
  muted: boolean;
  solo: boolean;
  hasNotesInCurrentSection?: boolean;
}

export interface MixerPanelCallbacks {
  onVolumeChange: (id: string, volume: number) => void;
  onPanChange: (id: string, pan: number) => void;
  onReverbChange: (id: string, reverb: number) => void;
  onChorusChange: (id: string, chorus: number) => void;
  onMuteToggle: (id: string, muted: boolean) => void;
  onSoloToggle: (id: string, solo: boolean) => void;
  onTrackPlayToggle?: (id: string) => void;
  onPlayAllToggle?: () => void;
  onResetDefaults: () => void;
  onPanic: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

export class MixerPanel {
  private container: HTMLElement;
  private callbacks: MixerPanelCallbacks;
  private channels: Map<string, MixerChannelInfo> = new Map();
  private isVisibleState: boolean = false;
  private vuDecayTimers: Map<string, any> = new Map();

  constructor(container: HTMLElement, callbacks: MixerPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  public setChannels(channelList: MixerChannelInfo[]) {
    this.channels.clear();
    channelList.forEach(ch => this.channels.set(ch.id, { ...ch }));
    this.render();
  }

  /**
   * 即時觸發單軌動態 LED VU 音量表跳動 (隨音符力度 Velocity 響應)
   * @param id 通道識別碼 (如 'rhythm1', 'drum', 'bass', 'chord', 'Chord2' 等)
   * @param velocity 音符力度 (1 ~ 127)
   */
  public triggerVuMeter(id: string, velocity: number) {
    const fillEl = this.container.querySelector<HTMLElement>(`[data-vu-fill="${id}"]`);
    const peakEl = this.container.querySelector<HTMLElement>(`[data-vu-peak="${id}"]`);
    if (!fillEl) return;

    // 將 MIDI 力度 1~127 映射為 12% ~ 100% 音量表高度
    const pct = Math.min(100, Math.max(12, Math.round((velocity / 127) * 100)));
    fillEl.style.height = `${pct}%`;
    if (peakEl) {
      peakEl.style.bottom = `${pct}%`;
    }

    // 清除該軌先前的衰減計時器
    const prevTimer = this.vuDecayTimers.get(id);
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    // 約 150ms 後平滑衰減回 0%
    const decayTimer = setTimeout(() => {
      if (fillEl) fillEl.style.height = '0%';
      if (peakEl) peakEl.style.bottom = '0%';
      this.vuDecayTimers.delete(id);
    }, 150);

    this.vuDecayTimers.set(id, decayTimer);
  }

  /**
   * 重設並平息所有軌道的 VU 音量表 (切換段落、暫停或防掛音時調用)
   */
  public clearAllVuMeters() {
    this.vuDecayTimers.forEach(t => clearTimeout(t));
    this.vuDecayTimers.clear();
    const fills = this.container.querySelectorAll<HTMLElement>('[data-vu-fill]');
    fills.forEach(f => { f.style.height = '0%'; });
    const peaks = this.container.querySelectorAll<HTMLElement>('[data-vu-peak]');
    peaks.forEach(p => { p.style.bottom = '0%'; });
  }

  /**
   * 動態切換段落音軌活動狀態 (亮燈 ACTIVE vs 熄滅 SILENT)
   * @param activityMap 各軌道在當前段落是否擁有音符 (hasNotes)
   */
  public updateSectionActivity(activityMap: Record<string, boolean>) {
    for (const [id, hasNotes] of Object.entries(activityMap)) {
      const ch = this.channels.get(id);
      if (ch) {
        ch.hasNotesInCurrentSection = hasNotes;
      }
      const strip = this.container.querySelector<HTMLElement>(`[data-strip-id="${id}"]`);
      const statusBadge = this.container.querySelector<HTMLElement>(`[data-status-badge="${id}"]`);
      if (strip) {
        if (hasNotes) {
          strip.classList.add('strip-active');
          strip.classList.remove('strip-silent');
        } else {
          strip.classList.add('strip-silent');
          strip.classList.remove('strip-active');
        }
      }
      if (statusBadge) {
        if (hasNotes) {
          statusBadge.textContent = '🟢 有音符';
          statusBadge.className = 'strip-status-badge strip-status-active';
        } else {
          statusBadge.textContent = '⚪ 空白';
          statusBadge.className = 'strip-status-badge strip-status-silent';
        }
      }
    }
  }

  public updateVoiceName(id: string, voiceName: string) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.voiceName = voiceName;
      const el = this.container.querySelector<HTMLElement>(`[data-voice-badge="${id}"]`);
      if (el) el.textContent = voiceName;
    }
  }

  public updateVolume(id: string, volume: number) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.volume = Math.max(0, Math.min(127, Math.round(volume)));
      const slider = this.container.querySelector<HTMLInputElement>(`[data-vol-slider="${id}"]`);
      if (slider) slider.value = String(ch.volume);
      const valEl = this.container.querySelector<HTMLElement>(`[data-vol-val="${id}"]`);
      if (valEl) valEl.textContent = String(ch.volume);
    }
  }

  public updatePan(id: string, pan: number) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.pan = Math.max(0, Math.min(127, Math.round(pan)));
      const slider = this.container.querySelector<HTMLInputElement>(`[data-pan-slider="${id}"]`);
      if (slider) slider.value = String(ch.pan);
      const valEl = this.container.querySelector<HTMLElement>(`[data-pan-val="${id}"]`);
      if (valEl) valEl.textContent = this.formatPan(ch.pan);
    }
  }

  public updateReverb(id: string, reverb: number) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.reverb = Math.max(0, Math.min(127, Math.round(reverb)));
      const slider = this.container.querySelector<HTMLInputElement>(`[data-rev-slider="${id}"]`);
      if (slider) slider.value = String(ch.reverb);
      const valEl = this.container.querySelector<HTMLElement>(`[data-rev-val="${id}"]`);
      if (valEl) valEl.textContent = String(ch.reverb);
    }
  }

  public updateChorus(id: string, chorus: number) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.chorus = Math.max(0, Math.min(127, Math.round(chorus)));
      const slider = this.container.querySelector<HTMLInputElement>(`[data-cho-slider="${id}"]`);
      if (slider) slider.value = String(ch.chorus);
      const valEl = this.container.querySelector<HTMLElement>(`[data-cho-val="${id}"]`);
      if (valEl) valEl.textContent = String(ch.chorus);
    }
  }

  public updateMuted(id: string, muted: boolean) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.muted = muted;
      const btn = this.container.querySelector<HTMLElement>(`[data-mute-btn="${id}"]`);
      if (btn) {
        if (muted) {
          btn.classList.add('mixer-btn-muted-active');
        } else {
          btn.classList.remove('mixer-btn-muted-active');
        }
      }
    }
  }

  public updateSolo(id: string, solo: boolean) {
    const ch = this.channels.get(id);
    if (ch) {
      ch.solo = solo;
      const btn = this.container.querySelector<HTMLElement>(`[data-solo-btn="${id}"]`);
      if (btn) {
        if (solo) {
          btn.classList.add('mixer-btn-solo-active');
        } else {
          btn.classList.remove('mixer-btn-solo-active');
        }
      }
    }
  }

  public setTrackPlaying(id: string, isPlaying: boolean) {
    const btn = this.container.querySelector<HTMLElement>(`[data-play-btn="${id}"]`);
    const icon = this.container.querySelector<HTMLElement>(`[data-play-icon="${id}"]`);
    const text = this.container.querySelector<HTMLElement>(`[data-play-text="${id}"]`);
    if (btn) {
      if (isPlaying) {
        btn.classList.add('mixer-btn-play-active');
        if (icon) icon.textContent = '⏸';
        if (text) text.textContent = '暫停';
      } else {
        btn.classList.remove('mixer-btn-play-active');
        if (icon) icon.textContent = '▶';
        if (text) text.textContent = '試聽';
      }
    }
  }

  public setPlayAllState(isPlaying: boolean) {
    const btn = this.container.querySelector<HTMLElement>('#btn-mixer-play-all');
    const icon = this.container.querySelector<HTMLElement>('#mixer-play-all-icon');
    const text = this.container.querySelector<HTMLElement>('#mixer-play-all-text');
    if (btn) {
      if (isPlaying) {
        btn.classList.add('mixer-btn-play-active');
        if (icon) icon.textContent = '⏸';
        if (text) text.textContent = '暫停全曲';
      } else {
        btn.classList.remove('mixer-btn-play-active');
        if (icon) icon.textContent = '▶';
        if (text) text.textContent = '播放全曲';
      }
    }
  }

  public toggle(forceVisible?: boolean) {
    this.isVisibleState = forceVisible !== undefined ? forceVisible : !this.isVisibleState;
    if (this.isVisibleState) {
      this.container.style.display = 'block';
    } else {
      this.container.style.display = 'none';
    }
    this.callbacks.onVisibilityChange?.(this.isVisibleState);
    return this.isVisibleState;
  }

  public isVisible(): boolean {
    return this.isVisibleState;
  }

  public formatPan(pan: number): string {
    if (pan === 64) return 'C';
    if (pan < 64) return `L${64 - pan}`;
    return `R${pan - 64}`;
  }

  public render() {
    this.container.innerHTML = '';

    // 外層卡片面板
    const wrapper = document.createElement('div');
    wrapper.className = 'mixer-panel-card';

    // 混音台標頭
    const header = document.createElement('div');
    header.className = 'mixer-header';
    header.innerHTML = `
      <div class="mixer-title-wrap">
        <span class="mixer-title-icon">🎛️</span>
        <div>
          <h3 class="mixer-title">Yamaha PSR-SX920 伴奏混音台 (Console Mixer)</h3>
          <p class="mixer-subtitle">即時調配各聲部音量推桿 (CC 7) 與立體聲聲相 (CC 10)，電腦試聽與實體琴同步連動，匯出即刻生效！</p>
        </div>
      </div>
      <div class="mixer-header-actions">
        <button id="btn-mixer-play-all" class="mixer-tool-btn mixer-tool-play-all" title="播放/暫停全曲伴奏 (點擊試聽整體混音配比)">
          <span id="mixer-play-all-icon">▶</span> <span id="mixer-play-all-text">播放全曲</span>
        </button>
        <button id="btn-mixer-reset-golden" class="mixer-tool-btn" title="將所有聲部重設為 Yamaha PSR-SX920 原廠推薦黃金配比 (鼓100/C, 貝95/C, 琴90/L12, 吉85/R12)">
          <span>✨</span> 原廠黃金配比
        </button>
        <button id="btn-mixer-panic" class="mixer-tool-btn mixer-tool-panic" title="防掛音中斷 (Panic)：立即切斷琴端與電腦所有發聲">
          <span>🔇</span> 全部中斷
        </button>
        <button id="btn-mixer-close" class="mixer-tool-btn" title="收合混音台">
          ✕
        </button>
      </div>
    `;
    wrapper.appendChild(header);

    // 通道條陳列區 (Strips container)
    const stripsContainer = document.createElement('div');
    stripsContainer.className = 'mixer-strips-container';

    this.channels.forEach((ch) => {
      const isStripActive = ch.hasNotesInCurrentSection !== false;
      const strip = document.createElement('div');
      strip.className = `mixer-channel-strip ${isStripActive ? 'strip-active' : 'strip-silent'}`;
      strip.setAttribute('data-strip-id', ch.id);
      strip.style.setProperty('--track-color', ch.color);

      strip.innerHTML = `
        <!-- 軌道身分標籤 -->
        <div class="strip-header" style="border-top: 3px solid ${ch.color};">
          <div class="strip-tags-row">
            <div class="strip-ch-tag" style="background: ${ch.color}25; color: ${ch.color}; border: 1px solid ${ch.color}50;">
              CH ${ch.chNumber}
            </div>
            <div class="strip-status-badge ${isStripActive ? 'strip-status-active' : 'strip-status-silent'}" data-status-badge="${ch.id}">
              ${isStripActive ? '🟢 有音符' : '⚪ 空白'}
            </div>
          </div>
          <div class="strip-name" title="${ch.name} (${ch.subName})">
            ${ch.icon} ${ch.name}
          </div>
          <div class="strip-voice-badge" data-voice-badge="${ch.id}" title="${ch.voiceName}">
            ${ch.voiceName}
          </div>
        </div>

        <!-- 試聽播放按鈕 (Audition Play) -->
        <div class="strip-audition-section">
          <button class="mixer-btn-play-track" data-play-btn="${ch.id}" title="試聽此聲部 (點擊單獨播放/暫停)">
            <span class="mixer-play-icon" data-play-icon="${ch.id}">▶</span>
            <span class="mixer-play-text" data-play-text="${ch.id}">試聽</span>
          </button>
        </div>

        <!-- 聲相 (Pan) 控制區 -->
        <div class="strip-pan-section">
          <div class="strip-pan-label">
            <span>PAN</span>
            <span class="strip-pan-val" data-pan-val="${ch.id}" title="點擊兩下重設回正中央 (C)">${this.formatPan(ch.pan)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="127"
            value="${ch.pan}"
            class="strip-pan-slider"
            data-pan-slider="${ch.id}"
            title="調整立體聲聲相 (0: 極左 L64, 64: 中央 C, 127: 極右 R63，雙擊重設)"
          />
        </div>

        <!-- 效果器發送量 (Reverb CC 91 / Chorus CC 93) -->
        <div class="strip-fx-section">
          <div class="strip-fx-row">
            <span class="strip-fx-tag strip-fx-tag-rev" title="空間殘響發送量 (CC 91: 0~127，模擬音樂廳空間景深)">REV</span>
            <input
              type="range"
              min="0"
              max="127"
              value="${ch.reverb}"
              class="strip-fx-slider strip-fx-slider-rev"
              data-rev-slider="${ch.id}"
              title="調整空間殘響 (Reverb CC 91: 0~127)"
            />
            <span class="strip-fx-val" data-rev-val="${ch.id}">${ch.reverb}</span>
          </div>
          <div class="strip-fx-row">
            <span class="strip-fx-tag strip-fx-tag-cho" title="合唱/合音發送量 (CC 93: 0~127，增加立體聲厚度與空氣感)">CHO</span>
            <input
              type="range"
              min="0"
              max="127"
              value="${ch.chorus}"
              class="strip-fx-slider strip-fx-slider-cho"
              data-cho-slider="${ch.id}"
              title="調整合唱效果 (Chorus CC 93: 0~127)"
            />
            <span class="strip-fx-val" data-cho-val="${ch.id}">${ch.chorus}</span>
          </div>
        </div>

        <!-- 音量 (Volume) 直立推桿區 與 動態 LED VU 音量表 -->
        <div class="strip-fader-section">
          <div class="strip-vol-meter-wrap">
            <!-- 刻度參考線 -->
            <div class="strip-scale">
              <span>127</span>
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
            <!-- 即時動態跳動 LED VU 音量表 -->
            <div class="strip-vu-meter-bar" data-vu-meter="${ch.id}" title="即時動態音量表 (隨播放音符真實力度跳動)">
              <div class="strip-vu-fill" data-vu-fill="${ch.id}"></div>
              <div class="strip-vu-peak" data-vu-peak="${ch.id}"></div>
            </div>
            <!-- 直立推桿 -->
            <input
              type="range"
              min="0"
              max="127"
              value="${ch.volume}"
              class="strip-fader-slider"
              data-vol-slider="${ch.id}"
              title="調整軌道主音量 (0 ~ 127)"
            />
          </div>
          <div class="strip-vol-val-wrap">
            <span class="strip-vol-val" data-vol-val="${ch.id}">${ch.volume}</span>
          </div>
        </div>

        <!-- 靜音 / 獨奏按鈕 (M / S) -->
        <div class="strip-buttons-section">
          <button class="mixer-btn-mute ${ch.muted ? 'mixer-btn-muted-active' : ''}" data-mute-btn="${ch.id}" title="靜音此軌 (Mute)">
            M
          </button>
          <button class="mixer-btn-solo ${ch.solo ? 'mixer-btn-solo-active' : ''}" data-solo-btn="${ch.id}" title="獨奏此軌 (Solo)">
            S
          </button>
        </div>
      `;

      // 綁定 Pan 互動
      const panSlider = strip.querySelector<HTMLInputElement>(`[data-pan-slider="${ch.id}"]`);
      const panValEl = strip.querySelector<HTMLElement>(`[data-pan-val="${ch.id}"]`);
      panSlider?.addEventListener('input', (e) => {
        const val = Number((e.target as HTMLInputElement).value);
        ch.pan = val;
        if (panValEl) panValEl.textContent = this.formatPan(val);
        this.callbacks.onPanChange(ch.id, val);
      });
      panValEl?.addEventListener('dblclick', () => {
        ch.pan = 64;
        if (panSlider) panSlider.value = '64';
        if (panValEl) panValEl.textContent = 'C';
        this.callbacks.onPanChange(ch.id, 64);
      });

      // 綁定 Reverb (CC 91) 互動
      const revSlider = strip.querySelector<HTMLInputElement>(`[data-rev-slider="${ch.id}"]`);
      const revValEl = strip.querySelector<HTMLElement>(`[data-rev-val="${ch.id}"]`);
      revSlider?.addEventListener('input', (e) => {
        const val = Number((e.target as HTMLInputElement).value);
        ch.reverb = val;
        if (revValEl) revValEl.textContent = String(val);
        this.callbacks.onReverbChange(ch.id, val);
      });

      // 綁定 Chorus (CC 93) 互動
      const choSlider = strip.querySelector<HTMLInputElement>(`[data-cho-slider="${ch.id}"]`);
      const choValEl = strip.querySelector<HTMLElement>(`[data-cho-val="${ch.id}"]`);
      choSlider?.addEventListener('input', (e) => {
        const val = Number((e.target as HTMLInputElement).value);
        ch.chorus = val;
        if (choValEl) choValEl.textContent = String(val);
        this.callbacks.onChorusChange(ch.id, val);
      });

      // 綁定 Volume Fader 互動
      const volSlider = strip.querySelector<HTMLInputElement>(`[data-vol-slider="${ch.id}"]`);
      const volValEl = strip.querySelector<HTMLElement>(`[data-vol-val="${ch.id}"]`);
      volSlider?.addEventListener('input', (e) => {
        const val = Number((e.target as HTMLInputElement).value);
        ch.volume = val;
        if (volValEl) volValEl.textContent = String(val);
        this.callbacks.onVolumeChange(ch.id, val);
      });

      // 綁定 Mute
      const muteBtn = strip.querySelector<HTMLElement>(`[data-mute-btn="${ch.id}"]`);
      muteBtn?.addEventListener('click', () => {
        ch.muted = !ch.muted;
        if (ch.muted) {
          muteBtn.classList.add('mixer-btn-muted-active');
        } else {
          muteBtn.classList.remove('mixer-btn-muted-active');
        }
        this.callbacks.onMuteToggle(ch.id, ch.muted);
      });

      // 綁定 Solo
      const soloBtn = strip.querySelector<HTMLElement>(`[data-solo-btn="${ch.id}"]`);
      soloBtn?.addEventListener('click', () => {
        ch.solo = !ch.solo;
        if (ch.solo) {
          soloBtn.classList.add('mixer-btn-solo-active');
        } else {
          soloBtn.classList.remove('mixer-btn-solo-active');
        }
        this.callbacks.onSoloToggle(ch.id, ch.solo);
      });

      // 綁定試聽播放 (Audition)
      const playBtn = strip.querySelector<HTMLElement>(`[data-play-btn="${ch.id}"]`);
      playBtn?.addEventListener('click', () => {
        this.callbacks.onTrackPlayToggle?.(ch.id);
      });

      stripsContainer.appendChild(strip);
    });

    wrapper.appendChild(stripsContainer);
    this.container.appendChild(wrapper);

    // 綁定頂部工具按鈕
    const btnPlayAll = wrapper.querySelector('#btn-mixer-play-all');
    btnPlayAll?.addEventListener('click', () => {
      this.callbacks.onPlayAllToggle?.();
    });

    const btnReset = wrapper.querySelector('#btn-mixer-reset-golden');
    btnReset?.addEventListener('click', () => {
      this.callbacks.onResetDefaults();
    });

    const btnPanic = wrapper.querySelector('#btn-mixer-panic');
    btnPanic?.addEventListener('click', () => {
      this.callbacks.onPanic();
    });

    const btnClose = wrapper.querySelector('#btn-mixer-close');
    btnClose?.addEventListener('click', () => {
      this.toggle(false);
    });
  }
}
