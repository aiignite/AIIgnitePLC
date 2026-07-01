/**
 * 变量管理 API 路由
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { optionalAuthMiddleware } from '../middleware/auth';
import { logAudit } from '../services/audit';

// 请求验证 Schema
const createTagSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().min(1).max(100),
  data_type: z.string().default('Bool'),
  comment: z.string().optional(),
  is_retentive: z.boolean().default(false),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().min(1).max(100).optional(),
  data_type: z.string().optional(),
  comment: z.string().optional(),
  is_retentive: z.boolean().optional(),
});

export async function tagRoutes(fastify: FastifyInstance) {
  // GET /api/v1/projects/:id/tags - 获取变量列表
  fastify.get('/projects/:id/tags', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id: projectId } = request.params as { id: string };
      const {
        page = '1',
        pageSize = '50',
        search = '',
        dataType = '',
      } = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        dataType?: string;
      };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限查看变量' },
            });
          }
        }
        const pageNum = parseInt(page);
        const size = parseInt(pageSize);
        const offset = (pageNum - 1) * size;

        // 构建查询条件
        const conditions: string[] = ['project_id = $1'];
        const values: any[] = [projectId];
        let paramIndex = 2;

        if (search) {
          conditions.push(
            `(name ILIKE $${paramIndex} OR address ILIKE $${paramIndex} OR comment ILIKE $${paramIndex})`
          );
          values.push(`%${search}%`);
          paramIndex++;
        }

        if (dataType) {
          conditions.push(`data_type = $${paramIndex}`);
          values.push(dataType);
          paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        // 获取总数
        const countResult = await query(
          `SELECT COUNT(*) as total FROM tags WHERE ${whereClause}`,
          values
        );

        // 获取分页数据
        const result = await query(
          `SELECT * FROM tags
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...values, size, offset]
        );

        return {
          data: result.rows,
          total: parseInt(countResult.rows[0].total),
          page: pageNum,
          pageSize: size,
          totalPages: Math.ceil(parseInt(countResult.rows[0].total) / size),
        };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取变量列表失败',
          },
        });
      }
    },
  });

  // POST /api/v1/projects/:id/tags - 创建变量
  fastify.post('/projects/:id/tags', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id: projectId } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限创建变量' },
            });
          }
        }
        const body = createTagSchema.parse(request.body);

        // 地址冲突检测（含重叠）
        const existingTags = await query(
          `SELECT id, name, address FROM tags WHERE project_id = $1`,
          [projectId]
        );

        const newRange = parseBitRange(body.address);
        const conflict = existingTags.rows.find(tag => {
          if (!newRange) {
            return tag.address === body.address;
          }
          const existingRange = parseBitRange(tag.address);
          if (!existingRange) return false;
          if (existingRange.area !== newRange.area) return false;
          return rangesOverlap(existingRange, newRange);
        });

        if (conflict) {
          return reply.code(400).send({
            error: {
              code: 'ADDRESS_CONFLICT',
              message: `地址 ${body.address} 与 "${conflict.name}" (${conflict.address}) 存在重叠`,
              conflictingTag: { id: conflict.id, name: conflict.name, address: conflict.address },
            },
          });
        }

        // 名称冲突检测
        const nameCheck = await query(`SELECT id FROM tags WHERE project_id = $1 AND name = $2`, [
          projectId,
          body.name,
        ]);

        if (nameCheck.rows.length > 0) {
          return reply.code(400).send({
            error: {
              code: 'TAG_NAME_EXISTS',
              message: `变量名 "${body.name}" 已存在`,
            },
          });
        }

        // 创建变量
        const result = await query(
          `INSERT INTO tags (project_id, name, address, data_type, comment, is_retentive)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
          [
            projectId,
            body.name,
            body.address,
            body.data_type,
            body.comment || null,
            body.is_retentive,
          ]
        );

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'tag.create',
          entityType: 'tag',
          entityId: result.rows[0].id,
          details: { name: body.name, address: body.address, data_type: body.data_type },
        });

        reply.code(201).send(result.rows[0]);
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

        reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '创建变量失败',
          },
        });
      }
    },
  });

  // PATCH /api/v1/tags/:id - 更新变量
  fastify.patch('/tags/:id', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            `SELECT p.id
             FROM tags t
             JOIN projects p ON t.project_id = p.id
             WHERE t.id = $1 AND (p.created_by = $2 OR p.created_by IS NULL)`,
            [id, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限更新变量' },
            });
          }
        }
        const body = updateTagSchema.parse(request.body);

        // 如果更新地址，检查冲突（含重叠）
        if (body.address) {
          const existingTags = await query(`SELECT id, name, address FROM tags WHERE id != $1`, [
            id,
          ]);

          const newRange = parseBitRange(body.address);
          const conflict = existingTags.rows.find(tag => {
            if (!newRange) {
              return tag.address === body.address;
            }
            const existingRange = parseBitRange(tag.address);
            if (!existingRange) return false;
            if (existingRange.area !== newRange.area) return false;
            return rangesOverlap(existingRange, newRange);
          });

          if (conflict) {
            return reply.code(400).send({
              error: {
                code: 'ADDRESS_CONFLICT',
                message: `地址 ${body.address} 与 "${conflict.name}" (${conflict.address}) 存在重叠`,
                conflictingTag: { id: conflict.id, name: conflict.name, address: conflict.address },
              },
            });
          }
        }

        // 如果更新名称，检查冲突
        if (body.name) {
          const nameCheck = await query(`SELECT id, name FROM tags WHERE id != $1 AND name = $2`, [
            id,
            body.name,
          ]);

          if (nameCheck.rows.length > 0) {
            return reply.code(400).send({
              error: {
                code: 'TAG_NAME_EXISTS',
                message: `变量名 "${body.name}" 已存在`,
              },
            });
          }
        }

        // 构建动态更新语句
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(body.name);
        }
        if (body.address !== undefined) {
          updates.push(`address = $${paramIndex++}`);
          values.push(body.address);
        }
        if (body.data_type !== undefined) {
          updates.push(`data_type = $${paramIndex++}`);
          values.push(body.data_type);
        }
        if (body.comment !== undefined) {
          updates.push(`comment = $${paramIndex++}`);
          values.push(body.comment);
        }
        if (body.is_retentive !== undefined) {
          updates.push(`is_retentive = $${paramIndex++}`);
          values.push(body.is_retentive);
        }

        if (updates.length === 0) {
          return reply.code(400).send({
            error: {
              code: 'NO_UPDATE_DATA',
              message: '没有提供需要更新的数据',
            },
          });
        }

        values.push(id);

        const result = await query(
          `UPDATE tags
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
          values
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'TAG_NOT_FOUND',
              message: '变量不存在',
            },
          });
        }

        await logAudit({
          projectId: result.rows[0].project_id,
          userId: request.user?.userId || null,
          action: 'tag.update',
          entityType: 'tag',
          entityId: result.rows[0].id,
          details: { updates: body },
        });

        return result.rows[0];
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

        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '更新变量失败',
          },
        });
      }
    },
  });

  // DELETE /api/v1/tags/:id - 删除变量
  fastify.delete('/tags/:id', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            `SELECT p.id
             FROM tags t
             JOIN projects p ON t.project_id = p.id
             WHERE t.id = $1 AND (p.created_by = $2 OR p.created_by IS NULL)`,
            [id, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限删除变量' },
            });
          }
        }
        const existing = await query('SELECT project_id, name, address FROM tags WHERE id = $1', [
          id,
        ]);

        const result = await query('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'TAG_NOT_FOUND',
              message: '变量不存在',
            },
          });
        }

        const tagRow = existing.rows[0];
        await logAudit({
          projectId: tagRow?.project_id || null,
          userId: request.user?.userId || null,
          action: 'tag.delete',
          entityType: 'tag',
          entityId: id,
          details: { name: tagRow?.name, address: tagRow?.address },
        });

        return { success: true, message: '变量已删除' };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '删除变量失败',
          },
        });
      }
    },
  });

  // GET /api/v1/tags/check-address - 检查地址是否可用
  fastify.get('/tags/check-address', async (request, reply) => {
    const { address, projectId, excludeId } = request.query as {
      address: string;
      projectId: string;
      excludeId?: string;
    };

    try {
      let queryStr = 'SELECT id, name FROM tags WHERE address = $1 AND project_id = $2';
      const values: any[] = [address, projectId];

      if (excludeId) {
        queryStr += ' AND id != $3';
        values.push(excludeId);
      }

      const result = await query(queryStr, values);

      return {
        available: result.rows.length === 0,
        conflictingTag: result.rows.length > 0 ? result.rows[0] : null,
      };
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '检查地址失败',
        },
      });
    }
  });

  console.log('  ✅ /api/v1/tags - 变量管理路由已注册');
}

type BitRange = { area: 'I' | 'Q' | 'M'; startBit: number; endBit: number };

function parseBitRange(address: string): BitRange | null {
  const bitMatch = /^%([IQM])(\d+)\.(\d+)$/i.exec(address);
  if (bitMatch) {
    const area = bitMatch[1].toUpperCase() as BitRange['area'];
    const byte = parseInt(bitMatch[2], 10);
    const bit = parseInt(bitMatch[3], 10);
    const startBit = byte * 8 + bit;
    return { area, startBit, endBit: startBit };
  }

  const byteMatch = /^%([IQM])B(\d+)$/i.exec(address);
  if (byteMatch) {
    const area = byteMatch[1].toUpperCase() as BitRange['area'];
    const byte = parseInt(byteMatch[2], 10);
    const startBit = byte * 8;
    return { area, startBit, endBit: startBit + 7 };
  }

  const wordMatch = /^%([IQM])W(\d+)$/i.exec(address);
  if (wordMatch) {
    const area = wordMatch[1].toUpperCase() as BitRange['area'];
    const byte = parseInt(wordMatch[2], 10);
    const startBit = byte * 8;
    return { area, startBit, endBit: startBit + 15 };
  }

  const dwordMatch = /^%([IQM])D(\d+)$/i.exec(address);
  if (dwordMatch) {
    const area = dwordMatch[1].toUpperCase() as BitRange['area'];
    const byte = parseInt(dwordMatch[2], 10);
    const startBit = byte * 8;
    return { area, startBit, endBit: startBit + 31 };
  }

  return null;
}

function rangesOverlap(a: BitRange, b: BitRange) {
  return a.startBit <= b.endBit && b.startBit <= a.endBit;
}
