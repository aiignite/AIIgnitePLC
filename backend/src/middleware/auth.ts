/**
 * 认证中间件 - JWT 验证
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../db';
import { extractUserIdFromToken } from '../services/authService';

/**
 * 可选认证中间件
 * - 如果提供有效 token，将 userId 添加到 request.user
 * - 如果没有 token 或 token 无效，继续处理（用于向后兼容）
 */
export async function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return; // 无认证信息，继续处理
  }

  const token = authHeader.substring(7);
  const userId = extractUserIdFromToken(token);

  if (userId) {
    request.user = { userId };
  }
  // token 无效时不报错，继续处理（向后兼容）
}

/**
 * 必需认证中间件
 * - 必须提供有效 token，否则返回 401
 */
export async function requiredAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: '未提供认证信息',
      },
    });
  }

  const token = authHeader.substring(7);
  const userId = extractUserIdFromToken(token);

  if (!userId) {
    return reply.code(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: '无效的认证令牌',
      },
    });
  }

  request.user = { userId };
}

/**
 * 项目所有权验证中间件
 * - 验证用户是否有权访问指定项目
 */
export async function projectOwnershipMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.userId) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: '需要登录',
      },
    });
  }

  const projectId = (request.params as { id: string })?.id;

  if (!projectId) {
    return reply.code(400).send({
      error: {
        code: 'INVALID_REQUEST',
        message: '缺少项目ID',
      },
    });
  }

  // 检查项目是否属于当前用户
  const result = await query('SELECT id FROM projects WHERE id = $1 AND created_by = $2', [
    projectId,
    request.user.userId,
  ]);

  if (result.rows.length === 0) {
    return reply.code(403).send({
      error: {
        code: 'FORBIDDEN',
        message: '无权访问此项目',
      },
    });
  }
}

// 扩展 Fastify 类型
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
    };
  }
}
