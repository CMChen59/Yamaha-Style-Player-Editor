// Auto-generated Golden Yamaha Style Template for PSR-SX920 / SX900
// SFF2 format, 1920 PPQ, 100% verified on physical Yamaha PSR-SX920 keyboard
import { GOLDEN_STYLE_TEMPLATE_BASE64 } from './yamaha-style-template-base64';

export { GOLDEN_STYLE_TEMPLATE_BASE64 };

export function getGoldenStyleTemplateBytes(): Uint8Array {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.Buffer) {
    return new Uint8Array(g.Buffer.from(GOLDEN_STYLE_TEMPLATE_BASE64, 'base64'));
  }
  const binaryStr = atob(GOLDEN_STYLE_TEMPLATE_BASE64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}
