/**
 * PLC IR types and opcodes - must match app/plc/plc_ir.h on RH850
 */

export const PLC_MAGIC_AIPC = 0x43504941; // "AIPC"
export const PLC_MAGIC_AIPLC1 = 0x31434c504149; // "AIPLC1"

export enum PlcMemClass {
  I = 0,
  Q = 1,
  M = 2,
  DB = 3,
}

export enum PlcOpcode {
  NOP = 0,
  LD,
  LDN,
  AND,
  ANDN,
  OR,
  ORN,
  ST,
  S,
  R,
  READ_B,
  WRITE_B,
  READ_W,
  WRITE_W,
  JMP,
  JMPF,
  CALL,
  RET,
  FB_TON,
  FB_TOF,
  FB_TP,
  FB_CTU,
  FB_CTD,
  SFC_INIT,
  SFC_STEP,
  SFC_TRANS,
  SFC_ACTION,
  HALT,
  SCAN_END,
}

export interface ParsedAddress {
  memClass: PlcMemClass;
  byteOffset: number;
  bitOffset: number;
}

export interface PlcTagEntry {
  name: string;
  memClass: PlcMemClass;
  byteOffset: number;
  bitOffset: number;
  dataType: number; // 0=bool 1=word 2=dword
  retain: boolean;
}

export interface IrInstruction {
  op: PlcOpcode;
  operands: number[];
}

export interface PlcProgramHeader {
  magic: number;
  version: number;
  scanMs: number;
  tagCount: number;
  codeSize: number;
  crc32: number;
  execMode: number;
}

export interface CompileResult {
  header: PlcProgramHeader;
  tags: PlcTagEntry[];
  bytecode: Uint8Array;
  binary: Uint8Array;
  diagnostics: Array<{ severity: string; message: string }>;
}

export interface SfcProgram {
  initialStep: string;
  steps: Array<{
    id: string;
    actions: Array<{
      type: 'N' | 'S' | 'R' | 'L';
      st?: string;
      address?: string;
      value?: boolean;
    }>;
  }>;
  transitions: Array<{
    from: string;
    to: string;
    condition: string;
  }>;
}

export function parseAddress(addr: string): ParsedAddress | null {
  if (!addr || !addr.startsWith('%')) return null;

  const memMap: Record<string, PlcMemClass> = {
    I: PlcMemClass.I,
    Q: PlcMemClass.Q,
    M: PlcMemClass.M,
  };

  const bitMatch = addr.match(/^%([IQM])(\d+)\.(\d+)$/i);
  if (bitMatch) {
    const memClass = memMap[bitMatch[1].toUpperCase()];
    if (memClass === undefined) return null;
    return {
      memClass,
      byteOffset: parseInt(bitMatch[2], 10),
      bitOffset: parseInt(bitMatch[3], 10),
    };
  }

  const byteMatch = addr.match(/^%([IQM])B(\d+)$/i);
  if (byteMatch) {
    const memClass = memMap[byteMatch[1].toUpperCase()];
    if (memClass === undefined) return null;
    return { memClass, byteOffset: parseInt(byteMatch[2], 10), bitOffset: 0 };
  }

  const wordMatch = addr.match(/^%([IQM])W(\d+)$/i);
  if (wordMatch) {
    const memClass = memMap[wordMatch[1].toUpperCase()];
    if (memClass === undefined) return null;
    return { memClass, byteOffset: parseInt(wordMatch[2], 10), bitOffset: 0 };
  }

  const dwordMatch = addr.match(/^%([IQM])D(\d+)$/i);
  if (dwordMatch) {
    const memClass = memMap[dwordMatch[1].toUpperCase()];
    if (memClass === undefined) return null;
    return { memClass, byteOffset: parseInt(dwordMatch[2], 10), bitOffset: 0 };
  }

  const dbBitMatch = addr.match(/^%DB(\d+)\.DBX(\d+)\.(\d+)$/i);
  if (dbBitMatch) {
    return {
      memClass: PlcMemClass.DB,
      byteOffset: parseInt(dbBitMatch[2], 10),
      bitOffset: parseInt(dbBitMatch[3], 10),
    };
  }

  const dbByteMatch = addr.match(/^%DB(\d+)\.DBB(\d+)$/i);
  if (dbByteMatch) {
    return {
      memClass: PlcMemClass.DB,
      byteOffset: parseInt(dbByteMatch[2], 10),
      bitOffset: 0,
    };
  }

  const dbWordMatch = addr.match(/^%DB(\d+)\.DBW(\d+)$/i);
  if (dbWordMatch) {
    return {
      memClass: PlcMemClass.DB,
      byteOffset: parseInt(dbWordMatch[2], 10),
      bitOffset: 0,
    };
  }

  const simpleMatch = addr.match(/^%([IQM])(\d+)$/i);
  if (simpleMatch) {
    const memClass = memMap[simpleMatch[1].toUpperCase()];
    if (memClass === undefined) return null;
    return {
      memClass,
      byteOffset: parseInt(simpleMatch[2], 10),
      bitOffset: 0,
    };
  }

  return null;
}

export function parseTimeMs(value: string): number {
  const t = value.trim();
  const num = parseInt(t.replace(/[^0-9]/g, ''), 10);
  if (t.includes('s') && !t.includes('ms')) return num * 1000;
  return num || 0;
}
