import { randomUUID } from 'crypto';
import type { DbClient } from '@/lib/db';

export type AuditAction =
  | 'video_submit'
  | 'video_delete'
  | 'invoice_generate'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'cutter_deactivate'
  | 'cutter_reactivate'
  | 'cutter_create'
  | 'cutter_delete'
  | 'alert_resolve'
  | 'alert_dismiss'
  | 'proof_approve'
  | 'proof_reject'
  | 'proof_request'
  | 'proof_start_review'
  | 'proof_reupload_request'
  // clip notes — internal-only notes are silent; cutter-visible adds + all deletes are audited
  | 'note_add'
  | 'note_delete';

export interface AuditOptions {
  actorId: string;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Write a single audit log entry. Never throws — log failures are silent.
 */
export async function writeAuditLog(
  db: DbClient,
  opts: AuditOptions
): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        randomUUID(),
        opts.actorId,
        opts.actorName,
        opts.action,
        opts.entityType,
        opts.entityId ?? null,
        opts.meta ? JSON.stringify(opts.meta) : null,
      ],
    });
  } catch (err) {
    console.error('[audit_log] write failed:', err);
  }
}
