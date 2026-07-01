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
  const m = addr.match(/^%([IQM])(\d+)(?:\.(\d))?/);
  if (!m) return null;
  const memMap: Record<string, PlcMemClass> = {
    I: PlcMemClass.I,
    Q: PlcMemClass.Q,
    M: PlcMemClass.M,
  };
  const memClass = memMap[m[1]];
  if (memClass === undefined) return null;
  return {
    memClass,
    byteOffset: parseInt(m[2], 10),
    bitOffset: m[3] !== undefined ? parseInt(m[3], 10) : 0,
  };
}

export function parseTimeMs(value: string): number {
  const t = value.trim();
  const num = parseInt(t.replace(/[^0-9]/g, ''), 10);
  if (t.includes('s') && !t.includes('ms')) return num * 1000;
  return num || 0;
}
