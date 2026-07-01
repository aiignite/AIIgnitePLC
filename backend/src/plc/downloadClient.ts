/**
 * UART3 download frame builder for RH850 master controller
 * Frame: 0x55AA55AA | len | controlId | funcCode | index | data | crc16
 */

const FRAME_HEADER = [0x55, 0xaa, 0x55, 0xaa];
const COMMAND_PLC_DOWNLOAD = 0x68;
const PLC_DL_SUB_BEGIN = 0x01;
const PLC_DL_SUB_CHUNK = 0x02;
const PLC_DL_SUB_END = 0x03;

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

function buildFrame(funcCode: number, index: number, payload: Uint8Array): Uint8Array {
  const dataLen = 3 + payload.length; // index implicit in layout: controlId+func+index + payload
  const frameLen = 4 + 2 + 1 + 1 + 1 + payload.length + 2;
  const frame = new Uint8Array(frameLen);
  let o = 0;
  frame.set(FRAME_HEADER, o);
  o += 4;
  frame[o++] = (dataLen >> 8) & 0xff;
  frame[o++] = dataLen & 0xff;
  frame[o++] = 0x01; // controlId local
  frame[o++] = funcCode;
  frame[o++] = index;
  frame.set(payload, o);
  o += payload.length;
  const crc = crc16(frame.subarray(0, o));
  frame[o++] = (crc >> 8) & 0xff;
  frame[o++] = crc & 0xff;
  return frame;
}

export interface DownloadSession {
  frames: Uint8Array[];
  totalBytes: number;
}

export function buildDownloadSession(binary: Uint8Array, chunkSize = 512): DownloadSession {
  const frames: Uint8Array[] = [];
  const crc32 = new DataView(binary.buffer, binary.byteOffset, binary.byteLength).getUint32(
    12,
    false
  );

  const beginPayload = new Uint8Array(7);
  beginPayload[0] = PLC_DL_SUB_BEGIN;
  beginPayload[1] = (binary.length >> 8) & 0xff;
  beginPayload[2] = binary.length & 0xff;
  beginPayload[3] = (crc32 >> 24) & 0xff;
  beginPayload[4] = (crc32 >> 16) & 0xff;
  beginPayload[5] = (crc32 >> 8) & 0xff;
  beginPayload[6] = crc32 & 0xff;
  frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, beginPayload));

  for (let off = 0; off < binary.length; off += chunkSize) {
    const chunk = binary.subarray(off, Math.min(off + chunkSize, binary.length));
    const payload = new Uint8Array(1 + chunk.length);
    payload[0] = PLC_DL_SUB_CHUNK;
    payload.set(chunk, 1);
    frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, payload));
  }

  const endPayload = new Uint8Array([PLC_DL_SUB_END]);
  frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, endPayload));

  return { frames, totalBytes: binary.length };
}

export function framesToHex(frames: Uint8Array[]): string {
  return frames.map(f => Buffer.from(f).toString('hex')).join('\n');
}
