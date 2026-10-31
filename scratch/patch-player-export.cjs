const fs = require('fs');

let content = fs.readFileSync('src/player/player-app.ts', 'utf8');

const targetStr = `      // 1. 同步當前段落所有聲部的即時事件與混音音量
      const currentSec = styPlaybackEngine.getCurrentSection()?.name;
      if (currentSec) {
        for (let ch = 8; ch <= 15; ch++) {
          const events = styPlaybackEngine.getChannelEvents(ch);
          YamahaStyleModifier.replaceSectionChannelNotes(
            this.currentParsed,
            currentSec,
            ch,
            events
          );
          const vol = styPlaybackEngine.getChannelVolume(ch);
          YamahaStyleModifier.setPartMixing(this.currentParsed, ch, { volume: vol });
        }
      }`;

const replacementStr = `      // 1. 同步當前段落所有聲部的即時事件與混音音量 (含 CASM 來源通道同步)
      const currentSec = styPlaybackEngine.getCurrentSection()?.name;
      if (currentSec) {
        const secNameLower = currentSec.toLowerCase();
        const casmSecMap = this.currentParsed.casmMappings?.[secNameLower]
          || this.currentParsed.casmMappings?.[secNameLower.replace(/\\s+/g, '')];

        for (let ch = 8; ch <= 15; ch++) {
          const events = styPlaybackEngine.getChannelEvents(ch);
          YamahaStyleModifier.replaceSectionChannelNotes(
            this.currentParsed,
            currentSec,
            ch,
            events
          );
          const vol = styPlaybackEngine.getChannelVolume(ch);
          YamahaStyleModifier.setPartMixing(this.currentParsed, ch, { volume: vol });

          if (casmSecMap) {
            for (const [srcStr, dst] of Object.entries(casmSecMap)) {
              if (dst === ch) {
                const srcCh = parseInt(srcStr, 10);
                YamahaStyleModifier.setPartMixing(this.currentParsed, srcCh, { volume: vol });
              }
            }
          }
        }
      }`;

const normalize = (s) => s.replace(/\r\n/g, '\n');
if (!normalize(content).includes(normalize(targetStr))) {
  console.error('Target string not found in player-app.ts');
  process.exit(1);
}

const isCRLF = content.includes('\r\n');
content = normalize(content).replace(normalize(targetStr), normalize(replacementStr));
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync('src/player/player-app.ts', content, 'utf8');
console.log('Successfully updated player-app.ts with CASM source channel volume sync in exportCurrentStyle!');
