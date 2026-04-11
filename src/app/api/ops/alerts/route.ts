import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

// GET /api/ops/alerts
// Query params:
//   status   — comma-separated, default: open,acknowledged,in_review
//   severity — comma-separated, default: all
//   type     — comma-separated, default: all
//   limit    — default 50, max 100
//   offset   — default 0

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { searchParams } = new URL(request.url);

  const statusParam   = searchParams.get('status')   ?? 'open,acknowledged,in_review';
  const severityParam = searchParams.get('severity');
  const typeParam     = searchParams.get('type');
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0'),  0);

  const statuses   = statusParam.split(',').map(s => s.trim()).filter(Boolean);
  const severities = severityParam ? severityParam.split(',').map(s => s.trim()).filter(Boolean) : null;
  const types      = typeParam     ? typeParam.split(',').map(s => s.trim()).filter(Boolean)      : null;

  const db = await ensureDb();

  // ── Build WHERE clause ────────────────────────────────────────
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  conditions.push(`a.status IN (${statuses.map(() => '?').join(',')})`);
  args.push(...statuses);

  if (severities?.length) {
    conditions.push(`a.severity IN (${severities.map(() => '?').join(',')})`);
    args.push(...severities);
  }
  if (types?.length) {
    conditions.push(`a.type IN (${types.map(() => '?').join(',')})`);
    args.push(...types);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  // ── Run queries in parallel ───────────────────────────────────
  const [alertsResult, countsResult, totalResult] = await Promise.all([
    db.execute({
      sql: `SELECT
              a.id, a.type, a.severity, a.status,
              a.title, a.detail, a.meta,
              a.video_id, a.cutter_id, a.cutter_name,
              a.assignee_id, a.assignee_name,
              a.triggered_at, a.created_at, a.updated_at,
              a.acknowledged_at, a.resolved_at, a.dismissed_at,
              a.resolved_by_name,
              v.title        AS video_title,
              v.platform,
              v.url,
              v.claimed_views,
              v.current_views,
              v.discrepancy_percent,
              v.proof_status,
              v.last_scraped_at
            FROM ops_alerts a
            LEFT JOIN cutter_videos v ON v.id = a.video_id
            ${where}
            ORDER BY
              CASE a.severity
                WHEN 'critical' THEN 1
                WHEN 'high'     THEN 2
                WHEN 'medium'   THEN 3
                ELSE 4 END ASC,
              a.triggered_at ASC
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),

    // All-status counts grouped by (status, severity) for filter pills
    db.execute({
      sql: `SELECT status, severity, COUNT(*) AS cnt FROM ops_alerts GROUP BY status, severity`,
      args: [],
    }),

    // Total matching rows for pagination
    db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM ops_alerts a ${where}`,
      args: [...args],
    }),
  ]);

  // ── Parse alerts ──────────────────────────────────────────────
  const alerts = alertsResult.rows.map((row) => {
    const r = row as Record<string, unknown>;
    let meta: Record<string, unknown> = {};
    try { if (r.meta) meta = JSON.parse(r.meta as string); } catch { /* ignore */ }
    return {
      id:             r.id,
      type:           r.type,
      severity:       r.severity,
      status:         r.status,
      title:          r.title,
      detail:         r.detail,
      meta,
      videoId:        r.video_id,
      cutterId:       r.cutter_id,
      cutterName:     r.cutter_name,
      assigneeId:     r.assignee_id    ?? null,
      assigneeName:   r.assignee_name  ?? null,
      triggeredAt:    r.triggered_at,
      createdAt:      r.created_at,
      updatedAt:      r.updated_at,
      acknowledgedAt: r.acknowledged_at ?? null,
      resolvedAt:     r.resolved_at     ?? null,
      dismissedAt:    r.dismissed_at    ?? null,
      resolvedByName: r.resolved_by_name ?? null,
      video: {
        title:              r.video_title         ?? null,
        platform:           r.platform            ?? null,
        url:                r.url                 ?? null,
        claimedViews:       r.claimed_views       != null ? Number(r.claimed_views)       : null,
        currentViews:       r.current_views       != null ? Number(r.current_views)       : null,
        discrepancyPercent: r.discrepancy_percent != null ? Number(r.discrepancy_percent) : null,
        proofStatus:        r.proof_status         ?? null,
        lastScrapedAt:      r.last_scraped_at      ?? null,
      },
    };
  });

  // ── Parse counts ──────────────────────────────────────────────
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of countsResult.rows as Array<Record<string, unknown>>) {
    const s  = row.status   as string;
    const sv = row.severity as string;
    const n  = Number(row.cnt);
    if (!matrix[s]) matrix[s] = {};
    matrix[s][sv] = n;
  }

  const statusCounts: Record<string, number> = {};
  for (const s of ['open', 'acknowledged', 'in_review', 'resolved', 'dismissed']) {
    statusCounts[s] = Object.values(matrix[s] ?? {}).reduce((a, b) => a + b, 0);
  }

  const activeStatuses = ['open', 'acknowledged', 'in_review'];
  const openBySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const s of activeStatuses) {
    for (const sv of ['critical', 'high', 'medium', 'low']) {
      openBySeverity[sv] += matrix[s]?.[sv] ?? 0;
    }
  }

  const totalActive = activeStatuses.reduce((a, s) => a + (statusCounts[s] ?? 0), 0);
  const totalMatching = Number((totalResult.rows[0] as Record<string, unknown>)?.cnt ?? 0);

  return NextResponse.json({
    alerts,
    statusCounts,
    openBySeverity,
    totalActive,
    totalMatching,
    hasMore: offset + alerts.length < totalMatching,
  });
}
