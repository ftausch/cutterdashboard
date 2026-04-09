/**
 * Audit Service — Every important action is traceable.
 *
 * Records: who did what, to which entity, when, and with what context.
 * Immutable — no updates, only inserts.
 */

import { randomUUID } from 'crypto';
import type { AuditAction } from './types';

interface AuditEntry {
  actorId: string;
  actorName: string;
  action: AuditAction;
  entityType: 'video' | 'invoice' | 'cutter' | 'sync';
  entityId: string;
  meta?: Record<string, unknown>;
}

async function dbExec(sql: string, args: unknown[] = []) {
  const url = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map((a) => a === null ? { type: 'null' } : typeof a === 'number' ? { type: 'integer', value: String(a) } : { type: 'text', value: String(a) }) } },
        { type: 'close' },
      ],
    }),
  });
  const data = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await dbExec(
      `INSERT INTO audit_log
        (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        randomUUID(),
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.meta ? JSON.stringify(entry.meta) : null,
      ]
    );
  } catch (e) {
    // Audit failures should never crash the main flow
    console.error('[Audit] Failed to write audit log:', e);
  }
}

/**
 * Get audit trail for a specific entity (e.g. a video).
 */
export async function getAuditTrail(entityType: string, entityId: string) {
  const result = await dbExec(
    `SELECT actor_name, action, meta, created_at
     FROM audit_log
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [entityType, entityId]
  );

  return (result?.rows ?? []).map((row: unknown[]) => ({
    actorName: (row[0] as { value: string }).value,
    action: (row[1] as { value: string }).value,
    meta: (() => { try { return JSON.parse((row[2] as { value: string })?.value ?? 'null'); } catch { return null; } })(),
    createdAt: (row[3] as { value: string }).value,
  }));
}
