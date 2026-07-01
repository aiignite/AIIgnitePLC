import { query } from '../db';

export const logAudit = async (params: {
  projectId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, any> | null;
}) => {
  try {
    await query(
      `INSERT INTO audit_logs (project_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.projectId || null,
        params.userId || null,
        params.action,
        params.entityType || null,
        params.entityId || null,
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
  } catch (_) {
    // ignore audit failures
  }
};
