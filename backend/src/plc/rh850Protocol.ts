/**
 * RH850 UART3 protocol — frame builder & parser
 * Frame: 0x55AA55AA | len(2) | controlId | funcCode | index | data | crc16
 */

import { PLC_ERR_MESSAGES, REG_PLC_MODE_OFFSET, REG_PLC_SCAN_MS_OFFSET } from './plcLimits';

export const FRAME_HEADER = [0x55, 0xaa, 0x55, 0xaa] as const;
export const CONTROL_ID_LOCAL = 0x01;

export const COMMAND_READ_REG = 0x64;
export const COMMAND_WRITE_REG = 0x65;
export const COMMAND_PLC_DOWNLOAD = 0x68;
export const COMMAND_PLC_CONTROL = 0x69;
export const COMMAND_PLC_STATUS = 0x6a;
export const COMMAND_PLC_FORCE = 0x6b;
export const COMMAND_PLC_INFO = 0x6c;
export const COMMAND_PLC_MONITOR = 0x6d;
export const COMMAND_PLC_JSON = 0x6e;
export const COMMAND_PLC_SLAVE_MAP = 0x6f;

export const PLC_DL_SUB_BEGIN = 0x01;
export const PLC_DL_SUB_CHUNK = 0x02;
export const PLC_DL_SUB_END = 0x03;
export const PLC_DL_SUB_ABORT = 0x04;

export const PLC_CTRL_START = 0x01;
export const PLC_CTRL_STOP = 0x02;
export const PLC_CTRL_RESET = 0x03;
export const PLC_CTRL_SELECT_OB = 0x04;

export const PLCF_BLOCK_OB = 1;
export const PLCF_BLOCK_FC = 2;
export const PLCF_BLOCK_FB = 3;
export const PLCF_BLOCK_SFC = 4;

export function crc16(data: Uint8Array): number {
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
  const frameLen = 4 + 2 + 1 + 1 + 1 + payload.length + 2;
  const frame = new Uint8Array(frameLen);
  let o = 0;
  frame.set(FRAME_HEADER, o);
  o += 4;
  frame[o++] = (dataLen >> 8) & 0xff;
  frame[o++] = dataLen & 0xff;
  frame[o++] = CONTROL_ID_LOCAL;
  frame[o++] = funcCode;
  frame[o++] = index;
  frame.set(payload, o);
  o += payload.length;
  const c = crc16(frame.subarray(0, o));
  frame[o++] = (c >> 8) & 0xff;
  frame[o++] = c & 0xff;
  return frame;
}

export function buildWriteRegFrame(regAddr: number, value: number, index = 0): Uint8Array {
  const payload = new Uint8Array(6);
  payload[0] = (regAddr >> 8) & 0xff;
  payload[1] = regAddr & 0xff;
  payload[2] = 0x00;
  payload[3] = 0x01;
  payload[4] = (value >> 8) & 0xff;
  payload[5] = value & 0xff;
  return buildFrame(COMMAND_WRITE_REG, index, payload);
}

export function buildPlcControlFrame(action: number, index = 0): Uint8Array {
  return buildFrame(COMMAND_PLC_CONTROL, index, new Uint8Array([action]));
}

export function buildSelectObFrame(slotId: number, index = 0): Uint8Array {
  return buildFrame(COMMAND_PLC_CONTROL, index, new Uint8Array([PLC_CTRL_SELECT_OB, slotId]));
}

export function buildMultiBlockDeploySession(
  blocks: Array<{ binary: Uint8Array; meta: DownloadBlockMeta }>,
  scanMs = 10,
  chunkSize = 512
): FullDeploySession {
  const allFrames: Uint8Array[] = [];
  let totalBytes = 0;
  for (const block of blocks) {
    const session = buildDownloadSession(block.binary, chunkSize, {
      ...block.meta,
      scanMs: block.meta.scanMs ?? scanMs,
    });
    allFrames.push(...session.frames);
    totalBytes += session.totalBytes;
  }
  const enableFrames = [
    buildWriteRegFrame(REG_PLC_MODE_OFFSET, 1),
    buildWriteRegFrame(REG_PLC_SCAN_MS_OFFSET, scanMs),
  ];
  return {
    frames: allFrames,
    totalBytes,
    enableFrames,
    startFrame: buildPlcControlFrame(PLC_CTRL_START),
  };
}

export function buildPlcStatusFrame(index = 0): Uint8Array {
  return buildFrame(COMMAND_PLC_STATUS, index, new Uint8Array(0));
}

