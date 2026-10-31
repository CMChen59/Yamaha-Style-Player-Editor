const fs = require('fs');

let content = fs.readFileSync('src/core/writer/style-modifier.ts', 'utf8');

const targetStr = `        if (casmSecMap) {
          for (const [srcStr, dst] of Object.entries(casmSecMap)) {
            if (dst === channel) {
              targetMidiChannel = parseInt(srcStr, 10);
              break;
            }
          }
        }`;

const replacementStr = `        if (casmSecMap) {
          for (const [srcStr, dst] of Object.entries(casmSecMap)) {
            if (dst === channel) {
              targetMidiChannel = parseInt(srcStr, 10);
              break;
            }
          }
          // 若此段落有 CASM 設定，但此聲部未分配任何來源軌道，且 notes 為空：
          // 代表該聲部在該段落中原本就不存在，無須且不應清除任何音軌！
          if (targetMidiChannel === undefined && notes.length === 0) {
            return true;
          }
        }`;

const normalize = (s) => s.replace(/\r\n/g, '\n');
if (!normalize(content).includes(normalize(targetStr))) {
  console.error('Target string not found in style-modifier.ts');
  process.exit(1);
}

const isCRLF = content.includes('\r\n');
content = normalize(content).replace(normalize(targetStr), normalize(replacementStr));
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync('src/core/writer/style-modifier.ts', content, 'utf8');
console.log('Successfully updated style-modifier.ts with CASM unmapped guard!');
