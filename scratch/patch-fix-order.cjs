const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../src/core/writer/chord-transposer.ts');
let code = fs.readFileSync(targetPath, 'utf-8');

// 把 554~560 行調換順序
const wrongBlock = `    // 若半音位移為 0 且無音階調整，直接回傳原音
    if (rootShift === 0 && scaleShift === 0) {
      return pitch;
    }

    const isRootFixed = ntr === 1 || ntr === 'Root Fixed';
    const rootShift = isRootFixed ? 0 : targetChord.semitonesFromC;`;

const correctBlock = `    const isRootFixed = ntr === 1 || ntr === 'Root Fixed';
    const rootShift = isRootFixed ? 0 : targetChord.semitonesFromC;

    // 若半音位移為 0 且無音階調整，直接回傳原音
    if (rootShift === 0 && scaleShift === 0) {
      return pitch;
    }`;

if (code.includes(wrongBlock)) {
  code = code.replace(wrongBlock, correctBlock);
  console.log('Fixed LF');
} else if (code.includes(wrongBlock.replace(/\n/g, '\r\n'))) {
  code = code.replace(wrongBlock.replace(/\n/g, '\r\n'), correctBlock.replace(/\n/g, '\r\n'));
  console.log('Fixed CRLF');
} else {
  console.log('wrongBlock not found');
}

fs.writeFileSync(targetPath, code, 'utf-8');
console.log('Done');
