import { Rh850FrameParser } from '../rh850FrameParser';
import { buildPlcStatusFrame } from '../rh850Protocol';

describe('Rh850FrameParser', () => {
  it('parses a complete frame in one chunk', () => {
    const frame = buildPlcStatusFrame();
    const parser = new Rh850FrameParser();
    const frames = parser.pushChunk(Buffer.from(frame));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual(Array.from(frame));
  });

  it('reassembles a frame split across multiple TCP segments', () => {
    const frame = buildPlcStatusFrame();
    const buf = Buffer.from(frame);
    const parser = new Rh850FrameParser();

    const mid = Math.floor(buf.length / 2);
    expect(parser.pushChunk(buf.subarray(0, mid))).toHaveLength(0);
    expect(parser.pushChunk(buf.subarray(mid))).toHaveLength(1);
  });

  it('handles sticky packets (two frames in one chunk)', () => {
    const frame = buildPlcStatusFrame();
    const sticky = Buffer.concat([Buffer.from(frame), Buffer.from(frame)]);
    const parser = new Rh850FrameParser();
    const frames = parser.pushChunk(sticky);
    expect(frames).toHaveLength(2);
  });

  it('skips garbage before header and recovers', () => {
    const frame = buildPlcStatusFrame();
    const garbage = Buffer.from([0x00, 0xff, 0xde, 0xad]);
    const parser = new Rh850FrameParser();
    const frames = parser.pushChunk(Buffer.concat([garbage, Buffer.from(frame)]));
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toBe(0x55);
  });

  it('rejects frame with bad CRC', () => {
    const frame = Buffer.from(buildPlcStatusFrame());
    frame[frame.length - 1] ^= 0xff;
    const parser = new Rh850FrameParser();
    const frames = parser.pushChunk(frame);
    expect(frames).toHaveLength(0);
  });
});
