/**
 * 0x6E JSON flat binary encoder — matches seeyaoplcmaster app/plc/plc_json.c
 */

import type { LadderElement, LadderRung, Network } from '../types';
import { buildFrame, COMMAND_PLC_JSON } from './rh850Protocol';
import { parseAddress } from './types';

const ELEM_CONTACT_NO = 0;
const ELEM_CONTACT_NC = 1;
const ELEM_COIL = 2;
const ELEM_BOX_TIMER = 3;

function elemType(type: string): number {
  if (type === 'contactNC') return ELEM_CONTACT_NC;
  if (type === 'coil') return ELEM_COIL;
  if (type === 'box_timer') return ELEM_BOX_TIMER;
  return ELEM_CONTACT_NO;
}

function encodeElement(buf: number[], elem: LadderElement): void {
  const parsed = parseAddress(elem.address) || { memClass: 2, byteOffset: 0, bitOffset: 0 };
  const ptParam = elem.parameters?.find(p => p.name === 'PT');
  const ptMs = ptParam
    ? parseInt(ptParam.value.replace(/[^0-9]/g, ''), 10) *
      (ptParam.value.includes('s') && !ptParam.value.includes('ms') ? 1000 : 1)
    : 0;
  buf.push(elemType(elem.type));
  buf.push(parsed.memClass);
  buf.push((parsed.byteOffset >> 8) & 0xff);
  buf.push(parsed.byteOffset & 0xff);
  buf.push(parsed.bitOffset);
  buf.push(0, 0);
  buf.push((ptMs >> 24) & 0xff, (ptMs >> 16) & 0xff, (ptMs >> 8) & 0xff, ptMs & 0xff);
}

function encodeRung(buf: number[], rung: LadderRung): void {
  const elems = rung.elements.filter(e => e.type !== 'coil');
  const coil = rung.elements.find(e => e.type === 'coil');
  const allElems = coil ? [...elems, coil] : elems;
  buf.push(allElems.length);
  buf.push(rung.hasBranch ? 1 : 0);
  for (const e of allElems.slice(0, 16)) {
    encodeElement(buf, e);
  }
  if (rung.hasBranch && rung.branchElement) {
    encodeElement(buf, rung.branchElement);
  }
}

export function buildJsonDebugFlat(networks: Network[]): Uint8Array {
  const rungs = networks.flatMap(n => n.rungs).slice(0, 64);
  const buf: number[] = [rungs.length];
  for (const rung of rungs) {
    encodeRung(buf, rung);
  }
  return Uint8Array.from(buf);
}

export function buildJsonDebugFrame(networks: Network[]): Uint8Array {
  const flat = buildJsonDebugFlat(networks);
  return buildFrame(COMMAND_PLC_JSON, 0, flat);
}
