/**
 * RH850 UART2 slave board definitions — aligned with 单片机程序 firmware.
 * Single source of truth for BoardID, register maps, channels, GPIO, protocol.
 */

export type SlaveBoardType = 'ad' | 'relay' | 'light' | 'resistor' | 'custom';
export type ChannelKind = 'current' | 'voltage' | 'resistance' | 'relay' | 'light' | 'digital';

export interface RegisterRegion {
  base: number;
  name: string;
  access: 'R' | 'W' | 'RW';
  description: string;
}

export interface ChannelDefinition {
  index: number;
  name: string;
  kind: ChannelKind;
  unit?: string;
  adcPin?: string;
  gpioPin?: string;
  regOffset: number;
}

export interface GpioMapping {
  signal: string;
  portPin: string;
  bit?: number;
}

export interface SlaveBoardConfig {
  chainPos: number;
  boardType: SlaveBoardType;
  boardId: number;
  enabled: boolean;
  diRegAddr: number;
  doRegAddr: number;
  ioBytes?: number;
}

export interface SlaveBoardDefinition {
  boardType: SlaveBoardType;
  name: string;
  article: string;
  shortLabel: string;
  firmware: string;
  boardId: number;
  baseId: number;
  diRegAddr: number;
  doRegAddr: number;
  ioLength: number;
  channelDesc: string;
  registerRegions: RegisterRegion[];
  channels: ChannelDefinition[];
  gpioPins?: GpioMapping[];
  specialFunctions?: string[];
  commInterface: 'UART2';
}

/** UART daisy-chain protocol (shared by all boards in 单片机程序) */
export const UART_SLAVE_PROTOCOL = {
  header: [0x55, 0xaa, 0x55, 0xaa] as const,
  minFrameLen: 10,
  maxSlaves: 16,
  controlIdForward: 0x00,
  controlIdLocal: 0x01,
  funcCodes: {
    masterReadReg: 0x44,
    masterReadRegAck: 0x45,
    masterWriteReg: 0x46,
    masterWriteRegAck: 0x47,
    hostReadReg: 0x64,
    hostWriteReg: 0x65,
    plcSlaveMap: 0x6f,
  },
  busFreeTimeMs: { slave: 0.25, master: 0.5 },
  segmentLayout: 'BoardID(2) + RegAddr(2) + RegCount(2) per chain slot',
} as const;

export const SLAVE_BOARD_DEFINITIONS: Record<
  Exclude<SlaveBoardType, 'custom'>,
  SlaveBoardDefinition
