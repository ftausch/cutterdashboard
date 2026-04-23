/**
 * GET   /api/ops/insights/:id  — admin detail view (any cutter)
 * PATCH /api/ops/insights/:id  — admin review action
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { getSignedUrl } from '@/lib/storage';
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
            a === null            ? { type: 'null' } :
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

  const [reportRes, proofsRes] = await Promise.all([
    dbQuery(
      `SELECT r.id, r.cutter_id, c.name AS cutter_name, c.email AS cutter_email,
              r.platform, r.month, r.status,
              r.total_views, r.total_clips, r.total_likes, r.total_comments, r.total_shares,
              r.avg_watch_time_sec, r.followers_start, r.followers_end,
              r.top_countries, r.top_cities, r.cutter_note,
              r.admin_review_note, r.reviewed_by_id, r.reviewed_by_name, r.reviewed_at,
              r.submitted_at, r.created_at, r.updated_at
       FROM monthly_insight_reports r
       JOIN cutters c ON c.id = r.cutter_id
       WHERE r.id = ?`,
      [id]
    ),
    dbQuery(
      `SELECT id, storage_path, file_name, file_size, mime_type, description, uploaded_at
       FROM monthly_insight_proofs WHERE report_id = ? ORDER BY uploaded_at ASC`,
      [id]
    ),
  ]);

  if (!reportRes.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }

  const r = reportRes.rows[0] as unknown[];
  const report = {
    id:                val(r[0]),
    cutter_id:         val(r[1]),
    cutter_name:       val(r[2]),
    cutter_email:      val(r[3]),
    platform:          val(r[4]),
    month:             val(r[5]),
    status:            val(r[6]) ?? 'draft',
    total_views:       num(r[7]),
    total_clips:       num(r[8]),
    total_likes:       num(r[9]),
    total_comments:    num(r[10]),
    total_shares:      num(r[11]),
    avg_watch_time_sec: num(r[12]),
    followers_start:   num(r[13]),
    followers_end:     num(r[14]),
    top_countries:     JSON.parse(val(r[15]) ?? '[]'),
    top_cities:        JSON.parse(val(r[16]) ?? '[]'),
    cutter_note:       val(r[17]),
    admin_review_note: val(r[18]),
    reviewed_by_id:    val(r[19]),
    reviewed_by_name:  val(r[20]),
    reviewed_at:       val(r[21]),
    submitted_at:      val(r[22]),
    created_at:        val(r[23]),
    updated_at:        val(r[24]),
  };

  const proofs = await Promise.all(
    (proofsRes.rows as unknown[][]).map(async f => {
      const path = val(f[1]);
      let signed_url: string | null = null;
      if (path) { try { signed_url = await getSignedUrl(path); } catch { signed_url = null; } }
      return {
        id: val(f[0]), signed_url,
        file_name: val(f[2]), file_size: num(f[3]),
        mime_type: val(f[4]), description: val(f[5]), uploaded_at: val(f[6]),
      };
    })
  );

  return NextResponse.json({ report, proofs });
}

// ── PATCH ─────────────────────────────────────────────────────────────────
// Actions: approve | reject | request_reupload | start_review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body   = await request.json() as { action: string; note?: string };
  const now    = new Date().toISOString();

  const ACTION_STATUS: Record<string, string> = {
    approve:          'approved',
    reject:           'rejected',
    request_reupload: 'reupload_requested',
    start_review:     'under_review',
  };

  const newStatus = ACTION_STATUS[body.action];
  if (!newStatus) {
    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 });
  }

  const existing = await dbQuery(
    `SELECT id FROM monthly_insight_reports WHERE id = ?`, [id]
  );
  if (!existing.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }

  // Write audit log
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, 'monthly_insight_report', ?, ?, ?)`,
    [
      randomUUID(), auth.id, auth.name,
      `insight.${body.action}`, id,
      JSON.stringify({ note: body.note ?? null }),
      now,
    ]
  ).catch(() => { /* audit_log may not exist yet — non-blocking */ });

  await dbQuery(
    `UPDATE monthly_insight_reports
     SET status            = ?,
         reviewed_by_id    = ?,
         reviewed_by_name  = ?,
         reviewed_at       = ?,
         admin_review_note = COALESCE(?, admin_review_note),
         updated_at        = ?
     WHERE id = ?`,
    [newStatus, auth.id, auth.name, now, body.note ?? null, now, id]
  );

  return NextResponse.json({ success: true, status: newStatus });
}
