/**
 * IEC 61131-3 ST subset parser -> IR
 */

import { IrInstruction, parseAddress, PlcOpcode, PlcTagEntry } from './types';

function resolveTag(name: string, tags: PlcTagEntry[], tagMap: Map<string, number>): number {
  if (tagMap.has(name)) return tagMap.get(name)!;
  const parsed = parseAddress(name);
  if (!parsed) throw new Error(`Unknown tag: ${name}`);
  const idx = tags.length;
  tags.push({
    name,
    memClass: parsed.memClass,
    byteOffset: parsed.byteOffset,
    bitOffset: parsed.bitOffset,
    dataType: 0,
    retain: false,
  });
  tagMap.set(name, idx);
  return idx;
}

function compileBooleanExpr(
  expr: string,
  tags: PlcTagEntry[],
  tagMap: Map<string, number>,
  ir: IrInstruction[]
): void {
  const parts = expr
    .split(/\s+AND\s+/i)
    .map(p => p.trim())
    .filter(Boolean);
  parts.forEach((part, i) => {
    const neg = /^NOT\s+/i.test(part);
    const name = part.replace(/^NOT\s+/i, '').trim();
    const idx = resolveTag(name, tags, tagMap);
    if (i === 0) {
      ir.push({ op: neg ? PlcOpcode.LDN : PlcOpcode.LD, operands: [idx] });
    } else {
      ir.push({ op: neg ? PlcOpcode.ANDN : PlcOpcode.AND, operands: [idx] });
    }
  });
}

export function compileStToIr(source: string, tags: PlcTagEntry[]): IrInstruction[] {
  const ir: IrInstruction[] = [];
  const tagMap = new Map<string, number>();
  tags.forEach((t, i) => tagMap.set(t.name, i));

  const lines = source
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));

  for (const line of lines) {
    const assignMatch = line.match(/^(\w+)\s*:=\s*(.+?)\s*;?\s*$/i);
    if (assignMatch) {
      const destIdx = resolveTag(assignMatch[1], tags, tagMap);
      const expr = assignMatch[2].trim();
      if (/^(TRUE|FALSE)$/i.test(expr)) {
        const val = expr.toUpperCase() === 'TRUE';
        if (val) {
          ir.push({ op: PlcOpcode.LDN, operands: [destIdx] });
          ir.push({ op: PlcOpcode.OR, operands: [destIdx] });
        } else {
          ir.push({ op: PlcOpcode.LD, operands: [destIdx] });
          ir.push({ op: PlcOpcode.ANDN, operands: [destIdx] });
        }
      } else {
        compileBooleanExpr(expr, tags, tagMap, ir);
      }
      ir.push({ op: PlcOpcode.ST, operands: [destIdx] });
      continue;
    }

    if (/^END_IF\s*;?\s*$/i.test(line)) {
      continue;
    }

    const ifMatch = line.match(/^IF\s+(.+)\s+THEN\s*$/i);
    if (ifMatch) {
      compileBooleanExpr(ifMatch[1], tags, tagMap, ir);
    }
  }

  ir.push({ op: PlcOpcode.SCAN_END, operands: [] });
  return ir;
}
