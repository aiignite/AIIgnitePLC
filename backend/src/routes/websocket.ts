/**
 * WebSocket 实时通信路由
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { logAudit } from '../services/audit';
import { verifyToken } from '../services/authService';
import { createMockPLCRuntime, MockPLCRuntime } from '../services/mockPLC';

// 存储 Mock PLC 实例
const mockPLCs = new Map<string, MockPLCRuntime>();

// 存储 WebSocket 连接
const projectConnections = new Map<string, Set<any>>();

export function websocketRoutes(fastify: FastifyInstance) {
  // WebSocket 连接端点
  fastify.get('/ws', { websocket: true }, async (connection: any, req: any) => {
    const { socket } = connection;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const projectId = url.searchParams.get('project');
    const token = url.searchParams.get('token');

    if (!projectId) {
      socket.close(1008, 'Missing project parameter');
      return;
    }

    const tokenPayload = token ? verifyToken(token) : null;
    if (token && !tokenPayload) {
      socket.close(1008, 'Invalid token');
      return;
    }

    const userId = tokenPayload?.userId || null;

    const projectCheck = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projectCheck.rows.length === 0) {
      socket.close(1008, 'Project not found');
      return;
    }

    if (userId) {
      const ownerCheck = await query(
        'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
        [projectId, userId]
      );
      if (ownerCheck.rows.length === 0) {
        socket.close(1008, 'Forbidden');
        return;
      }
    }

    console.log(`📡 WebSocket 连接建立: project=${projectId}`);
    void logAudit({
      projectId,
      userId,
      action: 'plc.connect',
      entityType: 'plc',
      details: { source: 'websocket' },
    });

    // 初始化项目的连接集合
    if (!projectConnections.has(projectId)) {
      projectConnections.set(projectId, new Set());
    }
    // Store the connection object to match the broadcast loop expectation (conn.socket.send)
    projectConnections.get(projectId)!.add(connection);

    // 初始化项目的 Mock PLC
    if (!mockPLCs.has(projectId)) {
      const mockPLC = createMockPLCRuntime(projectId);
      mockPLCs.set(projectId, mockPLC);

      // 设置广播回调
      mockPLC.onUpdate((updates: any[]) => {
        const connections = projectConnections.get(projectId);
        if (connections) {
          const message = JSON.stringify({
            type: 'batch_update',
            payload: { updates },
          });

          connections.forEach((conn: any) => {
            try {
              if (conn.socket.readyState === 1) {
                // OPEN = 1
                conn.socket.send(message);
              }
            } catch (e) {
              // 连接已关闭，移除
              connections.delete(conn);
            }
          });
        }
      });
    }

    // 发送初始状态
    socket.send(
      JSON.stringify({
        type: 'connection_status',
        payload: { status: 'connected', projectId },
      })
    );

    // 发送 PLC 运行状态
    const currentPLC = mockPLCs.get(projectId);
    socket.send(
      JSON.stringify({
        type: 'plc_status',
        payload: { plcStatus: currentPLC ? currentPLC.getStatus() : 'unknown' },
      })
    );

    // 处理客户端消息
    socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        const mockPLC = mockPLCs.get(projectId);

        if (!mockPLC) return;

        switch (message.type) {
          case 'subscribe':
            if (message.payload?.addresses) {
              message.payload.addresses.forEach((addr: string) => {
                mockPLC.subscribe(addr);
              });
              console.log(`📧 订阅地址:`, message.payload.addresses);
              void logAudit({
                projectId,
                action: 'plc.subscribe',
                entityType: 'plc_tag',
                details: {
                  addressesCount: message.payload.addresses.length,
                  source: 'websocket',
                },
              });
            }
            break;

          case 'plc_control':
            if (message.payload?.action === 'start') {
              mockPLC.start();
              void logAudit({
                projectId,
                userId,
                action: 'plc.start',
                entityType: 'plc',
                details: { source: 'websocket' },
              });
            } else if (message.payload?.action === 'stop') {
              mockPLC.stop();
              void logAudit({
                projectId,
                userId,
                action: 'plc.stop',
                entityType: 'plc',
                details: { source: 'websocket' },
              });
            }

            {
              const statusMessage = JSON.stringify({
                type: 'plc_status',
                payload: { plcStatus: mockPLC ? mockPLC.getStatus() : 'unknown' },
              });

              const connections = projectConnections.get(projectId);
              if (connections) {
                connections.forEach((conn: any) => {
                  try {
                    if (conn.socket.readyState === 1) {
                      conn.socket.send(statusMessage);
                    }
                  } catch (e) {
                    connections.delete(conn);
                  }
                });
              }
            }
            break;

          case 'unsubscribe':
            if (message.payload?.addresses) {
              message.payload.addresses.forEach((addr: string) => {
                mockPLC.unsubscribe(addr);
              });
              void logAudit({
                projectId,
                userId,
                action: 'plc.unsubscribe',
                entityType: 'plc_tag',
                details: {
                  addressesCount: message.payload.addresses.length,
                  source: 'websocket',
                },
              });
            }
            break;

          case 'write_value':
            if (message.payload?.address !== undefined) {
              mockPLC.writeValue(message.payload.address, message.payload.value);
              console.log(`✏️ 写入: ${message.payload.address} = ${message.payload.value}`);
              void logAudit({
                projectId,
                userId,
                action: 'plc.write',
                entityType: 'plc_tag',
                details: {
                  address: message.payload.address,
                  value: message.payload.value,
                  source: 'websocket',
                },
              });
            }
            break;

          case 'load_bytecode':
            if (message.payload?.binary) {
              const buf = Buffer.from(message.payload.binary, 'base64');
              mockPLC.loadBytecode(new Uint8Array(buf));
              console.log(`📦 Mock PLC 已加载字节码 (${buf.length} bytes)`);
            }
            break;

          default:
            console.warn(`⚠️ 未知消息: ${message.type}`);
        }
      } catch (error) {
        console.error('❌ 处理消息失败:', error);
      }
    });

    // 清理连接
    socket.on('close', () => {
      console.log(`📡 连接关闭: project=${projectId}`);
      void logAudit({
        projectId,
        userId,
        action: 'plc.disconnect',
        entityType: 'plc',
        details: { source: 'websocket' },
      });
      const connections = projectConnections.get(projectId);
      if (connections) {
        connections.delete(connection);
        if (connections.size === 0) {
          const mockPLC = mockPLCs.get(projectId);
          if (mockPLC) {
            mockPLC.stop();
            mockPLCs.delete(projectId);
          }
          projectConnections.delete(projectId);
        }
      }
    });
  });

  console.log('  ✅ /ws - WebSocket 路由已注册');
}
