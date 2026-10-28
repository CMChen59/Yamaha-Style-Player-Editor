const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'samples', 'CHINA Ballad.T547.sty');
const outputPath = path.join(__dirname, '..', 'src', 'core', 'data', 'yamaha-style-template-base64.ts');

const buf = fs.readFileSync(inputPath);
const b64 = buf.toString('base64');

const tsContent = `// Base64-encoded Golden Style Template (Native Yamaha PSR-SX920 Official SFF2 Template)
// Source: CHINA Ballad.T547.sty (1920 PPQ, 4-bar Mains, 100% 8-channel SFF2 CASM covering Intro A, Ending A, Main A-D, Fills)
export const GOLDEN_STYLE_TEMPLATE_BASE64 = '${b64}';
`;

fs.writeFileSync(outputPath, tsContent);
console.log('Successfully generated:', outputPath, 'Length:', b64.length);