export function buildForceFrame(
  memClass: number,
  byteOffset: number,
  bitOffset: number,
  value: number,
  enable: number,
  index = 0
): Uint8Array {
  const payload = new Uint8Array(6);
  payload[0] = memClass;
  payload[1] = (byteOffset >> 8) & 0xff;
  payload[2] = byteOffset & 0xff;
  payload[3] = bitOffset;
  payload[4] = value ? 1 : 0;
  payload[5] = enable ? 1 : 0;
  return buildFrame(COMMAND_PLC_FORCE, index, payload);
}

export function buildMonitorFrame(
  memClass: number,
  byteOffset: number,
  bitOffset: number,
  index = 0
): Uint8Array {
  const payload = new Uint8Array(4);
  payload[0] = memClass;
  payload[1] = (byteOffset >> 8) & 0xff;
  payload[2] = byteOffset & 0xff;
  payload[3] = bitOffset;
  return buildFrame(COMMAND_PLC_MONITOR, index, payload);
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
  return buildFrame(COMMAND_PLC_SLAVE_MAP, index, payload);
}

export interface ChainRegSegment {
  boardId: number;
  regAddr: number;
  regCount: number;
  writeData?: number[];
}

export const CONTROL_ID_FORWARD = 0x00;
export const COMMAND_MASTER_READ_REG = 0x44;
export const COMMAND_MASTER_WRITE_REG = 0x46;

export function buildFrameWithControlId(
  controlId: number,
  funcCode: number,
  index: number,
  payload: Uint8Array
): Uint8Array {
  const dataLen = 3 + payload.length;
  const frameLen = 4 + 2 + 1 + 1 + 1 + payload.length + 2;
  const frame = new Uint8Array(frameLen);
  let o = 0;
  frame.set(FRAME_HEADER, o);
  o += 4;
  frame[o++] = (dataLen >> 8) & 0xff;
  frame[o++] = dataLen & 0xff;
  frame[o++] = controlId;
  frame[o++] = funcCode;
  frame[o++] = index;
  frame.set(payload, o);
  o += payload.length;
  const c = crc16(frame.subarray(0, o));
  frame[o++] = (c >> 8) & 0xff;
  frame[o++] = c & 0xff;
  return frame;
}

export function buildReadRegFrame(regAddr: number, regCount = 1, index = 0): Uint8Array {
  const payload = new Uint8Array(4);
  payload[0] = (regAddr >> 8) & 0xff;
  payload[1] = regAddr & 0xff;
  payload[2] = (regCount >> 8) & 0xff;
  payload[3] = regCount & 0xff;
  return buildFrame(COMMAND_READ_REG, index, payload);
}

function buildChainRegPayload(
  slaveNum: number,
  segments: ChainRegSegment[],
  isWrite: boolean
): Uint8Array {
  let size = 1;
  for (const seg of segments) {
    size += 6;
    if (isWrite && seg.writeData) size += seg.writeData.length * 2;
  }
  const payload = new Uint8Array(size);
  let o = 0;
  payload[o++] = slaveNum;
  for (const seg of segments) {
    payload[o++] = (seg.boardId >> 8) & 0xff;
    payload[o++] = seg.boardId & 0xff;
    payload[o++] = (seg.regAddr >> 8) & 0xff;
    payload[o++] = seg.regAddr & 0xff;
    payload[o++] = (seg.regCount >> 8) & 0xff;
    payload[o++] = seg.regCount & 0xff;
    if (isWrite && seg.writeData) {
      for (const val of seg.writeData) {
        payload[o++] = (val >> 8) & 0xff;
        payload[o++] = val & 0xff;
      }
    }
  }
  return payload;
}

export function buildSlaveChainReadFrame(
  slaveNum: number,
  segments: ChainRegSegment[],
  index = 0
): Uint8Array {
  return buildFrameWithControlId(
    CONTROL_ID_FORWARD,
    COMMAND_MASTER_READ_REG,
    index,
    buildChainRegPayload(slaveNum, segments, false)
  );
}

export function buildSlaveChainWriteFrame(
  slaveNum: number,
  segments: ChainRegSegment[],
  index = 0
): Uint8Array {
  return buildFrameWithControlId(
    CONTROL_ID_FORWARD,
    COMMAND_MASTER_WRITE_REG,
    index,
    buildChainRegPayload(slaveNum, segments, true)
  );
}

