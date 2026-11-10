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

  public writeBytes(bytes: Uint8Array | number[]): void {
    if (!bytes) return;
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (buf.length === 0) return;
    this.chunks.push(buf);
  }

  /**
   * 寫入 MIDI 變長數值 (Variable-Length Quantity, VLQ)
   * 遵循標準 MIDI 規格 (最大 0x0FFFFFFF)，並防禦負數與 NaN 死循環
   */
  public writeVarInt(value: number): void {
    let val = Math.max(0, Math.floor(isNaN(value) ? 0 : value)) & 0x0fffffff;
    const bytes: number[] = [val & 0x7f];

    while ((val >>= 7) > 0) {
      bytes.unshift((val & 0x7f) | 0x80);
    }

    this.writeBytes(new Uint8Array(bytes));
  }

  public toUint8Array(): Uint8Array {
    let actualTotal = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (!chunk || typeof chunk.length !== 'number' || isNaN(chunk.length)) {
        console.error(`Invalid chunk detected at ${i}:`, chunk);
      } else {
        actualTotal += chunk.length;
      }
    }
    const result = new Uint8Array(actualTotal);
    let offset = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (chunk && chunk.length > 0) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
    }
    return result;
  }
}
