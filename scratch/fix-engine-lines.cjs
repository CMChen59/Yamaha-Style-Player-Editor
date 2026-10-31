const fs = require('fs');

const raw = fs.readFileSync('./src/player/sty-playback-engine.ts', 'utf8');
const lines = raw.replace(/\r\n/g, '\n').split('\n');

// 1. Add property after private partVoices: Map<number, PartVoiceInfo> = new Map();
const propIdx = lines.findIndex(l => l.includes('private partVoices: Map<number, PartVoiceInfo> = new Map();'));
if (propIdx === -1) {
  console.error('Cannot find partVoices property');
  process.exit(1);
}
lines.splice(propIdx + 1, 0, '  private customVoiceOverrides: Map<number, YamahaVoice> = new Map();');

// 2. In loadParsed, add this.customVoiceOverrides.clear();
const loadParsedIdx = lines.findIndex(l => l.includes('public loadParsed(parsed: YamahaFileParsed) {'));
if (loadParsedIdx === -1) {
  console.error('Cannot find loadParsed');
  process.exit(1);
}
lines.splice(loadParsedIdx + 2, 0, '    this.customVoiceOverrides.clear();');

// 3. In setChannelVoice, add this.customVoiceOverrides.set(channel, voice);
const setVoiceIdx = lines.findIndex(l => l.includes('public setChannelVoice(channel: number, voice: YamahaVoice) {'));
if (setVoiceIdx === -1) {
  console.error('Cannot find setChannelVoice');
  process.exit(1);
}
lines.splice(setVoiceIdx + 1, 0, '    this.customVoiceOverrides.set(channel, voice);');

// 4. In setupPartVoices, check customVoiceOverrides at the start of destCh loop
const loopIdx = lines.findIndex(l => l.includes('for (let destCh = 8; destCh <= 15; destCh++) {'));
if (loopIdx === -1) {
  console.error('Cannot find destCh loop');
  process.exit(1);
}

const overrideBlock = [
  '      // 0. 若使用者已手動設定/覆寫此聲部音色，以使用者的自訂音色為最高優先級！',
  '      if (this.customVoiceOverrides.has(destCh)) {',
  '        const customVoice = this.customVoiceOverrides.get(destCh)!;',
  '        const name = customVoice.chineseName ? `${customVoice.name} (${customVoice.chineseName})` : customVoice.name;',
  '        const info: PartVoiceInfo = {',
  '          channel: destCh;',
  '          msb: customVoice.msb;',
  '          lsb: customVoice.lsb;',
  '          pc: customVoice.pc;',
  '          voiceName: name;',
  '          category: customVoice.category;',
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
// Wait, in PartVoiceInfo object literal, use commas not semicolons!
const correctedOverrideBlock = [
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
lines.splice(loopIdx + 1, 0, ...correctedOverrideBlock);

// 5. In previewVoicePhrase, update synth.setVoice for Web Audio preview
const previewIdx = lines.findIndex(l => l.includes('public previewVoicePhrase(channel: number, voice: YamahaVoice) {'));
if (previewIdx === -1) {
  console.error('Cannot find previewVoicePhrase');
  process.exit(1);
}

const previewBlock = [
  '    // 在 Web Audio 模式下，即時切換該聲部合成器聲音模型為當前試聽音色！',
  '    const synth = this.chordSynths.get(channel);',
  '    if (synth) {',
  '      synth.setVoice({ category: voice.category, id: voice.id, name: voice.name });',
  '    }',
];
lines.splice(previewIdx + 2, 0, ...previewBlock);

fs.writeFileSync('./src/player/sty-playback-engine.ts', lines.join('\n'), 'utf8');
console.log('Successfully patched sty-playback-engine.ts');
