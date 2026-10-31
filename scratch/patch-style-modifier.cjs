const fs = require('fs');

let content = fs.readFileSync('src/core/writer/style-modifier.ts', 'utf8');

const oldBlock = `    // 決定寫入 MIDI Track 之通道
    const targetMidiChannel = targetChannelOverride !== undefined
      ? targetChannelOverride
      : (notes.length > 0 && notes[0].sourceChannel !== undefined ? notes[0].sourceChannel : channel);

    // 需自段落中清除的舊音符通道集合 (包含目標通道與其 SFF1/SFF2 鏡像通道)
    const clearChannels = new Set<number>([targetMidiChannel, channel]);
    if (channel >= 8) clearChannels.add(channel - 8);
    if (channel < 8) clearChannels.add(channel + 8);
    notes.forEach(n => {
      if (n.sourceChannel !== undefined) clearChannels.add(n.sourceChannel);
    });`;

const newBlock = `    // 決定寫入 MIDI Track 之通道 (精確支援 CASM 路由與 SFF1/SFF2 來源通道)
    let targetMidiChannel = targetChannelOverride;
    if (targetMidiChannel === undefined) {
      if (notes.length > 0 && notes[0].sourceChannel !== undefined) {
        targetMidiChannel = notes[0].sourceChannel;
      } else {
        const secNameLower = sectionName.toLowerCase();
        const casmSecMap = parsed.casmMappings?.[secNameLower]
          || parsed.casmMappings?.[secNameLower.replace(/\\s+/g, '')];
        if (casmSecMap) {
          for (const [srcStr, dst] of Object.entries(casmSecMap)) {
            if (dst === channel) {
              targetMidiChannel = parseInt(srcStr, 10);
              break;
            }
          }
        }
        if (targetMidiChannel === undefined) {
          // 若無 CASM 路由，查核 SFF1 傳統通道反推
          const sff1FallbackMap: Record<number, number> = { 10: 1, 11: 2, 12: 3, 13: 4, 14: 5, 15: 6, 8: 8, 9: 9 };
          targetMidiChannel = sff1FallbackMap[channel] ?? channel;
        }
      }
    }

    // 需自段落中清除的舊音符通道集合 (僅清除實際寫入之通道與音符原本所屬的來源通道，絕不盲目增減 8，避免誤刪相鄰聲部！)
    const clearChannels = new Set<number>([targetMidiChannel]);
    notes.forEach(n => {
      if (n.sourceChannel !== undefined) clearChannels.add(n.sourceChannel);
    });`;

const normalize = (s) => s.replace(/\r\n/g, '\n');
if (!normalize(content).includes(normalize(oldBlock))) {
  console.error('Failed to find oldBlock in style-modifier.ts');
  process.exit(1);
}

const isCRLF = content.includes('\r\n');
content = normalize(content).replace(normalize(oldBlock), normalize(newBlock));
if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync('src/core/writer/style-modifier.ts', content, 'utf8');
console.log('Successfully updated replaceSectionChannelNotes in style-modifier.ts!');
