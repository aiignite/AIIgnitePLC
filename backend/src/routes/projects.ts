/**
 * 项目管理 API 路由
 */

import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { optionalAuthMiddleware, requiredAuthMiddleware } from '../middleware/auth';
import { logAudit } from '../services/audit';
import { ensureDeviceDefaultNodes, insertDeviceDefaultChildNodes } from '../services/projectNodes';

// 请求验证 Schema
const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  created_by: z.string().max(100).optional(),
  is_public: z.boolean().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  is_public: z.boolean().optional(),
});

export async function projectRoutes(fastify: FastifyInstance) {
  // GET /api/v1/projects - 获取项目列表
  // 使用可选认证：登录用户只看到自己的项目，未登录用户看到所有项目（向后兼容）
  fastify.get('/projects', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      try {
        let queryStr = `
          SELECT
            p.id, p.name, p.description, p.version,
            p.created_by, p.created_at, p.updated_at,
            COUNT(DISTINCT pn.id) as node_count,
            COUNT(DISTINCT t.id) as tag_count
           FROM projects p
           LEFT JOIN project_nodes pn ON p.id = pn.project_id
           LEFT JOIN tags t ON p.id = t.project_id
        `;

        const params: any[] = [];

        // 如果已登录，只返回用户自己的项目
        if (request.user?.userId) {
          queryStr += ' WHERE p.created_by = $1 OR p.created_by IS NULL';
          params.push(request.user.userId);
        }

        queryStr += `
           GROUP BY p.id
           ORDER BY p.created_at DESC
        `;

        const result = await query(queryStr, params);

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
    },
  });

  // GET /api/v1/projects/:id - 获取项目详情
  fastify.get('/projects/:id', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await query('SELECT * FROM projects WHERE id = $1', [id]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在',
            },
          });
        }

        if (
          request.user?.userId &&
          result.rows[0].created_by &&
          result.rows[0].created_by !== request.user.userId
        ) {
          return reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: '无权限查看该项目',
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
    },
  });

  // POST /api/v1/projects - 创建新项目
  fastify.post('/projects', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      try {
        const body = createProjectSchema.parse(request.body);

        const createdBy = body.is_public ? null : request.user?.userId || null;
        const result = await query(
          `INSERT INTO projects (name, description, created_by)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [body.name, body.description || null, createdBy]
        );

        const newProject = result.rows[0];
        const projectId = newProject.id;

        // Ensure default nodes structure
        // 1. Root Node (Project)
        const rootRes = await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open) VALUES ($1, NULL, $2, 'project', true) RETURNING id`,
          [projectId, newProject.name]
        );
        const rootId = rootRes.rows[0].id;

        // 2. PLC Node
        const plcRes = await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open) VALUES ($1, $2, 'PLC_1 [CPU 1516-3 PN/DP]', 'device', true) RETURNING id`,
          [projectId, rootId]
        );
        const plcId = plcRes.rows[0].id;

        await insertDeviceDefaultChildNodes(projectId, plcId, 0);

        // 3. Program Blocks Folder
        const blocksRes = await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open, order_index) VALUES ($1, $2, 'Program blocks', 'folder', true, 2) RETURNING id`,
          [projectId, plcId]
        );
        const blocksId = blocksRes.rows[0].id;

        // 4. Main OB1
        const ob1Res = await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open) VALUES ($1, $2, 'Main [OB1]', 'block_ob', false) RETURNING id`,
          [projectId, blocksId]
        );

        // 4.1 Create program_blocks for OB1
        await query(
          `INSERT INTO program_blocks (node_id, block_type, title, description, content)
         VALUES ($1, 'OB', 'Main [OB1]', NULL, $2)
         ON CONFLICT (node_id) DO NOTHING`,
          [ob1Res.rows[0].id, JSON.stringify({ networks: [] })]
        );

        // 5. PLC Tags Folder
        const tagsRes = await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open, order_index) VALUES ($1, $2, 'PLC tags', 'folder', false, 3) RETURNING id`,
          [projectId, plcId]
        );
        const tagsId = tagsRes.rows[0].id;

        // 6. Default Tag Table
        await query(
          `INSERT INTO project_nodes (project_id, parent_id, name, type, is_open) VALUES ($1, $2, 'Default tag table', 'tag_table', false)`,
          [projectId, tagsId]
        );

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'project.create',
          entityType: 'project',
          entityId: projectId,
          details: { name: newProject.name },
        });

        reply.code(201).send(newProject);
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
    },
  });

  // PATCH /api/v1/projects/:id - 更新项目
  fastify.patch('/projects/:id', {
    onRequest: [requiredAuthMiddleware],
    handler: async (request, reply) => {
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
        if (body.is_public !== undefined) {
          if (body.is_public) {
            updates.push('created_by = NULL');
          } else {
            if (!request.user?.userId) {
              return reply.code(401).send({
                error: {
                  code: 'UNAUTHORIZED',
                  message: '未登录无法设为私有项目',
                },
              });
            }
            updates.push(`created_by = $${paramIndex++}`);
            values.push(request.user.userId);
          }
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
    },
  });

  // DELETE /api/v1/projects/:id - 删除项目
  fastify.delete('/projects/:id', {
    onRequest: [requiredAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在',
            },
          });
        }

        await logAudit({
          projectId: null,
          userId: request.user?.userId || null,
          action: 'project.delete',
          entityType: 'project',
          entityId: id,
          details: { projectId: id },
        });

        return { success: true, message: '项目已删除' };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '删除项目失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/tree - 获取项目树（完整）
  fastify.get('/projects/:id/tree', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      void (request.query as { lazy?: string }).lazy; // Reserved for future lazy loading

      try {
        // 检查项目是否存在
        const projectCheck = await query('SELECT id FROM projects WHERE id = $1', [id]);

        if (projectCheck.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在',
            },
          });
        }

        await ensureDeviceDefaultNodes(id);

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
            orderIndex: row.order_index,
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

        const sortNodes = (nodes: any[]) => {
          nodes.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
          nodes.forEach(child => {
            if (Array.isArray(child.children) && child.children.length > 0) {
              sortNodes(child.children);
            }
          });
        };

        sortNodes(rootNodes);

        return rootNodes;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取项目树失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/export - 导出项目（JSON）
  fastify.get('/projects/:id/export', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );

          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限导出该项目',
              },
            });
          }
        }
        const projectResult = await query('SELECT * FROM projects WHERE id = $1', [id]);

        if (projectResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在',
            },
          });
        }

        if (request.user?.userId) {
          const ownershipCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );
          if (ownershipCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限查看项目树',
              },
            });
          }
        }

        const nodesResult = await query(
          `SELECT id, parent_id, type, name, color, is_open, order_index
         FROM project_nodes
         WHERE project_id = $1
         ORDER BY order_index, name`,
          [id]
        );

        const nodeMap = new Map();
        const rootNodes: any[] = [];

        for (const row of nodesResult.rows) {
          nodeMap.set(row.id, {
            id: row.id,
            name: row.name,
            type: row.type,
            color: row.color,
            isOpen: row.is_open,
            orderIndex: row.order_index,
            children: [],
          });
        }

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

        const tagsResult = await query(
          `SELECT id, name, address, data_type, comment, is_retentive
         FROM tags
         WHERE project_id = $1
         ORDER BY created_at DESC`,
          [id]
        );

        const blocksResult = await query(
          `SELECT pb.*, pn.name as node_name
         FROM program_blocks pb
         JOIN project_nodes pn ON pb.node_id = pn.id
         WHERE pn.project_id = $1
         ORDER BY pb.created_at DESC`,
          [id]
        );

        const hardwareResult = await query(
          `SELECT * FROM hardware_modules WHERE project_id = $1 ORDER BY slot ASC`,
          [id]
        );

        await logAudit({
          projectId: id,
          userId: request.user?.userId || null,
          action: 'project.export',
          entityType: 'project',
          entityId: id,
          details: { format: 'json' },
        });

        return {
          version: '1.0',
          project: projectResult.rows[0],
          projectNodes: rootNodes,
          tags: tagsResult.rows,
          blocks: blocksResult.rows,
          hardware: hardwareResult.rows,
        };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '导出项目失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/export/plcopen - 导出 PLCopen XML（简化版）
  fastify.get('/projects/:id/export/plcopen', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );

          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限导出该项目',
              },
            });
          }
        }
        const projectResult = await query('SELECT * FROM projects WHERE id = $1', [id]);
        if (projectResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: '项目不存在',
            },
          });
        }

        const tagsResult = await query(
          `SELECT name, address, data_type FROM tags WHERE project_id = $1`,
          [id]
        );

        const blocksResult = await query(
          `SELECT pb.id, pb.content, pb.block_type, pn.name as node_name
         FROM program_blocks pb
         JOIN project_nodes pn ON pb.node_id = pn.id
         WHERE pn.project_id = $1`,
          [id]
        );

        const hardwareResult = await query(
          `SELECT * FROM hardware_modules WHERE project_id = $1 ORDER BY slot ASC`,
          [id]
        );

        const nodesResult = await query(
          `SELECT id, name, type, parent_id FROM project_nodes WHERE project_id = $1`,
          [id]
        );

        const project = projectResult.rows[0];
        const now = new Date().toISOString();
        const escapeXmlAttr = (value: string) =>
          value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const escapeXmlText = (value: string) =>
          value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const normalizeString = (value: unknown) => (typeof value === 'string' ? value : '');
        const parseContent = (content: any) => {
          if (!content) return null;
          if (typeof content === 'string') {
            try {
              return JSON.parse(content);
            } catch {
              return null;
            }
          }
          return content;
        };
        const buildLdXml = (content: any) => {
          const parsed = parseContent(content);
          const networks = Array.isArray(parsed?.networks) ? parsed.networks : [];
          if (networks.length === 0) return '';
          let localId = 1;

          const networksXml = networks
            .map((network: any) => {
              const title = normalizeString(network?.title || '');
              const description = normalizeString(network?.description || '');
              const commentText = escapeXmlText([title, description].filter(Boolean).join(' - '));
              const rungs = Array.isArray(network?.rungs) ? network.rungs : [];
              const elements = rungs.flatMap((rung: any) =>
                Array.isArray(rung?.elements) ? rung.elements : []
              );

              if (elements.length === 0) {
                return '';
              }

              const elementsXml = elements
                .map((element: any) => {
                  if (!element) return '';
                  const tag = escapeXmlText(
                    normalizeString(element.tag || element.address || 'Tag')
                  );

                  if (element.type === 'contactNO' || element.type === 'contactNC') {
                    const negated = element.type === 'contactNC' ? 'true' : 'false';
                    const rawComment = normalizeString(element.comment || '');
                    const edgeMatch = rawComment.match(/edge:([a-z]+)/i);
                    const edgeAttr = edgeMatch ? ` edge="${escapeXmlAttr(edgeMatch[1])}"` : '';
                    const commentText = escapeXmlText(
                      rawComment.replace(edgeMatch?.[0] || '', '').trim()
                    );
                    const addressText = escapeXmlText(normalizeString(element.address || ''));
                    const addDataXml =
                      commentText || addressText
                        ? `
            <addData>
              <data name="AIIgnitePLC" handleUnknown="preserve">
                ${addressText ? `<Address>${addressText}</Address>` : ''}
                ${commentText ? `<Comment>${commentText}</Comment>` : ''}
              </data>
            </addData>`
                        : '';
                    return `
          <contact localId="${localId++}" negated="${negated}"${edgeAttr}>
            <variable>${tag}</variable>
            ${addDataXml}
          </contact>`;
                  }

                  if (element.type === 'coil') {
                    const commentText = escapeXmlText(normalizeString(element.comment || ''));
                    const addressText = escapeXmlText(normalizeString(element.address || ''));
                    const coilMode =
                      element.coilMode ||
                      (commentText === 'Set Output'
                        ? 'set'
                        : commentText === 'Reset Output'
                          ? 'reset'
                          : 'assign');
                    const storageAttr =
                      coilMode === 'set'
                        ? ' storage="set"'
                        : coilMode === 'reset'
                          ? ' storage="reset"'
                          : '';
                    const addDataXml =
                      commentText || addressText
                        ? `
            <addData>
              <data name="AIIgnitePLC" handleUnknown="preserve">
                ${addressText ? `<Address>${addressText}</Address>` : ''}
                ${commentText ? `<Comment>${commentText}</Comment>` : ''}
                <CoilMode>${escapeXmlText(coilMode)}</CoilMode>
              </data>
            </addData>`
                        : '';
                    return `
          <coil localId="${localId++}"${storageAttr}>
            <variable>${tag}</variable>
            ${addDataXml}
          </coil>`;
                  }

                  if (element.type === 'box_timer') {
                    const rawType = normalizeString(element.comment || element.address || 'TON');
                    const typeName = escapeXmlAttr(
                      ['CTU', 'CTD', 'TOF', 'TP', 'TON'].includes(rawType.toUpperCase())
                        ? rawType.toUpperCase()
                        : 'TON'
                    );
                    const instanceName = escapeXmlAttr(normalizeString(element.tag || 'Timer'));
                    const commentText = escapeXmlText(normalizeString(element.comment || ''));
                    const parameters = Array.isArray(element.parameters) ? element.parameters : [];
                    const inputVariableXml = parameters
                      .filter((param: any) => param?.name && param?.value)
                      .map((param: any) => {
                        const name = escapeXmlAttr(String(param.name));
                        const value = escapeXmlText(String(param.value));
                        return `
              <variable formalParameter="${name}">
                <value>${value}</value>
              </variable>`;
                      })
                      .join('');
                    const inputXml = inputVariableXml
                      ? `
            <inputVariables>${inputVariableXml}
            </inputVariables>`
                      : '';
                    const commentXml = commentText
                      ? `
            <addData>
              <data name="AIIgnitePLC" handleUnknown="preserve">
                <Comment>${commentText}</Comment>
              </data>
            </addData>`
                      : '';

                    return `
          <block localId="${localId++}" typeName="${typeName}" instanceName="${instanceName}">${inputXml}${commentXml}
          </block>`;
                  }

                  return '';
                })
                .filter(Boolean)
                .join('');

              if (!elementsXml) {
                return '';
              }

              return `
          <network>${commentText ? `\n          <comment>${commentText}</comment>` : ''}${elementsXml}
          </network>`;
            })
            .filter(Boolean)
            .join('');

          if (!networksXml) return '';
          return `
      <LD>${networksXml}
      </LD>`;
        };
        const projectName = escapeXmlAttr(project.name || 'Project');

        const mapToXmlType = (dataType: string) => {
          const type = dataType.toLowerCase();
          if (type === 'bool') return 'BOOL';
          if (type === 'byte') return 'BYTE';
          if (type === 'word') return 'WORD';
          if (type === 'dword') return 'DWORD';
          if (type === 'int') return 'INT';
          if (type === 'dint') return 'DINT';
          if (type === 'real') return 'REAL';
          if (type === 'time') return 'TIME';
          if (type === 'string') return 'STRING';
          return 'BOOL';
        };

        const globalVarsXml = tagsResult.rows
          .map((tag: any) => {
            const varName = escapeXmlAttr(tag.name || 'Tag');
            const typeName = mapToXmlType(tag.data_type || 'Bool');
            const addressText = tag.address ? escapeXmlText(String(tag.address)) : '';
            const addressAttr = tag.address
              ? ` address="${escapeXmlAttr(String(tag.address))}"`
              : '';
            const commentText = tag.comment ? escapeXmlText(String(tag.comment)) : '';
            const addDataXml =
              addressText || commentText
                ? `
        <addData>
          <data name="AIIgnitePLC" handleUnknown="preserve">
            ${addressText ? `<Address>${addressText}</Address>` : ''}
            ${commentText ? `<Comment>${commentText}</Comment>` : ''}
          </data>
        </addData>`
                : '';
            return `
      <variable name="${varName}"${addressAttr}>
        <type><${typeName} /></type>
        ${addDataXml}
      </variable>`;
          })
          .join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201" name="${projectName}">
  <fileHeader companyName="AIIgnite" productName="AIIgnitePLC" productVersion="1.0" creationDateTime="${now}" />
  <contentHeader name="${projectName}" modificationDateTime="${now}">
    <coordinateInfo />
  </contentHeader>
  <types>
    <dataTypes />
    <globalVars>
      ${globalVarsXml}
    </globalVars>
    <pous>
      ${blocksResult.rows
        .map((block: any) => {
          const pouType =
            block.block_type === 'FB'
              ? 'functionBlock'
              : block.block_type === 'FC'
                ? 'function'
                : 'program';
          const pouName = escapeXmlAttr(block.node_name || 'Block');
          const ldXml = buildLdXml(block.content);
          const bodyXml = ldXml
            ? `
        <body>${ldXml}
        </body>`
            : `
        <body>
          <ST><![CDATA[// Ladder JSON is stored in addData]]></ST>
        </body>`;
          return `
      <pou name="${pouName}" pouType="${pouType}">
        <interface />
        ${bodyXml}
      </pou>`;
        })
        .join('')}
    </pous>
  </types>
  <instances />
      <addData>
    <data name="AIIgnitePLC" handleUnknown="preserve">
          <ProjectData><![CDATA[${JSON.stringify({ project: { name: project.name, description: project.description || null }, tags: tagsResult.rows, blocks: blocksResult.rows.map((b: any) => ({ id: b.id, block_type: b.block_type, name: b.node_name, content: b.content })), hardware: hardwareResult.rows, projectNodes: nodesResult.rows })}]]></ProjectData>
    </data>
  </addData>
