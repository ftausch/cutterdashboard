/**
 * GET /api/ops/billing/eligible — eligible clips for a cutter in a billing period
 *
 * Eligibility rules:
 *   1. verified_views > COALESCE(views_at_last_invoice, 0)
 *   2. is_flagged = 0
 *   3. billing_status NOT IN ('included_in_batch', 'invoiced')
 *
 * verified_views:
 *   proof_approved → COALESCE(observed_views, current_views)
 *   verification 'verified' → current_views
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args: args.map(a =>
        a === null                   ? { type: 'null' } :
        typeof a === 'number' && !Number.isInteger(a) ? { type: 'real', value: String(a) } :
        typeof a === 'number'        ? { type: 'integer', value: String(a) } :
        { type: 'text', value: String(a) }
      )}}, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

async function dbAlter(sql: string) {
  try { await dbQuery(sql); } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('already has a column')) throw e;
  }
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  // Ensure billing columns exist on cutter_videos
  await Promise.all([
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_status TEXT`),
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_batch_id TEXT`),
  ]);

  const sp           = request.nextUrl.searchParams;
  const cutter_id    = sp.get('cutter_id');
  const period_start = sp.get('period_start');
  const period_end   = sp.get('period_end');

  if (!cutter_id) {
    return NextResponse.json({ error: 'cutter_id ist erforderlich.' }, { status: 400 });
  }

  // Build optional date range filter on published_at / created_at
  const extraArgs: unknown[] = [];
  let dateClause = '';
  if (period_start && period_end) {
    dateClause = `AND COALESCE(v.published_at, v.created_at) BETWEEN ? AND ?`;
    extraArgs.push(period_start, period_end);
  } else if (period_start) {
    dateClause = `AND COALESCE(v.published_at, v.created_at) >= ?`;
    extraArgs.push(period_start);
  } else if (period_end) {
    dateClause = `AND COALESCE(v.published_at, v.created_at) <= ?`;
    extraArgs.push(period_end);
  }

  // SQLite HAVING lets us filter on the computed verified_views alias
  const result = await dbQuery(
    `SELECT
       v.id,
       v.platform,
       v.url,
       v.title,
       v.verification_status,
       v.proof_status,
       COALESCE(v.current_views, 0)                              AS current_views,
       CASE
         WHEN v.proof_status = 'proof_approved'
           THEN COALESCE(v.observed_views, v.current_views, 0)
         WHEN v.verification_status = 'verified'
           THEN COALESCE(v.current_views, 0)
         ELSE 0
       END                                                        AS verified_views,
       COALESCE(v.views_at_last_invoice, 0)                      AS billed_baseline,
       COALESCE(v.published_at, v.created_at)                    AS clip_date,
       v.created_at
     FROM cutter_videos v
     WHERE v.cutter_id = ?
       AND v.is_flagged = 0
       AND (v.billing_status IS NULL OR v.billing_status NOT IN ('included_in_batch', 'invoiced'))
       ${dateClause}
     HAVING verified_views > billed_baseline
     ORDER BY v.platform ASC, clip_date DESC`,
    [cutter_id, ...extraArgs]
  );

  const rows = result.rows as unknown[][];
  const clips = rows.map(r => {
    const verifiedViews  = num(r[7]) ?? 0;
    const billedBaseline = num(r[8]) ?? 0;
    return {
      id:                  val(r[0]),
      platform:            val(r[1]),
      url:                 val(r[2]),
      title:               val(r[3]),
      verification_status: val(r[4]),
      proof_status:        val(r[5]),
      current_views:       num(r[6]) ?? 0,
      verified_views:      verifiedViews,
      billed_baseline:     billedBaseline,
      billable_views:      verifiedViews - billedBaseline,
      clip_date:           val(r[9]),
      created_at:          val(r[10]),
    };
  });

  const total_billable_views = clips.reduce((s, c) => s + c.billable_views, 0);

  return NextResponse.json({
    clips,
    total_clips: clips.length,
    total_billable_views,
    cutter_id,
    period_start: period_start ?? null,
    period_end:   period_end   ?? null,
  });
}
