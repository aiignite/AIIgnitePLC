/**
 * Mock PLC — uses NodePlcVm when bytecode program is loaded
 */

import { loadProgramFromBinary, NodePlcVm } from '../plc/simVm';

export interface PLCValueUpdate {
  address: string;
  value: boolean | number | string;
  quality: 'good' | 'bad';
}

export type UpdateCallback = (updates: PLCValueUpdate[]) => void;

export class MockPLCRuntime {
  private subscriptions: Set<string> = new Set();
  private updateCallback?: UpdateCallback;
  private intervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private vm: NodePlcVm;
  private tickMs = 0;
  private scanMs = 10;
  private useVm = false;

  private readonly defaultState: Record<string, boolean | number> = {
    '%I0.0': false,
    '%I0.1': false,
    '%Q0.0': false,
    '%M0.0': false,
  };

  constructor(_projectId: string) {
    this.vm = new NodePlcVm();
    for (const [addr, val] of Object.entries(this.defaultState)) {
      if (typeof val === 'boolean') this.vm.setInput(addr, val);
    }
  }

  loadBytecode(binary: Uint8Array): void {
    try {
      const { tags, bytecode } = loadProgramFromBinary(binary);
      this.vm.loadProgram(tags, bytecode);
      this.useVm = bytecode.length > 0;
    } catch {
      this.useVm = false;
    }
  }

  start(updateInterval = 100): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.simulateCycle(), updateInterval);
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  getStatus(): 'running' | 'stopped' {
    return this.isRunning ? 'running' : 'stopped';
  }

  subscribe(address: string): void {
    this.subscriptions.add(address);
    const val = this.readAddress(address);
    if (val !== undefined && this.updateCallback) {
      this.updateCallback([{ address, value: val, quality: 'good' }]);
    }
  }

  unsubscribe(address: string): void {
    this.subscriptions.delete(address);
  }

  writeValue(address: string, value: unknown): void {
    if (typeof value === 'boolean') {
      this.vm.setInput(address, value);
    }
    if (this.updateCallback) {
      this.updateCallback([
        { address, value: value as boolean | number | string, quality: 'good' },
      ]);
    }
  }

  onUpdate(callback: UpdateCallback): void {
    this.updateCallback = callback;
  }

  private readAddress(address: string): boolean | number | string | undefined {
    const m = address.match(/^%([IQM])(\d+)\.(\d+)$/i);
    if (!m) return undefined;
    const map: Record<string, number> = { I: 0, Q: 1, M: 2 };
    const mc = map[m[1].toUpperCase()];
    if (mc === undefined) return undefined;
    return this.vm.readBit(mc, parseInt(m[2], 10), parseInt(m[3], 10));
  }

  private simulateCycle(): void {
    this.tickMs += this.scanMs;
    this.vm.setTimerTick(this.tickMs);

    if (Math.random() < 0.02) {
      const cur = this.vm.readBit(0, 0, 0);
      this.vm.setInput('%I0.0', !cur);
    }

    const updates: PLCValueUpdate[] = [];

    if (this.useVm) {
      this.vm.executeScan();
      for (const addr of this.subscriptions) {
        const val = this.readAddress(addr);
        if (val !== undefined) {
          updates.push({ address: addr, value: val, quality: 'good' });
        }
      }
    } else {
      const startBtn = this.vm.readBit(0, 0, 0);
      const stopBtn = this.vm.readBit(0, 0, 1);
      const latch = this.vm.readBit(2, 0, 0);
      const newLatch = (startBtn || latch) && !stopBtn;
      this.vm.writeBit(2, 0, 0, newLatch);
      this.vm.writeBit(1, 0, 0, newLatch);
      for (const addr of ['%M0.0', '%Q0.0']) {
        if (this.subscriptions.has(addr)) {
          const val = this.readAddress(addr);
          if (val !== undefined) updates.push({ address: addr, value: val, quality: 'good' });
        }
      }
    }

    if (updates.length > 0 && this.updateCallback) {
      this.updateCallback(updates);
    }
  }
}

export function createMockPLCRuntime(projectId: string): MockPLCRuntime {
  const plc = new MockPLCRuntime(projectId);
  plc.start();
  return plc;
}
