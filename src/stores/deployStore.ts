import { create } from 'zustand';
import {
  buildForceFrame,
  buildMonitorFrame,
  buildPlcStatusFrame,
  parseMonitorResponse,
  parsePlcStatusResponse,
  readFrame,
  sendFrame,
} from '../../services/rh850Protocol';
import type { Rh850Transport } from '../../services/rh850Transport';

/** Module-level transport (not serializable in zustand) */
let activeTransport: Rh850Transport | null = null;

export interface HwPlcStatus {
  mode: number;
  scanMs: number;
  lastScanUs: number;
  errorCode: number;
  errorMessage: string;
}

export type ConnectionMode = 'serial' | 'tcp';

interface DeployState {
  downloadHex: string;
  deployHex: string;
  scanMs: number;
  connected: boolean;
  connectionMode: ConnectionMode;
  deviceHost: string;
  devicePort: number;
  hwStatus: HwPlcStatus | null;
  minScanUs: number;
  maxScanUs: number;
}

interface DeployActions {
  setCompileResult: (downloadHex: string, deployHex?: string) => void;
  setScanMs: (ms: number) => void;
  setTransport: (transport: Rh850Transport | null) => void;
  getTransport: () => Rh850Transport | null;
  setConnectionMode: (mode: ConnectionMode) => void;
  setDeviceEndpoint: (host: string, port: number) => void;
  pollHwStatus: () => Promise<HwPlcStatus | null>;
  forceAddress: (address: string, value: boolean, enable: boolean) => Promise<boolean>;
  monitorAddress: (address: string) => Promise<boolean | null>;
  setHwStatus: (status: HwPlcStatus | null) => void;
}

export const useDeployStore = create<DeployState & DeployActions>(set => ({
  downloadHex: '',
  deployHex: '',
  scanMs: 10,
  connected: false,
  connectionMode: 'serial',
  deviceHost: '192.168.0.10',
  devicePort: 8234,
  hwStatus: null,
  minScanUs: 0,
  maxScanUs: 0,

  setCompileResult: (downloadHex, deployHex) => {
    set({ downloadHex, deployHex: deployHex || downloadHex });
  },

  setScanMs: ms => set({ scanMs: ms }),

  setTransport: transport => {
    activeTransport = transport;
    set({ connected: !!transport?.isConnected() });
  },

  getTransport: () => activeTransport,

  setConnectionMode: mode => set({ connectionMode: mode }),

  setDeviceEndpoint: (host, port) => set({ deviceHost: host, devicePort: port }),

  pollHwStatus: async () => {
    const transport = activeTransport;
    if (!transport?.isConnected()) return null;
    await sendFrame(transport, buildPlcStatusFrame(), 0);
    const resp = await readFrame(transport, 400);
    if (!resp) return null;
    const parsed = parsePlcStatusResponse(resp);
    if (!parsed) return null;
    const status: HwPlcStatus = {
      mode: parsed.mode,
      scanMs: parsed.scanMs,
      lastScanUs: parsed.lastScanUs,
      errorCode: parsed.errorCode,
      errorMessage: parsed.errorMessage,
    };
    set(state => ({
      hwStatus: status,
      minScanUs:
        state.minScanUs === 0 ? parsed.lastScanUs : Math.min(state.minScanUs, parsed.lastScanUs),
      maxScanUs: Math.max(state.maxScanUs, parsed.lastScanUs),
    }));
    return status;
  },

  forceAddress: async (address, value, enable) => {
    const transport = activeTransport;
    if (!transport?.isConnected()) return false;
    const parsed = parseAddressFromFrontend(address);
    if (!parsed) return false;
    await sendFrame(
      transport,
      buildForceFrame(parsed.memClass, parsed.byteOffset, parsed.bitOffset, value, enable)
    );
    const resp = await readFrame(transport, 300);
    return resp !== null;
  },

  monitorAddress: async address => {
    const transport = activeTransport;
    if (!transport?.isConnected()) return null;
    const parsed = parseAddressFromFrontend(address);
    if (!parsed) return null;
    await sendFrame(
      transport,
      buildMonitorFrame(parsed.memClass, parsed.byteOffset, parsed.bitOffset)
    );
    const resp = await readFrame(transport, 300);
    if (!resp) return null;
    return parseMonitorResponse(resp);
  },

  setHwStatus: status => set({ hwStatus: status }),
}));

function parseAddressFromFrontend(addr: string): {
  memClass: number;
  byteOffset: number;
  bitOffset: number;
} | null {
  if (!addr?.startsWith('%')) return null;
  const bit = addr.match(/^%([IQM])(\d+)\.(\d+)$/i);
  if (bit) {
    const map: Record<string, number> = { I: 0, Q: 1, M: 2 };
    return {
      memClass: map[bit[1].toUpperCase()] ?? 2,
      byteOffset: parseInt(bit[2], 10),
      bitOffset: parseInt(bit[3], 10),
    };
  }
  const simple = addr.match(/^%([IQM])(\d+)$/i);
  if (simple) {
    const map: Record<string, number> = { I: 0, Q: 1, M: 2 };
    return {
      memClass: map[simple[1].toUpperCase()] ?? 2,
      byteOffset: parseInt(simple[2], 10),
      bitOffset: 0,
    };
  }
  return null;
}