</project>`;

        await logAudit({
          projectId: id,
          userId: request.user?.userId || null,
          action: 'project.export',
          entityType: 'project',
          entityId: id,
          details: { format: 'plcopen-xml' },
        });

        reply.header('Content-Type', 'application/xml');
        return xml;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '导出 PLCopen XML 失败',
          },
        });
      }
    },
  });

  // POST /api/v1/projects/import - 导入项目（JSON）
  fastify.post('/projects/import', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const body = request.body as any;
      let projectId: string | null = null;
      const sourceFileName = body?.sourceFileName || null;
      const requestedSourceFormat = body?.sourceFormat;
      const sourceFormat = ['SCL', 'XML', 'IEC'].includes(requestedSourceFormat)
        ? requestedSourceFormat
        : 'IEC';

      try {
        const projectName =
          body.project?.name || body.name || `Imported Project ${new Date().toISOString()}`;
        const projectDescription = body.project?.description || body.description || null;

        let finalName = projectName;
        let projectResult;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            projectResult = await query(
              `INSERT INTO projects (name, description, created_by)
               VALUES ($1, $2, $3)
               RETURNING *`,
              [finalName, projectDescription, request.user?.userId || null]
            );
            break;
          } catch (err: any) {
            if (err?.code === '23505') {
              finalName = `${projectName} (${attempt + 1})`;
              continue;
            }
            throw err;
          }
        }

        if (!projectResult) {
          return reply.code(409).send({
            error: {
              code: 'PROJECT_NAME_EXISTS',
              message: '项目名称已存在，导入失败',
            },
          });
        }

        projectId = projectResult.rows[0].id;
        let nodes = Array.isArray(body.projectNodes) ? body.projectNodes : [];
        let blocks = Array.isArray(body.blocks) ? body.blocks : [];
        const tags = Array.isArray(body.tags) ? body.tags : [];
        const hardware = Array.isArray(body.hardware) ? body.hardware : [];

        if (nodes.length === 0 && blocks.length > 0) {
          const makeId = () => randomUUID();
          const rootId = makeId();
          const deviceId = makeId();
          const blocksFolderId = makeId();
          const tagsFolderId = makeId();
          const tagTableId = makeId();

          const blockNodes = blocks.map((block: any) => {
            const blockType = String(block.block_type || block.blockType || 'FC').toUpperCase();
            const nodeType =
              blockType === 'OB' ? 'block_ob' : blockType === 'FB' ? 'block_fb' : 'block_fc';
            return {
              id: makeId(),
              type: nodeType,
              name: block.name || block.title || block.node_name || 'Block',
              isOpen: false,
              children: [],
            };
          });

          nodes = [
            {
              id: rootId,
              type: 'project',
              name: projectResult.rows[0].name,
              isOpen: true,
              children: [
                {
                  id: deviceId,
                  type: 'device',
                  name: 'PLC_1 [CPU 1516-3 PN/DP]',
                  isOpen: true,
                  children: [
                    {
                      id: makeId(),
                      type: 'config',
                      name: '设备组态',
                      color: 'text-yellow-600',
                      isOpen: false,
                      orderIndex: 0,
                      children: [],
                    },
                    {
                      id: makeId(),
                      type: 'settings',
                      name: '在线和诊断',
                      color: 'text-green-600',
                      isOpen: false,
                      orderIndex: 1,
                      children: [],
                    },
                    {
                      id: blocksFolderId,
                      type: 'folder',
                      name: 'Program blocks',
                      isOpen: true,
                      orderIndex: 2,
                      children: blockNodes,
                    },
                    {
                      id: tagsFolderId,
                      type: 'folder',
                      name: 'PLC tags',
                      isOpen: false,
                      orderIndex: 3,
                      children: [
                        {
                          id: tagTableId,
                          type: 'tag_table',
                          name: 'Default tag table',
                          isOpen: false,
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ];

          blocks = blocks.map((block: any, index: number) => ({
            ...block,
            node_id: block.node_id || blockNodes[index]?.id,
            block_type: block.block_type || block.blockType || 'FC',
          }));
        }

        const blockByNodeId = new Map<string, any>();
        blocks.forEach((block: any) => {
          if (block.node_id) blockByNodeId.set(block.node_id, block);
        });

        const blockTypeMap: Record<string, 'OB' | 'FC' | 'FB'> = {
          block_ob: 'OB',
          block_fc: 'FC',
          block_fb: 'FB',
          block: 'FC',
        };

        const insertNode = async (node: any, parentId: string | null, orderIndex: number) => {
          const normalizedType = node.type === 'root' ? 'project' : node.type || 'folder';
          const resolvedOrderIndex =
            typeof node.orderIndex === 'number' ? node.orderIndex : orderIndex;
          const result = await query(
            `INSERT INTO project_nodes (project_id, parent_id, type, name, color, is_open, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
              projectId,
              parentId,
              normalizedType,
              node.name || 'Unnamed',
              node.color || null,
              node.isOpen || false,
              resolvedOrderIndex,
            ]
          );

          const newNode = result.rows[0];
          const oldNodeId = node.id;

          if (blockTypeMap[newNode.type]) {
            const block = blockByNodeId.get(oldNodeId);
            await query(
              `INSERT INTO program_blocks (node_id, block_type, title, description, content)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (node_id) DO NOTHING`,
              [
                newNode.id,
                blockTypeMap[newNode.type],
                newNode.name,
                block?.description || null,
                JSON.stringify(block?.content || { networks: [] }),
              ]
            );
          }

          if (Array.isArray(node.children)) {
            for (let i = 0; i < node.children.length; i++) {
              await insertNode(node.children[i], newNode.id, i);
            }
          }
        };

        for (let i = 0; i < nodes.length; i++) {
          await insertNode(nodes[i], null, i);
        }

        const usedAddresses = new Set(tags.map((tag: any) => tag?.address).filter(Boolean));
        let autoAssigned = 0;
        let renamedTags = 0;
        let bitIndex = 0;
        let byteIndex = 0;
        let wordIndex = 0;
        let dwordIndex = 0;
        const nameCounter = new Map<string, number>();

        const allocateAddress = (dataType: string) => {
          const type = dataType.toLowerCase();
          if (type === 'byte' || type === 'char') {
            while (true) {
              const address = `%MB${byteIndex++}`;
              if (!usedAddresses.has(address)) {
                usedAddresses.add(address);
                return address;
              }
            }
          }

          if (type === 'word' || type === 'int' || type === 'uint') {
            while (true) {
              const address = `%MW${wordIndex++}`;
              if (!usedAddresses.has(address)) {
                usedAddresses.add(address);
                return address;
              }
            }
          }

          if (type === 'dword' || type === 'dint' || type === 'real' || type === 'udint') {
            while (true) {
              const address = `%MD${dwordIndex++}`;
              if (!usedAddresses.has(address)) {
                usedAddresses.add(address);
                return address;
              }
            }
          }

          while (true) {
            const byte = Math.floor(bitIndex / 8);
            const bit = bitIndex % 8;
            bitIndex += 1;
            const address = `%M${byte}.${bit}`;
            if (!usedAddresses.has(address)) {
              usedAddresses.add(address);
              return address;
            }
          }
        };

        const normalizedTags = tags.map((tag: any) => {
          const baseName = String(tag?.name || 'Tag').trim() || 'Tag';
          const count = nameCounter.get(baseName) ?? 0;
          nameCounter.set(baseName, count + 1);
          const resolvedName = count === 0 ? baseName : `${baseName} (${count})`;
          if (count > 0) renamedTags += 1;

          if (tag?.address) {
            return {
              ...tag,
              name: resolvedName,
            };
          }

          const inferredType = tag?.data_type || tag?.dataType || 'Bool';
          autoAssigned += 1;
          return {
            ...tag,
            name: resolvedName,
            address: allocateAddress(String(inferredType)),
          };
        });

        // 导入标签
        for (const tag of normalizedTags) {
          await query(
            `INSERT INTO tags (project_id, name, address, data_type, comment, is_retentive)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              projectId,
              tag.name,
              tag.address,
              tag.data_type || tag.dataType || 'Bool',
              tag.comment || null,
              tag.is_retentive || false,
            ]
          );
        }

        // 导入硬件模块
        for (const module of hardware) {
          await query(
            `INSERT INTO hardware_modules (project_id, slot, name, article_number, firmware, type, hw_id, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (project_id, slot) DO UPDATE SET
               name = EXCLUDED.name,
               article_number = EXCLUDED.article_number,
               firmware = EXCLUDED.firmware,
               type = EXCLUDED.type,
               hw_id = EXCLUDED.hw_id,
               config = EXCLUDED.config,
               updated_at = CURRENT_TIMESTAMP`,
            [
              projectId,
              module.slot,
              module.name,
              module.article_number || module.articleNumber || null,
              module.firmware || null,
              module.type || 'io',
              module.hw_id || module.hwId || null,
              module.config || null,
            ]
          );
        }

        const warnings: string[] = [];
        if (autoAssigned > 0) warnings.push('AUTO_ASSIGNED_ADDRESS');
        if (renamedTags > 0) warnings.push('RENAMED_TAGS');
        const importStatus = warnings.length > 0 ? 'partial' : 'success';
        const diagnostics =
          warnings.length > 0
            ? JSON.stringify({ warning: warnings.join(','), autoAssigned, renamedTags })
            : null;

        // 记录导入历史
        await query(
          `INSERT INTO import_history (project_id, source_format, source_file_name, import_status, diagnostics)
           VALUES ($1, $2, $3, $4, $5)`,
          [projectId, sourceFormat, sourceFileName, importStatus, diagnostics]
        );

        await logAudit({
          projectId,
          userId: request.user?.userId || null,
          action: 'project.import',
          entityType: 'project',
          entityId: projectId,
          details: {
            sourceFormat,
            sourceFileName,
            importStatus,
            autoAssigned,
            renamedTags,
          },
        });

        return reply.code(201).send(projectResult.rows[0]);
      } catch (error) {
        try {
          const diagnostics = {
            error: 'IMPORT_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            projectName: body?.project?.name || body?.name || null,
          };

          await query(
            `INSERT INTO import_history (project_id, source_format, source_file_name, import_status, diagnostics)
             VALUES ($1, $2, $3, $4, $5)`,
            [projectId, sourceFormat, sourceFileName, 'failed', JSON.stringify(diagnostics)]
          );

          await logAudit({
            projectId: projectId || null,
            userId: request.user?.userId || null,
            action: 'project.import.failed',
            entityType: 'project',
            entityId: projectId || null,
            details: diagnostics,
          });
        } catch (_) {
          // ignore
        }

        return reply.code(500).send({
          error: {
            code: 'IMPORT_FAILED',
            message: '导入项目失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/import-history - 获取导入历史（全局）
  fastify.get('/projects/import-history', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId, limit } = request.query as { projectId?: string; limit?: string };
      const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

      try {
        if (projectId) {
          if (request.user?.userId) {
            const projectCheck = await query(
              'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
              [projectId, request.user.userId]
            );

            if (projectCheck.rows.length === 0) {
              return reply.code(403).send({
                error: {
                  code: 'FORBIDDEN',
                  message: '无权限查看该项目导入历史',
                },
              });
            }
          }

          const result = await query(
            `SELECT ih.*, p.name as project_name
             FROM import_history ih
             LEFT JOIN projects p ON ih.project_id = p.id
             WHERE ih.project_id = $1
             ORDER BY ih.created_at DESC
             LIMIT $2`,
            [projectId, resolvedLimit]
          );

          return result.rows;
        }

        if (request.user?.userId) {
          const result = await query(
            `SELECT ih.*, p.name as project_name
             FROM import_history ih
             JOIN projects p ON ih.project_id = p.id
             WHERE p.created_by = $1 OR p.created_by IS NULL
             ORDER BY ih.created_at DESC
             LIMIT $2`,
            [request.user.userId, resolvedLimit]
          );

          return result.rows;
        }

        const result = await query(
          `SELECT ih.*, p.name as project_name
           FROM import_history ih
           LEFT JOIN projects p ON ih.project_id = p.id
           ORDER BY ih.created_at DESC
           LIMIT $1`,
          [resolvedLimit]
        );

        return result.rows;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取导入历史失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/import-history - 获取导入历史
  fastify.get('/projects/:id/import-history', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );

          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限查看该项目导入历史',
              },
            });
          }
        }

        const result = await query(
          `SELECT ih.*, p.name as project_name
           FROM import_history ih
           LEFT JOIN projects p ON ih.project_id = p.id
           WHERE ih.project_id = $1
           ORDER BY ih.created_at DESC`,
          [id]
        );

        return result.rows;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取导入历史失败',
          },
        });
      }
    },
  });

  // GET /api/v1/projects/:id/audit-logs - 获取项目审计日志
  fastify.get('/projects/:id/audit-logs', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { limit } = request.query as { limit?: string };
      const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );

          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限查看该项目审计日志',
              },
            });
          }
        }

        const result = await query(
          `SELECT al.*, p.name as project_name, u.username as user_name
           FROM audit_logs al
           LEFT JOIN projects p ON al.project_id = p.id
           LEFT JOIN users u ON al.user_id = u.id
           WHERE al.project_id = $1
           ORDER BY al.created_at DESC
           LIMIT $2`,
          [id, resolvedLimit]
        );

        return result.rows;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取审计日志失败',
          },
        });
      }
    },
  });

  // GET /api/v1/audit-logs - 获取审计日志（全局/可选项目过滤）
  fastify.get('/audit-logs', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { projectId, limit } = request.query as { projectId?: string; limit?: string };
      const resolvedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

      try {
        if (projectId) {
          if (request.user?.userId) {
            const projectCheck = await query(
              'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
              [projectId, request.user.userId]
            );

            if (projectCheck.rows.length === 0) {
              return reply.code(403).send({
                error: {
                  code: 'FORBIDDEN',
                  message: '无权限查看该项目审计日志',
                },
              });
            }
          }

          const result = await query(
            `SELECT al.*, p.name as project_name, u.username as user_name
             FROM audit_logs al
             LEFT JOIN projects p ON al.project_id = p.id
             LEFT JOIN users u ON al.user_id = u.id
             WHERE al.project_id = $1
             ORDER BY al.created_at DESC
             LIMIT $2`,
            [projectId, resolvedLimit]
          );
          return result.rows;
        }

        if (request.user?.userId) {
          const result = await query(
            `SELECT al.*, p.name as project_name, u.username as user_name
             FROM audit_logs al
             JOIN projects p ON al.project_id = p.id
             LEFT JOIN users u ON al.user_id = u.id
             WHERE p.created_by = $1 OR p.created_by IS NULL
             ORDER BY al.created_at DESC
             LIMIT $2`,
            [request.user.userId, resolvedLimit]
          );
          return result.rows;
        }

        const result = await query(
          `SELECT al.*, p.name as project_name, u.username as user_name
           FROM audit_logs al
           LEFT JOIN projects p ON al.project_id = p.id
           LEFT JOIN users u ON al.user_id = u.id
           ORDER BY al.created_at DESC
           LIMIT $1`,
          [resolvedLimit]
        );

        return result.rows;
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '获取审计日志失败',
          },
        });
      }
    },
  });

  // POST /api/v1/projects/:id/compile - 编译整个项目
  fastify.post('/projects/:id/compile', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        if (request.user?.userId) {
          const projectCheck = await query(
            'SELECT id FROM projects WHERE id = $1 AND (created_by = $2 OR created_by IS NULL)',
            [id, request.user.userId]
          );

          if (projectCheck.rows.length === 0) {
            return reply.code(403).send({
              error: {
                code: 'FORBIDDEN',
                message: '无权限编译该项目',
              },
            });
          }
        }
        const tagsResult = await query('SELECT name, address FROM tags WHERE project_id = $1', [
          id,
        ]);

        const tagNameSet = new Set<string>();
        const tagAddressSet = new Set<string>();
        tagsResult.rows.forEach(tag => {
          if (tag.name) tagNameSet.add(tag.name);
          if (tag.address) tagAddressSet.add(tag.address);
        });

        const blocksResult = await query(
          `SELECT pb.id, pb.content
         FROM program_blocks pb
         JOIN project_nodes pn ON pb.node_id = pn.id
         WHERE pn.project_id = $1`,
          [id]
        );

        const diagnostics: any[] = [];

        for (const block of blocksResult.rows) {
          const content = block.content as { networks?: any[] };
          if (!content?.networks) continue;

          for (const network of content.networks) {
            if (!network.rungs || !Array.isArray(network.rungs)) continue;

            for (const rung of network.rungs) {
              if (!rung.elements || !Array.isArray(rung.elements)) continue;

              const coils: any[] = [];

              for (const element of rung.elements) {
                // 检查双线圈
                if (element.type === 'coil') {
                  const duplicate = coils.find(c => c.address === element.address);
                  if (duplicate) {
                    diagnostics.push({
                      severity: 'error',
                      message: `双线圈冲突: 地址 ${element.address} 被多次使用`,
                      elementId: element.id,
                      code: 'DOUBLE_COIL',
                      blockId: block.id,
                    });
                  }
                  coils.push(element);
                }

                // 地址格式
                if (element.address && !isValidAddress(element.address)) {
                  diagnostics.push({
                    severity: 'error',
                    message: `地址格式无效: ${element.address}`,
                    elementId: element.id,
                    code: 'INVALID_ADDRESS',
                    blockId: block.id,
                  });
                }

                if (element.tag && tagNameSet.size > 0 && !tagNameSet.has(element.tag)) {
                  diagnostics.push({
                    severity: 'warning',
                    message: `未定义标签: ${element.tag}`,
                    elementId: element.id,
                    code: 'UNDEFINED_TAG',
                    blockId: block.id,
                  });
                }

                if (
                  element.address &&
                  element.address.startsWith('%') &&
                  tagAddressSet.size > 0 &&
                  !tagAddressSet.has(element.address)
                ) {
                  diagnostics.push({
                    severity: 'warning',
                    message: `未定义地址: ${element.address}`,
                    elementId: element.id,
                    code: 'UNDEFINED_ADDRESS',
                    blockId: block.id,
                  });
                }
              }
            }
          }
        }

        await logAudit({
          projectId: id,
          userId: request.user?.userId || null,
          action: 'project.compile',
          entityType: 'project',
          entityId: id,
          details: { diagnosticsCount: diagnostics.length },
        });

        return {
          success: diagnostics.length === 0,
          diagnostics,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return reply.code(500).send({
          error: {
            code: 'DATABASE_ERROR',
            message: '编译项目失败',
          },
        });
      }
    },
  });

  console.log('  ✅ /api/v1/projects - 项目管理路由已注册');
}

function isValidAddress(address: string): boolean {
  return (
    /^%[IQM]\d+(?:\.\d+)?$/i.test(address) ||
    /^%M[BDW]\d+$/i.test(address) ||
    /^%DB\d+\.(DBD|DBW|DBB)\d+$/i.test(address)
  );
}
