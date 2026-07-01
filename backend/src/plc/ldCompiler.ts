/**
 * LD ladder diagram compiler -> IR instructions
 */

import type { LadderElement, LadderRung, Network, TagDefinition } from '../types';
import { IrInstruction, parseAddress, parseTimeMs, PlcOpcode, PlcTagEntry } from './types';

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

function compileElement(
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
  } else if (elem.type === 'coil') {
    ir.push({ op: PlcOpcode.ST, operands: [idx] });
  } else if (elem.type === 'box_timer') {
    const timerType = elem.address?.toUpperCase() || 'TON';
    const ptParam = elem.parameters?.find(p => p.name === 'PT');
    const ptMs = ptParam ? parseTimeMs(ptParam.value) : 1000;
    const inst = tags.length; // use next id as FB instance
    tags.push({
      name: `__timer_${inst}`,
      memClass: 2,
      byteOffset: 0,
      bitOffset: 0,
      dataType: 0,
      retain: false,
    });
    if (timerType === 'TOF') {
      ir.push({ op: PlcOpcode.FB_TOF, operands: [inst, ptMs] });
    } else if (timerType === 'TP') {
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
  let isFirst = true;
  const inputs: LadderElement[] = [];
  let coil: LadderElement | null = null;

  for (const elem of rung.elements) {
    if (elem.type === 'coil') coil = elem;
    else inputs.push(elem);
  }

  for (const elem of inputs) {
    compileElement(elem, tags, tagMap, ir, isFirst);
    isFirst = false;
  }

  if (rung.hasBranch && rung.branchElement) {
    const branchIdx = ir.length;
    compileElement(rung.branchElement, tags, tagMap, ir, true);
    ir.push({ op: PlcOpcode.OR, operands: [branchIdx] }); // simplified OR merge
  }

  if (coil) {
    compileElement(coil, tags, tagMap, ir, false);
  }
}

export function compileNetworksToIr(
  networks: Network[],
  projectTags: TagDefinition[] = []
): { ir: IrInstruction[]; tags: PlcTagEntry[] } {
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
