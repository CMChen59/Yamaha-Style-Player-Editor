/**
 * 【任務 4-1C 模組一】樂器黃金音域資料庫 (Instrument Sweet-Spot Profile)
 *
 * 真實樂器皆有共鳴最飽滿、表情最自然的「黃金甜區 (Sweet Spot)」。
 * 移調後若旋律超出此範圍，即使音準正確，SX920 取樣也會被過度拉伸 (花栗鼠效應) 而刺耳或混濁。
 * 本表以 `VoiceCategory` 為單位，提供移調時「高八度 / 低八度路線」決策所需的上限、下限與最佳旋律重心。
 */

export interface InstrumentSweetSpot {
  /** 分類識別 (對應 yamaha-voices 的 VoiceCategory) */
  category: string;
  /** 黃金音域下限 (MIDI Note) */
  sweetMin: number;
  /** 黃金音域上限 (MIDI Note)，超過即偏尖銳 */
  sweetMax: number;
  /** 最佳旋律重心 (MIDI Note)，平均音高越靠近越自然 */
  idealCenter: number;
  /** 繁中說明 */
  labelZh: string;
}

const DEFAULT_SWEET_SPOT: InstrumentSweetSpot = {
  category: 'Default',
  sweetMin: 36,  // C2
  sweetMax: 96,  // C7
  idealCenter: 72, // C5
  labelZh: '通用 (鋼琴 / 合成器 / 打擊)',
};

export const INSTRUMENT_SWEET_SPOTS: Record<string, InstrumentSweetSpot> = {
  Guitar:     { category: 'Guitar',     sweetMin: 40, sweetMax: 81, idealCenter: 68, labelZh: '吉他 (E2 ~ A5)' },
  Saxophone:  { category: 'Saxophone',  sweetMin: 46, sweetMax: 86, idealCenter: 74, labelZh: '薩克斯風 (Bb2 ~ D6)' },
  Brass:      { category: 'Brass',      sweetMin: 46, sweetMax: 86, idealCenter: 74, labelZh: '銅管 (Bb2 ~ D6)' },
  Strings:    { category: 'Strings',    sweetMin: 43, sweetMax: 88, idealCenter: 75, labelZh: '弦樂 / 二胡 (G2 ~ E6)' },
  Choir:      { category: 'Choir',      sweetMin: 43, sweetMax: 88, idealCenter: 75, labelZh: '人聲合唱 (G2 ~ E6)' },
  Woodwind:   { category: 'Woodwind',   sweetMin: 60, sweetMax: 91, idealCenter: 79, labelZh: '木管 / 排笛 / 長笛 (C4 ~ G6)' },
  Organ:      { category: 'Organ',      sweetMin: 48, sweetMax: 91, idealCenter: 76, labelZh: '風琴 (C3 ~ G6)' },
  Accordion:  { category: 'Accordion',  sweetMin: 53, sweetMax: 88, idealCenter: 72, labelZh: '手風琴 (F3 ~ E6)' },
  Bass:       { category: 'Bass',       sweetMin: 28, sweetMax: 67, idealCenter: 48, labelZh: '貝斯 (E1 ~ G4)' },
  Piano:      { category: 'Piano',      sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: '鋼琴 (C2 ~ C7)' },
  'E.Piano':  { category: 'E.Piano',    sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: '電鋼琴 (C2 ~ C7)' },
  Synth:      { category: 'Synth',      sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: '合成器 (C2 ~ C7)' },
  Pad:        { category: 'Pad',        sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: '鋪底 (C2 ~ C7)' },
  Percussion: { category: 'Percussion', sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: '旋律打擊 (C2 ~ C7)' },
  Legacy:     { category: 'Legacy',     sweetMin: 36, sweetMax: 96, idealCenter: 72, labelZh: 'GM/XG 經典 (C2 ~ C7)' },
};

/** 取得指定樂器分類的黃金音域；Drums 回傳 null (不適用)，未知分類回傳通用範圍 */
export function getSweetSpotProfile(category: string | undefined | null): InstrumentSweetSpot | null {
  if (!category) return DEFAULT_SWEET_SPOT;
  if (category === 'Drums') return null;
  return INSTRUMENT_SWEET_SPOTS[category] ?? DEFAULT_SWEET_SPOT;
}

/** 單軌路線評估所需的最小資訊 */
export interface SweetSpotTrackInput {
  padNum: number;
  category: string;
  pitchMin: number;
  pitchMax: number;
  avgPitch: number;
}

export interface SweetSpotTrackEvaluation {
  padNum: number;
  category: string;
  sweetMin: number;
  sweetMax: number;
  idealCenter: number;
  newMin: number;
  newMax: number;
  newAvg: number;
  /** 超出上限的半音數 (0 = 在甜區內) */
  overflow: number;
  /** 低於下限的半音數 */
  underflow: number;
  /** 平均音高與最佳重心的距離 (半音) */
  centerDistance: number;
}

