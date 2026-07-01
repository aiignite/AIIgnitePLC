/**
 * 树节点管理 API 路由
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { optionalAuthMiddleware } from '../middleware/auth';
import { logAudit } from '../services/audit';

// 请求验证 Schema
const createNodeSchema = z.object({
  parent_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum([
    'project',
    'folder',
    'device',
    'block',
    'block_ob',
    'block_fc',
    'block_fb',
    'tag',
    'tag_table',
    'config',
    'settings',
  ]),
  color: z.string().optional(),
});

const updateNodeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().optional(),
  is_open: z.boolean().optional(),
  order_index: z.number().int().optional(),
});

export async function nodeRoutes(fastify: FastifyInstance) {
  // POST /api/v1/projects/:id/nodes - 创建节点
  fastify.post('/projects/:id/nodes', {
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
              error: { code: 'FORBIDDEN', message: '无权限创建节点' },
            });
          }
        }
        const body = createNodeSchema.parse(request.body);

        // 验证父节点是否存在（如果指定）
        if (body.parent_id) {
          const parentCheck = await query(
            `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2`,
            [body.parent_id, projectId]
          );

          if (parentCheck.rows.length === 0) {
            return reply.code(400).send({
              error: {
                code: 'PARENT_NODE_NOT_FOUND',
                message: '父节点不存在',
              },
            });
          }
        }

        // 获取当前最大的 order_index
        let maxOrderQuery: string;
        let maxOrderParams: (string | null)[];

        if (body.parent_id) {
          maxOrderQuery = `SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
           FROM project_nodes
           WHERE project_id = $1 AND parent_id = $2`;
          maxOrderParams = [projectId, body.parent_id];
        } else {
          maxOrderQuery = `SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
           FROM project_nodes
           WHERE project_id = $1 AND parent_id IS NULL`;
          maxOrderParams = [projectId];
        }

        const maxOrderResult = await query(maxOrderQuery, maxOrderParams);

        const nextOrder = maxOrderResult.rows[0].next_order;

        // 创建节点
        const result = await query(
          `INSERT INTO project_nodes (project_id, parent_id, type, name, color, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
          [projectId, body.parent_id || null, body.type, body.name, body.color || null, nextOrder]
        );

        const newNode = result.rows[0];

        // 如果是程序块节点，创建对应 program_blocks 记录
        const blockTypeMap: Record<string, 'OB' | 'FC' | 'FB'> = {
          block_ob: 'OB',
          block_fc: 'FC',
          block_fb: 'FB',
          block: 'FC',
        };

        if (blockTypeMap[newNode.type]) {
          await query(
            `INSERT INTO program_blocks (node_id, block_type, title, description, content)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (node_id) DO NOTHING`,
            [
              newNode.id,
              blockTypeMap[newNode.type],
              newNode.name,
              null,
              JSON.stringify({ networks: [] }),
            ]
          );
        }

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'node.create',
          entityType: 'project_node',
          entityId: newNode.id,
          details: { name: newNode.name, type: newNode.type, parentId: newNode.parent_id },
        });

        reply.code(201).send(newNode);
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
              code: 'NODE_NAME_EXISTS',
              message: '同一父节点下已存在同名节点',
            },
          });
        }

        reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '创建节点失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/nodes/:nodeId/children - 懒加载子节点
  fastify.get('/projects/:id/nodes/:nodeId/children', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id: projectId, nodeId } = request.params as { id: string; nodeId: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限查看节点' },
            });
          }
        }
        // 如果 nodeId 是 "root"，获取根节点
        if (nodeId === 'root') {
          const result = await query(
            `SELECT id, name, type, color, is_open
           FROM project_nodes
           WHERE project_id = $1 AND parent_id IS NULL
           ORDER BY order_index, name`,
            [projectId]
          );

          // 计算每个节点是否有子节点
          const nodesWithChildren = await Promise.all(
            result.rows.map(async node => {
              const childrenCount = await query(
                'SELECT COUNT(*) as count FROM project_nodes WHERE parent_id = $1',
                [node.id]
              );
              return {
                ...node,
                hasChildren: parseInt(childrenCount.rows[0].count) > 0,
              };
            })
          );

          return nodesWithChildren;
        }

        // 获取指定节点的子节点
        const result = await query(
          `SELECT id, name, type, color, is_open
         FROM project_nodes
         WHERE project_id = $1 AND parent_id = $2
         ORDER BY order_index, name`,
          [projectId, nodeId]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'NODE_NOT_FOUND',
              message: '节点不存在',
            },
          });
        }

        // 计算每个节点是否有子节点
        const nodesWithChildren = await Promise.all(
          result.rows.map(async node => {
            const childrenCount = await query(
              'SELECT COUNT(*) as count FROM project_nodes WHERE parent_id = $1',
              [node.id]
            );
            return {
              ...node,
              hasChildren: parseInt(childrenCount.rows[0].count) > 0,
            };
          })
        );

        return nodesWithChildren;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取子节点失败',
          },
        });
      }
    },
  });

  // PATCH /api/v1/nodes/:id - 更新节点
  fastify.patch('/nodes/:id', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            `SELECT p.id
             FROM project_nodes pn
             JOIN projects p ON pn.project_id = p.id
             WHERE pn.id = $1 AND (p.created_by = $2 OR p.created_by IS NULL)`,
            [id, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限更新节点' },
            });
          }
        }
        const body = updateNodeSchema.parse(request.body);

        // 构建动态更新语句
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(body.name);
        }
        if (body.color !== undefined) {
          updates.push(`color = $${paramIndex++}`);
          values.push(body.color);
        }
        if (body.is_open !== undefined) {
          updates.push(`is_open = $${paramIndex++}`);
          values.push(body.is_open);
        }
        if (body.order_index !== undefined) {
          updates.push(`order_index = $${paramIndex++}`);
          values.push(body.order_index);
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
          `UPDATE project_nodes
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
          values
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'NODE_NOT_FOUND',
              message: '节点不存在',
            },
          });
        }

        const updatedNode = result.rows[0];

        if (
          body.name !== undefined &&
          ['block', 'block_ob', 'block_fc', 'block_fb'].includes(updatedNode.type)
        ) {
          await query(`UPDATE program_blocks SET title = $1 WHERE node_id = $2`, [
            updatedNode.name,
            updatedNode.id,
          ]);
        }

        await logAudit({
          projectId: updatedNode.project_id,
          userId: request.user?.userId || null,
          action: 'node.update',
          entityType: 'project_node',
          entityId: updatedNode.id,
          details: { updates: body },
        });

        return updatedNode;
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
              code: 'NODE_NAME_EXISTS',
              message: '同一父节点下已存在同名节点',
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '更新节点失败',
          },
        });
      }
    },
  });

  // DELETE /api/v1/nodes/:id - 删除节点（级联删除子节点）
  fastify.delete('/nodes/:id', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            `SELECT p.id
             FROM project_nodes pn
             JOIN projects p ON pn.project_id = p.id
             WHERE pn.id = $1 AND (p.created_by = $2 OR p.created_by IS NULL)`,
            [id, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: '无权限删除节点' },
            });
          }
        }
        // 检查是否有程序块关联
        const blockCheck = await query('SELECT id FROM program_blocks WHERE node_id = $1', [id]);

        if (blockCheck.rows.length > 0) {
          return reply.code(400).send({
            error: {
              code: 'NODE_HAS_BLOCKS',
              message: '节点关联了程序块，无法删除',
            },
          });
        }

        const projectResult = await query(
          'SELECT project_id, name, type FROM project_nodes WHERE id = $1',
          [id]
        );
        const projectId = projectResult.rows[0]?.project_id || null;
        const nodeName = projectResult.rows[0]?.name || null;
        const nodeType = projectResult.rows[0]?.type || null;

        // 删除节点（CASCADE 会自动删除子节点）
        const result = await query('DELETE FROM project_nodes WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'NODE_NOT_FOUND',
              message: '节点不存在',
            },
          });
        }

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'node.delete',
          entityType: 'project_node',
          entityId: id,
          details: { name: nodeName, type: nodeType },
        });

        return { success: true, message: '节点已删除' };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '删除节点失败',
          },
        });
      }
    },
  });

  console.log('  ✅ /api/v1/nodes - 树节点管理路由已注册');
}
