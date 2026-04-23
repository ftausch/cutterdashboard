/**
 * GET   /api/ops/audits/:id  — audit detail
 * PATCH /api/ops/audits/:id  — update data OR admin action (status + notes)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { scoreAuditRisk, type DataSource } from '@/lib/audit-risk';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        type: 'execute',
        stmt: {
          sql,
          args: args.map(a =>
            a === null          ? { type: 'null' } :
            typeof a === 'number' ? { type: 'integer', value: String(Math.round(a)) } :
            { type: 'text', value: String(a) }
          ),
        },
      }, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id } = await params;

  const [auditRes, filesRes] = await Promise.all([
    dbQuery(
      `SELECT a.id, a.cutter_id, a.platform, a.month,
              a.total_views, a.total_clips,
              a.total_likes, a.total_comments, a.total_shares, a.avg_watch_time_sec,
              a.followers_start, a.followers_end,
              a.top_countries, a.top_cities,
              a.data_source, a.cutter_notes,
              a.fraud_risk_score, a.geo_risk, a.engagement_risk,
              a.spike_risk, a.data_quality_risk, a.risk_flags,
              a.audit_status,
              a.reviewed_by_id, a.reviewed_by_name, a.reviewed_at, a.review_notes,
              a.submitted_at, a.created_at, a.updated_at,
              c.name AS cutter_name, c.email AS cutter_email
       FROM monthly_audits a
       JOIN cutters c ON c.id = a.cutter_id
       WHERE a.id = ?`,
      [id]
    ),
    dbQuery(
      `SELECT id, file_url, file_name, file_size, mime_type, description, uploaded_at
       FROM monthly_audit_files
       WHERE audit_id = ?
       ORDER BY uploaded_at DESC`,
      [id]
    ),
  ]);

  if (!auditRes.rows.length) {
    return NextResponse.json({ error: 'Audit nicht gefunden' }, { status: 404 });
  }

  const r = auditRes.rows[0] as unknown[];
  const audit = {
    id:               val(r[0]),
    cutter_id:        val(r[1]),
    platform:         val(r[2]),
    month:            val(r[3]),
    total_views:      num(r[4])  ?? 0,
    total_clips:      num(r[5])  ?? 0,
    total_likes:      num(r[6]),
    total_comments:   num(r[7]),
    total_shares:     num(r[8]),
    avg_watch_time_sec: num(r[9]),
    followers_start:  num(r[10]),
    followers_end:    num(r[11]),
    top_countries:    JSON.parse(val(r[12]) ?? '[]'),
    top_cities:       JSON.parse(val(r[13]) ?? '[]'),
    data_source:      val(r[14]) ?? 'unavailable',
    cutter_notes:     val(r[15]),
    fraud_risk_score: num(r[16]) ?? 0,
    geo_risk:         num(r[17]) ?? 0,
    engagement_risk:  num(r[18]) ?? 0,
    spike_risk:       num(r[19]) ?? 0,
    data_quality_risk: num(r[20]) ?? 0,
    risk_flags:       JSON.parse(val(r[21]) ?? '[]'),
    audit_status:     val(r[22]) ?? 'pending',
    reviewed_by_id:   val(r[23]),
    reviewed_by_name: val(r[24]),
    reviewed_at:      val(r[25]),
    review_notes:     val(r[26]),
    submitted_at:     val(r[27]),
    created_at:       val(r[28]),
    updated_at:       val(r[29]),
    cutter_name:      val(r[30]),
    cutter_email:     val(r[31]),
  };

  const files = (filesRes.rows as unknown[][]).map(f => ({
    id:          val(f[0]),
    file_url:    val(f[1]),
    file_name:   val(f[2]),
    file_size:   num(f[3]),
    mime_type:   val(f[4]),
    description: val(f[5]),
    uploaded_at: val(f[6]),
  }));

  return NextResponse.json({ audit, files });
}

// ── PATCH ─────────────────────────────────────────────────────────────────
// Supports two modes:
//   { action: 'approve'|'flag'|'reject'|'request_proof'|'start_review', note? }
//   { data: { total_views, top_countries, ... } }   ← update analytics data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id }  = await params;
  const body    = await request.json() as Record<string, unknown>;
  const now     = new Date().toISOString();

  // ── Verify audit exists ──────────────────────────────────────────────────
  const existing = await dbQuery(
    `SELECT cutter_id, platform, month, total_views, top_countries, data_source,
            total_likes, total_comments, total_shares, audit_status
     FROM monthly_audits WHERE id = ?`,
    [id]
  );
  if (!existing.rows.length) {
    return NextResponse.json({ error: 'Audit nicht gefunden' }, { status: 404 });
  }
  const ex = existing.rows[0] as unknown[];

  // ── Admin status action ──────────────────────────────────────────────────
  if (body.action) {
    const ACTION_STATUS: Record<string, string> = {
      approve:       'approved',
      flag:          'flagged',
      reject:        'rejected',
      request_proof: 'proof_requested',
      start_review:  'under_review',
    };
    const newStatus = ACTION_STATUS[body.action as string];
    if (!newStatus) return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });

    // Write audit log
    await dbQuery(
      `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
       VALUES (?, ?, ?, ?, 'monthly_audit', ?, ?, ?)`,
      [
        randomUUID(), auth.id, auth.name,
        `audit.${body.action as string}`, id,
        JSON.stringify({ note: body.note ?? null }),
        now,
      ]
    );

    await dbQuery(
      `UPDATE monthly_audits
       SET audit_status    = ?,
           reviewed_by_id  = ?,
           reviewed_by_name = ?,
           reviewed_at     = ?,
           review_notes    = COALESCE(?, review_notes),
           updated_at      = ?
       WHERE id = ?`,
      [newStatus, auth.id, auth.name, now, body.note ?? null, now, id]
    );

    return NextResponse.json({ success: true, audit_status: newStatus });
  }

  // ── Data update ──────────────────────────────────────────────────────────
  if (body.data) {
    const d = body.data as Record<string, unknown>;

    const totalViews     = typeof d.total_views     === 'number' ? d.total_views     : (num(ex[3]) ?? 0);
    const topCountries   = Array.isArray(d.top_countries)       ? d.top_countries    : JSON.parse(val(ex[4]) ?? '[]');
    const dataSource     = (d.data_source as DataSource | undefined) ?? (val(ex[5]) as DataSource ?? 'unavailable');
    const totalLikes     = typeof d.total_likes     === 'number' ? d.total_likes     : num(ex[6]);
    const totalComments  = typeof d.total_comments  === 'number' ? d.total_comments  : num(ex[7]);
    const totalShares    = typeof d.total_shares    === 'number' ? d.total_shares    : num(ex[8]);

    // Count proof files for risk re-calculation
    const filesCount = await dbQuery(
      `SELECT COUNT(*) FROM monthly_audit_files WHERE audit_id = ?`, [id]
    );
    const hasFiles = (num((filesCount.rows[0] as unknown[])[0]) ?? 0) > 0;

    // Previous month for spike detection
    const platform  = val(ex[1])!;
    const cutterIdV = val(ex[0])!;
    const monthStr  = val(ex[2])!;
    const [y, m]    = monthStr.split('-').map(Number);
    const prevDate  = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevRes   = await dbQuery(
      `SELECT total_views FROM monthly_audits WHERE cutter_id = ? AND platform = ? AND month = ?`,
      [cutterIdV, platform, prevMonth]
    );
    const prevViews = prevRes.rows.length ? num((prevRes.rows[0] as unknown[])[0]) : null;

    const risk = scoreAuditRisk({
      platform, total_views: totalViews,
      total_clips:   typeof d.total_clips === 'number' ? d.total_clips : (num(ex[3]) ?? 0),
      total_likes:   totalLikes, total_comments: totalComments, total_shares: totalShares,
      top_countries: topCountries as { code: string; name: string; pct: number }[],
      data_source:   dataSource, has_proof_files: hasFiles, prev_month_views: prevViews,
    });

    const submittedAt = totalViews > 0 ? now : null;

    await dbQuery(
      `UPDATE monthly_audits
       SET total_views        = ?,
           total_clips        = COALESCE(?, total_clips),
           total_likes        = ?,
           total_comments     = ?,
           total_shares       = ?,
           avg_watch_time_sec = COALESCE(?, avg_watch_time_sec),
           followers_start    = COALESCE(?, followers_start),
           followers_end      = COALESCE(?, followers_end),
           top_countries      = ?,
           top_cities         = COALESCE(?, top_cities),
           data_source        = ?,
           cutter_notes       = COALESCE(?, cutter_notes),
           fraud_risk_score   = ?,
           geo_risk           = ?,
           engagement_risk    = ?,
           spike_risk         = ?,
           data_quality_risk  = ?,
           risk_flags         = ?,
           audit_status       = CASE WHEN audit_status = 'pending' AND ? IS NOT NULL THEN 'under_review'
                                     ELSE audit_status END,
           submitted_at       = COALESCE(submitted_at, ?),
           updated_at         = ?
       WHERE id = ?`,
      [
        totalViews,
        typeof d.total_clips === 'number' ? d.total_clips : null,
        totalLikes ?? null, totalComments ?? null, totalShares ?? null,
        typeof d.avg_watch_time_sec === 'number' ? d.avg_watch_time_sec : null,
        typeof d.followers_start === 'number' ? d.followers_start : null,
        typeof d.followers_end   === 'number' ? d.followers_end   : null,
        JSON.stringify(topCountries),
        Array.isArray(d.top_cities) ? JSON.stringify(d.top_cities) : null,
        dataSource,
        typeof d.cutter_notes === 'string' ? d.cutter_notes : null,
        risk.score, risk.geo, risk.engagement, risk.spike, risk.data_quality,
        JSON.stringify(risk.flags),
        submittedAt, submittedAt, now, id,
      ]
    );

    return NextResponse.json({ success: true, fraud_risk_score: risk.score, flags: risk.flags });
  }

  return NextResponse.json({ error: 'Kein gültiger Body (action oder data erwartet).' }, { status: 400 });
}
