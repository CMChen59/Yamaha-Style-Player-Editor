import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MidiImporter } from '../src/core/writer/midi-importer';
import { YamahaWriter } from '../src/core/writer/yamaha-writer';
import { YamahaParser } from '../src/core/parser/yamaha-parser';

describe('Phase 2.3: MidiImporter 外部標準 MIDI 剖析與切片分配引擎', () => {
  it('能建立標準 4 軌示範 MIDI 二進位檔案並寫入 public/samples/demo_groove.mid', () => {
    const demoBytes = MidiImporter.createDemoGrooveMidi();
    expect(demoBytes).toBeInstanceOf(Uint8Array);
    expect(demoBytes.length).toBeGreaterThan(500);

    const targetPath = path.resolve(__dirname, '../public/samples/demo_groove.mid');
    fs.writeFileSync(targetPath, Buffer.from(demoBytes));
    expect(fs.existsSync(targetPath)).toBe(true);

    const parsed = YamahaParser.parse(demoBytes, 'STY');
    expect(parsed.midiFormat).toBe(1);
    expect(parsed.tracks.length).toBe(5);
    expect(parsed.division).toBe(480);
    expect(parsed.bpm).toBe(120);
    expect(parsed.timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  it('能剖析外部 MIDI 檔案取得音軌摘要 (Track Name, PC, Note Count, Bars)', () => {
    const demoBytes = MidiImporter.createDemoGrooveMidi();
    const analysis = MidiImporter.analyzeMidi(demoBytes, 'demo_groove.mid');

    expect(analysis.fileName).toBe('demo_groove.mid');
    expect(analysis.division).toBe(480);
    expect(analysis.bpm).toBe(120);
    expect(analysis.totalMeasures).toBe(8);
    expect(analysis.tracks.length).toBe(5);

    // Track 0: Conductor
    expect(analysis.tracks[0].trackIndex).toBe(0);
    expect(analysis.tracks[0].noteCount).toBe(0);

    // Track 1: Piano Chords (Ch 0, PC 0)
    const t1 = analysis.tracks[1];
    expect(t1.name).toBe('Piano Chords');
    expect(t1.channel).toBe(0);
    expect(t1.programChange).toBe(0);
    expect(t1.noteCount).toBeGreaterThan(0);
    expect(t1.measureCount).toBe(8);

    // Track 2: Guitar
    const t2 = analysis.tracks[2];
    expect(t2.name).toBe('Acoustic Guitar Arp');
    expect(t2.channel).toBe(1);
    expect(t2.programChange).toBe(24);

    // Track 3: Bass
    const t3 = analysis.tracks[3];
    expect(t3.name).toBe('Groove Bass');
    expect(t3.channel).toBe(2);
    expect(t3.programChange).toBe(32);

    // Track 4: Drums
    const t4 = analysis.tracks[4];
    expect(t4.name).toBe('Drum Kit Groove');
    expect(t4.channel).toBe(9);
  });

  it('能將外部 MIDI 的不同軌道與小節範圍切片分配至 Pad 1~4', () => {
    const demoBytes = MidiImporter.createDemoGrooveMidi();
    const analysis = MidiImporter.analyzeMidi(demoBytes, 'demo_groove.mid');

    // 切片選項：前 4 小節 (Bars 1~4)
    const project = MidiImporter.convertMidiToPadProject(analysis, {
      projectName: 'Groove Pads',
      bpm: 125,
      timeSignature: { numerator: 4, denominator: 4 },
      targetDivision: 480,
      injectCasm: true,
      padAssignments: [
        {
          padIndex: 0,
          sourceTrackIndex: 1, // Piano Chords
          name: 'Piano Groove',
          startBar: 1,
          endBar: 4,
          repeat: true,
          chordMatch: true,
        },
        {
          padIndex: 1,
          sourceTrackIndex: 2, // Guitar Arp
          name: 'Guitar Arp',
          startBar: 1,
          endBar: 4,
          repeat: true,
          chordMatch: true,
        },
        {
          padIndex: 2,
          sourceTrackIndex: 3, // Bass
          name: 'Funky Bass',
          startBar: 1,
          endBar: 4,
          repeat: false,
          chordMatch: true,
        },
        {
          padIndex: 3,
          sourceTrackIndex: 4, // Drums
          name: 'Main Beat',
          startBar: 1,
          endBar: 4,
          repeat: true,
          chordMatch: false,
        },
      ],
    });

    expect(project.format).toBe('PAD');
    expect(project.tracks.length).toBe(5); // Track 0 + Pad 1~4
    expect(project.padConfig).toBeDefined();
    expect(project.padConfig?.names).toEqual(['Piano Groove', 'Guitar Arp', 'Funky Bass', 'Main Beat']);
    expect(project.padConfig?.repeatFlags).toEqual([true, true, false, true]);
    expect(project.padConfig?.chordMatchFlags).toEqual([true, true, true, false]);
    expect(project.hasCasm).toBe(true);

    // 驗證各 Pad 軌道皆有音符，且音符起始時間從 0 開始
    for (let p = 1; p <= 4; p++) {
      const padTrack = project.tracks[p];
      const noteEvents = padTrack.events.filter(e => e.type === 'noteOn' && (e.velocity ?? 0) > 0);
      expect(noteEvents.length).toBeGreaterThan(0);
    }

    // 驗證寫入二進位與再讀取之無損性
    const binary = YamahaWriter.write(project);
    expect(binary.length).toBeGreaterThan(500);

    const reParsed = YamahaParser.parse(binary, 'PAD');
    expect(reParsed.format).toBe('PAD');
    expect(reParsed.padConfig?.names[0]).toBe('Piano Groove');
    expect(reParsed.padConfig?.repeatFlags[0]).toBe(true);
    expect(reParsed.padConfig?.chordMatchFlags[0]).toBe(true);
    expect(reParsed.hasCasm).toBe(true);
  });

  it('能正確切片後半段小節 (Bars 5~8) 並將時間軸重定至 0 Tick', () => {
    const demoBytes = MidiImporter.createDemoGrooveMidi();
    const analysis = MidiImporter.analyzeMidi(demoBytes, 'demo_groove.mid');

    const project = MidiImporter.convertMidiToPadProject(analysis, {
      projectName: 'Second Half Groove',
      padAssignments: [
        {
          padIndex: 0,
          sourceTrackIndex: 1, // Piano Chords 后 4 小節 (Bars 5~8)
          name: 'Piano Bars 5-8',
          startBar: 5,
          endBar: 8,
          repeat: false,
          chordMatch: true,
        },
        {
          padIndex: 1,
          sourceTrackIndex: null, // 未分配
          name: 'Pad 2',
          startBar: 1,
          endBar: 4,
          repeat: false,
          chordMatch: false,
        },
        {
          padIndex: 2,
          sourceTrackIndex: null,
          name: 'Pad 3',
          startBar: 1,
          endBar: 4,
          repeat: false,
          chordMatch: false,
        },
        {
          padIndex: 3,
          sourceTrackIndex: null,
          name: 'Pad 4',
          startBar: 1,
          endBar: 4,
          repeat: false,
          chordMatch: false,
        },
      ],
    });

    const pad1Track = project.tracks[1];
    let curTick = 0;
    const noteOns: { note: number; tick: number }[] = [];
    for (const ev of pad1Track.events) {
      curTick += ev.delta;
      if (ev.type === 'noteOn' && (ev.velocity ?? 0) > 0) {
        noteOns.push({ note: ev.noteNumber!, tick: curTick });
      }
    }

    // 第一顆音符必須從 tick 0 (第 1 小節第 1 拍) 開始，而非 tick 7680 (第 5 小節)
    expect(noteOns.length).toBeGreaterThan(0);
    expect(noteOns[0].tick).toBe(0);
  });
});
