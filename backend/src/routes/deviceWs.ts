/**
 * WebSocket device bridge — browser ↔ backend ↔ USR-K TCP Server
 */

import { FastifyInstance } from 'fastify';
import { logAudit } from '../services/audit';
import { verifyToken } from '../services/authService';
import { createDeviceSession, DeviceSession } from '../services/tcpSerialBridge';

type ClientMessage =
  | { type: 'connect'; host: string; port: number }
  | { type: 'disconnect' }
  | { type: 'send'; data: string }
  | { type: 'ping' };

function sendJson(socket: any, payload: Record<string, unknown>): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

export function deviceWsRoutes(fastify: FastifyInstance) {
  fastify.get('/ws/device', { websocket: true }, (connection: any, req: any) => {
    const { socket } = connection;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    const tokenPayload = token ? verifyToken(token) : null;
    if (!token || !tokenPayload) {
      socket.close(1008, 'Authentication required');
      return;
    }

    const userId = tokenPayload.userId;
    let session: DeviceSession | null = null;

    const ensureSession = (): DeviceSession => {
      if (!session) {
        session = createDeviceSession();
        session.onFrame(frame => {
          sendJson(socket, { type: 'frame', data: Buffer.from(frame).toString('base64') });
        });
        session.onError(err => {
          sendJson(socket, { type: 'error', message: err.message, code: 'TCP_ERROR' });
        });
      }
      return session;
    };

    const teardown = (reason: string) => {
      if (session?.isConnected) {
        void logAudit({
          userId,
          action: 'plc.device.disconnect',
          entityType: 'device_tcp',
          details: { reason, endpoint: session.endpoint },
        });
      }
      session?.disconnect();
      session = null;
    };

    socket.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        sendJson(socket, { type: 'error', message: 'Invalid JSON', code: 'BAD_MESSAGE' });
        return;
      }

      try {
        switch (msg.type) {
          case 'ping':
            sendJson(socket, { type: 'pong' });
            break;

          case 'connect': {
            const dev = ensureSession();
            if (dev.isConnected) dev.disconnect();

            await dev.connect(msg.host, msg.port);
            await logAudit({
              userId,
              action: 'plc.device.connect',
              entityType: 'device_tcp',
              details: { host: msg.host, port: msg.port },
            });
            sendJson(socket, { type: 'connected', host: msg.host, port: msg.port });
            break;
          }

          case 'disconnect':
            teardown('client_disconnect');
            sendJson(socket, { type: 'disconnected', reason: 'client_disconnect' });
            break;

          case 'send': {
            const dev = ensureSession();
            if (!dev.isConnected) {
              sendJson(socket, { type: 'error', message: 'Not connected', code: 'NOT_CONNECTED' });
              return;
            }
            const buf = Buffer.from(msg.data, 'base64');
            await dev.send(buf);
            break;
          }

          default:
            sendJson(socket, { type: 'error', message: 'Unknown message type', code: 'UNKNOWN' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        sendJson(socket, { type: 'error', message, code: 'OPERATION_FAILED' });
      }
    });

    socket.on('close', () => {
      teardown('ws_closed');
    });
  });
}