> = {
  ad: {
    boardType: 'ad',
    name: 'AD 电流采样板',
    article: 'SEEYAO-SLV-AD',
    shortLabel: 'AD',
    firmware: 'V2024112701',
    boardId: 0x0101,
    baseId: 0x0100,
    diRegAddr: 0x4000,
    doRegAddr: 0,
    ioLength: 13,
    commInterface: 'UART2',
    channelDesc: '6×电流 + 1×电阻 + 6×电压 @ 0x4000',
    registerRegions: [
      { base: 0x0000, name: 'Base', access: 'RW', description: 'BoardID, Version[64]' },
      {
        base: 0x2000,
        name: 'Config',
        access: 'RW',
        description: 'coefficient[13][2], 采样时间, 分压电阻',
      },
      {
        base: 0x4000,
        name: 'LiveData',
        access: 'R',
        description: 'adresult / adresult1ms / adresultcustom[13]',
      },
      {
        base: 0x6000,
        name: 'SpecialFunc',
        access: 'RW',
        description: '启动时间测试 / 高速采样 / 定时采样',
      },
      {
        base: 0x7000,
        name: 'SampleBuffer',
        access: 'R',
        description: '高速采样结果缓冲 (4096×uint16)',
      },
    ],
    channels: [
      { index: 0, name: 'CAD0', kind: 'current', unit: 'mA', adcPin: 'AN05', regOffset: 0 },
      { index: 1, name: 'CAD1', kind: 'current', unit: 'mA', adcPin: 'AN04', regOffset: 1 },
      { index: 2, name: 'CAD2', kind: 'current', unit: 'mA', adcPin: 'AN03', regOffset: 2 },
      { index: 3, name: 'CAD3', kind: 'current', unit: 'mA', adcPin: 'AN02', regOffset: 3 },
      { index: 4, name: 'CAD4', kind: 'current', unit: 'mA', adcPin: 'AN01', regOffset: 4 },
      { index: 5, name: 'CAD5', kind: 'current', unit: 'mA', adcPin: 'AN00', regOffset: 5 },
      { index: 6, name: 'RAD0', kind: 'resistance', unit: 'Ω', adcPin: 'AN12', regOffset: 6 },
      { index: 7, name: 'VAD0', kind: 'voltage', unit: 'mV', adcPin: 'AN10', regOffset: 7 },
      { index: 8, name: 'VAD1', kind: 'voltage', unit: 'mV', adcPin: 'AN11', regOffset: 8 },
      { index: 9, name: 'VAD2', kind: 'voltage', unit: 'mV', adcPin: 'AN09', regOffset: 9 },
      { index: 10, name: 'VAD3', kind: 'voltage', unit: 'mV', adcPin: 'AN08', regOffset: 10 },
      { index: 11, name: 'VAD4', kind: 'voltage', unit: 'mV', adcPin: 'AN06', regOffset: 11 },
      { index: 12, name: 'VAD5', kind: 'voltage', unit: 'mV', adcPin: 'AN07', regOffset: 12 },
    ],
    specialFunctions: ['启动时间测试', '高速采样 (8口, 4096点缓冲)', '定时采样 (32点)'],
  },
  relay: {
    boardType: 'relay',
    name: '继电器板',
    article: 'SEEYAO-SLV-RLY',
    shortLabel: 'RLY',
    firmware: 'V2024051401',
    boardId: 0x0201,
    baseId: 0x0200,
    diRegAddr: 0,
    doRegAddr: 0x4000,
    ioLength: 8,
    commInterface: 'UART2',
    channelDesc: '8 路继电器 (RLY bitmask) @ 0x4000，支持 PWM 模式',
    registerRegions: [
      { base: 0x0000, name: 'Base', access: 'RW', description: 'BoardID, Version' },
      { base: 0x2000, name: 'Config', access: 'RW', description: 'RLYMode0-7, 频率/占空比参数' },
      { base: 0x4000, name: 'LiveData', access: 'RW', description: 'RLY 位掩码 + 运行时 PWM 参数' },
    ],
    channels: [
      { index: 0, name: 'RLY0', kind: 'relay', gpioPin: 'P9.4', regOffset: 0 },
      { index: 1, name: 'RLY1', kind: 'relay', gpioPin: 'P9.3', regOffset: 1 },
      { index: 2, name: 'RLY2', kind: 'relay', gpioPin: 'P10.3', regOffset: 2 },
      { index: 3, name: 'RLY3', kind: 'relay', gpioPin: 'P10.4', regOffset: 3 },
      { index: 4, name: 'RLY4', kind: 'relay', gpioPin: 'P10.5', regOffset: 4 },
      { index: 5, name: 'RLY5', kind: 'relay', gpioPin: 'P10.15', regOffset: 5 },
      { index: 6, name: 'RLY6', kind: 'relay', gpioPin: 'P9.0', regOffset: 6 },
      { index: 7, name: 'RLY7', kind: 'relay', gpioPin: 'P9.1', regOffset: 7 },
    ],
    gpioPins: [
      { signal: 'RLY0', portPin: 'P9.4', bit: 0 },
      { signal: 'RLY1', portPin: 'P9.3', bit: 1 },
      { signal: 'RLY2', portPin: 'P10.3', bit: 2 },
      { signal: 'RLY3', portPin: 'P10.4', bit: 3 },
      { signal: 'RLY4', portPin: 'P10.5', bit: 4 },
      { signal: 'RLY5', portPin: 'P10.15', bit: 5 },
      { signal: 'RLY6', portPin: 'P9.0', bit: 6 },
      { signal: 'RLY7', portPin: 'P9.1', bit: 7 },
    ],
    specialFunctions: ['GPIO / PWM 双模式 (1-200Hz)'],
  },
  light: {
    boardType: 'light',
    name: '光感板',
    article: 'SEEYAO-SLV-LS',
    shortLabel: 'LS',
    firmware: 'V2024060501',
    boardId: 0x0501,
    baseId: 0x0500,
    diRegAddr: 0x4000,
    doRegAddr: 0x4400,
    ioLength: 19,
    commInterface: 'UART2',
    channelDesc: '19 通道光感 @ 0x4000，自动上报 @ 0x4400',
    registerRegions: [
      { base: 0x0000, name: 'Base', access: 'RW', description: 'BoardID, Version' },
      { base: 0x2000, name: 'Config', access: 'RW', description: 'coefficient[19][2], Samptime' },
      { base: 0x4000, name: 'LiveData', access: 'R', description: 'adresult[19], adTimeStamp' },
      { base: 0x4400, name: 'AutoSample', access: 'RW', description: 'SampleRun, SampleTotal' },
    ],
    channels: Array.from({ length: 19 }, (_, i) => ({
      index: i,
      name: `LS${i}`,
      kind: 'light' as ChannelKind,
      regOffset: i,
    })),
    specialFunctions: ['自动采样上报 (0x4400 SampleRun=1)'],
  },
  resistor: {
    boardType: 'resistor',
    name: '电阻测试板',
    article: 'SEEYAO-SLV-RES',
    shortLabel: 'RES',
    firmware: 'V2025050501',
    boardId: 0x0601,
    baseId: 0x0600,
    diRegAddr: 0x4000,
    doRegAddr: 0,
    ioLength: 20,
    commInterface: 'UART2',
    channelDesc: '20 通道电阻测量 @ 0x4000',
    registerRegions: [
      { base: 0x0000, name: 'Base', access: 'RW', description: 'BoardID, Version' },
      {
        base: 0x2000,
        name: 'Config',
        access: 'RW',
        description: 'DividerResistor[20], Coefficient[20][2]',
      },
      { base: 0x4000, name: 'LiveData', access: 'R', description: 'adresult[20] (Ω)' },
    ],
    channels: [
      ...Array.from({ length: 8 }, (_, i) => ({
        index: i,
        name: `R${i}`,
        kind: 'resistance' as ChannelKind,
        unit: 'Ω',
        regOffset: i,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        index: i + 8,
        name: `R${i + 8}`,
        kind: 'resistance' as ChannelKind,
        unit: 'Ω (10k divider)',
        regOffset: i + 8,
      })),
      { index: 18, name: 'R18', kind: 'resistance', unit: 'Ω (24.9k)', regOffset: 18 },
      { index: 19, name: 'R19', kind: 'resistance', unit: 'Ω (24.9k)', regOffset: 19 },
    ],
  },
};