export interface SweetSpotRouteEvaluation {
  semitones: number;
  tracks: SweetSpotTrackEvaluation[];
  /** 總違規半音數 (超高 + 過低，越小越好) */
  violation: number;
  /** 各軌重心距離總和 */
  centerDistance: number;
}

/** 評估「整組軌道一起平移 semitones 半音」的聽感品質 */
export function evaluateShiftRoute(tracks: SweetSpotTrackInput[], semitones: number): SweetSpotRouteEvaluation {
  const evals: SweetSpotTrackEvaluation[] = [];
  let violation = 0;
  let centerDistance = 0;
  for (const t of tracks) {
    const p = getSweetSpotProfile(t.category);
    if (!p) continue;
    const newMin = t.pitchMin + semitones;
    const newMax = t.pitchMax + semitones;
    const newAvg = t.avgPitch + semitones;
    const overflow = Math.max(0, newMax - p.sweetMax);
    const underflow = Math.max(0, p.sweetMin - newMin);
    const dist = Math.abs(newAvg - p.idealCenter);
    violation += overflow + underflow;
    centerDistance += dist;
    evals.push({
      padNum: t.padNum,
      category: t.category,
      sweetMin: p.sweetMin,
      sweetMax: p.sweetMax,
      idealCenter: p.idealCenter,
      newMin,
      newMax,
      newAvg,
      overflow,
      underflow,
      centerDistance: dist,
    });
  }
  return { semitones, tracks: evals, violation, centerDistance };
}

/** 重心距離需改善超過此半音數，才會捨棄「向上走」改採「向下走」 (避免無謂降八度、保留明亮度) */
export const CENTER_SWITCH_HYSTERESIS = 4;

export interface SweetSpotRouteDecision {
  semitones: number;
  upSemitones: number;
  downSemitones: number;
  chosen: 'up' | 'down';
  up: SweetSpotRouteEvaluation;
  down: SweetSpotRouteEvaluation;
  reasonZh: string;
}

/**
 * 在「目標調性不變」前提下，於高八度 (up) 與低八度 (down = up - 12) 兩條路線擇一。
 * 判定順序：1) 總違規半音數較少者；2) 違規相同時，重心距離明顯較近者 (需改善 ≥ 4 半音)；3) 否則優先向上。
 * 整組軌道共用同一個結果 (Global Coherent Shift)，確保多軌接力旋律不斷層。
 */
export function decideOctaveRoute(tracks: SweetSpotTrackInput[], upSemitones: number): SweetSpotRouteDecision {
  const downSemitones = upSemitones === 0 ? 0 : upSemitones - 12;
  const up = evaluateShiftRoute(tracks, upSemitones);
  const down = evaluateShiftRoute(tracks, downSemitones);

  let chosen: 'up' | 'down' = 'up';
  let reasonZh: string;
  if (upSemitones === 0) {
    reasonZh = '同調性，無需位移';
  } else if (down.violation < up.violation) {
    chosen = 'down';
    reasonZh = `向上 (+${upSemitones}) 會讓旋律超出樂器黃金音域 ${up.violation} 半音，改走低八度路線 (${downSemitones})`;
  } else if (up.violation < down.violation) {
    reasonZh = `向下 (${downSemitones}) 會讓旋律低於樂器黃金音域 ${down.violation} 半音，維持高八度路線 (+${upSemitones})`;
  } else if (up.centerDistance - down.centerDistance >= CENTER_SWITCH_HYSTERESIS) {
    chosen = 'down';
    reasonZh = `兩路線皆在甜區內，低八度 (${downSemitones}) 更貼近樂器最佳旋律重心`;
  } else {
    reasonZh = `兩路線皆在甜區內，優先採高八度 (+${upSemitones}) 保持明亮音色`;
  }

  return {
    semitones: chosen === 'up' ? upSemitones : downSemitones,
    upSemitones,
    downSemitones,
    chosen,
    up,
    down,
    reasonZh,
  };
}

/**
 * 音軌音符發聲時間區間（Tick 範圍）
 */
export interface TrackTimeSpan {
  startTick: number;
  endTick: number;
}

/**
 * 兩軌或多軌之間的旋律組織關係診斷結果
 */
export interface MultiPadMelodyRelation {
  /** 涉及的 Pad 編號清單 (如 [1, 2]) */
  padNums: number[];
  /** 關係類型：'HOCKET' (交錯接力問答) | 'HARMONY_LAYER' (同時發聲合奏/合音疊音) | 'INDEPENDENT' (獨立無明顯關聯) */
  type: 'HOCKET' | 'HARMONY_LAYER' | 'INDEPENDENT';
  /** 繁中說明 */
  labelZh: string;
  /** 重疊發聲比例 (0.0 ~ 1.0) */
  overlapRatio: number;
  /** 交錯接力切換次數 */
  handoffCount: number;
}

