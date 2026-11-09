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

export interface MidiTxLogEntry {
  id: number;
  timestamp: number;
  type: 'noteOn' | 'noteOff' | 'cc' | 'pc' | 'pitchBend' | 'sysex';
  channel: number; // 0~15 (SysEx 為 -1)
  summary: string;
  hexBytes: string;
  connected: boolean;
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
  sysexEnabled?: boolean;
  onstatechange: ((event: any) => void) | null;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function formatMidiNoteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[n % 12]}${octave}`;
}

function toHexString(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export class MidiManager {
  private midiAccess: WebMidiAccess | null = null;
  private selectedOutput: WebMidiPort | null = null;
  private selectedInput: WebMidiPort | null = null;
  private routingMode: AudioRoutingMode = 'audio';
  private hasSysexSupport: boolean = false;
  private stateChangeListeners: Array<(devices: MidiDeviceInfo[]) => void> = [];
  private noteInputListeners: Array<(type: 'noteon' | 'noteoff', pitch: number, velocity: number, channel: number) => void> = [];
  private voiceInputListeners: Array<(config: VoiceBankConfig, channel: number) => void> = [];
  private midiActivityListeners: Array<() => void> = [];
  private txListeners: Array<(entry: MidiTxLogEntry) => void> = [];
  private txLog: MidiTxLogEntry[] = [];
  private txNextId: number = 1;
  private maxTxLogSize: number = 80;
  private currentBankMsb: number = 0;
  private currentBankLsb: number = 0;
  private isRequesting = false;
  private activeNotes: Set<string> = new Set(); // 格式: `${channel}:${note}`
  private pendingNoteOffTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private maxScheduledTimestamp: number = 0;

  /**
   * 檢查瀏覽器是否支援 Web MIDI API
   */
  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as any).requestMIDIAccess === 'function';
  }

  /**
   * 是否具備 SysEx 系統專屬訊息傳送權限 (GM / XG System On)
   */
  public hasSysex(): boolean {
    return this.hasSysexSupport;
  }

  /**
   * 取得目前所有發聲中 (尚未到達 Note-Off 時間) 的音符集合 (`${channel}:${note}`)
   */
  public getActiveNotes(): Set<string> {
    return new Set(this.activeNotes);
  }

  /**
   * 注入或清除虛擬/測試 MIDI 輸出埠 (供單元測試或無琴環境離線驗證使用)
   */
  public setMockOutputPort(port: WebMidiPort | null): void {
    this.selectedOutput = port;
    if (port) {
      this.wakeUpAllChannels();
    }
  }

  /**
   * 註冊即時 MIDI 輸出訊號監聽器 (供 UI 監控面板與診斷工具使用)
   */
  public onTxActivity(callback: (entry: MidiTxLogEntry) => void): () => void {
    this.txListeners.push(callback);
    return () => {
      this.txListeners = this.txListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * 取得最近傳送的 MIDI 封包紀錄
   */
  public getRecentTxLog(limit: number = 30): MidiTxLogEntry[] {
    return this.txLog.slice(-limit);
  }

  /**
   * 清空 MIDI 輸出監控紀錄
   */
  public clearTxLog(): void {
    this.txLog = [];
  }

  private recordTx(
    type: MidiTxLogEntry['type'],
    channel: number,
    summary: string,
    bytes: number[] | Uint8Array,
    timestamp?: number
  ): void {
    const entry: MidiTxLogEntry = {
      id: this.txNextId++,
      timestamp: timestamp ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      type,
      channel,
      summary,
      hexBytes: toHexString(bytes),
      connected: this.selectedOutput !== null,
    };
    this.txLog.push(entry);
    if (this.txLog.length > this.maxTxLogSize) {
      this.txLog.splice(0, this.txLog.length - this.maxTxLogSize);
    }
    this.triggerMidiActivity();
    for (const cb of this.txListeners) {
      try {
        cb(entry);
      } catch (err) {
        console.error('[MidiManager] Error in txListener:', err);
      }
    }
  }

  /**
   * 請求 Web MIDI API 存取權限並掃描可用輸出裝置
   * 優先請求 { sysex: true } 以支援 Yamaha XG / GM System On 喚醒，若被拒則自動降級為 { sysex: false }
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
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: true });
        this.hasSysexSupport = Boolean(this.midiAccess?.sysexEnabled ?? true);
      } catch {
        // 若瀏覽器或使用者拒絕 SysEx 權限，平滑退回標準免 SysEx 模式
        this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
        this.hasSysexSupport = false;
      }

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
    if (timestamp !== undefined && timestamp > this.maxScheduledTimestamp) {
      this.maxScheduledTimestamp = timestamp;
    }
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
    const ch = Math.max(0, Math.min(15, channel));
    const msb = Math.max(0, Math.min(127, Math.round(config.msb)));
    const lsb = Math.max(0, Math.min(127, Math.round(config.lsb)));
    const pc = Math.max(0, Math.min(127, Math.round(config.pc)));

    this.send([0xB0 | ch, 0, msb]);   // CC 0: Bank Select MSB
    this.send([0xB0 | ch, 32, lsb]);  // CC 32: Bank Select LSB
    const ok = this.send([0xC0 | ch, pc]); // Program Change
    this.recordTx(
      'pc',
      ch,
      `Ch${ch + 1} 音色切換 [${msb}-${lsb}-${pc + 1}] (MSB:${msb} LSB:${lsb} PC:${pc})`,
      [0xB0 | ch, 0, msb, 0xB0 | ch, 32, lsb, 0xC0 | ch, pc]
    );
    if (initControllers) {
      this.sendControlChange(ch, 7, 115);   // CC 7: Channel Volume (115 飽滿音量)
      this.sendControlChange(ch, 11, 127);  // CC 11: Expression (127 最大表情)
      this.sendControlChange(ch, 10, 64);   // CC 10: Pan (置中)
    }
    return ok;
  }

  /**
   * 喚醒並初始化 PSR-SX920 所有 16 個通道的音量、表情與控制器
   * 防止因琴端預設通道音量為 0 或控制器被切斷而無聲
   */
  public wakeUpAllChannels(): void {
    // 若具備 SysEx 權限則傳送 GM / XG System On SysEx 喚醒
    if (this.hasSysexSupport) {
      try {
        const gmOn = [0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7];
        const xgOn = [0xF0, 0x43, 0x10, 0x4C, 0x00, 0x00, 0x7E, 0x00, 0xF7];
        this.send(gmOn);
        this.send(xgOn);
        this.recordTx('sysex', -1, 'GM / Yamaha XG System On 喚醒指令', xgOn);
      } catch {
        // 忽略無 sysex 權限情況
      }
    }

    for (let ch = 0; ch < 16; ch++) {
      this.send([0xB0 | ch, 121, 0]);  // Reset All Controllers
      this.send([0xB0 | ch, 7, 115]);   // CC 7: Volume = 115
      this.send([0xB0 | ch, 11, 127]);  // CC 11: Expression = 127
      this.send([0xB0 | ch, 10, 64]);   // CC 10: Pan = 64
      this.send([0xB0 | ch, 64, 0]);    // CC 64: Sustain Off
      this.send([0xE0 | ch, 0x00, 0x40]); // Pitch Bend Center (8192)
    }
  }

  /**
   * 傳送混音控制器參數 (Volume CC7, Pan CC10, Reverb CC91, Chorus CC93)
   */
  public sendMixerControllers(
    channel: number,
    params: { volume?: number; pan?: number; reverb?: number; chorus?: number }
  ): boolean {
    const ch = Math.max(0, Math.min(15, channel));

    if (params.volume !== undefined) {
      this.sendControlChange(ch, 7, params.volume);
    }
    if (params.pan !== undefined) {
      this.sendControlChange(ch, 10, params.pan);
    }
    if (params.reverb !== undefined) {
      this.sendControlChange(ch, 91, params.reverb);
    }
    if (params.chorus !== undefined) {
      this.sendControlChange(ch, 93, params.chorus);
    }
    return this.selectedOutput !== null;
  }

  /**
   * 傳送 Note-On 事件
   */
  public sendNoteOn(channel: number, note: number, velocity: number = 100, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const n = Math.max(0, Math.min(127, Math.round(note)));
    const v = Math.max(1, Math.min(127, Math.round(velocity)));
    const key = `${ch}:${n}`;

    // 若同一音高先前有待清理的 NoteOff 計時器，先取消以避免提前將新音符自 activeNotes 移除
    const existingTimer = this.pendingNoteOffTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingNoteOffTimers.delete(key);
    }

    this.activeNotes.add(key);
    const bytes = [0x90 | ch, n, v];
    const ok = this.send(bytes, timestamp);
    this.recordTx('noteOn', ch, `Ch${ch + 1} NoteOn ${formatMidiNoteName(n)} (${n}) Vel:${v}`, bytes, timestamp);
    return ok;
  }

  /**
   * 傳送 Note-Off 事件 (若含未來排程 timestamp，自動保留 activeNotes 追蹤直到實際發聲結束，確保中途 Panic 可 100% 攔截)
   */
  public sendNoteOff(channel: number, note: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const n = Math.max(0, Math.min(127, Math.round(note)));
    const key = `${ch}:${n}`;
    const bytes = [0x80 | ch, n, 0];

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delayMs = timestamp !== undefined ? timestamp - now : 0;

    if (delayMs > 4) {
      const prevTimer = this.pendingNoteOffTimers.get(key);
      if (prevTimer) clearTimeout(prevTimer);
      const timer = setTimeout(() => {
        this.activeNotes.delete(key);
        this.pendingNoteOffTimers.delete(key);
      }, delayMs);
      this.pendingNoteOffTimers.set(key, timer);
    } else {
      const prevTimer = this.pendingNoteOffTimers.get(key);
      if (prevTimer) {
        clearTimeout(prevTimer);
        this.pendingNoteOffTimers.delete(key);
      }
      this.activeNotes.delete(key);
    }

    const ok = this.send(bytes, timestamp);
    this.recordTx('noteOff', ch, `Ch${ch + 1} NoteOff ${formatMidiNoteName(n)} (${n})`, bytes, timestamp);
    return ok;
  }

  /**
   * 傳送連續控制器事件 (CC 11 Expression, CC 1 Modulation, CC 64 Sustain 等)
   */
  public sendControlChange(channel: number, controller: number, value: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const cc = Math.max(0, Math.min(127, Math.round(controller)));
    const val = Math.max(0, Math.min(127, Math.round(value)));
    const bytes = [0xB0 | ch, cc, val];
    const ok = this.send(bytes, timestamp);

    const ccNames: Record<number, string> = {
      1: 'Mod',
      7: 'Vol',
      10: 'Pan',
      11: 'Expr',
      64: 'Sustain',
      91: 'Reverb',
      93: 'Chorus',
      120: 'AllSoundOff',
      121: 'ResetCtrl',
      123: 'AllNotesOff',
    };
    const label = ccNames[cc] ? `CC#${cc}(${ccNames[cc]})` : `CC#${cc}`;
    this.recordTx('cc', ch, `Ch${ch + 1} ${label} = ${val}`, bytes, timestamp);
    return ok;
  }

  /**
   * 傳送滑音輪事件 (Pitch Bend: 0 ~ 16383, 8192 為正中無偏音)
   */
  public sendPitchBend(channel: number, value: number, timestamp?: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const val = Math.max(0, Math.min(16383, Math.round(value)));
    const lsb = val & 0x7F;
    const msb = (val >> 7) & 0x7F;
    const bytes = [0xE0 | ch, lsb, msb];
    const ok = this.send(bytes, timestamp);
    const diff = val - 8192;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    this.recordTx('pitchBend', ch, `Ch${ch + 1} PitchBend ${val} (${diffStr})`, bytes, timestamp);
    return ok;
  }

  /**
   * 立即消音單一指定通道 (用於播放中途切換靜音 Mute / 獨奏 Solo 或切換 CASM 來源音軌時防止殘留長音)
   */
  public silenceChannel(channel: number): boolean {
    const ch = Math.max(0, Math.min(15, channel));
    const prefix = `${ch}:`;
    for (const [key, timer] of this.pendingNoteOffTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.pendingNoteOffTimers.delete(key);
      }
    }
    for (const key of Array.from(this.activeNotes)) {
      if (key.startsWith(prefix)) {
        const [, nStr] = key.split(':');
        this.send([0x80 | ch, Number(nStr), 0]);
        this.activeNotes.delete(key);
      }
    }

    this.send([0xB0 | ch, 64, 0]);  // Sustain Off
    this.send([0xB0 | ch, 123, 0]); // All Notes Off
    this.send([0xE0 | ch, 0x00, 0x40]); // Pitch Bend Center (8192)

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.maxScheduledTimestamp > now) {
      const flushTime = this.maxScheduledTimestamp + 1;
      this.send([0xB0 | ch, 64, 0], flushTime);
      this.send([0xB0 | ch, 123, 0], flushTime);
    }
    this.recordTx('cc', ch, `Ch${ch + 1} 通道消音 (AllNotesOff)`, [0xB0 | ch, 123, 0]);
    return this.selectedOutput !== null;
  }

  /**
   * 防掛音安全緊急中斷：對全部 16 個通道廣播 All Sound Off, All Notes Off, Damper Off 與 PitchBend 歸零
   * 並同時清理預排視窗 (Lookahead Queue) 內的所有未到時音符，確保 0 掛音
   */
  public panicAllChannels(): boolean {
    // 0. 清除所有等待中的 NoteOff 計時器
    for (const timer of this.pendingNoteOffTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingNoteOffTimers.clear();

    // 1. 先對所有主動追蹤中正在發聲或已排程的音符逐一發送實體 Note-Off
    const snapshotNotes = Array.from(this.activeNotes);
    for (const key of snapshotNotes) {
      const [ch, n] = key.split(':').map(Number);
      this.send([0x80 | ch, n, 0]);
    }
    this.activeNotes.clear();

    // 2. 對全部 16 個通道廣播 All Sound Off (CC120), All Notes Off (CC123), Damper Off (CC64), PitchBend Center (8192)
    for (let ch = 0; ch < 16; ch++) {
      this.send([0xB0 | ch, 120, 0]); // CC 120: All Sound Off (立即切斷發聲)
      this.send([0xB0 | ch, 123, 0]); // CC 123: All Notes Off
      this.send([0xB0 | ch, 64, 0]);  // CC 64: Damper / Sustain Pedal Off
      this.send([0xE0 | ch, 0x00, 0x40]); // Pitch Bend 歸中 (8192)
    }

    // 3. 若瀏覽器硬體佇列中尚有未來 150ms Lookahead 視窗內的 timestamped NoteOn，
    //    在最後一個已排程時間點 +1ms 處追加排入 All Notes Off 與 NoteOff，徹底杜絕預排音符殘留掛音！
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.maxScheduledTimestamp > now) {
      const flushTime = this.maxScheduledTimestamp + 1;
      for (const key of snapshotNotes) {
        const [ch, n] = key.split(':').map(Number);
        this.send([0x80 | ch, n, 0], flushTime);
      }
      for (let ch = 0; ch < 16; ch++) {
        this.send([0xB0 | ch, 120, 0], flushTime);
        this.send([0xB0 | ch, 123, 0], flushTime);
        this.send([0xB0 | ch, 64, 0], flushTime);
      }
      this.maxScheduledTimestamp = 0;
    }

    this.recordTx('cc', 0, '全通道緊急消音 (16Ch Panic All Sound/Notes Off)', [0xB0, 120, 0]);
    return this.selectedOutput !== null;
  }

  /**
   * 測試 1: 鍵盤主音色發聲測試 (Channel 1 鋼琴琶音)
   * 無論 PSR-SX920 處於何種 MIDI 模式（即使是最嚴苛的 Keyboard / Right 1 模式）皆必響
   */
  public playTestChime(channel: number = 0): void {
    const ch = Math.max(0, Math.min(15, channel));

    // 先切換至 PSR-SX920 官方旗艦 CFX Concert Grand (MSB 104, LSB 21, PC 0, 面板 104-21-1)
    this.sendVoiceChange(ch, { msb: 104, lsb: 21, pc: 0 });
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
    const ch = Math.max(0, Math.min(15, channel));

    // 切換至 PSR-SX920 官方旗艦 CFX Concert Grand (MSB 104, LSB 21, PC 0, 面板 104-21-1)
    this.sendVoiceChange(ch, { msb: 104, lsb: 21, pc: 0 });
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
