/**
 * PLC compile & download API routes
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { optionalAuthMiddleware } from '../middleware/auth';
import { buildAiplc1Package, emitBytecode } from '../plc/bytecodeEmitter';
import { buildJsonDebugFlat } from '../plc/jsonDebugEncoder';
import { compileNetworksToIr, countRungs } from '../plc/ldCompiler';
import {
  buildDownloadSession,
  buildFrame,
  buildMultiBlockDeploySession,
  COMMAND_PLC_JSON,
  framesToHex,
} from '../plc/rh850Protocol';
import { buildSfcBinary, compileSfcToIr } from '../plc/sfcParser';
import { compileStToIr } from '../plc/stParser';
import type { PlcTagEntry } from '../plc/types';

const compileSchema = z.object({
  networks: z.array(z.any()).optional(),
  st_source: z.string().optional(),
  sfc: z.any().optional(),
  tags: z.array(z.any()).optional(),
  scan_ms: z.number().int().min(1).max(100).optional(),
});

export async function plcRoutes(fastify: FastifyInstance) {
  fastify.post('/plc/compile', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const body = compileSchema.parse(request.body);
      const scanMs = body.scan_ms ?? 10;
      const tags: PlcTagEntry[] = [];
      let ir: ReturnType<typeof compileNetworksToIr>['ir'] = [];
      let rungCount = 0;
      let sfcBinary: Uint8Array | undefined;

      try {
        if (body.networks?.length) {
          const result = compileNetworksToIr(body.networks, body.tags);
          ir = result.ir;
          tags.push(...result.tags);
          rungCount = countRungs(body.networks);
        }
        if (body.st_source) {
          const stIr = compileStToIr(body.st_source, tags);
          ir = ir.concat(stIr);
        }
        if (body.sfc) {
          const sfcIr = compileSfcToIr(body.sfc, tags);
          ir = ir.concat(sfcIr);
          sfcBinary = buildSfcBinary(body.sfc, tags).binary;
        }

        const compiled = emitBytecode(ir, tags, scanMs, { rungCount, sfc: body.sfc });
        if (compiled.diagnostics.some(d => d.severity === 'error')) {
          return reply.code(400).send({
            success: false,
            diagnostics: compiled.diagnostics,
            error: { message: compiled.diagnostics.find(d => d.severity === 'error')?.message },
          });
        }
        const packageJson = buildAiplc1Package(compiled.binary, scanMs, tags, { sfcBinary });
        const download = buildDownloadSession(compiled.binary, 512, {
          slotId: 0,
          blockType: 1,
          name: 'Main [OB1]',
          scanMs,
        });
        const deployBlocks: Array<{
          binary: Uint8Array;
          meta: import('../plc/rh850Protocol').DownloadBlockMeta;
        }> = [
          {
            binary: compiled.binary,
            meta: { slotId: 0, blockType: 1, name: 'Main [OB1]', scanMs },
          },
        ];
        if (sfcBinary && sfcBinary.length > 0) {
          deployBlocks.push({
            binary: sfcBinary,
            meta: { slotId: 7, blockType: 4, name: 'Main [SFC]', scanMs },
          });
        }
        const deploy = buildMultiBlockDeploySession(deployBlocks, scanMs);
        const deployAllFrames = [...deploy.enableFrames, ...deploy.frames, deploy.startFrame];

        let jsonDebugHex: string | undefined;
        if (body.networks?.length) {
          const flat = buildJsonDebugFlat(body.networks);
          jsonDebugHex = framesToHex([buildFrame(COMMAND_PLC_JSON, 0, flat)]);
        }

        return {
          success: true,
          diagnostics: compiled.diagnostics,
          package: packageJson,
          binarySize: compiled.binary.length,
          downloadFrameCount: download.frames.length,
          downloadHex: framesToHex(download.frames),
          deployHex: framesToHex(deployAllFrames),
          deployFrameCount: deployAllFrames.length,
          jsonDebugHex,
        };
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: { message: err.message || 'Compile failed' },
        });
      }
    },
  });

  fastify.post('/plc/compile/:blockId', {
    onRequest: [optionalAuthMiddleware],
    handler: async (request, reply) => {
      const { blockId } = request.params as { blockId: string };
      const blockRes = await query('SELECT content FROM program_blocks WHERE id = $1', [blockId]);
      if (blockRes.rows.length === 0) {
        return reply.code(404).send({ error: { message: 'Block not found' } });
      }
      const content = blockRes.rows[0].content;
      const networks = content?.networks || [];
      const projectId = await query(
        `SELECT pn.project_id FROM program_blocks pb JOIN project_nodes pn ON pb.node_id = pn.id WHERE pb.id = $1`,
        [blockId]
      );
      const tagsRes = projectId.rows.length
        ? await query(
            'SELECT name, address, data_type, is_retentive FROM tags WHERE project_id = $1',
            [projectId.rows[0].project_id]
          )
        : { rows: [] };

      const result = compileNetworksToIr(networks, tagsRes.rows);
      const compiled = emitBytecode(result.ir, result.tags, 10);
      return {
        success: true,
        package: buildAiplc1Package(compiled.binary, 10, result.tags),
        downloadHex: framesToHex(buildDownloadSession(compiled.binary).frames),
      };
    },
  });
}
