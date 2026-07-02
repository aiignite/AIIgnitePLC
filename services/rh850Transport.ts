/**
 * RH850 transport abstraction — Web Serial (local) or WebSocket TCP bridge (remote LAN)
 */

import { Rh850FrameParser } from './rh850FrameParser';

export interface SerialConnectOptions {
  baudRate: number;
}

export interface TcpConnectOptions {
  host: string;
  port: number;
  token: string;
}

export interface Rh850Transport {
  readonly kind: 'serial' | 'tcp';
  connect(options: SerialConnectOptions | TcpConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  sendFrame(frame: Uint8Array, delayMs?: number): Promise<void>;
  readFrame(timeoutMs?: number): Promise<Uint8Array | null>;
  isConnected(): boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

function wsBaseUrl(): string {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin + url.pathname.replace(/\/$/, '');
}

export class WebSerialTransport implements Rh850Transport {
  readonly kind = 'serial' as const;
  private port: SerialPort | null = null;
  private parser = new Rh850FrameParser();
  private pendingReads: Array<{
    resolve: (frame: Uint8Array | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private readerTask: Promise<void> | null = null;

  isConnected(): boolean {
    return this.port !== null;
  }

  async connect(options: SerialConnectOptions | TcpConnectOptions): Promise<void> {
    if (!('baudRate' in options)) {
      throw new Error('WebSerialTransport requires baudRate');
    }
    if (!navigator.serial) {
      throw new Error('Web Serial API not available');
    }
    const selected = await navigator.serial.requestPort();
    await selected.open({ baudRate: options.baudRate });
    this.port = selected;
    this.parser.reset();
    this.startReader();
  }

  async disconnect(): Promise<void> {
    this.rejectPendingReads();
    if (this.port) {
      try {
        await this.port.close();
      } catch {
        /* ignore */
      }
    }
    this.port = null;
    this.parser.reset();
  }

  async sendFrame(frame: Uint8Array, delayMs = 20): Promise<void> {
    if (!this.port?.writable) throw new Error('Serial port not connected');
    const writer = this.port.writable.getWriter();
    await writer.write(frame);
    writer.releaseLock();
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  async readFrame(timeoutMs = 500): Promise<Uint8Array | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const idx = this.pendingReads.findIndex(p => p.resolve === resolve);
        if (idx >= 0) this.pendingReads.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      this.pendingReads.push({ resolve, timer });
    });
  }

  private startReader(): void {
    if (!this.port?.readable) return;
    this.readerTask = (async () => {
      const reader = this.port!.readable!.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const frames = this.parser.pushChunk(value);
          for (const frame of frames) {
            const pending = this.pendingReads.shift();
            if (pending) {
              clearTimeout(pending.timer);
              pending.resolve(frame);
            }
          }
        }
      } catch {
        /* port closed */
      } finally {
        reader.releaseLock();
      }
    })();
  }

  private rejectPendingReads(): void {
    for (const p of this.pendingReads) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pendingReads = [];
  }
}

type WsServerMessage =
  | { type: 'connected'; host: string; port: number }
  | { type: 'disconnected'; reason: string }
  | { type: 'frame'; data: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' };

export class WsDeviceTransport implements Rh850Transport {
  readonly kind = 'tcp' as const;
  private ws: WebSocket | null = null;
  private connected = false;
  private pendingReads: Array<{
    resolve: (frame: Uint8Array | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(options: SerialConnectOptions | TcpConnectOptions): Promise<void> {
    if (!('host' in options)) {
      throw new Error('WsDeviceTransport requires host and port');
    }

    await this.disconnect();

    const wsUrl = `${wsBaseUrl()}/ws/device?token=${encodeURIComponent(options.token)}`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 8000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'connect', host: options.host, port: options.port }));
      };

      ws.onmessage = ev => {
        const msg = JSON.parse(String(ev.data)) as WsServerMessage;
        if (msg.type === 'connected') {
          clearTimeout(timer);
          this.connected = true;
          resolve();
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(timer);
          reject(new Error(msg.message));
          return;
        }
        this.handleMessage(msg);
      };

      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        this.connected = false;
        this.rejectPendingReads();
      };

      this.ws = ws;
    });

    ws.onmessage = ev => {
      const msg = JSON.parse(String(ev.data)) as WsServerMessage;
      this.handleMessage(msg);
    };
  }

  async disconnect(): Promise<void> {
    this.rejectPendingReads();
    this.connected = false;
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'disconnect' }));
      }
      this.ws.close();
    }
    this.ws = null;
  }

  async sendFrame(frame: Uint8Array, delayMs = 20): Promise<void> {
    if (!this.isConnected()) throw new Error('Device TCP not connected');
    const b64 = btoa(String.fromCharCode(...frame));
    this.ws!.send(JSON.stringify({ type: 'send', data: b64 }));
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  async readFrame(timeoutMs = 500): Promise<Uint8Array | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const idx = this.pendingReads.findIndex(p => p.resolve === resolve);
        if (idx >= 0) this.pendingReads.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      this.pendingReads.push({ resolve, timer });
    });
  }

  private handleMessage(msg: WsServerMessage): void {
    if (msg.type === 'frame') {
      const raw = atob(msg.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pending = this.pendingReads.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(bytes);
      }
      return;
    }
    if (msg.type === 'disconnected') {
      this.connected = false;
      this.rejectPendingReads();
      return;
    }
    if (msg.type === 'error') {
      const pending = this.pendingReads.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(null);
      }
    }
  }

  private rejectPendingReads(): void {
    for (const p of this.pendingReads) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pendingReads = [];
  }
}

export function createSerialTransport(): WebSerialTransport {
  return new WebSerialTransport();
}

export function createTcpTransport(): WsDeviceTransport {
  return new WsDeviceTransport();
}
