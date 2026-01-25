/**
 * 环境配置
 */

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3310'),
  host: process.env.HOST || '0.0.0.0',

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'aiignite_plc',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  // CORS 配置
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3300',
    credentials: true,
  },

  // JWT 配置 (如需认证)
  jwt: {
    secret: process.env.JWT_SECRET || 'aiignite-plc-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // AI API 配置
  ai: {
    provider: process.env.AI_PROVIDER || 'gemini', // 'gemini' | 'openai'
    apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'gemini-pro',
  },

  // WebSocket 配置
  websocket: {
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT || '30000'),
  },

  // 开发模式
  isDevelopment: process.env.NODE_ENV !== 'production',

  // 日志级别
  logLevel: process.env.LOG_LEVEL || 'info',
} as const;
