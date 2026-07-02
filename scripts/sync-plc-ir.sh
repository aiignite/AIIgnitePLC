#!/usr/bin/env bash
# Sync PLC IR constants from seeyaoplcmaster app/plc/plc_ir.h into backend/src/plc/plcLimits.ts
# Usage: ./scripts/sync-plc-ir.sh [path-to-seeyaoplcmaster]

set -euo pipefail

SEEYAO_ROOT="${1:-$HOME/Documents/AI/test/seeyaoplcmaster}"
IR_H="$SEEYAO_ROOT/app/plc/plc_ir.h"
OUT="backend/src/plc/plcLimits.ts"

if [[ ! -f "$IR_H" ]]; then
  echo "Error: plc_ir.h not found at $IR_H" >&2
  exit 1
fi

extract() {
  local name="$1"
  grep "#define $name" "$IR_H" | head -1 | awk '{print $3}' | tr -d 'U'
}

MAX_TAGS=$(extract PLC_MAX_TAGS)
MAX_BYTECODE=$(extract PLC_MAX_BYTECODE)
MAX_FB=$(extract PLC_MAX_FB_INSTANCES)
MAX_SFC_STEPS=$(extract PLC_MAX_SFC_STEPS)
MAX_SFC_TRANS=$(extract PLC_MAX_SFC_TRANS)
MAX_LD_RUNGS=$(extract PLC_MAX_LD_RUNGS)
MAX_LD_ELEMENTS=$(extract PLC_MAX_LD_ELEMENTS)
MAX_SLAVE=$(extract PLC_MAX_SLAVE_IO)
M_BYTES=$(extract PLC_M_AREA_BYTES)
DB_BYTES=$(extract PLC_DB_AREA_BYTES)
SCAN_DEF=$(extract PLC_SCAN_MS_DEFAULT)
SCAN_MIN=$(extract PLC_SCAN_MS_MIN)
SCAN_MAX=$(extract PLC_SCAN_MS_MAX)

cat > "$OUT" <<EOF
/**
 * PLC resource limits — auto-synced from seeyaoplcmaster app/plc/plc_ir.h
 * Run: ./scripts/sync-plc-ir.sh
 */

export const PLC_MAX_TAGS = ${MAX_TAGS};
export const PLC_MAX_BYTECODE = ${MAX_BYTECODE};
export const PLC_MAX_FB_INSTANCES = ${MAX_FB};
export const PLC_MAX_SFC_STEPS = ${MAX_SFC_STEPS};
export const PLC_MAX_SFC_TRANS = ${MAX_SFC_TRANS};
export const PLC_MAX_LD_RUNGS = ${MAX_LD_RUNGS};
export const PLC_MAX_LD_ELEMENTS = ${MAX_LD_ELEMENTS};
export const PLC_MAX_SLAVE_IO = ${MAX_SLAVE};
export const PLC_M_AREA_BYTES = ${M_BYTES};
export const PLC_DB_AREA_BYTES = ${DB_BYTES};
export const PLC_SCAN_MS_DEFAULT = ${SCAN_DEF};
export const PLC_SCAN_MS_MIN = ${SCAN_MIN};
export const PLC_SCAN_MS_MAX = ${SCAN_MAX};

export const PLC_ERR_NONE = 0x0000;
export const PLC_ERR_NOT_READY = 0x0701;
export const PLC_ERR_DL_IN_PROGRESS = 0x0702;
export const PLC_ERR_DL_CRC = 0x0703;
export const PLC_ERR_DL_SIZE = 0x0704;
export const PLC_ERR_SCAN_OVERRUN = 0x0705;
export const PLC_ERR_NO_PROGRAM = 0x0706;
export const PLC_ERR_FORCE_INVALID = 0x0707;

export const PLC_ERR_MESSAGES: Record<number, string> = {
  [PLC_ERR_NONE]: 'OK',
  [PLC_ERR_NOT_READY]: 'PLC not ready',
  [PLC_ERR_DL_IN_PROGRESS]: 'Download in progress',
  [PLC_ERR_DL_CRC]: 'Download CRC mismatch',
  [PLC_ERR_DL_SIZE]: 'Download size invalid',
  [PLC_ERR_SCAN_OVERRUN]: 'Scan overrun',
  [PLC_ERR_NO_PROGRAM]: 'No program loaded',
  [PLC_ERR_FORCE_INVALID]: 'Force I/O invalid',
};

/** Controller_Param register base (see seeyaoplcmaster function.h) */
export const REG_CONTROLLER_PARAM_BASE = 0x1000;
export const REG_PLC_MODE_OFFSET = 0x1008;
export const REG_PLC_SCAN_MS_OFFSET = 0x100a;
EOF

echo "Synced $OUT from $IR_H"
