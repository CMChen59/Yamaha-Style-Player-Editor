/**
 * Yamaha PSR-SX920 Web MIDI Manager
 * 負責瀏覽器 Web MIDI API 存取、實體琴埠口偵測、熱插拔監聽、音色與控制器指令傳送及發聲路由控制
 */

export type AudioRoutingMode = 'audio' | 'midi' | 'both';

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  isRecommended: boolean;
}

export interface VoiceBankConfig {
  msb: number; // CC 0
  lsb: number; // CC 32
  pc: number;  // Program Change (0~127)
}

export interface WebMidiPort {
  id: string;
  name?: string;
  manufacturer?: string;
  type: string;
  state: string;
  connection: string;
  send: (data: number[] | Uint8Array, timestamp?: number) => void;
  open?: () => Promise<WebMidiPort>;
  close?: () => Promise<WebMidiPort>;
}

export interface WebMidiAccess {
  inputs: Map<string, WebMidiPort>;
  outputs: Map<string, WebMidiPort>;
  onstatechange: ((event: any) => void) | null;
}

export class MidiManager {
  private midiAccess: WebMidiAccess | null = null;
  private selectedOutput: WebMidiPort | null = null;
  private selectedInput: WebMidiPort | null = null;
  private routingMode: AudioRoutingMode = 'audio';
  private stateChangeListeners: Array<(devices: MidiDeviceInfo[]) => void> = [];
  private noteInputListeners: Array<(type: 'noteon' | 'noteoff', pitch: number, velocity: number, channel: number) => void> = [];
  private voiceInputListeners: Array<(config: VoiceBankConfig, channel: number) => void> = [];
  private midiActivityListeners: Array<() => void> = [];
  private currentBankMsb: number = 0;
  private currentBankLsb: number = 0;
  private isRequesting = false;
  private activeNotes: Set<string> = new Set(); // 格式: `${channel}:${note}`

