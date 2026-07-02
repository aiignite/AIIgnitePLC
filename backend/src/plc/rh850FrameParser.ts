/**
 * Stream-oriented RH850 frame parser for TCP transparent transmission.
 * Frame: 0x55AA55AA | len(2) | controlId | funcCode | index | data | crc16
 */

import { crc16, FRAME_HEADER } from './rh850Protocol';

export class Rh850FrameParser {
  private buffer = Buffer.alloc(0);

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /** Push raw TCP chunk; returns all complete validated frames. */
  pushChunk(chunk: Buffer | Uint8Array): Uint8Array[] {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    const frames: Uint8Array[] = [];
    for (;;) {
      const frame = this.extractOneFrame();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  /** Extract one complete frame or null if insufficient data. */
  extractOneFrame(): Uint8Array | null {
    this.syncToHeader();
    if (this.buffer.length < 6) return null;

    const dataLen = (this.buffer[4] << 8) | this.buffer[5];
    const frameLen = 8 + dataLen;
    if (this.buffer.length < frameLen) return null;

    const frame = this.buffer.subarray(0, frameLen);
    const expectedCrc = crc16(new Uint8Array(frame.subarray(0, frameLen - 2)));
    const actualCrc = (frame[frameLen - 2] << 8) | frame[frameLen - 1];
    if (expectedCrc !== actualCrc) {
      // Bad CRC — skip one byte and retry sync
      this.buffer = this.buffer.subarray(1);
      return this.extractOneFrame();
    }

    this.buffer = this.buffer.subarray(frameLen);
    return new Uint8Array(frame);
  }

  private syncToHeader(): void {
    const header = Buffer.from(FRAME_HEADER);
    while (this.buffer.length >= 4) {
      const idx = this.buffer.indexOf(header);
      if (idx === -1) {
        this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - 3));
        return;
      }
      if (idx > 0) {
        this.buffer = this.buffer.subarray(idx);
      }
      return;
    }
  }
}
