/**
 * 认证 API 路由
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requiredAuthMiddleware } from '../middleware/auth';
import { logAudit } from '../services/audit';
import {
  changePassword,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  verifyToken,
} from '../services/authService';

// 请求验证 Schema
const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  fullName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/v1/auth/register - 用户注册
  fastify.post('/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      const user = await registerUser(body.username, body.email, body.password, body.fullName);

      await logAudit({
        userId: user.id,
        action: 'user.register',
        entityType: 'user',
        entityId: user.id,
        details: { username: user.username, email: user.email },
      });

      reply.code(201).send({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
        },
        message: '注册成功',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求数据验证失败',
            details: error.errors,
          },
        });
      }

      if (error instanceof Error && error.message === 'USERNAME_OR_EMAIL_EXISTS') {
        return reply.code(409).send({
          error: {
            code: 'USER_EXISTS',
            message: '用户名或邮箱已存在',
          },
        });
      }

      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '注册失败',
        },
      });
    }
  });

  // POST /api/v1/auth/login - 用户登录
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const userAgent = request.headers['user-agent'];
      const ipAddress = request.ip;

      const result = await loginUser(body.usernameOrEmail, body.password, userAgent, ipAddress);

      await logAudit({
        userId: result.user.id,
        action: 'user.login',
        entityType: 'user',
        entityId: result.user.id,
        details: { username: result.user.username },
      });

      reply.code(200).send({
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.full_name,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求数据验证失败',
            details: error.errors,
          },
        });
      }

      if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '用户名或密码错误',
          },
        });
      }

      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '登录失败',
        },
      });
    }
  });

  // POST /api/v1/auth/refresh - 刷新令牌
  fastify.post('/auth/refresh', async (request, reply) => {
    try {
      const body = refreshTokenSchema.parse(request.body);

      const result = await refreshAccessToken(body.refreshToken);

      const payload = verifyToken(body.refreshToken);
      if (payload?.userId) {
        await logAudit({
          userId: payload.userId,
          action: 'user.refresh_token',
          entityType: 'user',
          entityId: payload.userId,
          details: { type: payload.type },
        });
      }

      reply.code(200).send(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: '请求数据验证失败',
            details: error.errors,
          },
        });
      }

      if (
        error instanceof Error &&
        (error.message === 'INVALID_REFRESH_TOKEN' || error.message === 'EXPIRED_REFRESH_TOKEN')
      ) {
        return reply.code(401).send({
          error: {
            code: error.message,
            message: '刷新令牌无效或已过期',
          },
        });
      }

      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '刷新令牌失败',
        },
      });
    }
  });

  // POST /api/v1/auth/logout - 用户登出
  fastify.post('/auth/logout', async (request, reply) => {
    try {
      const body = refreshTokenSchema.parse(request.body);

      const payload = verifyToken(body.refreshToken);
      if (payload?.userId) {
        await logAudit({
          userId: payload.userId,
          action: 'user.logout',
          entityType: 'user',
          entityId: payload.userId,
          details: { type: payload.type },
        });
      }

      await logoutUser(body.refreshToken);

      reply.code(200).send({ message: '登出成功' });
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '登出失败',
        },
      });
    }
  });

  // POST /api/v1/auth/change-password - 修改密码
  fastify.post('/auth/change-password', {
    onRequest: [requiredAuthMiddleware],
    handler: async (request, reply) => {
      try {
        const body = changePasswordSchema.parse(request.body);
        const userId = request.user?.userId;

        if (!userId) {
          return reply.code(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: '未授权',
            },
          });
        }

        await changePassword(userId, body.oldPassword, body.newPassword);

        await logAudit({
          userId,
          action: 'user.change_password',
          entityType: 'user',
          entityId: userId,
          details: { source: 'auth' },
        });

        reply.code(200).send({ message: '密码修改成功，请重新登录' });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: '请求数据验证失败',
              details: error.errors,
            },
          });
        }

        if (error instanceof Error && error.message === 'INVALID_OLD_PASSWORD') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_OLD_PASSWORD',
              message: '原密码错误',
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '修改密码失败',
          },
        });
      }
    },
  });

  console.log('  ✅ /api/v1/auth - 认证路由已注册');
}
