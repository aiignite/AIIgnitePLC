/**
 * Frontend RH850 protocol helpers (mirrors backend/src/plc/rh850Protocol.ts)
 */

export const FRAME_HEADER = [0x55, 0xaa, 0x55, 0xaa] as const;
export const COMMAND_PLC_CONTROL = 0x69;
export const COMMAND_PLC_STATUS = 0x6a;
export const COMMAND_PLC_FORCE = 0x6b;
export const COMMAND_PLC_MONITOR = 0x6d;
export const PLC_CTRL_START = 0x01;
export const PLC_CTRL_STOP = 0x02;
export const PLC_CTRL_RESET = 0x03;

export const PLC_ERR_MESSAGES: Record<number, string> = {
  0x0000: 'OK',
  0x0701: 'PLC not ready',
  0x0702: 'Download in progress',
  0x0703: 'Download CRC mismatch',
  0x0704: 'Download size invalid',
  0x0705: 'Scan overrun',
  0x0706: 'No program loaded',
  0x0707: 'Force I/O invalid',
};

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

export function buildFrame(funcCode: number, index: number, payload: Uint8Array): Uint8Array {
  const dataLen = 3 + payload.length;
  const frame = new Uint8Array(4 + 2 + 1 + 1 + 1 + payload.length + 2);
  let o = 0;
  frame.set(FRAME_HEADER, o);
  o += 4;
  frame[o++] = (dataLen >> 8) & 0xff;
  frame[o++] = dataLen & 0xff;
  frame[o++] = 0x01;
  frame[o++] = funcCode;
  frame[o++] = index;
  frame.set(payload, o);
  o += payload.length;
  const c = crc16(frame.subarray(0, o));
  frame[o++] = (c >> 8) & 0xff;
  frame[o++] = c & 0xff;
  return frame;
}

export function hexToFrames(hex: string): Uint8Array[] {
  return hex
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const bytes = new Uint8Array(line.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(line.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    });
}

export function framesToHex(frames: Uint8Array[]): string {
  return frames.map(f => Array.from(f, b => b.toString(16).padStart(2, '0')).join('')).join('\n');
}

export interface ParsedPlcStatus {
  mode: number;
  scanMs: number;
  lastScanUs: number;
  errorCode: number;
  errorMessage: string;
}

export function parsePlcStatusResponse(frame: Uint8Array): ParsedPlcStatus | null {
  if (frame.length < 16) return null;
  const errorCode = (frame[14] << 8) | frame[15];
  return {
    mode: frame[9],
    scanMs: (frame[10] << 8) | frame[11],
    lastScanUs: (frame[12] << 8) | frame[13],
    errorCode,
    errorMessage: PLC_ERR_MESSAGES[errorCode] || `Unknown 0x${errorCode.toString(16)}`,
  };
}

export function parseMonitorResponse(frame: Uint8Array): boolean | null {
  if (frame.length < 11) return null;
  return frame[10] !== 0;
}

export function buildPlcControlFrame(action: number): Uint8Array {
  return buildFrame(COMMAND_PLC_CONTROL, 0, new Uint8Array([action]));
}

export function buildPlcStatusFrame(): Uint8Array {
  return buildFrame(COMMAND_PLC_STATUS, 0, new Uint8Array(0));
}

export function buildForceFrame(
  memClass: number,
  byteOffset: number,
  bitOffset: number,
  value: boolean,
  enable: boolean
): Uint8Array {
  const payload = new Uint8Array(6);
  payload[0] = memClass;
  payload[1] = (byteOffset >> 8) & 0xff;
  payload[2] = byteOffset & 0xff;
  payload[3] = bitOffset;
  payload[4] = value ? 1 : 0;
  payload[5] = enable ? 1 : 0;
  return buildFrame(COMMAND_PLC_FORCE, 0, payload);
}

export function buildSlaveMapFrame(
  enabled: number,
  slaveAddr: number,
  diRegAddr: number,
  doRegAddr: number,
  index = 0,
  ioBytes = 2
): Uint8Array {
  const payload = new Uint8Array(7);
  payload[0] = enabled ? 1 : 0;
  payload[1] = slaveAddr;
  payload[2] = (diRegAddr >> 8) & 0xff;
  payload[3] = diRegAddr & 0xff;
  payload[4] = (doRegAddr >> 8) & 0xff;
  payload[5] = doRegAddr & 0xff;
  payload[6] = ioBytes;
  return buildFrame(0x6f, index, payload);
}

export function buildMonitorFrame(
  memClass: number,
  byteOffset: number,
  bitOffset: number
): Uint8Array {
  const payload = new Uint8Array(4);
  payload[0] = memClass;
  payload[1] = (byteOffset >> 8) & 0xff;
  payload[2] = byteOffset & 0xff;
  payload[3] = bitOffset;
  return buildFrame(COMMAND_PLC_MONITOR, 0, payload);
}

export async function sendFrame(
  transport: import('./rh850Transport').Rh850Transport,
  frame: Uint8Array,
  delayMs = 20
): Promise<void> {
  await transport.sendFrame(frame, delayMs);
}

export async function readFrame(
  transport: import('./rh850Transport').Rh850Transport,
  timeoutMs = 500
): Promise<Uint8Array | null> {
  return transport.readFrame(timeoutMs);
}

/** @deprecated Use readFrame */
export async function readResponse(
  transport: import('./rh850Transport').Rh850Transport,
  timeoutMs = 500
): Promise<Uint8Array | null> {
  return readFrame(transport, timeoutMs);
}

export async function deployViaTransport(
  transport: import('./rh850Transport').Rh850Transport,
  downloadHex: string,
  deployHex?: string,
  onProgress?: (pct: number, msg: string) => void
): Promise<void> {
  const allHex = deployHex || downloadHex;
  const frames = hexToFrames(allHex);
  const total = frames.length;
  for (let i = 0; i < total; i++) {
    await sendFrame(transport, frames[i], 15);
    onProgress?.(Math.round(((i + 1) / total) * 100), `Sent frame ${i + 1}/${total}`);
  }
}

/** @deprecated Use deployViaTransport */
export async function deployViaSerial(
  transport: import('./rh850Transport').Rh850Transport,
  downloadHex: string,
  deployHex?: string,
  onProgress?: (pct: number, msg: string) => void
): Promise<void> {
  return deployViaTransport(transport, downloadHex, deployHex, onProgress);
}
