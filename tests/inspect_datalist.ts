import * as fs from 'fs';
import * as path from 'path';

const data = JSON.parse(fs.readFileSync('src/core/data/yamaha-sx920-datalist.json', 'utf8'));
console.log('Total voices in Data List:', data.length);

const msb0 = data.filter((v: any) => v.msb === 0);
console.log('Voices with MSB === 0:', msb0.length);

const lsbSet = new Set(msb0.map((v: any) => v.lsb));
console.log('LSB values used when MSB === 0:', Array.from(lsbSet).sort((a: any, b: any) => a - b));

const lsb112 = data.filter((v: any) => v.lsb === 112);
console.log('Voices with LSB === 112:', lsb112.length);
if (lsb112.length > 0) {
  console.log('Sample of LSB 112:', lsb112.slice(0, 10));
}

// Check what Bass, Guitar, Strings, Piano voices exist
console.log('\n--- Common Voices in SX920 Data List ---');
console.log('Grand Piano:', data.filter((v: any) => v.name.toLowerCase().includes('grand piano') || v.name.toLowerCase().includes('cfx')).slice(0, 5));
console.log('Finger Bass:', data.filter((v: any) => v.name.toLowerCase().includes('finger bass') || (v.category === 'Bass' && v.pc === 33)).slice(0, 5));
console.log('Nylon Guitar:', data.filter((v: any) => v.name.toLowerCase().includes('nylon') || (v.category === 'Guitar' && v.pc === 24)).slice(0, 5));

console.log('\n--- All MSB 0 LSB 112 voices in datalist ---');
const v112 = data.filter((v: any) => v.msb === 0 && v.lsb === 112);
console.log('Total MSB 0 LSB 112 count:', v112.length);
console.log(v112.map((v: any) => `PC ${v.pc.toString().padStart(3, ' ')}: ${v.name} (${v.category})`).join('\n'));


