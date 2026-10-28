import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MidiManager, WebMidiAccess, WebMidiPort } from '../src/core/audio/midi-manager';

describe('Phase 2.2-F: Web MIDI 實體琴硬體直連與發聲 (MidiManager Verification)', () => {
  let midiManager: MidiManager;
  let mockOutputs: Map<string, WebMidiPort>;
  let mockAccess: WebMidiAccess;
  let sentMessages: Array<{ portId: string; data: number[] | Uint8Array; timestamp?: number }>;

  beforeEach(() => {
    midiManager = new MidiManager();
    sentMessages = [];
    mockOutputs = new Map();

    // 模擬 PSR-SX920 原廠輸出埠
    const yamahaPort: WebMidiPort = {
      id: 'port-sx920',
      name: 'Digital Workstation 1',
      manufacturer: 'Yamaha',
      type: 'output',
      state: 'connected',
      connection: 'open',
      send: (data: number[] | Uint8Array, timestamp?: number) => {
        sentMessages.push({ portId: 'port-sx920', data, timestamp });
      },
    };

    // 模擬另一個通用 MIDI 埠
    const genericPort: WebMidiPort = {
      id: 'port-generic',
      name: 'Generic USB MIDI',
      manufacturer: 'Generic',
      type: 'output',
      state: 'connected',
      connection: 'open',
      send: (data: number[] | Uint8Array, timestamp?: number) => {
        sentMessages.push({ portId: 'port-generic', data, timestamp });
      },
    };

    mockOutputs.set('port-sx920', yamahaPort);
    mockOutputs.set('port-generic', genericPort);

    const mockInputs = new Map<string, WebMidiPort>();
    const yamahaInPort: WebMidiPort = {
      id: 'port-in-sx920',
      name: 'Digital Workstation 1',
      manufacturer: 'Yamaha',
      type: 'input',
      state: 'connected',
      connection: 'open',
      send: () => {},
    };
    mockInputs.set('port-in-sx920', yamahaInPort);

    mockAccess = {
      inputs: mockInputs,
      outputs: mockOutputs,
      onstatechange: null,
    };

    // 模擬瀏覽器全域 navigator.requestMIDIAccess
    Object.defineProperty(globalThis.navigator, 'requestMIDIAccess', {
      value: vi.fn().mockResolvedValue(mockAccess),
      configurable: true,
      writable: true,
    });
  });

  it('能成功請求 Web MIDI 存取權限並自動識別 Yamaha 原廠推薦設備', async () => {
    const res = await midiManager.requestAccess();
    expect(res.success).toBe(true);
    expect(res.devices.length).toBe(2);

    // 驗證 Yamaha Digital Workstation 優先推薦置頂
    expect(res.devices[0].name).toBe('Digital Workstation 1');
    expect(res.devices[0].isRecommended).toBe(true);

    // 驗證自動選取了推薦設備
    const selected = midiManager.getSelectedOutput();
    expect(selected).not.toBeNull();
    expect(selected?.id).toBe('port-sx920');
  });

  it('能正確組裝並傳送 Yamaha 原廠音色切換指令 (Bank MSB + LSB + Program Change)', async () => {
    await midiManager.requestAccess();
    sentMessages = [];

    // 傳送 Channel 1 (ch=0) 切換至 Concert Grand (MSB 0, LSB 112, PC 0)
    const success = midiManager.sendVoiceChange(0, { msb: 0, lsb: 112, pc: 0 });
    expect(success).toBe(true);

    // 驗證發送了 3 筆 MIDI 指令
    expect(sentMessages.length).toBe(3);
    expect(sentMessages[0].data).toEqual([0xB0, 0, 0]);   // CC 0 (MSB) = 0
    expect(sentMessages[1].data).toEqual([0xB0, 32, 112]); // CC 32 (LSB) = 112
    expect(sentMessages[2].data).toEqual([0xC0, 0]);      // PC = 0
  });

  it('能正確組裝並傳送混音控制器參數 (Volume CC7, Pan CC10, Reverb CC91, Chorus CC93)', async () => {
    await midiManager.requestAccess();
    sentMessages = [];

    // 傳送 Channel 2 (ch=1) 的音量 105、聲相 80、混響 50、合唱 64
    const success = midiManager.sendMixerControllers(1, { volume: 105, pan: 80, reverb: 50, chorus: 64 });
    expect(success).toBe(true);

    expect(sentMessages.length).toBe(4);
    expect(sentMessages[0].data).toEqual([0xB1, 7, 105]);  // CC 7 = 105
    expect(sentMessages[1].data).toEqual([0xB1, 10, 80]);   // CC 10 = 80
    expect(sentMessages[2].data).toEqual([0xB1, 91, 50]);  // CC 91 = 50
    expect(sentMessages[3].data).toEqual([0xB1, 93, 64]);  // CC 93 = 64
  });

  it('能正確傳送 Note-On 與 Note-Off 音符事件', async () => {
    await midiManager.requestAccess();
    sentMessages = [];

    // 傳送 Channel 1 中央 C (Note 60, Velocity 95)
    midiManager.sendNoteOn(0, 60, 95);
    midiManager.sendNoteOff(0, 60);

    expect(sentMessages.length).toBe(2);
    expect(sentMessages[0].data).toEqual([0x90, 60, 95]); // Note-On
    expect(sentMessages[1].data).toEqual([0x80, 60, 0]);  // Note-Off
  });

  it('在緊急停止或切換時能對全部 16 個通道廣播 All Sound Off 與 All Notes Off 防掛音', async () => {
    await midiManager.requestAccess();
    sentMessages = [];

    const success = midiManager.panicAllChannels();
    expect(success).toBe(true);

    // 16 個通道各 3 筆指令 (All Sound Off, All Notes Off, Damper Off) = 48 筆
    expect(sentMessages.length).toBe(48);

    // 抽驗 Channel 1 (0xB0) 與 Channel 10 (0xB9)
    const ch0Msgs = sentMessages.filter(m => (m.data as number[])[0] === 0xB0);
    expect(ch0Msgs.some(m => (m.data as number[])[1] === 120)).toBe(true); // All Sound Off
    expect(ch0Msgs.some(m => (m.data as number[])[1] === 123)).toBe(true); // All Notes Off
    expect(ch0Msgs.some(m => (m.data as number[])[1] === 64)).toBe(true);  // Damper Off

    const ch9Msgs = sentMessages.filter(m => (m.data as number[])[0] === 0xB9);
    expect(ch9Msgs.some(m => (m.data as number[])[1] === 123)).toBe(true);
  });

  it('當有音符正在發聲時，panicAllChannels 會優先對該音符發送實體 Note-Off 再廣播斷音信號', async () => {
    await midiManager.requestAccess();
    sentMessages = [];

    // 觸發 Channel 1 的兩個音符
    midiManager.sendNoteOn(0, 60, 100);
    midiManager.sendNoteOn(0, 64, 100);
    expect(sentMessages.length).toBe(2);

    sentMessages = [];
    midiManager.panicAllChannels();

    // 應該先有 2 筆 Note-Off (0x80)，再加上 48 筆 CC 控制訊息 = 50 筆
    expect(sentMessages.length).toBe(50);
    expect(sentMessages[0].data).toEqual([0x80, 60, 0]);
    expect(sentMessages[1].data).toEqual([0x80, 64, 0]);
  });

  it('能正確切換音訊路由模式 (AudioRoutingMode)', async () => {
    await midiManager.requestAccess();

    // 預設為 'audio'
    expect(midiManager.getRoutingMode()).toBe('audio');
    expect(midiManager.isAudioActive()).toBe(true);
    expect(midiManager.isMidiActive()).toBe(false);

    // 切換為 'both'
    midiManager.setRoutingMode('both');
    expect(midiManager.isAudioActive()).toBe(true);
    expect(midiManager.isMidiActive()).toBe(true);

    // 切換為 'midi' (純琴端)
    midiManager.setRoutingMode('midi');
    expect(midiManager.isAudioActive()).toBe(false);
    expect(midiManager.isMidiActive()).toBe(true);
  });

  it('支援熱插拔事件監聽 (onDeviceChange)', async () => {
    await midiManager.requestAccess();
    let changeTriggered = false;

    const unsubscribe = midiManager.onDeviceChange((devices) => {
      changeTriggered = true;
      expect(devices).toBeDefined();
    });

    // 觸發模擬插拔事件
    if (mockAccess.onstatechange) {
      mockAccess.onstatechange({ port: { id: 'port-sx920', state: 'connected' } });
    }

    expect(changeTriggered).toBe(true);
    unsubscribe();
  });

  it('能成功識別並自動綁定 Yamaha 原廠 MIDI 輸入裝置', async () => {
    const res = await midiManager.requestAccess();
    expect(res.success).toBe(true);

    const inputDevices = midiManager.getAvailableInputs();
    expect(inputDevices.length).toBe(1);
    expect(inputDevices[0].id).toBe('port-in-sx920');
    expect(inputDevices[0].isRecommended).toBe(true);

    const selectedInput = midiManager.getSelectedInput();
    expect(selectedInput).not.toBeNull();
    expect(selectedInput?.id).toBe('port-in-sx920');
  });

  it('能正確接收實體琴 Note-On 與 Note-Off 訊息 (包含 Velocity 0 視為 Off)', async () => {
    await midiManager.requestAccess();
    const receivedNotes: Array<{ type: string; pitch: number; velocity: number }> = [];

    const unsubscribe = midiManager.onNoteInput((type, pitch, velocity) => {
      receivedNotes.push({ type, pitch, velocity });
    });

    const inPort = mockAccess.inputs.get('port-in-sx920') as any;
    expect(inPort).toBeDefined();

    // 模擬實體琴彈下 C4 (Note-On, vel=95, ch=0)
    inPort.onmidimessage({ data: [0x90, 60, 95] });
    // 模擬實體琴彈下 E4 (Note-On, vel=80, ch=0)
    inPort.onmidimessage({ data: [0x90, 64, 80] });
    // 模擬實體琴放開 C4 (Note-Off, vel=0, ch=0)
    inPort.onmidimessage({ data: [0x80, 60, 0] });
    // 模擬實體琴以 Note-On vel=0 放開 E4 (Yamaha 常見標準行為)
    inPort.onmidimessage({ data: [0x90, 64, 0] });

    expect(receivedNotes.length).toBe(4);
    expect(receivedNotes[0]).toEqual({ type: 'noteon', pitch: 60, velocity: 95 });
    expect(receivedNotes[1]).toEqual({ type: 'noteon', pitch: 64, velocity: 80 });
    expect(receivedNotes[2]).toEqual({ type: 'noteoff', pitch: 60, velocity: 0 });
    expect(receivedNotes[3]).toEqual({ type: 'noteoff', pitch: 64, velocity: 0 });

    unsubscribe();
  });

  it('能精準嗅探琴端切換音色 (Voice Sniffer: CC0 + CC32 + Program Change)', async () => {
    await midiManager.requestAccess();
    const sniffedVoices: Array<{ msb: number; lsb: number; pc: number; channel: number }> = [];

    const unsubscribe = midiManager.onVoiceInput((config, channel) => {
      sniffedVoices.push({ ...config, channel });
    });

    const inPort = mockAccess.inputs.get('port-in-sx920') as any;

    // 模擬琴端選取 SeattleStrings (MSB 104, LSB 1, PC 48, Channel 0)
    inPort.onmidimessage({ data: [0xB0, 0, 104] });
    inPort.onmidimessage({ data: [0xB0, 32, 1] });
    inPort.onmidimessage({ data: [0xC0, 48] });

    expect(sniffedVoices.length).toBe(1);
    expect(sniffedVoices[0]).toEqual({
      msb: 104,
      lsb: 1,
      pc: 48,
      channel: 0,
    });

    unsubscribe();
  });

  it('支援無琴環境下的軟體/鍵盤模擬彈奏 (simulateNoteOn/Off, simulateVoiceChange)', () => {
    const receivedNotes: Array<{ type: string; pitch: number; velocity: number }> = [];
    let activityCount = 0;

    const unNote = midiManager.onNoteInput((type, pitch, velocity) => {
      receivedNotes.push({ type, pitch, velocity });
    });
    const unAct = midiManager.onMidiActivity(() => {
      activityCount++;
    });

    // 模擬電腦鍵盤敲擊 Note-On / Note-Off
    midiManager.simulateNoteOn(62, 100);
    midiManager.simulateNoteOff(62);

    expect(receivedNotes.length).toBe(2);
    expect(receivedNotes[0]).toEqual({ type: 'noteon', pitch: 62, velocity: 100 });
    expect(receivedNotes[1]).toEqual({ type: 'noteoff', pitch: 62, velocity: 0 });
    expect(activityCount).toBeGreaterThan(0);

    unNote();
    unAct();
  });
});
