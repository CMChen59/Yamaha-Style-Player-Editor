const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../src/core/writer/chord-transposer.ts');
let code = fs.readFileSync(targetPath, 'utf-8');

// 1. 在 if (targetChord.type === 'dim' && pitchClass === 7) 後插入 pitchClass === 11 調和
const target1 = "if (targetChord.type === 'dim' && pitchClass === 7) {\n            scaleShift = -1;\n          }";
const target1Crlf = "if (targetChord.type === 'dim' && pitchClass === 7) {\r\n            scaleShift = -1;\r\n          }";

const insert1 = "\n          // ★ 關鍵消除 G# 衝突 (Minor Harmonization) ★\n          if (pitchClass === 11) {\n            const isRootFixedTrack = ntr === 1 || ntr === 'Root Fixed';\n            scaleShift = isRootFixedTrack ? +1 : -1;\n          }";

if (code.includes(target1)) {
  code = code.replace(target1, target1 + insert1);
  console.log('Target 1 LF replaced');
} else if (code.includes(target1Crlf)) {
  code = code.replace(target1Crlf, target1Crlf + insert1.replace(/\n/g, '\r\n'));
  console.log('Target 1 CRLF replaced');
} else {
  console.log('Target 1 not found');
}

// 2. 替換 rootShift 與判斷邏輯
const target2 = "const rootShift = targetChord.semitonesFromC;";
const replace2 = "const isRootFixed = ntr === 1 || ntr === 'Root Fixed';\n    const rootShift = isRootFixed ? 0 : targetChord.semitonesFromC;";

if (code.includes(target2)) {
  code = code.replace(target2, replace2);
  console.log('Target 2 replaced');
} else {
  console.log('Target 2 not found');
}

// 3. 替換 if (targetChord.semitonesFromC === 0 && scaleShift === 0)
const target3 = "if (targetChord.semitonesFromC === 0 && scaleShift === 0) {";
const replace3 = "if (rootShift === 0 && scaleShift === 0) {";

if (code.includes(target3)) {
  code = code.replace(target3, replace3);
  console.log('Target 3 replaced');
} else {
  console.log('Target 3 not found');
}

// 4. 在 let newPitch = pitch + rootShift + scaleShift; 後加入和弦吸附
const target4 = "let newPitch = pitch + rootShift + scaleShift;";
const insert4 = `
    // 4. NTT = 2 / 130 (Chord) 和弦音智慧吸附保護 (Chord Tone Snapping)
    const isChordNtt = ntt === 2 || ntt === 130 || ntt === 'Chord';
    if (isChordNtt && !isDrum && channel !== 9 && channel !== 10) {
      const targetRootPc = ((targetChord.semitonesFromC % 12) + 12) % 12;
      const notePc = ((newPitch % 12) + 12) % 12;
      const relPc = ((notePc - targetRootPc) + 12) % 12;
      if (targetChord.type === 'maj') {
        if (relPc === 11) newPitch += 1; // 大七度吸附至根音 (+1 半音)
      } else if (targetChord.type === 'm') {
        if (relPc === 8) newPitch -= 1;  // 雙重保險：消除 G# (8) -> 吸附至五度音 (7)
        else if (relPc === 11) newPitch -= 1; // 大七度 (11) 吸附至小七度 (10)
      }
    }`;

if (code.includes(target4)) {
  code = code.replace(target4, target4 + insert4);
  console.log('Target 4 replaced');
} else {
  console.log('Target 4 not found');
}

// 5. isChordPart 加上 !isRootFixed
const target5 = "} else if (isChordPart) {";
const replace5 = "} else if (isChordPart && !isRootFixed) {";
if (code.includes(target5)) {
  code = code.replace(target5, replace5);
  console.log('Target 5 replaced');
} else {
  console.log('Target 5 not found');
}

fs.writeFileSync(targetPath, code, 'utf-8');
console.log('Successfully patched chord-transposer.ts');