export const MASTER_CONTROLLER = {
  name: 'RH850 R7F701581 Master',
  firmware: 'V2025042901',
  interfaces: {
    host: { port: 'UART3', baud: 115200, desc: '上位机 RH850 协议' },
    slaveChain: { port: 'UART2', baud: 115200, desc: 'PCAN 菊花链从板' },
    can: { count: 4, type: 'CAN-FD', regBase: 0x8000 },
    lin: { count: 2, ports: ['RLIN30', 'RLIN31'], regBase: 0x6000 },
  },
  registerRegions: [
    {
      base: 0x1000,
      name: 'Controller_Param',
      access: 'RW' as const,
      description: 'PCANPortMode, AutoMode 标志',
    },
    { base: 0x1c00, name: 'RunData', access: 'RW' as const, description: '软复位, 各阶段耗时统计' },
    { base: 0x3000, name: 'DI_Data', access: 'R' as const, description: '6 路 DI + PWM 捕捉' },
    { base: 0x4000, name: 'DO_Param', access: 'RW' as const, description: 'HSD 模式/频率/占空比' },
    { base: 0x4400, name: 'DO_Data', access: 'RW' as const, description: 'DO 状态 + DOcurrent[4]' },
    { base: 0x6000, name: 'LIN', access: 'RW' as const, description: 'LIN 参数/数据/自动发送' },
    { base: 0x8000, name: 'CAN', access: 'RW' as const, description: 'CAN 参数/过滤/自动发送' },
  ],
  diChannels: [
    { index: 0, name: 'DI0', gpioPin: 'P11.0' },
    { index: 1, name: 'DI1', gpioPin: 'P10.15' },
    { index: 2, name: 'DI2', gpioPin: 'P10.4' },
    { index: 3, name: 'DI3', gpioPin: 'P10.5' },
    { index: 4, name: 'DI4', gpioPin: 'P10.3' },
    { index: 5, name: 'DI5', gpioPin: 'P10.1' },
  ],
  doChannels: [
    { index: 0, name: 'HSD0', gpioPin: 'P9.0' },
    { index: 1, name: 'HSD1', gpioPin: 'P9.1' },
    { index: 2, name: 'HSD2', gpioPin: 'P9.4' },
    { index: 3, name: 'HSD3', gpioPin: 'P9.3' },
  ],
};

export const MASTER_BUILTIN_IO = {
  diRegAddr: 0x3000,
  doParamRegAddr: 0x4000,
  doRegAddr: 0x4400,
  diCount: 6,
  doCount: 4,
  diDesc: '6 路 DI + PWM 捕捉 @ 0x3000',
  doDesc: '4 路 HSD + DOcurrent[4] 电流 @ 0x4400',
};