/**
 * 【任務 4-1C 模組二】智慧接力（Hocket）與合奏疊音（Harmony Layer）偵測演算法
 *
 * 判斷邏輯：
 * 1. 若兩軌發聲時間高度交錯（例如 Pad 1 發聲時 Pad 2 休止，Pad 2 發聲時 Pad 1 休止，且時間軸前後銜接），判定為 'HOCKET'（接力旋律）
 * 2. 若兩軌在相同或高度重疊的時間區間內同時發聲（重疊時間佔發聲時間 > 50%），判定為 'HARMONY_LAYER'（合奏/疊音）
 * 3. 否則為 'INDEPENDENT'
 */
export function detectPadTrackRelations(
  trackNotesMap: Map<number, Array<{ startTick: number; durationTick: number }>>
): MultiPadMelodyRelation[] {
  const relations: MultiPadMelodyRelation[] = [];
  const activePadNums = Array.from(trackNotesMap.keys())
    .filter(num => (trackNotesMap.get(num)?.length ?? 0) > 0)
    .sort((a, b) => a - b);

  if (activePadNums.length < 2) {
    return relations;
  }

  // 逐對比對活躍軌道
  for (let i = 0; i < activePadNums.length; i++) {
    for (let j = i + 1; j < activePadNums.length; j++) {
      const padA = activePadNums[i];
      const padB = activePadNums[j];
      const notesA = trackNotesMap.get(padA)!;
      const notesB = trackNotesMap.get(padB)!;

      const spansA: TrackTimeSpan[] = notesA.map(n => ({ startTick: n.startTick, endTick: n.startTick + n.durationTick }));
      const spansB: TrackTimeSpan[] = notesB.map(n => ({ startTick: n.startTick, endTick: n.startTick + n.durationTick }));

      // 計算各自總發聲時長
      const totalDurA = spansA.reduce((acc, s) => acc + (s.endTick - s.startTick), 0);
      const totalDurB = spansB.reduce((acc, s) => acc + (s.endTick - s.startTick), 0);
      if (totalDurA === 0 || totalDurB === 0) continue;

      // 計算重疊發聲時長 (Overlap Duration)
      let overlapTicks = 0;
      for (const sa of spansA) {
        for (const sb of spansB) {
          const overlapStart = Math.max(sa.startTick, sb.startTick);
          const overlapEnd = Math.min(sa.endTick, sb.endTick);
          if (overlapEnd > overlapStart) {
            overlapTicks += (overlapEnd - overlapStart);
          }
        }
      }

      const minDur = Math.min(totalDurA, totalDurB);
      const maxDur = Math.max(totalDurA, totalDurB);
      const overlapRatio = minDur > 0 ? overlapTicks / minDur : 0;
      // 若兩軌長度懸殊 (例如一軌只有 3 顆點綴短音效，另一軌是長旋律)，不應判定為整軌合奏疊音
      const durationRatio = minDur / maxDur;

      // 檢查交錯接力切換次數 (Handoff Count)：
      // 當 A 的音符結束附近 (±240 ticks，即半拍到一拍內)，B 剛好起音；或反之
      let handoffCount = 0;
      const HANDOFF_TOLERANCE = 240; // 允許微幅重疊或微幅呼吸休止
      for (const sa of spansA) {
        for (const sb of spansB) {
          // A 結束 -> B 開始
          if (Math.abs(sb.startTick - sa.endTick) <= HANDOFF_TOLERANCE) {
            handoffCount++;
          }
          // B 結束 -> A 開始
          if (Math.abs(sa.startTick - sb.endTick) <= HANDOFF_TOLERANCE) {
            handoffCount++;
          }
        }
      }

      if (overlapRatio > 0.5 && durationRatio > 0.25) {
        relations.push({
          padNums: [padA, padB],
          type: 'HARMONY_LAYER',
          labelZh: `Pad ${padA} 與 Pad ${padB} 為同步合奏 / 雙軌疊音 (重疊率 ${Math.round(overlapRatio * 100)}%)`,
          overlapRatio,
          handoffCount,
        });
      } else if (handoffCount >= 2 || (handoffCount >= 1 && overlapRatio < 0.25)) {
        relations.push({
          padNums: [padA, padB],
          type: 'HOCKET',
          labelZh: `Pad ${padA} 與 Pad ${padB} 為交錯接力主旋律 (銜接 ${handoffCount} 次)`,
          overlapRatio,
          handoffCount,
        });
      }
    }
  }

  return relations;
}

