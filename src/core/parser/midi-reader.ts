/**
 * 二進位緩衝區讀取器 (Binary Reader)
 * 用於精確讀取 MIDI 與 Yamaha 專屬資料結構
 */

export class BinaryReader {
  private view: DataView;
  private offset: number = 0;

  constructor(private buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  public get position(): number {
    return this.offset;
  }

  public set position(pos: number) {
    if (pos < 0 || pos > this.buffer.byteLength) {
      throw new Error(`Offset out of bounds: ${pos}`);
    }
    this.offset = pos;
  }

  public get length(): number {
    return this.buffer.byteLength;
  }

  public hasMore(bytes: number = 1): boolean {
    return this.offset + bytes <= this.buffer.byteLength;
  }

  public readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  public readUint16BE(): number {
    const val = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return val;
  }

  public readUint32BE(): number {
    const val = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return val;
  }

  public readString(length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(this.readUint8());
    }
    return str;
  }

  public readBytes(length: number): Uint8Array {
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /**
   * 讀取 MIDI 變長數值 (Variable-Length Quantity, VLQ)
   */
  public readVarInt(): number {
    let result = 0;
    while (true) {
      const byte = this.readUint8();
      result = (result << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    return result;
  }

  /**
   * 查看接下來 n 個字節而不移動游標 (Peek)
   */
  public peekString(length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      if (this.offset + i < this.buffer.byteLength) {
        str += String.fromCharCode(this.buffer[this.offset + i]);
      }
    }
    return str;
  }
}
