/**
 * Frontend RH850 frame parser (mirrors backend/src/plc/rh850FrameParser.ts)
 */

import { FRAME_HEADER } from './rh850Protocol';

function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc & 0xffff;
}

export class Rh850FrameParser {
  private chunks: Uint8Array[] = [];
  private totalLen = 0;

  reset(): void {
    this.chunks = [];
    this.totalLen = 0;
  }

  pushChunk(chunk: Uint8Array): Uint8Array[] {
    this.chunks.push(chunk);
    this.totalLen += chunk.length;
    const frames: Uint8Array[] = [];
    for (;;) {
      const frame = this.extractOneFrame();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  extractOneFrame(): Uint8Array | null {
    this.syncToHeader();
    if (this.totalLen < 6) return null;

    const buf = this.viewBuffer();
    const dataLen = (buf[4] << 8) | buf[5];
    const frameLen = 8 + dataLen;
    if (this.totalLen < frameLen) return null;

    const frame = buf.subarray(0, frameLen);
    const expectedCrc = crc16(frame.subarray(0, frameLen - 2));
    const actualCrc = (frame[frameLen - 2] << 8) | frame[frameLen - 1];
    if (expectedCrc !== actualCrc) {
      this.consume(1);
      return this.extractOneFrame();
    }

    this.consume(frameLen);
    return frame.slice();
  }

  private viewBuffer(): Uint8Array {
    const out = new Uint8Array(this.totalLen);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  private consume(n: number): void {
    let remaining = n;
    while (remaining > 0 && this.chunks.length > 0) {
      const head = this.chunks[0];
      if (head.length <= remaining) {
        remaining -= head.length;
        this.totalLen -= head.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(remaining);
        this.totalLen -= remaining;
        remaining = 0;
      }
    }
  }

  private syncToHeader(): void {
    const header = FRAME_HEADER;
    for (;;) {
      if (this.totalLen < 4) return;
      const buf = this.viewBuffer();
      let idx = -1;
      for (let i = 0; i <= buf.length - 4; i++) {
        if (
          buf[i] === header[0] &&
          buf[i + 1] === header[1] &&
          buf[i + 2] === header[2] &&
          buf[i + 3] === header[3]
        ) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        this.consume(Math.max(0, this.totalLen - 3));
        return;
      }
      if (idx > 0) this.consume(idx);
      return;
    }
  }
}
