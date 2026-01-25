/**
 * 路由注册中心
 */

import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { projectRoutes } from './projects';
import { nodeRoutes } from './nodes';
import { tagRoutes } from './tags';
import { blockRoutes } from './blocks';
import { hardwareRoutes } from './hardware';
import { websocketRoutes } from './websocket';

export function registerRoutes(fastify: FastifyInstance) {
  // 前缀所有 API 路由
  fastify.register(async function (fastify) {
    // 健康检查（无前缀）
    fastify.register(healthRoutes);

    // API v1 路由
    fastify.register(async function (fastify) {
      // 项目管理
      fastify.register(projectRoutes);

      // 树节点管理
      fastify.register(nodeRoutes);

      // 变量管理
      fastify.register(tagRoutes);

      // 程序块管理
      fastify.register(blockRoutes);

      // 硬件配置管理
      fastify.register(hardwareRoutes);

      // WebSocket 路由
      websocketRoutes(fastify);
    }, { prefix: '/api/v1' });
  });

  console.log('📋 路由已注册');
}
