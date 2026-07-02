/**
 * SFC JSON -> IR + binary program for RH850 plc_sfc_load()
 */

import { PLC_MAX_SFC_STEPS, PLC_MAX_SFC_TRANS } from './plcLimits';
import {
  IrInstruction,
  parseAddress,
  PlcMemClass,
  PlcOpcode,
  PlcTagEntry,
  SfcProgram,
} from './types';

const SFC_ACT_N = 0;
const SFC_ACT_S = 1;
const SFC_ACT_R = 2;

export interface SfcBinaryProgram {
  initialStep: number;
  stepCount: number;
  transCount: number;
  binary: Uint8Array;
}

function resolveTagByName(name: string, tags: PlcTagEntry[]): PlcTagEntry | null {
  const byName = tags.find(t => t.name === name);
  if (byName) return byName;
  const parsed = parseAddress(name);
  if (!parsed) return null;
  return {
    name,
    memClass: parsed.memClass,
    byteOffset: parsed.byteOffset,
    bitOffset: parsed.bitOffset,
    dataType: 0,
    retain: false,
  };
}

export function buildSfcBinary(sfc: SfcProgram, tags: PlcTagEntry[]): SfcBinaryProgram {
  const stepIds = new Map<string, number>();
  sfc.steps.forEach((s, i) => stepIds.set(s.id, i));

  const initialStep = stepIds.get(sfc.initialStep) ?? 0;
  const buf: number[] = [];
  buf.push(initialStep);
  buf.push(Math.min(sfc.steps.length, PLC_MAX_SFC_STEPS));
  buf.push(Math.min(sfc.transitions.length, PLC_MAX_SFC_TRANS));

  for (let si = 0; si < Math.min(sfc.steps.length, PLC_MAX_SFC_STEPS); si++) {
    const step = sfc.steps[si];
    const stepId = stepIds.get(step.id) ?? si;
    const actions = step.actions.slice(0, 8);
    buf.push(stepId);
    buf.push(actions.length);
    for (const act of actions) {
      const tag = resolveTagByName(act.address || act.st || '', tags);
      const actType = act.type === 'S' ? SFC_ACT_S : act.type === 'R' ? SFC_ACT_R : SFC_ACT_N;
      buf.push(actType);
      buf.push(tag?.memClass ?? PlcMemClass.M);
      buf.push(((tag?.byteOffset ?? 0) >> 8) & 0xff);
      buf.push((tag?.byteOffset ?? 0) & 0xff);
      buf.push(tag?.bitOffset ?? 0);
      buf.push(act.value !== false ? 1 : 0);
    }
  }

  for (let ti = 0; ti < Math.min(sfc.transitions.length, PLC_MAX_SFC_TRANS); ti++) {
    const tr = sfc.transitions[ti];
    const fromStep = stepIds.get(tr.from) ?? 0;
    const toStep = stepIds.get(tr.to) ?? 0;
    const condTag = resolveTagByName(tr.condition, tags);
    const invert = /^NOT\s+/i.test(tr.condition.trim()) ? 1 : 0;
    const condName = tr.condition.replace(/^NOT\s+/i, '').trim();
    const resolved = resolveTagByName(condName, tags) || condTag;
    buf.push(fromStep);
    buf.push(toStep);
    buf.push(resolved?.memClass ?? PlcMemClass.M);
    buf.push(((resolved?.byteOffset ?? 0) >> 8) & 0xff);
    buf.push((resolved?.byteOffset ?? 0) & 0xff);
    buf.push(resolved?.bitOffset ?? 0);
    buf.push(invert);
  }

  return {
    initialStep,
    stepCount: Math.min(sfc.steps.length, PLC_MAX_SFC_STEPS),
    transCount: Math.min(sfc.transitions.length, PLC_MAX_SFC_TRANS),
    binary: Uint8Array.from(buf),
  };
}

export function compileSfcToIr(sfc: SfcProgram, tags: PlcTagEntry[]): IrInstruction[] {
  const ir: IrInstruction[] = [];
  const stepIds = new Map<string, number>();
  sfc.steps.forEach((s, i) => stepIds.set(s.id, i));

  const initialIdx = stepIds.get(sfc.initialStep) ?? 0;
  ir.push({ op: PlcOpcode.SFC_INIT, operands: [initialIdx] });
  ir.push({ op: PlcOpcode.SFC_STEP, operands: [initialIdx] });

  for (const step of sfc.steps) {
    const stepIdx = stepIds.get(step.id) ?? 0;
    for (const act of step.actions) {
      const tag = resolveTagByName(act.address || act.st || '', tags);
      if (!tag) continue;
      const actType = act.type === 'S' ? 1 : act.type === 'R' ? 2 : 0;
      ir.push({
        op: PlcOpcode.SFC_ACTION,
        operands: [
          stepIdx,
          actType,
          tag.memClass,
          tag.byteOffset,
          tag.bitOffset,
          act.value !== false ? 1 : 0,
        ],
      });
    }
  }

  for (const tr of sfc.transitions) {
    ir.push({ op: PlcOpcode.SFC_TRANS, operands: [] });
    const toIdx = stepIds.get(tr.to) ?? 0;
    ir.push({ op: PlcOpcode.SFC_STEP, operands: [toIdx] });
  }

  ir.push({ op: PlcOpcode.SCAN_END, operands: [] });
  return ir;
}
