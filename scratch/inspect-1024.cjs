const fs = require('fs');

const buf = fs.readFileSync('public/samples/1024_容易受傷的女人.sty');
console.log('Size of 1024:', buf.length);

// Search for CC 0, CC 32, Program Change events
for (let i = 0; i < buf.length - 10; i++) {
  // Check for CC 0
  if ((buf[i] & 0xf0) === 0xb0 && buf[i+1] === 0) {
    const ch = buf[i] & 0x0f;
    const msb = buf[i+2];
    // Look ahead a few bytes for CC 32
    for (let j = i + 3; j < i + 30 && j < buf.length - 2; j++) {
      if ((buf[j] & 0xf0) === 0xb0 && (buf[j] & 0x0f) === ch && buf[j+1] === 32) {
        const lsb = buf[j+2];
        // Look ahead for PC
        for (let k = j + 3; k < j + 30 && k < buf.length - 1; k++) {
          if ((buf[k] & 0xf0) === 0xc0 && (buf[k] & 0x0f) === ch) {
            const pc = buf[k+1];
            if (lsb === 119) {
              console.log(`Found LSB 119 on Ch ${ch}: MSB=${msb}, LSB=${lsb}, PC=${pc} (1-based: ${pc+1}) at offset ${i}`);
            }
            break;
          }
        }
        break;
      }
    }
  }
}
