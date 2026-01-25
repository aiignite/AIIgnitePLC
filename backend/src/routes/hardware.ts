/**
 * 硬件配置 API 路由
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { z } from 'zod';

// Schema Definitions
const hardwareModuleSchema = z.object({
  slot: z.number().int(),
  name: z.string().min(1),
  article_number: z.string().optional(),
  firmware: z.string().optional(),
  type: z.enum(['ps', 'cpu', 'io', 'comm', 'empty']),
  hw_id: z.number().int().optional(),
  config: z.object({
      ip: z.string().optional(),
      subnet: z.string().optional(),
      ioStart: z.number().optional(),
      ioLength: z.number().optional()
  }).optional()
});

export async function hardwareRoutes(fastify: FastifyInstance) {
    // GET /api/v1/projects/:projectId/hardware - Get hardware config
    fastify.get('/projects/:projectId/hardware', async (request, reply) => {
        const { projectId } = request.params as { projectId: string };
        try {
            const result = await query(
                'SELECT * FROM hardware_modules WHERE project_id = $1 ORDER BY slot ASC',
                [projectId]
            );
            return result.rows;
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: { code: 'DB_ERROR', message: 'Failed to fetch hardware config' } });
        }
    });

    // PUT /api/v1/projects/:projectId/hardware/slot/:slot - Update or Insert module at slot
    fastify.put('/projects/:projectId/hardware/slot/:slot', async (request, reply) => {
        const { projectId, slot } = request.params as { projectId: string; slot: string };
        
        try {
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
                    body.config
                ]
            );
            
            return result.rows[0];
        } catch (error) {
             if (error instanceof z.ZodError) {
                return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.errors } });
            }
            request.log.error(error);
            return reply.code(500).send({ error: { code: 'DB_ERROR', message: 'Failed to save hardware module' } });
        }
    });

    // DELETE /api/v1/projects/:projectId/hardware/slot/:slot - Remove module (set to empty or delete row)
    // For this implementation, we'll delete the row.
    fastify.delete('/projects/:projectId/hardware/slot/:slot', async (request, reply) => {
         const { projectId, slot } = request.params as { projectId: string; slot: string };
         try {
             await query(
                 'DELETE FROM hardware_modules WHERE project_id = $1 AND slot = $2',
                 [projectId, parseInt(slot)]
             );
             return { success: true };
         } catch (error) {
             request.log.error(error);
             return reply.code(500).send({ error: { code: 'DB_ERROR', message: 'Failed to delete module' } });
         }
    });
}
