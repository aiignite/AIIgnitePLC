/**
 * IR -> binary bytecode emitter for RH850 PLC runtime
 */

import {
  CompileResult,
  IrInstruction,
  PLC_MAGIC_AIPC,
  PlcOpcode,
  PlcProgramHeader,
  PlcTagEntry,
} from './types';

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function emitU16(buf: number[], v: number): void {
  buf.push((v >> 8) & 0xff, v & 0xff);
}

function emitU32(buf: number[], v: number): void {
  buf.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

export function emitBytecode(ir: IrInstruction[], tags: PlcTagEntry[], scanMs = 10): CompileResult {
  const code: number[] = [];
  const diagnostics: CompileResult['diagnostics'] = [];

  for (const ins of ir) {
    code.push(ins.op);
    switch (ins.op) {
      case PlcOpcode.LD:
      case PlcOpcode.LDN:
      case PlcOpcode.AND:
      case PlcOpcode.ANDN:
      case PlcOpcode.OR:
      case PlcOpcode.ORN:
      case PlcOpcode.ST:
      case PlcOpcode.S:
      case PlcOpcode.R:
      case PlcOpcode.JMP:
      case PlcOpcode.JMPF:
        emitU16(code, ins.operands[0] ?? 0);
        break;
      case PlcOpcode.FB_TON:
      case PlcOpcode.FB_TOF:
      case PlcOpcode.FB_TP:
        code.push(ins.operands[0] ?? 0);
        emitU32(code, ins.operands[1] ?? 0);
        break;
      case PlcOpcode.FB_CTU:
      case PlcOpcode.FB_CTD:
        code.push(ins.operands[0] ?? 0);
        code.push(ins.operands[1] ?? 0);
        emitU16(code, ins.operands[2] ?? 0);
        break;
      case PlcOpcode.SFC_STEP:
        emitU16(code, ins.operands[0] ?? 0);
        break;
      case PlcOpcode.SCAN_END:
      case PlcOpcode.NOP:
      case PlcOpcode.HALT:
      case PlcOpcode.SFC_TRANS:
        break;
      default:
        diagnostics.push({ severity: 'warning', message: `Unhandled opcode ${ins.op}` });
    }
  }

  const bytecode = Uint8Array.from(code);
  const headerSize = 20;
  const tagEntrySize = 30;
  const tagBytes = tags.length * tagEntrySize;
  const totalSize = headerSize + tagBytes + bytecode.length;
  const binary = new Uint8Array(totalSize);
  const view = new DataView(binary.buffer);

  const header: PlcProgramHeader = {
    magic: PLC_MAGIC_AIPC,
    version: 1,
    scanMs,
    tagCount: tags.length,
    codeSize: bytecode.length,
    crc32: 0,
    execMode: 0,
  };

  view.setUint32(0, header.magic, false);
  view.setUint16(4, header.version, false);
  view.setUint16(6, header.scanMs, false);
  view.setUint16(8, header.tagCount, false);
  view.setUint16(10, header.codeSize, false);
  view.setUint32(12, header.crc32, false);
  view.setUint8(16, header.execMode);

  let off = headerSize;
  for (const tag of tags) {
    binary[off] = tag.memClass;
    view.setUint16(off + 1, tag.byteOffset, false);
    binary[off + 3] = tag.bitOffset;
    binary[off + 4] = tag.dataType;
    binary[off + 5] = tag.retain ? 1 : 0;
    const nameBytes = new TextEncoder().encode(tag.name.slice(0, 23));
    binary.set(nameBytes, off + 6);
    off += tagEntrySize;
  }

  binary.set(bytecode, off);
  header.crc32 = crc32(binary);
  view.setUint32(12, header.crc32, false);

  return { header, tags, bytecode, binary, diagnostics };
}

export function buildAiplc1Package(
  binary: Uint8Array,
  scanMs: number,
  tags: PlcTagEntry[]
): object {
  return {
    magic: 'AIPLC1',
    version: 1,
    mode: 'bytecode',
    scan_ms: scanMs,
    tags: tags.map(t => ({
      name: t.name,
      address: `%${['I', 'Q', 'M', 'DB'][t.memClass]}${t.byteOffset}.${t.bitOffset}`,
      type: 'Bool',
      retain: t.retain,
    })),
    program: {
      bytecode: Buffer.from(binary).toString('base64'),
      crc32: new DataView(binary.buffer).getUint32(12, false),
    },
  };
}
