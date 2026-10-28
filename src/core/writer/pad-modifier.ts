import { BinaryWriter } from './binary-writer';
import type { YamahaFileParsed, MidiEvent, MidiTrack } from '../models/types';
import { PadRecorder, type QuantizeGrid } from './pad-recorder';

/**
 * Yamaha Pad 屬性與混音編輯核心模組
 * 負責將記憶體中的修改同步至 MIDI 軌道事件與 Yamaha 專利控制標籤 (RP, CM, N, I)
 */
export class YamahaPadModifier {
  /**
   * 更新指定 Pad (1~4) 的名稱
   */
  public static setPadName(parsed: YamahaFileParsed, padNum: number, name: string): void {
    if (!parsed.padConfig) {
      parsed.padConfig = {
        names: ['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4'],
        icons: ['', '', '', ''],
        repeatFlags: [false, false, false, false],
        chordMatchFlags: [false, false, false, false],
      };
    }
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.names[idx] = name.trim();
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的循環播放 (Repeat / RP) 旗標
   */
  public static setPadRepeat(parsed: YamahaFileParsed, padNum: number, repeat: boolean): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.repeatFlags[idx] = repeat;
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的和弦跟隨 (Chord Match / CM) 旗標
   */
  public static setPadChordMatch(parsed: YamahaFileParsed, padNum: number, chordMatch: boolean): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.chordMatchFlags[idx] = chordMatch;
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 更新指定 Pad (1~4) 的圖示代碼 (Icon / I)
   */
  public static setPadIcon(parsed: YamahaFileParsed, padNum: number, icon: string): void {
    if (!parsed.padConfig) return;
    const idx = padNum - 1;
    if (idx >= 0 && idx < 4) {
      parsed.padConfig.icons[idx] = icon.trim();
      this.syncControlTagsToTrack0(parsed);
    }
  }

  /**
   * 提取音軌內的所有 Note-On/Note-Off 演奏音符清單
   */
  public static extractTrackNotes(track: MidiTrack | undefined): Array<{ note: number; startTick: number; durationTick: number; velocity: number }> {
    const notes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];
    if (!track || !track.events) return notes;
    let curTick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();

    for (const ev of track.events) {
      curTick += ev.delta;

      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const start = activeNotes.get(ev.noteNumber);
        if (start) {
          notes.push({
            note: ev.noteNumber,
            startTick: start.tick,
            durationTick: Math.max(1, curTick - start.tick),
            velocity: start.velocity,
          });
          activeNotes.delete(ev.noteNumber);
        }
      }
    }
    return notes;
  }

  /**
   * 更新指定 Pad 的混音參數 (音量、左右平衡、混響、音色)
   */
  public static setPadMixing(
    parsed: YamahaFileParsed,
    padNum: number,
    params: {
      volume?: number;
      pan?: number;
      reverb?: number;
      chorus?: number;
      bankMsb?: number;
      bankLsb?: number;
      programChange?: number;
    }
  ): void {
    const track = parsed.tracks[padNum]; // Pad 1~4 對應 Track 1~4
    if (!track) return;

    let targetChannel = padNum - 1;
    // 取得該 Track 使用的 Channel
    const firstChanEv = track.events.find((e) => e.channel !== undefined);
    if (firstChanEv && firstChanEv.channel !== undefined) {
      targetChannel = firstChanEv.channel;
    }

    // 更新音量 (CC 7)
    if (params.volume !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 7, params.volume);
    }

    // 更新聲相 (CC 10)
    if (params.pan !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 10, params.pan);
    }

    // 更新混響 (CC 91)
    if (params.reverb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 91, params.reverb);
    }

    // 更新合唱 (CC 93)
    if (params.chorus !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 93, params.chorus);
    }

    // 更新 Bank MSB (CC 0)
    if (params.bankMsb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 0, params.bankMsb);
    }

    // 更新 Bank LSB (CC 32)
    if (params.bankLsb !== undefined) {
      this.updateOrInsertCC(track, targetChannel, 32, params.bankLsb);
    }

    // 更新 Program Change
    if (params.programChange !== undefined) {
      this.updateOrInsertPC(track, targetChannel, params.programChange);
    }

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
  }

  /**
   * 同步 Pad 控制標籤 (RP, CM, N1~N4, I1~I4) 至 Track 0
   */
  private static syncControlTagsToTrack0(parsed: YamahaFileParsed): void {
    if (!parsed.padConfig || parsed.tracks.length === 0) return;
    const track0 = parsed.tracks[0];
    const cfg = parsed.padConfig;

    // 1. 移除舊有的控制 Marker (RP, CM, N1~N4, I1~I4)
    track0.events = track0.events.filter((ev) => {
      if (ev.type === 'meta' && (ev.metaType === 6 || ev.metaType === 7) && ev.text) {
        const t = ev.text.trim();
        if (t.startsWith('RP') || t.startsWith('CM') || /^N[1-4]/.test(t) || /^I[1-4]/.test(t)) {
          return false;
        }
      }
      return true;
    });

    // 2. 找到 End of Track (Meta 0x2F) 的位置，在其前方插入新的控制標籤
    const endMetaIdx = track0.events.findIndex((e) => e.type === 'meta' && e.metaType === 0x2f);
    const insertPos = endMetaIdx >= 0 ? endMetaIdx : track0.events.length;

    // 生成標籤字串
    const rpTag = `RP${cfg.repeatFlags.map((f) => (f ? '1' : '0')).join('')}`;
    const cmTag = `CM${cfg.chordMatchFlags.map((f) => (f ? '1' : '0')).join('')}`;

    const newControlEvents: MidiEvent[] = [
      this.createMarkerEvent(rpTag),
      this.createMarkerEvent(cmTag),
    ];

    for (let i = 0; i < 4; i++) {
      const num = i + 1;
      const name = cfg.names[i] || `Pad${num}`;
      const icon = cfg.icons[i] || 'S809';
      newControlEvents.push(this.createMarkerEvent(`N${num}${name}`));
      newControlEvents.push(this.createMarkerEvent(`I${num}${icon}`));
    }

    track0.events.splice(insertPos, 0, ...newControlEvents);

    // 重新編碼 Track 0 的 rawChunk
    this.rebuildTrackRawChunk(track0);
  }

  private static createMarkerEvent(text: string): MidiEvent {
    const encoder = new TextEncoder();
    const metaData = encoder.encode(text);
    return {
      delta: 0,
      type: 'meta',
      metaType: 6, // Marker
      text,
      metaData,
    };
  }

  private static updateOrInsertCC(track: MidiTrack, channel: number, controller: number, value: number): void {
    const matching = track.events.filter(
      (e) => e.type === 'controlChange' && e.controller === controller
    );
    if (matching.length > 0) {
      for (const ev of matching) {
        ev.value = value;
        ev.channel = channel;
      }
    } else {
      // 插入在第一個 NoteOn 之前
      const firstNoteIdx = track.events.findIndex((e) => e.type === 'noteOn');
      const insertIdx = firstNoteIdx >= 0 ? firstNoteIdx : 0;
      track.events.splice(insertIdx, 0, {
        delta: 0,
        type: 'controlChange',
        channel,
        controller,
        value,
      });
    }
  }

  private static updateOrInsertPC(track: MidiTrack, channel: number, program: number): void {
    const matching = track.events.filter(
      (e) => e.type === 'programChange'
    );
    if (matching.length > 0) {
      for (const ev of matching) {
        ev.program = program;
        ev.channel = channel;
      }
    } else {
      const firstNoteIdx = track.events.findIndex((e) => e.type === 'noteOn');
      const insertIdx = firstNoteIdx >= 0 ? firstNoteIdx : 0;
      track.events.splice(insertIdx, 0, {
        delta: 0,
        type: 'programChange',
        channel,
        program,
      });
    }
  }

  /**
   * 更新指定 Pad 音軌中特定音符的力度 (Velocity)、長度 (Duration Ticks)、起始位置 (Start Tick) 或音高 (Note Number)
   */
  public static updateNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    target: { note: number; startTick: number; oldDurationTick: number },
    updates: { velocity?: number; durationTick?: number; startTick?: number; note?: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 尋找目標 Note-On 事件
    const onEntry = annotated.find(
      (item) =>
        item.absTick === target.startTick &&
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === target.note &&
        (item.ev.velocity ?? 0) > 0
    );
    if (!onEntry) return false;

    // 尋找對應的 Note-Off 事件 (Note-Off 或 Note-On with vel=0)
    let offEntry = annotated.find(
      (item) =>
        item.index > onEntry.index &&
        item.absTick === target.startTick + target.oldDurationTick &&
        item.ev.noteNumber === target.note &&
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
    );

    if (!offEntry) {
      // 容錯備用：找第一個在此 Note-On 之後的 Note-Off
      offEntry = annotated.find(
        (item) =>
          item.index > onEntry.index &&
          item.ev.noteNumber === target.note &&
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
      );
    }

    let modified = false;

    // 計算當前有效音長 (供移動起始位置時保持音長)
    const effectiveDur = updates.durationTick !== undefined
      ? Math.max(1, Math.round(updates.durationTick))
      : (offEntry ? offEntry.absTick - onEntry.absTick : target.oldDurationTick);

    // 更新力度 (Velocity)
    if (updates.velocity !== undefined) {
      const newVel = Math.max(1, Math.min(127, Math.round(updates.velocity)));
      onEntry.ev.velocity = newVel;
      modified = true;
    }

    // 更新音高 (Note Number)
    if (updates.note !== undefined) {
      const newNote = Math.max(0, Math.min(127, Math.round(updates.note)));
      onEntry.ev.noteNumber = newNote;
      if (offEntry) offEntry.ev.noteNumber = newNote;
      modified = true;
    }

    // 更新起始位置 (Start Tick)
    if (updates.startTick !== undefined) {
      const newStart = Math.max(0, Math.round(updates.startTick));
      onEntry.absTick = newStart;
      if (offEntry) offEntry.absTick = newStart + effectiveDur;
      modified = true;
    } else if (updates.durationTick !== undefined && offEntry) {
      // 若只更新音長，不變更起始位置
      offEntry.absTick = onEntry.absTick + effectiveDur;
      modified = true;
    }

    if (!modified) return false;

    // 保證 End of Track (0x2F) 不早於任何事件
    const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (endMeta) {
      for (const item of annotated) {
        if (item.ev !== endMeta.ev && item.absTick > endMeta.absTick) {
          endMeta.absTick = item.absTick;
        }
      }
    }

    // 依據 absTick 重新排序，若 absTick 相同則維持原有相對順序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 刪除指定 Pad 音軌中特定音符 (移除其 Note-On 與對應之 Note-Off，並重新計算 Delta Times 與 RawChunk)
   */
  public static deleteNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    target: { note: number; startTick: number; oldDurationTick: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 尋找目標 Note-On
    const onEntry = annotated.find(
      (item) =>
        item.absTick === target.startTick &&
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === target.note &&
        (item.ev.velocity ?? 0) > 0
    );
    if (!onEntry) return false;

    // 尋找對應 Note-Off
    let offEntry = annotated.find(
      (item) =>
        item.index > onEntry.index &&
        item.absTick === target.startTick + target.oldDurationTick &&
        item.ev.noteNumber === target.note &&
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
    );

    if (!offEntry) {
      offEntry = annotated.find(
        (item) =>
          item.index > onEntry.index &&
          item.ev.noteNumber === target.note &&
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0))
      );
    }

    // 過濾掉 onEntry 與 offEntry
    const remaining = annotated.filter((item) => item !== onEntry && item !== offEntry);

    // 依據 absTick 重新排序
    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = remaining.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 批次更新指定 Pad 音軌中多顆音符 (支援批次修改音高、力度、時值、起始位置)
   * 採用單次標註、批次更新、末端一次性重新計算 Delta-Time 與重構 RawChunk，確保極致效能
   */
  public static batchUpdateNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    items: Array<{
      target: { note: number; startTick: number; oldDurationTick: number };
      updates: { velocity?: number; durationTick?: number; startTick?: number; note?: number };
    }>
  ): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || items.length === 0) return 0;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    let updatedCount = 0;

    for (const item of items) {
      const { target, updates } = item;
      // 尋找目標 Note-On
      const onEntry = annotated.find(
        (entry) =>
          entry.absTick === target.startTick &&
          entry.ev.type === 'noteOn' &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.velocity ?? 0) > 0
      );
      if (!onEntry) continue;

      // 尋找對應 Note-Off
      let offEntry = annotated.find(
        (entry) =>
          entry.index > onEntry.index &&
          entry.absTick === target.startTick + target.oldDurationTick &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
      );
      if (!offEntry) {
        offEntry = annotated.find(
          (entry) =>
            entry.index > onEntry.index &&
            entry.ev.noteNumber === target.note &&
            (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
        );
      }

      let modified = false;
      const effectiveDur = updates.durationTick !== undefined
        ? Math.max(1, Math.round(updates.durationTick))
        : (offEntry ? offEntry.absTick - onEntry.absTick : target.oldDurationTick);

      if (updates.velocity !== undefined) {
        onEntry.ev.velocity = Math.max(1, Math.min(127, Math.round(updates.velocity)));
        modified = true;
      }

      if (updates.note !== undefined) {
        const newNote = Math.max(0, Math.min(127, Math.round(updates.note)));
        onEntry.ev.noteNumber = newNote;
        if (offEntry) offEntry.ev.noteNumber = newNote;
        modified = true;
      }

      if (updates.startTick !== undefined) {
        const newStart = Math.max(0, Math.round(updates.startTick));
        onEntry.absTick = newStart;
        if (offEntry) offEntry.absTick = newStart + effectiveDur;
        modified = true;
      } else if (updates.durationTick !== undefined && offEntry) {
        offEntry.absTick = onEntry.absTick + effectiveDur;
        modified = true;
      }

      if (modified) {
        updatedCount++;
      }
    }

    if (updatedCount === 0) return 0;

    // 保證 End of Track (0x2F) 不早於任何事件
    const endMeta = annotated.find((entry) => entry.ev.type === 'meta' && entry.ev.metaType === 0x2f);
    if (endMeta) {
      for (const entry of annotated) {
        if (entry.ev !== endMeta.ev && entry.absTick > endMeta.absTick) {
          endMeta.absTick = entry.absTick;
        }
      }
    }

    // 依據 absTick 重新排序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    // 重新計算各事件之 delta-time
    let prevTick = 0;
    track.events = annotated.map((entry) => {
      const delta = entry.absTick - prevTick;
      prevTick = entry.absTick;
      entry.ev.delta = Math.max(0, delta);
      return entry.ev;
    });

    // 重新編碼該 Track 的二進位 rawChunk
    this.rebuildTrackRawChunk(track);
    return updatedCount;
  }

  /**
   * 批次刪除指定 Pad 音軌中多顆音符
   */
  public static batchDeleteNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    targets: Array<{ note: number; startTick: number; oldDurationTick: number }>
  ): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || targets.length === 0) return 0;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const entriesToRemove = new Set<any>();
    let deletedCount = 0;

    for (const target of targets) {
      const onEntry = annotated.find(
        (entry) =>
          !entriesToRemove.has(entry) &&
          entry.absTick === target.startTick &&
          entry.ev.type === 'noteOn' &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.velocity ?? 0) > 0
      );
      if (!onEntry) continue;

      let offEntry = annotated.find(
        (entry) =>
          !entriesToRemove.has(entry) &&
          entry.index > onEntry.index &&
          entry.absTick === target.startTick + target.oldDurationTick &&
          entry.ev.noteNumber === target.note &&
          (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
      );
      if (!offEntry) {
        offEntry = annotated.find(
          (entry) =>
            !entriesToRemove.has(entry) &&
            entry.index > onEntry.index &&
            entry.ev.noteNumber === target.note &&
            (entry.ev.type === 'noteOff' || (entry.ev.type === 'noteOn' && entry.ev.velocity === 0))
        );
      }

      entriesToRemove.add(onEntry);
      if (offEntry) entriesToRemove.add(offEntry);
      deletedCount++;
    }

    if (deletedCount === 0) return 0;

    const remaining = annotated.filter((entry) => !entriesToRemove.has(entry));

    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = remaining.map((entry) => {
      const delta = entry.absTick - prevTick;
      prevTick = entry.absTick;
      entry.ev.delta = Math.max(0, delta);
      return entry.ev;
    });

    this.rebuildTrackRawChunk(track);
    return deletedCount;
  }

  /**
   * 在指定 Pad 音軌中新增一顆音符 (自動配置 Channel、Note-On 與 Note-Off，並重新排序 Delta Times 與 RawChunk)
   */
  public static addNoteEvent(
    parsed: YamahaFileParsed,
    padNum: number,
    newNote: { note: number; startTick: number; durationTick: number; velocity: number }
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    // 確定此軌道使用的 channel (預設為 padNum - 1 或現存事件的 channel)
    let channel = padNum - 1;
    for (const ev of track.events) {
      if (ev.channel !== undefined) {
        channel = ev.channel;
        break;
      }
    }

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const noteNum = Math.max(0, Math.min(127, Math.round(newNote.note)));
    const vel = Math.max(1, Math.min(127, Math.round(newNote.velocity)));
    const startTick = Math.max(0, Math.round(newNote.startTick));
    const durTick = Math.max(1, Math.round(newNote.durationTick));
    const endTick = startTick + durTick;

    // 核心防護：避免在同一個時間點 (absTick) 與相同音高 (noteNumber) 重複插入 Note-On 事件
    const alreadyExists = annotated.some(
      (item) =>
        item.ev.type === 'noteOn' &&
        item.ev.noteNumber === noteNum &&
        item.absTick === startTick &&
        (item.ev.velocity ?? 0) > 0
    );
    if (alreadyExists) {
      return false;
    }

    // 建立 Note-On 事件
    const onEv: MidiEvent = {
      delta: 0,
      type: 'noteOn',
      channel,
      noteNumber: noteNum,
      velocity: vel,
    };

    // 建立 Note-Off 事件
    const offEv: MidiEvent = {
      delta: 0,
      type: 'noteOff',
      channel,
      noteNumber: noteNum,
      velocity: 0,
    };

    const newIndexBase = annotated.length + 10;
    annotated.push({ ev: onEv, absTick: startTick, index: newIndexBase });
    annotated.push({ ev: offEv, absTick: endTick, index: newIndexBase + 1 });

    // 確保 End of Track (0x2F) 在最後
    const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (endMeta && endTick > endMeta.absTick) {
      endMeta.absTick = endTick;
    }

    // 依據 absTick 重新排序
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      // Meta 0x2F 永遠置於最後
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      // Note-Off 優先於 Note-On
      if ((a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) && (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)) {
        return -1;
      }
      if ((b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) && (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 整軌替換 Pad 音符 (適用於即時錄音寫入、MIDI 切片置換)：
   * 保留該軌道之所有控制事件 (Program Change, Bank Select, Volume, Pan 等)，
   * 將原音符清除並批次填入新音符序列，自動設定 End of Track 與重編二進位資料。
   */
  public static replacePadNotes(
    parsed: YamahaFileParsed,
    padNum: number,
    notes: Array<{ note: number; startTick: number; durationTick: number; velocity: number }>,
    totalBars?: number
  ): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    let channel = padNum - 1;
    for (const ev of track.events) {
      if (ev.channel !== undefined) {
        channel = ev.channel;
        break;
      }
    }

    // 保留非音符事件 (Program Change, CC, Pitch Bend, Meta 等)
    let curTick = 0;
    const nonNoteEntries: Array<{ ev: any; absTick: number }> = [];
    for (const ev of track.events) {
      curTick += ev.delta;
      const isNote = ev.type === 'noteOn' || ev.type === 'noteOff';
      const isEndOfTrack = ev.type === 'meta' && ev.metaType === 0x2f;
      if (!isNote && !isEndOfTrack) {
        nonNoteEntries.push({ ev: { ...ev }, absTick: curTick });
      }
    }

    // 生成新音符事件之 Note-On 與 Note-Off
    const newNoteEntries: Array<{ ev: any; absTick: number }> = [];
    for (const n of notes) {
      const noteNum = Math.max(0, Math.min(127, Math.round(n.note)));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
      const sTick = Math.max(0, Math.round(n.startTick));
      const dur = Math.max(1, Math.round(n.durationTick));
      const eTick = sTick + dur;

      newNoteEntries.push({
        ev: { delta: 0, type: 'noteOn', channel, noteNumber: noteNum, velocity: vel },
        absTick: sTick,
      });
      newNoteEntries.push({
        ev: { delta: 0, type: 'noteOff', channel, noteNumber: noteNum, velocity: 0 },
        absTick: eTick,
      });
    }

    // 合併並排序
    const allEntries = [...nonNoteEntries, ...newNoteEntries];
    allEntries.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      const aIsOff = a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) === 0);
      const bIsOff = b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) === 0);
      if (aIsOff && !bIsOff) return -1;
      if (!aIsOff && bIsOff) return 1;
      return 0;
    });

    // 計算小節長度
    const ppq = parsed.division || 480;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = ppq * beatsPerBar;
    let maxTick = 0;
    for (const item of allEntries) {
      if (item.absTick > maxTick) maxTick = item.absTick;
    }

    const bars = totalBars || Math.max(1, Math.ceil(maxTick / ticksPerBar));
    const targetEndTick = Math.max(maxTick, bars * ticksPerBar);

    // 加入 End of Track Meta
    allEntries.push({
      ev: { delta: 0, type: 'meta', metaType: 0x2f, metaData: new Uint8Array(0) },
      absTick: targetEndTick,
    });

    // 重新計算 delta
    let prevTick = 0;
    track.events = allEntries.map((item) => {
      const delta = Math.max(0, item.absTick - prevTick);
      prevTick = item.absTick;
      item.ev.delta = delta;
      return item.ev;
    });

    // 重新編碼 rawChunk
    this.rebuildTrackRawChunk(track);

    // 同步更新 Section 資訊
    const secIdx = padNum - 1;
    if (parsed.sections && parsed.sections[secIdx]) {
      parsed.sections[secIdx].measureCount = bars;
    }

    return true;
  }

  /**
   * 清理並消除音軌中重複堆疊的 Note-On 與多餘的 Note-Off 事件，防止重疊幽靈音符
   * @returns boolean 是否進行了實質清理與重新計算
   */
  public static sanitizeTrackDuplicateNotes(track: MidiTrack): boolean {
    if (!track || !track.events || track.events.length === 0) return false;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const activeCounts = new Map<string, number>();
    const seenNoteOnTicks = new Set<string>();
    const kept: typeof annotated = [];
    let modified = false;

    for (const item of annotated) {
      const ev = item.ev;
      const ch = ev.channel ?? 0;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0 && ev.noteNumber !== undefined) {
        const key = `${ch}_${ev.noteNumber}_${item.absTick}`;
        if (seenNoteOnTicks.has(key)) {
          // 同一通道、同一音高且完全同一個起始 Tick，視為重複 Note-On，予以剃除
          modified = true;
          continue;
        }
        seenNoteOnTicks.add(key);
        const countKey = `${ch}_${ev.noteNumber}`;
        activeCounts.set(countKey, (activeCounts.get(countKey) || 0) + 1);
        kept.push(item);
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const countKey = `${ch}_${ev.noteNumber}`;
        const count = activeCounts.get(countKey) || 0;
        if (count <= 0) {
          // 沒有對應進行中的 Note-On，此為孤立/重複 Note-Off，予以剃除
          modified = true;
          continue;
        }
        activeCounts.set(countKey, count - 1);
        kept.push(item);
      } else {
        kept.push(item);
      }
    }

    if (!modified) return false;

    // 重新排序並維持 Meta 0x2F 在最後
    kept.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      if ((a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) && (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)) {
        return -1;
      }
      if ((b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) && (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = kept.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 取得指定 Pad 當前的總小節數 (綜合考量音符範圍、End-of-Track 與 Section 標記)
   */
  public static getPadBarLength(parsed: YamahaFileParsed, padNum: number): number {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return 4;

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    let curTick = 0;
    const noteTicks: { start: number; end: number }[] = [];
    const active = new Map<number, number>();
    let endOfTrackTick = 0;

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        active.set(ev.noteNumber, curTick);
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = active.get(ev.noteNumber);
        if (st !== undefined) {
          noteTicks.push({ start: st, end: curTick });
          active.delete(ev.noteNumber);
        }
      } else if (ev.type === 'meta' && ev.metaType === 0x2f) {
        endOfTrackTick = curTick;
      }
    }

    if (noteTicks.length === 0) {
      const sec = parsed.sections ? parsed.sections[padNum - 1] : undefined;
      if (sec && sec.measureCount) return sec.measureCount;
      if (endOfTrackTick > 0) return Math.max(1, Math.round(endOfTrackTick / ticksPerBar));
      return 4;
    }

    const firstNoteTick = Math.min(...noteTicks.map((n) => n.start));
    const lastNoteTick = Math.max(...noteTicks.map((n) => n.end));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const notesBars = Math.max(1, Math.ceil((lastNoteTick - gridStartTick) / ticksPerBar));
    const endMetaBars = endOfTrackTick > gridStartTick
      ? Math.max(1, Math.round((endOfTrackTick - gridStartTick) / ticksPerBar))
      : 1;

    if (endOfTrackTick > gridStartTick) {
      return Math.max(notesBars, endMetaBars);
    }

    const sec = parsed.sections ? parsed.sections[padNum - 1] : undefined;
    const secBars = sec && sec.measureCount ? sec.measureCount : 1;

    return Math.max(notesBars, secBars);
  }

  /**
   * 設定指定 Pad 的總小節數 (透過重算並推移 End-of-Track 標記，同步更新二進位 RawChunk 與 Section 標記)
   */
  public static setPadBarLength(parsed: YamahaFileParsed, padNum: number, targetBars: number): boolean {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return false;

    const newBars = Math.max(1, Math.min(64, Math.round(targetBars)));
    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    const noteStarts = annotated
      .filter((i) => i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) > 0)
      .map((i) => i.absTick);
    const firstNoteTick = noteStarts.length > 0 ? Math.min(...noteStarts) : 0;
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    let targetEndTick = gridStartTick + newBars * ticksPerBar;

    // 尋找 End of Track (Meta 0x2F)
    let endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);
    if (!endMeta) {
      const eotEv: MidiEvent = {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      };
      endMeta = { ev: eotEv, absTick: targetEndTick, index: annotated.length + 999 };
      annotated.push(endMeta);
    } else {
      endMeta.absTick = targetEndTick;
    }

    // 保證 End of Track 不早於任何現存音符事件
    for (const item of annotated) {
      if (item !== endMeta && item.absTick > endMeta.absTick) {
        endMeta.absTick = item.absTick;
      }
    }

    // 重新排序並計算 delta-time
    annotated.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = annotated.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 同步更新 parsed.sections
    if (parsed.sections && parsed.sections[padNum - 1]) {
      parsed.sections[padNum - 1].measureCount = newBars;
      parsed.sections[padNum - 1].endTick = targetEndTick;
    }

    this.rebuildTrackRawChunk(track);
    return true;
  }

  /**
   * 複製指定 Pad 的特定小節音符至目標小節 (支援 1➔3、1➔5 等跳小節複製，自動擴展總小節數)
   */
  public static copyPadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    sourceBar: number, // 1-indexed, 例如 1
    targetBar: number, // 1-indexed, 例如 3 或 5
    mode: 'replace' | 'insert' | 'merge' = 'replace'
  ): { success: boolean; copiedCount: number; newTotalBars: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return { success: false, copiedCount: 0, newTotalBars: 1 };
    if (sourceBar <= 0 || targetBar <= 0 || (sourceBar === targetBar && mode !== 'insert')) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    // 提取當前軌道的所有 Note 事件
    let curTick = 0;
    const noteList: { note: number; velocity: number; startTick: number; durationTick: number }[] = [];
    const active = new Map<number, { tick: number; velocity: number }>();

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        active.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = active.get(ev.noteNumber);
        if (st !== undefined) {
          noteList.push({
            note: ev.noteNumber,
            velocity: st.velocity,
            startTick: st.tick,
            durationTick: Math.max(curTick - st.tick, 1),
          });
          active.delete(ev.noteNumber);
        }
      }
    }

    if (noteList.length === 0) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const firstNoteTick = Math.min(...noteList.map((n) => n.startTick));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const sourceStartTick = gridStartTick + (sourceBar - 1) * ticksPerBar;
    const sourceEndTick = sourceStartTick + ticksPerBar;

    // 找出在 sourceBar 內起奏的所有音符
    const sourceNotes = noteList.filter(
      (n) => n.startTick >= sourceStartTick && n.startTick < sourceEndTick
    );

    if (sourceNotes.length === 0) {
      return { success: false, copiedCount: 0, newTotalBars: this.getPadBarLength(parsed, padNum) };
    }

    const targetStartTick = gridStartTick + (targetBar - 1) * ticksPerBar;
    const targetEndTick = targetStartTick + ticksPerBar;
    const curPadLen = this.getPadBarLength(parsed, padNum);

    // 模式 C：插入順移模式 (Insert / Ripple Paste)
    if (mode === 'insert') {
      if (targetBar <= curPadLen) {
        // 將 targetStartTick 及之後的所有事件向後順移 ticksPerBar (+1 小節)
        let evTick = 0;
        const annotated = track.events.map((ev, index) => {
          evTick += ev.delta;
          return { ev, absTick: evTick, index };
        });

        const endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);

        // 嚴謹配對 Note-On 與 Note-Off，防止先前小節在邊界處結束之音符其 Note-Off 被誤推移
        const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
        const noteItemsToShift = new Set<any>();

        for (const item of annotated) {
          if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
            activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
          } else if (
            (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
            item.ev.noteNumber !== undefined
          ) {
            const st = activeNotes.get(item.ev.noteNumber);
            if (st !== undefined) {
              if (st.absTick >= targetStartTick) {
                // 音符起奏於 targetStartTick 之後，Note-On 與 Note-Off 皆向後順移
                const onEntry = annotated.find((x) => x.index === st.onIndex);
                if (onEntry) noteItemsToShift.add(onEntry);
                noteItemsToShift.add(item);
              } else if (item.absTick > targetStartTick) {
                // 音符起奏於先前小節，但在 targetStartTick 之後才結束（跨小節），截斷於邊界處
                item.absTick = targetStartTick;
              }
              activeNotes.delete(item.ev.noteNumber);
            }
          }
        }

        // 對已標記的音符事件與非音符事件執行順移
        for (const item of annotated) {
          const isNote = item.ev.type === 'noteOn' || item.ev.type === 'noteOff';
          if (isNote) {
            if (noteItemsToShift.has(item)) {
              item.absTick += ticksPerBar;
            }
          } else if (item.absTick >= targetStartTick && item.absTick > 0 && !(item.ev.type === 'meta' && item.ev.metaType === 0x2f)) {
            item.absTick += ticksPerBar;
          }
        }

        const newTotalBars = curPadLen + 1;
        const newEndTick = gridStartTick + newTotalBars * ticksPerBar;
        if (endMeta && endMeta.absTick < newEndTick) {
          endMeta.absTick = newEndTick;
        }

        // 重新排序並寫回 delta-time
        annotated.sort((a, b) => {
          if (a.absTick !== b.absTick) return a.absTick - b.absTick;
          if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
          if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
          return a.index - b.index;
        });

        let prev = 0;
        track.events = annotated.map((item) => {
          const delta = item.absTick - prev;
          prev = item.absTick;
          item.ev.delta = Math.max(0, delta);
          return item.ev;
        });

        this.rebuildTrackRawChunk(track);

        // 將 sourceNotes 寫入已空出來的 targetBar
        for (const sNote of sourceNotes) {
          const relTick = sNote.startTick - sourceStartTick;
          const newStart = targetStartTick + relTick;
          this.addNoteEvent(parsed, padNum, {
            note: sNote.note,
            startTick: newStart,
            durationTick: sNote.durationTick,
            velocity: sNote.velocity,
          });
        }

        // 同步更新 parsed.sections 與總長度
        if (parsed.sections && parsed.sections[padNum - 1]) {
          parsed.sections[padNum - 1].measureCount = newTotalBars;
          parsed.sections[padNum - 1].endTick = endMeta ? endMeta.absTick : newEndTick;
        }

        return { success: true, copiedCount: sourceNotes.length, newTotalBars };
      } else {
        // 目標小節超出目前長度，等同於向後延伸追加
        for (const sNote of sourceNotes) {
          const relTick = sNote.startTick - sourceStartTick;
          const newStart = targetStartTick + relTick;
          this.addNoteEvent(parsed, padNum, {
            note: sNote.note,
            startTick: newStart,
            durationTick: sNote.durationTick,
            velocity: sNote.velocity,
          });
        }
        const newTotalBars = targetBar;
        this.setPadBarLength(parsed, padNum, targetBar);
        return { success: true, copiedCount: sourceNotes.length, newTotalBars };
      }
    }

    const tickOffset = targetStartTick - sourceStartTick;

    // 若 mode === 'replace'，刪除 targetBar 內已有的音符
    if (mode === 'replace') {
      const targetExisting = noteList.filter(
        (n) => n.startTick >= targetStartTick && n.startTick < targetEndTick
      );
      for (const tNote of targetExisting) {
        this.deleteNoteEvent(parsed, padNum, {
          note: tNote.note,
          startTick: tNote.startTick,
          oldDurationTick: tNote.durationTick,
        });
      }
    }

    // 逐一將 sourceNotes 複製到 targetBar
    for (const sNote of sourceNotes) {
      const newStart = sNote.startTick + tickOffset;
      this.addNoteEvent(parsed, padNum, {
        note: sNote.note,
        startTick: newStart,
        durationTick: sNote.durationTick,
        velocity: sNote.velocity,
      });
    }

    // 若目標小節超出原本 Pad 長度，自動擴展長度
    const newTotalBars = Math.max(curPadLen, targetBar);
    if (targetBar > curPadLen) {
      this.setPadBarLength(parsed, padNum, targetBar);
    }

    return { success: true, copiedCount: sourceNotes.length, newTotalBars };
  }

  /**
   * 一鍵倍增指定小節 (Duplicate Measure / Ctrl+D)，接續貼在下一小節
   */
  public static duplicatePadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    sourceBar?: number
  ): { success: boolean; copiedCount: number; newTargetBar: number } {
    const curLen = this.getPadBarLength(parsed, padNum);
    const src = sourceBar !== undefined && sourceBar > 0 ? sourceBar : curLen;
    const target = src + 1;
    const res = this.copyPadMeasure(parsed, padNum, src, target, 'replace');
    return { success: res.success, copiedCount: res.copiedCount, newTargetBar: target };
  }

  /**
   * 刪除或清空指定 Pad 的特定小節
   * - mode: 'ripple' (剪除順移)：刪除目標小節內所有音符，後方小節音符自動向前平移 1 個小節，總小節長度 -1
   * - mode: 'clear' (清空音符)：清空目標小節內所有音符為靜音空白，後方音符與總小節數保持不變
   */
  public static deletePadMeasure(
    parsed: YamahaFileParsed,
    padNum: number,
    targetBar: number, // 1-indexed, 例如 2
    mode: 'ripple' | 'clear' = 'ripple',
    minBars: number = 4
  ): { success: boolean; deletedCount: number; newTotalBars: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) {
      return { success: false, deletedCount: 0, newTotalBars: 1 };
    }

    const curPadLen = this.getPadBarLength(parsed, padNum);
    if (targetBar < 1 || targetBar > curPadLen) {
      return { success: false, deletedCount: 0, newTotalBars: curPadLen };
    }

    const division = parsed.division || 96;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = division * beatsPerBar;

    // 1. 提取所有事件並標記絕對 Tick
    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    // 計算基準對齊網格起點
    const noteStarts = annotated
      .filter((i) => i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) > 0)
      .map((i) => i.absTick);
    const firstNoteTick = noteStarts.length > 0 ? Math.min(...noteStarts) : 0;
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const targetStartTick = gridStartTick + (targetBar - 1) * ticksPerBar;
    const targetEndTick = targetStartTick + ticksPerBar;

    // 統計目標小節內起奏的音符數量
    const targetNoteOns = annotated.filter(
      (i) =>
        i.ev.type === 'noteOn' &&
        (i.ev.velocity ?? 0) > 0 &&
        i.absTick >= targetStartTick &&
        i.absTick < targetEndTick
    );
    const deletedCount = targetNoteOns.length;

    if (mode === 'clear') {
      // 模式 B：小節音符清空 (Clear Measure)
      const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
      const itemsToDelete = new Set<any>();

      for (const item of annotated) {
        if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
          activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
        } else if (
          (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
          item.ev.noteNumber !== undefined
        ) {
          const st = activeNotes.get(item.ev.noteNumber);
          if (st !== undefined) {
            if (st.absTick >= targetStartTick && st.absTick < targetEndTick) {
              const onEntry = annotated.find((x) => x.index === st.onIndex);
              if (onEntry) itemsToDelete.add(onEntry);
              itemsToDelete.add(item);
            }
            activeNotes.delete(item.ev.noteNumber);
          }
        }
      }

      for (const tOn of targetNoteOns) {
        itemsToDelete.add(tOn);
      }

      const remaining = annotated.filter((item) => !itemsToDelete.has(item));

      // 依 absTick 排序並重算 delta-time
      remaining.sort((a, b) => {
        if (a.absTick !== b.absTick) return a.absTick - b.absTick;
        if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
        if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
        return a.index - b.index;
      });

      let prevTick = 0;
      track.events = remaining.map((item) => {
        const delta = item.absTick - prevTick;
        prevTick = item.absTick;
        item.ev.delta = Math.max(0, delta);
        return item.ev;
      });

      this.rebuildTrackRawChunk(track);
      return { success: true, deletedCount, newTotalBars: curPadLen };
    }

    // 模式 A：小節剪除順移 (Ripple Delete)
    // 若總小節數為 1，無法縮減至 0 小節，轉為清空該小節
    if (curPadLen <= 1) {
      return this.deletePadMeasure(parsed, padNum, 1, 'clear', minBars);
    }

    // 若當前小節數大於 minBars (例如 8 小節)，刪除時正常縮減 1 小節；
    // 若在標準小節數內 (例如 4 小節)，後續音符往前順移，並於末端保持空白小節維持標準結構
    const effectiveMinBars = Math.min(minBars, curPadLen);
    const newTotalBars = Math.max(effectiveMinBars, curPadLen - 1);
    const newEndTick = gridStartTick + newTotalBars * ticksPerBar;

    // 標記要刪除的音符
    const activeNotes = new Map<number, { onIndex: number; absTick: number }>();
    const itemsToDelete = new Set<any>();

    for (const item of annotated) {
      if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
        activeNotes.set(item.ev.noteNumber!, { onIndex: item.index, absTick: item.absTick });
      } else if (
        (item.ev.type === 'noteOff' || (item.ev.type === 'noteOn' && item.ev.velocity === 0)) &&
        item.ev.noteNumber !== undefined
      ) {
        const st = activeNotes.get(item.ev.noteNumber);
        if (st !== undefined) {
          if (st.absTick >= targetStartTick && st.absTick < targetEndTick) {
            const onEntry = annotated.find((x) => x.index === st.onIndex);
            if (onEntry) itemsToDelete.add(onEntry);
            itemsToDelete.add(item);
          } else if (st.absTick < targetStartTick && item.absTick >= targetStartTick && item.absTick < targetEndTick) {
            item.absTick = targetStartTick;
          }
          activeNotes.delete(item.ev.noteNumber);
        }
      }
    }

    for (const tOn of targetNoteOns) {
      itemsToDelete.add(tOn);
    }

    // 處理在 targetBar 內的其他非音符控制器事件 (保留 0 Tick 標頭設定，且不可誤刪先前音符的 NoteOff)
    for (const item of annotated) {
      const isNote = item.ev.type === 'noteOn' || item.ev.type === 'noteOff';
      if (!isNote && !itemsToDelete.has(item) && item.absTick >= targetStartTick && item.absTick < targetEndTick) {
        if (item.absTick > 0 && !(item.ev.type === 'meta' && item.ev.metaType === 0x2f)) {
          itemsToDelete.add(item);
        }
      }
    }

    // 過濾並將 targetEndTick 之後的事件向前平移 ticksPerBar
    const remaining: typeof annotated = [];
    let endMeta = annotated.find((item) => item.ev.type === 'meta' && item.ev.metaType === 0x2f);

    for (const item of annotated) {
      if (itemsToDelete.has(item)) continue;
      if (item.ev.type === 'meta' && item.ev.metaType === 0x2f) continue;

      if (item.absTick >= targetEndTick) {
        item.absTick -= ticksPerBar;
      }
      remaining.push(item);
    }

    // 重設 End of Track (Meta 0x2F)
    if (!endMeta) {
      const eotEv: MidiEvent = {
        delta: 0,
        type: 'meta',
        metaType: 0x2f,
        metaData: new Uint8Array(0),
      };
      endMeta = { ev: eotEv, absTick: newEndTick, index: annotated.length + 999 };
    } else {
      endMeta.absTick = newEndTick;
    }

    // 確保 End of Track 不早於任何現存事件
    for (const item of remaining) {
      if (item.absTick > endMeta.absTick) {
        endMeta.absTick = item.absTick;
      }
    }
    remaining.push(endMeta);

    // 重新排序
    remaining.sort((a, b) => {
      if (a.absTick !== b.absTick) return a.absTick - b.absTick;
      if (a.ev.type === 'meta' && a.ev.metaType === 0x2f) return 1;
      if (b.ev.type === 'meta' && b.ev.metaType === 0x2f) return -1;
      if (
        (a.ev.type === 'noteOff' || (a.ev.type === 'noteOn' && a.ev.velocity === 0)) &&
        (b.ev.type === 'noteOn' && (b.ev.velocity ?? 0) > 0)
      ) {
        return -1;
      }
      if (
        (b.ev.type === 'noteOff' || (b.ev.type === 'noteOn' && b.ev.velocity === 0)) &&
        (a.ev.type === 'noteOn' && (a.ev.velocity ?? 0) > 0)
      ) {
        return 1;
      }
      return a.index - b.index;
    });

    let prevTick = 0;
    track.events = remaining.map((item) => {
      const delta = item.absTick - prevTick;
      prevTick = item.absTick;
      item.ev.delta = Math.max(0, delta);
      return item.ev;
    });

    // 同步更新 parsed.sections
    if (parsed.sections && parsed.sections[padNum - 1]) {
      parsed.sections[padNum - 1].measureCount = newTotalBars;
      parsed.sections[padNum - 1].endTick = endMeta.absTick;
    }

    this.rebuildTrackRawChunk(track);
    return { success: true, deletedCount, newTotalBars };
  }

  /**
   * 2.8-B 八度快速移調工具 (Octave Shift +/- 12 半音)
   * - 若傳入 targetStartTick 與 targetNote：僅移調該特定單一音符
   * - 若未傳入目標音符：將指定 Pad 整軌所有音符一鍵升/降八度
   * - 自動進行 0 ~ 127 MIDI 音高邊界防護
   */
  public static shiftPadOctave(
    parsed: YamahaFileParsed,
    padNum: number,
    direction: 1 | -1,
    targetStartTick?: number,
    targetNote?: number
  ): { success: boolean; shiftedCount: number; targetNoteInfo?: { oldNote: number; newNote: number } } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events) return { success: false, shiftedCount: 0 };

    const semitones = direction * 12;
    let curTick = 0;
    const annotated = track.events.map((ev, index) => {
      curTick += ev.delta;
      return { ev, absTick: curTick, index };
    });

    let shiftedCount = 0;
    let targetNoteInfo: { oldNote: number; newNote: number } | undefined;

    if (targetStartTick !== undefined && targetNote !== undefined) {
      // 僅移調單一目標音符
      const onEntry = annotated.find(
        (i) => i.absTick === targetStartTick && i.ev.type === 'noteOn' && i.ev.noteNumber === targetNote && (i.ev.velocity ?? 0) > 0
      );
      if (!onEntry) return { success: false, shiftedCount: 0 };

      const oldNote = targetNote;
      const newNote = Math.max(0, Math.min(127, oldNote + semitones));
      if (newNote === oldNote) return { success: false, shiftedCount: 0 };

      // 尋找對應的 Note-Off
      const offEntry = annotated.find(
        (i) => i.index > onEntry.index &&
          i.ev.noteNumber === targetNote &&
          (i.ev.type === 'noteOff' || (i.ev.type === 'noteOn' && (i.ev.velocity ?? 0) === 0))
      );

      onEntry.ev.noteNumber = newNote;
      if (offEntry) offEntry.ev.noteNumber = newNote;

      shiftedCount = 1;
      targetNoteInfo = { oldNote, newNote };
    } else {
      // 整軌所有音符一鍵移調
      for (const item of annotated) {
        if ((item.ev.type === 'noteOn' || item.ev.type === 'noteOff') && item.ev.noteNumber !== undefined) {
          const oldNote = item.ev.noteNumber;
          const newNote = Math.max(0, Math.min(127, oldNote + semitones));
          item.ev.noteNumber = newNote;
          if (item.ev.type === 'noteOn' && (item.ev.velocity ?? 0) > 0) {
            shiftedCount++;
          }
        }
      }
    }

    if (shiftedCount === 0) return { success: false, shiftedCount: 0 };

    this.rebuildTrackRawChunk(track);
    return { success: true, shiftedCount, targetNoteInfo };
  }

  /**
   * 2.8-B Pad 音軌量化與 Swing 搖擺律動套用
   * - 支援 1/16、1/8、1/4、1/32、三連音及 Swing 搖擺律動 (54%, 60%, 66%)
   * - 可針對「選取音符」或「整軌音符」執行量化
   */
  public static quantizePadTrack(
    parsed: YamahaFileParsed,
    padNum: number,
    grid: QuantizeGrid,
    targetStartTick?: number,
    targetNote?: number
  ): { success: boolean; quantizedCount: number } {
    const track = parsed.tracks[padNum];
    if (!track || !track.events || grid === 'off') return { success: false, quantizedCount: 0 };

    const ppq = parsed.division || 480;
    const beatsPerBar = parsed.timeSignature?.numerator || 4;
    const ticksPerBar = ppq * beatsPerBar;
    const totalBars = this.getPadBarLength(parsed, padNum);
    const maxTicks = totalBars * ticksPerBar;

    // 提取所有音符
    let curTick = 0;
    const activeNotes = new Map<number, { tick: number; velocity: number }>();
    const noteList: Array<{ note: number; startTick: number; durationTick: number; velocity: number }> = [];

    for (const ev of track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && ev.noteNumber !== undefined && (ev.velocity ?? 0) > 0) {
        activeNotes.set(ev.noteNumber, { tick: curTick, velocity: ev.velocity! });
      } else if ((ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) && ev.noteNumber !== undefined) {
        const st = activeNotes.get(ev.noteNumber);
        if (st) {
          noteList.push({
            note: ev.noteNumber,
            velocity: st.velocity,
            startTick: st.tick,
            durationTick: Math.max(curTick - st.tick, 1),
          });
          activeNotes.delete(ev.noteNumber);
        }
      }
    }

    if (noteList.length === 0) return { success: false, quantizedCount: 0 };

    let quantizedCount = 0;
    const firstNoteTick = Math.min(...noteList.map((n) => n.startTick));
    const gridStartTick = Math.floor(firstNoteTick / ticksPerBar) * ticksPerBar;

    const modifiedNotes = noteList.map((n) => {
      const isTarget = (targetStartTick !== undefined && targetNote !== undefined)
        ? (n.startTick === targetStartTick && n.note === targetNote)
        : true;

      if (!isTarget) return n;

      // 依據 gridStartTick 計算相對 Tick 進行量化
      const relStart = n.startTick - gridStartTick;
      const qRelStart = PadRecorder.snapTickToGrid(relStart, grid, ppq);
      const minDur = PadRecorder.getMinGridDuration(grid, ppq);
      const qStart = gridStartTick + Math.max(0, Math.min(maxTicks - minDur, qRelStart));

      // 音長吸附
      const relEnd = relStart + n.durationTick;
      const qRelEnd = PadRecorder.snapTickToGrid(relEnd, grid, ppq);
      const qDur = Math.max(minDur, qRelEnd - qRelStart);

      quantizedCount++;
      return {
        note: n.note,
        velocity: n.velocity,
        startTick: qStart,
        durationTick: qDur,
      };
    });

    if (quantizedCount === 0) return { success: false, quantizedCount: 0 };

    const ok = this.replacePadNotes(parsed, padNum, modifiedNotes, totalBars);
    return { success: ok, quantizedCount };
  }

  /**
   * 重新編碼標準 MIDI Track (MTrk) 的二進位 Byte Buffer
   */
  public static rebuildTrackRawChunk(track: MidiTrack): void {
    const writer = new BinaryWriter();

    for (const ev of track.events) {
      // 寫入 Delta-time
      writer.writeVarInt(ev.delta);

      if (ev.type === 'meta') {
        writer.writeUint8(0xff);
        writer.writeUint8(ev.metaType ?? 0);
        const data = ev.metaData ?? (ev.text !== undefined ? new TextEncoder().encode(ev.text) : new Uint8Array(0));
        writer.writeVarInt(data.length);
        writer.writeBytes(data);
      } else if (ev.type === 'sysex') {
        writer.writeUint8(0xf0);
        const data = ev.rawBytes ?? new Uint8Array(0);
        writer.writeVarInt(data.length);
        writer.writeBytes(data);
      } else {
        const channel = (ev.channel ?? 0) & 0x0f;
        let statusByte = 0;

        if (ev.type === 'noteOn') {
          statusByte = 0x90 | channel;
        } else if (ev.type === 'noteOff') {
          statusByte = 0x80 | channel;
        } else if (ev.type === 'controlChange') {
          statusByte = 0xb0 | channel;
        } else if (ev.type === 'programChange') {
          statusByte = 0xc0 | channel;
        } else if (ev.type === 'pitchBend') {
          statusByte = 0xe0 | channel;
        }

        if (statusByte !== 0) {
          writer.writeUint8(statusByte);

          if (ev.type === 'noteOn' || ev.type === 'noteOff') {
            writer.writeUint8((ev.noteNumber ?? 60) & 0x7f);
            writer.writeUint8((ev.velocity ?? 64) & 0x7f);
          } else if (ev.type === 'controlChange') {
            writer.writeUint8((ev.controller ?? 0) & 0x7f);
            writer.writeUint8((ev.value ?? 0) & 0x7f);
          } else if (ev.type === 'programChange') {
            writer.writeUint8((ev.program ?? 0) & 0x7f);
          } else if (ev.type === 'pitchBend') {
            const val = ev.value ?? 8192;
            writer.writeUint8(val & 0x7f);
            writer.writeUint8((val >> 7) & 0x7f);
          }
        }
      }
    }

    const eventBytes = writer.toUint8Array();

    // 組裝 MTrk 標頭與長度
    const chunkWriter = new BinaryWriter();
    chunkWriter.writeString('MTrk');
    chunkWriter.writeUint32BE(eventBytes.length);
    chunkWriter.writeBytes(eventBytes);

    track.rawChunk = chunkWriter.toUint8Array();
  }
}
