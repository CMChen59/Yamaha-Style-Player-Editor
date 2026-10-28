import * as fs from 'fs';
import * as path from 'path';

const origBuf = fs.readFileSync('public/samples/4006_SX900.T547.sty');
const hotelBuf = fs.readFileSync(path.join(process.env.USERPROFILE || '', 'Downloads', 'edited_伤心酒店 Style.sty'));

function findCasm(buf: Buffer) {
  const idx = buf.indexOf(Buffer.from('CASM'));
  if (idx < 0) return null;
  const len = buf.readUInt32BE(idx + 4);
  return buf.subarray(idx, idx + 8 + len);
}

const c1 = findCasm(origBuf);
const c2 = findCasm(hotelBuf);

console.log('Orig CASM length:', c1?.length);
console.log('Hotel CASM length:', c2?.length);

if (c1) console.log('Orig first 128 bytes:\n', c1.subarray(0, 128).toString('binary').replace(/[^\x20-\x7E]/g, '.'));
if (c2) console.log('Hotel first 128 bytes:\n', c2.subarray(0, 128).toString('binary').replace(/[^\x20-\x7E]/g, '.'));

// Let's dump all ASCII tags of length >= 4
function dumpTags(c: Buffer, name: string) {
  console.log(`\n--- Tags in ${name} ---`);
  let cur = 0;
  while (cur < c.length - 4) {
    const tag = c.subarray(cur, cur + 4).toString('ascii');
    if (/^[A-Za-z0-9_ ]{4}$/.test(tag)) {
      const len = c.readUInt32BE(cur + 4);
      console.log(`Tag at offset ${cur}: "${tag}", claimed len=${len}`);
      if (['Cseg', 'SSet', 'CSET', 'Ctbl', 'Cntt'].includes(tag.trim())) {
        cur += 8;
        continue;
      }
    }
    cur++;
  }
}

if (c1) dumpTags(c1, 'Orig');
if (c2) dumpTags(c2, 'Hotel');
