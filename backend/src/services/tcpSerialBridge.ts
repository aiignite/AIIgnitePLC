/**
 * TCP Client session to USR-K serial-to-Ethernet module (transparent mode).
 */

import net from 'net';
import { config } from '../config';
import { Rh850FrameParser } from '../plc/rh850FrameParser';
import { isDeviceHostAllowed } from './deviceTcpPolicy';

export class DeviceSession {
  private socket: net.Socket | null = null;
  private parser = new Rh850FrameParser();
  private frameCb: ((frame: Uint8Array) => void) | null = null;
  private errorCb: ((err: Error) => void) | null = null;
  private connectedHost: string | null = null;
  private connectedPort: number | null = null;

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  get endpoint(): { host: string; port: number } | null {
    if (!this.connectedHost || this.connectedPort === null) return null;
    return { host: this.connectedHost, port: this.connectedPort };
  }

  onFrame(cb: (frame: Uint8Array) => void): void {
    this.frameCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  async connect(host: string, port: number, timeoutMs?: number): Promise<void> {
    if (!config.deviceTcp.enabled) {
      throw new Error('Device TCP bridge is disabled');
    }

    const normalizedHost = host.trim();
    if (!isDeviceHostAllowed(normalizedHost, config.deviceTcp.allowlist)) {
      throw new Error(`Host not allowed: ${normalizedHost}`);
    }

    if (port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }

    this.disconnect();
    this.parser.reset();

    const connectTimeout = timeoutMs ?? config.deviceTcp.connectTimeoutMs;

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: normalizedHost, port }, () => {
        socket.setNoDelay(true);
        this.socket = socket;
        this.connectedHost = normalizedHost;
        this.connectedPort = port;
        cleanup();
        resolve();
      });

      const onError = (err: Error) => {
        cleanup();
        socket.destroy();
        reject(err);
      };

      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error(`TCP connect timeout after ${connectTimeout}ms`));
      }, connectTimeout);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('error', onError);
      };

      socket.on('error', onError);
      socket.on('data', (data: Buffer) => {
        const frames = this.parser.pushChunk(data);
        for (const frame of frames) {
          this.frameCb?.(frame);
        }
      });
      socket.on('close', () => {
        this.socket = null;
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connectedHost = null;
    this.connectedPort = null;
    this.parser.reset();
  }

  async send(data: Buffer | Uint8Array): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('TCP session not connected');
    }

    await new Promise<void>((resolve, reject) => {
      this.socket!.write(Buffer.from(data), err => {
        if (err) {
          this.errorCb?.(err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export function createDeviceSession(): DeviceSession {
  return new DeviceSession();
}
