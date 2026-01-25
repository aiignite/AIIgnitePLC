/**
 * PLC 运行时状态管理
 * 处理 WebSocket 连接和实时数据更新
 */

import { create } from 'zustand';

export interface RuntimeValue {
  address: string;
  value: boolean | number | string;
  quality: 'good' | 'bad';
  timestamp: number;
}

interface WebSocketMessage {
  type: 'connection_status' | 'batch_update' | 'tag_update';
  payload: {
    status?: 'connected' | 'disconnected';
    projectId?: string;
    updates?: Array<{
      address: string;
      value: boolean | number | string;
      quality: 'good' | 'bad';
    }>;
    update?: {
      address: string;
      value: boolean | number | string;
      quality: 'good' | 'bad';
    };
  };
}

interface RuntimeState {
  // 状态
  isOnline: boolean;
  runtimeValues: Map<string, RuntimeValue>;
  projectId: string | null;
  wsConnection: WebSocket | null;
  connectionError: string | null;

  // 操作
  connect: (projectId: string) => void;
  disconnect: () => void;
  subscribeAddresses: (addresses: string[]) => void;
  unsubscribeAddresses: (addresses: string[]) => void;
  writeValue: (address: string, value: any) => void;
  updateRuntimeValues: (updates: Array<{ address: string; value: any; quality: 'good' | 'bad' }>) => void;
  getRuntimeValue: (address: string) => RuntimeValue | undefined;
  clearValues: () => void;
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  // 初始状态
  isOnline: false,
  runtimeValues: new Map(),
  projectId: null,
  wsConnection: null,
  connectionError: null,

  /**
   * 连接到 WebSocket 服务器
   */
  connect: (projectId: string) => {
    // 如果已有连接，先断开
    const existingConnection = get().wsConnection;
    if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
      existingConnection.close();
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws?project=${projectId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('📡 Runtime WebSocket 连接成功:', projectId);
      set({ isOnline: true, connectionError: null, projectId });
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'connection_status') {
          console.log('📡 连接状态:', message.payload.status);
          set({ isOnline: message.payload.status === 'connected' });
        } else if (message.type === 'batch_update') {
          get().updateRuntimeValues(message.payload.updates || []);
        } else if (message.type === 'tag_update') {
          const update = message.payload.update;
          if (update) {
            get().updateRuntimeValues([update]);
          }
        }
      } catch (error) {
        console.error('❌ 解析 WebSocket 消息失败:', error);
      }
    };

    ws.onerror = (event: Event) => {
      console.error('❌ WebSocket 错误:', event);
      set({
        connectionError: 'WebSocket 连接错误',
        isOnline: false,
      });
    };

    ws.onclose = () => {
      console.log('📡 WebSocket 连接关闭');
      set({
        isOnline: false,
        wsConnection: null,
      });
    };

    set({ wsConnection: ws });
  },

  /**
   * 断开 WebSocket 连接
   */
  disconnect: () => {
    const ws = get().wsConnection;
    if (ws) {
      ws.close();
    }
    set({
      wsConnection: null,
      isOnline: false,
      projectId: null,
      connectionError: null,
    });
  },

  /**
   * 订阅地址变化
   */
  subscribeAddresses: (addresses: string[]) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { addresses },
      }));
      console.log('📧 订阅地址:', addresses);
    } else {
      console.warn('⚠️ WebSocket 未连接，无法订阅');
    }
  },

  /**
   * 取消订阅地址
   */
  unsubscribeAddresses: (addresses: string[]) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'unsubscribe',
        payload: { addresses },
      }));
    }
  },

  /**
   * 写入值到 PLC
   */
  writeValue: (address: string, value: any) => {
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'write_value',
        payload: { address, value },
      }));
      console.log('✏️ 写入:', address, '=', value);
    } else {
      console.warn('⚠️ WebSocket 未连接，无法写入值');
    }
  },

  /**
   * 更新运行时值
   */
  updateRuntimeValues: (updates) => {
    const runtimeValues = new Map(get().runtimeValues);
    const now = Date.now();

    updates.forEach(({ address, value, quality }) => {
      runtimeValues.set(address, {
        address,
        value,
        quality,
        timestamp: now,
      });
    });

    set({ runtimeValues });
  },

  /**
   * 获取单个运行时值
   */
  getRuntimeValue: (address: string) => {
    return get().runtimeValues.get(address);
  },

  /**
   * 清空所有运行时值
   */
  clearValues: () => {
    set({ runtimeValues: new Map() });
  },
}));
