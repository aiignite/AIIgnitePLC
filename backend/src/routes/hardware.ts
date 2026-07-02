/**
 * 硬件配置 API 路由
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { optionalAuthMiddleware } from '../middleware/auth';
import { buildSlaveMapHexFromChain } from '../plc/rh850Protocol';
import { logAudit } from '../services/audit';

// Schema Definitions
const hardwareModuleSchema = z.object({
  slot: z.number().int(),
  name: z.string().min(1),
  article_number: z.string().optional(),
  firmware: z.string().optional(),
  type: z.enum(['ps', 'cpu', 'io', 'comm', 'empty']),
  hw_id: z.number().int().optional(),
  config: z
    .object({
      ip: z.string().optional(),
      subnet: z.string().optional(),
      ioStart: z.number().optional(),
      ioLength: z.number().optional(),
      moduleType: z.enum(['K2', 'K3']).optional(),
      moduleIp: z.string().optional(),
      tcpPort: z.number().int().optional(),
      baudRate: z.number().int().optional(),
      slaveChain: z
        .array(
          z.object({
            chainPos: z.number().int().min(1).max(16),
            boardType: z.enum(['ad', 'relay', 'light', 'resistor', 'custom']),
            boardId: z.number().int(),
            enabled: z.boolean(),
            diRegAddr: z.number().int(),
            doRegAddr: z.number().int(),
            ioBytes: z.number().int().optional(),
          })
        )
        .optional(),
      boardType: z.enum(['ad', 'relay', 'light', 'resistor', 'custom']).optional(),
      boardId: z.number().int().optional(),
      chainPos: z.number().int().optional(),
      diRegAddr: z.number().int().optional(),
      doRegAddr: z.number().int().optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
});

export async function hardwareRoutes(fastify: FastifyInstance) {
  // GET /api/v1/projects/:projectId/hardware - Get hardware config
  fastify.get('/projects/:projectId/hardware', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply
              .code(403)
              .send({ error: { code: 'FORBIDDEN', message: '无权限查看硬件配置' } });
          }
        }
        const result = await query(
          'SELECT * FROM hardware_modules WHERE project_id = $1 ORDER BY slot ASC',
          [projectId]
        );
        return result.rows;
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: { code: 'DB_ERROR', message: 'Failed to fetch hardware config' } });
      }
    },
  });

  // PUT /api/v1/projects/:projectId/hardware/slot/:slot - Update or Insert module at slot
  fastify.put('/projects/:projectId/hardware/slot/:slot', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId, slot } = request.params as { projectId: string; slot: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply
              .code(403)
              .send({ error: { code: 'FORBIDDEN', message: '无权限更新硬件配置' } });
          }
        }
        const body = hardwareModuleSchema.parse(request.body);

        // Upsert Logic
        const result = await query(
          `INSERT INTO hardware_modules (project_id, slot, name, article_number, firmware, type, hw_id, config)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (project_id, slot) 
                 DO UPDATE SET 
                    name = EXCLUDED.name,
                    article_number = EXCLUDED.article_number,
                    firmware = EXCLUDED.firmware,
                    type = EXCLUDED.type,
                    hw_id = EXCLUDED.hw_id,
                    config = EXCLUDED.config,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
          [
            projectId,
            parseInt(slot),
            body.name,
            body.article_number,
            body.firmware,
            body.type,
            body.hw_id,
            body.config,
          ]
        );

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'hardware.upsert',
          entityType: 'hardware_module',
          entityId: result.rows[0].id || null,
          details: { slot: parseInt(slot), name: body.name, type: body.type },
        });

        return result.rows[0];
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply
            .code(400)
            .send({ error: { code: 'VALIDATION_ERROR', message: error.errors } });
        }
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: { code: 'DB_ERROR', message: 'Failed to save hardware module' } });
      }
    },
  });

  // DELETE /api/v1/projects/:projectId/hardware/slot/:slot - Remove module (set to empty or delete row)
  // For this implementation, we'll delete the row.
  fastify.delete('/projects/:projectId/hardware/slot/:slot', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId, slot } = request.params as { projectId: string; slot: string };
      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [projectId, request.user.userId]
          );
          if (projectCheck.rows.length === 0) {
            return reply
              .code(403)
              .send({ error: { code: 'FORBIDDEN', message: '无权限删除硬件配置' } });
          }
        }
        await query('DELETE FROM hardware_modules WHERE project_id = $1 AND slot = $2', [
          projectId,
          parseInt(slot),
        ]);

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'hardware.delete',
          entityType: 'hardware_module',
          details: { slot: parseInt(slot) },
        });
        return { success: true };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: { code: 'DB_ERROR', message: 'Failed to delete module' } });
      }
    },
  });

  // GET /api/v1/projects/:projectId/hardware/slave-map-hex — 0x6F frames from saved config
  fastify.get('/projects/:projectId/hardware/slave-map-hex', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      try {
        const result = await query(
          `SELECT config FROM hardware_modules WHERE project_id = $1 AND type = 'cpu' LIMIT 1`,
          [projectId]
        );
        const slaveChain = result.rows[0]?.config?.slaveChain as
          | Array<{
              chainPos: number;
              enabled: boolean;
              diRegAddr: number;
              doRegAddr: number;
              ioBytes?: number;
            }>
          | undefined;

        if (!slaveChain?.length) {
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: 'CPU 模块未配置 slaveChain' },
          });
        }

        return {
          hex: buildSlaveMapHexFromChain(slaveChain),
          count: slaveChain.filter(e => e.enabled).length,
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: { code: 'DB_ERROR', message: 'Failed to build slave map hex' } });
      }
    },
  });
}
