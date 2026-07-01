/**
 * SFC JSON -> IR with SFC_STEP / SFC_TRANS opcodes
 */

import { IrInstruction, parseAddress, PlcOpcode, PlcTagEntry, SfcProgram } from './types';

export function compileSfcToIr(sfc: SfcProgram, tags: PlcTagEntry[]): IrInstruction[] {
  const ir: IrInstruction[] = [];
  const stepIds = new Map<string, number>();
  sfc.steps.forEach((s, i) => stepIds.set(s.id, i));

  const initialIdx = stepIds.get(sfc.initialStep) ?? 0;
  ir.push({ op: PlcOpcode.SFC_STEP, operands: [initialIdx] });

  for (const tr of sfc.transitions) {
    const fromIdx = stepIds.get(tr.from) ?? 0;
    const parsed = parseAddress(tr.condition) || parseConditionTag(tr.condition, tags);
    if (parsed) {
      const tagIdx = ensureTagFromParsed(tags, tr.condition, parsed);
      ir.push({ op: PlcOpcode.SFC_TRANS, operands: [fromIdx, tagIdx] });
    }
    const toIdx = stepIds.get(tr.to) ?? 0;
    ir.push({ op: PlcOpcode.SFC_STEP, operands: [toIdx] });
  }

  ir.push({ op: PlcOpcode.SCAN_END, operands: [] });
  return ir;
}

function parseConditionTag(cond: string, tags: PlcTagEntry[]): ReturnType<typeof parseAddress> {
  const m = cond.match(/(\w+)/);
  if (!m) return null;
  const t = tags.find(x => x.name === m[1]);
  if (!t) return null;
  return { memClass: t.memClass, byteOffset: t.byteOffset, bitOffset: t.bitOffset };
}

function ensureTagFromParsed(
  tags: PlcTagEntry[],
  name: string,
  parsed: NonNullable<ReturnType<typeof parseAddress>>
): number {
  const idx = tags.findIndex(
    t =>
      t.byteOffset === parsed.byteOffset &&
      t.memClass === parsed.memClass &&
      t.bitOffset === parsed.bitOffset
  );
  if (idx >= 0) return idx;
  tags.push({
    name,
    memClass: parsed.memClass,
    byteOffset: parsed.byteOffset,
    bitOffset: parsed.bitOffset,
    dataType: 0,
    retain: false,
  });
  return tags.length - 1;
}
