import { create } from 'zustand';
import { fetchWithAuth } from '../services/authFetch';
import {
  buildChainFromIoModules,
  DEFAULT_SLAVE_CHAIN,
  resolveSlaveChain,
  SLAVE_BOARD_DEFINITIONS,
  type SlaveBoardConfig,
  type SlaveBoardType,
} from '../types/rh850Slaves';

export type { SlaveBoardConfig, SlaveBoardType };

export interface HardwareModule {
  slot: number;
  name: string;
  articleNumber: string;
  firmware: string;
  type: 'ps' | 'cpu' | 'io' | 'comm' | 'empty';
  image?: string;
  // Extended Properties
  ip?: string;
  subnet?: string;
  ioStart?: number;
  ioLength?: number;
  hwId?: number;
  comment?: string;
  // USR-K super-port on PCBA
  moduleType?: 'K2' | 'K3';
  moduleIp?: string;
  tcpPort?: number;
  baudRate?: number;
  // UART2 slave chain (stored on CPU module)
  slaveChain?: SlaveBoardConfig[];
  // Per-slave-board fields (stored on IO modules)
  boardType?: SlaveBoardType;
  boardId?: number;
  chainPos?: number;
  diRegAddr?: number;
  doRegAddr?: number;
  enabled?: boolean;
}

interface HardwareState {
  modules: HardwareModule[];
  isLoading: boolean;
  error: string | null;

