const fs = require('fs');
const voices = JSON.parse(fs.readFileSync('./src/core/data/yamaha-sx920-datalist.json', 'utf8'));

// Recreate search index logic with 1-based additions
const searchCache = [];
for (const voice of voices) {
  const pc1 = voice.pc + 1;
  const searchTokens = [
    voice.name.toLowerCase(),
    voice.chineseName ? voice.chineseName.toLowerCase() : '',
    voice.category.toLowerCase(),
    voice.type ? voice.type.toLowerCase() : '',
    // 0-based
    `${voice.msb}-${voice.lsb}-${voice.pc}`,
    `${voice.msb} ${voice.lsb} ${voice.pc}`,
    `pc:${voice.pc}`,
    `pc ${voice.pc}`,
    voice.pc.toString(),
    // 1-based
    `${voice.msb}-${voice.lsb}-${pc1}`,
    `${voice.msb} ${voice.lsb} ${pc1}`,
    `pc:${pc1}`,
    `pc ${pc1}`,
    pc1.toString(),
    voice.icon.toLowerCase(),
    voice.suitability || '',
  ].join(' ');
  searchCache.push({ voice, searchStr: searchTokens });
}

function search(query, category) {
  const q = query.trim().toLowerCase();
  const tripletMatch = q.match(/^(\d+)[- ](\d+)[- ](\d+)$/);

  if (tripletMatch) {
    const m = parseInt(tripletMatch[1], 10);
    const l = parseInt(tripletMatch[2], 10);
    const p = parseInt(tripletMatch[3], 10);

    const matches = [];
    for (const item of searchCache) {
      const { voice } = item;
      // Match 1-based (screen) or 0-based (raw MIDI)
      if (voice.msb === m && voice.lsb === l && ((voice.pc + 1) === p || voice.pc === p)) {
        matches.push(voice);
      }
    }
    // Sort: 1-based first, then 0-based
    matches.sort((a, b) => {
      const a1 = (a.pc + 1) === p;
      const b1 = (b.pc + 1) === p;
      if (a1 && !b1) return -1;
      if (!a1 && b1) return 1;
      return 0;
    });
    return matches;
  }

  const queryTokens = q ? q.split(/\s+/).filter(t => t.length > 0) : [];
  const results = [];
  for (const item of searchCache) {
    const { voice, searchStr } = item;
    if (category !== 'ALL' && voice.category !== category) continue;
    let matched = true;
    for (const t of queryTokens) {
      if (!searchStr.includes(t)) {
        matched = false;
        break;
      }
    }
    if (matched) results.push(voice);
  }

  return results;
}

console.log('Query: "0-119-89":');
console.log(search('0-119-89', 'Percussion').map(v => `${v.name} (Cat: ${v.category}, M:${v.msb} L:${v.lsb} PC_raw:${v.pc} PC_screen:${v.pc+1})`));

console.log('\nQuery: "0-0-12":');
console.log(search('0-0-12', 'ALL').map(v => `${v.name} (Cat: ${v.category}, M:${v.msb} L:${v.lsb} PC_raw:${v.pc} PC_screen:${v.pc+1})`));
