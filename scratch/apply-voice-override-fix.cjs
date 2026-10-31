const fs = require('fs');

let content = fs.readFileSync('./src/player/sty-playback-engine.ts', 'utf8');

// 1. Add customVoiceOverrides property
const propTarget = `  private chordSynths: Map<number, ChordSynth> = new Map();
  private partVoices: Map<number, PartVoiceInfo> = new Map();`;

const newProp = `  private chordSynths: Map<number, ChordSynth> = new Map();
  private partVoices: Map<number, PartVoiceInfo> = new Map();
  // 使用者手動自訂音色覆寫 (Channel 8~15，保證使用者手動切換音色後不被段落切換或 CASM 覆蓋)
  private customVoiceOverrides: Map<number, YamahaVoice> = new Map();`;

content = content.replace(propTarget, newProp);

// 2. In loadParsed, clear customVoiceOverrides
const loadParsedTarget = `  public loadParsed(parsed: YamahaFileParsed) {
    this.parsed = parsed;`;

const newLoadParsed = `  public loadParsed(parsed: YamahaFileParsed) {
    this.parsed = parsed;
    this.customVoiceOverrides.clear();`;

content = content.replace(loadParsedTarget, newLoadParsed);

// 3. In setChannelVoice, save to customVoiceOverrides
const setVoiceTarget = `  public setChannelVoice(channel: number, voice: YamahaVoice) {
    const name = voice.chineseName ? \`\${voice.name} (\${voice.chineseName})\` : voice.name;`;

const newSetVoice = `  public setChannelVoice(channel: number, voice: YamahaVoice) {
    this.customVoiceOverrides.set(channel, voice);
    const name = voice.chineseName ? \`\${voice.name} (\${voice.chineseName})\` : voice.name;`;

content = content.replace(setVoiceTarget, newSetVoice);

// 4. In setupPartVoices, check customVoiceOverrides at the start of loop
const loopTarget = `    // 映射各聲部音色 (以 Yamaha CASM 路由為最高優先準則)
    for (let destCh = 8; destCh <= 15; destCh++) {
      let matchedSrc: number | undefined;`;

const newLoop = `    // 映射各聲部音色 (以 Yamaha CASM 路由為最高優先準則)
    for (let destCh = 8; destCh <= 15; destCh++) {
      // 0. 若使用者已手動設定/覆寫此聲部音色，以使用者的自訂音色為最高優先級！
      if (this.customVoiceOverrides.has(destCh)) {
        const customVoice = this.customVoiceOverrides.get(destCh)!;
        const name = customVoice.chineseName ? \`\${customVoice.name} (\${customVoice.chineseName})\` : customVoice.name;
        const info: PartVoiceInfo = {
          channel: destCh,
          msb: customVoice.msb,
          lsb: customVoice.lsb,
          pc: customVoice.pc,
          voiceName: name,
          category: customVoice.category,
        };
        this.partVoices.set(destCh, info);

        // 同步更新軟體合成器模型
        const synth = this.chordSynths.get(destCh);
        if (synth) {
          synth.setVoice({ category: customVoice.category, id: customVoice.id, name: customVoice.name });
        }
        continue;
      }

      let matchedSrc: number | undefined;`;

content = content.replace(loopTarget, newLoop);

// 5. In previewVoicePhrase, update synth.setVoice for Web Audio preview
const previewTarget = `  public previewVoicePhrase(channel: number, voice: YamahaVoice) {
    const isDrum = voice.category === 'Drums' || voice.category === 'Percussion' || channel === 8 || channel === 9;

    if (this.outputMode === 'midi' && midiManager.getSelectedOutput()) {
      // 送出音色切換
      midiManager.sendVoiceChange(channel, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
    }

    if (isDrum) {`;

const newPreview = `  public previewVoicePhrase(channel: number, voice: YamahaVoice) {
    const isDrum = voice.category === 'Drums' || voice.category === 'Percussion' || channel === 8 || channel === 9;

    if (this.outputMode === 'midi' && midiManager.getSelectedOutput()) {
      // 送出音色切換
      midiManager.sendVoiceChange(channel, { msb: voice.msb, lsb: voice.lsb, pc: voice.pc });
    }

    // 在 Web Audio 模式下，即時切換該聲部合成器聲音模型為當前試聽音色！
    const synth = this.chordSynths.get(channel);
    if (synth) {
      synth.setVoice({ category: voice.category, id: voice.id, name: voice.name });
    }

    if (isDrum) {`;

content = content.replace(previewTarget, newPreview);

fs.writeFileSync('./src/player/sty-playback-engine.ts', content, 'utf8');
console.log('Successfully updated sty-playback-engine.ts with customVoiceOverrides and audition fixes!');