export const DEFAULT_SLAVE_CHAIN: SlaveBoardConfig[] = [
  {
    chainPos: 1,
    boardType: 'ad',
    boardId: 0x0101,
    enabled: true,
    diRegAddr: 0x4000,
    doRegAddr: 0,
    ioBytes: 2,
  },
  {
    chainPos: 2,
    boardType: 'relay',
    boardId: 0x0201,
    enabled: true,
    diRegAddr: 0,
    doRegAddr: 0x4000,
    ioBytes: 2,
  },
  {
    chainPos: 3,
    boardType: 'light',
    boardId: 0x0501,
    enabled: true,
    diRegAddr: 0x4000,
    doRegAddr: 0x4400,
    ioBytes: 2,
  },
  {
    chainPos: 4,
    boardType: 'resistor',
    boardId: 0x0601,
    enabled: true,
    diRegAddr: 0x4000,
    doRegAddr: 0,
    ioBytes: 2,
  },
];

export function getSlaveDefinition(boardType: SlaveBoardType): SlaveBoardDefinition | undefined {
  if (boardType === 'custom') return undefined;
  return SLAVE_BOARD_DEFINITIONS[boardType];
}

export function formatBoardId(boardId: number): string {
  return `0x${boardId.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function formatRegAddr(addr: number): string {
  if (!addr) return '—';
  return `0x${addr.toString(16).toUpperCase()}`;
}

export function validateBoardIdForType(boardType: SlaveBoardType, boardId: number): boolean {
  if (boardType === 'custom') return boardId >= 0x0101 && boardId <= 0xffff;
  const def = SLAVE_BOARD_DEFINITIONS[boardType];
  return (boardId & 0xff00) === def.baseId;
}

export function slaveConfigFromDefinition(
  def: SlaveBoardDefinition,
  chainPos: number,
  enabled = true
): SlaveBoardConfig {
  return {
    chainPos,
    boardType: def.boardType,
    boardId: def.boardId,
    enabled,
    diRegAddr: def.diRegAddr,
    doRegAddr: def.doRegAddr,
    ioBytes: 2,
  };
}

export function resolveSlaveChain(slaveChain: SlaveBoardConfig[] | undefined): SlaveBoardConfig[] {
  if (slaveChain && slaveChain.length > 0) return slaveChain;
  return DEFAULT_SLAVE_CHAIN.map(s => ({ ...s }));
}

/** Build CPU slaveChain from installed IO modules (sorted by chainPos). */
export function buildChainFromIoModules(
  modules: Array<{
    boardType?: SlaveBoardType;
    boardId?: number;
    chainPos?: number;
    diRegAddr?: number;
    doRegAddr?: number;
    enabled?: boolean;
    type: string;
  }>
): SlaveBoardConfig[] {
  return modules
    .filter(m => m.type === 'io' && m.boardType && m.chainPos)
    .sort((a, b) => (a.chainPos ?? 0) - (b.chainPos ?? 0))
    .map(m => {
      const def = m.boardType ? getSlaveDefinition(m.boardType) : undefined;
      return {
        chainPos: m.chainPos!,
        boardType: m.boardType!,
        boardId: m.boardId ?? def?.boardId ?? 0,
        enabled: m.enabled ?? true,
        diRegAddr: m.diRegAddr ?? def?.diRegAddr ?? 0,
        doRegAddr: m.doRegAddr ?? def?.doRegAddr ?? 0,
        ioBytes: 2,
      };
    });
}

/** Suggest PLC tag addresses from hardware ioStart / channel index. */
export function suggestPlcTagAddress(
  ioStart: number,
  channelIndex: number,
  kind: 'input' | 'output' | 'word'
): string {
  if (kind === 'word') return `%IW${ioStart + channelIndex}`;
  if (kind === 'output') return `%Q${ioStart}.${channelIndex}`;
  return `%I${ioStart}.${channelIndex}`;
}

/** Register address for a channel's live data word at 0x4000 region. */
export function channelRegAddr(boardType: SlaveBoardType, channelIndex: number): number {
  const def = getSlaveDefinition(boardType);
  if (!def || !def.diRegAddr) return def?.doRegAddr ?? 0;
  return def.diRegAddr + channelIndex;
}

export function validateSlaveChain(chain: SlaveBoardConfig[]): string[] {
  const errors: string[] = [];
  if (chain.length > UART_SLAVE_PROTOCOL.maxSlaves) {
    errors.push(`从站数量 ${chain.length} 超过上限 ${UART_SLAVE_PROTOCOL.maxSlaves}`);
  }
  const positions = new Set<number>();
  for (const entry of chain) {
    if (positions.has(entry.chainPos)) {
      errors.push(`链位置 ${entry.chainPos} 重复`);
    }
    positions.add(entry.chainPos);
    if (!validateBoardIdForType(entry.boardType, entry.boardId)) {
      errors.push(`${formatBoardId(entry.boardId)} 与类型 ${entry.boardType} 不匹配`);
    }
  }
  return errors;
}
