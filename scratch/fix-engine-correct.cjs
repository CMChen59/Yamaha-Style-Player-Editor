const fs = require('fs');

const raw = fs.readFileSync('./src/player/sty-playback-engine.ts', 'utf8');
const lines = raw.replace(/\r\n/g, '\n').split('\n');

// 1. Remove the misplaced block from setupSectionMixing
const misplacedStart = lines.findIndex(l => l.includes('// 0. 若使用者已手動設定/覆寫此聲部音色，以使用者的自訂音色為最高優先級！'));
const misplacedEnd = lines.findIndex((l, idx) => idx > misplacedStart && l.includes('continue;'));

if (misplacedStart !== -1 && misplacedEnd !== -1) {
  // also remove the closing brace line
  lines.splice(misplacedStart, misplacedEnd - misplacedStart + 2);
}

// 2. Find setupPartVoices
const partVoicesStart = lines.findIndex(l => l.includes('private setupPartVoices('));
if (partVoicesStart === -1) {
  console.error('Cannot find setupPartVoices');
  process.exit(1);
}

// Find for (let destCh = 8; destCh <= 15; destCh++) AFTER partVoicesStart
const loopIdx = lines.findIndex((l, idx) => idx > partVoicesStart && l.includes('for (let destCh = 8; destCh <= 15; destCh++) {'));
if (loopIdx === -1) {
  console.error('Cannot find destCh loop in setupPartVoices');
  process.exit(1);
}

const overrideBlock = [
  '      // 0. 若使用者已手動設定/覆寫此聲部音色，以使用者的自訂音色為最高優先級！',
  '      if (this.customVoiceOverrides.has(destCh)) {',
  '        const customVoice = this.customVoiceOverrides.get(destCh)!;',
  '        const name = customVoice.chineseName ? `${customVoice.name} (${customVoice.chineseName})` : customVoice.name;',
  '        const info: PartVoiceInfo = {',
  '          channel: destCh,',
  '          msb: customVoice.msb,',
  '          lsb: customVoice.lsb,',
  '          pc: customVoice.pc,',
  '          voiceName: name,',
  '          category: customVoice.category,',
  '        };',
  '        this.partVoices.set(destCh, info);',
  '',
  '        // 同步更新軟體合成器模型',
  '        const synth = this.chordSynths.get(destCh);',
  '        if (synth) {',
  '          synth.setVoice({ category: customVoice.category, id: customVoice.id, name: customVoice.name });',
  '        }',
  '        continue;',
  '      }',
];

lines.splice(loopIdx + 1, 0, ...overrideBlock);

fs.writeFileSync('./src/player/sty-playback-engine.ts', lines.join('\n'), 'utf8');
console.log('Successfully placed override block inside setupPartVoices!');
