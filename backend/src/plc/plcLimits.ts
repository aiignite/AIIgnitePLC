/**
 * PLC resource limits — must stay in sync with seeyaoplcmaster app/plc/plc_ir.h
 */

export const PLC_MAX_TAGS = 128;
export const PLC_MAX_BYTECODE = 8192;
export const PLC_MAX_FB_INSTANCES = 32;
export const PLC_MAX_SFC_STEPS = 32;
export const PLC_MAX_SFC_TRANS = 64;
export const PLC_MAX_LD_RUNGS = 64;
export const PLC_MAX_LD_ELEMENTS = 16;
export const PLC_MAX_SLAVE_IO = 16;
export const PLC_M_AREA_BYTES = 128;
export const PLC_DB_AREA_BYTES = 256;
export const PLC_SCAN_MS_DEFAULT = 10;
export const PLC_SCAN_MS_MIN = 1;
export const PLC_SCAN_MS_MAX = 100;

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
