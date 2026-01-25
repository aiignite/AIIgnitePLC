/**
 * 项目管理 API 路由
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { z } from 'zod';

// 请求验证 Schema
const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  created_by: z.string().max(100).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export async function projectRoutes(fastify: FastifyInstance) {
  // GET /api/v1/projects - 获取项目列表
  fastify.get('/projects', async (_request, reply) => {
    try {
      const result = await query(
        `SELECT
          p.id, p.name, p.description, p.version,
          p.created_by, p.created_at, p.updated_at,
          COUNT(DISTINCT pn.id) as node_count,
          COUNT(DISTINCT t.id) as tag_count
         FROM projects p
         LEFT JOIN project_nodes pn ON p.id = pn.project_id
         LEFT JOIN tags t ON p.id = t.project_id
         GROUP BY p.id
         ORDER BY p.created_at DESC`
      );

      return {
        projects: result.rows,
        total: result.rowCount,
      };
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '获取项目列表失败',
        },
      });
    }
  });

  // GET /api/v1/projects/:id - 获取项目详情
  fastify.get('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await query(
        'SELECT * FROM projects WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      return result.rows[0];
    } catch (error) {
      reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '获取项目详情失败',
        },
      });
    }
  });

  // POST /api/v1/projects - 创建新项目
  fastify.post('/projects', async (request, reply) => {
    try {
      const body = createProjectSchema.parse(request.body);

      const result = await query(
        `INSERT INTO projects (name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [body.name, body.description || null, body.created_by || null]
      );

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

      // 唯一约束冲突
      if (error instanceof Object && 'code' in error && error.code === '23505') {
        return reply.code(409).send({
          error: {
            code: 'PROJECT_NAME_EXISTS',
            message: '项目名称已存在',
          },
        });
      }

      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '创建项目失败',
        },
      });
    }
  });

  // PATCH /api/v1/projects/:id - 更新项目
  fastify.patch('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const body = updateProjectSchema.parse(request.body);

      // 构建动态更新语句
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(body.description);
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
        `UPDATE projects
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

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

      if (error instanceof Object && 'code' in error && error.code === '23505') {
        return reply.code(409).send({
          error: {
            code: 'PROJECT_NAME_EXISTS',
            message: '项目名称已存在',
          },
        });
      }

      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '更新项目失败',
        },
      });
    }
  });

  // DELETE /api/v1/projects/:id - 删除项目
  fastify.delete('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await query(
        'DELETE FROM projects WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      return { success: true, message: '项目已删除' };
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '删除项目失败',
        },
      });
    }
  });

  // GET /api/v1/projects/:id/tree - 获取项目树（完整）
  fastify.get('/projects/:id/tree', async (request, reply) => {
    const { id } = request.params as { id: string };
    void (request.query as { lazy?: string }).lazy; // Reserved for future lazy loading

    try {
      // 检查项目是否存在
      const projectCheck = await query(
        'SELECT id FROM projects WHERE id = $1',
        [id]
      );

      if (projectCheck.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      // 获取所有节点
      const nodesResult = await query(
        `SELECT id, parent_id, type, name, color, is_open, order_index
         FROM project_nodes
         WHERE project_id = $1
         ORDER BY order_index, name`,
        [id]
      );

      // 构建树结构（邻接表转树）
      const nodeMap = new Map();
      const rootNodes: any[] = [];

      // 第一遍：创建所有节点的 Map
      for (const row of nodesResult.rows) {
        nodeMap.set(row.id, {
          id: row.id,
          name: row.name,
          type: row.type,
          color: row.color,
          isOpen: row.is_open,
          children: [],
        });
      }

      // 第二遍：构建父子关系
      for (const row of nodesResult.rows) {
        const node = nodeMap.get(row.id);
        if (row.parent_id) {
          const parent = nodeMap.get(row.parent_id);
          if (parent) {
            parent.children.push(node);
          } else {
            rootNodes.push(node);
          }
        } else {
          rootNodes.push(node);
        }
      }

      return rootNodes;
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '获取项目树失败',
        },
      });
    }
  });

  console.log('  ✅ /api/v1/projects - 项目管理路由已注册');
}
