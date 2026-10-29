/**
 * Yamaha STY 音符移調與八度升降核心 (Pitch Transposer & Octave Shifter)
 *
 * 支援功能：
 * 1. 半音階微調 (Semitone Nudge): -12 ~ +12
 * 2. 八度快速跳躍 (Octave Shift): -8va (-12) / +8va (+12)
 * 3. 和弦群組音程完整保持 (Group Relative Harmony Preservation):
 *    - 若選取多顆音符，集體平移時以群組極值為基準進行邊界限制，
 *      確保和弦中各音符間的音程關係 (Intervals) 100% 不變形。
 * 4. 音高極限保護: 確保所有音符 noteNumber 在 0 ~ 127 安全範圍內。
 * 5. 鼓組軌道 (Channel 8 / 9) 智慧安全偵測與保護。
 */

export interface TransposeOptions {
  minNote?: number;             // 預設 0 (MIDI 最低音 C-1) 或 21 (鋼琴 A0)
  maxNote?: number;             // 預設 127 (MIDI 最高音 G9) 或 108 (鋼琴 C8)
  allowDrumTranspose?: boolean; // 鼓軌是否允許移調 (預設 false)
  channel?: number;             // 聲部 Channel (8, 9 為打擊樂 Rhythm 1, 2)
}

export interface TransposableNote {
  noteNumber: number;
  startTick?: number;
  relTick?: number;
  durationTicks: number;
  velocity: number;
  [key: string]: any;
}

export interface TransposeResult<T extends TransposableNote> {
  success: boolean;
  notes: T[];
  actualShift: number;          // 實際套用的半音數 (若觸及邊界可能被安全限制)
  isLimited: boolean;           // 是否因觸及邊界而未達預期半音數
  isDrumWarning: boolean;       // 是否觸發打擊樂聲部警告
  message?: string;
}

export class PitchTransposer {
  public static readonly DEFAULT_MIN_NOTE = 0;
  public static readonly DEFAULT_MAX_NOTE = 127;

  /**
   * 檢查指定 Channel 是否為 Yamaha 鼓組打擊樂軌道 (CH 9 Rhythm 1 / CH 10 Rhythm 2)
   */
  public static isDrumChannel(channel?: number): boolean {
    return channel === 8 || channel === 9;
  }

  /**
   * 對一組音符執行智慧移調
   * @param notes 音符陣列
   * @param semitones 半音位移量 (正數為升音，負數為降音，如 +1, -1, +12, -12)
   * @param options 移調參數
   */
  public static transposeNotes<T extends TransposableNote>(
    notes: T[],
    semitones: number,
    options?: TransposeOptions
  ): TransposeResult<T> {
    if (!notes || notes.length === 0) {
      return {
        success: false,
        notes: [],
        actualShift: 0,
        isLimited: false,
        isDrumWarning: false,
        message: '無任何音符可供移調',
      };
    }

    const channel = options?.channel;
    const isDrum = this.isDrumChannel(channel);

    // 鼓軌保護：若未明確允許，禁止移調並返回警告
    if (isDrum && options?.allowDrumTranspose !== true) {
      return {
        success: false,
        notes: [...notes],
        actualShift: 0,
        isLimited: false,
        isDrumWarning: true,
        message: '⚠️ 打擊樂聲部 (Rhythm) 音高對應特定鼓組樂器，預設停用移調以保護鼓點配置',
      };
    }

    if (semitones === 0) {
      return {
        success: true,
        notes: notes.map(n => ({ ...n })),
        actualShift: 0,
        isLimited: false,
        isDrumWarning: false,
      };
    }

    const minLimit = options?.minNote ?? this.DEFAULT_MIN_NOTE;
    const maxLimit = options?.maxNote ?? this.DEFAULT_MAX_NOTE;

    // 找出群組內的最高音與最低音
    let groupMin = 127;
    let groupMax = 0;
    for (const n of notes) {
      if (n.noteNumber < groupMin) groupMin = n.noteNumber;
      if (n.noteNumber > groupMax) groupMax = n.noteNumber;
    }

    // 計算群組整體允許的最大位移範圍，確保絕對不破壞和弦內部音程差
    const maxAllowedDown = minLimit - groupMin; // <= 0 (例如 0 - 36 = -36)
    const maxAllowedUp = maxLimit - groupMax;   // >= 0 (例如 127 - 100 = +27)

    const actualShift = Math.max(maxAllowedDown, Math.min(maxAllowedUp, semitones));
    const isLimited = actualShift !== semitones;

    if (actualShift === 0) {
      const edgeDesc = semitones > 0 ? '最高音已達上限 (127)' : '最低音已達下限 (0)';
      return {
        success: false,
        notes: notes.map(n => ({ ...n })),
        actualShift: 0,
        isLimited: true,
        isDrumWarning: false,
        message: `⚠️ 音符${edgeDesc}，無法再往該方向移調`,
      };
    }

    const shiftedNotes = notes.map(n => ({
      ...n,
      noteNumber: n.noteNumber + actualShift,
    }));

    return {
      success: true,
      notes: shiftedNotes,
      actualShift,
      isLimited,
      isDrumWarning: false,
      message: isLimited
        ? `移調受邊界限制，實際位移 ${actualShift > 0 ? '+' : ''}${actualShift} 個半音`
        : undefined,
    };
  }

  /**
   * 八度快速升降 (-2, -1, +1, +2 八度)
   */
  public static shiftOctave<T extends TransposableNote>(
    notes: T[],
    octaves: number,
    options?: TransposeOptions
  ): TransposeResult<T> {
    return this.transposeNotes(notes, octaves * 12, options);
  }
}