export function buildSlaveMapFramesFromChain(
  chain: Array<{
    chainPos: number;
    enabled: boolean;
    diRegAddr: number;
    doRegAddr: number;
    ioBytes?: number;
  }>
): Uint8Array[] {
  return chain
    .filter(e => e.enabled)
    .map((e, idx) =>
      buildSlaveMapFrame(1, e.chainPos, e.diRegAddr, e.doRegAddr, idx, e.ioBytes ?? 2)
    );
}

export function buildSlaveMapHexFromChain(
  chain: Array<{
    chainPos: number;
    enabled: boolean;
    diRegAddr: number;
    doRegAddr: number;
    ioBytes?: number;
  }>
): string {
  return framesToHex(buildSlaveMapFramesFromChain(chain));
}

export interface DownloadSession {
  frames: Uint8Array[];
  totalBytes: number;
}

export interface DownloadBlockMeta {
  slotId?: number;
  blockType?: number;
  name?: string;
  scanMs?: number;
}

export function buildDownloadSession(
  binary: Uint8Array,
  chunkSize = 512,
  meta?: DownloadBlockMeta
): DownloadSession {
  const frames: Uint8Array[] = [];
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const crc32 = view.getUint32(12, false);

  if (meta?.slotId !== undefined || meta?.name) {
    const beginPayload = new Uint8Array(31);
    beginPayload[0] = PLC_DL_SUB_BEGIN;
    beginPayload[1] = (binary.length >> 8) & 0xff;
    beginPayload[2] = binary.length & 0xff;
    beginPayload[3] = (crc32 >> 24) & 0xff;
    beginPayload[4] = (crc32 >> 16) & 0xff;
    beginPayload[5] = (crc32 >> 8) & 0xff;
    beginPayload[6] = crc32 & 0xff;
    beginPayload[7] = meta.slotId ?? 0;
    beginPayload[8] = meta.blockType ?? PLCF_BLOCK_OB;
    const nameBytes = new TextEncoder().encode(meta.name ?? 'Main [OB1]');
    beginPayload.set(nameBytes.subarray(0, 20), 9);
    const scan = meta.scanMs ?? 10;
    beginPayload[29] = (scan >> 8) & 0xff;
    beginPayload[30] = scan & 0xff;
    frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, beginPayload));
  } else {
    const beginPayload = new Uint8Array(7);
    beginPayload[0] = PLC_DL_SUB_BEGIN;
    beginPayload[1] = (binary.length >> 8) & 0xff;
    beginPayload[2] = binary.length & 0xff;
    beginPayload[3] = (crc32 >> 24) & 0xff;
    beginPayload[4] = (crc32 >> 16) & 0xff;
    beginPayload[5] = (crc32 >> 8) & 0xff;
    beginPayload[6] = crc32 & 0xff;
    frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, beginPayload));
  }

  for (let off = 0; off < binary.length; off += chunkSize) {
    const chunk = binary.subarray(off, Math.min(off + chunkSize, binary.length));
    const payload = new Uint8Array(1 + chunk.length);
    payload[0] = PLC_DL_SUB_CHUNK;
    payload.set(chunk, 1);
    frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, payload));
  }

  frames.push(buildFrame(COMMAND_PLC_DOWNLOAD, 0, new Uint8Array([PLC_DL_SUB_END])));
  return { frames, totalBytes: binary.length };
}

export interface FullDeploySession extends DownloadSession {
  enableFrames: Uint8Array[];
  startFrame: Uint8Array;
}

export function buildFullDeploySession(
  binary: Uint8Array,
  scanMs = 10,
  chunkSize = 512
): FullDeploySession {
  const download = buildDownloadSession(binary, chunkSize);
  const enableFrames = [
    buildWriteRegFrame(REG_PLC_MODE_OFFSET, 1),
    buildWriteRegFrame(REG_PLC_SCAN_MS_OFFSET, scanMs),
  ];
  return {
    ...download,
    enableFrames,
    startFrame: buildPlcControlFrame(PLC_CTRL_START),
  };
}

export function framesToHex(frames: Uint8Array[]): string {
  return frames.map(f => Buffer.from(f).toString('hex')).join('\n');
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
  const mode = frame[9];
  const scanMs = (frame[10] << 8) | frame[11];
  const lastScanUs = (frame[12] << 8) | frame[13];
  const errorCode = (frame[14] << 8) | frame[15];
  return {
    mode,
    scanMs,
    lastScanUs,
    errorCode,
    errorMessage: PLC_ERR_MESSAGES[errorCode] || `Unknown error 0x${errorCode.toString(16)}`,
  };
}

export function parseMonitorResponse(frame: Uint8Array): boolean | null {
  if (frame.length < 11) return null;
  return frame[10] !== 0;
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