  /**
   * 檢查瀏覽器是否支援 Web MIDI API
   */
  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as any).requestMIDIAccess === 'function';
  }

  /**
   * 請求 Web MIDI API 存取權限並掃描可用輸出裝置
   */
  public async requestAccess(): Promise<{ success: boolean; error?: string; devices: MidiDeviceInfo[] }> {
    if (!this.isSupported()) {
      return { success: false, error: '當前瀏覽器環境不支援 Web MIDI API (建議使用 Google Chrome 或 Microsoft Edge)', devices: [] };
    }

    if (this.isRequesting) {
      return { success: false, error: '正在請求 MIDI 存取權限中...', devices: this.getAvailableOutputs() };
    }

    this.isRequesting = true;
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });

      // 綁定熱插拔事件監聽器 (Hot-plugging detection)
      if (this.midiAccess) {
        this.midiAccess.onstatechange = (event: any) => {
          this.handleStateChange(event);
        };
      }

      const devices = this.getAvailableOutputs();

      // 如果尚未選定設備，自動推薦選取 Yamaha / Digital Workstation 設備
      if (!this.selectedOutput) {
        const recommended = devices.find(d => d.isRecommended && d.state === 'connected');
        if (recommended) {
          this.selectOutput(recommended.id);
        } else if (devices.length > 0) {
          this.selectOutput(devices[0].id);
        }
      }

      // 掃描並自動推薦選取 Yamaha 輸入設備
      const inDevices = this.getAvailableInputs();
      if (!this.selectedInput) {
        const recommendedIn = inDevices.find(d => d.isRecommended && d.state === 'connected');
        if (recommendedIn) {
          this.selectInput(recommendedIn.id);
        } else if (inDevices.length > 0) {
          this.selectInput(inDevices[0].id);
        }
      }

      return { success: true, devices };
    } catch (err: any) {
      return { success: false, error: err?.message || '使用者拒絕了 MIDI 設備存取授權', devices: [] };
    } finally {
      this.isRequesting = false;
    }
  }

  /**
   * 取得所有已連線之 MIDI 輸出裝置清單
   */
  public getAvailableOutputs(): MidiDeviceInfo[] {
    if (!this.midiAccess) return [];

    const result: MidiDeviceInfo[] = [];
    for (const port of this.midiAccess.outputs.values()) {
      const name = port.name || 'MIDI Output';
      const mfr = port.manufacturer || '';
      const isRecommended = /digital workstation|yamaha|sx920|psr|workstation/i.test(name) || /yamaha/i.test(mfr);

      result.push({
        id: port.id,
        name,
        manufacturer: mfr,
        state: (port.state as 'connected' | 'disconnected') || 'connected',
        isRecommended,
      });
    }

    // 優先推薦的置頂
    return result.sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
  }

  /**
   * 依據 ID 或名稱選取當前使用的 MIDI 輸出裝置
   */
  public selectOutput(idOrName: string | null): boolean {
    if (!idOrName) {
      this.selectedOutput = null;
      return true;
    }

    if (!this.midiAccess) return false;

    for (const port of this.midiAccess.outputs.values()) {
      if (port.id === idOrName || port.name === idOrName) {
        this.selectedOutput = port;
        if (port.open && typeof port.open === 'function') {
          port.open().catch((err: any) => console.warn('[MidiManager] Failed to open port:', err));
        }
        this.wakeUpAllChannels();
        return true;
      }
    }

    this.selectedOutput = null;
    return false;
  }

  /**
   * 取得當前選取的 MIDI 輸出裝置資訊
   */
  public getSelectedOutput(): MidiDeviceInfo | null {
    if (!this.selectedOutput) return null;
    const name = this.selectedOutput.name || 'MIDI Output';
    const mfr = this.selectedOutput.manufacturer || '';
    return {
      id: this.selectedOutput.id,
      name,
      manufacturer: mfr,
      state: (this.selectedOutput.state as 'connected' | 'disconnected') || 'connected',
      isRecommended: /digital workstation|yamaha|sx920|psr/i.test(name) || /yamaha/i.test(mfr),
    };
  }

  /**
   * 取得所有已連線之 MIDI 輸入裝置清單
   */
  public getAvailableInputs(): MidiDeviceInfo[] {
    if (!this.midiAccess) return [];

    const result: MidiDeviceInfo[] = [];
    for (const port of this.midiAccess.inputs.values()) {
      const name = port.name || 'MIDI Input';
      const mfr = port.manufacturer || '';
      const isRecommended = /digital workstation|yamaha|sx920|psr|workstation/i.test(name) || /yamaha/i.test(mfr);

      result.push({
        id: port.id,
        name,
        manufacturer: mfr,
        state: (port.state as 'connected' | 'disconnected') || 'connected',
        isRecommended,
      });
    }

    return result.sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));
  }

  /**
   * 依據 ID 或名稱選取當前使用的 MIDI 輸入裝置並綁定訊息監聽
   */
  public selectInput(idOrName: string | null): boolean {
    if (!idOrName) {
      if (this.selectedInput) {
        (this.selectedInput as any).onmidimessage = null;
      }
      this.selectedInput = null;
      return true;
    }

    if (!this.midiAccess) return false;

    for (const port of this.midiAccess.inputs.values()) {
      if (port.id === idOrName || port.name === idOrName) {
        if (this.selectedInput && this.selectedInput !== port) {
          (this.selectedInput as any).onmidimessage = null;
        }
        this.selectedInput = port;
        (this.selectedInput as any).onmidimessage = (event: any) => this.handleIncomingMidiMessage(event);
        return true;
      }
    }

    this.selectedInput = null;
    return false;
  }

  /**
   * 取得當前選取的 MIDI 輸入裝置資訊
   */
  public getSelectedInput(): MidiDeviceInfo | null {
    if (!this.selectedInput) return null;
    const name = this.selectedInput.name || 'MIDI Input';
    const mfr = this.selectedInput.manufacturer || '';
    return {
      id: this.selectedInput.id,
      name,
      manufacturer: mfr,
      state: (this.selectedInput.state as 'connected' | 'disconnected') || 'connected',
      isRecommended: /digital workstation|yamaha|sx920|psr/i.test(name) || /yamaha/i.test(mfr),
    };
  }

  /**
   * 處理實體鍵盤傳入的原生 MIDI 訊息 (Note-On, Note-Off, CC0/32 Bank Select, Program Change)
   */
  private handleIncomingMidiMessage(event: any): void {
    const data = event?.data;
    if (!data || data.length === 0) return;

    this.triggerMidiActivity();

    const status = data[0];
    const ch = status & 0x0F;
    const msgType = status & 0xF0;

    if (msgType === 0x90) {
      const pitch = data[1];
      const velocity = data[2] ?? 0;
      if (velocity === 0) {
        this.triggerNoteInput('noteoff', pitch, 0, ch);
      } else {
        this.triggerNoteInput('noteon', pitch, velocity, ch);
      }
    } else if (msgType === 0x80) {
      const pitch = data[1];
      this.triggerNoteInput('noteoff', pitch, 0, ch);
    } else if (msgType === 0xB0) {
      const ccNum = data[1];
      const ccVal = data[2];
      if (ccNum === 0) {
        this.currentBankMsb = ccVal;
      } else if (ccNum === 32) {
        this.currentBankLsb = ccVal;
      }
    } else if (msgType === 0xC0) {
      const pc = data[1];
      const config: VoiceBankConfig = {
        msb: this.currentBankMsb,
        lsb: this.currentBankLsb,
        pc,
      };
      for (const cb of this.voiceInputListeners) {
        try { cb(config, ch); } catch (err) { console.error(err); }
      }
    }
  }

  private triggerMidiActivity(): void {
    for (const cb of this.midiActivityListeners) {
      try { cb(); } catch (err) { console.error(err); }
    }
  }

  private triggerNoteInput(type: 'noteon' | 'noteoff', pitch: number, velocity: number, ch: number) {
    for (const cb of this.noteInputListeners) {
      try { cb(type, pitch, velocity, ch); } catch (err) { console.error(err); }
    }
  }

  /**
   * 模擬 Note-On 事件 (適用於無琴測試、電腦鍵盤敲擊、觸控點擊)
   */
  public simulateNoteOn(pitch: number, velocity: number = 100, channel: number = 0): void {
    this.triggerMidiActivity();
    this.triggerNoteInput('noteon', pitch, velocity, channel);
  }

  /**
   * 模擬 Note-Off 事件
   */
  public simulateNoteOff(pitch: number, channel: number = 0): void {
    this.triggerNoteInput('noteoff', pitch, 0, channel);
  }

  /**
   * 模擬音色嗅探變更 (Voice Sniffer)
   */
  public simulateVoiceChange(config: VoiceBankConfig, channel: number = 0): void {
    this.triggerMidiActivity();
    for (const cb of this.voiceInputListeners) {
      try { cb(config, channel); } catch (err) { console.error(err); }
    }
  }

  /**
   * 註冊琴端 Note 輸入事件監聽器
   */
  public onNoteInput(callback: (type: 'noteon' | 'noteoff', pitch: number, velocity: number, channel: number) => void): () => void {
    this.noteInputListeners.push(callback);
    return () => {
      this.noteInputListeners = this.noteInputListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * 註冊琴端音色變更嗅探監聽器
   */
  public onVoiceInput(callback: (config: VoiceBankConfig, channel: number) => void): () => void {
    this.voiceInputListeners.push(callback);
    return () => {
      this.voiceInputListeners = this.voiceInputListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * 註冊 MIDI 傳輸活動 (Activity LED) 監聽器
   */
  public onMidiActivity(callback: () => void): () => void {
    this.midiActivityListeners.push(callback);
    return () => {
      this.midiActivityListeners = this.midiActivityListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * 設定發聲路由模式 ('audio' | 'midi' | 'both')
   */
  public setRoutingMode(mode: AudioRoutingMode) {
    this.routingMode = mode;
  }

  public getRoutingMode(): AudioRoutingMode {
    return this.routingMode;
  }

  public isAudioActive(): boolean {
    return this.routingMode === 'audio' || this.routingMode === 'both';
  }

  public isMidiActive(): boolean {
    return (this.routingMode === 'midi' || this.routingMode === 'both') && this.selectedOutput !== null;
  }

  /**
   * 傳送原生 MIDI 位元組陣列
   */
  public send(bytes: number[] | Uint8Array, timestamp?: number): boolean {
    if (!this.selectedOutput) return false;
    try {
      if (timestamp !== undefined) {
        this.selectedOutput.send(bytes, timestamp);
      } else {
        this.selectedOutput.send(bytes);
      }
      return true;
    } catch (err) {
      console.warn('[MidiManager] Failed to send MIDI message:', err);
      return false;
    }
  }

  /**
   * 傳送 Yamaha 原廠音色切換指令 (Bank Select MSB + LSB + Program Change)
   * 可選傳入 initControllers=true 同步預設充沛音量 (CC7=115) 與表情 (CC11=127)
   */
  public sendVoiceChange(channel: number, config: VoiceBankConfig, initControllers: boolean = false): boolean {
    if (!this.selectedOutput) return false;
    const ch = Math.max(0, Math.min(15, channel));
    const msb = Math.max(0, Math.min(127, Math.round(config.msb)));
    const lsb = Math.max(0, Math.min(127, Math.round(config.lsb)));
    const pc = Math.max(0, Math.min(127, Math.round(config.pc)));

    this.send([0xB0 | ch, 0, msb]);   // CC 0: Bank Select MSB
    this.send([0xB0 | ch, 32, lsb]);  // CC 32: Bank Select LSB
    this.send([0xC0 | ch, pc]);       // Program Change
    if (initControllers) {
      this.send([0xB0 | ch, 7, 115]);   // CC 7: Channel Volume (115 飽滿音量)
      this.send([0xB0 | ch, 11, 127]);  // CC 11: Expression (127 最大表情)
      this.send([0xB0 | ch, 10, 64]);   // CC 10: Pan (置中)
    }
    return true;
  }

  /**
   * 喚醒並初始化 PSR-SX920 所有 16 個通道的音量、表情與控制器
   * 防止因琴端預設通道音量為 0 或控制器被切斷而無聲
   */
  public wakeUpAllChannels(): void {
    if (!this.selectedOutput) return;

    // 嘗試傳送 GM / XG System On SysEx (若支援)
    try {
      this.send([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]); // GM System On
      this.send([0xF0, 0x43, 0x10, 0x4C, 0x00, 0x00, 0x7E, 0x00, 0xF7]); // XG System On
    } catch {
      // 忽略無 sysex 權限情況
    }

    for (let ch = 0; ch < 16; ch++) {
      this.send([0xB0 | ch, 121, 0]);  // Reset All Controllers
      this.send([0xB0 | ch, 7, 115]);   // CC 7: Volume = 115
      this.send([0xB0 | ch, 11, 127]);  // CC 11: Expression = 127
      this.send([0xB0 | ch, 10, 64]);   // CC 10: Pan = 64
      this.send([0xB0 | ch, 64, 0]);    // CC 64: Sustain Off
    }
  }

  /**
   * 傳送混音控制器參數 (Volume CC7, Pan CC10, Reverb CC91, Chorus CC93)
   */
  public sendMixerControllers(
    channel: number,
    params: { volume?: number; pan?: number; reverb?: number; chorus?: number }
  ): boolean {
    if (!this.selectedOutput) return false;
    const ch = Math.max(0, Math.min(15, channel));

    if (params.volume !== undefined) {
      const vol = Math.max(0, Math.min(127, Math.round(params.volume)));
      this.send([0xB0 | ch, 7, vol]); // CC 7: Channel Volume
    }
    if (params.pan !== undefined) {
      const pan = Math.max(0, Math.min(127, Math.round(params.pan)));
      this.send([0xB0 | ch, 10, pan]); // CC 10: Pan
    }
    if (params.reverb !== undefined) {
      const rev = Math.max(0, Math.min(127, Math.round(params.reverb)));
      this.send([0xB0 | ch, 91, rev]); // CC 91: Reverb Send Level
    }
    if (params.chorus !== undefined) {
      const cho = Math.max(0, Math.min(127, Math.round(params.chorus)));
      this.send([0xB0 | ch, 93, cho]); // CC 93: Chorus Send Level
    }
    return true;
  }

  /**
   * 傳送 Note-On 事件
   */
  public sendNoteOn(channel: number, note: number, velocity: number = 100, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const n = Math.max(0, Math.min(127, Math.round(note)));
    const v = Math.max(1, Math.min(127, Math.round(velocity)));
    this.activeNotes.add(`${ch}:${n}`);
    return this.send([0x90 | ch, n, v], timestamp);
  }

  /**
   * 傳送 Note-Off 事件
   */
  public sendNoteOff(channel: number, note: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const n = Math.max(0, Math.min(127, Math.round(note)));
    this.activeNotes.delete(`${ch}:${n}`);
    return this.send([0x80 | ch, n, 0], timestamp);
  }

  /**
   * 傳送連續控制器事件 (CC 11 Expression, CC 1 Modulation, CC 64 Sustain 等)
   */
  public sendControlChange(channel: number, controller: number, value: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const cc = Math.max(0, Math.min(127, Math.round(controller)));
    const val = Math.max(0, Math.min(127, Math.round(value)));
    return this.send([0xB0 | ch, cc, val], timestamp);
  }

  /**
   * 傳送滑音輪事件 (Pitch Bend: 0 ~ 16383, 8192 為正中無偏音)
   */
  public sendPitchBend(channel: number, value: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const val = Math.max(0, Math.min(16383, Math.round(value)));
    const lsb = val & 0x7F;
    const msb = (val >> 7) & 0x7F;
    return this.send([0xE0 | ch, lsb, msb], timestamp);
  }

  /**
   * 防掛音安全緊急中斷：對全部 16 個通道廣播 All Sound Off, All Notes Off 與 Damper Off
   */
  public panicAllChannels(): boolean {
    if (!this.selectedOutput) return false;

    // 1. 先對所有主動追蹤中正在發聲的音符逐一發送實體 Note-Off，確保硬體琴音符立刻熄滅
    for (const key of this.activeNotes) {
      const [ch, n] = key.split(':').map(Number);
      this.send([0x80 | ch, n, 0]);
    }
    this.activeNotes.clear();

    // 2. 對全部 16 個通道廣播 All Sound Off (CC120), All Notes Off (CC123), Damper Off (CC64)
    for (let ch = 0; ch < 16; ch++) {
      this.send([0xB0 | ch, 120, 0]); // CC 120: All Sound Off (立即切斷發聲)
      this.send([0xB0 | ch, 123, 0]); // CC 123: All Notes Off
      this.send([0xB0 | ch, 64, 0]);  // CC 64: Damper / Sustain Pedal Off
    }
    return true;
  }

  /**
   * 測試 1: 鍵盤主音色發聲測試 (Channel 1 鋼琴琶音)
   * 無論 PSR-SX920 處於何種 MIDI 模式（即使是最嚴苛的 Keyboard / Right 1 模式）皆必響
   */
  public playTestChime(channel: number = 0): void {
    if (!this.selectedOutput) return;
    const ch = Math.max(0, Math.min(15, channel));

    // 先切換至 Concert Grand (MSB 0, LSB 112, PC 0)
    this.sendVoiceChange(ch, { msb: 0, lsb: 112, pc: 0 });
    this.sendMixerControllers(ch, { volume: 115, pan: 64 });

    const notes = [60, 64, 67, 72]; // C4, E4, G4, C5
    notes.forEach((pitch, i) => {
      setTimeout(() => {
        this.sendNoteOn(ch, pitch, 110);
        setTimeout(() => {
          this.sendNoteOff(ch, pitch);
        }, 280);
      }, i * 140);
    });
  }

  /**
   * 測試 2: 伴奏鼓組發聲測試 (Channel 10 Standard Kit 1)
   */
  public playTestDrums(channel: number = 9): void {
    if (!this.selectedOutput) return;
    const ch = Math.max(0, Math.min(15, channel));

    // 切換至 Standard Kit 1 (Bank 127-0, PC 0)
    this.sendVoiceChange(ch, { msb: 127, lsb: 0, pc: 0 });
    this.sendMixerControllers(ch, { volume: 115, pan: 64 });

    // 大鼓(36) -> 閉鈸(42) -> 小鼓(38) -> 碎音鈸(49)
    const seq = [
      { note: 36, delay: 0 },
      { note: 42, delay: 150 },
      { note: 38, delay: 300 },
      { note: 42, delay: 450 },
      { note: 49, delay: 600 },
    ];

    seq.forEach(item => {
      setTimeout(() => {
        this.sendNoteOn(ch, item.note, 110);
        setTimeout(() => {
          this.sendNoteOff(ch, item.note);
        }, 120);
      }, item.delay);
    });
  }

  /**
   * 測試 3: 伴奏貝斯發聲測試 (Channel 11 Finger Bass)
   */
  public playTestBass(channel: number = 10): void {
    if (!this.selectedOutput) return;
    const ch = Math.max(0, Math.min(15, channel));

    // 切換至 Finger Bass (Bank 104-2, PC 33)
    this.sendVoiceChange(ch, { msb: 104, lsb: 2, pc: 33 });
    this.sendMixerControllers(ch, { volume: 115, pan: 64 });

    const notes = [36, 43, 41, 38]; // C1, G1, F1, D1
    notes.forEach((pitch, i) => {
      setTimeout(() => {
        this.sendNoteOn(ch, pitch, 110);
        setTimeout(() => {
          this.sendNoteOff(ch, pitch);
        }, 220);
      }, i * 180);
    });
  }

  /**
   * 測試 4: 伴奏和弦發聲測試 (Channel 12 Concert Grand)
   */
  public playTestChord(channel: number = 11): void {
    if (!this.selectedOutput) return;
    const ch = Math.max(0, Math.min(15, channel));

    this.sendVoiceChange(ch, { msb: 0, lsb: 112, pc: 0 });
    this.sendMixerControllers(ch, { volume: 115, pan: 64 });

    const chord = [60, 64, 67]; // C4, E4, G4
    chord.forEach(pitch => this.sendNoteOn(ch, pitch, 105));
    setTimeout(() => {
      chord.forEach(pitch => this.sendNoteOff(ch, pitch));
    }, 500);
  }

  /**
   * 註冊設備插拔狀態變更回呼函式
   */
  public onDeviceChange(callback: (devices: MidiDeviceInfo[]) => void): () => void {
    this.stateChangeListeners.push(callback);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(cb => cb !== callback);
    };
  }

  private handleStateChange(event: any) {
    const devices = this.getAvailableOutputs();
    const inDevices = this.getAvailableInputs();

    // 如果目前選取的輸出設備斷線了
    if (this.selectedOutput && event?.port?.id === this.selectedOutput.id) {
      if (event.port.state === 'disconnected') {
        this.selectedOutput = null;
      }
    }

    // 若輸出斷線後又有推薦設備，自動重新連線
    if (!this.selectedOutput) {
      const rec = devices.find(d => d.isRecommended && d.state === 'connected');
      if (rec) this.selectOutput(rec.id);
    }

    // 如果目前選取的輸入設備斷線了
    if (this.selectedInput && event?.port?.id === this.selectedInput.id) {
      if (event.port.state === 'disconnected') {
        this.selectedInput = null;
      }
    }

    // 若輸入斷線後又有推薦設備，自動重新連線
    if (!this.selectedInput) {
      const recIn = inDevices.find(d => d.isRecommended && d.state === 'connected');
      if (recIn) this.selectInput(recIn.id);
    }

    // 觸發所有註冊的監聽器
    for (const listener of this.stateChangeListeners) {
      try {
        listener(devices);
      } catch (err) {
        console.error('[MidiManager] Error in state change listener:', err);
      }
    }
  }
}

export const midiManager = new MidiManager();
