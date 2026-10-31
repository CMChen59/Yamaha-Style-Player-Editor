const fs = require('fs');

let content = fs.readFileSync('src/core/writer/style-modifier.ts', 'utf8');

const targetStr = `    for (const ch of channelsToCopy) {
      const srcNotes = StyleRemixer.extractSectionChannelNotes(parsed, srcRange.startTick, srcRange.endTick, ch);

      if (srcNotes.length === 0) {
        if (overwrite) {
          this.clearSectionNotes(parsed, targetSec, ch);
        }
        continue;
      }

      const combinedNotes: Array<{ noteNumber: number; relTick: number; durationTicks: number; velocity: number }> = [];
      for (let loop = 0; loop < loopCount; loop++) {
        const loopOffset = loop * srcDur;
        for (const n of srcNotes) {
          const start = n.startTick + loopOffset;
          if (start < targetDur) {
            combinedNotes.push({
              noteNumber: n.note,
              relTick: start,
              durationTicks: Math.min(n.durationTick, targetDur - start),
              velocity: n.velocity,
            });
          }
        }
      }

      const ok = this.replaceSectionChannelNotes(parsed, targetSec, ch, combinedNotes);`;

const replacementStr = `    for (const ch of channelsToCopy) {
      // 依 CASM 路由解析來源段落中的真實 MIDI 通道 (全面相容 SFF1 與 SFF2)
      let srcMidiCh = ch;
      const srcSecLower = srcSec.trim().toLowerCase();
      const srcCasmMap = parsed.casmMappings?.[srcSecLower]
        || parsed.casmMappings?.[srcSecLower.replace(/\\s+/g, '')];
      if (srcCasmMap) {
        for (const [srcStr, dst] of Object.entries(srcCasmMap)) {
          if (dst === ch) {
            srcMidiCh = parseInt(srcStr, 10);
            break;
          }
        }
      }
      let srcNotes = StyleRemixer.extractSectionChannelNotes(parsed, srcRange.startTick, srcRange.endTick, srcMidiCh);
      if (srcNotes.length === 0 && srcMidiCh !== ch) {
        srcNotes = StyleRemixer.extractSectionChannelNotes(parsed, srcRange.startTick, srcRange.endTick, ch);
      }

      if (srcNotes.length === 0) {
        if (overwrite) {
          this.clearSectionNotes(parsed, targetSec, srcMidiCh);
        }
        continue;
      }

      const combinedNotes: Array<{ noteNumber: number; relTick: number; durationTicks: number; velocity: number; sourceChannel?: number }> = [];
      for (let loop = 0; loop < loopCount; loop++) {
        const loopOffset = loop * srcDur;
        for (const n of srcNotes) {
          const start = n.startTick + loopOffset;
          if (start < targetDur) {
            combinedNotes.push({
              noteNumber: n.note,
              relTick: start,
              durationTicks: Math.min(n.durationTick, targetDur - start),
              velocity: n.velocity,
              sourceChannel: srcMidiCh,
            });
          }
        }
      }

      const ok = this.replaceSectionChannelNotes(parsed, targetSec, ch, combinedNotes);`;

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
console.log('Successfully updated cloneSection in style-modifier.ts!');
