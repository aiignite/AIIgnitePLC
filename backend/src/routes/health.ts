/**
 * 健康检查路由
 */

import { FastifyInstance } from 'fastify';
import { getPoolStats } from '../db';

export async function healthRoutes(fastify: FastifyInstance) {
  // 基础健康检查
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  });

  // 详细健康检查（包含数据库状态）
  fastify.get('/health/detail', async () => {
    const poolStats = getPoolStats();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        connected: poolStats.totalCount > 0,
        pool: poolStats,
      },
      environment: process.env.NODE_ENV || 'development',
    };
  });

  // 就绪检查（用于 Kubernetes 等）
  fastify.get('/ready', async () => {
    const poolStats = getPoolStats();

    if (poolStats.totalCount === 0) {
      throw new Error('数据库未连接');
    }

    return { status: 'ready' };
  });

  console.log('  ✅ /health - 健康检查路由已注册');
}
