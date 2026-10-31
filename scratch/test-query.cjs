const fs = require('fs');

const voices = JSON.parse(fs.readFileSync('./src/core/data/yamaha-voices.ts', 'utf8').includes('rawVoiceData')
  ? fs.readFileSync('./src/core/data/yamaha-sx920-datalist.json', 'utf8')
  : '[]');

// Read the actual searchYamahaVoices from the file
const fileContent = fs.readFileSync('./src/core/data/yamaha-voices.ts', 'utf8');

console.log('Voices count:', voices.length);
