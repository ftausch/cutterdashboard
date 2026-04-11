import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

type AlertAction = 'acknowledge' | 'start_review' | 'resolve' | 'dismiss' | 'assign_self' | 'reopen';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id: alertId } = await params;
  const { action } = await request.json() as { action: AlertAction };

  const validActions: AlertAction[] = ['acknowledge', 'start_review', 'resolve', 'dismiss', 'assign_self', 'reopen'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  }

  const db = await ensureDb();

  // Fetch current alert
  const result = await db.execute({
    sql: `SELECT id, status, video_id, cutter_id, type FROM ops_alerts WHERE id = ?`,
    args: [alertId],
  });

  const alert = result.rows[0] as Record<string, unknown> | undefined;
  if (!alert) {
    return NextResponse.json({ error: 'Alert nicht gefunden' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const videoId = alert.video_id as string;
  const currentStatus = alert.status as string;

  switch (action) {
    case 'acknowledge': {
      if (currentStatus !== 'open') break;
      await db.execute({
        sql: `UPDATE ops_alerts SET status = 'acknowledged', acknowledged_at = ?, updated_at = ? WHERE id = ?`,
        args: [now, now, alertId],
      });
      break;
    }

    case 'start_review': {
      if (!['open', 'acknowledged'].includes(currentStatus)) break;
      await db.execute({
        sql: `UPDATE ops_alerts SET status = 'in_review', updated_at = ? WHERE id = ?`,
        args: [now, alertId],
      });
      break;
    }

    case 'resolve': {
      if (['resolved', 'dismissed'].includes(currentStatus)) break;
      await db.execute({
        sql: `UPDATE ops_alerts
              SET status = 'resolved', resolved_at = ?, updated_at = ?,
                  resolved_by_id = ?, resolved_by_name = ?
              WHERE id = ?`,
        args: [now, now, auth.id, auth.name, alertId],
      });
      await writeAuditLog(db, {
        actorId: auth.id,
        actorName: auth.name,
        action: 'alert_resolve',
        entityType: 'alert',
        entityId: alertId,
        meta: { video_id: videoId, alert_type: alert.type },
      });
      break;
    }

    case 'dismiss': {
      if (['resolved', 'dismissed'].includes(currentStatus)) break;
      await db.execute({
        sql: `UPDATE ops_alerts
              SET status = 'dismissed', dismissed_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [now, now, alertId],
      });
      await writeAuditLog(db, {
        actorId: auth.id,
        actorName: auth.name,
        action: 'alert_dismiss',
        entityType: 'alert',
        entityId: alertId,
        meta: { video_id: videoId, alert_type: alert.type },
      });
      break;
    }

    case 'assign_self': {
      if (['resolved', 'dismissed'].includes(currentStatus)) break;
      await db.execute({
        sql: `UPDATE ops_alerts SET assignee_id = ?, assignee_name = ?, updated_at = ? WHERE id = ?`,
        args: [auth.id, auth.name, now, alertId],
      });
      break;
    }

    case 'reopen': {
      if (!['resolved', 'dismissed'].includes(currentStatus)) break;
      await db.execute({
        sql: `UPDATE ops_alerts
              SET status = 'open',
                  resolved_at = NULL, dismissed_at = NULL,
                  resolved_by_id = NULL, resolved_by_name = NULL,
                  triggered_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [now, now, alertId],
      });
      break;
    }
  }

  return NextResponse.json({ success: true });
}
