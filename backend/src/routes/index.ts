/**
 * 路由注册中心
 */

import { FastifyInstance } from 'fastify';
import { aiRoutes } from './ai';
import { authRoutes } from './auth';
import { blockRoutes } from './blocks';
import { hardwareRoutes } from './hardware';
import { healthRoutes } from './health';
import { nodeRoutes } from './nodes';
import { plcRoutes } from './plc';
import { projectRoutes } from './projects';
import { tagRoutes } from './tags';
import { websocketRoutes } from './websocket';

export function registerRoutes(fastify: FastifyInstance) {
  // 前缀所有 API 路由
  fastify.register(async function (fastify) {
    // 健康检查（无前缀）
    fastify.register(healthRoutes);

    // API v1 路由
    fastify.register(
      async function (fastify) {
        // 认证路由
        fastify.register(authRoutes);

        // 项目管理
        fastify.register(projectRoutes);

        // AI 助手代理
        fastify.register(aiRoutes);

        // 树节点管理
        fastify.register(nodeRoutes);

        // 变量管理
        fastify.register(tagRoutes);

        // 程序块管理
        fastify.register(blockRoutes);

        // PLC 编译与下载
        fastify.register(plcRoutes);

        // 硬件配置管理
        fastify.register(hardwareRoutes);

        // WebSocket 路由
        websocketRoutes(fastify);
      },
      { prefix: '/api/v1' }
    );
  });

  console.log('📋 路由已注册');
  console.log('  ✅ /health - 健康检查路由已注册');
  console.log('  ✅ /ws - WebSocket 路由已注册');
  console.log('  ✅ /api/v1/auth - 认证路由已注册');
  console.log('  ✅ /api/v1/projects - 项目管理路由已注册');
  console.log('  ✅ /api/v1/ai/chat - AI 助手代理路由已注册');
  console.log('  ✅ /api/v1/nodes - 树节点管理路由已注册');
  console.log('  ✅ /api/v1/tags - 变量管理路由已注册');
  console.log('  ✅ /api/v1/blocks - 程序块管理路由已注册');
}
