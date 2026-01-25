/**
 * 程序块管理 API 路由
 */

import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { z } from 'zod';

// 请求验证 Schema
const updateBlockContentSchema = z.object({
  content: z.object({
    version: z.string().optional(),
    networks: z.array(z.any()),
  }),
  version: z.number().int(), // 乐观锁版本号
});

export async function blockRoutes(fastify: FastifyInstance) {
  // GET /api/v1/blocks/:id - 获取程序块详情
  fastify.get('/blocks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await query(
        'SELECT * FROM program_blocks WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'BLOCK_NOT_FOUND',
            message: '程序块不存在',
          },
        });
      }

      return result.rows[0];
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '获取程序块失败',
        },
      });
    }
  });

  // PUT /api/v1/blocks/:id - 保存程序块内容（乐观锁）
  fastify.put('/blocks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const body = updateBlockContentSchema.parse(request.body);

      // 检查版本（乐观锁）
      const current = await query(
        'SELECT version FROM program_blocks WHERE id = $1',
        [id]
      );

      if (current.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'BLOCK_NOT_FOUND',
            message: '程序块不存在',
          },
        });
      }

      if (current.rows[0].version !== body.version) {
        return reply.code(409).send({
          error: {
            code: 'VERSION_CONFLICT',
            message: '数据已在别处被修改，请刷新后重试',
            currentVersion: current.rows[0].version,
          },
        });
      }

      // 更新内容并递增版本
      const result = await query(
        `UPDATE program_blocks
         SET content = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [JSON.stringify(body.content), id]
      );

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
          message: '保存程序块失败',
        },
      });
    }
  });

  // POST /api/v1/blocks/:id/compile - 编译程序块
  fastify.post('/blocks/:id/compile', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      // 获取程序块内容
      const blockResult = await query(
        'SELECT * FROM program_blocks WHERE id = $1',
        [id]
      );

      if (blockResult.rows.length === 0) {
        return reply.code(404).send({
          error: {
            code: 'BLOCK_NOT_FOUND',
            message: '程序块不存在',
          },
        });
      }

      const block = blockResult.rows[0];
      const content = block.content as { networks?: any[] };
      const diagnostics: any[] = [];

      // 编译验证逻辑
      if (content.networks) {
        for (const network of content.networks) {
          if (!network.rungs || !Array.isArray(network.rungs)) {
            continue;
          }

          for (const rung of network.rungs) {
            if (!rung.elements || !Array.isArray(rung.elements)) {
              continue;
            }

            const coils: any[] = [];
            const addresses = new Set<string>();

            for (const element of rung.elements) {
              // 收集地址
              if (element.address) {
                addresses.add(element.address);
              }

              // 检查双线圈
              if (element.type === 'coil') {
                const duplicate = coils.find(c => c.address === element.address);
                if (duplicate) {
                  diagnostics.push({
                    severity: 'error',
                    message: `双线圈冲突: 地址 ${element.address} 被多次使用`,
                    elementId: element.id,
                    code: 'DOUBLE_COIL',
                  });
                }
                coils.push(element);
              }

              // 检查地址格式
              if (element.address && !isValidAddress(element.address)) {
                diagnostics.push({
                  severity: 'error',
                  message: `地址格式无效: ${element.address}`,
                  elementId: element.id,
                  code: 'INVALID_ADDRESS',
                });
              }

              // 检查线圈是否在最右侧
              if (element.type === 'coil') {
                const lastElement = rung.elements[rung.elements.length - 1];
                if (element.id !== lastElement.id) {
                  // 检查右侧是否还有其他元素（除分支外）
                  const elementIndex = rung.elements.findIndex((e: any) => e.id === element.id);
                  const hasElementsAfter = rung.elements
                    .slice(elementIndex + 1)
                    .some((e: any) => e.type !== 'branch' && e.type !== 'empty');

                  if (hasElementsAfter) {
                    diagnostics.push({
                      severity: 'error',
                      message: `线圈必须在网络段最右侧: ${element.tag || element.address}`,
                      elementId: element.id,
                      code: 'COIL_POSITION',
                    });
                  }
                }
              }
            }
          }
        }
      }

      return {
        success: diagnostics.length === 0,
        diagnostics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return reply.code(500).send({
        error: {
          code: 'DATABASE_ERROR',
          message: '编译程序块失败',
        },
      });
    }
  });

  console.log('  ✅ /api/v1/blocks - 程序块管理路由已注册');
}

/**
 * 验证 PLC 地址格式
 * 支持格式: %I0.0, %Q0.0, %M0.0, %DB1.DBD0 等
 */
function isValidAddress(address: string): boolean {
  // 简单验证：以 % 开头，包含 . 或 :
  return /^%[IQM]\d+\.\d+$|^%DB\d+\.(DBD|DBW|DBB)\d+$/i.test(address);
}
