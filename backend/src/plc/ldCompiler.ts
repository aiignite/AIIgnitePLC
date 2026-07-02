/**
 * LD ladder diagram compiler -> IR instructions
 */

import type { LadderElement, LadderRung, Network, TagDefinition } from '../types';
import { PLC_MAX_FB_INSTANCES } from './plcLimits';
import { IrInstruction, parseAddress, parseTimeMs, PlcOpcode, PlcTagEntry } from './types';

let fbInstanceCounter = 0;

function resetFbCounter(): void {
  fbInstanceCounter = 0;
}

function allocFbInstance(): number {
  if (fbInstanceCounter >= PLC_MAX_FB_INSTANCES) {
    throw new Error(`FB instance limit ${PLC_MAX_FB_INSTANCES} exceeded`);
  }
  return fbInstanceCounter++;
}

function ensureTag(
  tags: PlcTagEntry[],
  tagMap: Map<string, number>,
  name: string,
  address: string
): number {
  const key = address || name;
  if (tagMap.has(key)) return tagMap.get(key)!;

  const parsed = parseAddress(address);
  if (!parsed) throw new Error(`Invalid address: ${address}`);

  const idx = tags.length;
  tags.push({
    name: name || address,
    memClass: parsed.memClass,
    byteOffset: parsed.byteOffset,
    bitOffset: parsed.bitOffset,
    dataType: 0,
    retain: false,
  });
  tagMap.set(key, idx);
  return idx;
}

function resolveCoilOpcode(elem: LadderElement): PlcOpcode {
  const mode = (elem as LadderElement & { coilMode?: string }).coilMode;
  if (mode === 'set') return PlcOpcode.S;
  if (mode === 'reset') return PlcOpcode.R;
  if (elem.comment === 'Set Output') return PlcOpcode.S;
  if (elem.comment === 'Reset Output') return PlcOpcode.R;
  return PlcOpcode.ST;
}

function compileContact(
  elem: LadderElement,
  tags: PlcTagEntry[],
  tagMap: Map<string, number>,
  ir: IrInstruction[],
  isFirst: boolean
): void {
  const idx = ensureTag(tags, tagMap, elem.tag, elem.address);
  if (elem.type === 'contactNO') {
    ir.push({ op: isFirst ? PlcOpcode.LD : PlcOpcode.AND, operands: [idx] });
  } else if (elem.type === 'contactNC') {
    ir.push({ op: isFirst ? PlcOpcode.LDN : PlcOpcode.ANDN, operands: [idx] });
  }
}

function compileElement(
  elem: LadderElement,
  tags: PlcTagEntry[],
  tagMap: Map<string, number>,
  ir: IrInstruction[],
  isFirst: boolean
): void {
  if (elem.type === 'contactNO' || elem.type === 'contactNC') {
    compileContact(elem, tags, tagMap, ir, isFirst);
    return;
  }

  const idx = ensureTag(tags, tagMap, elem.tag, elem.address);

  if (elem.type === 'coil') {
    ir.push({ op: resolveCoilOpcode(elem), operands: [idx] });
  } else if (elem.type === 'box_timer') {
    const fbType = elem.comment?.toUpperCase() || elem.address?.toUpperCase() || 'TON';
    const ptParam = elem.parameters?.find(p => p.name === 'PT');
    const ptMs = ptParam ? parseTimeMs(ptParam.value) : 1000;
    const inst = allocFbInstance();

    if (fbType === 'CTU') {
      const resetIdx = idx;
      ir.push({ op: PlcOpcode.FB_CTU, operands: [inst, resetIdx, 100] });
    } else if (fbType === 'CTD') {
      ir.push({ op: PlcOpcode.FB_CTD, operands: [inst, idx, 0] });
    } else if (fbType === 'TOF') {
      ir.push({ op: PlcOpcode.FB_TOF, operands: [inst, ptMs] });
    } else if (fbType === 'TP') {
      ir.push({ op: PlcOpcode.FB_TP, operands: [inst, ptMs] });
    } else {
      ir.push({ op: PlcOpcode.FB_TON, operands: [inst, ptMs] });
    }
  }
}

function compileRung(
  rung: LadderRung,
  tags: PlcTagEntry[],
  tagMap: Map<string, number>,
  ir: IrInstruction[]
): void {
  const inputs: LadderElement[] = [];
  let coil: LadderElement | null = null;

  for (const elem of rung.elements) {
    if (elem.type === 'coil') coil = elem;
    else inputs.push(elem);
  }

  let isFirst = true;
  for (const elem of inputs) {
    compileElement(elem, tags, tagMap, ir, isFirst);
    isFirst = false;
  }

  if (rung.hasBranch && rung.branchElement) {
    const branchIdx = ensureTag(tags, tagMap, rung.branchElement.tag, rung.branchElement.address);
    if (rung.branchElement.type === 'contactNC') {
      ir.push({ op: PlcOpcode.ORN, operands: [branchIdx] });
    } else {
      ir.push({ op: PlcOpcode.OR, operands: [branchIdx] });
    }
  }

  if (coil) {
    compileElement(coil, tags, tagMap, ir, false);
  }
}

export function compileNetworksToIr(
  networks: Network[],
  projectTags: TagDefinition[] = []
): { ir: IrInstruction[]; tags: PlcTagEntry[] } {
  resetFbCounter();
  const tags: PlcTagEntry[] = [];
  const tagMap = new Map<string, number>();
  const ir: IrInstruction[] = [];

  for (const t of projectTags) {
    try {
      ensureTag(tags, tagMap, t.name, t.address);
    } catch {
      /* skip invalid project tags */
    }
  }

  for (const net of networks) {
    for (const rung of net.rungs) {
      compileRung(rung, tags, tagMap, ir);
    }
  }

  ir.push({ op: PlcOpcode.SCAN_END, operands: [] });
  return { ir, tags };
}

export function countRungs(networks: Network[]): number {
  return networks.reduce((sum, n) => sum + n.rungs.length, 0);
}
