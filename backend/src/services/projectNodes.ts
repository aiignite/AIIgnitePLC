/**
 * 项目树默认节点维护
 */

import { query } from '../db';

const DEVICE_CHILD_DEFAULTS = [
  { type: 'config', name: '设备组态', color: 'text-yellow-600', orderIndex: 0 },
  { type: 'settings', name: '在线和诊断', color: 'text-green-600', orderIndex: 1 },
] as const;

export async function insertDeviceDefaultChildNodes(
  projectId: string,
  deviceId: string,
  startOrderIndex = 0
) {
  for (let i = 0; i < DEVICE_CHILD_DEFAULTS.length; i++) {
    const child = DEVICE_CHILD_DEFAULTS[i];
    await query(
      `INSERT INTO project_nodes (project_id, parent_id, type, name, color, is_open, order_index)
       VALUES ($1, $2, $3, $4, $5, false, $6)`,
      [projectId, deviceId, child.type, child.name, child.color, startOrderIndex + i]
    );
  }
}

/** 为缺少 config/settings 子节点的 PLC 设备补全默认节点 */
export async function ensureDeviceDefaultNodes(projectId: string) {
  const devices = await query(
    `SELECT id FROM project_nodes
     WHERE project_id = $1 AND type = 'device'`,
    [projectId]
  );

  for (const device of devices.rows) {
    for (const child of DEVICE_CHILD_DEFAULTS) {
      const existing = await query(
        `SELECT id FROM project_nodes
         WHERE project_id = $1 AND parent_id = $2 AND type = $3
         LIMIT 1`,
        [projectId, device.id, child.type]
      );

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO project_nodes (project_id, parent_id, type, name, color, is_open, order_index)
           VALUES ($1, $2, $3, $4, $5, false, $6)`,
          [projectId, device.id, child.type, child.name, child.color, child.orderIndex]
        );
      }
    }
  }
}
