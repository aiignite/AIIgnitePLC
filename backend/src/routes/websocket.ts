/**
 * WebSocket 实时通信路由
 */

import { FastifyInstance } from 'fastify';
import { createMockPLCRuntime, MockPLCRuntime } from '../services/mockPLC';

// 存储 Mock PLC 实例
const mockPLCs = new Map<string, MockPLCRuntime>();

// 存储 WebSocket 连接
const projectConnections = new Map<string, Set<any>>();

export function websocketRoutes(fastify: FastifyInstance) {
  // WebSocket 连接端点
  fastify.get(
    '/ws',
    { websocket: true },
    async (connection: any, req: any) => {
      const { socket } = connection;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const projectId = url.searchParams.get('project');

      if (!projectId) {
        socket.close(1008, 'Missing project parameter');
        return;
      }

      console.log(`📡 WebSocket 连接建立: project=${projectId}`);

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
                if (conn.socket.readyState === 1) { // OPEN = 1
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
      socket.send(JSON.stringify({
        type: 'connection_status',
        payload: { status: 'connected', projectId },
      }));

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
              }
              break;

            case 'unsubscribe':
              if (message.payload?.addresses) {
                message.payload.addresses.forEach((addr: string) => {
                  mockPLC.unsubscribe(addr);
                });
              }
              break;

            case 'write_value':
              if (message.payload?.address !== undefined) {
                mockPLC.writeValue(message.payload.address, message.payload.value);
                console.log(`✏️ 写入: ${message.payload.address} = ${message.payload.value}`);
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
    }
  );

  console.log('  ✅ /ws - WebSocket 路由已注册');
}