  loadHardware: (projectId: string) => Promise<void>;
  updateModule: (projectId: string, slot: number, module: HardwareModule) => Promise<void>;
  deleteModule: (projectId: string, slot: number) => Promise<void>;
  getCpuModule: () => HardwareModule | undefined;
  updateSlaveChain: (projectId: string, chain: SlaveBoardConfig[]) => Promise<void>;
  syncSlaveChainFromModules: (projectId: string) => Promise<void>;
  getEffectiveSlaveChain: () => SlaveBoardConfig[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

function buildDefaultSlaveIoModule(
  slot: number,
  boardType: Exclude<SlaveBoardType, 'custom'>,
  chainPos: number,
  hwId: number
): HardwareModule {
  const def = SLAVE_BOARD_DEFINITIONS[boardType];
  return {
    slot,
    name: def.name,
    articleNumber: def.article,
    firmware: def.firmware,
    type: 'io',
    hwId,
    ioStart: 100 + (chainPos - 1) * def.ioLength,
    ioLength: def.ioLength,
    boardType: def.boardType,
    boardId: def.boardId,
    chainPos,
    diRegAddr: def.diRegAddr,
    doRegAddr: def.doRegAddr,
    enabled: true,
  };
}

const DEFAULT_MODULES: HardwareModule[] = [
  {
    slot: 1,
    name: 'PM 24V',
    articleNumber: 'SEEYAO-PS-24V',
    firmware: '-',
    type: 'ps',
    hwId: 257,
  },
  {
    slot: 2,
    name: 'RH850 R7F701581 Master',
    articleNumber: 'SEEYAO-PLC-MASTER',
    firmware: 'V2025042901',
    type: 'cpu',
    ip: '192.168.0.10',
    subnet: '255.255.255.0',
    hwId: 64,
    moduleType: 'K2',
    moduleIp: '192.168.0.10',
    tcpPort: 8234,
    baudRate: 115200,
    slaveChain: DEFAULT_SLAVE_CHAIN.map(s => ({ ...s })),
  },
  buildDefaultSlaveIoModule(3, 'ad', 1, 263),
  buildDefaultSlaveIoModule(4, 'relay', 2, 264),
  buildDefaultSlaveIoModule(5, 'light', 3, 265),
  buildDefaultSlaveIoModule(6, 'resistor', 4, 266),
];

function mapRowToModule(row: {
  slot: number;
  name: string;
  article_number: string;
  firmware: string;
  type: HardwareModule['type'];
  hw_id?: number;
  config?: Record<string, unknown>;
}): HardwareModule {
  const cfg = row.config ?? {};
  return {
    slot: row.slot,
    name: row.name,
    articleNumber: row.article_number,
    firmware: row.firmware,
    type: row.type,
    hwId: row.hw_id,
    ip: cfg.ip as string | undefined,
    subnet: cfg.subnet as string | undefined,
    ioStart: cfg.ioStart as number | undefined,
    ioLength: cfg.ioLength as number | undefined,
    moduleType: cfg.moduleType as 'K2' | 'K3' | undefined,
    moduleIp: cfg.moduleIp as string | undefined,
    tcpPort: cfg.tcpPort as number | undefined,
    baudRate: cfg.baudRate as number | undefined,
    slaveChain: cfg.slaveChain as SlaveBoardConfig[] | undefined,
    boardType: cfg.boardType as SlaveBoardType | undefined,
    boardId: cfg.boardId as number | undefined,
    chainPos: cfg.chainPos as number | undefined,
    diRegAddr: cfg.diRegAddr as number | undefined,
    doRegAddr: cfg.doRegAddr as number | undefined,
    enabled: cfg.enabled as boolean | undefined,
  };
}

function moduleToPayload(module: HardwareModule) {
  return {
    slot: module.slot,
    name: module.name,
    article_number: module.articleNumber || '',
    firmware: module.firmware || '',
    type: module.type,
    hw_id: module.hwId,
    config: {
      ip: module.ip,
      subnet: module.subnet,
      ioStart: module.ioStart,
      ioLength: module.ioLength,
      moduleType: module.moduleType,
      moduleIp: module.moduleIp,
      tcpPort: module.tcpPort,
      baudRate: module.baudRate,
      slaveChain: module.slaveChain,
      boardType: module.boardType,
      boardId: module.boardId,
      chainPos: module.chainPos,
      diRegAddr: module.diRegAddr,
      doRegAddr: module.doRegAddr,
      enabled: module.enabled,
    },
  };
}

export const useHardwareStore = create<HardwareState>((set, get) => ({
  modules: [],
  isLoading: false,
  error: null,

  getCpuModule: () => get().modules.find(m => m.type === 'cpu'),

  loadHardware: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const res = await fetchWithAuth(`${API_BASE}/projects/${projectId}/hardware`);
      if (res.ok) {
        const data = await res.json();

        if (data.length === 0) {
          set({ modules: DEFAULT_MODULES, isLoading: false });
          const { updateModule } = get();
          await Promise.all(
            DEFAULT_MODULES.map(module => updateModule(projectId, module.slot, module))
          );
          return;
        }

        const mapped: HardwareModule[] = data.map(mapRowToModule);
        set({ modules: mapped, isLoading: false });
      } else {
        throw new Error('Failed to fetch hardware');
      }
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Unknown error';
      set({ error: message, isLoading: false, modules: DEFAULT_MODULES });
    }
  },

  updateModule: async (projectId: string, slot: number, module: HardwareModule) => {
    set(state => ({
      modules: state.modules.some(m => m.slot === slot)
        ? state.modules.map(m => (m.slot === slot ? module : m))
        : [...state.modules, module],
    }));

    try {
      await fetchWithAuth(`${API_BASE}/projects/${projectId}/hardware/slot/${slot}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moduleToPayload(module)),
      });
    } catch (e) {
      console.error(e);
    }
  },

  updateSlaveChain: async (projectId: string, chain: SlaveBoardConfig[]) => {
    const cpu = get().getCpuModule();
    if (!cpu) return;
    const updated: HardwareModule = { ...cpu, slaveChain: chain };
    await get().updateModule(projectId, cpu.slot, updated);
  },

  syncSlaveChainFromModules: async (projectId: string) => {
    const chain = buildChainFromIoModules(get().modules);
    if (chain.length === 0) return;
    await get().updateSlaveChain(projectId, chain);
  },

  getEffectiveSlaveChain: () => {
    const fromModules = buildChainFromIoModules(get().modules);
    if (fromModules.length > 0) return fromModules;
    return resolveSlaveChain(get().getCpuModule()?.slaveChain);
  },

  deleteModule: async (projectId: string, slot: number) => {
    set(state => ({
      modules: state.modules.filter(m => m.slot !== slot),
    }));

    try {
      await fetchWithAuth(`${API_BASE}/projects/${projectId}/hardware/slot/${slot}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error(e);
    }
  },
}));
