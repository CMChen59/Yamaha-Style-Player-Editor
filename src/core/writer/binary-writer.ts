/**
 * 二進位緩衝區寫入器 (Binary Writer)
 * 用於精確構建 SMF MIDI 與 Yamaha 專屬結構
 */

export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private totalLength: number = 0;

  public writeUint8(value: number): void {
    const buf = new Uint8Array(1);
    buf[0] = value & 0xff;
    this.chunks.push(buf);
    this.totalLength += 1;
  }

  public writeUint16BE(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    view.setUint16(0, value, false);
    this.chunks.push(buf);
    this.totalLength += 2;
  }

  public writeUint32BE(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, false);
    this.chunks.push(buf);
    this.totalLength += 4;
  }

  public writeString(str: string): void {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i);
    }
    this.chunks.push(buf);
    this.totalLength += buf.length;
  }

  public writeBytes(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.chunks.push(bytes);
    this.totalLength += bytes.length;
  }

  /**
   * 寫入 MIDI 變長數值 (Variable-Length Quantity, VLQ)
   */
  public writeVarInt(value: number): void {
    let buffer = value & 0x7f;
    const bytes: number[] = [];

    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= (value & 0x7f) | 0x80;
    }

    while (true) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) {
        buffer >>= 8;
      } else {
        break;
      }
    }

    this.writeBytes(new Uint8Array(bytes));
  }

  public toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
