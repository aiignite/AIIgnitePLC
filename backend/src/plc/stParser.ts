/**
 * IEC 61131-3 ST subset parser -> IR
 */

import { IrInstruction, parseAddress, PlcOpcode, PlcTagEntry } from './types';

export function compileStToIr(source: string, tags: PlcTagEntry[]): IrInstruction[] {
  const ir: IrInstruction[] = [];
  const lines = source
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));

  const tagMap = new Map<string, number>();
  tags.forEach((t, i) => tagMap.set(t.name, i));

  function resolveTag(name: string): number {
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

  for (const line of lines) {
    const assignMatch = line.match(/^(\w+)\s*:=\s*(TRUE|FALSE|true|false)\s*;?$/i);
    if (assignMatch) {
      const idx = resolveTag(assignMatch[1]);
      const val = assignMatch[2].toUpperCase() === 'TRUE';
      ir.push({ op: val ? PlcOpcode.LD : PlcOpcode.LDN, operands: [0] }); // constant true/false via LD/LDN on self
      if (!val) {
        ir.push({ op: PlcOpcode.LDN, operands: [idx] });
      } else {
        ir.push({ op: PlcOpcode.LD, operands: [idx] });
      }
      ir.push({ op: PlcOpcode.ST, operands: [idx] });
      continue;
    }

    const ifMatch = line.match(/^IF\s+(.+)\s+THEN$/i);
    if (ifMatch) {
      const cond = ifMatch[1];
      const parts = cond.split(/\s+AND\s+/i);
      parts.forEach((p, i) => {
        const neg = p.trim().startsWith('NOT ');
        const name = p.replace(/NOT\s+/i, '').trim();
        const idx = resolveTag(name);
        if (i === 0) ir.push({ op: neg ? PlcOpcode.LDN : PlcOpcode.LD, operands: [idx] });
        else ir.push({ op: neg ? PlcOpcode.ANDN : PlcOpcode.AND, operands: [idx] });
      });
    }

    if (/^END_IF\s*;?$/i.test(line)) {
      /* end if block */
    }
  }

  ir.push({ op: PlcOpcode.SCAN_END, operands: [] });
  return ir;
}
