/**
 * Compile-time resource validation against RH850 PLC limits
 */

import {
  PLC_MAX_BYTECODE,
  PLC_MAX_FB_INSTANCES,
  PLC_MAX_LD_ELEMENTS,
  PLC_MAX_LD_RUNGS,
  PLC_MAX_SFC_STEPS,
  PLC_MAX_SFC_TRANS,
  PLC_MAX_TAGS,
  PLC_SCAN_MS_MAX,
  PLC_SCAN_MS_MIN,
} from './plcLimits';
import type { IrInstruction, PlcTagEntry, SfcProgram } from './types';
import { PlcOpcode } from './types';

export interface CompileDiagnostic {
  severity: 'error' | 'warning';
  message: string;
}

export function validateCompileLimits(
  ir: IrInstruction[],
  tags: PlcTagEntry[],
  scanMs: number,
  networkRungCount = 0,
  sfc?: SfcProgram
): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];

  if (tags.length > PLC_MAX_TAGS) {
    diagnostics.push({
      severity: 'error',
      message: `Tag count ${tags.length} exceeds limit ${PLC_MAX_TAGS}`,
    });
  }

  const bytecodeSize = estimateBytecodeSize(ir);
  if (bytecodeSize > PLC_MAX_BYTECODE) {
    diagnostics.push({
      severity: 'error',
      message: `Bytecode size ${bytecodeSize} exceeds limit ${PLC_MAX_BYTECODE} bytes`,
    });
  }

  if (scanMs < PLC_SCAN_MS_MIN || scanMs > PLC_SCAN_MS_MAX) {
    diagnostics.push({
      severity: 'error',
      message: `scan_ms ${scanMs} out of range ${PLC_SCAN_MS_MIN}-${PLC_SCAN_MS_MAX}`,
    });
  }

  if (networkRungCount > PLC_MAX_LD_RUNGS) {
    diagnostics.push({
      severity: 'error',
      message: `Rung count ${networkRungCount} exceeds limit ${PLC_MAX_LD_RUNGS}`,
    });
  }

  let fbCount = 0;
  for (const ins of ir) {
    if (
      ins.op === PlcOpcode.FB_TON ||
      ins.op === PlcOpcode.FB_TOF ||
      ins.op === PlcOpcode.FB_TP ||
      ins.op === PlcOpcode.FB_CTU ||
      ins.op === PlcOpcode.FB_CTD
    ) {
      fbCount = Math.max(fbCount, (ins.operands[0] ?? 0) + 1);
    }
  }
  if (fbCount > PLC_MAX_FB_INSTANCES) {
    diagnostics.push({
      severity: 'error',
      message: `FB instance count ${fbCount} exceeds limit ${PLC_MAX_FB_INSTANCES}`,
    });
  }

  if (sfc) {
    if (sfc.steps.length > PLC_MAX_SFC_STEPS) {
      diagnostics.push({
        severity: 'error',
        message: `SFC steps ${sfc.steps.length} exceeds limit ${PLC_MAX_SFC_STEPS}`,
      });
    }
    if (sfc.transitions.length > PLC_MAX_SFC_TRANS) {
      diagnostics.push({
        severity: 'error',
        message: `SFC transitions ${sfc.transitions.length} exceeds limit ${PLC_MAX_SFC_TRANS}`,
      });
    }
  }

  return diagnostics;
}

function estimateBytecodeSize(ir: IrInstruction[]): number {
  let size = 0;
  for (const ins of ir) {
    size += 1;
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
      case PlcOpcode.SFC_STEP:
        size += 2;
        break;
      case PlcOpcode.FB_TON:
      case PlcOpcode.FB_TOF:
      case PlcOpcode.FB_TP:
        size += 1 + 4;
        break;
      case PlcOpcode.FB_CTU:
      case PlcOpcode.FB_CTD:
        size += 2 + 2;
        break;
      case PlcOpcode.SFC_ACTION:
        size += 7;
        break;
      default:
        break;
    }
  }
  return size;
}

export { PLC_MAX_LD_ELEMENTS };
