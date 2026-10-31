const fs = require('fs');
const voices = JSON.parse(fs.readFileSync('./src/core/data/yamaha-sx920-datalist.json', 'utf8'));

function search(query) {
  const q = query.trim().toLowerCase();
  const tripletMatch = q.match(/^(\d+)[- ](\d+)[- ](\d*)$/);

  if (tripletMatch) {
    const m = parseInt(tripletMatch[1], 10);
    const l = parseInt(tripletMatch[2], 10);
    const pStr = tripletMatch[3];
    const p = pStr ? parseInt(pStr, 10) : null;

    const matches = [];
    for (const voice of voices) {
      if (voice.msb !== m || voice.lsb !== l) continue;

      if (p === null || pStr === '') {
        // Just M-L- (e.g. "0-119-") -> all voices in this bank!
        matches.push(voice);
      } else {
        const pc1 = voice.pc + 1;
        const pc0 = voice.pc;
        // Exact match OR prefix match
        const isExact1 = pc1 === p;
        const isExact0 = pc0 === p;
        const isPrefix1 = pc1.toString().startsWith(pStr);
        const isPrefix0 = pc0.toString().startsWith(pStr);

        if (isExact1 || isExact0 || isPrefix1 || isPrefix0) {
          matches.push(voice);
        }
      }
    }

    // Sort order:
    // 1. Exact 1-based
    // 2. Exact 0-based
    // 3. Prefix 1-based
    // 4. Prefix 0-based
    // Then by PC ascending
    if (p !== null) {
      matches.sort((a, b) => {
        const a1 = (a.pc + 1) === p;
        const b1 = (b.pc + 1) === p;
        if (a1 && !b1) return -1;
        if (!a1 && b1) return 1;

        const a0 = a.pc === p;
        const b0 = b.pc === p;
        if (a0 && !b0) return -1;
        if (!a0 && b0) return 1;

        const ap1 = (a.pc + 1).toString().startsWith(pStr);
        const bp1 = (b.pc + 1).toString().startsWith(pStr);
        if (ap1 && !bp1) return -1;
        if (!ap1 && bp1) return 1;

        return a.pc - b.pc;
      });
    }

    return matches;
  }
  return [];
}

console.log('Query: "0-119-8"');
const res8 = search('0-119-8');
console.log(res8.map(v => `${v.name} (M:${v.msb} L:${v.lsb} PC_raw:${v.pc} PC_screen:${v.pc+1})`));

console.log('\nQuery: "0-119-89"');
const res89 = search('0-119-89');
console.log(res89.map(v => `${v.name} (M:${v.msb} L:${v.lsb} PC_raw:${v.pc} PC_screen:${v.pc+1})`));

console.log('\nQuery: "0-119-"');
const resDash = search('0-119-');
console.log('Count for 0-119-:', resDash.length);
