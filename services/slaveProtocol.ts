/**
 * UART2 slave chain protocol frame builders (单片机程序 frame format).
 * Forward frames use ControlID=0x00; host-local master regs use ControlID=0x01 + 0x64/0x65.
 */

import type { SlaveBoardConfig } from '../src/types/rh850Slaves';
import { UART_SLAVE_PROTOCOL } from '../src/types/rh850Slaves';

export interface ChainRegSegment {
  boardId: number;
  regAddr: number;
  regCount: number;
  /** Write data (regCount × uint16 BE), only for write requests */
  writeData?: number[];
}

const { funcCodes, controlIdForward, controlIdLocal } = UART_SLAVE_PROTOCOL;

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

export function buildFrame(
  controlId: number,
  funcCode: number,
  index: number,
  payload: Uint8Array
): Uint8Array {
  const dataLen = 3 + payload.length;
  const frame = new Uint8Array(4 + 2 + 1 + 1 + 1 + payload.length + 2);
  let o = 0;
  frame.set(UART_SLAVE_PROTOCOL.header, o);
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

/** Host read master local register (0x64, ControlID=0x01). */
export function buildMasterReadRegFrame(regAddr: number, regCount = 1, index = 0): Uint8Array {
  const payload = new Uint8Array(4);
  payload[0] = (regAddr >> 8) & 0xff;
  payload[1] = regAddr & 0xff;
  payload[2] = (regCount >> 8) & 0xff;
  payload[3] = regCount & 0xff;
  return buildFrame(controlIdLocal, funcCodes.hostReadReg, index, payload);
}

/** Host write master local register (0x65, ControlID=0x01). */
export function buildMasterWriteRegFrame(regAddr: number, value: number, index = 0): Uint8Array {
  const payload = new Uint8Array(6);
  payload[0] = (regAddr >> 8) & 0xff;
  payload[1] = regAddr & 0xff;
  payload[2] = 0;
  payload[3] = 1;
  payload[4] = (value >> 8) & 0xff;
  payload[5] = value & 0xff;
  return buildFrame(controlIdLocal, funcCodes.hostWriteReg, index, payload);
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

/** Read slave register via UART2 chain (0x44 forward). */
export function buildSlaveChainReadFrame(
  slaveNum: number,
  segments: ChainRegSegment[],
  index = 0
): Uint8Array {
  return buildFrame(
    controlIdForward,
    funcCodes.masterReadReg,
    index,
    buildChainRegPayload(slaveNum, segments, false)
  );
}

/** Write slave register via UART2 chain (0x46 forward). */
export function buildSlaveChainWriteFrame(
  slaveNum: number,
  segments: ChainRegSegment[],
  index = 0
): Uint8Array {
  return buildFrame(
    controlIdForward,
    funcCodes.masterWriteReg,
    index,
    buildChainRegPayload(slaveNum, segments, true)
  );
}

/** Convenience: read one register from a single board at given chain depth. */
export function buildSingleSlaveReadFrame(
  chainPos: number,
  boardId: number,
  regAddr: number,
  regCount = 1,
  upstream: ChainRegSegment[] = []
): Uint8Array {
  const segments: ChainRegSegment[] = [...upstream, { boardId, regAddr, regCount }];
  return buildSlaveChainReadFrame(chainPos, segments);
}

/** Build 0x6F slave map frames from saved chain config. */
export function buildSlaveMapFramesFromChain(chain: SlaveBoardConfig[]): Uint8Array[] {
  return chain
    .filter(e => e.enabled)
    .map((e, idx) => {
      const payload = new Uint8Array(7);
      payload[0] = 1;
      payload[1] = e.chainPos;
      payload[2] = (e.diRegAddr >> 8) & 0xff;
      payload[3] = e.diRegAddr & 0xff;
      payload[4] = (e.doRegAddr >> 8) & 0xff;
      payload[5] = e.doRegAddr & 0xff;
      payload[6] = e.ioBytes ?? 2;
      return buildFrame(controlIdLocal, funcCodes.plcSlaveMap, idx, payload);
    });
}

export function framesToHex(frames: Uint8Array[]): string {
  return frames.map(f => Array.from(f, b => b.toString(16).padStart(2, '0')).join('')).join('\n');
}

/** Parse 0x45 read-ack: extract uint16 values from data region. */
export function parseSlaveReadAck(frame: Uint8Array): { boardId: number; values: number[] } | null {
  if (frame.length < 12) return null;
  const boardId = (frame[9] << 8) | frame[10];
  const values: number[] = [];
  for (let i = 11; i + 1 < frame.length - 2; i += 2) {
    values.push((frame[i] << 8) | frame[i + 1]);
  }
  return { boardId, values };
}
