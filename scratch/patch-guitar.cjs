const fs = require('fs');
let code = fs.readFileSync('src/core/writer/chord-transposer.ts', 'utf8');

const target = `    const voicing = ChordTransposer.getGuitarVoicing(targetChord);

    // 2. 虛擬弦位觸發碼轉換
    switch (pitch) {
      case 48: // Root Note trigger (和弦根音弦)
        return voicing.strings[6 - voicing.rootString];
      case 49: // 5th Note trigger (和弦五度音弦)
        return voicing.strings[6 - voicing.fifthString];
      case 50: // String 6 (第 6 弦，最低音 E 弦)
      case 51:
        return voicing.strings[0];
      case 52: // String 5 (第 5 弦，A 弦)
        return voicing.strings[1];
      case 53: // String 4 (第 4 弦，D 弦)
      case 54:
        return voicing.strings[2];
      case 55: // String 3 (第 3 弦，G 弦)
      case 56:
        return voicing.strings[3];
      case 57: // String 2 (第 2 弦，B 弦)
      case 58:
        return voicing.strings[4];
      case 59: // String 1 (第 1 弦，最高音 E 弦)
        return voicing.strings[5];
      default:
        // 若非 48~59 虛擬弦位碼，例如掃弦或高音旋律填音 (60~89)，進行安全標準移調
        return ChordTransposer.transposeSingleNote(pitch, targetChord, 12, false, 0, 127, 'Root Transpose', 'Chord');
    }`;

const replacement = `    const voicing = ChordTransposer.getGuitarVoicing(targetChord);
    const pc = ((pitch % 12) + 12) % 12;

    // 2. 虛擬弦位觸發碼轉換 (依據 Yamaha SFF-GE 專利規範，各八度音名均映射至對應弦位)
    // B (11) -> 第 1 弦 (最高音 E 弦)
    // A (9)  -> 第 2 弦 (B 弦)
    // G (7)  -> 第 3 弦 (G 弦)
    // F (5)  -> 第 4 弦 (D 弦)
    // E (4)  -> 第 5 弦 (A 弦)
    // D (2)  -> 第 6 弦 (最低音 E 弦)
    // C# (1) -> 和弦五度音弦 (5th)
    // C (0)  -> 和弦根音弦 (Root)
    switch (pc) {
      case 0: // C: Root Note trigger (和弦根音弦)
        return voicing.strings[6 - voicing.rootString];
      case 1: // C#: 5th Note trigger (和弦五度音弦)
        return voicing.strings[6 - voicing.fifthString];
      case 2: // D: String 6 (第 6 弦，最低音 E 弦)
      case 3:
        return voicing.strings[0];
      case 4: // E: String 5 (第 5 弦，A 弦)
        return voicing.strings[1];
      case 5: // F: String 4 (第 4 弦，D 弦)
      case 6:
        return voicing.strings[2];
      case 7: // G: String 3 (第 3 弦，G 弦)
      case 8:
        return voicing.strings[3];
      case 9: // A: String 2 (第 2 弦，B 弦)
      case 10:
        return voicing.strings[4];
      case 11: // B: String 1 (第 1 弦，最高音 E 弦)
        return voicing.strings[5];
      default:
        return ChordTransposer.transposeSingleNote(pitch, targetChord, 12, false, 0, 127, 'Root Transpose', 'Chord');
    }`;

const normalize = (s) => s.replace(/\r\n/g, '\n');
const codeNorm = normalize(code);
const targetNorm = normalize(target);
const replNorm = normalize(replacement);

if (codeNorm.includes(targetNorm)) {
  const isCrlf = code.includes('\r\n');
  const patched = codeNorm.replace(targetNorm, replNorm);
  fs.writeFileSync('src/core/writer/chord-transposer.ts', isCrlf ? patched.replace(/\n/g, '\r\n') : patched);
  console.log('Successfully patched chord-transposer.ts!');
} else {
  console.error('Target not found!');
  process.exit(1);
}
