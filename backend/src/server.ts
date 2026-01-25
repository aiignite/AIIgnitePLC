/**
 * Fastify 服务入口
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from './config';
import { registerRoutes } from './routes';
import { closePool } from './db';

// 创建 logger 配置
const loggerConfig: any = {
  level: config.logLevel,
};

// 只在开发环境且安装了 pino-pretty 时启用
if (config.isDevelopment) {
  try {
    require('pino-pretty');
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  } catch {
    // pino-pretty 未安装，使用默认日志
  }
}

// 创建 Fastify 实例
const fastify = Fastify({
  logger: loggerConfig,
});

// 注册 CORS 插件
fastify.register(cors, {
  origin: config.cors.origin,
  credentials: config.cors.credentials,
});

// 注册 WebSocket 插件
fastify.register(websocket);

// 注册所有路由
registerRoutes(fastify);

// 启动服务器
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 AIIgnitePLC Backend API                                  ║
║   ${' '.repeat(60)}║
║   📡 Server: http://${config.host}:${config.port}                    ║
║   📚 Health: http://${config.host}:${config.port}/health                 ║
║   🌍 Environment: ${config.isDevelopment ? 'Development' : 'Production'}                                  ║
║                                                                ║
╚══════════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// 优雅关闭
const shutdown = async (signal: string) => {
  console.log(`\n${signal} 信号收到，正在关闭服务器...`);

  try {
    await fastify.close();
    await closePool();
    console.log('✅ 服务器已安全关闭');
    process.exit(0);
  } catch (err) {
    console.error('❌ 关闭服务器时出错:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 启动
start();
