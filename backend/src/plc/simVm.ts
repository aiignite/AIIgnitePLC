/**
 * Node.js PLC bytecode VM — mirrors seeyaoplcmaster app/plc/plc_vm.c
 */

import { PlcMemClass, PlcOpcode, PlcTagEntry } from './types';

export interface SimMemState {
  bits: Map<string, boolean>;
  timerTickMs: number;
}

interface TonState {
  in: boolean;
  ptMs: number;
  startTick: number;
  state: number;
  q: boolean;
}

export class NodePlcVm {
  private tags: PlcTagEntry[] = [];
  private bytecode: Uint8Array = new Uint8Array(0);
  private pc = 0;
  private acc = false;
  private mem: SimMemState = { bits: new Map(), timerTickMs: 0 };
  private tonPool: TonState[] = Array.from({ length: 32 }, () => ({
    in: false,
    ptMs: 0,
    startTick: 0,
    state: 0,
    q: false,
  }));

  loadProgram(tags: PlcTagEntry[], bytecode: Uint8Array): void {
    this.tags = tags;
    this.bytecode = bytecode;
    this.pc = 0;
    this.acc = false;
  }

  setTimerTick(ms: number): void {
    this.mem.timerTickMs = ms;
  }

  readBit(memClass: PlcMemClass, byteOff: number, bitOff: number): boolean {
    return this.mem.bits.get(`${memClass}:${byteOff}.${bitOff}`) ?? false;
  }

  writeBit(memClass: PlcMemClass, byteOff: number, bitOff: number, val: boolean): void {
    this.mem.bits.set(`${memClass}:${byteOff}.${bitOff}`, val);
  }

  setInput(address: string, val: boolean): void {
    const parsed = address.match(/^%([IQM])(\d+)\.(\d+)$/i);
    if (!parsed) return;
    const map: Record<string, PlcMemClass> = {
      I: PlcMemClass.I,
      Q: PlcMemClass.Q,
      M: PlcMemClass.M,
    };
    const mc = map[parsed[1].toUpperCase()];
    if (mc === undefined) return;
    this.writeBit(mc, parseInt(parsed[2], 10), parseInt(parsed[3], 10), val);
  }

  getOutputs(): Map<string, boolean> {
    const out = new Map<string, boolean>();
    for (const [k, v] of this.mem.bits) {
      if (k.startsWith(`${PlcMemClass.Q}:`)) out.set(k, v);
    }
    return out;
  }

  getAllBits(): Map<string, boolean> {
    return new Map(this.mem.bits);
  }

  private readTagBit(tagIdx: number): boolean {
    const tag = this.tags[tagIdx];
    if (!tag) return false;
    return this.readBit(tag.memClass, tag.byteOffset, tag.bitOffset);
  }

  private writeTagBit(tagIdx: number, val: boolean): void {
    const tag = this.tags[tagIdx];
    if (!tag) return;
    this.writeBit(tag.memClass, tag.byteOffset, tag.bitOffset, val);
  }

  private fetchU16(): number {
    const v = (this.bytecode[this.pc] << 8) | this.bytecode[this.pc + 1];
    this.pc += 2;
    return v;
  }

  private fetchU32(): number {
    const v =
      (this.bytecode[this.pc] << 24) |
      (this.bytecode[this.pc + 1] << 16) |
      (this.bytecode[this.pc + 2] << 8) |
      this.bytecode[this.pc + 3];
    this.pc += 4;
    return v >>> 0;
  }

  private tonExec(inst: number, input: boolean, ptMs: number): boolean {
    const fb = this.tonPool[inst];
    fb.in = input;
    fb.ptMs = ptMs;
    if (input) {
      if (fb.state === 0) {
        fb.startTick = this.mem.timerTickMs;
        fb.state = 1;
      }
      if (this.mem.timerTickMs - fb.startTick >= ptMs) {
        fb.q = true;
      } else {
        fb.q = false;
      }
    } else {
      fb.state = 0;
      fb.q = false;
    }
    return fb.q;
  }

  executeScan(): boolean {
    this.pc = 0;
    this.acc = false;
    while (this.pc < this.bytecode.length) {
      const op = this.bytecode[this.pc++];
      switch (op) {
        case PlcOpcode.NOP:
          break;
        case PlcOpcode.LD:
          this.acc = this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.LDN:
          this.acc = !this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.AND:
          if (this.acc) this.acc = this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.ANDN:
          if (this.acc) this.acc = !this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.OR:
          if (!this.acc) this.acc = this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.ORN:
          if (!this.acc) this.acc = !this.readTagBit(this.fetchU16());
          break;
        case PlcOpcode.ST: {
          const idx = this.fetchU16();
          this.writeTagBit(idx, this.acc);
          break;
        }
        case PlcOpcode.S:
          if (this.acc) this.writeTagBit(this.fetchU16(), true);
          break;
        case PlcOpcode.R:
          if (this.acc) this.writeTagBit(this.fetchU16(), false);
          break;
        case PlcOpcode.FB_TON: {
          const inst = this.bytecode[this.pc++];
          const pt = this.fetchU32();
          this.acc = this.tonExec(inst, this.acc, pt);
          break;
        }
        case PlcOpcode.FB_TOF:
        case PlcOpcode.FB_TP:
          this.pc += 1 + 4;
          break;
        case PlcOpcode.HALT:
        case PlcOpcode.SCAN_END:
          return true;
        default:
          return false;
      }
    }
    return true;
  }
}

export function loadProgramFromBinary(binary: Uint8Array): {
  tags: PlcTagEntry[];
  bytecode: Uint8Array;
} {
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const tagCount = view.getUint16(8, false);
  const codeSize = view.getUint16(10, false);
  const headerSize = 20;
  const tagEntrySize = 30;
  const tags: PlcTagEntry[] = [];
  let off = headerSize;
  for (let i = 0; i < tagCount; i++) {
    const nameBytes = binary.subarray(off + 6, off + 30);
    const name = new TextDecoder().decode(nameBytes).replace(/\0.*$/, '');
    tags.push({
      name: name || `tag_${i}`,
      memClass: binary[off] as PlcMemClass,
      byteOffset: view.getUint16(off + 1, false),
      bitOffset: binary[off + 3],
      dataType: binary[off + 4],
      retain: binary[off + 5] !== 0,
    });
    off += tagEntrySize;
  }
  const bytecode = binary.subarray(off, off + codeSize);
  return { tags, bytecode };
}
