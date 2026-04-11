import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const [alertsResult, cuttersResult, videosResult, auditResult] = await Promise.all([
    db.execute(`
      SELECT a.id, a.cutter_id, a.video_id, a.alert_type, a.severity, a.title, a.description, a.status, a.created_at,
             c.name as cutter_name,
             v.url as video_url, v.platform as video_platform
      FROM alerts a
      JOIN cutters c ON c.id = a.cutter_id
      LEFT JOIN cutter_videos v ON v.id = a.video_id
      WHERE a.status = 'open'
      ORDER BY
        CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        a.created_at DESC
      LIMIT 50
    `),
    db.execute(`
      SELECT c.id, c.name, c.email, c.role, c.is_active,
             COUNT(v.id) as video_count,
             SUM(CASE WHEN v.discrepancy_status IN ('suspicious_difference','critical_difference') THEN 1 ELSE 0 END) as flagged_count,
             SUM(CASE WHEN v.verification_status = 'verified' THEN 1 ELSE 0 END) as verified_count,
             COALESCE(rs.score, 100) as score
      FROM cutters c
      LEFT JOIN cutter_videos v ON v.cutter_id = c.id
      LEFT JOIN reliability_scores rs ON rs.cutter_id = c.id
      GROUP BY c.id
      ORDER BY flagged_count DESC, c.name
    `),
    db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN discrepancy_status = 'suspicious_difference' THEN 1 ELSE 0 END) as suspicious,
        SUM(CASE WHEN discrepancy_status = 'critical_difference' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN discrepancy_status = 'match' THEN 1 ELSE 0 END) as matched
      FROM cutter_videos
    `),
    db.execute(`
      SELECT al.id, al.actor_name, al.action, al.entity_type, al.entity_id, al.meta, al.created_at
      FROM audit_log al
      ORDER BY al.created_at DESC
      LIMIT 100
    `),
  ]);

  return NextResponse.json({
    alerts: alertsResult.rows,
    cutters: cuttersResult.rows,
    stats: videosResult.rows[0] ?? {},
    auditLog: auditResult.rows,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { alertId, status } = await request.json();
  if (!alertId || !['open', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  }

  const db = await ensureDb();
  await db.execute({
    sql: `UPDATE alerts SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`,
    args: [status, auth.id, alertId],
  });

  await writeAuditLog(db, {
    actorId: auth.id,
    actorName: auth.name,
    action: status === 'resolved' ? 'alert_resolve' : 'alert_dismiss',
    entityType: 'alert',
    entityId: alertId,
  });

  return NextResponse.json({ success: true });
}
