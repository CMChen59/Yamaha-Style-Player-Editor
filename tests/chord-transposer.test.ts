import { describe, it, expect } from 'vitest';
import { ChordTransposer, POPULAR_AUDITION_CHORDS } from '../src/core/writer/chord-transposer';
import type { NoteEvent } from '../src/core/audio/audio-engine';

describe('ChordTransposer 虛擬和弦即時轉調引擎測試', () => {
  it('1. 鼓組打擊樂 (Ch 8 / Ch 9 / isDrum=true) 必須保持原音，絕對不轉調 (Bypass)', () => {
    const drumNotes: NoteEvent[] = [
      { note: 36, velocity: 100, startTick: 0, durationTick: 120 }, // 大鼓
      { note: 38, velocity: 90, startTick: 240, durationTick: 120 }, // 小鼓
      { note: 42, velocity: 80, startTick: 480, durationTick: 120 }, // 閉鈸
    ];

    const chordAm = ChordTransposer.buildChord('A', 'm');
    const resultCh9 = ChordTransposer.transposeNotes(drumNotes, chordAm, 9, true);
    expect(resultCh9[0].note).toBe(36);
    expect(resultCh9[1].note).toBe(38);
    expect(resultCh9[2].note).toBe(42);

    const chordG = ChordTransposer.buildChord('G', 'maj');
    const resultCh8 = ChordTransposer.transposeNotes(drumNotes, chordG, 8, false);
    expect(resultCh8[0].note).toBe(36);
    expect(resultCh8[1].note).toBe(38);
  });

  it('2. 原調 C 大三和弦時，所有非打擊樂聲部維持原始音符', () => {
    const pianoNotes: NoteEvent[] = [
      { note: 60, velocity: 100, startTick: 0, durationTick: 240 }, // C4
      { note: 64, velocity: 100, startTick: 0, durationTick: 240 }, // E4
      { note: 67, velocity: 100, startTick: 0, durationTick: 240 }, // G4
    ];

    const chordC = ChordTransposer.buildChord('C', 'maj');
    const result = ChordTransposer.transposeNotes(pianoNotes, chordC, 11, false);
    expect(result[0].note).toBe(60);
    expect(result[1].note).toBe(64);
    expect(result[2].note).toBe(67);
  });

  it('3. 轉為小三和弦 (如 C -> Am) 時，根音正確位移且大三度音 (E) 降為小三度 (Eb)', () => {
    // 假設原伴奏為 C 和弦: C4(60), E4(64), G4(67)
    const chordNotes: NoteEvent[] = [
      { note: 60, velocity: 90, startTick: 0, durationTick: 240 }, // C4
      { note: 64, velocity: 90, startTick: 0, durationTick: 240 }, // E4 (三度音)
      { note: 67, velocity: 90, startTick: 0, durationTick: 240 }, // G4 (五度音)
    ];

    // Am: 根音 A (相對於 C 為 -3 半音)，且為小和弦 (m)
    // C4(60) - 3 = A3(57)
    // E4(64) - 3 - 1 (小三度變形) = C4(60)
    // G4(67) - 3 = E4(64)
    // 結果和弦為: A3(57), C4(60), E4(64) -> 正好是標準 Am 和弦組音 (A-C-E)！
    const chordAm = ChordTransposer.buildChord('A', 'm');
    const result = ChordTransposer.transposeNotes(chordNotes, chordAm, 11, false);

    expect(result[0].note).toBe(57); // A
    expect(result[1].note).toBe(60); // C
    expect(result[2].note).toBe(64); // E
  });

  it('4. Bass 聲部 (Ch 10) 正確跟隨根音轉調並進行八度音域折返保護', () => {
    // 原始 C 基準 Bass: C2 (36)
    const bassNotes: NoteEvent[] = [
      { note: 36, velocity: 100, startTick: 0, durationTick: 480 },
    ];

    // 轉調為 G (相對於 C 為 -5 半音)
    // 36 - 5 = 31 (G1)，介於 28~55 之間，合法
    const chordG = ChordTransposer.buildChord('G', 'maj');
    const resultG = ChordTransposer.transposeNotes(bassNotes, chordG, 10, false);
    expect(resultG[0].note).toBe(31);

    // 轉調為 F (相對於 C 為 +5 半音)
    // 36 + 5 = 41 (F2)，介於 28~55 之間，合法
    const chordF = ChordTransposer.buildChord('F', 'maj');
    const resultF = ChordTransposer.transposeNotes(bassNotes, chordF, 10, false);
    expect(resultF[0].note).toBe(41);
  });

  it('5. 屬七和弦 (如 C7) 將大七度 (B, pitchClass=11) 降為小七度 (Bb, pitchClass=10)', () => {
    // 包含七度音 B4 (71)
    const maj7Notes: NoteEvent[] = [
      { note: 60, velocity: 80, startTick: 0, durationTick: 240 }, // C4
      { note: 71, velocity: 80, startTick: 0, durationTick: 240 }, // B4
    ];

    const chordC7 = ChordTransposer.buildChord('C', '7');
    const result = ChordTransposer.transposeNotes(maj7Notes, chordC7, 11, false);
    expect(result[0].note).toBe(60); // C
    expect(result[1].note).toBe(70); // Bb (71 - 1 = 70)
  });

  it('6. POPULAR_AUDITION_CHORDS 包含常見流行音樂常用和弦清單', () => {
    expect(POPULAR_AUDITION_CHORDS.length).toBeGreaterThanOrEqual(10);
    const chordNames = POPULAR_AUDITION_CHORDS.map((c) => c.displayName);
    expect(chordNames).toContain('C (原調)');
    expect(chordNames).toContain('Am');
    expect(chordNames).toContain('F');
    expect(chordNames).toContain('G');
    expect(chordNames).toContain('Dm');
    expect(chordNames).toContain('G7');
  });

  it('7. 設定 NTR = Root Fixed 且 NTT = Bypass (Phrase 1/2 原音直通) 時，無論和弦為何均嚴格保持原音', () => {
    // 模擬《傷心酒店》Phrase 1 笛子前奏音符: Eb5 (75), D5 (74), C5 (72)
    const fluteNotes: NoteEvent[] = [
      { note: 75, velocity: 100, startTick: 0, durationTick: 240 },
      { note: 74, velocity: 90, startTick: 240, durationTick: 240 },
      { note: 72, velocity: 95, startTick: 480, durationTick: 480 },
    ];

    const chordsToTest = [
      ChordTransposer.buildChord('F', 'maj'),
      ChordTransposer.buildChord('G', '7'),
      ChordTransposer.buildChord('A', 'm'),
      ChordTransposer.buildChord('C', 'm'),
      ChordTransposer.buildChord('D', 'm7'),
    ];

    for (const chord of chordsToTest) {
      const resPhrase1 = ChordTransposer.transposeNotes(
        fluteNotes,
        chord,
        14, // Phrase 1: Ch 15
        false,
        0,
        127,
        'Root Fixed',
        'Bypass'
      );

      expect(resPhrase1[0].note).toBe(75);
      expect(resPhrase1[1].note).toBe(74);
      expect(resPhrase1[2].note).toBe(72);
    }
  });
});

